import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { z } from 'zod';
import { TechnicianAvailabilityType } from '@iwana/shared';

/** Schema Zod para crear disponibilidad/bloqueo de responsable operativo. */
export const CreateTechnicianAvailabilitySchema = z.object({
  userId: z.string().uuid(),
  type: z.nativeEnum(TechnicianAvailabilityType),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().max(160).optional().nullable(),
});

export type CreateTechnicianAvailabilityInput = z.infer<typeof CreateTechnicianAvailabilitySchema>;

/** DTO de query params para listar disponibilidad de responsables operativos. */
export class ListTechnicianAvailabilityQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtrar por usuario operativo con disponibilidad registrada',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00Z' })
  @IsOptional()
  @IsDateString({ strict: false })
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-07T23:59:59Z' })
  @IsOptional()
  @IsDateString({ strict: false })
  to?: string;

  @ApiPropertyOptional({ enum: TechnicianAvailabilityType })
  @IsOptional()
  @IsEnum(TechnicianAvailabilityType)
  type?: TechnicianAvailabilityType;

  @ApiPropertyOptional({ minimum: 1, example: 1, description: 'Número de página (≥ 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    example: 20,
    description: 'Tamaño de página (1–100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** DTO para registrar disponibilidad o bloqueo puntual de un responsable operativo. */
export class CreateTechnicianAvailabilityDto {
  @ApiProperty({ format: 'uuid', description: 'ID del usuario operativo' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    enum: TechnicianAvailabilityType,
    description: 'Tipo: AVAILABLE | BLOCKED | TIME_OFF',
  })
  @IsEnum(TechnicianAvailabilityType)
  type: TechnicianAvailabilityType;

  @ApiProperty({
    example: '2026-06-01T08:00:00Z',
    description: 'Inicio del bloqueo/disponibilidad',
  })
  @IsDateString({ strict: false })
  startsAt: string;

  @ApiProperty({ example: '2026-06-01T17:00:00Z', description: 'Fin del bloqueo/disponibilidad' })
  @IsDateString({ strict: false })
  endsAt: string;

  @ApiPropertyOptional({
    maxLength: 160,
    description: 'Motivo del bloqueo o nota de disponibilidad',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  reason?: string | null;
}
