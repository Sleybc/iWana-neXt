'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Select } from '@iwana/ui';
import { WfmWorkType, WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';
import type { CreateWfmScheduleEventDto, InternalUser } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_SOURCE_CONTEXT_OPTIONS,
  WFM_WORK_TYPE_OPTIONS,
  buildTechnicianOptions,
  toIsoFromDatetimeLocal,
} from './scheduling-ui';

const optionalUuidField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .refine(
    (value) => !value || z.string().uuid().safeParse(value).success,
    'Ingresa un UUID válido.',
  );

function buildOptionalCoordinateField(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (value) => !value || Number.isFinite(Number(value)),
      `${label} debe ser un número válido.`,
    )
    .refine(
      (value) => !value || (Number(value) >= min && Number(value) <= max),
      `${label} debe estar entre ${min} y ${max}.`,
    );
}

const scheduleEventFormSchema = z
  .object({
    type: z.nativeEnum(WfmWorkType, { required_error: 'Selecciona un tipo de trabajo.' }),
    title: z.string().trim().min(1, 'El título es obligatorio.').max(160, 'Máximo 160 caracteres.'),
    description: z.string().trim().max(500, 'Máximo 500 caracteres.').optional().or(z.literal('')),
    scheduledStartAtLocal: z.string().min(1, 'Selecciona la fecha y hora de inicio.'),
    scheduledEndAtLocal: z.string().min(1, 'Selecciona la fecha y hora de cierre.'),
    assignedUserId: z.string().uuid('Selecciona un técnico válido.'),
    address: z.string().trim().max(255, 'Máximo 255 caracteres.').optional().or(z.literal('')),
    municipality: z.string().trim().max(120, 'Máximo 120 caracteres.').optional().or(z.literal('')),
    latitude: buildOptionalCoordinateField('La latitud', -90, 90),
    longitude: buildOptionalCoordinateField('La longitud', -180, 180),
    expedienteId: optionalUuidField,
    subscriberId: optionalUuidField,
    ticketId: z.string().trim().max(160, 'Máximo 160 caracteres.').optional().or(z.literal('')),
    contractId: optionalUuidField,
    createWorkOrder: z.boolean(),
    workOrderSummary: z
      .string()
      .trim()
      .max(200, 'Máximo 200 caracteres.')
      .optional()
      .or(z.literal('')),
    workOrderNotes: z
      .string()
      .trim()
      .max(500, 'Máximo 500 caracteres.')
      .optional()
      .or(z.literal('')),
    workOrderPriority: z.nativeEnum(WorkOrderPriority),
    workOrderType: z.union([z.nativeEnum(WfmWorkType), z.literal('')]),
    workOrderSourceContext: z.nativeEnum(WorkOrderSourceContext),
    workOrderSourceRef: z
      .string()
      .trim()
      .max(160, 'Máximo 160 caracteres.')
      .optional()
      .or(z.literal('')),
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
        message: 'La fecha de cierre debe ser posterior al inicio.',
      });
    }

    if (endAt - startAt < 15 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledEndAtLocal'],
        message: 'La duración mínima del evento es de 15 minutos.',
      });
    }

    if (values.createWorkOrder && !values.workOrderSummary?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workOrderSummary'],
        message: 'Resume la work order embebida.',
      });
    }
  });

type ScheduleEventFormValues = z.infer<typeof scheduleEventFormSchema>;

export type ScheduleEventFormInitialValues = Partial<ScheduleEventFormValues>;

function buildDefaultDateTime(offsetHours: number): string {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + offsetHours);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

interface ScheduleEventFormProps {
  technicians: InternalUser[];
  onSubmit: (payload: CreateWfmScheduleEventDto) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  expedienteDisplayLabel?: string | undefined;
  workOrderSourceRefDisplayLabel?: string | undefined;
  initialValues?: ScheduleEventFormInitialValues | undefined;
  lockOperationalFlow?: boolean | undefined;
}

function buildDefaultFormValues(): ScheduleEventFormValues {
  return {
    type: WfmWorkType.TECHNICAL_VISIT,
    title: '',
    description: '',
    scheduledStartAtLocal: buildDefaultDateTime(1),
    scheduledEndAtLocal: buildDefaultDateTime(2),
    assignedUserId: '',
    address: '',
    municipality: '',
    latitude: '',
    longitude: '',
    expedienteId: '',
    subscriberId: '',
    ticketId: '',
    contractId: '',
    createWorkOrder: false,
    workOrderSummary: '',
    workOrderNotes: '',
    workOrderPriority: WorkOrderPriority.NORMAL,
    workOrderType: '',
    workOrderSourceContext: WorkOrderSourceContext.MANUAL,
    workOrderSourceRef: '',
  };
}

export function ScheduleEventForm({
  technicians,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  expedienteDisplayLabel,
  workOrderSourceRefDisplayLabel,
  initialValues,
  lockOperationalFlow,
}: ScheduleEventFormProps) {
  const technicianOptions = useMemo(() => buildTechnicianOptions(technicians), [technicians]);
  const defaultValues = useMemo(
    () => ({ ...buildDefaultFormValues(), ...initialValues }),
    [initialValues],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ScheduleEventFormValues>({
    resolver: zodResolver(scheduleEventFormSchema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const createWorkOrder = watch('createWorkOrder');

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        const latitude = values.latitude?.trim();
        const longitude = values.longitude?.trim();
        const expedienteId = values.expedienteId?.trim();
        const subscriberId = values.subscriberId?.trim();
        const contractId = values.contractId?.trim();
        const workOrderSummary = values.workOrderSummary?.trim();
        const payload: CreateWfmScheduleEventDto = {
          type: values.type,
          title: values.title.trim(),
          scheduledStartAt: toIsoFromDatetimeLocal(values.scheduledStartAtLocal),
          scheduledEndAt: toIsoFromDatetimeLocal(values.scheduledEndAtLocal),
          assignedUserId: values.assignedUserId,
        };

        if (values.description?.trim()) payload.description = values.description.trim();
        if (values.address?.trim()) payload.address = values.address.trim();
        if (values.municipality?.trim()) payload.municipality = values.municipality.trim();
        if (latitude) payload.latitude = Number(latitude);
        if (longitude) payload.longitude = Number(longitude);
        if (expedienteId) payload.expedienteId = expedienteId;
        if (subscriberId) payload.subscriberId = subscriberId;
        if (values.ticketId?.trim()) payload.ticketId = values.ticketId.trim();
        if (contractId) payload.contractId = contractId;

        if (values.createWorkOrder) {
          payload.workOrder = {
            summary: workOrderSummary ?? '',
            priority: values.workOrderPriority,
            sourceContext: values.workOrderSourceContext,
          };

          if (values.workOrderType) {
            payload.workOrder.type = values.workOrderType;
          }
          if (values.workOrderNotes?.trim()) {
            payload.workOrder.notes = values.workOrderNotes.trim();
          }
          if (values.workOrderSourceRef?.trim()) {
            payload.workOrder.sourceRef = values.workOrderSourceRef.trim();
          }
        }

        await onSubmit(payload);
      })}
    >
      {error && (
        <PortalAlert variant="error" title="No fue posible crear el evento" description={error} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select
              id="schedule-event-type"
              label="Tipo de trabajo"
              value={field.value}
              options={WFM_WORK_TYPE_OPTIONS}
              onChange={(event) => field.onChange(event.target.value as WfmWorkType)}
              disabled={isSubmitting}
              {...(errors.type?.message ? { error: errors.type.message } : {})}
            />
          )}
        />

        <Controller
          name="assignedUserId"
          control={control}
          render={({ field }) => (
            <Select
              id="schedule-event-technician"
              label="Técnico responsable"
              value={field.value}
              placeholder="Selecciona un técnico"
              options={technicianOptions}
              onChange={(event) => field.onChange(event.target.value)}
              disabled={isSubmitting}
              {...(errors.assignedUserId?.message ? { error: errors.assignedUserId.message } : {})}
            />
          )}
        />
      </div>

      <Input
        id="schedule-event-title"
        label="Título operativo"
        error={errors.title?.message}
        disabled={isSubmitting}
        {...register('title')}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="schedule-event-start"
          type="datetime-local"
          label="Inicio programado"
          error={errors.scheduledStartAtLocal?.message}
          disabled={isSubmitting}
          {...register('scheduledStartAtLocal')}
        />
        <Input
          id="schedule-event-end"
          type="datetime-local"
          label="Fin programado"
          error={errors.scheduledEndAtLocal?.message}
          disabled={isSubmitting}
          {...register('scheduledEndAtLocal')}
        />
      </div>

      <div>
        <label
          htmlFor="schedule-event-description"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Descripción
        </label>
        <textarea
          id="schedule-event-description"
          rows={4}
          disabled={isSubmitting}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white"
          {...register('description')}
        />
        {errors.description?.message && (
          <p className="mt-1 text-xs text-[#EF4444]" role="alert">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="schedule-event-address"
          label="Dirección"
          error={errors.address?.message}
          disabled={isSubmitting}
          {...register('address')}
        />
        <Input
          id="schedule-event-municipality"
          label="Municipio"
          error={errors.municipality?.message}
          disabled={isSubmitting}
          {...register('municipality')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="schedule-event-latitude"
          label="Latitud"
          placeholder="4.7110"
          error={errors.latitude?.message}
          disabled={isSubmitting}
          {...register('latitude')}
        />
        <Input
          id="schedule-event-longitude"
          label="Longitud"
          placeholder="-74.0721"
          error={errors.longitude?.message}
          disabled={isSubmitting}
          {...register('longitude')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="schedule-event-ticket"
          label="Ticket o referencia"
          error={errors.ticketId?.message}
          disabled={isSubmitting || Boolean(lockOperationalFlow)}
          {...register('ticketId')}
        />
        <Input
          id="schedule-event-contract"
          label="Contrato"
          helperText="UUID opcional del contrato vinculado."
          error={errors.contractId?.message}
          disabled={isSubmitting}
          {...register('contractId')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {expedienteDisplayLabel ? (
          <>
            <input type="hidden" {...register('expedienteId')} />
            <Input
              id="schedule-event-expediente"
              label="Expediente"
              helperText="Referencia corta del expediente CRM. El vínculo interno usa el identificador real."
              value={expedienteDisplayLabel}
              readOnly
              disabled={isSubmitting}
            />
          </>
        ) : (
          <Input
            id="schedule-event-expediente"
            label="Expediente"
            helperText="Identificador interno opcional del expediente comercial."
            error={errors.expedienteId?.message}
            disabled={isSubmitting}
            {...register('expedienteId')}
          />
        )}
        <Input
          id="schedule-event-subscriber"
          label="Suscriptor"
          helperText="UUID opcional del suscriptor vinculado."
          error={errors.subscriberId?.message}
          disabled={isSubmitting}
          {...register('subscriberId')}
        />
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
        <input
          type="checkbox"
          disabled={isSubmitting || Boolean(lockOperationalFlow)}
          {...register('createWorkOrder')}
        />
        <span>
          <span className="block font-medium text-gray-900 dark:text-white">
            Crear work order embebida
          </span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            Activa una OT ligera para dar continuidad operativa al evento recién creado.
          </span>
        </span>
      </label>

      {createWorkOrder && (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
          <div className="grid gap-4 md:grid-cols-2">
            <Controller
              name="workOrderPriority"
              control={control}
              render={({ field }) => (
                <Select
                  id="schedule-work-order-priority"
                  label="Prioridad"
                  value={field.value}
                  options={WORK_ORDER_PRIORITY_OPTIONS}
                  onChange={(event) => field.onChange(event.target.value as WorkOrderPriority)}
                  disabled={isSubmitting}
                />
              )}
            />
            <Controller
              name="workOrderType"
              control={control}
              render={({ field }) => (
                <Select
                  id="schedule-work-order-type"
                  label="Tipo de OT"
                  value={field.value}
                  placeholder="Heredar del evento"
                  options={WFM_WORK_TYPE_OPTIONS}
                  onChange={(event) => field.onChange(event.target.value as WfmWorkType | '')}
                  disabled={isSubmitting}
                />
              )}
            />
          </div>

          <Controller
            name="workOrderSourceContext"
            control={control}
            render={({ field }) => (
              <Select
                id="schedule-work-order-source-context"
                label="Origen"
                value={field.value}
                options={WORK_ORDER_SOURCE_CONTEXT_OPTIONS}
                onChange={(event) => field.onChange(event.target.value as WorkOrderSourceContext)}
                disabled={isSubmitting}
              />
            )}
          />

          <Input
            id="schedule-work-order-summary"
            label="Resumen operativo"
            error={errors.workOrderSummary?.message}
            disabled={isSubmitting}
            {...register('workOrderSummary')}
          />
          {workOrderSourceRefDisplayLabel ? (
            <>
              <input type="hidden" {...register('workOrderSourceRef')} />
              <Input
                id="schedule-work-order-source-ref"
                label="Referencia de origen"
                helperText="Referencia corta visible del origen CRM. El vínculo interno conserva el identificador real."
                value={workOrderSourceRefDisplayLabel}
                readOnly
                disabled={isSubmitting}
              />
            </>
          ) : (
            <Input
              id="schedule-work-order-source-ref"
              label="Referencia de origen"
              error={errors.workOrderSourceRef?.message}
              disabled={isSubmitting}
              {...register('workOrderSourceRef')}
            />
          )}

          <div>
            <label
              htmlFor="schedule-work-order-notes"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Notas internas
            </label>
            <textarea
              id="schedule-work-order-notes"
              rows={3}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white"
              {...register('workOrderNotes')}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Crear evento
        </Button>
      </div>
    </form>
  );
}
