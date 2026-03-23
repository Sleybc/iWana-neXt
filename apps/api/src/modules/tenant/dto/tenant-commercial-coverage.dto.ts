import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CoverageCheckQueryDto {
  @IsString()
  @Transform(trimString)
  @MaxLength(300)
  address: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;
}

export class CreateCommercialNodeDto {
  @IsString()
  @Transform(trimString)
  @MaxLength(150)
  name: string;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCommercialNodeDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCoverageZoneDto {
  @IsString()
  @Transform(trimString)
  @MaxLength(150)
  name: string;

  @Type(() => Number)
  @IsLatitude()
  centerLatitude: number;

  @Type(() => Number)
  @IsLongitude()
  centerLongitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(300)
  radiusKm: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCoverageZoneDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  centerLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  centerLongitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(300)
  radiusKm?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CommercialNodeResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsNumber({ maxDecimalPlaces: 7 })
  latitude: number;

  @IsNumber({ maxDecimalPlaces: 7 })
  longitude: number;

  @IsBoolean()
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export class CoverageZoneResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsNumber({ maxDecimalPlaces: 7 })
  centerLatitude: number;

  @IsNumber({ maxDecimalPlaces: 7 })
  centerLongitude: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  radiusKm: number;

  @IsBoolean()
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export class CoverageCheckResultNodeDto {
  id: string;
  name: string;
  type: 'NODE' | 'ZONE';
  available: boolean;
}

export class CoverageCheckResponseDto {
  available: boolean;
  reason: string;

  @ValidateNested({ each: true })
  @Type(() => CoverageCheckResultNodeDto)
  matches: CoverageCheckResultNodeDto[];
}

export class CoverageAdminResponseDto {
  @ValidateNested({ each: true })
  @Type(() => CommercialNodeResponseDto)
  nodes: CommercialNodeResponseDto[];

  @ValidateNested({ each: true })
  @Type(() => CoverageZoneResponseDto)
  zones: CoverageZoneResponseDto[];
}
