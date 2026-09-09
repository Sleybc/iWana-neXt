import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Request,
  Response,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CookieOptions, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { TenantContext } from '@iwana/db';
import { AuthService } from './auth.service';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
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
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthResponse, MfaSetupResponse } from './interfaces/auth-response.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  isCookieSecure,
  platformAccessCookieName,
  platformRefreshCookieName,
  tenantAccessCookieName,
  tenantRefreshCookieName,
} from './session-cookies.constants';
import { resolveAccessTokenTtlSeconds, resolveRefreshTokenTtlSeconds } from './token-ttl.constants';

/** Nombre de la cookie del refresh token del portal (audiencia tenant). */
const REFRESH_TOKEN_COOKIE = tenantRefreshCookieName();

/** Path de las cookies de refresh: restringido al flujo de autenticacion. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Controlador de autenticacion.
 *
 * Pipeline de seguridad (HLD Seccion 2):
 *   Rate Limiter → TLS → JwtAuthGuard → TenantMiddleware → RolesGuard → Business Logic
 *
 * Todos los endpoints de autenticacion son publicos o requieren solo JwtAuthGuard.
 * No requieren RolesGuard ni AbacGuard (son operaciones de la propia sesion del usuario).
 *
 * El refresh token se maneja exclusivamente via cookie httpOnly para prevenir XSS.
 *
 * Prefijo: /api/v1/auth
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (contratos de API)
 */
@Controller('auth')
@UseGuards(JwtAuthGuard)
@ApiTags('auth')
@ApiBearerAuth('access-token')
export class AuthController {
  /** Reason codes de sesion — nunca tokens, hashes completos, correos ni IPs. */
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Opciones de la cookie de access. El `maxAge` se sincroniza con el TTL
   * configurado del token (JWT_ACCESS_EXPIRATION): la cookie no debe sobrevivir
   * a la credencial que contiene.
   *
   * `Secure` lo resuelve `isCookieSecure()` (C-5, ADR-081). El prefijo
   * `__Host-` en produccion lo resuelve el nombre de la cookie.
   */
  private accessCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: isCookieSecure(),
      sameSite: 'strict',
      maxAge: resolveAccessTokenTtlSeconds(this.configService) * 1000,
      path: '/',
    };
  }

  /**
   * Opciones de la cookie de refresh: httpOnly, SameSite=Strict y `maxAge`
   * sincronizado con el TTL configurado del token (JWT_REFRESH_EXPIRATION).
   * `Secure` lo resuelve `isCookieSecure()` (C-5, ADR-081).
   */
  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: isCookieSecure(),
      sameSite: 'strict',
      maxAge: resolveRefreshTokenTtlSeconds(this.configService) * 1000,
      path: REFRESH_COOKIE_PATH,
    };
  }

  /**
   * POST /api/v1/auth/login
   * Autentica un usuario. Si MFA esta habilitado, responde con mfaRequired=true
   * y el cliente debe reenviar con totpCode.
   * Emite el refresh token como cookie httpOnly.
   *
   * RF-AUTH-01, RF-AUTH-02, RF-AUTH-03, RF-AUTH-04
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesion con email y password (+ TOTP si MFA activo)' })
  @ApiResponse({ status: 200, description: 'Login exitoso — access token emitido.' })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas o cuenta bloqueada.' })
  async login(
    @Body() dto: LoginDto,
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<{ data: AuthResponse }> {
    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.login(dto, ipAddress, userAgent);

    // Cookie de access (ADR-081): solo cuando el login fue completo. El token
    // de alcance limitado (mfa-setup) queda fuera de la cookie: vive en memoria
    // en el cliente (decision 6 del ADR), nunca en almacenamiento persistente.
    if (!result.mfaRequired && !result.mfaSetupRequired && result.accessToken) {
      res.cookie(tenantAccessCookieName(), result.accessToken, this.accessCookieOptions());
    }

    if (!result.mfaRequired && result.refreshToken) {
      // Solo emitir cookie si el login fue completo (no requiere MFA)
      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, this.refreshCookieOptions());
    }

    return {
      data: {
        accessToken: result.accessToken,
        ...(result.mfaRequired ? { mfaRequired: true } : {}),
        // Propagado al cliente para que el portal redirija al flujo de MFA setup
        // sin intentar llamar a /auth/me con un token de alcance limitado.
        ...(result.mfaSetupRequired ? { mfaSetupRequired: true } : {}),
      },
    };
  }

  /**
   * POST /api/v1/auth/platform/login
   * Login de plataforma para SYSTEM_ADMIN e IWANA_SUPPORT.
   *
   * No requiere contexto de tenant ni header X-Tenant-Slug.
   */
  @Public()
  @Post('platform/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesion de plataforma (SYSTEM_ADMIN / IWANA_SUPPORT)' })
  @ApiResponse({ status: 200, description: 'Login de plataforma exitoso.' })
  @ApiResponse({ status: 401, description: 'Credenciales invalidas o cuenta bloqueada.' })
  async platformLogin(
    @Body() dto: LoginDto,
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<{ data: AuthResponse }> {
    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await this.authService.loginPlatform(dto, ipAddress, userAgent);

    // C-6 (ADR-081): la consola de plataforma gana ciclo de refresco. Emite la
    // cookie de access y la de refresh solo en el login completo. El token de
    // alcance limitado (password-change) no entra en cookies: queda en memoria.
    if (!result.mfaRequired && !result.passwordResetRequired && result.accessToken) {
      res.cookie(platformAccessCookieName(), result.accessToken, this.accessCookieOptions());
    }

    if (!result.mfaRequired && !result.passwordResetRequired && result.refreshToken) {
      res.cookie(platformRefreshCookieName(), result.refreshToken, this.refreshCookieOptions());
    }

    return {
      data: {
        accessToken: result.accessToken,
        ...(result.mfaRequired ? { mfaRequired: true } : {}),
        // Propagado explicitamente: NestJS descarta los campos omitidos al
        // serializar. Si este indicador no viaja, la consola deja entrar al
        // usuario sin cambiar nada mientras el backend cree que lo exigio.
        ...(result.passwordResetRequired ? { passwordResetRequired: true } : {}),
      },
    };
  }

  /**
   * POST /api/v1/auth/refresh
   * Rota el refresh token. Lee la cookie httpOnly, emite nuevos tokens.
   *
   * Ruteo por audiencia: el cliente declara su audiencia con el header
   * `X-Tenant-Slug` (el portal lo envia SIEMPRE; la consola de plataforma
   * NUNCA).
   *
   * - Con audiencia tenant declarada: fail-fast. Solo se intenta la rama
   *   tenant. Si la cookie tenant falta o es rechazada, se responde 401
   *   inmediato; la cookie de plataforma presente se ignora sin consumirla
   *   (una sesion de plataforma jamas autoriza al portal, asi que el fallback
   *   seria un ciclo desperdiciado que rota tokens inutilmente y pospone el
   *   error que de todos modos termina en el modal de recuperacion).
   * - Sin header (plataforma y clientes sin declarar): platform-first con
   *   fallback a tenant por retrocompatibilidad con llamadas que solo traen
   *   esa credencial.
   *
   * Cada cookie se valida por su propio nombre, nunca por la ausencia de la
   * otra, y la deteccion de reuse sigue operando en el servicio.
   *
   * RF-AUTH-05, RF-AUTH-06 (reuse attack detection)
   */
  @Public()
  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotar el refresh token (cookie httpOnly)' })
  @ApiResponse({ status: 200, description: 'Nuevo access token emitido.' })
  @ApiResponse({ status: 401, description: 'Refresh token invalido o expirado.' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes.' })
  async refresh(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<{ data: { accessToken: string } }> {
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const rawTenantRefreshToken = cookies[tenantRefreshCookieName()];
    const rawPlatformRefreshToken = cookies[platformRefreshCookieName()];
    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // `X-Tenant-Slug` duplicado llega como `string[]` en Express: se toma el
    // primero (misma tolerancia que el TenantMiddleware con el slug).
    const tenantSlugHeader = req.headers['x-tenant-slug'];
    const declaredSlug = Array.isArray(tenantSlugHeader) ? tenantSlugHeader[0] : tenantSlugHeader;
    const declaresTenant = typeof declaredSlug === 'string' && declaredSlug.trim().length > 0;

    // Fail-fast: con audiencia tenant declarada, la sesion de plataforma no
    // autoriza nada y se ignora sin consumirla.
    if (declaresTenant) {
      if (!rawTenantRefreshToken) {
        this.logger.warn('REFRESH_COOKIE_MISSING — audiencia tenant declarada sin cookie tenant.');
        throw new UnauthorizedException('No se encontro el refresh token.');
      }

      return this.refreshTenantSession(rawTenantRefreshToken, ipAddress, userAgent, res);
    }

    if (!rawTenantRefreshToken && !rawPlatformRefreshToken) {
      this.logger.warn('REFRESH_COOKIE_MISSING — peticion sin cookie de refresh.');
      throw new UnauthorizedException('No se encontro el refresh token.');
    }

    if (rawPlatformRefreshToken) {
      try {
        return await this.refreshPlatformSession(
          rawPlatformRefreshToken,
          ipAddress,
          userAgent,
          res,
        );
      } catch (primaryError) {
        // Un fallo no-401 no es credencial rechazada: no se enmascara.
        if (!(primaryError instanceof UnauthorizedException) || !rawTenantRefreshToken) {
          throw primaryError;
        }

        this.logger.warn('REFRESH_FALLBACK_ATTEMPTED — platform rechazado, probando tenant.');
        try {
          return await this.refreshTenantSession(rawTenantRefreshToken, ipAddress, userAgent, res);
        } catch (fallbackError) {
          // Ambas rechazadas: manda el error de la credencial prioritaria.
          if (!(fallbackError instanceof UnauthorizedException)) {
            throw fallbackError;
          }
          throw primaryError;
        }
      }
    }

    // Sin cookie de plataforma, el guard inicial garantiza que la credencial
    // presente es la del tenant (TS no sigue la disyuncion del guard).
    return this.refreshTenantSession(rawTenantRefreshToken!, ipAddress, userAgent, res);
  }

  /**
   * Rama tenant del refresh: rota la sesion del portal y re-emite sus cookies.
   * Las cookies de respuesta solo se emiten si la rama fue exitosa.
   */
  private async refreshTenantSession(
    rawRefreshToken: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    res: ExpressResponse,
  ): Promise<{ data: { accessToken: string } }> {
    const result = await this.authService.refreshTokens(rawRefreshToken, ipAddress, userAgent);

    // La cookie de access tambien se rota: el cliente no puede escribirla
    // (httpOnly), asi que la emite el servidor en cada renovacion.
    res.cookie(tenantAccessCookieName(), result.accessToken, this.accessCookieOptions());
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, this.refreshCookieOptions());

    return { data: { accessToken: result.accessToken } };
  }

  /**
   * Rama de plataforma del refresh (C-6, ADR-081): rota la sesion de la consola
   * y re-emite sus cookies. Las cookies solo se emiten si la rama fue exitosa.
   */
  private async refreshPlatformSession(
    rawRefreshToken: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    res: ExpressResponse,
  ): Promise<{ data: { accessToken: string } }> {
    const result = await this.authService.refreshPlatformTokens(
      rawRefreshToken,
      ipAddress,
      userAgent,
    );

    res.cookie(platformAccessCookieName(), result.accessToken, this.accessCookieOptions());
    res.cookie(platformRefreshCookieName(), result.refreshToken, this.refreshCookieOptions());

    return { data: { accessToken: result.accessToken } };
  }

  /**
   * POST /api/v1/auth/logout
   * Cierra sesion: blacklist del JTI en Redis y revoca refresh token.
   *
   * RF-AUTH-05 (JTI blacklist)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesion — invalida JTI y revoca refresh token' })
  @ApiResponse({ status: 200, description: 'Sesion cerrada.' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<{ data: { message: string } }> {
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const rawRefreshToken = cookies[tenantRefreshCookieName()];
    const rawPlatformRefreshToken = cookies[platformRefreshCookieName()];

    await this.authService.logout(user, rawRefreshToken, rawPlatformRefreshToken);

    // Limpiar las cookies de la sesion: access (Path=/) y refresh (Path=/api/v1/auth)
    // en ambas audiencias, para que el logout no dependa de cual estaba presente.
    res.clearCookie(tenantRefreshCookieName(), { path: REFRESH_COOKIE_PATH });
    res.clearCookie(platformRefreshCookieName(), { path: REFRESH_COOKIE_PATH });
    res.clearCookie(tenantAccessCookieName(), { path: '/' });
    res.clearCookie(platformAccessCookieName(), { path: '/' });

    return { data: { message: 'Sesion cerrada correctamente.' } };
  }

  /**
   * GET /api/v1/auth/me
   * Retorna el usuario autenticado a partir del JWT.
   * El payload proviene del JwtStrategy (req.user).
   */
  @Get('me')
  @ApiOperation({ summary: 'Datos del usuario autenticado (desde el JWT)' })
  @ApiResponse({ status: 200, description: 'Payload del JWT.' })
  async me(@CurrentUser() user: JwtPayload): Promise<{ data: JwtPayload }> {
    return { data: user };
  }

  // ---------------------------------------------------------------------------
  // MFA TOTP
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/auth/mfa/setup
   * Genera secret TOTP + QR code. El usuario debe confirmar con /mfa/verify.
   *
   * RF-AUTH-03
   */
  @Post('mfa/setup')
  // La respuesta lleva la semilla TOTP: `otpauthUri` es
  // `otpauth://totp/<email>?secret=<BASE32>` y `qrCodeBase64` es esa misma
  // semilla en imagen. Auditarla permitiría a un ADMIN de tenant leer el
  // segundo factor de sus usuarios en `<schema>.audit_logs` y generar sus
  // códigos. El saneado ya cubre ambas claves, pero un endpoint que devuelve un
  // secreto no debe depender de una sola capa.
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Genera secret TOTP y QR code para configurar MFA' })
  @ApiResponse({ status: 200, description: 'QR code y URI de autenticacion.' })
  async setupMfa(@CurrentUser() user: JwtPayload): Promise<{ data: MfaSetupResponse }> {
    const result = await this.authService.setupMfa(user.sub, user.email);
    return { data: result };
  }

  /**
   * POST /api/v1/auth/mfa/verify
   * Activa el MFA verificando el codigo TOTP del authenticator.
   *
   * RF-AUTH-03
   */
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa MFA verificando el primer codigo TOTP' })
  @ApiResponse({ status: 200, description: 'MFA activado.' })
  @ApiResponse({ status: 401, description: 'Codigo TOTP invalido.' })
  async verifyMfa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MfaVerifyDto,
  ): Promise<{ data: { mfaEnabled: boolean } }> {
    const result = await this.authService.verifyMfaSetup(user.sub, dto);
    return { data: result };
  }

  /**
   * POST /api/v1/auth/mfa/disable
   * Desactiva el MFA. Requiere password actual + codigo TOTP.
   *
   * RF-AUTH-03
   */
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactiva MFA (requiere password + codigo TOTP actual)' })
  @ApiResponse({ status: 200, description: 'MFA desactivado.' })
  async disableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MfaDisableDto,
  ): Promise<{ data: { mfaEnabled: boolean } }> {
    const result = await this.authService.disableMfa(user.sub, dto);
    return { data: result };
  }

  // ---------------------------------------------------------------------------
  // RECUPERACION Y CAMBIO DE CONTRASENA
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/auth/forgot-password
   * Inicia flujo de recuperacion. Responde siempre 200 (OWASP).
   *
   * RF-AUTH-07
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicita link de recuperacion de contrasena (respuesta siempre 200)' })
  @ApiResponse({ status: 200, description: 'Solicitud procesada.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ data: { message: string } }> {
    await this.authService.forgotPassword(dto);
    return { data: { message: 'Si el email existe, recibiras instrucciones de recuperacion.' } };
  }

  /**
   * POST /api/v1/auth/reset-password
   * Restablece la contrasena con el token de reset.
   *
   * RF-AUTH-08
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablece la contrasena usando el token de recuperacion' })
  @ApiResponse({ status: 200, description: 'Contrasena restablecida.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ data: { message: string } }> {
    await this.authService.resetPassword(dto);
    return { data: { message: 'Contrasena restablecida correctamente.' } };
  }

  /**
   * POST /api/v1/auth/change-password
   * Cambia la contrasena del usuario autenticado, sea de tenant o de plataforma.
   *
   * Es tambien la unica ruta que alcanza un token con scope='password-change':
   * la salida del primer ingreso con la credencial de arranque.
   *
   * RF-AUTH-09
   */
  @Post('change-password')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambia la contrasena del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Contrasena actualizada.' })
  @ApiResponse({ status: 401, description: 'Contrasena actual incorrecta.' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes.' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<{ data: { message: string } }> {
    // Se pasa el payload completo, no solo el sub: el servicio necesita `type`
    // para no resolver a un usuario de plataforma via TenantContext, y `jti`
    // para revocar el token en curso al completar el cambio.
    await this.authService.changePassword(user, dto);
    // P-05: el `jti` en curso quedo en blacklist en el servicio; la cookie de
    // access se limpia para que el navegador no siga presentando un token
    // revocado. El cliente cierra sesion tras el cambio voluntario (C-3, FE).
    res.clearCookie(
      user.type === 'platform' ? platformAccessCookieName() : tenantAccessCookieName(),
      { path: '/' },
    );
    return { data: { message: 'Contrasena actualizada correctamente.' } };
  }

  // ---------------------------------------------------------------------------
  // VERIFICACION DE EMAIL
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/auth/email/verify
   * Verifica el email del usuario con el token recibido por correo.
   * Ruta publica — el usuario no esta autenticado en este paso.
   *
   * El tenant se resuelve automaticamente via TenantMiddleware (header X-Tenant-Slug).
   */
  @Public()
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica el email del usuario con el token de verificacion' })
  @ApiResponse({ status: 200, description: 'Email verificado correctamente.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  async verifyEmail(@Body() dto: EmailVerifyDto): Promise<{ data: { message: string } }> {
    // TenantContext es resuelto por TenantMiddleware desde el header X-Tenant-Slug
    const { schemaName } = TenantContext.getOrThrow();
    await this.authService.verifyEmail(dto, schemaName);
    return { data: { message: 'Email verificado correctamente.' } };
  }

  /**
   * POST /api/v1/auth/email/resend-verification
   * Reenvía el correo de verificacion de email.
   * Ruta publica — responde siempre 200 sin revelar si el email existe (OWASP).
   *
   * El tenant se resuelve automaticamente via TenantMiddleware (header X-Tenant-Slug).
   */
  @Public()
  @Post('email/resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenvía el correo de verificacion (respuesta siempre 200)' })
  @ApiResponse({ status: 200, description: 'Solicitud procesada.' })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ data: { message: string } }> {
    // TenantContext es resuelto por TenantMiddleware desde el header X-Tenant-Slug
    const { schemaName } = TenantContext.getOrThrow();
    await this.authService.resendVerificationEmail(dto, schemaName);
    return { data: { message: 'Si el email existe y no esta verificado, recibiras un correo.' } };
  }
}
