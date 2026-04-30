import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CompanyType, TenantStatus } from '@iwana/shared';
import { CreateTenantSettingsDto } from './tenant-settings.dto';

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
  maxSubscribers?: number | null;

  /**
   * Configuracion inicial del tenant.
   * Ejemplo: { timezone: 'America/Bogota', currency: 'COP' }
   * Se valida en el boundary HTTP para impedir claves arbitrarias en settings.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTenantSettingsDto)
  settings?: CreateTenantSettingsDto;

  // ── Datos legales (opcionales) ────────────────────────────────────────────

  /** Razón social registrada ante la Cámara de Comercio */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  /** NIT sin dígito verificador — solo dígitos */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}$/, { message: 'NIT debe contener solo dígitos (máx. 10).' })
  nit?: string;

  /** Dígito verificador del NIT */
  @IsOptional()
  @IsString()
  @Matches(/^\d$/, { message: 'nitDv debe ser un único dígito.' })
  nitDv?: string;

  /** Tipo de empresa */
  @IsOptional()
  @IsEnum(CompanyType)
  companyType?: CompanyType;

  // ── Dirección (opcionales) ────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  /** ISO 3166-1 alpha-2 (ej: "CO") */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode debe ser un código ISO 3166-1 alpha-2 en mayúsculas.',
  })
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  /** Coordenadas GPS en formato "lat,lng" (ej: "4.6097,-74.0817") */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  coordinates?: string;

  // ── Contacto adicional (opcionales) ──────────────────────────────────────

  /** Teléfono principal — cualquier formato entre 7 y 50 caracteres */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  /** Sitio web corporativo */
  @IsOptional()
  @IsUrl({}, { message: 'website debe ser una URL válida.' })
  @MaxLength(255)
  website?: string;

  /** Código CIIU colombiano (ej: "6110") */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  economicSector?: string;
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
  maxSubscribers?: number | null;

  @IsOptional()
  settings?: Record<string, unknown>;

  // ── Datos legales (opcionales) ────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MaxLength(300)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}$/, { message: 'NIT debe contener solo dígitos (máx. 10).' })
  nit?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d$/, { message: 'nitDv debe ser un único dígito.' })
  nitDv?: string;

  @IsOptional()
  @IsEnum(CompanyType)
  companyType?: CompanyType;

  // ── Dirección (opcionales) ────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode debe ser un código ISO 3166-1 alpha-2 en mayúsculas.',
  })
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  coordinates?: string;

  // ── Contacto adicional (opcionales) ──────────────────────────────────────

  /** Teléfono principal — cualquier formato entre 7 y 50 caracteres */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'website debe ser una URL válida.' })
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  economicSector?: string;
}

/** Respuesta publica de un tenant — excluye campos internos del provisioning */
export class TenantResponseDto {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  status: TenantStatus;
  contactEmail: string;
  maxSubscribers: number | null;
  settings: Record<string, unknown>;
  // Datos legales
  legalName: string | null;
  nit: string | null;
  nitDv: string | null;
  companyType: CompanyType | null;
  // Dirección
  address: string | null;
  city: string | null;
  department: string | null;
  countryCode: string | null;
  postalCode: string | null;
  coordinates: string | null;
  // Contacto
  phone: string | null;
  website: string | null;
  economicSector: string | null;
  // Branding
  logoLightUrl: string | null;
  logoLightAssetId: string | null;
  logoDarkUrl: string | null;
  logoDarkAssetId: string | null;
  sealLightUrl: string | null;
  sealLightAssetId: string | null;
  sealDarkUrl: string | null;
  sealDarkAssetId: string | null;
  faviconLightUrl: string | null;
  faviconLightAssetId: string | null;
  faviconDarkUrl: string | null;
  faviconDarkAssetId: string | null;
  loginBackgroundLightUrl: string | null;
  loginBackgroundLightAssetId: string | null;
  loginBackgroundDarkUrl: string | null;
  loginBackgroundDarkAssetId: string | null;
  showTenantName: boolean;
  createdAt: Date;
  updatedAt: Date;
}
