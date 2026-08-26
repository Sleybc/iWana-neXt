import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, IsInt, IsOptional, Max, Min } from 'class-validator';
import { z } from 'zod';
import type { ListMeta } from '@iwana/shared';
import {
  TicketFieldDecision,
  SlaBreachStatus,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
} from '@iwana/shared';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const CreateTicketSchema = z.object({
  type: z.nativeEnum(TicketType),
  priority: z.nativeEnum(TicketPriority).optional().default(TicketPriority.NORMAL),
  source: z.nativeEnum(TicketSource).optional().default(TicketSource.MANUAL),
  subject: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  requesterType: z.nativeEnum(TicketRequesterType),
  requesterRefId: z.string().max(160).optional().nullable(),
  subjectType: z.nativeEnum(TicketSubjectType).optional().nullable(),
  subjectRefId: z.string().max(160).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  queueName: z.nativeEnum(TicketQueue).optional().nullable(),
  fieldDecision: z
    .nativeEnum(TicketFieldDecision)
    .optional()
    .default(TicketFieldDecision.NOT_REQUIRED),
  slaPolicyId: z.string().uuid().optional().nullable(),
});

export const UpdateTicketSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  priority: z.nativeEnum(TicketPriority).optional(),
  source: z.nativeEnum(TicketSource).optional(),
  requesterRefId: z.string().max(160).optional().nullable(),
  subjectType: z.nativeEnum(TicketSubjectType).optional().nullable(),
  subjectRefId: z.string().max(160).optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  queueName: z.nativeEnum(TicketQueue).optional().nullable(),
  fieldDecision: z.nativeEnum(TicketFieldDecision).optional(),
});

export const TransitionTicketSchema = z
  .object({
    status: z.nativeEnum(TicketStatus),
    notes: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      // RESOLVED requiere notes no vacías
      if (data.status === TicketStatus.RESOLVED) {
        return typeof data.notes === 'string' && data.notes.trim().length > 0;
      }
      return true;
    },
    { message: 'El estado RESOLVED requiere notes con contenido', path: ['notes'] },
  );

export const AddCommentSchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().optional().default(false),
});

export const RequestFieldServiceSchema = z.object({
  notes: z.string().optional().nullable(),
});

export const CreateSlaPolicySchema = z.object({
  name: z.string().min(1).max(100),
  appliesToType: z.string().max(50).optional().nullable(),
  appliesToPriority: z.string().max(50).optional().nullable(),
  firstResponseMinutes: z.number().int().positive(),
  resolutionMinutes: z.number().int().positive(),
  isActive: z.boolean().optional().default(true),
});

export const AssignTicketSchema = z
  .object({
    assignedUserId: z.string().uuid().optional().nullable(),
    queueName: z.nativeEnum(TicketQueue).optional().nullable(),
  })
  .refine(
    (value) => value.assignedUserId !== undefined || value.queueName !== undefined,
    'Debes enviar assignedUserId o queueName',
  );

export const LinkWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  notes: z.string().optional().nullable(),
});

export const ListTicketsQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  type: z.nativeEnum(TicketType).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  slaBreachStatus: z.nativeEnum(SlaBreachStatus).optional(),
  queueName: z.nativeEnum(TicketQueue).optional(),
  requesterRefId: z.string().max(160).optional(),
  assignedUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type CreateTicketInput = z.input<typeof CreateTicketSchema>;
export type UpdateTicketInput = z.input<typeof UpdateTicketSchema>;
export type TransitionTicketInput = z.input<typeof TransitionTicketSchema>;
export type AddCommentInput = z.input<typeof AddCommentSchema>;
export type RequestFieldServiceInput = z.input<typeof RequestFieldServiceSchema>;
export type CreateSlaPolicyInput = z.input<typeof CreateSlaPolicySchema>;
export type AssignTicketInput = z.input<typeof AssignTicketSchema>;
export type LinkWorkOrderInput = z.input<typeof LinkWorkOrderSchema>;
export type ListTicketsQueryInput = z.input<typeof ListTicketsQuerySchema>;

// ─── DTOs para OpenAPI y typing — validación real via ZodValidationPipe ──────

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con CreateTicketSchema.
 */
export class CreateTicketDto {
  @ApiProperty({ enum: TicketType })
  @Allow()
  type!: TicketType;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.NORMAL })
  @Allow()
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: TicketSource, default: TicketSource.MANUAL })
  @Allow()
  source?: TicketSource;

  @ApiProperty({ example: 'No hay conectividad en zona norte', maxLength: 200 })
  @Allow()
  subject!: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiProperty({ enum: TicketRequesterType })
  @Allow()
  requesterType!: TicketRequesterType;

  @ApiPropertyOptional({ maxLength: 160 })
  @Allow()
  requesterRefId?: string | null;

  @ApiPropertyOptional({ enum: TicketSubjectType })
  @Allow()
  subjectType?: TicketSubjectType | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @Allow()
  subjectRefId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ enum: TicketQueue })
  @Allow()
  queueName?: TicketQueue | null;

  @ApiPropertyOptional({ enum: TicketFieldDecision, default: TicketFieldDecision.NOT_REQUIRED })
  @Allow()
  fieldDecision?: TicketFieldDecision;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  slaPolicyId?: string | null;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con UpdateTicketSchema.
 */
export class UpdateTicketDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @Allow()
  subject?: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiPropertyOptional({ enum: TicketPriority })
  @Allow()
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: TicketSource })
  @Allow()
  source?: TicketSource;

  @ApiPropertyOptional({ maxLength: 160 })
  @Allow()
  requesterRefId?: string | null;

  @ApiPropertyOptional({ enum: TicketSubjectType })
  @Allow()
  subjectType?: TicketSubjectType | null;

  @ApiPropertyOptional({ maxLength: 160 })
  @Allow()
  subjectRefId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ enum: TicketQueue })
  @Allow()
  queueName?: TicketQueue | null;

  @ApiPropertyOptional({ enum: TicketFieldDecision })
  @Allow()
  fieldDecision?: TicketFieldDecision;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con TransitionTicketSchema.
 */
export class TransitionTicketDto {
  @ApiProperty({ enum: TicketStatus })
  @Allow()
  status!: TicketStatus;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con AddCommentSchema.
 */
export class AddCommentDto {
  @ApiProperty({ example: 'Se reiniciaron los equipos de la zona.' })
  @Allow()
  body!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Comentario interno — no visible al solicitante',
  })
  @Allow()
  isInternal?: boolean;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con RequestFieldServiceSchema.
 */
export class RequestFieldServiceDto {
  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con CreateSlaPolicySchema.
 */
export class CreateSlaPolicyDto {
  @ApiProperty({ maxLength: 100 })
  @Allow()
  name!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @Allow()
  appliesToType?: string | null;

  @ApiPropertyOptional({ maxLength: 50 })
  @Allow()
  appliesToPriority?: string | null;

  @ApiProperty({ example: 60, description: 'Minutos para primera respuesta' })
  @Allow()
  firstResponseMinutes!: number;

  @ApiProperty({ example: 480, description: 'Minutos para resolucion' })
  @Allow()
  resolutionMinutes!: number;

  @ApiPropertyOptional({ default: true })
  @Allow()
  isActive?: boolean;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con AssignTicketSchema.
 */
export class AssignTicketDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ enum: TicketQueue })
  @Allow()
  queueName?: TicketQueue | null;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con LinkWorkOrderSchema.
 */
export class LinkWorkOrderDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  workOrderId!: string;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

/**
 * DTO clase para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodValidationPipe con ListTicketsQuerySchema.
 */
export class ListTicketsQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @Allow()
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketType })
  @Allow()
  type?: TicketType;

  @ApiPropertyOptional({ enum: TicketPriority })
  @Allow()
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: SlaBreachStatus })
  @Allow()
  slaBreachStatus?: SlaBreachStatus;

  @ApiPropertyOptional({ enum: TicketQueue })
  @Allow()
  queueName?: TicketQueue;

  @ApiPropertyOptional({ maxLength: 160 })
  @Allow()
  requesterRefId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  assignedUserId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Campo por el cual ordenar (ADR-065 Ola 1). Vacío = orden por defecto.',
  })
  @Allow()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Dirección de ordenamiento' })
  @Allow()
  sortDir?: 'asc' | 'desc';
}

export interface ListTicketsResponseDto {
  data: unknown[];
  /** @deprecated Usar meta.total */
  total: number;
  /** @deprecated Usar meta.page */
  page: number;
  /** @deprecated Usar meta.limit */
  limit: number;
  meta: ListMeta;
}

export const FindOrCreateInstallationTicketSchema = z.object({
  expedienteId: z.string().uuid({ message: 'expedienteId debe ser UUID válido' }),
  expedienteFullName: z.string().min(1).max(200),
});

export type FindOrCreateInstallationTicketDto = z.infer<
  typeof FindOrCreateInstallationTicketSchema
>;
