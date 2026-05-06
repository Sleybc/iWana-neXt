'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import type { RescheduleWfmEventDto, WfmScheduleEvent } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { toDatetimeLocalValue, toIsoFromDatetimeLocal } from './scheduling-ui';

const rescheduleSchema = z
  .object({
    scheduledStartAtLocal: z.string().min(1, 'Selecciona la nueva fecha de inicio.'),
    scheduledEndAtLocal: z.string().min(1, 'Selecciona la nueva fecha de cierre.'),
    reason: z
      .string()
      .trim()
      .min(1, 'Indica el motivo del reagendamiento.')
      .max(120, 'Máximo 120 caracteres.'),
    notes: z.string().trim().max(500, 'Máximo 500 caracteres.').optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    const startAt = new Date(values.scheduledStartAtLocal).getTime();
    const endAt = new Date(values.scheduledEndAtLocal).getTime();

    if (Number.isNaN(startAt) || Number.isNaN(endAt)) {
      return;
    }

    if (endAt <= startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledEndAtLocal'],
        message: 'La nueva franja debe cerrar después de iniciar.',
      });
    }

    if (endAt - startAt < 15 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledEndAtLocal'],
        message: 'La duración mínima del evento es de 15 minutos.',
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
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: {
      scheduledStartAtLocal: '',
      scheduledEndAtLocal: '',
      reason: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open || !event) {
      return;
    }

    reset({
      scheduledStartAtLocal: toDatetimeLocalValue(event.scheduledStartAt),
      scheduledEndAtLocal: toDatetimeLocalValue(event.scheduledEndAt),
      reason: '',
      notes: '',
    });
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
            await onSubmit({
              scheduledStartAt: toIsoFromDatetimeLocal(values.scheduledStartAtLocal),
              scheduledEndAt: toIsoFromDatetimeLocal(values.scheduledEndAtLocal),
              reason: values.reason.trim(),
              notes: values.notes?.trim() || undefined,
            });
          })}
        >
          {error && (
            <PortalAlert variant="error" title="No fue posible reagendar" description={error} />
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              id="reschedule-start"
              type="datetime-local"
              label="Nuevo inicio"
              error={errors.scheduledStartAtLocal?.message}
              disabled={isSubmitting}
              {...register('scheduledStartAtLocal')}
            />
            <Input
              id="reschedule-end"
              type="datetime-local"
              label="Nuevo cierre"
              error={errors.scheduledEndAtLocal?.message}
              disabled={isSubmitting}
              {...register('scheduledEndAtLocal')}
            />
          </div>

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
