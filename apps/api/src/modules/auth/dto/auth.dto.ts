import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiSchema } from '@nestjs/swagger';

/**
 * DTO de login.
 * totpCode es opcional en el primer paso (cuando MFA aun no esta activo
 * o cuando el frontend hace el primer POST sin codigo).
 * Si el usuario tiene mfaEnabled=true y no envia totpCode, la respuesta
 * devuelve mfaRequired=true y el cliente debe reintentar con el codigo.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4.1 (POST /api/v1/auth/login)
 */
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsString()
  @IsOptional()
  @Length(6, 6)
  totpCode?: string;
}

/**
 * DTO de renovacion de access token.
 * El refreshToken llega por cookie httpOnly — no en el body.
 * Este DTO queda vacio intencionalmente (el controller accede a req.cookies).
 */
export class RefreshTokenDto {}

/**
 * DTO para iniciar configuracion MFA (POST /api/v1/auth/mfa/setup).
 * No requiere body — el secret se genera en el backend.
 */
export class MfaSetupDto {}

/**
 * DTO de verificacion MFA (POST /api/v1/auth/mfa/verify y /disable).
 */
export class MfaVerifyDto {
  @IsString()
  @Length(6, 6)
  totpCode: string;
}

/**
 * DTO de desactivacion MFA (POST /api/v1/auth/mfa/disable).
 * Requiere password actual + codigo TOTP para confirmar identidad.
 */
export class MfaDisableDto {
  @IsString()
  @MinLength(10)
  password: string;

  @IsString()
  @Length(6, 6)
  totpCode: string;
}

/**
 * DTO de recuperacion de contrasena (POST /api/v1/auth/forgot-password).
 * Respuesta siempre 200 — nunca revelar si el email existe (seguridad).
 */
export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(255)
  email: string;
}

/**
 * DTO de restablecimiento de contrasena (POST /api/v1/auth/reset-password).
 *
 * El email es opcional: si se incluye, se envia un correo de confirmacion al completar.
 * Si no se incluye, el restablecimiento procede igualmente (la logica no depende del email).
 */
@ApiSchema({ name: 'AuthResetPasswordDto' })
export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword: string;

  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  email?: string;
}

/**
 * DTO de cambio de contrasena autenticado (POST /api/v1/auth/change-password).
 * Invalida todos los refresh tokens del usuario al completar.
 */
export class ChangePasswordDto {
  @IsString({ message: 'Ingresa tu contraseña actual para confirmar el cambio.' })
  @MinLength(10, {
    message: 'La contraseña actual debe tener entre 10 y 128 caracteres.',
  })
  currentPassword: string;

  @IsString({ message: 'Ingresa una nueva contraseña.' })
  @MinLength(10, {
    message: 'La nueva contraseña debe tener entre 10 y 128 caracteres.',
  })
  @MaxLength(128, {
    message: 'La nueva contraseña debe tener entre 10 y 128 caracteres.',
  })
  newPassword: string;
}

/**
 * DTO de verificacion de email (POST /api/v1/auth/email/verify).
 * El token fue enviado al email del usuario durante el registro.
 */
export class EmailVerifyDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

/**
 * DTO de reenvio de verificacion de email (POST /api/v1/auth/email/resend-verification).
 * Responde siempre 200 sin revelar si el email existe (OWASP).
 */
export class ResendVerificationDto {
  @IsEmail()
  email: string;
}
