import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdditionalProductCategory } from '@iwana/shared';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdditionalProductDto {
  @IsString()
  @Transform(trimString)
  @MaxLength(100)
  name: string;

  @IsEnum(AdditionalProductCategory)
  category: AdditionalProductCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdditionalProductDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(AdditionalProductCategory)
  category?: AdditionalProductCategory;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdditionalProductResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsEnum(AdditionalProductCategory)
  category: AdditionalProductCategory;

  @IsNumber()
  sortOrder: number;

  @IsBoolean()
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}
