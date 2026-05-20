import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { z } from 'zod';
import { TechnicianAvailabilityType } from '@iwana/shared';

/** Schema Zod para crear disponibilidad/bloqueo de tecnico. */
export const CreateTechnicianAvailabilitySchema = z.object({
  userId: z.string().uuid(),
  type: z.nativeEnum(TechnicianAvailabilityType),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().max(160).optional().nullable(),
});

export type CreateTechnicianAvailabilityInput = z.infer<typeof CreateTechnicianAvailabilitySchema>;

/** DTO de query params para listar disponibilidad de tecnicos. */
export class ListTechnicianAvailabilityQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por usuario tecnico/contratista' })
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
}

/** DTO para registrar disponibilidad o bloqueo puntual de un tecnico. */
export class CreateTechnicianAvailabilityDto {
  @ApiProperty({ format: 'uuid', description: 'ID del tecnico o contratista' })
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
