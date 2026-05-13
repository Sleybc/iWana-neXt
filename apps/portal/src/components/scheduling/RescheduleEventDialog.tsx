'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  DatePicker,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { Clock3 } from 'lucide-react';
import type { RescheduleWfmEventDto, WfmScheduleEvent } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  QUICK_DURATION_OPTIONS,
  SCHEDULE_TIME_OPTIONS,
  buildScheduleWindow,
  deriveDurationMinutes,
  toDateFromLocalDateValue,
  toLocalDateValue,
  toLocalTimeValue,
} from './schedule-event-time';

const rescheduleSchema = z
  .object({
    scheduledDateLocal: z.string().min(1, 'Selecciona la fecha de visita.'),
    scheduledStartTimeLocal: z.string().min(1, 'Selecciona la hora de llegada.'),
    durationMinutes: z.coerce
      .number({ invalid_type_error: 'Ingresa una duración válida.' })
      .int('Ingresa una duración válida.')
      .min(15, 'La duración mínima es de 15 minutos.')
      .max(12 * 60, 'La duración máxima es de 12 horas.'),
    reason: z
      .string()
      .trim()
      .min(1, 'Indica el motivo del reagendamiento.')
      .max(120, 'Máximo 120 caracteres.'),
    notes: z.string().trim().max(500, 'Máximo 500 caracteres.').optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    const scheduleWindow = buildScheduleWindow(
      values.scheduledDateLocal,
      values.scheduledStartTimeLocal,
      values.durationMinutes,
    );

    if (!scheduleWindow) {
      return;
    }

    if (scheduleWindow.endAt.getTime() <= scheduleWindow.startAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationMinutes'],
        message: 'La nueva franja debe cerrar después de iniciar.',
      });
    }
  });

type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

interface RescheduleEventDialogProps {
  open: boolean;
  event: WfmScheduleEvent | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: RescheduleWfmEventDto) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export function RescheduleEventDialog({
  open,
  event,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: RescheduleEventDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: {
      scheduledDateLocal: '',
      scheduledStartTimeLocal: '',
      durationMinutes: 60,
      reason: '',
      notes: '',
    },
  });
  const [durationMode, setDurationMode] = useState<'quick' | 'custom'>('quick');
  const durationInputId = useId();
  const scheduledDateLocal = watch('scheduledDateLocal');
  const scheduledStartTimeLocal = watch('scheduledStartTimeLocal');
  const durationMinutes = watch('durationMinutes');
  const scheduleWindow = useMemo(
    () => buildScheduleWindow(scheduledDateLocal, scheduledStartTimeLocal, durationMinutes),
    [scheduledDateLocal, scheduledStartTimeLocal, durationMinutes],
  );
  const durationHours = Math.floor(Math.max(durationMinutes || 0, 0) / 60);
  const durationRemainderMinutes = Math.max(durationMinutes || 0, 0) % 60;

  useEffect(() => {
    if (!open || !event) {
      return;
    }

    const derivedDurationMinutes = deriveDurationMinutes(
      event.scheduledStartAt,
      event.scheduledEndAt,
    );

    reset({
      scheduledDateLocal: toLocalDateValue(event.scheduledStartAt),
      scheduledStartTimeLocal: toLocalTimeValue(event.scheduledStartAt),
      durationMinutes: derivedDurationMinutes,
      reason: '',
      notes: '',
    });

    setDurationMode(
      QUICK_DURATION_OPTIONS.some((option) => option.minutes === derivedDurationMinutes)
        ? 'quick'
        : 'custom',
    );
  }, [event, open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reagendar evento</DialogTitle>
          <DialogDescription>
            Define una nueva franja y registra el motivo operativo del cambio.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            const nextWindow = buildScheduleWindow(
              values.scheduledDateLocal,
              values.scheduledStartTimeLocal,
              values.durationMinutes,
            );

            if (!nextWindow) {
              return;
            }

            await onSubmit({
              scheduledStartAt: nextWindow.startAt.toISOString(),
              scheduledEndAt: nextWindow.endAt.toISOString(),
              reason: values.reason.trim(),
              notes: values.notes?.trim() || undefined,
            });
          })}
        >
          {error && (
            <PortalAlert variant="error" title="No fue posible reagendar" description={error} />
          )}

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Programación</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Define la nueva hora de llegada y la duración estimada de la visita.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                name="scheduledDateLocal"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="reschedule-date"
                    label="Fecha de visita"
                    requiredIndicator
                    value={toDateFromLocalDateValue(field.value)}
                    onChange={(date) => field.onChange(date ? toLocalDateValue(date) : '')}
                    onBlur={field.onBlur}
                    disabled={isSubmitting}
                    {...(errors.scheduledDateLocal?.message
                      ? { error: errors.scheduledDateLocal.message }
                      : {})}
                  />
                )}
              />
              <Controller
                name="scheduledStartTimeLocal"
                control={control}
                render={({ field }) => (
                  <Select
                    id="reschedule-time"
                    label="Hora de llegada"
                    value={field.value}
                    placeholder="Selecciona una hora"
                    options={SCHEDULE_TIME_OPTIONS}
                    onChange={(event) => field.onChange(event.target.value)}
                    disabled={isSubmitting}
                    {...(errors.scheduledStartTimeLocal?.message
                      ? { error: errors.scheduledStartTimeLocal.message }
                      : {})}
                  />
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Duración estimada
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ajusta una duración rápida o personalizada.
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1 dark:border-dark-border-2 dark:bg-dark-surface-2">
                  <Button
                    type="button"
                    variant={durationMode === 'quick' ? 'primary' : 'ghost'}
                    size="sm"
                    aria-pressed={durationMode === 'quick'}
                    disabled={isSubmitting}
                    onClick={() => setDurationMode('quick')}
                  >
                    Duración rápida
                  </Button>
                  <Button
                    type="button"
                    variant={durationMode === 'custom' ? 'primary' : 'ghost'}
                    size="sm"
                    aria-pressed={durationMode === 'custom'}
                    disabled={isSubmitting}
                    onClick={() => setDurationMode('custom')}
                  >
                    Personalizada
                  </Button>
                </div>
              </div>

              {durationMode === 'quick' ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Duración rápida">
                  {QUICK_DURATION_OPTIONS.map((option) => {
                    const isActive = durationMinutes === option.minutes;

                    return (
                      <Button
                        key={option.minutes}
                        type="button"
                        variant={isActive ? 'primary' : 'secondary'}
                        size="sm"
                        aria-pressed={isActive}
                        disabled={isSubmitting}
                        onClick={() => {
                          setValue('durationMinutes', option.minutes, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    id={`${durationInputId}-hours`}
                    type="number"
                    min={0}
                    max={12}
                    step={1}
                    label="Horas"
                    value={String(durationHours)}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      const nextHours = Number.parseInt(event.target.value || '0', 10);
                      const safeHours = Number.isNaN(nextHours)
                        ? 0
                        : Math.min(Math.max(nextHours, 0), 12);
                      setValue('durationMinutes', safeHours * 60 + durationRemainderMinutes, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  />
                  <Input
                    id={`${durationInputId}-minutes`}
                    type="number"
                    min={0}
                    max={45}
                    step={15}
                    label="Minutos"
                    value={String(durationRemainderMinutes)}
                    disabled={isSubmitting}
                    onChange={(event) => {
                      const nextMinutes = Number.parseInt(event.target.value || '0', 10);
                      const normalizedMinutes = Number.isNaN(nextMinutes)
                        ? 0
                        : Math.min(Math.max(nextMinutes, 0), 45);
                      const roundedMinutes = Math.round(normalizedMinutes / 15) * 15;
                      setValue('durationMinutes', durationHours * 60 + roundedMinutes, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  />
                </div>
              )}

              {errors.durationMinutes?.message && (
                <p className="text-xs text-[#EF4444]" role="alert">
                  {errors.durationMinutes.message}
                </p>
              )}
            </div>

            <Input
              id="reschedule-end-preview"
              label="Termina"
              value={
                scheduleWindow
                  ? `${toLocalDateValue(scheduleWindow.endAt)} ${toLocalTimeValue(scheduleWindow.endAt)}`
                  : 'No disponible'
              }
              readOnly
              disabled={isSubmitting}
              startIcon={<Clock3 className="h-4 w-4" />}
              helperText="Se calcula automáticamente a partir de la nueva hora de llegada y la duración estimada."
              className="cursor-default bg-[#f8faf5] font-medium text-gray-700 dark:bg-dark-surface-2 dark:text-gray-100"
            />
          </section>

          <Input
            id="reschedule-reason"
            label="Motivo"
            error={errors.reason?.message}
            disabled={isSubmitting}
            {...register('reason')}
          />

          <div>
            <label
              htmlFor="reschedule-notes"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Notas adicionales
            </label>
            <textarea
              id="reschedule-notes"
              rows={4}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white"
              {...register('notes')}
            />
          </div>

          <div className="flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              Guardar nueva franja
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
