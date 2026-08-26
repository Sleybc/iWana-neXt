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
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiSchema,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { DocumentType, TENANT_ASSIGNABLE_ROLES, UserRole, UserStatus } from '@iwana/shared';
import { ListMetaDto } from '../../../common/pagination';
import {
  USER_FIELD_MAX,
  USER_PASSWORD_MIN,
  USER_PHONE_E164_PATTERN,
} from './user-field-constraints';

/**
 * DTO para crear un usuario dentro del tenant.
 *
 * Si se omite `password`, se genera una temporal y se activa `passwordResetRequired`.
 * La operacion requiere `Idempotency-Key` en el header para prevenir duplicados.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (POST /api/v1/users)
 *
 * Contrato canónico de perfil: UpdateUserDto / UpdateProfileDto se derivan con
 * PickType / PartialType / IntersectionType (H-10).
 */
export class CreateUserDto {
  @ApiProperty({ example: 'usuario@ejemplo.com', description: 'Email del usuario' })
  @IsEmail()
  @MaxLength(USER_FIELD_MAX.email)
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
    minLength: USER_PASSWORD_MIN,
  })
  @IsOptional()
  @IsString()
  @MinLength(USER_PASSWORD_MIN)
  @MaxLength(USER_FIELD_MAX.password)
  password?: string;

  // ── Perfil personal (todos opcionales) ──────────────────────────────────────

  /** Nombres del usuario en texto plano */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_MAX.firstName)
  firstName?: string;

  /** Apellidos del usuario en texto plano */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_MAX.lastName)
  lastName?: string;

  /** Teléfono en formato E.164 (ej: "+573001234567") */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_MAX.phone)
  @Matches(USER_PHONE_E164_PATTERN, {
    message: 'phone debe estar en formato E.164 (ej: +573001234567).',
  })
  phone?: string;

  /** Cargo o posición en la empresa */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_MAX.jobTitle)
  jobTitle?: string;

  /** Tipo de documento de identidad colombiano */
  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  /**
   * Número de documento de identidad en texto plano.
   * PII sensible — Ley 1581 habeas data.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(USER_FIELD_MAX.documentNumber)
  documentNumber?: string;

  /** URL de imagen de perfil */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'avatarUrl debe ser una URL válida.' })
  @MaxLength(USER_FIELD_MAX.avatarUrl)
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

const USER_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'jobTitle',
  'documentType',
  'documentNumber',
  'avatarUrl',
] as const;

const USER_UPDATE_SHARED_FIELDS = [
  'role',
  ...USER_PROFILE_FIELDS,
  'mfaRequired',
  'isOperationalResource',
] as const;

/** Campos de estado solo aplicables en actualización administrativa. */
class UpdateUserStatusDto {
  @ApiPropertyOptional({ enum: UserStatus, description: 'Nuevo estado del usuario' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

/**
 * DTO para actualizacion parcial de un usuario.
 * El ADMIN puede cambiar status o role; el propio usuario puede actualizar su perfil.
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (PATCH /api/v1/users/:id)
 */
export class UpdateUserDto extends IntersectionType(
  UpdateUserStatusDto,
  PartialType(PickType(CreateUserDto, USER_UPDATE_SHARED_FIELDS)),
) {}

export class ChangeUserLoginEmailDto {
  @ApiProperty({ example: 'nuevo.acceso@empresa.com', description: 'Nuevo email de acceso' })
  @IsEmail()
  @MaxLength(USER_FIELD_MAX.email)
  email: string;

  @ApiProperty({
    minLength: USER_PASSWORD_MIN,
    description: 'Contraseña actual para confirmar el cambio',
  })
  @IsString()
  @MinLength(USER_PASSWORD_MIN)
  @MaxLength(USER_FIELD_MAX.password)
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
  @MaxLength(USER_FIELD_MAX.email)
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
    minLength: USER_PASSWORD_MIN,
  })
  @IsOptional()
  @IsString()
  @MinLength(USER_PASSWORD_MIN)
  @MaxLength(USER_FIELD_MAX.password)
  password?: string;
}

/**
 * Subconjunto de perfil propio (PATCH /users/me).
 * Derivado del contrato canónico CreateUserDto — sin role/status/mfa.
 */
export class UpdateProfileDto extends PartialType(PickType(CreateUserDto, USER_PROFILE_FIELDS)) {}

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

  /**
   * ¿Es el administrador principal designado de la empresa? (ADR-063)
   *
   * Solo se puebla en las rutas de lectura (`findAll` / `findOne`), que son las
   * que resuelven la designación contra `public.tenants`. En las respuestas de
   * escritura llega `undefined`: ausencia de dato, no un `false` que la UI
   * pudiera confundir con «no lo es».
   */
  @ApiPropertyOptional({ description: 'Administrador principal designado de la empresa' })
  isPrincipalAdmin?: boolean;
}

/** Forma interna paginada del listado de usuarios para OpenAPI. */
export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({ type: ListMetaDto })
  meta: ListMetaDto;
}

/** Envelope HTTP estándar que conserva el doble nivel de `data` del endpoint. */
export class UsersListEnvelopeDto {
  @ApiProperty({ type: UserListResponseDto })
  data: UserListResponseDto;
}
