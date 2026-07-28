import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { z } from 'zod';
import type { ListMeta } from '@iwana/shared';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskType,
} from '@iwana/shared';
import { safeTextField } from './execution-orders.dto';

export const CreateTaskSchema = z
  .object({
    type: z.nativeEnum(TaskType),
    priority: z.nativeEnum(TaskPriority).default(TaskPriority.NORMAL),
    title: z.string().trim().min(3).max(200),
    description: safeTextField(4000).optional().nullable(),
    originContext: z.nativeEnum(TaskOriginContext),
    originRefId: z.string().trim().max(160).optional().nullable(),
    ticketId: z.string().trim().max(160).optional().nullable(),
    responsibleType: z.nativeEnum(TaskResponsibleType),
    responsibleRefId: z.string().trim().min(1).max(160),
    recipientType: z.nativeEnum(TaskRecipientType),
    recipientRefId: z.string().trim().max(160).optional().nullable(),
    recipientLabel: z.string().trim().max(160).optional().nullable(),
    queueName: z.string().trim().max(80).optional().nullable(),
    executionMode: z.nativeEnum(TaskExecutionMode),
    dueAt: z.string().datetime().optional().nullable(),
    scheduledRequired: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.executionMode === TaskExecutionMode.DUE_DATE && !value.dueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAt'],
        message:
          'La fecha objetivo es obligatoria cuando el modo de ejecución es con fecha límite.',
      });
    }

    if (
      [TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE].includes(
        value.executionMode,
      ) &&
      !value.scheduledRequired
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledRequired'],
        message: 'Las tareas programadas o de campo deben marcarse como pendientes de agenda.',
      });
    }

    if (value.recipientType === TaskRecipientType.INTERNAL_USER && !value.recipientRefId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientRefId'],
        message: 'Selecciona el usuario destinatario.',
      });
    }

    if (
      value.recipientType === TaskRecipientType.INTERNAL_AREA &&
      !value.recipientRefId &&
      !value.recipientLabel
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientRefId'],
        message: 'Selecciona o etiqueta el área destinataria.',
      });
    }

    if (
      ![TaskRecipientType.INTERNAL_USER, TaskRecipientType.INTERNAL_AREA].includes(
        value.recipientType,
      ) &&
      !value.recipientLabel &&
      !value.recipientRefId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientLabel'],
        message: 'Identifica el destinatario externo o cliente de la tarea.',
      });
    }
  });

export type CreateTaskInput = z.input<typeof CreateTaskSchema>;

export class CreateTaskDto {
  @ApiProperty({ enum: TaskType })
  @Allow()
  type!: TaskType;

  @ApiPropertyOptional({ enum: TaskPriority })
  @Allow()
  priority?: TaskPriority;

  @ApiProperty()
  @Allow()
  title!: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiProperty({ enum: TaskOriginContext })
  @Allow()
  originContext!: TaskOriginContext;

  @ApiPropertyOptional()
  @Allow()
  originRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  ticketId?: string | null;

  @ApiProperty({ enum: TaskResponsibleType })
  @Allow()
  responsibleType!: TaskResponsibleType;

  @ApiProperty()
  @Allow()
  responsibleRefId!: string;

  @ApiProperty({ enum: TaskRecipientType })
  @Allow()
  recipientType!: TaskRecipientType;

  @ApiPropertyOptional()
  @Allow()
  recipientRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  recipientLabel?: string | null;

  @ApiPropertyOptional()
  @Allow()
  queueName?: string | null;

  @ApiProperty({ enum: TaskExecutionMode })
  @Allow()
  executionMode!: TaskExecutionMode;

  @ApiPropertyOptional()
  @Allow()
  dueAt?: string | null;

  @ApiProperty()
  @Allow()
  scheduledRequired!: boolean;
}

export const UpdateTaskSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: safeTextField(4000).optional().nullable(),
  priority: z.nativeEnum(TaskPriority).optional(),
  recipientType: z.nativeEnum(TaskRecipientType).optional(),
  recipientRefId: z.string().trim().max(160).optional().nullable(),
  recipientLabel: z.string().trim().max(160).optional().nullable(),
  queueName: z.string().trim().max(80).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  scheduledRequired: z.boolean().optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @Allow()
  title?: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiPropertyOptional({ enum: TaskPriority })
  @Allow()
  priority?: TaskPriority;

  @ApiPropertyOptional({ enum: TaskRecipientType })
  @Allow()
  recipientType?: TaskRecipientType;

  @ApiPropertyOptional()
  @Allow()
  recipientRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  recipientLabel?: string | null;

  @ApiPropertyOptional()
  @Allow()
  queueName?: string | null;

  @ApiPropertyOptional()
  @Allow()
  dueAt?: string | null;

  @ApiPropertyOptional()
  @Allow()
  scheduledRequired?: boolean;
}

export const ListTaskQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  type: z.nativeEnum(TaskType).optional(),
  responsibleRefId: z.string().trim().max(160).optional(),
  ticketId: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type ListTaskQueryInput = z.input<typeof ListTaskQuerySchema>;

export class ListTaskQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus })
  @Allow()
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskType })
  @Allow()
  type?: TaskType;

  @ApiPropertyOptional()
  @Allow()
  responsibleRefId?: string;

  @ApiPropertyOptional()
  @Allow()
  ticketId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @Allow()
  limit?: number;

  @ApiPropertyOptional({ description: 'Campo por el cual ordenar (ADR-065 Ola 1)' })
  @Allow()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Dirección de ordenamiento' })
  @Allow()
  sortDir?: 'asc' | 'desc';
}

export interface ListTasksResponseDto {
  data: unknown[];
  /** @deprecated Usar meta.total */
  total: number;
  /** @deprecated Usar meta.page */
  page: number;
  /** @deprecated Usar meta.limit */
  limit: number;
  meta: ListMeta;
}

export const AssignTaskSchema = z.object({
  responsibleType: z.nativeEnum(TaskResponsibleType),
  responsibleRefId: z.string().trim().min(1).max(160),
  reason: safeTextField(500).optional().nullable(),
});

export type AssignTaskInput = z.infer<typeof AssignTaskSchema>;

export class AssignTaskDto {
  @ApiProperty({ enum: TaskResponsibleType })
  @Allow()
  responsibleType!: TaskResponsibleType;

  @ApiProperty()
  @Allow()
  responsibleRefId!: string;

  @ApiPropertyOptional()
  @Allow()
  reason?: string | null;
}

export const TransitionTaskSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  notes: safeTextField(2000).optional().nullable(),
});

export type TransitionTaskInput = z.infer<typeof TransitionTaskSchema>;

export class TransitionTaskDto {
  @ApiProperty({ enum: TaskStatus })
  @Allow()
  status!: TaskStatus;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

export const LinkScheduleEventSchema = z.object({
  scheduleEventId: z.string().uuid(),
});

export type LinkScheduleEventInput = z.infer<typeof LinkScheduleEventSchema>;

export class LinkScheduleEventDto {
  @ApiProperty()
  @Allow()
  scheduleEventId!: string;
}

export const LinkTaskWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
});

export type LinkTaskWorkOrderInput = z.infer<typeof LinkTaskWorkOrderSchema>;

export class LinkTaskWorkOrderDto {
  @ApiProperty()
  @Allow()
  workOrderId!: string;
}
