import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TenantFeaturesDto {
  @IsOptional()
  @IsBoolean()
  billing?: boolean;

  @IsOptional()
  @IsBoolean()
  mfa_required_all?: boolean;
}

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency debe estar en formato ISO 4217 (3 letras mayúsculas).',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country debe estar en formato ISO 3166-1 alpha-2.',
  })
  country?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxSubscribers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  fiberInstallationThresholdMeters?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantFeaturesDto)
  features?: TenantFeaturesDto;
}

export class TenantSettingsResponseDto {
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  country: string;
  maxSubscribers: number;
  fiberInstallationThresholdMeters: number;
  features: {
    billing: boolean;
    mfa_required_all: boolean;
  };
}

/**
 * Schema de settings para crear un tenant.
 * Validado como DTO anidado dentro de CreateTenantDto.
 */
export class CreateTenantSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency debe estar en formato ISO 4217 (3 letras mayúsculas).',
  })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country debe estar en formato ISO 3166-1 alpha-2.',
  })
  country?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantFeaturesDto)
  features?: TenantFeaturesDto;
}
