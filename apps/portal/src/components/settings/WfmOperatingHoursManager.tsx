'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { z } from 'zod';
import { BusinessHoursWeekday, UserRole } from '@iwana/shared';
import { Button, Card, CardContent, CardHeader, DatePicker, Select } from '@iwana/ui';
import {
  ApiError,
  usersApi,
  wfmApi,
  type InternalUser,
  type WfmBusinessHoursDay,
  type WfmHolidayBlackout,
  type WfmOperatingSite,
  type WfmTechnicianBusinessOverride,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';

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
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => {
  const value = String(index).padStart(2, '0');
  return { value, label: value };
});

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

type OverrideFormState = {
  id: string | null;
  userId: string;
  siteId: string;
  overrideDate: string;
  weekday: '' | BusinessHoursWeekday;
  startTime: string;
  endTime: string;
  isEnabled: boolean;
  reason: string;
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

const overrideSchema = z
  .object({
    userId: z.string().trim().min(1, 'Selecciona un técnico.'),
    siteId: z.string().trim(),
    overrideDate: z.string().trim(),
    weekday: z.union([z.literal(''), z.nativeEnum(BusinessHoursWeekday)]),
    startTime: z.string().trim(),
    endTime: z.string().trim(),
    isEnabled: z.boolean(),
    reason: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    if (!value.overrideDate && !value.weekday) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debes indicar una fecha puntual o un día de semana.',
        path: ['overrideDate'],
      });
    }

    if (value.isEnabled) {
      if (!value.startTime || !value.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La excepción habilitada requiere hora inicial y final.',
          path: ['startTime'],
        });
      } else if (value.startTime >= value.endTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La hora final debe ser posterior a la inicial.',
          path: ['endTime'],
        });
      }
    }
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

function createEmptyOverrideForm(): OverrideFormState {
  return {
    id: null,
    userId: '',
    siteId: '',
    overrideDate: '',
    weekday: '',
    startTime: '',
    endTime: '',
    isEnabled: true,
    reason: '',
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

function formatUserLabel(user: InternalUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email;
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

function splitTimeValue(value: string): { hour: string; minute: string } {
  const [rawHour = '', rawMinute = ''] = value.split(':');

  return {
    hour: /^\d{2}$/.test(rawHour) ? rawHour : '',
    minute: /^\d{2}$/.test(rawMinute) ? rawMinute : '',
  };
}

function mergeTimeValue(
  currentValue: string,
  part: 'hour' | 'minute',
  nextPartValue: string,
): string {
  if (!nextPartValue) {
    return '';
  }

  const currentParts = splitTimeValue(currentValue);
  const nextHour = part === 'hour' ? nextPartValue : currentParts.hour || '00';
  const nextMinute = part === 'minute' ? nextPartValue : currentParts.minute || '00';

  return `${nextHour}:${nextMinute}`;
}

interface TimeSelectFieldProps {
  value: string;
  disabled: boolean;
  ariaLabelPrefix: string;
  onChange: (nextValue: string) => void;
  compact?: boolean;
}

function TimeSelectField({
  value,
  disabled,
  ariaLabelPrefix,
  onChange,
  compact = false,
}: TimeSelectFieldProps) {
  const current = splitTimeValue(value);
  // justify-center + gap-1: texto y chevron agrupados en el centro del trigger, sin separación.
  const selectClassName = compact
    ? 'h-10 min-w-0 justify-center gap-1 rounded-[1.15rem] px-2 py-2 text-sm shadow-none [&>span]:font-normal [&>span]:normal-case [&>span]:tracking-normal [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0'
    : 'min-w-0';
  const menuClassName = compact
    ? 'rounded-[1.35rem] p-1.5 [&_[role=option]]:min-h-10 [&_[role=option]]:justify-center [&_[role=option]]:px-2 [&_[role=option]]:text-center [&_[role=option]>span]:w-full [&_[role=option]>span]:text-center'
    : 'rounded-2xl p-1.5 [&_[role=option]]:min-h-11 [&_[role=option]]:justify-center [&_[role=option]]:px-3 [&_[role=option]]:text-center [&_[role=option]>span]:w-full [&_[role=option]>span]:text-center';

  return (
    <div
      className={
        compact
          ? 'grid grid-cols-[60px_auto_60px] items-center justify-center gap-1.5'
          : 'grid max-w-[220px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2'
      }
    >
      <Select
        aria-label={`${ariaLabelPrefix} hora`}
        className={selectClassName}
        disabled={disabled}
        options={HOUR_OPTIONS}
        menuClassName={menuClassName}
        menuHorizontalAlign="center"
        menuMaxHeight={compact ? '240px' : '260px'}
        menuWidth={compact ? 92 : 112}
        placeholder="hh"
        value={current.hour}
        onChange={(event) => onChange(mergeTimeValue(value, 'hour', event.target.value))}
      />
      <span
        aria-hidden="true"
        className={
          compact
            ? 'text-sm font-medium text-gray-400 dark:text-gray-500'
            : 'text-base font-semibold text-gray-400 dark:text-gray-500'
        }
      >
        :
      </span>
      <Select
        aria-label={`${ariaLabelPrefix} minutos`}
        className={selectClassName}
        disabled={disabled}
        options={MINUTE_OPTIONS}
        menuClassName={menuClassName}
        menuHorizontalAlign="center"
        menuMaxHeight={compact ? '240px' : '260px'}
        menuWidth={compact ? 92 : 112}
        placeholder="mm"
        value={current.minute}
        onChange={(event) => onChange(mergeTimeValue(value, 'minute', event.target.value))}
      />
    </div>
  );
}

interface WeekGridProps {
  week: WeekEditorDay[];
  onChange: (weekday: BusinessHoursWeekday, patch: Partial<WeekEditorDay>) => void;
  readOnly: boolean;
}

function WeekGrid({ week, onChange, readOnly }: WeekGridProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border">
      <div className="grid min-w-[680px] grid-cols-[minmax(120px,1.3fr)_120px_168px_168px] gap-px bg-gray-200 dark:bg-dark-border">
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
              <TimeSelectField
                ariaLabelPrefix={`Hora inicial ${WEEKDAY_LABELS[day.weekday]}`}
                value={day.startTime}
                compact
                disabled={readOnly || !day.isEnabled}
                onChange={(nextValue) => onChange(day.weekday, { startTime: nextValue })}
              />
            </div>
            <div className="flex items-center justify-center bg-white px-3 py-3 dark:bg-dark-surface-2">
              <TimeSelectField
                ariaLabelPrefix={`Hora final ${WEEKDAY_LABELS[day.weekday]}`}
                value={day.endTime}
                compact
                disabled={readOnly || !day.isEnabled}
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
}

export function WfmOperatingHoursManager({ canEdit }: WfmOperatingHoursManagerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [sites, setSites] = useState<WfmOperatingSite[]>([]);
  const [companyWeek, setCompanyWeek] = useState<WeekEditorDay[]>(createEmptyWeek());
  const [siteWeek, setSiteWeek] = useState<WeekEditorDay[]>(createEmptyWeek());
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [isSiteWeekLoading, setIsSiteWeekLoading] = useState(false);
  const [isSitesAccordionOpen, setIsSitesAccordionOpen] = useState(false);
  const [overrides, setOverrides] = useState<WfmTechnicianBusinessOverride[]>([]);
  const [blackouts, setBlackouts] = useState<WfmHolidayBlackout[]>([]);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [siteForm, setSiteForm] = useState<SiteFormState>(createEmptySiteForm());
  const [overrideForm, setOverrideForm] = useState<OverrideFormState>(createEmptyOverrideForm());
  const [blackoutForm, setBlackoutForm] = useState<BlackoutFormState>(createEmptyBlackoutForm());
  const [isSavingCompanyWeek, setIsSavingCompanyWeek] = useState(false);
  const [isSavingSiteWeek, setIsSavingSiteWeek] = useState(false);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isSavingBlackout, setIsSavingBlackout] = useState(false);

  const technicians = useMemo(
    () =>
      users.filter((user) =>
        [UserRole.TECHNICIAN, UserRole.CONTRACTOR].includes(user.role as UserRole),
      ),
    [users],
  );

  const siteNameMap = useMemo(
    () => new Map(sites.map((site) => [site.id, `${site.name} (${site.code})`])),
    [sites],
  );

  const siteOptions = useMemo(
    () => sites.map((site) => ({ value: site.id, label: `${site.name} (${site.code})` })),
    [sites],
  );

  const siteSelectorMenuClassName =
    'rounded-2xl p-1.5 [&_[role=option]]:min-h-11 [&_[role=option]]:px-3';

  const overrideTechnicianOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona un técnico' },
      ...technicians.map((user) => ({ value: user.id, label: formatUserLabel(user) })),
    ],
    [technicians],
  );

  const optionalSiteOptions = useMemo(
    () => [{ value: '', label: 'Todas las sedes' }, ...siteOptions],
    [siteOptions],
  );

  const overrideWeekdayOptions = useMemo(
    () => [
      { value: '', label: 'Sin recurrencia' },
      ...ORDERED_WEEKDAYS.map((weekday) => ({ value: weekday, label: WEEKDAY_LABELS[weekday] })),
    ],
    [],
  );

  const companyWideSiteOptions = useMemo(
    () => [{ value: '', label: 'Toda la empresa' }, ...siteOptions],
    [siteOptions],
  );

  const userNameMap = useMemo(
    () => new Map(technicians.map((user) => [user.id, formatUserLabel(user)])),
    [technicians],
  );

  const loadSiteWeek = useCallback(async (siteId: string) => {
    if (!siteId) {
      setSiteWeek(createEmptyWeek());
      return;
    }

    setIsSiteWeekLoading(true);

    try {
      const nextWeek = await wfmApi.operatingSites.getBusinessHours(siteId);
      setSiteWeek(normalizeWeek(nextWeek));
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible cargar el horario por sede',
        description: mapError(error, 'Intenta de nuevo en unos segundos.'),
      });
      setSiteWeek(createEmptyWeek());
    } finally {
      setIsSiteWeekLoading(false);
    }
  }, []);

  const loadManager = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setLoadError(null);

    try {
      const [nextSites, nextCompanyWeek, nextOverrides, nextBlackouts, userResponse] =
        await Promise.all([
          wfmApi.operatingSites.list(),
          wfmApi.businessHours.getCompany(),
          wfmApi.technicianBusinessOverrides.list(),
          wfmApi.holidayBlackouts.list(),
          usersApi.list({ limit: 200, status: 'ACTIVE' }),
        ]);

      setSites(nextSites);
      setCompanyWeek(normalizeWeek(nextCompanyWeek));
      setOverrides(nextOverrides);
      setBlackouts(nextBlackouts);
      setUsers(userResponse.data);
      setSelectedSiteId((current) => {
        if (current && nextSites.some((site) => site.id === current)) {
          return current;
        }

        return nextSites[0]?.id ?? '';
      });
    } catch (error) {
      setLoadError(
        mapError(error, 'No fue posible cargar la configuración de operación de campo.'),
      );
    } finally {
      if (mode === 'initial') {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadManager();
  }, [loadManager]);

  useEffect(() => {
    void loadSiteWeek(selectedSiteId);
  }, [loadSiteWeek, selectedSiteId]);

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
        title: 'Horario base actualizado',
        description: 'La semana operativa de empresa quedó guardada.',
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

  const handleSaveSiteWeek = async () => {
    if (!selectedSiteId) {
      return;
    }

    setFeedback(null);
    setIsSavingSiteWeek(true);

    try {
      const saved = await wfmApi.operatingSites.updateBusinessHours(
        selectedSiteId,
        toWeekPayload(siteWeek),
      );
      setSiteWeek(normalizeWeek(saved));
      setFeedback({
        variant: 'success',
        title: 'Horario de sede actualizado',
        description: 'La sede operativa ya tiene su semana vigente.',
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible guardar el horario de sede',
        description: mapError(
          error,
          'Revisa la configuración semanal de la sede e intenta de nuevo.',
        ),
      });
    } finally {
      setIsSavingSiteWeek(false);
    }
  };

  const handleSubmitSite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSavingSite(true);

    try {
      const parsed = siteSchema.parse(siteForm);
      const parsedCoordinates = parseLatLngPair(parsed.coordinates);
      const payload = {
        name: parsed.name,
        code: parsed.code.toUpperCase(),
        address: toNullableString(parsed.address),
        municipality: toNullableString(parsed.municipality),
        sector: toNullableString(parsed.sector),
        latitude: parsedCoordinates.latitude,
        longitude: parsedCoordinates.longitude,
        isActive: parsed.isActive,
      };

      const saved = siteForm.id
        ? await wfmApi.operatingSites.update(siteForm.id, payload)
        : await wfmApi.operatingSites.create(payload);

      setSiteForm(createEmptySiteForm());
      setIsSitesAccordionOpen(true);
      await loadManager('refresh');
      setSelectedSiteId(saved.id);
      setFeedback({
        variant: 'success',
        title: siteForm.id ? 'Sede actualizada' : 'Sede creada',
        description: 'La configuración base de la sede ya quedó registrada.',
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible guardar la sede',
        description: mapError(error, 'Revisa los datos de la sede e intenta de nuevo.'),
      });
    } finally {
      setIsSavingSite(false);
    }
  };

  const handleEditSite = (site: WfmOperatingSite) => {
    setIsSitesAccordionOpen(true);
    setSiteForm({
      id: site.id,
      name: site.name,
      code: site.code,
      address: site.address ?? '',
      municipality: site.municipality ?? '',
      sector: site.sector ?? '',
      coordinates: formatLatLngPair(site.latitude, site.longitude),
      isActive: site.isActive,
    });
  };

  const handleDeleteSite = async (site: WfmOperatingSite) => {
    if (!(globalThis.confirm?.(`Eliminar la sede ${site.name}?`) ?? true)) {
      return;
    }

    setFeedback(null);

    try {
      await wfmApi.operatingSites.remove(site.id);
      await loadManager('refresh');
      setFeedback({
        variant: 'success',
        title: 'Sede eliminada',
        description: 'La sede operativa dejó de estar disponible para la operación de campo.',
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible eliminar la sede',
        description: mapError(error, 'Intenta de nuevo en unos segundos.'),
      });
    }
  };

  const handleSubmitOverride = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSavingOverride(true);

    try {
      const parsed = overrideSchema.parse(overrideForm);
      const payload = {
        userId: parsed.userId,
        siteId: toNullableString(parsed.siteId),
        overrideDate: toNullableString(parsed.overrideDate),
        weekday: parsed.weekday || null,
        startTime: parsed.isEnabled ? toNullableString(parsed.startTime) : null,
        endTime: parsed.isEnabled ? toNullableString(parsed.endTime) : null,
        isEnabled: parsed.isEnabled,
        reason: toNullableString(parsed.reason),
      };

      await (overrideForm.id
        ? wfmApi.technicianBusinessOverrides.update(overrideForm.id, payload)
        : wfmApi.technicianBusinessOverrides.create(payload));

      setOverrideForm(createEmptyOverrideForm());
      await loadManager('refresh');
      setFeedback({
        variant: 'success',
        title: overrideForm.id ? 'Excepción actualizada' : 'Excepción creada',
        description: 'La regla operativa por técnico ya quedó vigente.',
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible guardar la excepción',
        description: mapError(error, 'Revisa los datos de la excepción e intenta de nuevo.'),
      });
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleEditOverride = (override: WfmTechnicianBusinessOverride) => {
    setOverrideForm({
      id: override.id,
      userId: override.userId,
      siteId: override.siteId ?? '',
      overrideDate: override.overrideDate ?? '',
      weekday: override.weekday ?? '',
      startTime: override.startTime ?? '',
      endTime: override.endTime ?? '',
      isEnabled: override.isEnabled,
      reason: override.reason ?? '',
    });
  };

  const handleDeleteOverride = async (override: WfmTechnicianBusinessOverride) => {
    if (!(globalThis.confirm?.('Eliminar esta excepción operativa?') ?? true)) {
      return;
    }

    setFeedback(null);

    try {
      await wfmApi.technicianBusinessOverrides.remove(override.id);
      await loadManager('refresh');
      setFeedback({
        variant: 'success',
        title: 'Excepción eliminada',
        description: 'La excepción operativa del técnico fue retirada.',
      });
    } catch (error) {
      setFeedback({
        variant: 'error',
        title: 'No fue posible eliminar la excepción',
        description: mapError(error, 'Intenta de nuevo en unos segundos.'),
      });
    }
  };

  const handleSubmitBlackout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setIsSavingBlackout(true);

    try {
      const parsed = blackoutSchema.parse(blackoutForm);
      const payload = {
        siteId: toNullableString(parsed.siteId),
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
      await loadManager('refresh');
      setFeedback({
        variant: 'success',
        title: blackoutForm.id ? 'Cierre actualizado' : 'Cierre creado',
        description: 'El festivo o cierre especial ya quedó registrado.',
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
      siteId: blackout.siteId ?? '',
      blackoutDate: blackout.blackoutDate,
      isRecurring: blackout.isRecurring,
      name: blackout.name,
      description: blackout.description ?? '',
      isEnabled: blackout.isEnabled,
    });
  };

  const handleDeleteBlackout = async (blackout: WfmHolidayBlackout) => {
    if (!(globalThis.confirm?.(`Eliminar el cierre ${blackout.name}?`) ?? true)) {
      return;
    }

    setFeedback(null);

    try {
      await wfmApi.holidayBlackouts.remove(blackout.id);
      await loadManager('refresh');
      setFeedback({
        variant: 'success',
        title: 'Cierre eliminado',
        description: 'El calendario especial de la operación de campo fue actualizado.',
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
          <Button type="button" variant="secondary" onClick={() => void loadManager('refresh')}>
            Reintentar carga
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
        <CardHeader>
          <PortalSectionHeader
            eyebrow="Operación de campo"
            title="Horarios operativos"
            description="Administra sedes, horario base, excepciones por técnico y cierres especiales sin inflar la configuración general del tenant."
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isRefreshing}
                onClick={() => void loadManager('refresh')}
              >
                <RefreshCcw className="h-4 w-4" />
                Recargar
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className={BADGE_CLASS}>Sedes activas</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {sites.length}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className={BADGE_CLASS}>Excepciones</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {overrides.length}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className={BADGE_CLASS}>Cierres</p>
              <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                {blackouts.length}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3">
              <p className={BADGE_CLASS}>Precedencia</p>
              <p className="mt-3 text-sm font-medium text-gray-900 dark:text-white">
                Técnico {'>'} festivo {'>'} sede {'>'} empresa
              </p>
            </div>
          </div>

          {!canEdit && (
            <PortalAlert
              variant="info"
              title="Modo solo lectura"
              description="Tu rol puede consultar la configuración de operación de campo, pero no modificar horarios, sedes ni cierres."
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
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
        <CardHeader>
          <PortalSectionHeader
            title="Horario base de empresa"
            description="Define la semana laboral que aplica cuando una sede no tiene una especialización propia."
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <WeekGrid
            week={companyWeek}
            readOnly={!canEdit}
            onChange={(weekday, patch) => updateWeekDay(setCompanyWeek, weekday, patch)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className={MUTED_CLASS}>
              Cada día cerrado deja la ventana en blanco para la operación de campo.
            </p>
            {canEdit && (
              <Button type="button" loading={isSavingCompanyWeek} onClick={handleSaveCompanyWeek}>
                Guardar horario base
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
          <CardHeader>
            <PortalSectionHeader
              title="Sedes operativas"
              description="Registra oficinas o bases reales desde donde se organiza la operación de campo."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {sites.length === 0 ? (
              <PortalEmptyState
                icon={Building2}
                title="Sin sedes operativas"
                description="Crea la primera sede para habilitar horarios específicos por base operativa."
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-gray-50 dark:hover:bg-dark-surface-2"
                  aria-expanded={isSitesAccordionOpen}
                  onClick={() => setIsSitesAccordionOpen((current) => !current)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Sedes registradas
                    </p>
                    <p className={MUTED_CLASS}>
                      {sites.length} {sites.length === 1 ? 'sede creada' : 'sedes creadas'} para la
                      operación.
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${
                      isSitesAccordionOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isSitesAccordionOpen && (
                  <div className="space-y-3 border-t border-gray-200 px-4 py-4 dark:border-dark-border">
                    {sites.map((site) => (
                      <div
                        key={site.id}
                        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                {site.name}
                              </h3>
                              <span className={BADGE_CLASS}>{site.code}</span>
                              {!site.isActive && <span className={BADGE_CLASS}>Inactiva</span>}
                            </div>
                            <p className={`mt-1 ${MUTED_CLASS}`}>
                              {[site.municipality, site.sector, site.address]
                                .filter((value): value is string => Boolean(value))
                                .join(' · ') || 'Sin ubicación operativa detallada'}
                            </p>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleEditSite(site)}
                              >
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="softDestructive"
                                size="sm"
                                onClick={() => void handleDeleteSite(site)}
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
              </div>
            )}

            {canEdit && (
              <form
                onSubmit={handleSubmitSite}
                className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {siteForm.id ? 'Editar sede operativa' : 'Nueva sede operativa'}
                    </p>
                    <p className={MUTED_CLASS}>Usa una sede física real, no un nodo comercial.</p>
                  </div>
                  {siteForm.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSiteForm(createEmptySiteForm())}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="wfm-site-name" className={LABEL_CLASS}>
                      Nombre de la sede
                    </label>
                    <input
                      id="wfm-site-name"
                      className={INPUT_CLASS}
                      value={siteForm.name}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="wfm-site-code" className={LABEL_CLASS}>
                      Código operativo
                    </label>
                    <input
                      id="wfm-site-code"
                      className={INPUT_CLASS}
                      value={siteForm.code}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, code: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="wfm-site-municipality" className={LABEL_CLASS}>
                      Municipio
                    </label>
                    <input
                      id="wfm-site-municipality"
                      className={INPUT_CLASS}
                      value={siteForm.municipality}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, municipality: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="wfm-site-sector" className={LABEL_CLASS}>
                      Sector
                    </label>
                    <input
                      id="wfm-site-sector"
                      className={INPUT_CLASS}
                      value={siteForm.sector}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, sector: event.target.value }))
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="wfm-site-address" className={LABEL_CLASS}>
                      Dirección base
                    </label>
                    <input
                      id="wfm-site-address"
                      className={INPUT_CLASS}
                      value={siteForm.address}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, address: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <div>
                    <label htmlFor="wfm-site-coordinates" className={LABEL_CLASS}>
                      Coordenadas (Lat, Lng)
                    </label>
                    <input
                      id="wfm-site-coordinates"
                      className={INPUT_CLASS}
                      placeholder="4.6097100, -74.0817500"
                      value={siteForm.coordinates}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, coordinates: event.target.value }))
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 self-end rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 dark:border-dark-border dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={siteForm.isActive}
                      onChange={(event) =>
                        setSiteForm((current) => ({ ...current, isActive: event.target.checked }))
                      }
                    />
                    Sede activa
                  </label>
                </div>

                <div className="flex items-center justify-end">
                  <Button type="submit" loading={isSavingSite}>
                    {siteForm.id ? 'Guardar sede' : 'Crear sede'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
          <CardHeader>
            <PortalSectionHeader
              title="Horario por sede"
              description="Especializa la semana base cuando una sede tiene una operación distinta."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {!sites.length ? (
              <PortalEmptyState
                icon={Clock3}
                title="Sin horario por sede"
                description="Primero crea una sede operativa para configurar su calendario semanal."
              />
            ) : (
              <>
                <div>
                  <label htmlFor="wfm-site-selector" className={LABEL_CLASS}>
                    Sede operativa
                  </label>
                  <Select
                    id="wfm-site-selector"
                    aria-label="Sede operativa"
                    options={siteOptions}
                    menuClassName={siteSelectorMenuClassName}
                    value={selectedSiteId}
                    onChange={(event) => setSelectedSiteId(event.target.value)}
                  />
                </div>

                {isSiteWeekLoading ? (
                  <PortalSkeletonBlock className="h-72" />
                ) : (
                  <WeekGrid
                    week={siteWeek}
                    readOnly={!canEdit}
                    onChange={(weekday, patch) => updateWeekDay(setSiteWeek, weekday, patch)}
                  />
                )}

                <div className="flex items-center justify-between gap-3">
                  <p className={MUTED_CLASS}>
                    Si una sede no tiene horas propias, el resolvedor cae al horario base de
                    empresa.
                  </p>
                  {canEdit && (
                    <Button type="button" loading={isSavingSiteWeek} onClick={handleSaveSiteWeek}>
                      Guardar horario de sede
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
          <CardHeader>
            <PortalSectionHeader
              title="Excepciones por técnico"
              description="Permite abrir o cerrar una fecha puntual o un día recurrente para un técnico específico."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {overrides.length === 0 ? (
              <PortalEmptyState
                icon={CalendarDays}
                title="Sin excepciones configuradas"
                description="La operación usará festivos, horarios de sede y horario base hasta que registres excepciones por técnico."
              />
            ) : (
              <div className="space-y-3">
                {overrides.map((override) => (
                  <div
                    key={override.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {userNameMap.get(override.userId) ?? override.userId}
                          </h3>
                          <span className={BADGE_CLASS}>
                            {override.isEnabled ? 'Abierto' : 'Cerrado'}
                          </span>
                        </div>
                        <p className={`mt-1 ${MUTED_CLASS}`}>
                          {override.overrideDate
                            ? `Fecha puntual ${override.overrideDate}`
                            : `Cada ${override.weekday ? WEEKDAY_LABELS[override.weekday] : 'día configurado'}`}
                          {override.siteId
                            ? ` · ${siteNameMap.get(override.siteId) ?? override.siteId}`
                            : ' · Aplica a todas las sedes'}
                          {override.isEnabled && override.startTime && override.endTime
                            ? ` · ${override.startTime} a ${override.endTime}`
                            : ''}
                        </p>
                        {override.reason && (
                          <p className={`mt-1 ${MUTED_CLASS}`}>{override.reason}</p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEditOverride(override)}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="softDestructive"
                            size="sm"
                            onClick={() => void handleDeleteOverride(override)}
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
              <form
                onSubmit={handleSubmitOverride}
                className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {overrideForm.id ? 'Editar excepción' : 'Nueva excepción'}
                    </p>
                    <p className={MUTED_CLASS}>
                      Las excepciones ganan sobre festivos, sede y empresa.
                    </p>
                  </div>
                  {overrideForm.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setOverrideForm(createEmptyOverrideForm())}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="wfm-override-user" className={LABEL_CLASS}>
                      Técnico
                    </label>
                    <Select
                      id="wfm-override-user"
                      options={overrideTechnicianOptions}
                      menuClassName={siteSelectorMenuClassName}
                      value={overrideForm.userId}
                      onChange={(event) =>
                        setOverrideForm((current) => ({ ...current, userId: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="wfm-override-site" className={LABEL_CLASS}>
                      Sede operativa
                    </label>
                    <Select
                      id="wfm-override-site"
                      options={optionalSiteOptions}
                      menuClassName={siteSelectorMenuClassName}
                      value={overrideForm.siteId}
                      onChange={(event) =>
                        setOverrideForm((current) => ({ ...current, siteId: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <DatePicker
                      id="wfm-override-date"
                      label="Fecha puntual"
                      placeholder="dd/mm/aaaa"
                      value={toDateFromLocalDateValue(overrideForm.overrideDate)}
                      onChange={(date) =>
                        setOverrideForm((current) => ({
                          ...current,
                          overrideDate: toLocalDateValue(date),
                        }))
                      }
                      buttonClassName="h-[46px] rounded-[1.15rem] border-gray-200 px-4 shadow-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="wfm-override-weekday" className={LABEL_CLASS}>
                      Día recurrente
                    </label>
                    <Select
                      id="wfm-override-weekday"
                      options={overrideWeekdayOptions}
                      menuClassName={siteSelectorMenuClassName}
                      value={overrideForm.weekday}
                      onChange={(event) =>
                        setOverrideForm((current) => ({
                          ...current,
                          weekday: event.target.value as '' | BusinessHoursWeekday,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex items-center gap-2 self-end rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 dark:border-dark-border dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={overrideForm.isEnabled}
                      onChange={(event) =>
                        setOverrideForm((current) => ({
                          ...current,
                          isEnabled: event.target.checked,
                        }))
                      }
                    />
                    Excepción habilitada
                  </label>
                  <div>
                    <label htmlFor="wfm-override-start" className={LABEL_CLASS}>
                      Hora inicial
                    </label>
                    <div id="wfm-override-start">
                      <TimeSelectField
                        ariaLabelPrefix="Hora inicial excepción"
                        disabled={!overrideForm.isEnabled}
                        value={overrideForm.startTime}
                        onChange={(nextValue) =>
                          setOverrideForm((current) => ({ ...current, startTime: nextValue }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="wfm-override-end" className={LABEL_CLASS}>
                      Hora final
                    </label>
                    <div id="wfm-override-end">
                      <TimeSelectField
                        ariaLabelPrefix="Hora final excepción"
                        disabled={!overrideForm.isEnabled}
                        value={overrideForm.endTime}
                        onChange={(nextValue) =>
                          setOverrideForm((current) => ({ ...current, endTime: nextValue }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="wfm-override-reason" className={LABEL_CLASS}>
                    Motivo operativo
                  </label>
                  <textarea
                    id="wfm-override-reason"
                    className={INPUT_CLASS}
                    rows={3}
                    value={overrideForm.reason}
                    onChange={(event) =>
                      setOverrideForm((current) => ({ ...current, reason: event.target.value }))
                    }
                  />
                </div>

                <div className="flex items-center justify-end">
                  <Button type="submit" loading={isSavingOverride}>
                    {overrideForm.id ? 'Guardar excepción' : 'Crear excepción'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-gray-200 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
          <CardHeader>
            <PortalSectionHeader
              title="Festivos y cierres especiales"
              description="Bloquea fechas a nivel tenant o por sede cuando la operación no debe generar agenda."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {blackouts.length === 0 ? (
              <PortalEmptyState
                icon={CalendarDays}
                title="Sin cierres especiales"
                description="Registra festivos nacionales, cierres por sede o mantenimientos operativos cuando aplique."
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
                            {blackout.isRecurring ? 'Recurrente' : 'Puntual'}
                          </span>
                          {!blackout.isEnabled && <span className={BADGE_CLASS}>Inactivo</span>}
                        </div>
                        <p className={`mt-1 ${MUTED_CLASS}`}>
                          {blackout.blackoutDate}
                          {blackout.siteId
                            ? ` · ${siteNameMap.get(blackout.siteId) ?? blackout.siteId}`
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
              <form
                onSubmit={handleSubmitBlackout}
                className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {blackoutForm.id ? 'Editar cierre especial' : 'Nuevo cierre especial'}
                    </p>
                    <p className={MUTED_CLASS}>
                      Los cierres bloquean agenda salvo excepción explícita del técnico.
                    </p>
                  </div>
                  {blackoutForm.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setBlackoutForm(createEmptyBlackoutForm())}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="wfm-blackout-name" className={LABEL_CLASS}>
                      Nombre del cierre
                    </label>
                    <input
                      id="wfm-blackout-name"
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
                      Sede operativa
                    </label>
                    <Select
                      id="wfm-blackout-site"
                      options={companyWideSiteOptions}
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
                      Recurrente
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
