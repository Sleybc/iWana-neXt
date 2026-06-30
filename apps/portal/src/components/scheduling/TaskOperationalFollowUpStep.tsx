'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Input, Select } from '@iwana/ui';
import { WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';
import { WORK_ORDER_PRIORITY_OPTIONS, WORK_ORDER_SOURCE_CONTEXT_OPTIONS } from './scheduling-ui';

export interface TaskOperationalFollowUpStepProps {
  form: UseFormReturn<any>;
}

export function TaskOperationalFollowUpStep({ form }: TaskOperationalFollowUpStepProps) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form;

  const createWorkOrder = watch('createWorkOrder');

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Continuidad Operativa (Orden de Trabajo)
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ¿Deseas generar una Orden de Trabajo (OT) asociada a esta tarea?
            </p>
          </div>
          <div className="flex items-center">
            <input
              id="create-work-order-checkbox"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
              {...register('createWorkOrder')}
            />
            <label
              htmlFor="create-work-order-checkbox"
              className="ml-2 text-sm font-medium text-gray-900 dark:text-white"
            >
              Crear Orden de Trabajo
            </label>
          </div>
        </div>

        {createWorkOrder && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-dark-border-2">
            <Input
              id="work-order-summary"
              label="Resumen de la OT"
              requiredIndicator
              placeholder="Ej. Realizar instalación de fibra en fachada"
              {...(errors.workOrderSummary?.message
                ? { error: String(errors.workOrderSummary.message) }
                : {})}
              {...register('workOrderSummary')}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                name="workOrderPriority"
                control={control}
                render={({ field }) => (
                  <Select
                    id="work-order-priority"
                    label="Prioridad de la OT"
                    value={field.value}
                    options={WORK_ORDER_PRIORITY_OPTIONS}
                    onChange={(event) => field.onChange(event.target.value as WorkOrderPriority)}
                    {...(errors.workOrderPriority?.message
                      ? { error: String(errors.workOrderPriority.message) }
                      : {})}
                  />
                )}
              />

              <Controller
                name="workOrderSourceContext"
                control={control}
                render={({ field }) => (
                  <Select
                    id="work-order-source-context"
                    label="Contexto de origen"
                    value={field.value}
                    options={WORK_ORDER_SOURCE_CONTEXT_OPTIONS}
                    onChange={(event) =>
                      field.onChange(event.target.value as WorkOrderSourceContext)
                    }
                    {...(errors.workOrderSourceContext?.message
                      ? { error: String(errors.workOrderSourceContext.message) }
                      : {})}
                  />
                )}
              />
            </div>

            <Input
              id="work-order-source-ref"
              label="Referencia externa de origen (Opcional)"
              placeholder="Ej. TKT-12345"
              {...(errors.workOrderSourceRef?.message
                ? { error: String(errors.workOrderSourceRef.message) }
                : {})}
              {...register('workOrderSourceRef')}
            />

            <div>
              <label
                htmlFor="work-order-notes"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Notas / Instrucciones de campo
              </label>
              <textarea
                id="work-order-notes"
                rows={3}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white"
                {...register('workOrderNotes')}
              />
              {errors.workOrderNotes?.message && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                  {String(errors.workOrderNotes.message)}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
