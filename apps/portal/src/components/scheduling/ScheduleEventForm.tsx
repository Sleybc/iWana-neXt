'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
import { WfmWorkType, WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';
import { Clock3 } from 'lucide-react';
import type {
  CreateWfmScheduleEventDto,
  InternalUser,
  WfmScheduleRecommendation,
  WfmScheduleRecommendationRequestDto,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  WORK_ORDER_PRIORITY_OPTIONS,
  WORK_ORDER_SOURCE_CONTEXT_OPTIONS,
  WFM_WORK_TYPE_OPTIONS,
  buildTechnicianOptions,
  getTechnicianDisplayName,
  toIsoFromDatetimeLocal,
} from './scheduling-ui';
import {
  QUICK_DURATION_OPTIONS,
  buildDefaultScheduleStart,
  buildScheduleWindow,
  deriveDurationMinutes,
  getDefaultDurationForWorkType,
  getScheduleTimeOptionsForWorkType,
  isScheduleWindowAllowedForWorkType,
  toDateFromLocalDateValue,
  toLocalDateValue,
  toLocalTimeValue,
} from './schedule-event-time';
import { getOperatingWindowMessage, useOperatingWindow } from './useOperatingWindow';

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

function parseOptionalNumber(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRecommendationRange(recommendation: WfmScheduleRecommendation): string {
  return `${toLocalDateValue(recommendation.scheduledStartAt)} ${toLocalTimeValue(
    recommendation.scheduledStartAt,
  )} - ${toLocalTimeValue(recommendation.scheduledEndAt)}`;
}

const scheduleEventFormSchema = z
  .object({
    type: z.nativeEnum(WfmWorkType, { required_error: 'Selecciona un tipo de trabajo.' }),
    title: z.string().trim().min(1, 'El título es obligatorio.').max(160, 'Máximo 160 caracteres.'),
    description: z.string().trim().max(500, 'Máximo 500 caracteres.').optional().or(z.literal('')),
    scheduledDateLocal: z.string().min(1, 'Selecciona la fecha de visita.'),
    scheduledStartTimeLocal: z.string().min(1, 'Selecciona la hora de llegada.'),
    durationMinutes: z.coerce
      .number({ invalid_type_error: 'Ingresa una duración válida.' })
      .int('Ingresa una duración válida.')
      .min(15, 'La duración mínima es de 15 minutos.')
      .max(12 * 60, 'La duración máxima es de 12 horas.'),
    assignedUserId: z.string().uuid('Selecciona un técnico válido.'),
    address: z.string().trim().max(255, 'Máximo 255 caracteres.').optional().or(z.literal('')),
    municipality: z.string().trim().max(120, 'Máximo 120 caracteres.').optional().or(z.literal('')),
    sector: z.string().trim().max(120, 'Máximo 120 caracteres.').optional().or(z.literal('')),
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
        message: 'La hora de fin debe ser posterior al inicio.',
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

interface ScheduleEventFormProps {
  technicians: InternalUser[];
  onSubmit: (payload: CreateWfmScheduleEventDto) => Promise<void>;
  onFindRecommendations?: (
    payload: WfmScheduleRecommendationRequestDto,
  ) => Promise<WfmScheduleRecommendation[]>;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
  expedienteDisplayLabel?: string | undefined;
  workOrderSourceRefDisplayLabel?: string | undefined;
  initialValues?: ScheduleEventFormInitialValues | undefined;
  lockOperationalFlow?: boolean | undefined;
}

function buildDefaultFormValues(): ScheduleEventFormValues {
  const startDefaults = buildDefaultScheduleStart(1);

  return {
    type: WfmWorkType.TECHNICAL_VISIT,
    title: '',
    description: '',
    scheduledDateLocal: startDefaults.scheduledDateLocal,
    scheduledStartTimeLocal: startDefaults.scheduledStartTimeLocal,
    durationMinutes: 60,
    assignedUserId: '',
    address: '',
    municipality: '',
    sector: '',
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

function buildResolvedFormValues(
  initialValues?: ScheduleEventFormInitialValues | undefined,
): ScheduleEventFormValues {
  const mergedValues = { ...buildDefaultFormValues(), ...initialValues };

  if (typeof initialValues?.durationMinutes !== 'number') {
    mergedValues.durationMinutes = getDefaultDurationForWorkType(mergedValues.type);
  }

  return mergedValues;
}

export function ScheduleEventForm({
  technicians,
  onSubmit,
  onFindRecommendations,
  onCancel,
  isSubmitting,
  error,
  expedienteDisplayLabel,
  workOrderSourceRefDisplayLabel,
  initialValues,
  lockOperationalFlow,
}: ScheduleEventFormProps) {
  const technicianOptions = useMemo(() => buildTechnicianOptions(technicians), [technicians]);
  const defaultValues = useMemo(() => buildResolvedFormValues(initialValues), [initialValues]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<ScheduleEventFormValues>({
    resolver: zodResolver(scheduleEventFormSchema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const createWorkOrder = watch('createWorkOrder');
  const type = watch('type');
  const scheduledDateLocal = watch('scheduledDateLocal');
  const scheduledStartTimeLocal = watch('scheduledStartTimeLocal');
  const durationMinutes = watch('durationMinutes');
  const municipality = watch('municipality');
  const sector = watch('sector');
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const assignedUserId = watch('assignedUserId');
  const [recommendations, setRecommendations] = useState<WfmScheduleRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [durationMode, setDurationMode] = useState<'quick' | 'custom'>(() =>
    QUICK_DURATION_OPTIONS.some((option) => option.minutes === defaultValues.durationMinutes)
      ? 'quick'
      : 'custom',
  );
  const durationInputId = useId();
  const scheduleWindow = useMemo(
    () => buildScheduleWindow(scheduledDateLocal, scheduledStartTimeLocal, durationMinutes),
    [scheduledDateLocal, scheduledStartTimeLocal, durationMinutes],
  );
  const { operatingWindow, isLoadingOperatingWindow, operatingWindowError } = useOperatingWindow({
    workType: type,
    dateLocal: scheduledDateLocal,
    technicianId: assignedUserId || null,
  });
  const operatingWindowMessage = useMemo(
    () => getOperatingWindowMessage(operatingWindow),
    [operatingWindow],
  );
  const scheduleTimeOptions = useMemo(
    () => getScheduleTimeOptionsForWorkType(type, operatingWindow, durationMinutes),
    [durationMinutes, operatingWindow, type],
  );
  const durationHours = Math.floor(Math.max(durationMinutes || 0, 0) / 60);
  const durationRemainderMinutes = Math.max(durationMinutes || 0, 0) % 60;

  useEffect(() => {
    setDurationMode(
      QUICK_DURATION_OPTIONS.some((option) => option.minutes === defaultValues.durationMinutes)
        ? 'quick'
        : 'custom',
    );
  }, [defaultValues.durationMinutes]);

  useEffect(() => {
    if (!scheduledStartTimeLocal) {
      return;
    }

    if (!scheduleTimeOptions.some((option) => option.value === scheduledStartTimeLocal)) {
      const fallbackTime = scheduleTimeOptions[0]?.value ?? '';

      if (fallbackTime || scheduledStartTimeLocal) {
        setValue('scheduledStartTimeLocal', fallbackTime, {
          shouldDirty: false,
          shouldValidate: true,
        });
      }
    }
  }, [scheduleTimeOptions, scheduledStartTimeLocal, setValue]);

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        const scheduleValues = buildScheduleWindow(
          values.scheduledDateLocal,
          values.scheduledStartTimeLocal,
          values.durationMinutes,
        );
        const latitude = values.latitude?.trim();
        const longitude = values.longitude?.trim();
        const sector = values.sector?.trim();
        const expedienteId = values.expedienteId?.trim();
        const subscriberId = values.subscriberId?.trim();
        const contractId = values.contractId?.trim();
        const workOrderSummary = values.workOrderSummary?.trim();

        if (!scheduleValues) {
          return;
        }

        if (!isScheduleWindowAllowedForWorkType(values.type, scheduleValues, operatingWindow)) {
          setError('scheduledStartTimeLocal', {
            type: 'validate',
            message:
              operatingWindowMessage ??
              operatingWindowError ??
              'La fecha seleccionada no tiene una ventana operativa disponible.',
          });
          return;
        }

        clearErrors('scheduledStartTimeLocal');

        const payload: CreateWfmScheduleEventDto = {
          type: values.type,
          title: values.title.trim(),
          scheduledStartAt: toIsoFromDatetimeLocal(scheduleValues.scheduledStartAtLocal),
          scheduledEndAt: toIsoFromDatetimeLocal(scheduleValues.scheduledEndAtLocal),
          assignedUserId: values.assignedUserId,
        };

        if (values.description?.trim()) payload.description = values.description.trim();
        if (values.address?.trim()) payload.address = values.address.trim();
        if (values.municipality?.trim()) payload.municipality = values.municipality.trim();
        if (sector) payload.sector = sector;
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

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Programación</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Define cuándo inicia la visita y cuánto tiempo ocupará la cuadrilla.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Controller
            name="scheduledDateLocal"
            control={control}
            render={({ field }) => (
              <DatePicker
                id="schedule-event-date"
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
                id="schedule-event-time"
                label="Hora de llegada"
                value={field.value}
                placeholder="Selecciona una hora"
                options={scheduleTimeOptions}
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
                Duración rápida o personalizada.
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
          id="schedule-event-end-preview"
          label="Termina"
          value={
            scheduleWindow
              ? `${toLocalDateValue(scheduleWindow.endAt)} ${toLocalTimeValue(scheduleWindow.endAt)}`
              : 'No disponible'
          }
          readOnly
          disabled={isSubmitting}
          startIcon={<Clock3 className="h-4 w-4" />}
          helperText="Se calcula automáticamente a partir de la hora de llegada y la duración estimada."
          className="cursor-default bg-iwana-surface-soft font-medium text-gray-700 dark:bg-dark-surface-2 dark:text-gray-100"
        />

        {type === WfmWorkType.INSTALLATION && operatingWindowError && (
          <PortalAlert
            variant="warning"
            title="No fue posible resolver la ventana operativa"
            description={operatingWindowError}
          />
        )}

        {type === WfmWorkType.INSTALLATION && !operatingWindowError && operatingWindowMessage && (
          <PortalAlert
            variant={operatingWindow?.status === 'OPEN' ? 'info' : 'warning'}
            title={
              operatingWindow?.status === 'OPEN'
                ? 'Ventana operativa aplicada'
                : 'Fecha cerrada para programación'
            }
            description={operatingWindowMessage}
          />
        )}

        {type === WfmWorkType.INSTALLATION && isLoadingOperatingWindow && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Resolviendo la ventana operativa configurada para la fecha seleccionada...
          </p>
        )}
      </section>

      {onFindRecommendations && (
        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Asistente de agenda
              </p>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Mejor franja por zona y ruta
              </h3>
              <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                Busca franjas libres y prioriza técnicos con tareas cercanas por municipio,
                sector/vereda y coordenadas.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={isLoadingRecommendations}
              disabled={
                isSubmitting ||
                isLoadingRecommendations ||
                technicians.length === 0 ||
                (type === WfmWorkType.INSTALLATION && operatingWindow?.status === 'CLOSED')
              }
              onClick={async () => {
                if (!scheduledDateLocal) {
                  setRecommendationError('Selecciona una fecha para buscar disponibilidad.');
                  return;
                }

                if (
                  type === WfmWorkType.INSTALLATION &&
                  (operatingWindow?.status === 'CLOSED' || operatingWindowError)
                ) {
                  setRecommendationError(
                    operatingWindowMessage ??
                      operatingWindowError ??
                      'La fecha seleccionada no tiene una ventana operativa disponible.',
                  );
                  return;
                }

                if (!Number.isFinite(durationMinutes) || durationMinutes < 15) {
                  setRecommendationError('Define una duración válida antes de buscar franjas.');
                  return;
                }

                const parsedLatitude = parseOptionalNumber(latitude);
                const parsedLongitude = parseOptionalNumber(longitude);
                const hasInvalidCoordinates =
                  (latitude?.trim() && parsedLatitude === null) ||
                  (longitude?.trim() && parsedLongitude === null);

                if (hasInvalidCoordinates) {
                  setRecommendationError('Corrige las coordenadas antes de buscar franjas.');
                  return;
                }

                setIsLoadingRecommendations(true);
                setRecommendationError(null);

                try {
                  const result = await onFindRecommendations({
                    workType: type,
                    durationMinutes,
                    windowStartAt: toIsoFromDatetimeLocal(`${scheduledDateLocal}T00:00`),
                    windowEndAt: toIsoFromDatetimeLocal(`${scheduledDateLocal}T23:59`),
                    candidateUserIds: technicians.map((technician) => technician.id),
                    municipality: municipality?.trim() || null,
                    sector: sector?.trim() || null,
                    latitude: parsedLatitude,
                    longitude: parsedLongitude,
                    maxResults: 8,
                  });

                  setRecommendations(result);
                  if (result.length === 0) {
                    setRecommendationError(
                      operatingWindowMessage && operatingWindow?.status === 'CLOSED'
                        ? operatingWindowMessage
                        : 'No encontramos una franja libre dentro de la ventana operativa configurada.',
                    );
                  }
                } catch {
                  setRecommendationError('No fue posible calcular recomendaciones de agenda.');
                } finally {
                  setIsLoadingRecommendations(false);
                }
              }}
            >
              Buscar mejores franjas
            </Button>
          </div>

          {recommendationError && (
            <PortalAlert
              variant="warning"
              title="Sin recomendación aplicable"
              description={recommendationError}
            />
          )}

          {recommendations.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {recommendations.map((recommendation) => {
                const technician = technicians.find(
                  (item) => item.id === recommendation.technicianId,
                );
                const isSelected = assignedUserId === recommendation.technicianId;

                return (
                  <button
                    key={`${recommendation.technicianId}-${recommendation.scheduledStartAt}`}
                    type="button"
                    className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface-2 ${
                      isSelected &&
                      scheduledStartTimeLocal === toLocalTimeValue(recommendation.scheduledStartAt)
                        ? 'border-iwana-primary bg-iwana-primary-50/70 dark:border-iwana-primary-300 dark:bg-iwana-primary-400/10'
                        : 'border-gray-200 bg-[#fbfcf8] hover:border-iwana-primary/40 dark:border-dark-border dark:bg-dark-surface-3'
                    }`}
                    onClick={() => {
                      const startAt = new Date(recommendation.scheduledStartAt);
                      setValue('assignedUserId', recommendation.technicianId, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue('scheduledDateLocal', toLocalDateValue(startAt), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      setValue('scheduledStartTimeLocal', toLocalTimeValue(startAt), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {technician
                            ? getTechnicianDisplayName(technician)
                            : 'Técnico no disponible'}
                        </p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                          {formatRecommendationRange(recommendation)}
                        </p>
                      </div>
                      <span className="rounded-full bg-iwana-secondary-100 px-2.5 py-1 text-xs font-semibold text-iwana-secondary-700 dark:bg-iwana-secondary-400/15 dark:text-iwana-secondary-300">
                        {recommendation.score} pts
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {recommendation.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      {recommendation.distanceKm !== null
                        ? `Referencia cercana a ${recommendation.distanceKm} km.`
                        : 'Recomendación basada en disponibilidad, carga y horario.'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

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
        <Input
          id="schedule-event-sector"
          label="Sector / vereda"
          error={errors.sector?.message}
          disabled={isSubmitting}
          {...register('sector')}
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

      <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
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
