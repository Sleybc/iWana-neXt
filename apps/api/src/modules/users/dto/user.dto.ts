import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { DocumentType, TENANT_ASSIGNABLE_ROLES, UserRole, UserStatus } from '@iwana/shared';

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

  /**
   * Rol del usuario dentro del tenant.
   *
   * Los roles de plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) no son asignables
   * desde aqui: siguen siendo miembros de `UserRole` por compatibilidad, pero
   * `TENANT_ASSIGNABLE_ROLES` es la frontera efectiva (H-01).
   */
  @ApiProperty({ enum: TENANT_ASSIGNABLE_ROLES, description: 'Rol del usuario en el tenant' })
  @IsIn(TENANT_ASSIGNABLE_ROLES, {
    message: 'El rol indicado no puede asignarse a un usuario del tenant.',
  })
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

  /** Nombres del usuario en texto plano */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  /** Apellidos del usuario en texto plano */
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
   * Número de documento de identidad en texto plano.
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

  /** Si true, el usuario deberá configurar MFA en su primer ingreso. Default false. */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Si está activo, la persona aparece en despacho operativo diario, capacidad y recomendaciones.',
  })
  @IsOptional()
  @IsBoolean()
  isOperationalResource?: boolean;
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

  /** Nuevo rol del usuario. Los roles de plataforma no son asignables (H-01). */
  @ApiPropertyOptional({ enum: TENANT_ASSIGNABLE_ROLES, description: 'Nuevo rol del usuario' })
  @IsOptional()
  @IsIn(TENANT_ASSIGNABLE_ROLES, {
    message: 'El rol indicado no puede asignarse a un usuario del tenant.',
  })
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

  /** Cambia si se requiere MFA para este usuario. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @ApiPropertyOptional({
    description:
      'Controla si la persona participa en despacho operativo, capacidad visible y recomendaciones.',
  })
  @IsOptional()
  @IsBoolean()
  isOperationalResource?: boolean;
}

export class ChangeUserLoginEmailDto {
  @ApiProperty({ example: 'nuevo.acceso@empresa.com', description: 'Nuevo email de acceso' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 10, description: 'Contraseña actual para confirmar el cambio' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  currentPassword: string;

  @ApiPropertyOptional({
    description:
      'Si el usuario es el administrador principal, sincroniza también el email de contacto del tenant.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  syncCompanyContactEmail?: boolean;
}

export class AdminChangeUserLoginEmailDto {
  @ApiProperty({ example: 'nuevo.acceso@empresa.com', description: 'Nuevo email de acceso' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({
    description:
      'Si el usuario objetivo es el administrador principal, sincroniza también el email de contacto del tenant.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  syncCompanyContactEmail?: boolean;
}

@ApiSchema({ name: 'UsersResetPasswordDto' })
export class ResetPasswordDto {
  @ApiPropertyOptional({
    description: 'Password nuevo. Si se omite, el backend genera uno temporal.',
    minLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password?: string;
}

export class UpdateProfileDto {
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
 * Excluye campos sensibles: passwordHash, mfaSecret, tokens y emailHash.
 * Nota: documentNumber se expone de forma controlada en este DTO para casos de
 * gestion interna del tenant y perfil propio autenticado.
 */
export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Email de acceso del usuario' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  mfaEnabled: boolean;

  @ApiProperty()
  mfaRequired: boolean;

  @ApiProperty({
    description:
      'Indica si la persona participa en despacho operativo diario, capacidad y recomendaciones.',
  })
  isOperationalResource: boolean;

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

  // ── Perfil personal ──────────────────────────────────────────────────────────

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

  @ApiPropertyOptional({ nullable: true })
  documentNumber: string | null;
}
