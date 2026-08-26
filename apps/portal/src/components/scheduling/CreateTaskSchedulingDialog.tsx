'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import {
  TaskExecutionMode,
  TaskPriority,
  TaskRecipientType,
  TaskType,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { TaskSchedulingStep } from './TaskSchedulingStep';
import { TaskAgendaStep } from './TaskAgendaStep';
import { TaskOperationalFollowUpStep } from './TaskOperationalFollowUpStep';
import {
  CATALOG_RECIPIENT_TYPES,
  INTERNAL_RECIPIENT_TYPES,
} from '../operations/task-intake-schema';
import { PortalAlert } from '@/components/shared/portal-ui';

const coordinatesField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine((value) => {
    if (!value) return true;
    const parts = value.split(',').map((s) => s.trim());
    if (parts.length !== 2) return false;
    const [latStr, lngStr] = parts;
    const lat = Number(latStr);
    const lng = Number(lngStr);
    return (
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lng) &&
      lng >= -180 &&
      lng <= 180
    );
  }, 'Ingresa coordenadas válidas (latitud, longitud) — ej: 4.7110, -74.0721');

const optionalUuidField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine(
    (value) => !value || z.string().uuid().safeParse(value).success,
    'Ingresa un identificador válido.',
  );

const createTaskSchedulingSchema = z
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

    scheduleWorkType: z.nativeEnum(WfmWorkType),
    scheduledDateLocal: z.string().optional().or(z.literal('')),
    scheduledStartTimeLocal: z.string().optional().or(z.literal('')),
    durationMinutes: z.coerce.number().int().min(15).max(720).optional(),
    agendaResponsibleRefId: z.string().optional().or(z.literal('')),
    address: z.string().trim().max(255).optional().or(z.literal('')),
    municipality: z.string().trim().max(120).optional().or(z.literal('')),
    sector: z.string().trim().max(120).optional().or(z.literal('')),
    coordinates: coordinatesField,

    createWorkOrder: z.boolean(),
    workOrderSummary: z.string().trim().max(200).optional().or(z.literal('')),
    workOrderNotes: z.string().trim().max(500).optional().or(z.literal('')),
    workOrderPriority: z.nativeEnum(WorkOrderPriority),
    workOrderType: z.union([z.nativeEnum(WfmWorkType), z.literal('')]),
    workOrderSourceContext: z.nativeEnum(WorkOrderSourceContext),
    workOrderSourceRef: z.string().trim().max(160).optional().or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    // Validaciones de Tarea básica
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

    // Validaciones de Agenda (si requiere)
    const requiresAgenda = [TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE].includes(
      value.executionMode,
    );
    if (requiresAgenda) {
      if (!value.scheduledDateLocal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledDateLocal'],
          message: 'Selecciona la fecha de visita.',
        });
      }
      if (!value.scheduledStartTimeLocal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledStartTimeLocal'],
          message: 'Selecciona la hora de llegada.',
        });
      }
      if (!value.durationMinutes || value.durationMinutes < 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['durationMinutes'],
          message: 'La duración mínima es de 15 minutos.',
        });
      }
    }

    // Validaciones de OT
    if (value.createWorkOrder && !value.workOrderSummary?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workOrderSummary'],
        message: 'Resume la orden de trabajo asociada.',
      });
    }
  });

export type CreateTaskSchedulingValues = z.infer<typeof createTaskSchedulingSchema>;

export interface CreateTaskSchedulingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: any | null;
  technicians: any[];
  responsibleOptions: Array<{ value: string; label: string }>;
  internalAreaOptions: Array<{ value: string; label: string }>;
  internalUserOptions: Array<{ value: string; label: string }>;
  onSubmit: (values: CreateTaskSchedulingValues) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  contextTitle?: string;
}

function buildDefaultValues(initialValues: any): CreateTaskSchedulingValues {
  return {
    title: initialValues?.title ?? '',
    type: initialValues?.taskType ?? TaskType.INTERNAL_OPERATION,
    priority: initialValues?.priority ?? TaskPriority.NORMAL,
    executionMode: initialValues?.executionMode ?? TaskExecutionMode.SCHEDULED,
    dueAt: initialValues?.dueAt ?? '',
    responsibleRefId: initialValues?.responsibleRefId ?? initialValues?.assignedUserId ?? '',
    recipientType: initialValues?.recipientType ?? TaskRecipientType.INTERNAL_AREA,
    recipientRefId: initialValues?.recipientRefId ?? '',
    recipientLabel: initialValues?.recipientLabel ?? '',

    scheduleWorkType: initialValues?.type ?? WfmWorkType.TECHNICAL_VISIT,
    scheduledDateLocal: initialValues?.scheduledDateLocal ?? '',
    scheduledStartTimeLocal: initialValues?.scheduledStartTimeLocal ?? '',
    durationMinutes: initialValues?.durationMinutes ?? 60,
    agendaResponsibleRefId: initialValues?.assignedUserId ?? '',
    address: initialValues?.address ?? '',
    municipality: initialValues?.municipality ?? '',
    sector: initialValues?.sector ?? '',
    coordinates: initialValues?.coordinates ?? '',

    createWorkOrder: initialValues?.createWorkOrder ?? false,
    workOrderSummary: initialValues?.workOrderSummary ?? '',
    workOrderNotes: initialValues?.workOrderNotes ?? '',
    workOrderPriority: initialValues?.workOrderPriority ?? WorkOrderPriority.NORMAL,
    workOrderType: initialValues?.workOrderType ?? '',
    workOrderSourceContext: initialValues?.workOrderSourceContext ?? WorkOrderSourceContext.MANUAL,
    workOrderSourceRef: initialValues?.workOrderSourceRef ?? '',
  };
}

export function CreateTaskSchedulingDialog({
  open,
  onOpenChange,
  initialValues,
  technicians,
  responsibleOptions,
  internalAreaOptions,
  internalUserOptions,
  onSubmit,
  isSubmitting,
  error,
  contextTitle,
}: CreateTaskSchedulingDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const defaultValues = useMemo(() => buildDefaultValues(initialValues), [initialValues]);

  const form = useForm<CreateTaskSchedulingValues>({
    resolver: zodResolver(createTaskSchedulingSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      setStep(1);
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  const executionMode = form.watch('executionMode');
  const requiresAgenda = [TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE].includes(
    executionMode,
  );
  const totalSteps = requiresAgenda ? 3 : 2;

  const handleNext = async () => {
    // Validar solo los campos del paso actual antes de avanzar
    let fieldsToValidate: any[] = [];
    if (step === 1) {
      fieldsToValidate = [
        'title',
        'type',
        'priority',
        'executionMode',
        'dueAt',
        'responsibleRefId',
        'recipientType',
        'recipientRefId',
        'recipientLabel',
      ];
    } else if (step === 2 && requiresAgenda) {
      fieldsToValidate = [
        'scheduleWorkType',
        'scheduledDateLocal',
        'scheduledStartTimeLocal',
        'durationMinutes',
        'agendaResponsibleRefId',
        'address',
        'municipality',
        'sector',
        'coordinates',
      ];
    }

    const isValid = await form.trigger(fieldsToValidate as any);
    if (isValid) {
      setStep((current) => Math.min(totalSteps, current + 1) as 1 | 2 | 3);
    }
  };

  const handleBack = () => {
    setStep((current) => Math.max(1, current - 1) as 1 | 2 | 3);
  };

  const submitForm = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contextTitle ?? 'Crear tarea'}</DialogTitle>
          <DialogDescription>
            Registra el trabajo, define responsable y destinatario, y decide si necesita agenda.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <PortalAlert
            variant="error"
            title="No fue posible procesar la solicitud"
            description={error}
          />
        )}

        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-dark-border">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Paso {step} de {totalSteps}
          </p>
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, index) => (
              <div
                key={index}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  index + 1 === step ? 'bg-iwana-primary' : 'bg-gray-200 dark:bg-dark-surface-3'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="py-4">
          {step === 1 && (
            <TaskSchedulingStep
              form={form}
              responsibleOptions={responsibleOptions}
              internalAreaOptions={internalAreaOptions}
              internalUserOptions={internalUserOptions}
              disabled={isSubmitting}
            />
          )}

          {step === 2 && requiresAgenda && <TaskAgendaStep form={form} technicians={technicians} />}

          {step === totalSteps && <TaskOperationalFollowUpStep form={form} />}
        </div>

        <div className="flex justify-between border-t border-gray-100 pt-4 dark:border-dark-border">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={step === 1 || isSubmitting}
          >
            Atrás
          </Button>

          {step < totalSteps ? (
            <Button type="button" onClick={handleNext} disabled={isSubmitting}>
              Continuar
            </Button>
          ) : (
            <Button type="button" loading={isSubmitting} onClick={() => void submitForm()}>
              {requiresAgenda ? 'Crear tarea y agenda' : 'Crear tarea'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
