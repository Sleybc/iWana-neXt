import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformUser, RefreshToken, User } from '@iwana/db';
import { JWT_ACCEPTED_AUDIENCES, JWT_ACCEPTED_ISSUERS } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AbacGuard } from './guards/abac.guard';
import { PlatformOnlyGuard } from './guards/platform-only.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuditModule } from '../audit/audit.module';
import { PlatformBootstrapService } from './platform-bootstrap.service';

/**
 * Modulo de autenticacion.
 *
 * Responsabilidades:
 * - JWT RS256: access token (15 min) + refresh token rotation (7 dias, cookie httpOnly)
 * - MFA TOTP: setup (QR code) + verify (activa) + disable (requiere password + codigo)
 * - Bloqueo por intentos fallidos: 5 intentos → lockout 15 min
 * - JTI blacklist en Redis para revocacion inmediata de access tokens (logout)
 * - Guards: JwtAuthGuard, RolesGuard, AbacGuard exportados para consumo por otros modulos
 * - Decoradores: @CurrentUser(), @Roles(), @Public(), @TenantId()
 *
 * La clave privada RSA se carga desde el archivo secrets/jwt-private.pem via ConfigService.
 * La clave publica RSA se carga desde secrets/jwt-public.pem para verificacion.
 *
 * NOTA: RedisModule ("REDIS_CLIENT") es Global — se inyecta automaticamente aqui.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/auth)
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JWT RS256: se configura con la clave privada RSA del entorno
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Las claves PEM pueden venir con \n literales en el .env — se normaliza aqui
        privateKey: config.getOrThrow<string>('JWT_PRIVATE_KEY').replace(/\\n/g, '\n'),
        publicKey: config.getOrThrow<string>('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
        // Sin `issuer` por defecto en signOptions: cada emision declara el suyo
        // segun el tipo de token (ver auth.constants.ts). La verificacion acepta
        // los dos emisores/audiencias y JwtStrategy exige la coherencia con `type`.
        signOptions: {
          algorithm: 'RS256',
        },
        verifyOptions: {
          algorithms: ['RS256'],
          issuer: JWT_ACCEPTED_ISSUERS,
          audience: JWT_ACCEPTED_AUDIENCES,
        },
      }),
    }),

    // Entidades del schema de tenant que AuthService manipula
    TypeOrmModule.forFeature([User, RefreshToken, PlatformUser]),

    // AuditModule: proporciona AuditService para eventos de auth (LOGIN, MFA, etc.)
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    AbacGuard,
    PlatformOnlyGuard,
    CsrfGuard,
    PlatformBootstrapService,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    AbacGuard,
    PlatformOnlyGuard,
    CsrfGuard,
    JwtModule,
    // Decoradores son funciones puras — no se exportan como providers
  ],
})
export class AuthModule {}
