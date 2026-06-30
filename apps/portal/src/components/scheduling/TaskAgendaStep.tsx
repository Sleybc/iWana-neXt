'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { Button, DatePicker, Input, Select } from '@iwana/ui';
import { WfmWorkType } from '@iwana/shared';
import { Clock3 } from 'lucide-react';
import type { InternalUser, WfmScheduleRecommendation } from '@/lib/api-client';
import { wfmApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  WFM_WORK_TYPE_OPTIONS,
  buildTechnicianOptions,
  filterOperationalTechnicians,
  filterRecommendationCandidateUsers,
  toIsoFromDatetimeLocal,
} from './scheduling-ui';
import {
  QUICK_DURATION_OPTIONS,
  buildScheduleWindow,
  getDefaultDurationForWorkType,
  getScheduleTimeOptionsForWorkType,
  isScheduleStartInPast,
  isScheduleWindowAllowedForWorkType,
  SCHEDULE_PAST_NOT_ALLOWED_MESSAGE,
  toDateFromLocalDateValue,
  toLocalDateValue,
  toLocalTimeValue,
} from './schedule-event-time';
import { getOperatingWindowMessage, useOperatingWindow } from './useOperatingWindow';

export interface TaskAgendaStepProps {
  form: UseFormReturn<any>;
  technicians: InternalUser[];
}

export function TaskAgendaStep({ form, technicians }: TaskAgendaStepProps) {
  const {
    register,
    control,
    watch,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = form;

  const technicianOptions = useMemo(() => buildTechnicianOptions(technicians), [technicians]);
  const recommendationCandidates = useMemo(
    () => filterRecommendationCandidateUsers(technicians),
    [technicians],
  );

  const scheduleWorkType = watch('scheduleWorkType') || WfmWorkType.TECHNICAL_VISIT;
  const scheduledDateLocal = watch('scheduledDateLocal');
  const scheduledStartTimeLocal = watch('scheduledStartTimeLocal');
  const durationMinutes = watch('durationMinutes') || 60;
  const agendaResponsibleRefId = watch('agendaResponsibleRefId') || watch('responsibleRefId');
  const address = watch('address');
  const municipality = watch('municipality');
  const sector = watch('sector');
  const coordinates = watch('coordinates');

  const [recommendations, setRecommendations] = useState<WfmScheduleRecommendation[]>([]);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [durationMode, setDurationMode] = useState<'quick' | 'custom'>('quick');

  const durationInputId = useId();
  const scheduleWindow = useMemo(
    () => buildScheduleWindow(scheduledDateLocal, scheduledStartTimeLocal, durationMinutes),
    [scheduledDateLocal, scheduledStartTimeLocal, durationMinutes],
  );

  const { operatingWindow, isLoadingOperatingWindow, operatingWindowError } = useOperatingWindow({
    workType: scheduleWorkType,
    dateLocal: scheduledDateLocal,
    technicianId: agendaResponsibleRefId || null,
  });

  const operatingWindowMessage = useMemo(
    () => getOperatingWindowMessage(operatingWindow),
    [operatingWindow],
  );

  const scheduleTimeOptions = useMemo(
    () => getScheduleTimeOptionsForWorkType(scheduleWorkType, operatingWindow, durationMinutes),
    [durationMinutes, operatingWindow, scheduleWorkType],
  );

  const durationHours = Math.floor(Math.max(durationMinutes || 0, 0) / 60);
  const durationRemainderMinutes = Math.max(durationMinutes || 0, 0) % 60;

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
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Agenda - Tipo de Trabajo
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Define el tipo de trabajo de campo a realizar.
          </p>
        </div>

        <Controller
          name="scheduleWorkType"
          control={control}
          render={({ field }) => (
            <Select
              id="schedule-event-type"
              label="Tipo de trabajo"
              value={field.value}
              options={WFM_WORK_TYPE_OPTIONS}
              onChange={(event) => field.onChange(event.target.value as WfmWorkType)}
              {...(errors.scheduleWorkType?.message
                ? { error: String(errors.scheduleWorkType.message) }
                : {})}
            />
          )}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Programación</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Define la fecha de visita y hora de llegada.
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
                {...(errors.scheduledDateLocal?.message
                  ? { error: String(errors.scheduledDateLocal.message) }
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
                {...(errors.scheduledStartTimeLocal?.message
                  ? { error: String(errors.scheduledStartTimeLocal.message) }
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
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1 dark:border-dark-border-2 dark:bg-dark-surface-2">
              <Button
                type="button"
                variant={durationMode === 'quick' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setDurationMode('quick')}
              >
                Rápida
              </Button>
              <Button
                type="button"
                variant={durationMode === 'custom' ? 'primary' : 'ghost'}
                size="sm"
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
                label="Horas"
                value={String(durationHours)}
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
          startIcon={<Clock3 className="h-4 w-4" />}
          helperText="Se calcula automáticamente a partir de la duración."
          className="bg-iwana-surface-soft font-medium text-gray-700"
        />

        {scheduleWorkType === WfmWorkType.INSTALLATION && operatingWindowError && (
          <PortalAlert
            variant="warning"
            title="No fue posible resolver la ventana operativa"
            description={operatingWindowError}
          />
        )}

        {scheduleWorkType === WfmWorkType.INSTALLATION &&
          !operatingWindowError &&
          operatingWindowMessage && (
            <PortalAlert
              variant={operatingWindow?.status === 'OPEN' ? 'info' : 'warning'}
              title={
                operatingWindow?.status === 'OPEN' ? 'Ventana operativa aplicada' : 'Fecha cerrada'
              }
              description={operatingWindowMessage}
            />
          )}
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Persona asignada</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Define quién atenderá la visita en campo.
          </p>
        </div>

        <Controller
          name="agendaResponsibleRefId"
          control={control}
          render={({ field }) => (
            <Select
              id="schedule-event-technician"
              label="Responsable de agenda"
              value={field.value || agendaResponsibleRefId}
              placeholder="Selecciona una persona"
              options={technicianOptions}
              onChange={(event) => field.onChange(event.target.value)}
              {...(errors.agendaResponsibleRefId?.message
                ? { error: String(errors.agendaResponsibleRefId.message) }
                : {})}
            />
          )}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Ubicación y Dirección
          </h3>
        </div>

        <Input
          id="schedule-event-address"
          label="Dirección"
          {...(errors.address?.message ? { error: String(errors.address.message) } : {})}
          {...register('address')}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Input
            id="schedule-event-municipality"
            label="Municipio"
            {...(errors.municipality?.message
              ? { error: String(errors.municipality.message) }
              : {})}
            {...register('municipality')}
          />
          <Input
            id="schedule-event-sector"
            label="Sector / Barrio"
            {...(errors.sector?.message ? { error: String(errors.sector.message) } : {})}
            {...register('sector')}
          />
        </div>

        <Input
          id="schedule-event-coordinates"
          label="Coordenadas (Opcional)"
          helperText="Latitud y longitud separadas por coma"
          {...(errors.coordinates?.message ? { error: String(errors.coordinates.message) } : {})}
          {...register('coordinates')}
        />
      </section>
    </div>
  );
}
