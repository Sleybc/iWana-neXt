import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { z } from 'zod';
import { WfmWorkType } from '@iwana/shared';

export const ScheduleRecommendationRequestSchema = z
  .object({
    workType: z.nativeEnum(WfmWorkType),
    durationMinutes: z
      .number()
      .int()
      .min(15)
      .max(12 * 60),
    windowStartAt: z.string().datetime({ offset: true }),
    windowEndAt: z.string().datetime({ offset: true }),
    candidateUserIds: z.array(z.string().uuid()).min(1).max(100),
    operatingSiteId: z.string().uuid().optional().nullable(),
    organizationSiteId: z.string().uuid().optional().nullable(),
    municipality: z.string().max(120).optional().nullable(),
    sector: z.string().max(120).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    maxResults: z.number().int().min(1).max(20).optional(),
  })
  .refine(
    (value) => new Date(value.windowEndAt).getTime() > new Date(value.windowStartAt).getTime(),
    {
      path: ['windowEndAt'],
      message: 'La ventana de busqueda debe terminar despues de iniciar.',
    },
  );

export type ScheduleRecommendationRequestInput = z.input<
  typeof ScheduleRecommendationRequestSchema
>;

export type ScheduleRecommendationRequest = z.output<typeof ScheduleRecommendationRequestSchema>;

export class ScheduleRecommendationRequestDto {
  @ApiProperty({ enum: WfmWorkType })
  @IsEnum(WfmWorkType)
  workType: WfmWorkType;

  @ApiProperty({ example: 120, minimum: 15, maximum: 720 })
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(720)
  durationMinutes: number;

  @ApiProperty({ example: '2026-06-01T12:00:00Z' })
  @IsDateString({ strict: false })
  windowStartAt: string;

  @ApiProperty({ example: '2026-06-01T23:00:00Z' })
  @IsDateString({ strict: false })
  windowEndAt: string;

  @ApiProperty({ type: [String], description: 'Tecnicos o contratistas elegibles desde Users' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  candidateUserIds: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Sede operativa WFM para la recomendacion' })
  @IsOptional()
  @IsUUID()
  operatingSiteId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Sede Organization a resolver a una sede operativa WFM efectiva',
  })
  @IsOptional()
  @IsUUID()
  organizationSiteId?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  municipality?: string | null;

  @ApiPropertyOptional({ maxLength: 120, description: 'Sector, barrio o vereda operativa' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sector?: string | null;

  @ApiPropertyOptional({ example: 4.711 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({ example: -74.0721 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxResults?: number;
}
