import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { z } from 'zod';

/** Schema Zod para actualizar un evento de agenda (todos los campos son opcionales). */
export const UpdateScheduleEventSchema = z
  .object({
    title: z.string().min(1).max(160),
    description: z.string().nullable(),
    scheduledStartAt: z.string().datetime({ offset: true }),
    scheduledEndAt: z.string().datetime({ offset: true }),
    assignedUserId: z.string().uuid(),
    address: z.string().max(255).nullable(),
    municipality: z.string().max(120).nullable(),
    sector: z.string().max(120).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    expedienteId: z.string().uuid().nullable(),
    subscriberId: z.string().uuid().nullable(),
    ticketId: z.string().max(160).nullable(),
    contractId: z.string().uuid().nullable(),
  })
  .partial();

export type UpdateScheduleEventInput = z.infer<typeof UpdateScheduleEventSchema>;

/** DTO para actualizar campos editables de un evento de agenda. */
export class UpdateScheduleEventDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ example: '2026-06-01T09:00:00Z' })
  @IsOptional()
  @IsDateString({ strict: false })
  scheduledStartAt?: string;

  @ApiPropertyOptional({ example: '2026-06-01T11:00:00Z' })
  @IsOptional()
  @IsDateString({ strict: false })
  scheduledEndAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  expedienteId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subscriberId?: string | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ticketId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contractId?: string | null;
}
