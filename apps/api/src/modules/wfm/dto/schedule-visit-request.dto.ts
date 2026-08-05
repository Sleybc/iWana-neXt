import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { z } from 'zod';

/**
 * Decisión explícita al agotar los 3 intentos imputables al cliente (ADR-077 D4).
 * Sin este campo, scheduleVisitRequest responde 400 accionable.
 */
export const AttemptDecision = z.enum(['FORCE_RESCHEDULE', 'CLOSE_CASE']);
export type AttemptDecisionType = z.infer<typeof AttemptDecision>;

// --- Zod schema ---

/** Schema Zod para agendar una solicitud de visita (status: READY_TO_SCHEDULE → SCHEDULED). SPEC-MOD09 §6.2 */
export const ScheduleVisitRequestSchema = z
  .object({
    scheduledStartAt: z.string().datetime({ offset: true }),
    scheduledEndAt: z.string().datetime({ offset: true }),
    assignedUserId: z.string().uuid(),
    operatingSiteId: z.string().uuid().optional().nullable(),
    organizationSiteId: z.string().uuid().optional().nullable(),
    createWorkOrder: z.boolean().optional(),
    workOrderSummary: z.string().trim().max(160).optional(),
    workOrderNotes: z.string().trim().max(4000).nullable().optional(),
    attemptDecision: AttemptDecision.optional(),
    /** Obligatorio con attemptDecision CLOSE_CASE (spec E5 CA3). */
    closeReason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.attemptDecision === 'CLOSE_CASE' && !data.closeReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closeReason'],
        message:
          'Al cerrar el caso tras el límite de intentos debes indicar closeReason (motivo del cierre).',
      });
    }
  });

export type ScheduleVisitRequestInput = z.infer<typeof ScheduleVisitRequestSchema>;

// --- DTO class-validator para ValidationPipe + OpenAPI ---

/** DTO para agendar una solicitud de visita. Genera ScheduleEvent + WorkOrder. */
export class ScheduleVisitRequestDto {
  @ApiProperty({ example: '2026-06-01T09:00:00Z', description: 'Inicio programado (ISO 8601)' })
  @IsDateString({ strict: false })
  @IsNotEmpty()
  scheduledStartAt: string;

  @ApiProperty({ example: '2026-06-01T11:00:00Z', description: 'Fin programado (ISO 8601)' })
  @IsDateString({ strict: false })
  @IsNotEmpty()
  scheduledEndAt: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
    description: 'Tecnico asignado',
  })
  @IsUUID()
  assignedUserId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Sede operativa WFM seleccionada' })
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

  @ApiPropertyOptional({
    example: true,
    description: 'Si es false, agenda solo el evento sin crear Work Order.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  createWorkOrder?: boolean;

  @ApiPropertyOptional({
    example: 'Instalacion prioritaria barrio centro',
    description: 'Resumen manual opcional para la Work Order.',
    maxLength: 160,
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  workOrderSummary?: string;

  @ApiPropertyOptional({
    example: 'Coordinar acceso con porteria antes de las 10:00.',
    description: 'Notas operativas opcionales para la Work Order.',
    nullable: true,
    maxLength: 4000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  workOrderNotes?: string | null;

  @ApiPropertyOptional({
    enum: ['FORCE_RESCHEDULE', 'CLOSE_CASE'],
    description:
      'Obligatorio cuando retryCount >= 3. FORCE_RESCHEDULE fuerza el agendamiento; CLOSE_CASE cierra el caso sin agendar (ADR-077 D4).',
  })
  @IsOptional()
  @IsEnum(['FORCE_RESCHEDULE', 'CLOSE_CASE'] as const)
  attemptDecision?: AttemptDecisionType;

  @ApiPropertyOptional({
    example: 'El cliente desistió de la instalación tras tres intentos fallidos.',
    description:
      'Motivo del cierre. Obligatorio cuando attemptDecision es CLOSE_CASE (spec visita no realizada E5).',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  closeReason?: string;
}
