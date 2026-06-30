'use client';

import { Fragment, useEffect, useState } from 'react';
import { BusinessHoursWeekday } from '@iwana/shared';
import {
  BUSINESS_HOURS_WEEKDAY_ORDER,
  getBusinessHoursWeekdayLabel,
} from './mod00-settings-labels';
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
}

type BusinessHoursControlType = 'abierto' | 'desde' | 'hasta';
const MOBILE_LAYOUT_QUERY = '(max-width: 767px)';
const BUSINESS_HOUR_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?:[:][0-5]\d)?$/;

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

// ─── Estilos ──────────────────────────────────────────────────────────────────

function getBusinessHoursControlLabel(
  weekday: BusinessHoursWeekday,
  controlType: BusinessHoursControlType,
): string {
  return `${getBusinessHoursWeekdayLabel(weekday)}, ${controlType}`;
}

function supportsMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function getDayTestIdPrefix(weekday: BusinessHoursWeekday): string {
  return weekday.toLowerCase();
}

function getTimeControlId(weekday: BusinessHoursWeekday, control: 'opens' | 'closes'): string {
  return `bh-${control}-field-${getDayTestIdPrefix(weekday)}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Editor semanal reutilizable de horarios de apertura/cierre.
 * Sin lógica de guardado — el padre gestiona la persistencia.
 */
export function BusinessHoursWeekEditor({ days, canEdit, onChange }: Props) {
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
          className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
          data-testid={`bh-open-${getDayTestIdPrefix(entry.weekday)}`}
        />
        {compact ? null : <span>{entry.isOpen ? 'Sí' : 'No'}</span>}
      </label>
    );
  }

  function renderTimeControl(entry: BusinessHourDay, control: 'opens' | 'closes') {
    const isOpeningTime = control === 'opens';

    return (
      <TimeFieldSelect
        id={getTimeControlId(entry.weekday, control)}
        ariaLabel={getBusinessHoursControlLabel(entry.weekday, isOpeningTime ? 'desde' : 'hasta')}
        value={normalizeBusinessHourTime(isOpeningTime ? entry.opensAt : entry.closesAt)}
        disabled={!canEdit || !entry.isOpen}
        compact={!isMobileLayout}
        onChange={(nextValue) =>
          updateEntry(entry.weekday, {
            [isOpeningTime ? 'opensAt' : 'closesAt']: normalizeBusinessHourTime(nextValue) || null,
          })
        }
        dataTestId={`bh-${control}-${getDayTestIdPrefix(entry.weekday)}`}
      />
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
                      {entry.isOpen ? 'Horario activo' : 'Día cerrado'}
                    </p>
                  </div>
                  {renderOpenControl(entry)}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={getTimeControlId(entry.weekday, 'opens')}
                      className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                      Desde
                    </label>
                    {renderTimeControl(entry, 'opens')}
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor={getTimeControlId(entry.weekday, 'closes')}
                      className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    >
                      Hasta
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

        {days.map((entry) => (
          <Fragment key={entry.weekday}>
            <div
              data-testid={`bh-row-${getDayTestIdPrefix(entry.weekday)}`}
              className="bg-white px-4 py-3 text-sm font-medium text-gray-900 dark:bg-dark-surface-2 dark:text-white"
            >
              {getBusinessHoursWeekdayLabel(entry.weekday)}
            </div>
            <div className="flex items-center justify-center bg-white px-4 py-3 dark:bg-dark-surface-2">
              {renderOpenControl(entry, { compact: true })}
            </div>
            <div className="flex items-center justify-center bg-white px-3 py-3 dark:bg-dark-surface-2">
              {renderTimeControl(entry, 'opens')}
            </div>
            <div className="flex items-center justify-center bg-white px-3 py-3 dark:bg-dark-surface-2">
              {renderTimeControl(entry, 'closes')}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
