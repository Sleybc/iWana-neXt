'use client';

import { BusinessHoursWeekday } from '@iwana/shared';
import {
  BUSINESS_HOURS_WEEKDAY_ORDER,
  getBusinessHoursWeekdayLabel,
} from './mod00-settings-labels';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeBusinessHourTime(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 5);
}

/** Construye el draft semanal completo a partir de los registros guardados. */
export function buildBusinessHoursDraft(hours: BusinessHourDay[]): BusinessHourDay[] {
  const byWeekday = new Map(hours.map((entry) => [entry.weekday, entry]));

  return BUSINESS_HOURS_WEEKDAY_ORDER.map((weekday) => {
    const current = byWeekday.get(weekday);

    return {
      weekday,
      isOpen: current?.isOpen ?? false,
      opensAt: normalizeBusinessHourTime(current?.opensAt) || null,
      closesAt: normalizeBusinessHourTime(current?.closesAt) || null,
    };
  });
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';
const inputClassName =
  'h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Editor semanal reutilizable de horarios de apertura/cierre.
 * Sin lógica de guardado — el padre gestiona la persistencia.
 */
export function BusinessHoursWeekEditor({ days, canEdit, onChange }: Props) {
  function updateEntry(weekday: BusinessHoursWeekday, patch: Partial<BusinessHourDay>) {
    const next = days.map((entry) => {
      if (entry.weekday !== weekday) return entry;

      const updated = { ...entry, ...patch };
      if (!updated.isOpen) {
        updated.opensAt = null;
        updated.closesAt = null;
      }
      return updated;
    });
    onChange(next);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
        <thead className="bg-[#f8faf5] dark:bg-dark-surface-3">
          <tr>
            <th className={tableHeadClass}>Día</th>
            <th className={tableHeadClass}>Abierto</th>
            <th className={tableHeadClass}>Desde</th>
            <th className={tableHeadClass}>Hasta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
          {days.map((entry) => (
            <tr key={entry.weekday} data-testid={`bh-row-${entry.weekday.toLowerCase()}`}>
              <td className={cellClass}>{getBusinessHoursWeekdayLabel(entry.weekday)}</td>
              <td className={cellClass}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={entry.isOpen}
                    disabled={!canEdit}
                    onChange={(e) => updateEntry(entry.weekday, { isOpen: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
                    data-testid={`bh-open-${entry.weekday.toLowerCase()}`}
                  />
                  <span>{entry.isOpen ? 'Sí' : 'No'}</span>
                </label>
              </td>
              <td className={cellClass}>
                <input
                  type="time"
                  value={entry.opensAt ?? ''}
                  disabled={!canEdit || !entry.isOpen}
                  onChange={(e) => updateEntry(entry.weekday, { opensAt: e.target.value || null })}
                  className={inputClassName}
                  data-testid={`bh-opens-${entry.weekday.toLowerCase()}`}
                />
              </td>
              <td className={cellClass}>
                <input
                  type="time"
                  value={entry.closesAt ?? ''}
                  disabled={!canEdit || !entry.isOpen}
                  onChange={(e) => updateEntry(entry.weekday, { closesAt: e.target.value || null })}
                  className={inputClassName}
                  data-testid={`bh-closes-${entry.weekday.toLowerCase()}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
