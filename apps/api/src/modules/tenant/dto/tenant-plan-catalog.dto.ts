import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePlanCatalogItemDto {
  @IsString()
  @Transform(trimString)
  @MaxLength(140)
  name: string;

  @IsString()
  @Transform(trimString)
  @MinLength(2)
  @MaxLength(100)
  technology: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(100000)
  downloadSpeedMbps: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(100000)
  uploadSpeedMbps: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  basePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  installationFee?: number;

  @IsOptional()
  @IsString()
  @IsIn(['NONE', 'ALWAYS', 'FIBER_DROP_THRESHOLD'])
  installationRule?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanCatalogItemDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(140)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(2)
  @MaxLength(100)
  technology?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(100000)
  downloadSpeedMbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(100000)
  uploadSpeedMbps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  basePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999)
  installationFee?: number;

  @IsOptional()
  @IsString()
  @IsIn(['NONE', 'ALWAYS', 'FIBER_DROP_THRESHOLD'])
  installationRule?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PlanCatalogItemResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsString()
  technology: string;

  @IsString()
  installationRule: string;

  @IsNumber({ maxDecimalPlaces: 0 })
  downloadSpeedMbps: number;

  @IsNumber({ maxDecimalPlaces: 0 })
  uploadSpeedMbps: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  basePrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  installationFee: number;

  validFrom: Date | null;
  validTo: Date | null;

  @IsBoolean()
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}
