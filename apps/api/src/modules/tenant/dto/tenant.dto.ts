import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { TenantStatus } from '@iwana/shared';

/**
 * DTO para crear un nuevo tenant (ISP).
 *
 * Solo SYSTEM_ADMIN puede crear tenants.
 * El schemaName se deriva automaticamente del slug en TenantService
 * — no se acepta del cliente para evitar injection de nombres arbitrarios.
 */
export class CreateTenantDto {
  @IsString()
  @MaxLength(255)
  name: string;

  /**
   * Identificador unico del tenant.
   * Solo letras minusculas, numeros y guiones. Longitud maxima 63 - 7 = 56
   * (se le antepone "tenant_" para formar el schema_name, max 63 chars PostgreSQL).
   */
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,54}$/, {
    message:
      'slug debe comenzar con letra minuscula y contener solo letras minusculas, numeros y guiones. Maximo 55 caracteres.',
  })
  slug: string;

  @IsEmail()
  @MaxLength(255)
  contactEmail: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxSubscribers?: number;

  /**
   * Configuracion inicial del tenant.
   * Ejemplo: { timezone: 'America/Bogota', currency: 'COP' }
   */
  @IsOptional()
  settings?: Record<string, unknown>;
}

/**
 * DTO para actualizar datos de un tenant existente.
 * Todos los campos son opcionales — operacion PATCH parcial.
 * slug y schemaName NO son modificables post-creacion (inmutable).
 */
export class UpdateTenantDto {
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;

  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  contactEmail?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxSubscribers?: number;

  @IsOptional()
  settings?: Record<string, unknown>;
}

/** Respuesta publica de un tenant — excluye campos internos del provisioning */
export class TenantResponseDto {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: TenantStatus;
  contactEmail: string;
  maxSubscribers: number;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
