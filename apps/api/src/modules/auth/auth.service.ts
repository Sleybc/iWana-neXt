import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
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
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { PlatformUser, RefreshToken, User } from '@iwana/db';
import { UserRole, UserStatus, AuditAction } from '@iwana/shared';
import { runInTenantSchema, summarizeErrorForLog, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import {
  PLATFORM_USER_ENTITY_TYPE,
  UNKNOWN_PLATFORM_USER_ENTITY_ID,
} from '../audit/audit.constants';
import { PlatformAuditService } from '../audit/platform-audit.service';
import type { AuditRequestContext } from '../audit/interfaces/audit-request-context.interface';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';
import { isAccountLocked, remainingLockoutMinutes } from '../../common/account-lockout.policy';
import { MailerService } from '../mailer/mailer.service';
import { emailVerificationTemplate } from '../mailer/templates/email-verification.template';
import { forgotPasswordTemplate } from '../mailer/templates/forgot-password.template';
import { hashOpaqueToken } from '../../common/crypto/hash-opaque-token.util';
import { passwordResetConfirmTemplate } from '../mailer/templates/password-reset-confirm.template';
import {
  ChangePasswordDto,
  EmailVerifyDto,
  ForgotPasswordDto,
  LoginDto,
  MfaDisableDto,
  MfaVerifyDto,
  PlatformSelfMfaSetupResultDto,
  PlatformSelfMfaVerifyDto,
  ResendVerificationDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from './auth.constants';
import { AUTH_ERROR_CODES, unauthorizedWithCode } from './auth-errors';
import { resolveAccessTokenTtlSeconds, resolveRefreshTokenTtlSeconds } from './token-ttl.constants';
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

/** Duracion del token de reset de contrasena (1 hora en ms) */
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Duracion de las credenciales temporales del ADMIN inicial (24 horas) */
const TEMPORARY_PASSWORD_TTL_SECONDS = 24 * 60 * 60;
const PLATFORM_SELF_MFA_TTL_MS = 5 * 60 * 1000;

interface PlatformSelfMfaChallenge {
  purpose: 'platform-self-mfa';
  subject: string;
  session: string;
  credential: string;
  expiresAt: number;
  secret: string;
}

/**
 * Motivos cerrados de fallo de login de plataforma que se persisten en el trail.
 * Codigos estables, sin PII ni detalle de la credencial presentada.
 */
type PlatformLoginFailureReason =
  | 'USUARIO_NO_ENCONTRADO'
  | 'CUENTA_SUSPENDIDA'
  | 'CUENTA_INACTIVA'
  | 'CONTRASENA_INVALIDA'
  | 'MFA_SIN_SECRETO'
  | 'MFA_INVALIDO';

/** Login bootstrap fijo del ADMIN inicial sembrado por el worker */

/** Variable de entorno compartida entre worker y API para el password inicial fijo */

/**
 * Resultado de `login` dentro de su transacción (D1 — spec de transacciones §3).
 *
 * La transacción solo devuelve el desenlace; la excepción de credenciales
 * inválidas se lanza fuera, después del commit. Lanzarla dentro revertía
 * el incremento del contador. Los checks sin escritura (usuario inexistente,
 * bloqueado, MFA pendiente, etc.) siguen lanzando dentro sin efecto porque
 * no hay nada que revertir en esos caminos.
 */
type LoginTxOutcome =
  | { kind: 'success'; response: AuthResponse & { refreshToken: string } }
  | {
      kind: 'failed-password' | 'failed-mfa';
      userId: string;
      failedLoginAttempts: number;
      lockedUntil: Date | null;
    };

/** Fallo de `disableMfa` dentro de su transacción. */
type DisableMfaFailedOutcome = ChangePasswordFailedOutcome & {
  kind: 'failed-password' | 'failed-mfa';
};

/** Resultado de `changePassword` dentro de su transacción (mismo arreglo que login). */
interface ChangePasswordFailedOutcome {
  userId: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Fila devuelta por el incremento atómico con `UPDATE ... RETURNING`. */
interface FailedAttemptRow {
  failed_login_attempts: number;
  locked_until: Date | string | null;
}

/** Revoca el refresh solo si nadie lo cambió desde que se leyó. */
const ROTATE_PLATFORM_REFRESH_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

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
  private readonly platformSelfMfaKey: Buffer;
  private readonly piiHashKey: Buffer;

  /**
   * TTL efectivo del access token en segundos (JWT_ACCESS_EXPIRATION, default 15 min).
   * Resuelto en el constructor: la configuracion validada no cambia en caliente.
   */
  private readonly accessTokenTtlSeconds: number;

  /** TTL efectivo del refresh token en segundos (JWT_REFRESH_EXPIRATION, default 7 dias). */
  private readonly refreshTokenTtlSeconds: number;

  /**
   * Reason codes de sesion para diagnostico post-mortem. Nunca incluyen tokens,
   * hashes completos, correos ni IPs — solo codigos estables y, cuando aplica,
   * el prefijo de 8 caracteres del familyId de la sesion.
   */
  private readonly logger = new Logger(AuthService.name);

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
    // Los usuarios de plataforma no tienen schema de tenant, asi que sus eventos
    // van por el sink publico. Desde S-8 `AuditService.log()` ya no los descarta
    // —reencamina toda entrada sin destino a `public.platform_audit_logs` con el
    // prefijo `ANOMALIA_AUDITORIA:`—, pero esa via es una red, no un destino: la
    // fila queda marcada como anomalia y con el entityType deformado. Un evento
    // de plataforma se emite aqui, no alli.
    private readonly platformAuditService: PlatformAuditService,
    private readonly mailerService: MailerService,
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.mfaEncryptionKey = keys.activeKey;
    this.mfaEncryptionKeyPrevious = keys.previousKey;
    this.platformSelfMfaKey = crypto
      .createHmac('sha256', keys.activeKey)
      .update('iwana:platform-self-mfa:v1')
      .digest();
    this.piiHashKey = resolvePiiHashKey(this.configService);
    this.accessTokenTtlSeconds = resolveAccessTokenTtlSeconds(this.configService);
    this.refreshTokenTtlSeconds = resolveRefreshTokenTtlSeconds(this.configService);
  }

  // ---------------------------------------------------------------------------
  // LOGIN DE PLATAFORMA
  // ---------------------------------------------------------------------------

  /**
   * Autentica un usuario de plataforma contra public.platform_users.
   *
   * Emite un access token RS256 de tipo `platform` para operar endpoints de
   * administracion transversal, especialmente el alta del primer tenant.
   *
   * AUDITORIA (S-8): cada intento —exitoso o fallido— deja fila en
   * `public.platform_audit_logs` via {@link PlatformAuditService}. La ruta es
   * `@Public()`, asi que `AuditInterceptor` no la cubre y el registro tiene que
   * ser explicito. Antes no habia ninguno: un intento fallido contra las cuentas
   * mas privilegiadas del sistema no dejaba rastro.
   *
   * El metodo tiene **dos** salidas exitosas y cada una emite su `LOGIN`:
   * la del primer ingreso (`passwordResetRequired`), que retorna antes del
   * bloque MFA, y la ordinaria al cierre. Se distinguen por `newValue`. Al
   * añadir una tercera salida hay que emitirlo tambien: no hay nada que lo
   * obligue estructuralmente, solo `auth.service.spec.ts`.
   *
   * El reto MFA pendiente no es una salida exitosa —ni exito ni fallo— y por
   * eso no audita.
   *
   * Nunca se registran la contrasena, el codigo TOTP, el token emitido ni el
   * correo: `motivo` es un codigo cerrado y `entityId` es el UUID de la cuenta,
   * o `USUARIO_DESCONOCIDO` cuando el correo no corresponde a ninguna.
   */
  async loginPlatform(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponse & { refreshToken?: string }> {
    const emailHash = hashEmail(dto.email, this.piiHashKey);

    const user = await this.platformUserRepository.findOne({
      where: { emailHash },
      withDeleted: false,
    });

    if (!user) {
      await this.logPlatformLoginFailed(null, 'USUARIO_NO_ENCONTRADO', ipAddress, userAgent);
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.logPlatformLoginFailed(user.id, 'CUENTA_SUSPENDIDA', ipAddress, userAgent);
      throw new ForbiddenException('La cuenta de plataforma esta suspendida.');
    }

    if (user.status === UserStatus.INACTIVE) {
      await this.logPlatformLoginFailed(user.id, 'CUENTA_INACTIVA', ipAddress, userAgent);
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      await this.logPlatformLoginFailed(user.id, 'CONTRASENA_INVALIDA', ipAddress, userAgent);
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

      // El LOGIN se emite AQUI, no en el cierre del metodo: este `return`
      // sale del metodo antes de llegar a aquel. La autenticacion ya esta
      // consumada —la contrasena se verifico arriba y se entrega un token—,
      // asi que es un login y debe dejar fila.
      //
      // NO MOVER ni suprimir este registro. Es el unico ingreso que usa una
      // credencial conocida por todo el que despliega; si algo tiene que
      // quedar trazado, es este. El defecto no es hipotetico: al fusionar
      // MOD01 con la auditoria de S-8, git combino ambos lados sin marcar
      // conflicto y dejo este camino sin auditar — el `return` se inserto
      // por encima del `log()` y nada lo senalo.
      await this.platformAuditService.log({
        action: AuditAction.LOGIN,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: user.id,
        userId: user.id,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        // Distingue este ingreso del normal: sin segundo factor por diseno y
        // con el token acotado a `password-change`. Sin contrasena, sin token
        // y sin correo — la cuenta va por UUID, como en el resto del trail.
        newValue: { mfaAplicado: false, passwordResetRequired: true },
      });

      return { accessToken, passwordResetRequired: true };
    }

    // MFA es obligatorio en plataforma: sin él solo se entrega el alcance de inscripción.
    if (user.status === UserStatus.PENDING_VERIFICATION || !user.mfaEnabled) {
      const { accessToken } = this.signPlatformAccessToken(user, 'platform-mfa-setup');
      await this.platformAuditService.log({
        action: AuditAction.LOGIN,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: user.id,
        userId: user.id,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newValue: { mfaSetupRequired: true },
      });
      return { accessToken, mfaSetupRequired: true };
    }

    if (!dto.totpCode) {
      // Reto MFA pendiente: ni exito ni fallo todavia, no se audita como intento.
      return {
        accessToken: '',
        mfaRequired: true,
      };
    }

    if (!user.mfaSecret) {
      await this.logPlatformLoginFailed(user.id, 'MFA_SIN_SECRETO', ipAddress, userAgent);
      throw new UnauthorizedException('La cuenta requiere completar el setup de MFA.');
    }

    const mfaValid = await this.verifyTotp(this.decryptSecret(user.mfaSecret), dto.totpCode);
    if (!mfaValid) {
      await this.logPlatformLoginFailed(user.id, 'MFA_INVALIDO', ipAddress, userAgent);
      throw new UnauthorizedException('Codigo MFA invalido.');
    }

    await this.platformUserRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    const { accessToken } = this.signPlatformAccessToken(user);
    const refreshToken = await this.createPlatformRefreshToken(user, ipAddress, userAgent);

    await this.platformAuditService.log({
      action: AuditAction.LOGIN,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: user.id,
      userId: user.id,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      newValue: { mfaAplicado: user.mfaEnabled },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Registra un intento fallido de login de plataforma.
   *
   * Se `await`ea a proposito: la respuesta 401/403 sale despues de que la fila
   * este escrita. Un fire-and-forget dejaba la ventana en la que el proceso
   * responde y muere sin haber persistido el intento — justo el escenario que
   * hace falta trazar.
   *
   * `userId` null y `entityId = USUARIO_DESCONOCIDO` cuando el correo no
   * corresponde a ninguna cuenta: no se persiste el correo tecleado (PII).
   */
  private async logPlatformLoginFailed(
    userId: string | null,
    motivo: PlatformLoginFailureReason,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.platformAuditService.log({
      action: AuditAction.LOGIN_FAILED,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: userId ?? UNKNOWN_PLATFORM_USER_ENTITY_ID,
      userId,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      newValue: { motivo },
    });
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

    const outcome = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr): Promise<LoginTxOutcome> => {
        const emailHash = hashEmail(dto.email, this.piiHashKey);

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
          throw unauthorizedWithCode(
            AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            `Cuenta bloqueada temporalmente. Intenta en ${remainingMin} minuto(s).`,
          );
        }

        // Verificar contrasena con bcrypt
        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

        if (!passwordValid) {
          // D1: el incremento se confirma con la transacción y la excepción
          // se lanza fuera, después del commit. Si se lanzara aquí, el
          // rollback borraría el contador y el bloqueo nunca se activaría.
          const registered = await this.registerFailedAttempt(qr.manager, user.id);
          return {
            kind: 'failed-password',
            userId: user.id,
            failedLoginAttempts: registered.failedLoginAttempts,
            lockedUntil: registered.lockedUntil,
          };
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
              kind: 'success',
              response: {
                accessToken: '',
                mfaRequired: true,
                refreshToken: '',
              },
            };
          }

          // Descifrar el secret antes de verificar — está almacenado cifrado con AES-256-GCM
          const mfaValid = await this.verifyTotp(this.decryptSecret(user.mfaSecret!), dto.totpCode);
          if (!mfaValid) {
            // Mismo criterio que la contraseña: el intento se confirma y se lanza tras el commit.
            const registered = await this.registerFailedAttempt(qr.manager, user.id);
            return {
              kind: 'failed-mfa',
              userId: user.id,
              failedLoginAttempts: registered.failedLoginAttempts,
              lockedUntil: registered.lockedUntil,
            };
          }
        }

        // Un restablecimiento simultáneo (que bloquea primero esta fila) no puede dejar viva la
        // sesión que se está emitiendo: se bloquea y se comprueba que la credencial sigue vigente.
        const locked = await qr.manager.findOne(User, {
          where: { id: user.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !locked ||
          locked.passwordHash !== user.passwordHash ||
          locked.status !== user.status ||
          locked.passwordResetRequired !== user.passwordResetRequired ||
          locked.mfaEnabled !== user.mfaEnabled ||
          locked.mfaRequired !== user.mfaRequired ||
          locked.mfaSecret !== user.mfaSecret ||
          (locked.lockedUntil && locked.lockedUntil > new Date())
        ) {
          throw new UnauthorizedException('Credenciales invalidas.');
        }

        // ADR-117 D1: la contraseña temporal solo sirve para cambiarla, antes de configurar MFA.
        if (user.passwordResetRequired) {
          const { accessToken } = this.signAccessToken(user, 'password-change');
          void this.auditService.log({
            action: AuditAction.LOGIN,
            entityType: 'User',
            entityId: user.id,
            userId: user.id,
            newValue: { alcance: 'CAMBIO_OBLIGATORIO' },
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
          });
          return {
            kind: 'success',
            response: { accessToken, passwordResetRequired: true, refreshToken: '' },
          };
        }

        // Enforcement MFA por rol critico: si el rol requiere MFA pero no esta configurado,
        // emitir token de alcance limitado (scope='mfa-setup') en lugar de tokens completos.
        // RF-AUTH-04, RF-MFA-04 (HLD-MOD02 §3.2 — DA-MOD02-01)
        if (user.mfaRequired && !user.mfaEnabled) {
          const { accessToken } = this.signAccessToken(user, 'mfa-setup');
          return {
            kind: 'success',
            response: {
              accessToken,
              mfaSetupRequired: true,
              refreshToken: '',
            },
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

        return {
          kind: 'success',
          response: { accessToken, refreshToken: rawRefreshToken },
        };
      },
    );

    if (outcome.kind !== 'success') {
      // Después del commit: la auditoría de un intento fallido debe sobrevivir
      // al fallo (spec §6 D4 — no va en `logWithin` dentro de la transacción).
      // `auditService.log` nunca lanza, así que no enmascara el 401.
      await this.auditService.log({
        action: AuditAction.LOGIN_FAILED,
        entityType: 'User',
        entityId: outcome.userId,
        userId: outcome.userId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      if (outcome.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        await this.auditService.log({
          action: AuditAction.ACCOUNT_LOCKED,
          entityType: 'User',
          entityId: outcome.userId,
          userId: outcome.userId,
          newValue: {
            lockedUntil: outcome.lockedUntil,
            failedLoginAttempts: outcome.failedLoginAttempts,
          },
        });
      }

      if (outcome.kind === 'failed-mfa') {
        throw unauthorizedWithCode(AUTH_ERROR_CODES.MFA_CODE_INVALID, 'Codigo MFA invalido.');
      }
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    return outcome.response;
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

    const tokens = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tokenHash = this.hashToken(rawRefreshToken);

      const existing = await qr.manager.findOne(RefreshToken, {
        where: { tokenHash },
      });

      if (!existing) {
        this.logger.warn('REFRESH_INVALID — refresh de tenant no encontrado.');
        throw new UnauthorizedException('Refresh token invalido.');
      }

      // Detectar reuse attack: token ya revocado
      if (existing.revokedAt !== null) {
        // Bloqueo antes de revocar: una rotación simultánea no deja vivo a su sucesor.
        await qr.manager.findOne(User, {
          where: { id: existing.userId },
          lock: { mode: 'pessimistic_write' },
        });
        // Revocar toda la familia de tokens de la sesion comprometida
        await qr.manager.update(
          RefreshToken,
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokeReason: 'REUSE_ATTACK' },
        );
        // Solo el prefijo del familyId: diagnosticable sin exponer el identificador completo.
        this.logger.warn(
          `REFRESH_REUSE_DETECTED — familia ${existing.familyId.slice(0, 8)} revocada (tenant).`,
        );
        // La excepción se lanza tras el commit: dentro, el rollback desharía la revocación.
        return null;
      }

      // Verificar expiracion
      if (existing.expiresAt < new Date()) {
        this.logger.warn('REFRESH_EXPIRED — refresh de tenant vencido.');
        throw new UnauthorizedException('Refresh token expirado.');
      }

      // Buscar el usuario para emitir nuevo access token
      // Fila bloqueada: un restablecimiento simultáneo espera y revoca también al sucesor, o ya
      // terminó y la revocación condicional de abajo no afecta filas (ADR-117 D5).
      const user = await qr.manager.findOne(User, {
        where: { id: existing.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.status !== UserStatus.ACTIVE || user.passwordResetRequired) {
        this.logger.warn('REFRESH_USER_UNAVAILABLE — usuario de tenant ausente o inactivo.');
        throw new UnauthorizedException('Usuario no disponible.');
      }

      // Revocar el token actual (rotacion)
      const rotated = await qr.manager.update(
        RefreshToken,
        { id: existing.id, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason: 'ROTATION' },
      );
      if (rotated.affected !== 1) {
        this.logger.warn('REFRESH_RACE_LOST — el refresh de tenant se revocó en paralelo.');
        throw new UnauthorizedException('Refresh token invalido.');
      }

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

    if (!tokens) {
      throw new UnauthorizedException(
        'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
      );
    }
    return tokens;
  }

  // ---------------------------------------------------------------------------
  // REFRESH TOKEN DE PLATAFORMA (C-6, ADR-081)
  //
  // La consola de plataforma no tiene schema de tenant, asi que su refresh
  // token no puede vivir en `<tenant>.refresh_tokens` (tabla inexistente en
  // public). Se persiste en Redis con las mismas garantias que el flujo de
  // tenant: SHA-256 del token, familia de sesion, rotacion y deteccion de
  // reuse attack. Sin cambios de schema de base de datos (restriccion del
  // encargo OLA1-b) y reutilizando el cliente Redis ya inyectado.
  // ---------------------------------------------------------------------------

  /** Clave Redis del registro de un refresh token de plataforma. */
  private platformRefreshKey(tokenHash: string): string {
    return `platform:refresh:token:${tokenHash}`;
  }

  /** Clave Redis del indice de familia (todos los hashes de una sesion). */
  private platformRefreshFamilyKey(familyId: string): string {
    return `platform:refresh:family:${familyId}`;
  }

  /** Marca de familia revocada: alcanza al sucesor creado mientras se borraba la familia. */
  private platformRefreshFamilyRevokedKey(familyId: string): string {
    return `platform:refresh:family-revoked:${familyId}`;
  }

  /** Cambia con la contraseña; liga cada token a la credencial que lo originó. */
  private credentialVersion(passwordHash: string): string {
    return crypto.createHash('sha256').update(passwordHash).digest('hex');
  }

  /** Liga la sesión al segundo factor. Sobre el secreto descifrado: recifrar no la invalida. */
  private mfaVersion(user: Pick<PlatformUser, 'mfaSecret'>): string | null {
    try {
      return user.mfaSecret ? this.hashToken(this.decryptSecret(user.mfaSecret)) : null;
    } catch {
      // Secreto indescifrable: no coincide con ninguna sesión.
      return null;
    }
  }

  /**
   * Crea y persiste un refresh token de plataforma. Devuelve el valor raw:
   * solo existe en memoria y en la cookie httpOnly, nunca en logs ni Redis.
   */
  private async createPlatformRefreshToken(
    user: Pick<PlatformUser, 'id' | 'passwordHash' | 'mfaSecret'>,
    ipAddress?: string,
    userAgent?: string,
    familyId?: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const sessionFamilyId = familyId ?? crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlSeconds * 1000).toISOString();

    await this.redis.set(
      this.platformRefreshKey(tokenHash),
      JSON.stringify({
        userId: user.id,
        familyId: sessionFamilyId,
        credentialVersion: this.credentialVersion(user.passwordHash),
        mfaVersion: this.mfaVersion(user),
        expiresAt,
        revokedAt: null,
      }),
      'EX',
      this.refreshTokenTtlSeconds,
    );

    await this.redis.sadd(this.platformRefreshFamilyKey(sessionFamilyId), tokenHash);
    await this.redis.expire(
      this.platformRefreshFamilyKey(sessionFamilyId),
      this.refreshTokenTtlSeconds,
    );

    return rawToken;
  }

  /**
   * Rota el refresh token de plataforma (C-6). Mismas reglas que el flujo de
   * tenant: reuse attack revoca la familia completa, rotacion revoca el actual.
   */
  async refreshPlatformTokens(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const recordRaw = await this.redis.get(this.platformRefreshKey(tokenHash));

    if (!recordRaw) {
      this.logger.warn('PLATFORM_REFRESH_INVALID — refresh de plataforma no encontrado.');
      throw new UnauthorizedException('Refresh token invalido.');
    }

    const record = JSON.parse(recordRaw) as {
      userId: string;
      familyId: string;
      credentialVersion?: string;
      mfaVersion?: string | null;
      expiresAt: string;
      revokedAt: string | null;
    };

    if (record.revokedAt) {
      await this.revokePlatformRefreshFamily(record.familyId);
      // Solo el prefijo del familyId: diagnosticable sin exponer el identificador completo.
      this.logger.warn(
        `PLATFORM_REFRESH_REUSE_DETECTED — familia ${record.familyId.slice(0, 8)} revocada.`,
      );
      throw new UnauthorizedException(
        'Sesion invalida detectada. Se cerraron todas las sesiones activas.',
      );
    }

    if (new Date(record.expiresAt) < new Date()) {
      this.logger.warn('PLATFORM_REFRESH_EXPIRED — refresh de plataforma vencido.');
      throw new UnauthorizedException('Refresh token expirado.');
    }

    if (await this.redis.exists(this.platformRefreshFamilyRevokedKey(record.familyId))) {
      this.logger.warn('PLATFORM_REFRESH_FAMILY_REVOKED — la familia ya fue revocada.');
      throw new UnauthorizedException('Refresh token invalido.');
    }

    const user = await this.platformUserRepository.findOne({
      where: { id: record.userId },
      withDeleted: false,
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.revokePlatformRefreshFamily(record.familyId);
      this.logger.warn(
        'PLATFORM_REFRESH_USER_UNAVAILABLE — usuario de plataforma ausente o inactivo.',
      );
      throw new UnauthorizedException('Usuario no disponible.');
    }

    if (
      user.passwordResetRequired ||
      record.credentialVersion !== this.credentialVersion(user.passwordHash) ||
      !user.mfaEnabled ||
      !record.mfaVersion ||
      record.mfaVersion !== this.mfaVersion(user)
    ) {
      await this.revokePlatformRefreshFamily(record.familyId);
      this.logger.warn('PLATFORM_REFRESH_CREDENTIAL_CHANGED — la credencial ya no es vigente.');
      throw new UnauthorizedException('Refresh token invalido.');
    }

    // Rotacion: revocar el token presentado y emitir uno nuevo de la misma familia
    const rotated = await this.redis.eval(
      ROTATE_PLATFORM_REFRESH_SCRIPT,
      1,
      this.platformRefreshKey(tokenHash),
      recordRaw,
      JSON.stringify({ ...record, revokedAt: new Date().toISOString() }),
      String(this.refreshTokenTtlSeconds),
    );
    if (Number(rotated) !== 1) {
      this.logger.warn('PLATFORM_REFRESH_RACE_LOST — el refresh cambió durante la rotación.');
      throw new UnauthorizedException('Refresh token invalido.');
    }

    const newRawRefreshToken = await this.createPlatformRefreshToken(
      user,
      ipAddress,
      userAgent,
      record.familyId,
    );
    // Un logout o reuso durante la rotación no debe terminar entregando tokens.
    if (await this.redis.exists(this.platformRefreshFamilyRevokedKey(record.familyId))) {
      this.logger.warn('PLATFORM_REFRESH_FAMILY_REVOKED — revocada durante la rotación.');
      throw new UnauthorizedException('Refresh token invalido.');
    }
    const { accessToken } = this.signPlatformAccessToken(user);

    void this.platformAuditService.log({
      action: AuditAction.REFRESH,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: user.id,
      userId: user.id,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return { accessToken, refreshToken: newRawRefreshToken };
  }

  /** Cierra la sesión del refresh presentado, con sus sucesores (logout). */
  private async revokePlatformRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const key = this.platformRefreshKey(tokenHash);
    const recordRaw = await this.redis.get(key);

    if (!recordRaw) {
      return;
    }

    const record = JSON.parse(recordRaw) as { familyId: string };
    await this.revokePlatformRefreshFamily(record.familyId);
  }

  /** Revoca una familia completa de refresh tokens de plataforma. */
  private async revokePlatformRefreshFamily(familyId: string): Promise<void> {
    const familyKey = this.platformRefreshFamilyKey(familyId);
    await this.redis.set(
      this.platformRefreshFamilyRevokedKey(familyId),
      '1',
      'EX',
      this.refreshTokenTtlSeconds * 2,
    );
    const members = await this.redis.smembers(familyKey);

    for (const member of members) {
      await this.redis.del(this.platformRefreshKey(member));
    }

    await this.redis.del(familyKey);
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
  async logout(
    jwtPayload: JwtPayload,
    rawRefreshToken?: string,
    rawPlatformRefreshToken?: string,
  ): Promise<void> {
    // En logout no siempre existe TenantContext (ej. tokens de plataforma).
    // Priorizamos claims firmados del JWT y usamos el contexto solo como fallback.
    const schemaName = jwtPayload.schemaName ?? TenantContext.get()?.schemaName ?? null;

    // Sesion de plataforma (C-6). Antes que el JTI: si Redis falla aquí, el mismo access
    // token aún sirve para reintentar el logout.
    if (rawPlatformRefreshToken) {
      await this.revokePlatformRefreshToken(rawPlatformRefreshToken);
    }

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
  async setupPlatformMfa(actor: JwtPayload): Promise<MfaSetupResponse> {
    const label = await this.platformUserRepository.manager.transaction(async (manager) =>
      this.decodeStoredValue((await this.lockPlatformMfaEnrollment(actor, manager)).email),
    );
    // Un secreto por ingreso: quien vio antes otro QR no conserva el segundo factor.
    const key = this.platformMfaPendingKey(actor);
    const ttl = Math.max(1, (actor.exp ?? 0) - Math.floor(Date.now() / 1000));
    const stored = await this.orUnavailable(async () => {
      const candidate = this.encryptSecret(this.totp.generateSecret());
      await this.redis.set(key, candidate, 'EX', ttl, 'NX');
      return this.redis.get(key);
    });
    if (!stored) throw new ServiceUnavailableException('Vuelve a iniciar sesión.');
    return this.renderMfaSetup(this.decryptSecret(stored), label);
  }

  async verifyPlatformMfa(
    actor: JwtPayload,
    dto: MfaVerifyDto,
    context: AuditRequestContext,
  ): Promise<void> {
    const key = this.platformMfaPendingKey(actor);
    const stored = await this.orUnavailable(() => this.redis.get(key));
    await this.platformUserRepository.manager.transaction(async (manager) => {
      const user = await this.lockPlatformMfaEnrollment(actor, manager);
      if (!stored || !(await this.verifyTotp(this.decryptSecret(stored), dto.totpCode))) {
        throw new UnauthorizedException('Código incorrecto. Revisa tu aplicación autenticadora.');
      }
      await this.activatePlatformMfa(manager, user.id, stored, context);
    });
    // Ya activa, el token no puede inscribir de nuevo: un fallo aquí no revierte la activación.
    try {
      await this.redis.del(key);
      const ttl = (actor.exp ?? 0) - Math.floor(Date.now() / 1000);
      if (ttl > 0) await this.redis.set(`jti:blacklist:${actor.jti}`, '1', 'EX', ttl);
    } catch (err) {
      this.logger.warn(`Limpieza de inscripción MFA: ${summarizeErrorForLog(err)}`);
    }
  }

  private platformMfaPendingKey(actor: JwtPayload): string {
    return `mfa:pending:platform:${actor.sub}:${actor.jti}`;
  }

  /** Redis caído cierra la operación con 503. */
  private async orUnavailable<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      this.logger.error(`Redis no disponible: ${summarizeErrorForLog(err)}`);
      throw new ServiceUnavailableException('Intenta de nuevo en unos minutos.');
    }
  }

  async setupPlatformSelfMfa(
    actor: JwtPayload,
    currentPassword: string,
  ): Promise<PlatformSelfMfaSetupResultDto> {
    this.assertFullPlatformSession(actor);
    const user = await this.platformUserRepository.findOne({ where: { id: actor.sub } });
    this.assertPlatformSelfMfaEligible(user);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('La contraseña actual es incorrecta.');
    }

    const ticket: PlatformSelfMfaChallenge = {
      purpose: 'platform-self-mfa',
      subject: user.id,
      session: actor.jti,
      credential: this.hashToken(user.passwordHash),
      expiresAt: Date.now() + PLATFORM_SELF_MFA_TTL_MS,
      secret: this.totp.generateSecret(),
    };
    return {
      ...(await this.renderMfaSetup(ticket.secret, this.decodeStoredValue(user.email))),
      challenge: encryptAes256Gcm(JSON.stringify(ticket), this.platformSelfMfaKey),
    };
  }

  async verifyPlatformSelfMfa(
    actor: JwtPayload,
    dto: PlatformSelfMfaVerifyDto,
    context: AuditRequestContext,
  ): Promise<void> {
    this.assertFullPlatformSession(actor);
    let ticket: PlatformSelfMfaChallenge;
    try {
      ticket = JSON.parse(
        decryptAes256Gcm(dto.challenge, this.platformSelfMfaKey),
      ) as PlatformSelfMfaChallenge;
    } catch {
      throw new BadRequestException(
        'Vuelve a iniciar la configuración de la verificación en dos pasos.',
      );
    }
    if (
      ticket?.purpose !== 'platform-self-mfa' ||
      ticket.subject !== actor.sub ||
      ticket.session !== actor.jti ||
      ticket.expiresAt <= Date.now()
    ) {
      throw new BadRequestException(
        'Vuelve a iniciar la configuración de la verificación en dos pasos.',
      );
    }

    await this.platformUserRepository.manager.transaction(async (manager) => {
      const user = await manager.findOne(PlatformUser, {
        where: { id: actor.sub },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertPlatformSelfMfaEligible(user);
      if (
        ticket.expiresAt <= Date.now() ||
        ticket.credential !== this.hashToken(user.passwordHash)
      ) {
        throw new BadRequestException(
          'Vuelve a iniciar la configuración de la verificación en dos pasos.',
        );
      }
      if (!(await this.verifyTotp(ticket.secret, dto.totpCode))) {
        throw new UnauthorizedException('Código incorrecto. Revisa tu aplicación autenticadora.');
      }
      await this.activatePlatformMfa(manager, user.id, this.encryptSecret(ticket.secret), context);
    });
  }

  private assertFullPlatformSession(actor: JwtPayload): void {
    if (actor.type !== 'platform' || actor.scope || !actor.jti) {
      throw new ForbiddenException('Inicia sesión con una cuenta de plataforma activa.');
    }
  }

  private assertPlatformSelfMfaEligible(user: PlatformUser | null): asserts user is PlatformUser {
    if (!user || user.status !== UserStatus.ACTIVE || user.passwordResetRequired) {
      throw new ForbiddenException('Inicia sesión con una cuenta de plataforma activa.');
    }
    if (user.mfaEnabled) {
      throw new ConflictException('La verificación en dos pasos ya está activa.');
    }
  }

  private async activatePlatformMfa(
    manager: EntityManager,
    id: string,
    encryptedSecret: string,
    context: AuditRequestContext,
  ): Promise<void> {
    await manager.update(PlatformUser, id, {
      mfaEnabled: true,
      mfaSecret: encryptedSecret,
      status: UserStatus.ACTIVE,
    });
    await this.platformAuditService.logWithin(
      {
        action: AuditAction.MFA_ENABLED,
        entityType: PLATFORM_USER_ENTITY_TYPE,
        entityId: id,
        userId: id,
        ...context,
      },
      manager,
    );
  }

  private async renderMfaSetup(secret: string, label: string): Promise<MfaSetupResponse> {
    const issuer = this.configService.get<string>('APP_NAME', 'iWana neXt');
    const otpauthUri = this.totp.toURI({ secret, label, issuer });
    return { qrCodeBase64: await qrcode.toDataURL(otpauthUri), otpauthUri };
  }

  private async lockPlatformMfaEnrollment(
    actor: JwtPayload,
    manager: EntityManager,
  ): Promise<PlatformUser> {
    if (actor.type !== 'platform' || actor.scope !== 'platform-mfa-setup') {
      throw new ForbiddenException('Inicia sesión con una cuenta pendiente de activación.');
    }
    const user = await manager.findOne(PlatformUser, {
      where: {
        id: actor.sub,
        status: In([UserStatus.PENDING_VERIFICATION, UserStatus.ACTIVE]),
        passwordResetRequired: false,
        mfaEnabled: false,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user || actor.credentialVersion !== this.credentialVersion(user.passwordHash)) {
      throw new ForbiddenException('La cuenta no tiene una activación pendiente.');
    }
    return user;
  }

  async setupMfa(actor: JwtPayload): Promise<MfaSetupResponse> {
    this.assertTenantMfaActor(actor);
    const { schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id: actor.sub } });
      this.assertCanEnrollMfa(user, actor);
    });
    const pendingKey = this.mfaPendingKey(actor);

    // Idempotencia: si ya existe un setup pendiente reusar el mismo secret.
    // Previene race condition cuando el cliente llama dos veces en rapida sucesion
    // (p.ej. React Strict Mode doble-invocacion de useEffect en desarrollo).
    // Si se reutiliza el secret, el QR generado sera identico al anterior.
    let secret = await this.redis.get(pendingKey);

    if (!secret) {
      secret = this.totp.generateSecret();
    }
    // Renovar TTL siempre (nuevo o reutilizado): 30 min desde la última llamada a setup.
    // Esto da tiempo suficiente para que el usuario escanee el QR y complete la verificación.
    await this.redis.set(pendingKey, secret, 'EX', 1800);

    const issuer = this.configService.get<string>('APP_NAME', 'iWana neXt');
    const otpauthUri = this.totp.toURI({ secret, label: actor.email, issuer });

    const qrCodeBase64 = await qrcode.toDataURL(otpauthUri);

    return { qrCodeBase64, otpauthUri };
  }

  /** El secreto pendiente queda ligado a la contraseña: cambiarla lo deja inservible. */
  private mfaPendingKey(actor: JwtPayload): string {
    return `mfa:pending:${actor.sub}:${actor.credentialVersion}`;
  }

  private assertTenantMfaActor(actor: JwtPayload): void {
    if (actor.type !== 'tenant') {
      throw new ForbiddenException('Esta operacion solo aplica a usuarios de empresa.');
    }
  }

  /**
   * Inscribir MFA exige la credencial con la que se emitió el token y no reemplaza un MFA
   * activo: para eso está `disableMfa`, que pide contraseña y código.
   */
  private assertCanEnrollMfa(user: User | null, actor: JwtPayload): asserts user is User {
    if (
      !user ||
      user.passwordResetRequired ||
      actor.credentialVersion !== this.credentialVersion(user.passwordHash)
    ) {
      throw unauthorizedWithCode(
        AUTH_ERROR_CODES.SESSION_NOT_CURRENT,
        'Tu sesión ya no es vigente. Inicia sesión de nuevo.',
      );
    }
    if (user.mfaEnabled) {
      throw new ConflictException('MFA ya está activo en esta cuenta.');
    }
  }

  /**
   * Activa el MFA del usuario verificando el codigo TOTP.
   * Lee el secret pendiente de Redis, lo verifica y lo persiste en DB.
   *
   * RF-AUTH-03
   */
  async verifyMfaSetup(actor: JwtPayload, dto: MfaVerifyDto): Promise<{ mfaEnabled: boolean }> {
    this.assertTenantMfaActor(actor);
    const userId = actor.sub;
    const pendingKey = this.mfaPendingKey(actor);
    const { schemaName } = TenantContext.getOrThrow();

    const pendingSecret = await this.redis.get(pendingKey);
    if (!pendingSecret) {
      throw unauthorizedWithCode(
        AUTH_ERROR_CODES.MFA_SETUP_NOT_PENDING,
        'No hay configuracion MFA pendiente. Reinicia el setup.',
      );
    }

    // Verificar el codigo TOTP con la API async de otplib@13
    const verifyResult = await this.totp.verify(dto.totpCode, {
      secret: pendingSecret,
      epochTolerance: 30,
    });
    const isValid = verifyResult.valid;
    if (!isValid) {
      throw unauthorizedWithCode(AUTH_ERROR_CODES.MFA_CODE_INVALID, 'Codigo MFA invalido.');
    }

    // Activar MFA en la DB del tenant
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertCanEnrollMfa(user, actor);
      await qr.manager.update(User, userId, {
        mfaEnabled: true,
        mfaSecret: this.encryptSecret(pendingSecret), // Cifrado AES-256-GCM antes de persistir
      });
    });

    // Limpiar el secret pendiente de Redis
    await this.redis.del(pendingKey);

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

    // D1 (igual que `login`): el intento fallido se confirma y la excepción se lanza tras el commit.
    const failed = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr): Promise<DisableMfaFailedOutcome | null> => {
        // Bloqueada: los intentos en paralelo se serializan y no eluden el límite.
        const user = await qr.manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Usuario no encontrado.');
        if (!user.mfaEnabled) throw new ConflictException('MFA no esta activo en esta cuenta.');

        if (isAccountLocked(user)) {
          throw unauthorizedWithCode(
            AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            `Cuenta bloqueada temporalmente. Intenta en ${remainingLockoutMinutes(user)} minuto(s).`,
          );
        }

        if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
          const registered = await this.registerFailedAttempt(qr.manager, userId);
          return { kind: 'failed-password', userId, ...registered };
        }

        // Descifrar el secret almacenado antes de verificar el codigo TOTP
        if (!(await this.verifyTotp(this.decryptSecret(user.mfaSecret!), dto.totpCode))) {
          const registered = await this.registerFailedAttempt(qr.manager, userId);
          return { kind: 'failed-mfa', userId, ...registered };
        }

        await qr.manager.update(User, userId, { mfaEnabled: false, mfaSecret: null });
        return null;
      },
    );

    if (failed) {
      await this.auditFailedAttempt(failed);
      if (failed.kind === 'failed-mfa') {
        throw unauthorizedWithCode(AUTH_ERROR_CODES.MFA_CODE_INVALID, 'Codigo MFA invalido.');
      }
      throw new UnauthorizedException('Contrasena incorrecta.');
    }

    // Registrar desactivacion de MFA en audit trail
    void this.auditService.log({
      action: AuditAction.MFA_DISABLED,
      entityType: 'User',
      entityId: userId,
      userId,
    });

    return { mfaEnabled: false };
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

    const emailHash = hashEmail(dto.email, this.piiHashKey);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { emailHash } });
      if (!user) return; // No revelar si el email existe
      // S-2: una cuenta PENDING_VERIFICATION no recibe enlace. El alta manual entra con su
      // contraseña temporal y verifica el correo por su propio flujo; un usuario importado de
      // UISP solo se activa con la invitación del administrador (spec «usuarios» §2.4, U3).
      // Misma respuesta que un correo inexistente: no revela el estado.
      if (user.status === UserStatus.PENDING_VERIFICATION) return;
      // ADR-117 D6: una cuenta activada por contraseña temporal no probó que el buzón sea suyo.
      if (!user.emailVerified) return;

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
      this.fireAndForget(
        this.mailerService.sendMail({ to: plainEmail, ...template }),
        'correo de recuperacion de contrasena',
      );
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
        // Uso único: tras esperar, PostgreSQL reevalúa el token y ya no lo encuentra.
        lock: { mode: 'pessimistic_write' },
      });

      if (!user || !user.passwordResetTokenExpiresAt) {
        throw new UnauthorizedException('Token de reset invalido o expirado.');
      }

      if (user.passwordResetTokenExpiresAt < new Date()) {
        throw new UnauthorizedException('Token de reset expirado.');
      }

      const newHash = await bcrypt.hash(dto.newPassword, 12);

      // Invitación (spec «usuarios UISP» §2.4): abrir el enlace enviado al correo prueba su
      // propiedad, así que una cuenta PENDING_VERIFICATION queda verificada y ACTIVE. Solo
      // desde ese estado: ACTIVE sigue igual e INACTIVE/SUSPENDED nunca se reactivan aquí.
      const activatesAccount = user.status === UserStatus.PENDING_VERIFICATION;

      await qr.manager.update(User, user.id, {
        passwordHash: newHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        passwordResetRequired: false,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(activatesAccount
          ? { status: UserStatus.ACTIVE, emailVerified: true, emailVerificationToken: null }
          : {}),
      });

      // Revocar todos los refresh tokens activos del usuario
      await qr.manager.update(
        RefreshToken,
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGE' },
      );

      // Registrar reset completado en audit trail — RF-AUD-02 (HLD-MOD02 §4.2)
      void this.auditService.log({
        action: AuditAction.PASSWORD_RESET_COMPLETED,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        ...(activatesAccount
          ? { newValue: { status: UserStatus.ACTIVE, emailVerified: true } }
          : {}),
      });
    });

    // Enviar correo de confirmacion si el cliente incluyo el email en el DTO
    // El email no se almacena en DB (solo el hash SHA-256 no reversible)
    if (dto.email) {
      const plainEmail = dto.email.toLowerCase().trim();
      const template = passwordResetConfirmTemplate();
      // Fire-and-forget — no bloquea la respuesta al cliente
      this.fireAndForget(
        this.mailerService.sendMail({ to: plainEmail, ...template }),
        'correo de confirmacion de cambio de contrasena',
      );
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

    // D1 (igual que `login`): el incremento del intento fallido se confirma con
    // la transacción; la excepción se lanza fuera, después del commit.
    const failed: ChangePasswordFailedOutcome | null = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr): Promise<ChangePasswordFailedOutcome | null> => {
        // Bloqueada: un restablecimiento simultáneo no se pisa.
        const user = await qr.manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Usuario no encontrado.');

        // P-09: contador de fallos por cuenta — mismos umbrales del login
        // (5 intentos / lockout 15 min). `PlatformUser` no tiene estas columnas:
        // el contador solo aplica a la rama de tenant (documentado).
        if (isAccountLocked(user)) {
          throw new UnauthorizedException(
            `Cuenta bloqueada temporalmente. Intenta en ${remainingLockoutMinutes(user)} minuto(s).`,
          );
        }

        const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
        if (!passwordValid) {
          const registered = await this.registerFailedAttempt(qr.manager, user.id);
          return {
            userId: user.id,
            failedLoginAttempts: registered.failedLoginAttempts,
            lockedUntil: registered.lockedUntil,
          };
        }

        if (user.passwordResetRequired && dto.newPassword === dto.currentPassword) {
          throw new BadRequestException('Elige una contraseña diferente de la temporal.');
        }

        const newHash = await bcrypt.hash(dto.newPassword, 12);

        // ADR-117 D3: el cambio obligatorio activa la cuenta; el correo sigue sin verificar.
        const activatesAccount =
          user.passwordResetRequired && user.status === UserStatus.PENDING_VERIFICATION;

        await qr.manager.update(User, userId, {
          passwordHash: newHash,
          passwordResetRequired: false,
          passwordResetExpiresAt: null,
          // Un enlace de recuperación anterior al cambio no sigue canjeable.
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          ...(activatesAccount ? { status: UserStatus.ACTIVE } : {}),
        });

        // Revocar todos los refresh tokens activos del usuario
        await qr.manager.update(
          RefreshToken,
          { userId, revokedAt: IsNull() },
          { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGE' },
        );

        // P-05: paridad con la rama de plataforma y con `logout` — el access
        // token en curso (cookie) deja de servir de inmediato. `JwtStrategy`
        // rechaza todo `jti` en esta blacklist en ambas audiencias, asi que la
        // asimetria no era deliberada: era el hueco de 15 min del informe.
        const expiresAt = actor.exp ?? 0;
        const remainingTtl = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
        if (remainingTtl > 0) {
          await this.redis.set(`jti:blacklist:${actor.jti}`, '1', 'EX', remainingTtl);
        }

        // Registrar cambio de contrasena en audit trail
        void this.auditService.log({
          action: AuditAction.PASSWORD_CHANGED,
          entityType: 'User',
          entityId: userId,
          userId,
          ...(activatesAccount ? { newValue: { status: UserStatus.ACTIVE } } : {}),
        });

        return null;
      },
    );

    if (failed) {
      await this.auditFailedAttempt(failed);
      throw new UnauthorizedException(
        'La contraseña actual no coincide con la que usas para iniciar sesión.',
      );
    }
  }

  /**
   * Cambia la contrasena de un usuario de plataforma autenticado.
   *
   * Es la salida del primer ingreso: al completarse, `passwordResetRequired`
   * queda en false y el token de alcance limitado que trajo al usuario hasta
   * aqui deja de servir. El siguiente login entrega ya una sesion completa.
   *
   * Sobre la invalidacion: los refresh quedan ligados al hash anterior y la
   * renovacion los rechaza. El access token en curso vence solo, salvo el de este
   * actor: se anota su JTI en la blacklist para que el token de alcance
   * 'password-change' no sobreviva al cambio que lo justificaba.
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

    const pendingActivation = user.status === UserStatus.PENDING_VERIFICATION;
    if (
      pendingActivation &&
      (dto.newPassword === dto.currentPassword || Buffer.byteLength(dto.newPassword, 'utf8') > 72)
    ) {
      throw new BadRequestException(
        'Elige una contraseña diferente de la temporal, de hasta 72 bytes.',
      );
    }
    const newHash = await bcrypt.hash(dto.newPassword, 12);

    // Hash y marca en la misma sentencia: no puede quedar la contrasena nueva
    // aplicada con la cuenta todavia marcada como pendiente, ni al reves.
    const changed = await this.platformUserRepository.update(
      pendingActivation
        ? {
            id: user.id,
            deletedAt: IsNull(),
            status: UserStatus.PENDING_VERIFICATION,
            passwordHash: user.passwordHash,
            passwordResetRequired: true,
          }
        : { id: user.id, passwordHash: user.passwordHash, deletedAt: IsNull() },
      {
        passwordHash: newHash,
        passwordResetRequired: false,
      },
    );
    if (!changed.affected) {
      throw new ConflictException(
        pendingActivation
          ? 'La contraseña temporal ya se cambió. Inicia sesión de nuevo.'
          : 'Tu cuenta cambió mientras guardábamos. Inicia sesión de nuevo e inténtalo otra vez.',
      );
    }

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
    // TenantContext. Cuando se escribio esto, `AuditService.log()` retornaba sin
    // escribir en ese caso y la llamada parecia auditar sin auditar. S-8 cerro
    // esa fuga: hoy reencamina la entrada a `public.platform_audit_logs` como
    // `ANOMALIA_AUDITORIA:`. La eleccion no cambia — pasar por ahi dejaria el
    // cambio de contrasena registrado como anomalia en vez de como el evento
    // legitimo que es.
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
        // `save` reescribe lo leído: sin bloqueo restauraría una contraseña cambiada en paralelo.
        lock: { mode: 'pessimistic_write' },
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
      const emailHash = hashEmail(dto.email, this.piiHashKey);
      const user = await qr.manager.findOne(User, {
        where: { emailHash, emailVerified: false },
        lock: { mode: 'pessimistic_write' },
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
      this.fireAndForget(
        this.mailerService.sendMail({ to: plainEmail, ...template }),
        'correo de verificacion de email',
      );
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
    actorUserId: string;
    ipAddress: string | null;
    userAgent: string | null;
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

      // Quien tuviera una sesión abierta no la renueva; el access token en curso vence solo.
      await qr.manager.update(
        RefreshToken,
        { userId: adminUser.id, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason: 'ADMIN' },
      );

      // En la misma transacción: sin rastro no hay credencial. `entityType` no es 'Tenant':
      // ese alimenta las series de estado de empresa.
      await this.platformAuditService.logWithin(
        {
          userId: input.actorUserId,
          action: AuditAction.PASSWORD_CHANGED,
          entityType: 'TenantAdmin',
          entityId: adminUser.id,
          newValue: { tenantId: input.tenantId, expiresAt: expiresAt.toISOString() },
          ipAddress: input.ipAddress?.slice(0, 45) ?? null,
          userAgent: input.userAgent?.slice(0, 512) ?? null,
        },
        qr.manager,
      );

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
   *   critico (ADMIN, NOC, ACCOUNTANT) no tiene MFA configurado. Con 'password-change'
   *   solo alcanza /auth/change-password (ADR-117).
   */
  private signAccessToken(
    user: User,
    scope?: 'mfa-setup' | 'password-change',
  ): { accessToken: string; jti: string } {
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
      credentialVersion: this.credentialVersion(user.passwordHash),
      // Scope limitado para flujo de MFA setup — ausente en tokens completos
      ...(scope ? { scope } : {}),
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: `${this.accessTokenTtlSeconds}s`,
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
    scope?: 'password-change' | 'platform-mfa-setup',
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
      // La inscripción de MFA queda ligada a la contraseña vigente.
      ...(scope === 'platform-mfa-setup'
        ? { credentialVersion: this.credentialVersion(user.passwordHash) }
        : {}),
      // Scope limitado para el cambio obligatorio — ausente en tokens completos
      ...(scope ? { scope } : {}),
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: `${this.accessTokenTtlSeconds}s`,
      algorithm: 'RS256',
      // Audiencia de plataforma: solo estos tokens verifican en la consola de plataforma.
      issuer: JWT_CLAIMS_BY_TOKEN_TYPE.platform.issuer,
      audience: JWT_CLAIMS_BY_TOKEN_TYPE.platform.audience,
    });

    return { accessToken, jti };
  }

  /** Token de inscripción MFA para la cuenta recién creada por el alta pública. */
  async signPlatformEnrollmentToken(userId: string): Promise<string> {
    const user = await this.platformUserRepository.findOneByOrFail({ id: userId });
    return this.signPlatformAccessToken(user, 'platform-mfa-setup').accessToken;
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
      expiresAt: new Date(Date.now() + this.refreshTokenTtlSeconds * 1000),
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
   *
   * D1: el incremento es atómico con `UPDATE ... RETURNING` en una sola
   * sentencia. La versión anterior leía `user.failedLoginAttempts` y escribía
   * `+1` con `manager.update`: con intentos en paralelo, varias transacciones
   * leían el mismo valor y se perdían cuentas. La decisión de bloqueo se toma
   * con el valor devuelto por la sentencia, no con la lectura previa.
   *
   * La auditoría ACCOUNT_LOCKED no se emite aquí: los llamadores la emiten
   * después del commit junto con LOGIN_FAILED, porque el llamador debe
   * sobrevivir al fallo (spec §6 D4 — nunca `logWithin` en la transacción que
   * falla). Antes se emitía con `void` dentro de la transacción.
   *
   * Devuelve el estado confirmado por la sentencia para que el llamador
   * decida el bloqueo y el evento sin releer.
   */
  private async registerFailedAttempt(
    manager: import('typeorm').EntityManager,
    userId: string,
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    // TypeORM en Postgres devuelve las sentencias UPDATE como tupla
    // `[filas, rowCount]` (`PostgresQueryRunner.query`) — la primera
    // componente es el array de filas del RETURNING, no una fila.
    const [rows] = (await manager.query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= $1
             THEN now() + ($2 * interval '1 second')
             ELSE locked_until
           END,
           updated_at = now()
       WHERE id = $3
       RETURNING failed_login_attempts, locked_until`,
      [MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_SECONDS, userId],
    )) as [FailedAttemptRow[], number];

    const row = rows[0];
    if (!row) {
      throw new Error(
        `registerFailedAttempt: el usuario ${userId} no se actualizó dentro de la transacción.`,
      );
    }

    const rawLockedUntil = row.locked_until ?? null;
    const lockedUntil =
      rawLockedUntil === null
        ? null
        : rawLockedUntil instanceof Date
          ? rawLockedUntil
          : new Date(rawLockedUntil);

    return {
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil,
    };
  }

  /** Audita un intento fallido de un usuario autenticado; se llama después del commit. */
  private async auditFailedAttempt(failed: ChangePasswordFailedOutcome): Promise<void> {
    const { userId, failedLoginAttempts, lockedUntil } = failed;
    const target = { entityType: 'User', entityId: userId, userId };
    await this.auditService.log({ action: AuditAction.LOGIN_FAILED, ...target });
    if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      await this.auditService.log({
        action: AuditAction.ACCOUNT_LOCKED,
        ...target,
        newValue: { lockedUntil, failedLoginAttempts },
      });
    }
  }

  /**
   * Genera hash SHA-256 de un token arbitrario.
   * Los refresh tokens NUNCA se almacenan en texto plano.
   */
  private hashToken(token: string): string {
    return hashOpaqueToken(token);
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

  /**
   * Fire-and-forget con registro visible de fallo (H-13), igual que UsersService.
   * No interrumpe la peticion; solo deja de silenciar el rechazo. Sin catch, un rechazo
   * de SMTP no manejado termina el proceso en Node 24 (dictamen B6, O-1).
   * Promise.resolve tolera mocks que no devuelven una Promise.
   */
  private fireAndForget(task: PromiseLike<unknown> | unknown, context: string): void {
    void Promise.resolve(task).catch((err: unknown) => {
      this.logger.warn(`Fallo en ${context}: ${summarizeErrorForLog(err)}`);
    });
  }
}
