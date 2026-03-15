import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, UserRole, UserStatus } from '@iwana/shared';

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

  // ── Perfil personal (todos opcionales) ──────────────────────────────────────

  /** Nombres del usuario — se cifran con AES-256-GCM antes de persistir */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  /** Apellidos del usuario — se cifran con AES-256-GCM antes de persistir */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** Teléfono en formato E.164 (ej: "+573001234567") */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'phone debe estar en formato E.164 (ej: +573001234567).' })
  phone?: string;

  /** Cargo o posición en la empresa */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  /** Tipo de documento de identidad colombiano */
  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  /**
   * Número de documento de identidad — se cifra con AES-256-GCM.
   * PII sensible — Ley 1581 habeas data. No se retorna en respuestas.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  documentNumber?: string;

  /** URL de imagen de perfil */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl debe ser una URL válida.' })
  @MaxLength(500)
  avatarUrl?: string;
}

/**
 * DTO para actualizacion parcial de un usuario.
 * El ADMIN puede cambiar status o role; el propio usuario puede actualizar su perfil.
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

  // ── Perfil personal (todos opcionales) ──────────────────────────────────────

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+\d{7,15}$/, { message: 'phone debe estar en formato E.164.' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl debe ser una URL válida.' })
  @MaxLength(500)
  avatarUrl?: string;
}

/**
 * Representacion publica de un usuario.
 * Excluye campos sensibles: passwordHash, mfaSecret, tokens, emailHash, documentNumber.
 * Nota: documentNumber NUNCA se expone — PII sensible bajo Ley 1581.
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

  // ── Perfil personal (desencriptado al retornar) ──────────────────────────────

  @ApiPropertyOptional({ nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  jobTitle: string | null;

  @ApiPropertyOptional({ enum: DocumentType, nullable: true })
  documentType: DocumentType | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl: string | null;
  // documentNumber: omitido intencionalmente — PII sensible bajo Ley 1581
}
