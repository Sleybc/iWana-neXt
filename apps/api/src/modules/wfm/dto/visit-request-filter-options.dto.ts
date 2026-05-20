import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { z } from 'zod';

export const VISIT_REQUEST_MISSING_FILTER_VALUE = '__missing__';

export const VisitRequestFilterOptionsQuerySchema = z.object({
  municipality: z.string().max(120).optional(),
  includeScheduled: z.boolean().optional().default(false),
});

export type VisitRequestFilterOptionsQueryInput = z.infer<
  typeof VisitRequestFilterOptionsQuerySchema
>;

export type VisitRequestFilterOption = {
  value: string;
  label: string;
  count: number;
  municipality?: string;
};

export type VisitRequestFilterOptionsResponse = {
  municipalities: VisitRequestFilterOption[];
  sectors: VisitRequestFilterOption[];
};

export class VisitRequestFilterOptionsQueryDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipality?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeScheduled?: boolean;
}

export class VisitRequestFilterOptionDto {
  @ApiProperty({ example: 'El Colegio' })
  value: string;

  @ApiProperty({ example: 'El Colegio' })
  label: string;

  @ApiProperty({ example: 12 })
  count: number;

  @ApiPropertyOptional({ example: 'El Colegio' })
  municipality?: string;
}

export class VisitRequestFilterOptionsResponseDto {
  @ApiProperty({ type: [VisitRequestFilterOptionDto] })
  municipalities: VisitRequestFilterOptionDto[];

  @ApiProperty({ type: [VisitRequestFilterOptionDto] })
  sectors: VisitRequestFilterOptionDto[];
}
