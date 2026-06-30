import { z } from 'zod';
import { TaskExecutionMode, TaskPriority, TaskRecipientType, TaskType } from '@iwana/shared';

export const INTERNAL_RECIPIENT_TYPES: readonly TaskRecipientType[] = [
  TaskRecipientType.INTERNAL_USER,
  TaskRecipientType.INTERNAL_AREA,
];

export const CATALOG_RECIPIENT_TYPES: readonly TaskRecipientType[] = [
  TaskRecipientType.PROSPECT,
  TaskRecipientType.SUBSCRIBER,
];

export const taskIntakeSchema = z
  .object({
    title: z.string().trim().min(1, 'El título es obligatorio.').max(200),
    type: z.nativeEnum(TaskType),
    priority: z.nativeEnum(TaskPriority),
    executionMode: z.nativeEnum(TaskExecutionMode),
    dueAt: z.string().optional().or(z.literal('')),
    responsibleRefId: z.string().min(1, 'Selecciona un responsable.'),
    recipientType: z.nativeEnum(TaskRecipientType),
    recipientRefId: z.string().optional().or(z.literal('')),
    recipientLabel: z.string().trim().max(160).optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (value.executionMode === TaskExecutionMode.DUE_DATE && !value.dueAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueAt'],
        message: 'La fecha objetivo es obligatoria para este modo de ejecución.',
      });
    }

    if (INTERNAL_RECIPIENT_TYPES.includes(value.recipientType) && !value.recipientRefId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientRefId'],
        message: 'Selecciona un destinatario.',
      });
    }

    if (CATALOG_RECIPIENT_TYPES.includes(value.recipientType) && !value.recipientRefId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientRefId'],
        message: 'Selecciona un registro existente del sistema.',
      });
    }

    if (
      !INTERNAL_RECIPIENT_TYPES.includes(value.recipientType) &&
      !CATALOG_RECIPIENT_TYPES.includes(value.recipientType) &&
      !value.recipientLabel?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientLabel'],
        message: 'Identifica el destinatario cliente o externo.',
      });
    }
  });

export type TaskIntakeValues = z.infer<typeof taskIntakeSchema>;
