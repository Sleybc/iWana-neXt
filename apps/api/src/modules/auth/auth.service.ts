import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import * as qrcode from 'qrcode';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { PlatformUser, RefreshToken, User } from '@iwana/db';
import { UserRole, UserStatus, AuditAction } from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { MailerService } from '../mailer/mailer.service';
import { emailVerificationTemplate } from '../mailer/templates/email-verification.template';
import { forgotPasswordTemplate } from '../mailer/templates/forgot-password.template';
import { passwordResetConfirmTemplate } from '../mailer/templates/password-reset-confirm.template';
import {
  ChangePasswordDto,
  EmailVerifyDto,
  ForgotPasswordDto,
  LoginDto,
  MfaDisableDto,
  MfaVerifyDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from './auth.constants';
import { AuthResponse, MfaSetupResponse } from './interfaces/auth-response.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
} from '../../common/crypto/aes-gcm.util';

/** Duracion del lockout por intentos fallidos: 15 minutos en segundos */
const LOCKOUT_DURATION_SECONDS = 15 * 60;

/** Intentos fallidos maximos antes de lockout */
const MAX_FAILED_ATTEMPTS = 5;

/** TTL del access token en segundos (15 minutos) */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** TTL del refresh token en segundos (7 dias) */
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Duracion del token de reset de contrasena (1 hora en ms) */
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Duracion de las credenciales temporales del ADMIN inicial (24 horas) */
const TEMPORARY_PASSWORD_TTL_SECONDS = 24 * 60 * 60;

/** Login bootstrap fijo del ADMIN inicial sembrado por el worker */

/** Variable de entorno compartida entre worker y API para el password inicial fijo */

/**
 * Servicio de autenticacion de iWana neXt.
 *
 * Responsabilidades:
 * - Login con bcrypt compare, bloqueo por intentos y MFA TOTP
 * - Emision de JWT RS256 con access token (15 min) y refresh token rotation (7 dias)
 * - Deteccion de reuse attack: si se rota un token ya usado, se revoca la familia completa
 * - Logout via JTI blacklist en Redis (TTL = tiempo restante del access token)
 * - MFA: setup (secret + QR), verify (activa), disable (requiere password + codigo)
 * - Recuperacion y cambio de contrasena
 *
 * MULTI-TENANT: Opera en el schema del tenant via TenantContext / runInTenantSchema.
 * El tenantId y schemaName llegan del TenantMiddleware (inyectado en AsyncLocalStorage).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/auth)
 */
@Injectable()
export class AuthService {
  /** Instancia TOTP con plugins de crypto y base32 para MFA (otplib@13 API) */
  private readonly totp = new TOTP({
    crypto: new NobleCryptoPlugin(),
    base32: new ScureBase32Plugin(),
  });

  /**
   * Clave AES-256-GCM activa (escrituras). Previous solo para descifrado en rotación (SEC-02).
   */
  private readonly mfaEncryptionKey: Buffer;
  private readonly mfaEncryptionKeyPrevious: Buffer | null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly auditService: AuditService,
    // Los usuarios de plataforma no tienen schema de tenant: `AuditService.log()`
    // descarta en silencio toda entrada sin contexto, asi que sus eventos deben
    // ir por el sink publico o no se registran.
    private readonly platformAuditService: PlatformAuditService,
    private readonly mailerService: MailerService,
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.mfaEncryptionKey = keys.activeKey;
    this.mfaEncryptionKeyPrevious = keys.previousKey;
  }

  // ---------------------------------------------------------------------------
  // LOGIN DE PLATAFORMA
  // ---------------------------------------------------------------------------

  /**
   * Autentica un usuario de plataforma contra public.platform_users.
   *
   * Emite un access token RS256 de tipo `platform` para operar endpoints de
   * administracion transversal, especialmente el alta del primer tenant.
   */
  async loginPlatform(
    dto: LoginDto,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<AuthResponse> {
    const emailHash = hashEmail(dto.email);

    const user = await this.platformUserRepository.findOne({
      where: { emailHash },
      withDeleted: false,
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('La cuenta de plataforma esta suspendida.');
    }

    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    // Contrasena primero, MFA despues (PROMPT-MOD01 §3.3).
    //
    // La credencial de arranque es conocida por diseno. Vincular un segundo
    // factor a una cuenta cuya primera credencial es publica ampliaria la
    // ventana en vez de cerrarla: quien conozca la credencial podria registrar
    // SU authenticator. Por eso el cambio de contrasena va antes que cualquier
    // paso de MFA, y el token que se entrega aqui no abre la consola.
    if (user.passwordResetRequired) {
      const { accessToken } = this.signPlatformAccessToken(user, 'password-change');

      return { accessToken, passwordResetRequired: true };
    }

    if (user.mfaEnabled) {
      if (!dto.totpCode) {
        return {
          accessToken: '',
          mfaRequired: true,
        };
      }

      if (!user.mfaSecret) {
        throw new UnauthorizedException('La cuenta requiere completar el setup de MFA.');
      }

      const mfaValid = await this.verifyTotp(this.decryptSecret(user.mfaSecret), dto.totpCode);
      if (!mfaValid) {
        throw new UnauthorizedException('Codigo MFA invalido.');
      }
    }

    await this.platformUserRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    const { accessToken } = this.signPlatformAccessToken(user);

    return { accessToken };
  }

  // ---------------------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------------------

  /**
   * Autentica un usuario con email + password.
   *
   * Flujo:
   * 1. Buscar usuario por emailHash (HMAC-SHA-256 del email en minusculas + trim)
   * 2. Verificar estado: ACTIVE o PENDING_VERIFICATION
   * 3. Verificar lockout (lockedUntil > now)
   * 4. Comparar password con bcrypt
   * 5. Si MFA habilitado y no se envio totpCode → retornar mfaRequired=true
   * 6. Si MFA habilitado y se envio totpCode → verificar TOTP
   * 7. Reset de intentos fallidos y actualizacion de lastLoginAt
   * 8. Emision de access token + refresh token
   *
   * RF-AUTH-01 a RF-AUTH-04 (HLD Seccion 4)
   */
  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponse & { refreshToken: string }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const emailHash = hashEmail(dto.email);

      // Buscar usuario por hash para evitar busqueda por PII en texto plano
      const user = await qr.manager.findOne(User, {
        where: { emailHash },
        withDeleted: false,
      });

      if (!user) {
        // Respuesta deliberadamente generica para no revelar si el email existe
        throw new UnauthorizedException('Credenciales invalidas.');
      }

      // Verificar que la cuenta este activa
      if (user.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException('La cuenta esta suspendida. Contactar soporte.');
      }

      if (user.status === UserStatus.INACTIVE) {
        throw new UnauthorizedException('Credenciales invalidas.');
      }

      // Verificar lockout por intentos fallidos
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMs = user.lockedUntil.getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new UnauthorizedException(
          `Cuenta bloqueada temporalmente. Intenta en ${remainingMin} minuto(s).`,
        );
      }

      // Verificar contrasena con bcrypt
      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

      if (!passwordValid) {
        await this.registerFailedAttempt(qr.manager, user);
        // Registrar intento fallido en audit trail (seguridad OWASP)
        void this.auditService.log({
          action: AuditAction.LOGIN_FAILED,
          entityType: 'User',
          entityId: user.id,
          userId: user.id,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        });
        throw new UnauthorizedException('Credenciales invalidas.');
      }

      if (this.hasExpiredTemporaryPassword(user)) {
        throw new UnauthorizedException(
          'Las credenciales temporales expiraron. Solicita una regeneracion al administrador de plataforma.',
        );
      }

      // Verificar MFA si esta habilitado
      if (user.mfaEnabled) {
        if (!dto.totpCode) {
          // Cliente debe reenviar con totpCode incluido
          return {
            accessToken: '',
            mfaRequired: true,
            refreshToken: '',
          };
        }

        // Descifrar el secret antes de verificar — está almacenado cifrado con AES-256-GCM
        const mfaValid = await this.verifyTotp(this.decryptSecret(user.mfaSecret!), dto.totpCode);
        if (!mfaValid) {
          throw new UnauthorizedException('Codigo MFA invalido.');
        }
      }

      // Enforcement MFA por rol critico: si el rol requiere MFA pero no esta configurado,
      // emitir token de alcance limitado (scope='mfa-setup') en lugar de tokens completos.
      // RF-AUTH-04, RF-MFA-04 (HLD-MOD02 §3.2 — DA-MOD02-01)
      if (user.mfaRequired && !user.mfaEnabled) {
        const { accessToken } = this.signAccessToken(user, 'mfa-setup');
        return {
          accessToken,
          mfaSetupRequired: true,
          refreshToken: '',
        };
      }

      // Reset de intentos y actualizacion de lastLoginAt
      await qr.manager.update(User, user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      });

      // Emitir tokens
      const { accessToken, jti } = this.signAccessToken(user);
      const rawRefreshToken = await this.createRefreshToken(
        qr.manager,
        user.id,
        ipAddress,
        userAgent,
      );

      // Registrar login exitoso en audit trail
      void this.auditService.log({
        action: AuditAction.LOGIN,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      return { accessToken, refreshToken: rawRefreshToken };
    });
  }

  // ---------------------------------------------------------------------------
  // REFRESH TOKEN ROTATION
  // ---------------------------------------------------------------------------

  /**
   * Rota el refresh token: invalida el actual y emite uno nuevo.
   *
   * Deteccion de reuse attack:
   * Si el token a rotar ya fue usado (revokedAt != null), se revoca
   * la familia completa para invalidar todas las sesiones activas del usuario.
   *
   * RF-AUTH-05, RF-AUTH-06 (HLD Seccion 4)
   */
  async refreshTokens(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tokenHash = this.hashToken(rawRefreshToken);

      const existing = await qr.manager.findOne(RefreshToken, {
        where: { tokenHash },
      });

      if (!existing) {
        throw new UnauthorizedException('Refresh token invalido.');
      }

      // Detectar reuse attack: token ya revocado
      if (existing.revokedAt !== null) {
        // Revocar toda la familia de tokens de la sesion comprometida
        await qr.manager.update(
          RefreshToken,
          { familyId: existing.familyId, revokedAt: undefined },
          { revokedAt: new Date(), revokeReason: 'REUSE_ATTACK' },
        );
        throw new UnauthorizedException(
          'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
        );
      }

      // Verificar expiracion
      if (existing.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token expirado.');
      }

      // Buscar el usuario para emitir nuevo access token
      const user = await qr.manager.findOne(User, { where: { id: existing.userId } });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Usuario no disponible.');
      }

      // Revocar el token actual (rotacion)
      await qr.manager.update(RefreshToken, existing.id, {
        revokedAt: new Date(),
        revokeReason: 'ROTATION',
      });

      // Emitir nuevo access token y nuevo refresh token
      const { accessToken } = this.signAccessToken(user);
      const newRawRefreshToken = await this.createRefreshToken(
        qr.manager,
        user.id,
        ipAddress,
        userAgent,
        existing.familyId, // Mantener la familia de sesion
      );

      // Registrar rotacion de sesion en audit trail — RF-AUD-02 (HLD-MOD02 §4.2)
      void this.auditService.log({
        action: AuditAction.REFRESH,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      return { accessToken, refreshToken: newRawRefreshToken };
    });
  }

  // ---------------------------------------------------------------------------
  // LOGOUT
  // ---------------------------------------------------------------------------

  /**
   * Cierra sesion del usuario:
   * - Agrega el JTI del access token a la blacklist de Redis (TTL = tiempo restante).
   * - Revoca el refresh token actual.
   *
   * RF-AUTH-05 (JTI blacklist), logout explícito
   */
  async logout(jwtPayload: JwtPayload, rawRefreshToken?: string): Promise<void> {
    // En logout no siempre existe TenantContext (ej. tokens de plataforma).
    // Priorizamos claims firmados del JWT y usamos el contexto solo como fallback.
    const schemaName = jwtPayload.schemaName ?? TenantContext.get()?.schemaName ?? null;

    // Calcular TTL restante del access token para la blacklist
    const expiresAt = jwtPayload.exp ?? 0;
    const remainingTtl = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

    if (remainingTtl > 0) {
      // Guardar JTI en blacklist con TTL exacto del token
      await this.redis.set(`jti:blacklist:${jwtPayload.jti}`, '1', 'EX', remainingTtl);
    }

    // Revocar refresh token si fue enviado
    if (rawRefreshToken && schemaName) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        await qr.manager.update(
          RefreshToken,
          { tokenHash },
          { revokedAt: new Date(), revokeReason: 'LOGOUT' },
        );
      });
    }

    // Registrar logout en audit trail con datos del JWT (no depende de TenantContext)
    void this.auditService.log({
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: jwtPayload.sub,
      userId: jwtPayload.sub,
      // Usar datos del JWT directamente para no depender del TenantContext en logout
      ...(jwtPayload.tenantId ? { tenantId: jwtPayload.tenantId } : {}),
      ...(jwtPayload.schemaName ? { schemaName: jwtPayload.schemaName } : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // MFA TOTP
  // ---------------------------------------------------------------------------

  /**
   * Inicia el setup de MFA: genera un secret TOTP y retorna QR code + URI.
   * El secret se guarda TEMPORALMENTE en Redis hasta que el usuario confirme
   * con verify. NO se guarda en DB hasta la confirmacion.
   *
   * RF-AUTH-03
   */
  async setupMfa(userId: string, email: string): Promise<MfaSetupResponse> {
    // Idempotencia: si ya existe un setup pendiente reusar el mismo secret.
    // Previene race condition cuando el cliente llama dos veces en rapida sucesion
    // (p.ej. React Strict Mode doble-invocacion de useEffect en desarrollo).
    // Si se reutiliza el secret, el QR generado sera identico al anterior.
    let secret = await this.redis.get(`mfa:pending:${userId}`);

    if (!secret) {
      secret = this.totp.generateSecret();
    }
    // Renovar TTL siempre (nuevo o reutilizado): 30 min desde la última llamada a setup.
    // Esto da tiempo suficiente para que el usuario escanee el QR y complete la verificación.
    await this.redis.set(`mfa:pending:${userId}`, secret, 'EX', 1800);

    const issuer = this.configService.get<string>('APP_NAME', 'iWana neXt');
    const otpauthUri = this.totp.toURI({ secret, label: email, issuer });

    const qrCodeBase64 = await qrcode.toDataURL(otpauthUri);

    return { qrCodeBase64, otpauthUri };
  }

  /**
   * Activa el MFA del usuario verificando el codigo TOTP.
   * Lee el secret pendiente de Redis, lo verifica y lo persiste en DB.
   *
   * RF-AUTH-03
   */
  async verifyMfaSetup(userId: string, dto: MfaVerifyDto): Promise<{ mfaEnabled: boolean }> {
    const { schemaName } = TenantContext.getOrThrow();

    const pendingSecret = await this.redis.get(`mfa:pending:${userId}`);
    if (!pendingSecret) {
      throw new UnauthorizedException('No hay configuracion MFA pendiente. Reinicia el setup.');
    }

    // Verificar el codigo TOTP con la API async de otplib@13
    const verifyResult = await this.totp.verify(dto.totpCode, {
      secret: pendingSecret,
      epochTolerance: 30,
    });
    const isValid = verifyResult.valid;
    if (!isValid) {
      throw new UnauthorizedException('Codigo MFA invalido.');
    }

    // Activar MFA en la DB del tenant
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(User, userId, {
        mfaEnabled: true,
        mfaSecret: this.encryptSecret(pendingSecret), // Cifrado AES-256-GCM antes de persistir
      });
    });

    // Limpiar el secret pendiente de Redis
    await this.redis.del(`mfa:pending:${userId}`);

    // Registrar activacion de MFA en audit trail
    void this.auditService.log({
      action: AuditAction.MFA_ENABLED,
      entityType: 'User',
      entityId: userId,
      userId,
    });

    return { mfaEnabled: true };
  }

  /**
   * Desactiva el MFA del usuario.
   * Requiere contrasena actual + codigo TOTP para confirmar la operacion.
   *
   * RF-AUTH-03
   */
  async disableMfa(userId: string, dto: MfaDisableDto): Promise<{ mfaEnabled: boolean }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id: userId } });
      if (!user) throw new NotFoundException('Usuario no encontrado.');
      if (!user.mfaEnabled) throw new ConflictException('MFA no esta activo en esta cuenta.');

      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) throw new UnauthorizedException('Contrasena incorrecta.');

      // Descifrar el secret almacenado antes de verificar el codigo TOTP
      const totpValid = await this.verifyTotp(this.decryptSecret(user.mfaSecret!), dto.totpCode);
      if (!totpValid) throw new UnauthorizedException('Codigo MFA invalido.');

      await qr.manager.update(User, userId, { mfaEnabled: false, mfaSecret: null });

      // Registrar desactivacion de MFA en audit trail
      void this.auditService.log({
        action: AuditAction.MFA_DISABLED,
        entityType: 'User',
        entityId: userId,
        userId,
      });

      return { mfaEnabled: false };
    });
  }

  // ---------------------------------------------------------------------------
  // RECUPERACION DE CONTRASENA
  // ---------------------------------------------------------------------------

  /**
   * Inicia el flujo de recuperacion de contrasena.
   * SIEMPRE retorna sin error para no revelar si el email existe (OWASP).
   * Si el email existe, genera un token de reset y lo almacena en DB.
   *
   * RF-AUTH-07
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    const emailHash = hashEmail(dto.email);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { emailHash } });
      if (!user) return; // No revelar si el email existe

      const token = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

      // SEC-03: TTL del token forgot-password es independiente de la credencial temporal.
      // Se persiste solo el hash SHA-256, en paridad con el refresh token: el valor
      // en claro existe unicamente en memoria y en el enlace enviado por correo.
      await qr.manager.update(User, user.id, {
        passwordResetToken: this.hashToken(token),
        passwordResetTokenExpiresAt: tokenExpiresAt,
      });

      // Registrar solicitud de reset de contrasena en audit trail
      void this.auditService.log({
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
      });

      // Construir el enlace de reset usando la URL del frontend configurada
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
      const template = forgotPasswordTemplate({
        resetLink: `${frontendUrl}/auth/reset-password?token=${token}`,
        // Calcular minutos desde la constante de TTL para evitar valores hardcodeados desincronizados
        expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MS / (60 * 1000),
      });

      // Descifrar el email para el envio — solo en memoria, nunca se persiste ni loguea
      const plainEmail = dto.email.toLowerCase().trim();

      // Enviar correo de recuperacion (fire-and-forget — no bloquea la respuesta al cliente)
      void this.mailerService.sendMail({ to: plainEmail, ...template });
    });
  }

  /**
   * Restablece la contrasena con el token de reset.
   * Invalida todos los refresh tokens activos del usuario al completar.
   *
   * RF-AUTH-08
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // El token viaja en claro en el enlace; en BD solo existe su hash.
      const user = await qr.manager.findOne(User, {
        where: { passwordResetToken: this.hashToken(dto.token) },
      });

      if (!user || !user.passwordResetTokenExpiresAt) {
        throw new UnauthorizedException('Token de reset invalido o expirado.');
      }

      if (user.passwordResetTokenExpiresAt < new Date()) {
        throw new UnauthorizedException('Token de reset expirado.');
      }

      const newHash = await bcrypt.hash(dto.newPassword, 12);

      await qr.manager.update(User, user.id, {
        passwordHash: newHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        passwordResetRequired: false,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      // Revocar todos los refresh tokens activos del usuario
      await qr.manager.update(
        RefreshToken,
        { userId: user.id, revokedAt: undefined },
        { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGE' },
      );

      // Registrar reset completado en audit trail — RF-AUD-02 (HLD-MOD02 §4.2)
      void this.auditService.log({
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
      });
    });

    // Enviar correo de confirmacion si el cliente incluyo el email en el DTO
    // El email no se almacena en DB (solo el hash SHA-256 no reversible)
    if (dto.email) {
      const plainEmail = dto.email.toLowerCase().trim();
      const template = passwordResetConfirmTemplate();
      // Fire-and-forget — no bloquea la respuesta al cliente
      void this.mailerService.sendMail({ to: plainEmail, ...template });
    }
  }

  /**
   * Cambia la contrasena de un usuario autenticado.
   * Verifica la contrasena actual antes de aplicar el cambio.
   * Invalida todos los refresh tokens al completar.
   *
   * RF-AUTH-09
   */
  async changePassword(actor: JwtPayload, dto: ChangePasswordDto): Promise<void> {
    // Los usuarios de plataforma no viven en un schema de tenant: resolverlos por
    // TenantContext daria un 500 generico en vez de cambiar la contrasena.
    if (actor.type === 'platform') {
      await this.changePlatformPassword(actor, dto);
      return;
    }

    const userId = actor.sub;
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id: userId } });
      if (!user) throw new NotFoundException('Usuario no encontrado.');

      const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!passwordValid) {
        throw new UnauthorizedException(
          'La contraseña actual no coincide con la que usas para iniciar sesión.',
        );
      }

      const newHash = await bcrypt.hash(dto.newPassword, 12);

      await qr.manager.update(User, userId, {
        passwordHash: newHash,
        passwordResetRequired: false,
      });

      // Revocar todos los refresh tokens activos del usuario
      await qr.manager.update(
        RefreshToken,
        { userId, revokedAt: undefined },
        { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGE' },
      );

      // Registrar cambio de contrasena en audit trail
      void this.auditService.log({
        action: AuditAction.PASSWORD_CHANGED,
        entityType: 'User',
        entityId: userId,
        userId,
      });
    });
  }

  /**
   * Cambia la contrasena de un usuario de plataforma autenticado.
   *
   * Es la salida del primer ingreso: al completarse, `passwordResetRequired`
   * queda en false y el token de alcance limitado que trajo al usuario hasta
   * aqui deja de servir. El siguiente login entrega ya una sesion completa.
   *
   * Sobre la invalidacion: el login de plataforma no emite refresh token, asi
   * que el unico credencial vivo es el access token en curso. Se anota su JTI en
   * la blacklist para que el token de alcance 'password-change' no sobreviva al
   * cambio que lo justificaba.
   *
   * NUNCA se auditan los valores: el evento PASSWORD_CHANGED se registra sin
   * `oldValue` ni `newValue` que contengan la credencial. Las migraciones 074
   * (tenant) y 012 (publica) existen porque eso se incumplio una vez.
   */
  private async changePlatformPassword(actor: JwtPayload, dto: ChangePasswordDto): Promise<void> {
    const user = await this.platformUserRepository.findOne({
      where: { id: actor.sub },
      withDeleted: false,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException(
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      );
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);

    // Hash y marca en la misma sentencia: no puede quedar la contrasena nueva
    // aplicada con la cuenta todavia marcada como pendiente, ni al reves.
    await this.platformUserRepository.update(user.id, {
      passwordHash: newHash,
      passwordResetRequired: false,
    });

    // VENTANA CONOCIDA Y ACEPTADA — [SEC-REVIEW] S-M01-06.
    //
    // El apagado de la marca vive en Postgres y la revocacion del token en Redis:
    // son dos sistemas y no hay transaccion que los abarque. Si el proceso muere
    // entre la sentencia de arriba y este `set`, queda la contrasena ya cambiada,
    // la cuenta ya desmarcada, y el access token de alcance 'password-change'
    // todavia valido hasta que expire por su cuenta (15 min como maximo).
    //
    // Se acepta, y conviene decir por que en vez de dejarlo implicito:
    //
    // - Ese token solo alcanza POST /auth/change-password (LIMITED_SCOPES). No
    //   abre la consola ni ninguna otra ruta.
    // - Para usarlo hay que presentar ademas `currentPassword`, que a esas alturas
    //   ya es la contrasena NUEVA — la que solo conoce quien acaba de fijarla. Con
    //   la credencial de arranque, la conocida, el token no sirve para nada.
    // - Expira solo. El peor caso es una reemision del mismo cambio por parte de
    //   su propio dueno.
    //
    // Cerrarla del todo exigiria una transaccion distribuida entre Postgres y
    // Redis (outbox, 2PC o compensacion), maquinaria con modos de fallo propios
    // —y mas probables— que el escenario que evitaria. Si algun dia este token
    // ampliara su alcance, la ecuacion cambia y esta decision hay que rehacerla.
    const expiresAt = actor.exp ?? 0;
    const remainingTtl = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

    if (remainingTtl > 0) {
      await this.redis.set(`jti:blacklist:${actor.jti}`, '1', 'EX', remainingTtl);
    }

    // Sink publico, no `auditService`: una cuenta de plataforma no tiene
    // TenantContext, y `AuditService.log()` retorna sin escribir cuando no lo
    // encuentra. La llamada parecia auditar y no auditaba.
    void this.platformAuditService.log({
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'PlatformUser',
      entityId: user.id,
      userId: user.id,
    });
  }

  // ---------------------------------------------------------------------------
  // VERIFICACION DE EMAIL
  // ---------------------------------------------------------------------------

  /**
   * Verifica el email del usuario usando el token enviado durante el registro.
   *
   * Si el token es valido, marca el usuario como verificado y activa la cuenta
   * si estaba en estado PENDING_VERIFICATION.
   *
   * @throws UnauthorizedException si el token no existe o ya fue usado.
   */
  async verifyEmail(dto: EmailVerifyDto, schemaName: string): Promise<void> {
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // El token de verificacion se almacena en texto plano (igual que passwordResetToken)
      const user = await qr.manager.findOne(User, {
        where: { emailVerificationToken: dto.token },
      });

      if (!user) {
        throw new UnauthorizedException('Token de verificacion invalido o expirado.');
      }

      // Marcar como verificado y limpiar el token
      user.emailVerified = true;
      user.emailVerificationToken = null;

      // Activar la cuenta si estaba pendiente de verificacion
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        user.status = UserStatus.ACTIVE;
      }

      await qr.manager.save(User, user);

      // Registrar verificacion de email en audit trail — RF-AUD-02 (HLD-MOD02 §4.2)
      void this.auditService.log({
        action: AuditAction.EMAIL_VERIFIED,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        newValue: { emailVerified: true },
      });
    });
  }

  /**
   * Reenvía el correo de verificacion de email al usuario.
   *
   * OWASP: SIEMPRE retorna void sin revelar si el email existe o si ya esta verificado.
   * Genera un nuevo token de verificacion y lo envia por correo si el usuario existe
   * y aun no ha verificado su email.
   */
  async resendVerificationEmail(dto: ResendVerificationDto, schemaName: string): Promise<void> {
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Buscar por hash del email (nunca por email plano — PII protegida)
      const emailHash = hashEmail(dto.email);
      const user = await qr.manager.findOne(User, {
        where: { emailHash, emailVerified: false },
      });

      // Silencio intencional — no revelar si el email existe o ya esta verificado
      if (!user) {
        return;
      }

      // Generar nuevo token de verificacion de 32 bytes (64 chars hex)
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = rawToken;
      await qr.manager.save(User, user);

      // Descifrar el email para el envio — solo en memoria, nunca se persiste ni loguea
      const plainEmail = dto.email.toLowerCase().trim();
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3001');
      const template = emailVerificationTemplate({
        verifyLink: `${frontendUrl}/auth/verify-email?token=${rawToken}`,
      });

      // Enviar correo de verificacion (fire-and-forget — no bloquea la respuesta al cliente)
      void this.mailerService.sendMail({ to: plainEmail, ...template });
    });
  }

  /**
   * Regenera las credenciales temporales del ADMIN inicial de un tenant.
   *
   * Este flujo existe para soporte operativo de plataforma cuando el tenant ya fue
   * provisionado pero el ADMIN inicial no completo el primer ingreso dentro de la
   * ventana de 24 horas o necesita un nuevo bootstrap controlado.
   *
   * La operacion es idempotente por `Idempotency-Key`: si el cliente reintenta con
   * la misma llave, Redis retorna exactamente la misma respuesta sin volver a
   * mutar el usuario ni generar otra credencial.
   */
  async regenerateTenantAdminCredentials(input: {
    tenantId: string;
    schemaName: string;
    idempotencyKey: string;
  }): Promise<{
    message: string;
    adminEmail: string;
    temporaryPassword: string;
    expiresAt: string;
  }> {
    // El registro de idempotencia NO guarda la contraseña.
    //
    // Antes se cacheaba la respuesta completa 24h, de modo que la credencial
    // quedaba en claro en Redis y cualquiera que repitiese el `Idempotency-Key`
    // la recuperaba. Lo que la idempotencia debe garantizar es que un reintento
    // no rote una segunda vez —dejando dos contraseñas y ambigüedad sobre cuál
    // quedó aplicada—, no volver a servir el secreto.
    //
    // Un reintento recibe ahora 409 con el contexto necesario: la credencial ya
    // se emitió y solo se mostró una vez. Si se perdió, se regenera con una
    // clave de idempotencia nueva.
    const cacheKey = `tenant-admin-credentials:${input.tenantId}:${input.idempotencyKey}`;
    const alreadyIssued = await this.redis.get(cacheKey);

    if (alreadyIssued) {
      const record = JSON.parse(alreadyIssued) as { adminEmail: string; expiresAt: string };

      throw new ConflictException(
        `Ya se emitieron credenciales para ${record.adminEmail} con esta clave de idempotencia ` +
          `(vigentes hasta ${record.expiresAt}). La contraseña solo se muestra una vez y no se ` +
          `conserva. Si se perdió, regenere con una clave de idempotencia nueva.`,
      );
    }

    return runInTenantSchema(this.dataSource, input.schemaName, async (qr) => {
      const adminUser = await qr.manager.findOne(User, {
        where: { role: UserRole.ADMIN },
        order: { createdAt: 'ASC' },
        withDeleted: false,
      });

      if (!adminUser) {
        throw new NotFoundException(
          'No existe el ADMIN inicial del tenant para regenerar credenciales.',
        );
      }

      const temporaryPassword = this.generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const expiresAt = this.buildTemporaryPasswordExpiry();

      await qr.manager.update(User, adminUser.id, {
        passwordHash,
        passwordResetRequired: true,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        passwordResetExpiresAt: expiresAt,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      const response = {
        message: 'Credenciales temporales regeneradas para el ADMIN inicial del tenant.',
        adminEmail: this.decodeStoredValue(adminUser.email),
        temporaryPassword,
        expiresAt: expiresAt.toISOString(),
      };

      // Solo el rastro no secreto: basta para detectar el reintento y explicarlo.
      await this.redis.set(
        cacheKey,
        JSON.stringify({ adminEmail: response.adminEmail, expiresAt: response.expiresAt }),
        'EX',
        TEMPORARY_PASSWORD_TTL_SECONDS,
      );

      return response;
    });
  }

  // ---------------------------------------------------------------------------
  // HELPERS PRIVADOS
  // ---------------------------------------------------------------------------

  /**
   * Firma un access token JWT RS256 con los claims del usuario.
   * Incluye JTI unico para soporte de blacklist de tokens revocados.
   *
   * @param user - Entidad User del tenant
   * @param scope - Si es 'mfa-setup', emite un token de alcance limitado que solo
   *   permite acceder a /auth/mfa/setup y /auth/mfa/verify. Usar cuando un rol
   *   critico (ADMIN, NOC, ACCOUNTANT) no tiene MFA configurado.
   */
  private signAccessToken(user: User, scope?: 'mfa-setup'): { accessToken: string; jti: string } {
    const jti = crypto.randomUUID();
    const tenantContext = TenantContext.getOrThrow();
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.emailHash, // Nunca el email plano
      role: user.role,
      tenantId: user.tenantId,
      schemaName: tenantContext.schemaName,
      jti,
      type: 'tenant',
      // Indica al frontend si el usuario debe cambiar su contrasena en el primer ingreso
      passwordResetRequired: user.passwordResetRequired ?? false,
      // Scope limitado para flujo de MFA setup — ausente en tokens completos
      ...(scope ? { scope } : {}),
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s`,
      algorithm: 'RS256',
      // Audiencia de tenant: un token emitido aqui no verifica como token de plataforma.
      issuer: JWT_CLAIMS_BY_TOKEN_TYPE.tenant.issuer,
      audience: JWT_CLAIMS_BY_TOKEN_TYPE.tenant.audience,
    });

    return { accessToken, jti };
  }

  /**
   * Firma un access token para un usuario de plataforma.
   *
   * @param scope - Si es 'password-change', emite un token de alcance limitado que
   *   solo permite acceder a /auth/change-password. Se usa cuando la cuenta sigue
   *   con la credencial de arranque: el token no debe abrir la consola.
   */
  private signPlatformAccessToken(
    user: PlatformUser,
    scope?: 'password-change',
  ): { accessToken: string; jti: string } {
    const jti = crypto.randomUUID();
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.emailHash,
      role: user.role,
      tenantId: null,
      schemaName: null,
      jti,
      type: 'platform',
      // Indica al frontend si la cuenta debe cambiar la contrasena antes de operar
      passwordResetRequired: user.passwordResetRequired ?? false,
      // Scope limitado para el cambio obligatorio — ausente en tokens completos
      ...(scope ? { scope } : {}),
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s`,
      algorithm: 'RS256',
      // Audiencia de plataforma: solo estos tokens verifican en la consola de plataforma.
      issuer: JWT_CLAIMS_BY_TOKEN_TYPE.platform.issuer,
      audience: JWT_CLAIMS_BY_TOKEN_TYPE.platform.audience,
    });

    return { accessToken, jti };
  }

  /**
   * Firma un access token para un usuario de plataforma recien creado.
   * Usado por el flujo bootstrap para evitar una llamada adicional a platformLogin.
   */
  signPlatformToken(user: PlatformUser): string {
    return this.signPlatformAccessToken(user).accessToken;
  }

  /**
   * Crea un nuevo refresh token, lo guarda hasheado en DB y retorna el valor raw.
   * El valor raw solo existe en memoria y en la cookie httpOnly — nunca en logs ni DB.
   */
  private async createRefreshToken(
    manager: import('typeorm').EntityManager,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    familyId?: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const sessionFamilyId = familyId ?? crypto.randomUUID();

    const refreshToken = manager.create(RefreshToken, {
      userId,
      tokenHash,
      familyId: sessionFamilyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      revokedAt: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    await manager.save(RefreshToken, refreshToken);

    return rawToken;
  }

  /**
   * Registra un intento fallido de login.
   * Activa el lockout despues de MAX_FAILED_ATTEMPTS intentos consecutivos.
   * Emite audit ACCOUNT_LOCKED cuando se alcanza el limite — RF-AUD-02 (HLD-MOD02 §4.2).
   */
  private async registerFailedAttempt(
    manager: import('typeorm').EntityManager,
    user: User,
  ): Promise<void> {
    const newAttempts = (user.failedLoginAttempts ?? 0) + 1;
    const updates: Partial<User> = { failedLoginAttempts: newAttempts };

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_SECONDS * 1000);
      // Emitir evento de bloqueo de cuenta en audit trail
      void this.auditService.log({
        action: AuditAction.ACCOUNT_LOCKED,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        newValue: { lockedUntil: updates.lockedUntil, failedLoginAttempts: newAttempts },
      });
    }

    await manager.update(User, user.id, updates);
  }

  /**
   * Genera hash SHA-256 de un token arbitrario.
   * Los refresh tokens NUNCA se almacenan en texto plano.
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Determina si el usuario esta usando una credencial temporal ya vencida.
   * Solo aplica cuando el flujo de bootstrap exige `passwordResetRequired=true`.
   */
  private hasExpiredTemporaryPassword(user: User): boolean {
    return Boolean(
      user.passwordResetRequired &&
      user.passwordResetExpiresAt &&
      user.passwordResetExpiresAt < new Date(),
    );
  }

  /** Construye la expiracion de 24 horas para credenciales temporales. */
  private buildTemporaryPasswordExpiry(): Date {
    return new Date(Date.now() + TEMPORARY_PASSWORD_TTL_SECONDS * 1000);
  }

  /**
   * Genera una contrasena temporal fuerte y corta para onboarding operativo.
   *
   * 16 bytes, alineado con `TEMP_PASSWORD_BYTES` de `users.service.ts`. Antes
   * eran 8: el ADMIN inicial del tenant —la cuenta de mayor privilegio de la
   * empresa— recibia la mitad de entropia que cualquier usuario normal, sin
   * razon que lo justificara.
   *
   * El prefijo literal se conserva a proposito: no reduce el espacio de
   * busqueda, y hace la credencial localizable en un barrido defensivo — que es
   * como se encontro la fuga del audit. Corta en ambos sentidos y la decision
   * queda declarada, no heredada.
   */
  private generateTemporaryPassword(): string {
    return `IwN!a9-${crypto.randomBytes(16).toString('hex')}`;
  }

  private decodeStoredValue(value: string): string {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return value;
    }

    try {
      return this.decryptSecret(value);
    } catch {
      return value;
    }
  }

  /** Cifra un secreto MFA con la clave activa (AES-256-GCM, iv:tag:ciphertext). */
  private encryptSecret(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.mfaEncryptionKey);
  }

  /**
   * Descifra un secreto MFA. Intenta clave activa; si falla auth tag y hay PREVIOUS, reintenta.
   */
  private decryptSecret(encrypted: string): string {
    if (encrypted.split(':').length !== 3) {
      throw new Error('Formato de mfaSecret cifrado invalido. Se esperaba iv:authTag:ciphertext.');
    }
    return decryptAes256Gcm(encrypted, this.mfaEncryptionKey, this.mfaEncryptionKeyPrevious);
  }

  /**   * Verifica un codigo TOTP contra el secret del usuario.
   * Usa epochTolerance de 30s para tolerar pequenos desfases de reloj.
   * API otplib@13: verify(token, options) es async y retorna { valid, delta }.
   */
  private async verifyTotp(secret: string, token: string): Promise<boolean> {
    const result = await this.totp.verify(token, { secret, epochTolerance: 30 });
    return result.valid;
  }
}
