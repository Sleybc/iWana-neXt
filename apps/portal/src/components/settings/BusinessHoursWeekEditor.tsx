'use client';

import { Fragment, useEffect, useState } from 'react';
import { BusinessHoursWeekday } from '@iwana/shared';
import {
  BUSINESS_HOURS_WEEKDAY_ORDER,
  CALENDAR_SETTINGS_COPY,
  getBusinessHoursWeekdayLabel,
} from './mod00-settings-labels';
import { portalCheckboxClassName } from '@/components/shared/portal-ui';
import { TimeFieldSelect } from './TimeFieldSelect';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface BusinessHourDay {
  weekday: BusinessHoursWeekday;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

interface Props {
  days: BusinessHourDay[];
  canEdit: boolean;
  onChange: (days: BusinessHourDay[]) => void;
  validationErrors?: BusinessHoursValidationErrors;
  idPrefix?: string | undefined;
}

type BusinessHoursControlType = 'abierto' | 'desde' | 'hasta';
const MOBILE_LAYOUT_QUERY = '(max-width: 767px)';
const BUSINESS_HOUR_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?:[:][0-5]\d)?$/;

export interface BusinessHoursDayErrors {
  opensAt?: string;
  closesAt?: string;
}

export type BusinessHoursValidationErrors = Partial<
  Record<BusinessHoursWeekday, BusinessHoursDayErrors>
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeBusinessHourTime(value: string | null | undefined): string {
  if (!value || !BUSINESS_HOUR_TIME_PATTERN.test(value)) return '';
  return value.slice(0, 5);
}

function sanitizeBusinessHourDay(entry: BusinessHourDay): BusinessHourDay {
  if (!entry.isOpen) {
    return {
      ...entry,
      opensAt: null,
      closesAt: null,
    };
  }

  return {
    ...entry,
    opensAt: normalizeBusinessHourTime(entry.opensAt) || null,
    closesAt: normalizeBusinessHourTime(entry.closesAt) || null,
  };
}

/** Construye el draft semanal completo a partir de los registros guardados. */
export function buildBusinessHoursDraft(hours: BusinessHourDay[]): BusinessHourDay[] {
  const byWeekday = new Map(hours.map((entry) => [entry.weekday, entry]));

  return BUSINESS_HOURS_WEEKDAY_ORDER.map((weekday) => {
    const current = byWeekday.get(weekday);

    return sanitizeBusinessHourDay({
      weekday,
      isOpen: current?.isOpen ?? false,
      opensAt: current?.opensAt ?? null,
      closesAt: current?.closesAt ?? null,
    });
  });
}

/** Valida el contrato común de horarios para organización y sedes. */
export function validateBusinessHours(days: BusinessHourDay[]): BusinessHoursValidationErrors {
  const errors: BusinessHoursValidationErrors = {};

  days.forEach((entry) => {
    if (!entry.isOpen) return;

    const dayErrors: BusinessHoursDayErrors = {};
    const opensAt = normalizeBusinessHourTime(entry.opensAt);
    const closesAt = normalizeBusinessHourTime(entry.closesAt);

    if (!opensAt) dayErrors.opensAt = 'required';
    if (!closesAt) dayErrors.closesAt = 'required';
    if (opensAt && closesAt && closesAt <= opensAt) {
      dayErrors.closesAt = 'order';
    }

    if (dayErrors.opensAt || dayErrors.closesAt) {
      errors[entry.weekday] = dayErrors;
    }
  });

  return errors;
}

export function areBusinessHoursEqual(left: BusinessHourDay[], right: BusinessHourDay[]): boolean {
  return (
    JSON.stringify(buildBusinessHoursDraft(left)) === JSON.stringify(buildBusinessHoursDraft(right))
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

function getBusinessHoursControlLabel(
  weekday: BusinessHoursWeekday,
  controlType: BusinessHoursControlType,
): string {
  const suffix =
    controlType === 'abierto'
      ? CALENDAR_SETTINGS_COPY.editorOpenAriaSuffix
      : controlType === 'desde'
        ? CALENDAR_SETTINGS_COPY.editorStartsAtAriaSuffix
        : CALENDAR_SETTINGS_COPY.editorEndsAtAriaSuffix;

  return `${getBusinessHoursWeekdayLabel(weekday)}, ${suffix}`;
}

function supportsMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function getDayTestIdPrefix(weekday: BusinessHoursWeekday): string {
  return weekday.toLowerCase();
}

export function getBusinessHoursFieldId(
  idPrefix: string,
  weekday: BusinessHoursWeekday,
  control: 'opens' | 'closes',
): string {
  return `${idPrefix}-${control}-field-${getDayTestIdPrefix(weekday)}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Editor semanal reutilizable de horarios de apertura/cierre.
 * Sin lógica de guardado — el padre gestiona la persistencia.
 */
export function BusinessHoursWeekEditor({
  days,
  canEdit,
  onChange,
  validationErrors = {},
  idPrefix = 'bh',
}: Props) {
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  useEffect(() => {
    if (!supportsMatchMedia()) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileLayout(event.matches);
    };

    setIsMobileLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  function updateEntry(weekday: BusinessHoursWeekday, patch: Partial<BusinessHourDay>) {
    const next = days.map((entry) => {
      if (entry.weekday !== weekday) return entry;

      return sanitizeBusinessHourDay({
        ...entry,
        ...patch,
      });
    });
    onChange(next);
  }

  function renderOpenControl(entry: BusinessHourDay, options?: { compact?: boolean }) {
    const compact = options?.compact ?? false;

    return (
      <label className={compact ? 'flex items-center justify-center' : 'flex items-center gap-2'}>
        <input
          type="checkbox"
          aria-label={getBusinessHoursControlLabel(entry.weekday, 'abierto')}
          checked={entry.isOpen}
          disabled={!canEdit}
          onChange={(e) => updateEntry(entry.weekday, { isOpen: e.target.checked })}
          className={portalCheckboxClassName}
          data-testid={`bh-open-${getDayTestIdPrefix(entry.weekday)}`}
        />
        {compact ? null : (
          <span>
            {entry.isOpen
              ? CALENDAR_SETTINGS_COPY.editorOpenYesLabel
              : CALENDAR_SETTINGS_COPY.editorOpenNoLabel}
          </span>
        )}
      </label>
    );
  }

  function renderTimeControl(entry: BusinessHourDay, control: 'opens' | 'closes') {
    const isOpeningTime = control === 'opens';
    const field = isOpeningTime ? 'opensAt' : 'closesAt';
    const error = validationErrors[entry.weekday]?.[field];
    const errorId = `${idPrefix}-${field}-error-${getDayTestIdPrefix(entry.weekday)}`;

    return (
      <div className="min-w-0 space-y-1">
        <TimeFieldSelect
          id={getBusinessHoursFieldId(idPrefix, entry.weekday, control)}
          ariaLabel={getBusinessHoursControlLabel(entry.weekday, isOpeningTime ? 'desde' : 'hasta')}
          value={normalizeBusinessHourTime(isOpeningTime ? entry.opensAt : entry.closesAt)}
          disabled={!canEdit || !entry.isOpen}
          compact={!isMobileLayout}
          ariaInvalid={Boolean(error)}
          ariaDescribedBy={error ? errorId : undefined}
          onChange={(nextValue) =>
            updateEntry(entry.weekday, {
              [isOpeningTime ? 'opensAt' : 'closesAt']:
                normalizeBusinessHourTime(nextValue) || null,
            })
          }
          dataTestId={`bh-${control}-${getDayTestIdPrefix(entry.weekday)}`}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-xs text-red-700 dark:text-red-300">
            {error === 'order'
              ? CALENDAR_SETTINGS_COPY.editorCloseAfterStartError
              : CALENDAR_SETTINGS_COPY.editorTimeRequiredError}
          </p>
        ) : null}
      </div>
    );
  }

  if (isMobileLayout) {
    return (
      <div
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2"
        data-testid="bh-layout-mobile"
      >
        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {days.map((entry) => {
            const dayLabel = getBusinessHoursWeekdayLabel(entry.weekday);

            return (
              <section
                key={entry.weekday}
                data-testid={`bh-row-${getDayTestIdPrefix(entry.weekday)}`}
                className="space-y-4 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {dayLabel}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.isOpen
                        ? CALENDAR_SETTINGS_COPY.editorActiveStatusLabel
                        : CALENDAR_SETTINGS_COPY.editorClosedDayStatusLabel}
                    </p>
                  </div>
                  {renderOpenControl(entry)}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={getBusinessHoursFieldId(idPrefix, entry.weekday, 'opens')}
                      className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.editorStartsAtMobileLabel}
                    </label>
                    {renderTimeControl(entry, 'opens')}
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor={getBusinessHoursFieldId(idPrefix, entry.weekday, 'closes')}
                      className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                      {CALENDAR_SETTINGS_COPY.editorEndsAtMobileLabel}
                    </label>
                    {renderTimeControl(entry, 'closes')}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border"
      data-testid="bh-layout-desktop"
    >
      <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] gap-px bg-gray-200 dark:bg-dark-border">
        <div className="whitespace-nowrap bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          {CALENDAR_SETTINGS_COPY.editorWeekdayColumn}
        </div>
        <div className="whitespace-nowrap bg-gray-50 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          {CALENDAR_SETTINGS_COPY.editorOpenColumn}
        </div>
        <div className="whitespace-nowrap bg-gray-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          {CALENDAR_SETTINGS_COPY.editorStartsAtColumn}
        </div>
        <div className="whitespace-nowrap bg-gray-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-dark-surface-3 dark:text-gray-400">
          {CALENDAR_SETTINGS_COPY.editorEndsAtColumn}
        </div>

        {days.map((entry) => (
          <Fragment key={entry.weekday}>
            <div
              data-testid={`bh-row-${getDayTestIdPrefix(entry.weekday)}`}
              className="whitespace-nowrap bg-white px-4 py-2 text-sm font-medium text-gray-900 dark:bg-dark-surface-2 dark:text-white"
            >
              {getBusinessHoursWeekdayLabel(entry.weekday)}
            </div>
            <div className="flex items-center justify-center bg-white px-3 py-2 dark:bg-dark-surface-2">
              {renderOpenControl(entry, { compact: true })}
            </div>
            <div className="flex items-start bg-white px-3 py-2 dark:bg-dark-surface-2">
              {renderTimeControl(entry, 'opens')}
            </div>
            <div className="flex items-start bg-white px-3 py-2 dark:bg-dark-surface-2">
              {renderTimeControl(entry, 'closes')}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
