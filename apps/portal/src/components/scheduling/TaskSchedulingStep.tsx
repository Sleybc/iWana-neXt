'use client';

import type { UseFormReturn } from 'react-hook-form';
import { TaskCoreFields } from '../operations/TaskCoreFields';
import type { TaskIntakeValues } from '../operations/task-intake-schema';

export interface TaskSchedulingStepProps {
  form: UseFormReturn<any>; // Tipado genérico para soportar la unión de esquemas
  internalAreaOptions: Array<{ value: string; label: string }>;
  /** Etiquetas de responsables precargados (del catálogo de técnicos ya cargado). */
  responsibleLabelById?: Map<string, string> | undefined;
  disabled?: boolean;
}

export function TaskSchedulingStep({
  form,
  internalAreaOptions,
  responsibleLabelById,
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

      {/* F5 (spec de diseño §4.8): responsable y destinatario interno usan el
      typeahead `GET /users/search` dentro de TaskCoreFields; el directorio
      precargado desaparece de toda la cadena de creación de tareas. */}
      <TaskCoreFields
        control={control}
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        internalAreaOptions={internalAreaOptions}
        responsibleLabelById={responsibleLabelById}
        disabled={disabled}
      />
    </div>
  );
}
