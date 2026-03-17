import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimNullableString({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function trimUppercaseString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

class UpdateTenantSelfFeaturesDto {
  @IsOptional()
  @IsBoolean()
  mfa_required_all?: boolean;
}

export class UpdateTenantSelfProfileDto {
  @IsOptional()
  @Transform(trimString)
  @IsEmail({}, { message: 'contactEmail debe ser un correo electrónico válido.' })
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(300)
  legalName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @Matches(/^[0-9]{6,15}$/, {
    message: 'nit debe contener entre 6 y 15 dígitos numéricos.',
  })
  nit?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(100)
  department?: string | null;

  @IsOptional()
  @Transform(trimUppercaseString)
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode debe estar en formato ISO 3166-1 alpha-2.',
  })
  countryCode?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @Matches(/^\+\d{7,15}$/, {
    message: 'phone debe usar formato E.164 (ej: +573001234567).',
  })
  phone?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true },
    { message: 'website debe ser una URL válida e incluir el protocolo.' },
  )
  @MaxLength(255)
  website?: string | null;
}

/**
 * DTO self-service para actualizar branding del tenant autenticado.
 * Solo URLs HTTPS son aceptadas — previene mixed-content y XSS via data: URIs.
 * Todos los campos son opcionales para permitir actualizaciones parciales.
 */
export class UpdateTenantSelfBrandingDto {
  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'logoLightUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'logoLightUrl debe usar HTTPS.' })
  @MaxLength(500)
  logoLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'logoDarkUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'logoDarkUrl debe usar HTTPS.' })
  @MaxLength(500)
  logoDarkUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'sealLightUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'sealLightUrl debe usar HTTPS.' })
  @MaxLength(500)
  sealLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'sealDarkUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'sealDarkUrl debe usar HTTPS.' })
  @MaxLength(500)
  sealDarkUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  showTenantName?: boolean;
}

export class UpdateTenantSelfSettingsDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @Transform(trimUppercaseString)
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency debe estar en formato ISO 4217 (3 letras mayúsculas).',
  })
  currency?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @Transform(trimUppercaseString)
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country debe estar en formato ISO 3166-1 alpha-2.',
  })
  country?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTenantSelfFeaturesDto)
  features?: UpdateTenantSelfFeaturesDto;
}
