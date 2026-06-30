'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, CircleAlert, Clock3, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { BusinessHoursWeekday } from '@iwana/shared';
import { Button, DatePicker, Select } from '@iwana/ui';
import {
  ApiError,
  wfmApi,
  type WfmBusinessHoursDay,
  type WfmDispatchSite,
  type WfmHolidayBlackout,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { WFM_SETTINGS_COPY } from './mod00-settings-labels';
import { TimeFieldSelect } from './TimeFieldSelect';

const ORDERED_WEEKDAYS = [
  BusinessHoursWeekday.MONDAY,
  BusinessHoursWeekday.TUESDAY,
  BusinessHoursWeekday.WEDNESDAY,
  BusinessHoursWeekday.THURSDAY,
  BusinessHoursWeekday.FRIDAY,
  BusinessHoursWeekday.SATURDAY,
  BusinessHoursWeekday.SUNDAY,
] as const;

const WEEKDAY_LABELS: Record<BusinessHoursWeekday, string> = {
  [BusinessHoursWeekday.MONDAY]: 'Lunes',
  [BusinessHoursWeekday.TUESDAY]: 'Martes',
  [BusinessHoursWeekday.WEDNESDAY]: 'Miércoles',
  [BusinessHoursWeekday.THURSDAY]: 'Jueves',
  [BusinessHoursWeekday.FRIDAY]: 'Viernes',
  [BusinessHoursWeekday.SATURDAY]: 'Sábado',
  [BusinessHoursWeekday.SUNDAY]: 'Domingo',
};

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';
const LABEL_CLASS = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const MUTED_CLASS = 'text-sm leading-6 text-gray-500 dark:text-gray-400';
const BADGE_CLASS =
  'inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400';
type WeekEditorDay = {
  weekday: BusinessHoursWeekday;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
};

type FeedbackState = {
  variant: 'success' | 'error';
  title: string;
  description: string;
};

type SiteFormState = {
  id: string | null;
  name: string;
  code: string;
  address: string;
  municipality: string;
  sector: string;
  coordinates: string;
  isActive: boolean;
};

type BlackoutFormState = {
  id: string | null;
  siteId: string;
  blackoutDate: string;
  isRecurring: boolean;
  name: string;
  description: string;
  isEnabled: boolean;
};

const siteSchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la sede es obligatorio.'),
  code: z.string().trim().min(1, 'El código operativo es obligatorio.'),
  address: z.string().trim(),
  municipality: z.string().trim(),
  sector: z.string().trim(),
  coordinates: z.string().trim(),
  isActive: z.boolean(),
});

const blackoutSchema = z.object({
  siteId: z.string().trim(),
  blackoutDate: z.string().trim().min(1, 'La fecha del cierre es obligatoria.'),
  isRecurring: z.boolean(),
  name: z.string().trim().min(1, 'El nombre del cierre es obligatorio.'),
  description: z.string().trim(),
  isEnabled: z.boolean(),
});

function createEmptyWeek(): WeekEditorDay[] {
  return ORDERED_WEEKDAYS.map((weekday) => ({
    weekday,
    startTime: '',
    endTime: '',
    isEnabled: false,
  }));
}

function normalizeTimeValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const [hour = '', minute = ''] = trimmed.split(':');
  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) {
    return '';
  }

  return `${hour}:${minute}`;
}

function normalizeWeek(days?: WfmBusinessHoursDay[]): WeekEditorDay[] {
  if (!days?.length) {
    return createEmptyWeek();
  }

  const byWeekday = new Map(days.map((day) => [day.weekday, day]));

  return ORDERED_WEEKDAYS.map((weekday) => {
    const current = byWeekday.get(weekday);

    return {
      weekday,
      startTime: normalizeTimeValue(current?.startTime),
      endTime: normalizeTimeValue(current?.endTime),
      isEnabled: current?.isEnabled ?? false,
    };
  });
}

function toWeekPayload(days: WeekEditorDay[]): { days: WfmBusinessHoursDay[] } {
  if (days.length !== ORDERED_WEEKDAYS.length) {
    throw new Error(
      'La configuración semanal quedó incompleta. Recarga la vista e intenta de nuevo.',
    );
  }

  return {
    days: days.map((day) => {
      if (day.isEnabled) {
        if (!day.startTime || !day.endTime) {
          throw new Error(`Debes indicar la ventana completa para ${WEEKDAY_LABELS[day.weekday]}.`);
        }

        if (day.startTime >= day.endTime) {
          throw new Error(
            `La hora final de ${WEEKDAY_LABELS[day.weekday]} debe ser posterior a la inicial.`,
          );
        }
      }

      return {
        weekday: day.weekday,
        startTime: day.isEnabled ? day.startTime : null,
        endTime: day.isEnabled ? day.endTime : null,
        isEnabled: day.isEnabled,
      };
    }),
  };
}

function createEmptySiteForm(): SiteFormState {
  return {
    id: null,
    name: '',
    code: '',
    address: '',
    municipality: '',
    sector: '',
    coordinates: '',
    isActive: true,
  };
}

function createEmptyBlackoutForm(): BlackoutFormState {
  return {
    id: null,
    siteId: '',
    blackoutDate: '',
    isRecurring: false,
    name: '',
    description: '',
    isEnabled: true,
  };
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);

  if (Number.isNaN(numeric)) {
    throw new Error('Las coordenadas deben ser numéricas.');
  }

  return numeric;
}

function parseLatLngPair(value: string): { latitude: number | null; longitude: number | null } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { latitude: null, longitude: null };
  }

  const parts = trimmed.split(',');
  if (parts.length !== 2) {
    throw new Error('Usa el formato de coordenadas: latitud, longitud. Ej: 4.6097, -74.0817');
  }

  const latitude = parseCoordinate(parts[0] ?? '');
  const longitude = parseCoordinate(parts[1] ?? '');

  if (latitude === null || longitude === null) {
    throw new Error('Usa el formato de coordenadas: latitud, longitud. Ej: 4.6097, -74.0817');
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('Usa coordenadas válidas: latitud entre -90 y 90, longitud entre -180 y 180.');
  }

  return { latitude, longitude };
}

function formatLatLngPair(latitude: string | null, longitude: string | null): string {
  if (!latitude && !longitude) {
    return '';
  }

  return `${latitude ?? ''}, ${longitude ?? ''}`.trim();
}

function toLocalDateValue(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateFromLocalDateValue(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [yearPart, monthPart, dayPart] = value.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return undefined;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function mapError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

interface WeekGridProps {
  week: WeekEditorDay[];
  onChange: (weekday: BusinessHoursWeekday, patch: Partial<WeekEditorDay>) => void;
  readOnly: boolean;
}

function WeekGrid({ week, onChange, readOnly }: WeekGridProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border">
      <div className="grid min-w-[640px] grid-cols-[minmax(120px,1.35fr)_120px_152px_152px] gap-px bg-gray-200 dark:bg-dark-border">
        <div className="bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          Día
        </div>
        <div className="bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          Abierto
        </div>
        <div className="bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          Inicio
        </div>
        <div className="bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          Fin
        </div>

        {week.map((day) => (
          <Fragment key={day.weekday}>
            <div className="bg-white px-4 py-3 text-sm font-medium text-gray-900 dark:bg-dark-surface-2 dark:text-white">
              {WEEKDAY_LABELS[day.weekday]}
            </div>
            <div className="flex items-center justify-center bg-white px-4 py-3 dark:bg-dark-surface-2">
              <input
                aria-label={`Habilitar ${WEEKDAY_LABELS[day.weekday]}`}
                type="checkbox"
                checked={day.isEnabled}
                disabled={readOnly}
                onChange={(event) =>
                  onChange(day.weekday, {
                    isEnabled: event.target.checked,
                    startTime: event.target.checked ? day.startTime : '',
                    endTime: event.target.checked ? day.endTime : '',
                  })
                }
              />
            </div>
            <div className="flex items-center justify-center bg-white px-3 py-3 dark:bg-dark-surface-2">
              <TimeFieldSelect
                ariaLabel={`Hora inicial ${WEEKDAY_LABELS[day.weekday]}`}
                value={day.startTime}
                compact
                disabled={readOnly || !day.isEnabled}
                dataTestId={`wfm-start-${day.weekday.toLowerCase()}`}
                onChange={(nextValue) => onChange(day.weekday, { startTime: nextValue })}
              />
            </div>
            <div className="flex items-center justify-center bg-white px-3 py-3 dark:bg-dark-surface-2">
              <TimeFieldSelect
                ariaLabel={`Hora final ${WEEKDAY_LABELS[day.weekday]}`}
                value={day.endTime}
                compact
                disabled={readOnly || !day.isEnabled}
                dataTestId={`wfm-end-${day.weekday.toLowerCase()}`}
                onChange={(nextValue) => onChange(day.weekday, { endTime: nextValue })}
              />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

interface WfmOperatingHoursManagerProps {
  canEdit: boolean;
  compactFraming?: boolean;
}

export function WfmOperatingHoursManager({
  canEdit,
  compactFraming = false,
}: WfmOperatingHoursManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dispatchSitesWarning, setDispatchSitesWarning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [dispatchSites, setDispatchSites] = useState<WfmDispatchSite[]>([]);
  const [companyWeek, setCompanyWeek] = useState<WeekEditorDay[]>(createEmptyWeek());
  const [blackouts, setBlackouts] = useState<WfmHolidayBlackout[]>([]);
  const [blackoutForm, setBlackoutForm] = useState<BlackoutFormState>(createEmptyBlackoutForm());
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [isSavingCompanyWeek, setIsSavingCompanyWeek] = useState(false);
  const [isSavingBlackout, setIsSavingBlackout] = useState(false);
  const blackoutNameInputRef = useRef<HTMLInputElement | null>(null);

  const dispatchSiteOptions = useMemo(
    () =>
      dispatchSites.map((site) => ({
        value: site.id,
        label: `${site.name} (${site.code})`,
      })),
    [dispatchSites],
  );

  const siteNameMap = useMemo(() => {
    const next = new Map<string, string>();

    dispatchSites.forEach((site) => {
      const label = `${site.name} (${site.code})`;
      next.set(site.id, label);
    });

    return next;
  }, [dispatchSites]);

  const companyWideSiteOptions = useMemo(
    () => [{ value: '', label: 'Toda la empresa' }, ...dispatchSiteOptions],
    [dispatchSiteOptions],
  );
  const blackoutSiteOptions = useMemo(() => {
    if (
      !blackoutForm.siteId ||
      companyWideSiteOptions.some((option) => option.value === blackoutForm.siteId)
    ) {
      return companyWideSiteOptions;
    }

    return [
      ...companyWideSiteOptions,
      {
        value: blackoutForm.siteId,
        label: WFM_SETTINGS_COPY.blackoutsUnavailableSiteLabel,
      },
    ];
  }, [blackoutForm.siteId, companyWideSiteOptions]);

  const siteSelectorMenuClassName =
    'rounded-2xl p-1.5 [&_[role=option]]:min-h-11 [&_[role=option]]:px-3';
  const managerClassName = compactFraming ? 'space-y-3' : 'space-y-4';
  const companyWeekSectionClassName = compactFraming
    ? 'space-y-4'
    : 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2';
  const blackoutsSectionClassName = compactFraming
    ? 'space-y-4 border-t border-gray-100 pt-4 dark:border-dark-border'
    : 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2';

  const loadManager = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setDispatchSitesWarning(null);

    try {
      const [[nextCompanyWeek, nextBlackouts], nextDispatchSitesResult] = await Promise.all([
        Promise.all([wfmApi.businessHours.getCompany(), wfmApi.holidayBlackouts.list()]),
        wfmApi.dispatchSites.list().then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const, value: [] as WfmDispatchSite[] }),
        ),
      ]);

      setDispatchSites(nextDispatchSitesResult.value);
      if (!nextDispatchSitesResult.ok) {
        setDispatchSitesWarning(WFM_SETTINGS_COPY.blackoutsSitesUnavailableDescription);
      }
      setCompanyWeek(normalizeWeek(nextCompanyWeek));
      setBlackouts(nextBlackouts);
    } catch (error) {
      setLoadError(mapError(error, WFM_SETTINGS_COPY.loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadManager();
  }, [loadManager]);

  useEffect(() => {
    if (showBlackoutForm) {
      blackoutNameInputRef.current?.focus();
    }
  }, [showBlackoutForm]);

  const updateWeekDay = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<WeekEditorDay[]>>,
      weekday: BusinessHoursWeekday,
      patch: Partial<WeekEditorDay>,
    ) => {
      setter((current) =>
        current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
      );
    },
    [],
  );

  const handleSaveCompanyWeek = async () => {
    setFeedback(null);
    setIsSavingCompanyWeek(true);

    try {
      const saved = await wfmApi.businessHours.updateCompany(toWeekPayload(companyWeek));
      setCompanyWeek(normalizeWeek(saved));
      setFeedback({
        variant: 'success',
        title: 'Horarios actualizados',
        description: WFM_SETTINGS_COPY.companyWeekSaved,
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible guardar el horario base',
        description: mapError(error, 'Revisa la configuración semanal e intenta de nuevo.'),
      });
    } finally {
      setIsSavingCompanyWeek(false);
    }
  };

  const handleSubmitBlackout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSavingBlackout(true);

    try {
      const parsed = blackoutSchema.parse(blackoutForm);
      const payload = {
        organizationSiteId: toNullableString(parsed.siteId),
        blackoutDate: parsed.blackoutDate,
        isRecurring: parsed.isRecurring,
        name: parsed.name,
        description: toNullableString(parsed.description),
        isEnabled: parsed.isEnabled,
      };

      await (blackoutForm.id
        ? wfmApi.holidayBlackouts.update(blackoutForm.id, payload)
        : wfmApi.holidayBlackouts.create(payload));

      setBlackoutForm(createEmptyBlackoutForm());
      setShowBlackoutForm(false);
      await loadManager();
      setFeedback({
        variant: 'success',
        title: blackoutForm.id ? 'Cierre actualizado' : 'Cierre creado',
        description: WFM_SETTINGS_COPY.blackoutsSaved,
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible guardar el cierre',
        description: mapError(error, 'Revisa los datos del cierre e intenta de nuevo.'),
      });
    } finally {
      setIsSavingBlackout(false);
    }
  };

  const handleEditBlackout = (blackout: WfmHolidayBlackout) => {
    setBlackoutForm({
      id: blackout.id,
      siteId: blackout.organizationSiteId ?? '',
      blackoutDate: blackout.blackoutDate,
      isRecurring: blackout.isRecurring,
      name: blackout.name,
      description: blackout.description ?? '',
      isEnabled: blackout.isEnabled,
    });
    setShowBlackoutForm(true);
  };

  const handleDeleteBlackout = async (blackout: WfmHolidayBlackout) => {
    if (!(globalThis.confirm?.(WFM_SETTINGS_COPY.blackoutDeleteConfirm(blackout.name)) ?? true)) {
      return;
    }

    setFeedback(null);

    try {
      await wfmApi.holidayBlackouts.remove(blackout.id);
      await loadManager();
      setFeedback({
        variant: 'success',
        title: 'Cierre eliminado',
        description: WFM_SETTINGS_COPY.blackoutsDeleted,
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible eliminar el cierre',
        description: mapError(error, 'Intenta de nuevo en unos segundos.'),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <PortalSkeletonBlock className="h-24" />
        <PortalSkeletonBlock className="h-72" />
        <PortalSkeletonBlock className="h-72" />
      </div>
    );
  }

  if (loadError) {
    return (
      <PortalAlert
        variant="error"
        title="Horarios de operación no disponibles"
        description={loadError}
        icon={CircleAlert}
        action={
          <Button type="button" variant="secondary" onClick={() => void loadManager()}>
            Reintentar carga
          </Button>
        }
      />
    );
  }

  return (
    <div className={managerClassName}>
      {!compactFraming && (
        <PortalAlert
          variant="info"
          title={WFM_SETTINGS_COPY.contextTitle}
          description={WFM_SETTINGS_COPY.contextDescription}
          icon={Clock3}
        />
      )}

      {!canEdit && (
        <PortalAlert
          variant="info"
          title="Modo solo lectura"
          description={WFM_SETTINGS_COPY.readOnlyDescription}
          icon={ShieldAlert}
        />
      )}

      {feedback && (
        <PortalAlert
          variant={feedback.variant}
          title={feedback.title}
          description={feedback.description}
          icon={feedback.variant === 'success' ? Clock3 : CircleAlert}
        />
      )}

      <section className={companyWeekSectionClassName} data-testid="wfm-company-week-section">
        <PortalSectionHeader
          eyebrow={WFM_SETTINGS_COPY.companyWeekEyebrow}
          title={WFM_SETTINGS_COPY.companyWeekTitle}
          description={WFM_SETTINGS_COPY.companyWeekDescription}
        />
        <div className="mt-4 space-y-4">
          <WeekGrid
            week={companyWeek}
            readOnly={!canEdit}
            onChange={(weekday, patch) => updateWeekDay(setCompanyWeek, weekday, patch)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className={MUTED_CLASS}>{WFM_SETTINGS_COPY.companyWeekHint}</p>
            {canEdit && (
              <Button type="button" loading={isSavingCompanyWeek} onClick={handleSaveCompanyWeek}>
                {WFM_SETTINGS_COPY.companyWeekSaveAction}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section className={blackoutsSectionClassName} data-testid="wfm-blackouts-section">
        <PortalSectionHeader
          eyebrow={WFM_SETTINGS_COPY.blackoutsEyebrow}
          title={WFM_SETTINGS_COPY.blackoutsTitle}
          description={WFM_SETTINGS_COPY.blackoutsDescription}
        />
        <div className="mt-4 space-y-4">
          {dispatchSitesWarning ? (
            <PortalAlert
              variant="warning"
              title={WFM_SETTINGS_COPY.blackoutsSitesUnavailableTitle}
              description={dispatchSitesWarning}
              icon={AlertTriangle}
            />
          ) : null}

          {blackouts.length === 0 ? (
            <PortalEmptyState
              icon={CalendarDays}
              title="Sin cierres especiales"
              description={WFM_SETTINGS_COPY.blackoutsEmptyDescription}
            />
          ) : (
            <div className="space-y-3">
              {blackouts.map((blackout) => (
                <div
                  key={blackout.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {blackout.name}
                        </h3>
                        <span className={BADGE_CLASS}>
                          {blackout.isRecurring
                            ? WFM_SETTINGS_COPY.recurringBadge
                            : WFM_SETTINGS_COPY.oneTimeBadge}
                        </span>
                        {!blackout.isEnabled && (
                          <span className={BADGE_CLASS}>
                            {WFM_SETTINGS_COPY.blackoutInactiveBadge}
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 ${MUTED_CLASS}`}>
                        {blackout.blackoutDate}
                        {blackout.organizationSiteId
                          ? ` · ${siteNameMap.get(blackout.organizationSiteId) ?? WFM_SETTINGS_COPY.blackoutsUnavailableSiteLabel}`
                          : ' · Aplica a toda la empresa'}
                      </p>
                      {blackout.description && (
                        <p className={`mt-1 ${MUTED_CLASS}`}>{blackout.description}</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleEditBlackout(blackout)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="softDestructive"
                          size="sm"
                          onClick={() => void handleDeleteBlackout(blackout)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-iwana-surface-soft/80 p-4 dark:border-dark-border dark:bg-dark-surface-3/60">
              {!showBlackoutForm ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="portal-eyebrow">{WFM_SETTINGS_COPY.blackoutsFormTitle}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {WFM_SETTINGS_COPY.blackoutsFormHelper}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-expanded={showBlackoutForm}
                    aria-controls="wfm-blackout-form"
                    onClick={() => setShowBlackoutForm(true)}
                    data-testid="wfm-show-blackout-form-btn"
                  >
                    {WFM_SETTINGS_COPY.blackoutsShowFormAction}
                  </Button>
                </div>
              ) : (
                <form
                  id="wfm-blackout-form"
                  onSubmit={handleSubmitBlackout}
                  className="space-y-4"
                  data-testid="wfm-blackout-form"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="portal-eyebrow">{WFM_SETTINGS_COPY.blackoutsFormTitle}</p>
                      <p className={MUTED_CLASS}>{WFM_SETTINGS_COPY.blackoutFormDescription}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowBlackoutForm(false);
                        setBlackoutForm(createEmptyBlackoutForm());
                      }}
                    >
                      {WFM_SETTINGS_COPY.blackoutsHideFormAction}
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="wfm-blackout-name" className={LABEL_CLASS}>
                        Nombre del cierre
                      </label>
                      <input
                        id="wfm-blackout-name"
                        ref={blackoutNameInputRef}
                        className={INPUT_CLASS}
                        value={blackoutForm.name}
                        onChange={(event) =>
                          setBlackoutForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <DatePicker
                        id="wfm-blackout-date"
                        label="Fecha"
                        placeholder="dd/mm/aaaa"
                        value={toDateFromLocalDateValue(blackoutForm.blackoutDate)}
                        onChange={(date) =>
                          setBlackoutForm((current) => ({
                            ...current,
                            blackoutDate: toLocalDateValue(date),
                          }))
                        }
                        buttonClassName="h-[46px] rounded-[1.15rem] border-gray-200 px-4 shadow-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="wfm-blackout-site" className={LABEL_CLASS}>
                        Sede empresarial
                      </label>
                      <Select
                        id="wfm-blackout-site"
                        options={blackoutSiteOptions}
                        menuClassName={siteSelectorMenuClassName}
                        value={blackoutForm.siteId}
                        onChange={(event) =>
                          setBlackoutForm((current) => ({ ...current, siteId: event.target.value }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 dark:border-dark-border dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={blackoutForm.isRecurring}
                          onChange={(event) =>
                            setBlackoutForm((current) => ({
                              ...current,
                              isRecurring: event.target.checked,
                            }))
                          }
                        />
                        {WFM_SETTINGS_COPY.recurringCheckbox}
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 dark:border-dark-border dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={blackoutForm.isEnabled}
                          onChange={(event) =>
                            setBlackoutForm((current) => ({
                              ...current,
                              isEnabled: event.target.checked,
                            }))
                          }
                        />
                        Activo
                      </label>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="wfm-blackout-description" className={LABEL_CLASS}>
                      Descripción
                    </label>
                    <textarea
                      id="wfm-blackout-description"
                      className={INPUT_CLASS}
                      rows={3}
                      value={blackoutForm.description}
                      onChange={(event) =>
                        setBlackoutForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <Button type="submit" loading={isSavingBlackout}>
                      {blackoutForm.id ? 'Guardar cierre' : 'Crear cierre'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
