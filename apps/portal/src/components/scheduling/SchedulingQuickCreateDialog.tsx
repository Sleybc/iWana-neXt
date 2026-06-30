'use client';

import type { InternalUser } from '@/lib/api-client';
import type { ScheduleEventFormInitialValues } from './ScheduleEventForm';
import {
  CreateTaskSchedulingDialog,
  type CreateTaskSchedulingValues,
} from './CreateTaskSchedulingDialog';

interface SchedulingQuickCreateDialogProps {
  open: boolean;
  initialValues: ScheduleEventFormInitialValues | null;
  technicians: InternalUser[];
  responsibleOptions: Array<{ value: string; label: string }>;
  internalAreaOptions: Array<{ value: string; label: string }>;
  internalUserOptions: Array<{ value: string; label: string }>;
  isSubmitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateTaskSchedulingValues) => Promise<void>;
}

export function SchedulingQuickCreateDialog({
  open,
  initialValues,
  technicians,
  responsibleOptions,
  internalAreaOptions,
  internalUserOptions,
  isSubmitting,
  error,
  onOpenChange,
  onSubmit,
}: SchedulingQuickCreateDialogProps) {
  if (!open || !initialValues) {
    return null;
  }

  return (
    <CreateTaskSchedulingDialog
      open={open}
      contextTitle="Crear tarea con agenda sugerida"
      initialValues={initialValues}
      technicians={technicians}
      responsibleOptions={responsibleOptions}
      internalAreaOptions={internalAreaOptions}
      internalUserOptions={internalUserOptions}
      error={error}
      isSubmitting={isSubmitting}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  );
}
