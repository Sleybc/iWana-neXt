import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  IsUUID,
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

@ValidatorConstraint({ name: 'brandingSourceXor', async: false })
class BrandingSourceXorConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpdateTenantSelfBrandingDto;

    return !this.getConflictingPair(dto);
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as UpdateTenantSelfBrandingDto;
    const conflictingPair = this.getConflictingPair(dto);

    if (!conflictingPair) {
      return 'No se puede enviar simultáneamente URL y assetId para el mismo slot de branding.';
    }

    return `No se puede enviar simultáneamente ${conflictingPair[0]} y ${conflictingPair[1]}.`;
  }

  private getConflictingPair(dto: UpdateTenantSelfBrandingDto): [string, string] | null {
    const pairs: Array<[keyof UpdateTenantSelfBrandingDto, keyof UpdateTenantSelfBrandingDto]> = [
      ['logoLightUrl', 'logoLightAssetId'],
      ['logoDarkUrl', 'logoDarkAssetId'],
      ['sealLightUrl', 'sealLightAssetId'],
      ['sealDarkUrl', 'sealDarkAssetId'],
      ['faviconLightUrl', 'faviconLightAssetId'],
      ['faviconDarkUrl', 'faviconDarkAssetId'],
      ['loginBackgroundLightUrl', 'loginBackgroundLightAssetId'],
      ['loginBackgroundDarkUrl', 'loginBackgroundDarkAssetId'],
    ];

    for (const [urlKey, assetKey] of pairs) {
      if (
        this.isExplicitBrandingValue(dto[urlKey]) &&
        this.isExplicitBrandingValue(dto[assetKey])
      ) {
        return [urlKey, assetKey];
      }
    }

    return null;
  }

  private isExplicitBrandingValue(value: unknown): boolean {
    return value !== undefined && value !== null;
  }
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
  @Matches(/^[0-9]{1}$/, {
    message: 'nitDv debe ser un único dígito numérico.',
  })
  nitDv?: string | null;

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
  @MaxLength(20, { message: 'phone no puede exceder20 caracteres.' })
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
  @Validate(BrandingSourceXorConstraint)
  private readonly _brandingSourceXor?: true;

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
  @IsUUID('4', { message: 'logoLightAssetId debe ser un UUID válido.' })
  logoLightAssetId?: string | null;

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
  @IsUUID('4', { message: 'logoDarkAssetId debe ser un UUID válido.' })
  logoDarkAssetId?: string | null;

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
  @IsUUID('4', { message: 'sealLightAssetId debe ser un UUID válido.' })
  sealLightAssetId?: string | null;

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
  @Transform(trimNullableString)
  @IsUUID('4', { message: 'sealDarkAssetId debe ser un UUID válido.' })
  sealDarkAssetId?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'faviconLightUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'faviconLightUrl debe usar HTTPS.' })
  @MaxLength(500)
  faviconLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUUID('4', { message: 'faviconLightAssetId debe ser un UUID válido.' })
  faviconLightAssetId?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'faviconDarkUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'faviconDarkUrl debe usar HTTPS.' })
  @MaxLength(500)
  faviconDarkUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUUID('4', { message: 'faviconDarkAssetId debe ser un UUID válido.' })
  faviconDarkAssetId?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'loginBackgroundLightUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'loginBackgroundLightUrl debe usar HTTPS.' })
  @MaxLength(500)
  loginBackgroundLightUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUUID('4', { message: 'loginBackgroundLightAssetId debe ser un UUID válido.' })
  loginBackgroundLightAssetId?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUrl(
    { require_protocol: true, require_tld: true },
    { message: 'loginBackgroundDarkUrl debe ser una URL válida.' },
  )
  @Matches(/^https:\/\//, { message: 'loginBackgroundDarkUrl debe usar HTTPS.' })
  @MaxLength(500)
  loginBackgroundDarkUrl?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsUUID('4', { message: 'loginBackgroundDarkAssetId debe ser un UUID válido.' })
  loginBackgroundDarkAssetId?: string | null;

  @IsOptional()
  @IsBoolean()
  showTenantName?: boolean;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MinLength(2, { message: 'brandingProductName debe tener al menos 2 caracteres.' })
  @MaxLength(120, { message: 'brandingProductName no puede exceder 120 caracteres.' })
  brandingProductName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MinLength(2, { message: 'brandingSurfaceName debe tener al menos 2 caracteres.' })
  @MaxLength(120, { message: 'brandingSurfaceName no puede exceder 120 caracteres.' })
  brandingSurfaceName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MinLength(4, { message: 'brandingMetadataTitle debe tener al menos 4 caracteres.' })
  @MaxLength(180, { message: 'brandingMetadataTitle no puede exceder 180 caracteres.' })
  brandingMetadataTitle?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MinLength(12, { message: 'brandingMetadataDescription debe tener al menos 12 caracteres.' })
  @MaxLength(300, { message: 'brandingMetadataDescription no puede exceder 300 caracteres.' })
  brandingMetadataDescription?: string | null;
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
