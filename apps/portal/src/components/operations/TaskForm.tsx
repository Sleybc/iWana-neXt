'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@iwana/ui';
import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskResponsibleType,
  TaskType,
  TaskPriority,
  TaskRecipientType,
} from '@iwana/shared';
import type { CreateOperationalTaskDto } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { TaskCoreFields } from './TaskCoreFields';
import type { TaskIntakeValues } from './task-intake-schema';
import { taskIntakeSchema, INTERNAL_RECIPIENT_TYPES } from './task-intake-schema';
import type { VisitRequestNextAction } from '@/components/scheduling/visit-request-origin-orchestration';

export type TaskSchedulingFollowUpAction = VisitRequestNextAction;

export interface TaskFormSubmitOptions {
  followUpAction?: TaskSchedulingFollowUpAction | null;
}

export interface TaskFormProps {
  responsibleOptions: Array<{ value: string; label: string }>;
  internalAreaOptions: Array<{ value: string; label: string }>;
  internalUserOptions: Array<{ value: string; label: string }>;
  initialTicketId?: string | null;
  initialOriginContext?: TaskOriginContext;
  onSubmit: (payload: CreateOperationalTaskDto, options?: TaskFormSubmitOptions) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

function getScheduledRequired(executionMode: TaskExecutionMode): boolean {
  return [TaskExecutionMode.SCHEDULED, TaskExecutionMode.FIELD_SERVICE].includes(executionMode);
}

function buildDefaultValues() {
  return {
    title: '',
    type: TaskType.INTERNAL_OPERATION,
    priority: TaskPriority.NORMAL,
    executionMode: TaskExecutionMode.IMMEDIATE,
    dueAt: '',
    responsibleRefId: '',
    recipientType: TaskRecipientType.INTERNAL_AREA,
    recipientRefId: '',
    recipientLabel: '',
  };
}

export function TaskForm({
  responsibleOptions,
  internalAreaOptions,
  internalUserOptions,
  initialTicketId,
  initialOriginContext,
  onSubmit,
  isSubmitting,
  error,
}: TaskFormProps) {
  const [followUpAction, setFollowUpAction] = useState<TaskSchedulingFollowUpAction | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskIntakeValues>({
    resolver: zodResolver(taskIntakeSchema),
    defaultValues: buildDefaultValues(),
  });

  const executionMode = watch('executionMode');
  const recipientType = watch('recipientType');

  const currentRecipientOptions =
    recipientType === 'INTERNAL_USER' ? internalUserOptions : internalAreaOptions;

  const submit = handleSubmit(async (values) => {
    const selectedInternalRecipientLabel =
      currentRecipientOptions.find((option) => option.value === values.recipientRefId)?.label ??
      null;

    await onSubmit(
      {
        type: values.type,
        priority: values.priority,
        title: values.title.trim(),
        originContext:
          initialTicketId && initialOriginContext ? initialOriginContext : TaskOriginContext.MANUAL,
        ticketId: initialTicketId ?? null,
        responsibleType: TaskResponsibleType.USER,
        responsibleRefId: values.responsibleRefId,
        recipientType: values.recipientType,
        recipientRefId: values.recipientRefId?.trim() ? values.recipientRefId.trim() : null,
        recipientLabel: INTERNAL_RECIPIENT_TYPES.includes(values.recipientType)
          ? selectedInternalRecipientLabel
          : values.recipientLabel?.trim() || null,
        executionMode: values.executionMode,
        dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null,
        scheduledRequired: getScheduledRequired(values.executionMode),
      },
      getScheduledRequired(values.executionMode) ? { followUpAction } : undefined,
    );

    setFollowUpAction(null);
    reset(buildDefaultValues());
  });

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <TaskCoreFields
        control={control}
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        responsibleOptions={responsibleOptions}
        internalAreaOptions={internalAreaOptions}
        internalUserOptions={internalUserOptions}
        disabled={isSubmitting}
      />

      {getScheduledRequired(executionMode) && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/40 dark:bg-sky-900/20">
          <p className="text-sm font-medium text-sky-900 dark:text-sky-100">
            Esta tarea requiere coordinación de visita.
          </p>
          <p className="mt-1 text-sm text-sky-700 dark:text-sky-200">
            Después de crearla, elige si deseas agendar de una vez o dejarla en pendientes.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              variant={followUpAction === 'schedule-now' ? 'primary' : 'secondary'}
              onClick={() => setFollowUpAction('schedule-now')}
            >
              Agendar ahora
            </Button>
            <Button
              type="button"
              variant={followUpAction === 'send-to-pending' ? 'primary' : 'secondary'}
              onClick={() => setFollowUpAction('send-to-pending')}
            >
              Enviar a pendientes
            </Button>
          </div>
        </div>
      )}

      {error && (
        <PortalAlert variant="error" title="No fue posible crear la tarea" description={error} />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creando...' : 'Crear tarea'}
        </Button>
      </div>
    </form>
  );
}
