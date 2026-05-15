import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { z } from 'zod';

// --- Zod schema ---

/** Schema Zod para actualizar contexto adicional de una solicitud de visita. SPEC-MOD09 §6.2 */
export const UpdateVisitRequestContextSchema = z.object({
  description: z.string().optional().nullable(),
  requestedWindowStartAt: z.string().datetime({ offset: true }).optional().nullable(),
  requestedWindowEndAt: z.string().datetime({ offset: true }).optional().nullable(),
  slaDueAt: z.string().datetime({ offset: true }).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  municipality: z.string().max(120).optional().nullable(),
  sector: z.string().max(120).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  expedienteId: z.string().uuid().optional().nullable(),
  subscriberId: z.string().uuid().optional().nullable(),
  ticketId: z.string().max(160).optional().nullable(),
  contractId: z.string().uuid().optional().nullable(),
});

export type UpdateVisitRequestContextInput = z.infer<typeof UpdateVisitRequestContextSchema>;

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO para actualizar contexto adicional de una solicitud de visita (status: NEEDS_CONTEXT → READY_TO_SCHEDULE). */
export class UpdateVisitRequestContextDto {
  @ApiPropertyOptional({ description: 'Detalle de la solicitud' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    example: '2026-06-01T09:00:00Z',
    description: 'Inicio de la ventana temporal solicitada (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  requestedWindowStartAt?: string | null;

  @ApiPropertyOptional({
    example: '2026-06-01T17:00:00Z',
    description: 'Fin de la ventana temporal solicitada (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  requestedWindowEndAt?: string | null;

  @ApiPropertyOptional({
    example: '2026-06-05T23:59:59Z',
    description: 'Fecha limite de atencion por SLA (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({ strict: false })
  slaDueAt?: string | null;

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

  @ApiPropertyOptional({ example: 4.711 })
  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @ApiPropertyOptional({ example: -74.0721 })
  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo CRM — expediente_records.id' })
  @IsOptional()
  @IsUUID()
  expedienteId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo suscriptor' })
  @IsOptional()
  @IsUUID()
  subscriberId?: string | null;

  @ApiPropertyOptional({ maxLength: 160, description: 'Vinculo ticket o referencia externa' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ticketId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo contrato' })
  @IsOptional()
  @IsUUID()
  contractId?: string | null;
}
