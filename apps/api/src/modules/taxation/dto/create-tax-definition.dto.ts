import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { z } from 'zod';
import { JurisdictionLevel, TaxCategory, TaxContext, TaxTreatment } from '@iwana/shared';

/** Zod schema de validación en boundary de servicio (defensa en profundidad). */
export const CreateTaxDefinitionSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Z0-9_]+$/, 'Solo mayúsculas, dígitos y guion bajo'),
  name: z.string().min(1).max(120),
  category: z.nativeEnum(TaxCategory),
  jurisdictionLevel: z.nativeEnum(JurisdictionLevel),
  municipalityCode: z.string().max(8).optional().nullable(),
  baseRate: z.number().min(0).max(999.9999).optional().nullable(),
  treatment: z.nativeEnum(TaxTreatment),
  context: z.nativeEnum(TaxContext),
  isActive: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateTaxDefinitionInput = z.infer<typeof CreateTaxDefinitionSchema>;

/** DTO class-validator para ValidationPipe + OpenAPI. */
export class CreateTaxDefinitionDto {
  @ApiProperty({ example: 'IVA_19', description: 'Código único en mayúsculas, dígitos y _' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 32)
  code: string;

  @ApiProperty({ example: 'IVA tarifa general 19%' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name: string;

  @ApiProperty({ enum: TaxCategory })
  @IsEnum(TaxCategory)
  category: TaxCategory;

  @ApiProperty({ enum: JurisdictionLevel })
  @IsEnum(JurisdictionLevel)
  jurisdictionLevel: JurisdictionLevel;

  @ApiPropertyOptional({ example: '11001' })
  @IsOptional()
  @IsString()
  @Length(1, 8)
  municipalityCode?: string | null;

  @ApiPropertyOptional({ example: 19.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999.9999)
  baseRate?: number | null;

  @ApiProperty({ enum: TaxTreatment })
  @IsEnum(TaxTreatment)
  treatment: TaxTreatment;

  @ApiProperty({ enum: TaxContext })
  @IsEnum(TaxContext)
  context: TaxContext;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}
