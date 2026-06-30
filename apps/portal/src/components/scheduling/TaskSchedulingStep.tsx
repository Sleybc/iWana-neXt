'use client';

import type { UseFormReturn } from 'react-hook-form';
import { TaskCoreFields } from '../operations/TaskCoreFields';
import type { TaskIntakeValues } from '../operations/task-intake-schema';

export interface TaskSchedulingStepProps {
  form: UseFormReturn<any>; // Tipado genérico para soportar la unión de esquemas
  responsibleOptions: Array<{ value: string; label: string }>;
  internalAreaOptions: Array<{ value: string; label: string }>;
  internalUserOptions: Array<{ value: string; label: string }>;
  disabled?: boolean;
}

export function TaskSchedulingStep({
  form,
  responsibleOptions,
  internalAreaOptions,
  internalUserOptions,
  disabled = false,
}: TaskSchedulingStepProps) {
  const {
    control,
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Información de la Tarea
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Registra el título, tipo, prioridad y define el responsable y destinatario de la tarea.
        </p>
      </div>

      <TaskCoreFields
        control={control}
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        responsibleOptions={responsibleOptions}
        internalAreaOptions={internalAreaOptions}
        internalUserOptions={internalUserOptions}
        disabled={disabled}
      />
    </div>
  );
}
