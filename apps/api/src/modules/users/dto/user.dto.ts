import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@iwana/shared';

/**
 * DTO para crear un usuario dentro del tenant.
 *
 * Si se omite `password`, se genera una temporal y se activa `passwordResetRequired`.
 * La operacion requiere `Idempotency-Key` en el header para prevenir duplicados.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (POST /api/v1/users)
 */
export class CreateUserDto {
  @ApiProperty({ example: 'usuario@ejemplo.com', description: 'Email del usuario' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: UserRole, description: 'Rol del usuario en el tenant' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'Contrasena inicial (min 10 chars). Si se omite, se genera una temporal.',
    minLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password?: string;
}

/**
 * DTO para actualizacion parcial de un usuario.
 * El ADMIN puede cambiar status o role; el propio usuario solo puede cambiar campos limitados.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (PATCH /api/v1/users/:id)
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ enum: UserStatus, description: 'Nuevo estado del usuario' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: UserRole, description: 'Nuevo rol del usuario' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

/**
 * Representacion publica de un usuario.
 * Excluye campos sensibles: passwordHash, mfaSecret, tokens, emailHash.
 */
export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  mfaEnabled: boolean;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty()
  passwordResetRequired: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ nullable: true })
  deletedAt: Date | null;
}
