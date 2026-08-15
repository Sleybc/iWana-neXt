import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { CustomerSegment, DiscountType, PromotionScope } from '@iwana/shared';
import { IsCommercialDiscountValue } from '../utils/commercial-money';

export class CreatePromotionDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ maxLength: 50, description: 'Código único de la promoción por tenant' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: '15.00' })
  @IsString()
  @IsNotEmpty()
  @IsCommercialDiscountValue()
  discountValue: string;

  @ApiProperty({ enum: PromotionScope })
  @IsEnum(PromotionScope)
  appliesTo: PromotionScope;

  @ApiPropertyOptional({ description: 'UUID del ítem objetivo (si appliesTo=ITEM)' })
  @IsOptional()
  @IsUUID()
  targetItemId?: string;

  @ApiPropertyOptional({ description: 'UUID del bundle objetivo (si appliesTo=BUNDLE)' })
  @IsOptional()
  @IsUUID()
  targetBundleId?: string;

  @ApiPropertyOptional({ description: 'Segmentos de clientes a los que aplica (null = todos)' })
  @IsOptional()
  @IsArray()
  @IsEnum(CustomerSegment, { each: true })
  targetSegments?: CustomerSegment[];

  @ApiPropertyOptional({ description: 'Número máximo de usos (null = sin límite)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiProperty({ description: 'ISO 8601 inicio de vigencia' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ description: 'ISO 8601 fin de vigencia' })
  @IsDateString()
  validTo: string;
}

export class UpdatePromotionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}
