'use client';

import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, RefreshCcw } from 'lucide-react';
import { Button, DatePicker, Select } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import type { SchedulingFilters } from './scheduling-ui';
import {
  buildSchedulingRangeForView,
  formatSchedulingRangeLabel,
  getSchedulingAnchorDate,
  shiftSchedulingAnchorDate,
  toApiDateRange,
  type SchedulingView,
  SCHEDULE_EVENT_STATUS_OPTIONS,
  WFM_WORK_TYPE_OPTIONS,
} from './scheduling-ui';

interface TechnicianOption {
  value: string;
  label: string;
}

interface SchedulingToolbarProps {
  filters: SchedulingFilters;
  technicianOptions: TechnicianOption[];
  onFiltersChange: (next: SchedulingFilters) => void;
  onRefresh: () => void;
  onOpenCreate: () => void;
  isRefreshing: boolean;
  canManage: boolean;
}

const calendarViewOptions: Array<{ value: SchedulingView; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'list', label: 'Lista' },
];

export function SchedulingToolbar({
  filters,
  technicianOptions,
  onFiltersChange,
  onRefresh,
  onOpenCreate,
  isRefreshing,
  canManage,
}: SchedulingToolbarProps) {
  const update = <TKey extends keyof SchedulingFilters>(
    key: TKey,
    value: SchedulingFilters[TKey],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const setView = (view: SchedulingView) => {
    const anchorDate = getSchedulingAnchorDate(filters);
    onFiltersChange({
      ...filters,
      ...buildSchedulingRangeForView(view, anchorDate),
      view,
    });
  };

  const shiftRange = (direction: -1 | 1) => {
    const anchorDate = shiftSchedulingAnchorDate(
      filters.view,
      getSchedulingAnchorDate(filters),
      direction,
    );

    onFiltersChange({
      ...filters,
      ...buildSchedulingRangeForView(filters.view, anchorDate),
    });
  };

  const resetToToday = () => {
    onFiltersChange({
      ...filters,
      ...buildSchedulingRangeForView(filters.view, new Date()),
    });
  };

  const anchorDate = getSchedulingAnchorDate(filters);
  const rangeLabel = formatSchedulingRangeLabel(filters);
  const activeRange = toApiDateRange(filters);

  return (
    <PortalPanel
      eyebrow="Agenda"
      title="Control de agenda"
      description="Navega por día, semana o mes y mantén el contexto operativo en una sola superficie."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onRefresh} loading={isRefreshing}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
          {canManage && (
            <Button type="button" onClick={onOpenCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agendar tarea
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={resetToToday}>
              Hoy
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label="Ir al rango anterior"
              onClick={() => shiftRange(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label="Ir al rango siguiente"
              onClick={() => shiftRange(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-2 text-sm font-medium text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white">
              {rangeLabel}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {calendarViewOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={filters.view === option.value ? 'primary' : 'secondary'}
                aria-pressed={filters.view === option.value}
                onClick={() => setView(option.value)}
              >
                {option.value !== 'list' && <CalendarDays className="h-4 w-4" aria-hidden="true" />}
                {option.value === 'list' && <List className="h-4 w-4" aria-hidden="true" />}
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DatePicker
            id="scheduling-anchor-date"
            label="Fecha base"
            value={anchorDate}
            onChange={(date) =>
              onFiltersChange({
                ...filters,
                ...buildSchedulingRangeForView(filters.view, date ?? new Date()),
              })
            }
          />
          <Select
            id="scheduling-technician-filter"
            label="Técnico"
            value={filters.technicianId}
            placeholder="Todos"
            options={technicianOptions}
            onChange={(event) => update('technicianId', event.target.value)}
          />
          <Select
            id="scheduling-type-filter"
            label="Tipo"
            value={filters.type}
            placeholder="Todos"
            options={WFM_WORK_TYPE_OPTIONS}
            onChange={(event) => update('type', event.target.value as SchedulingFilters['type'])}
          />
          <Select
            id="scheduling-status-filter"
            label="Estado"
            value={filters.status}
            placeholder="Todos"
            options={SCHEDULE_EVENT_STATUS_OPTIONS}
            onChange={(event) =>
              update('status', event.target.value as SchedulingFilters['status'])
            }
          />
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
              Rango activo
            </p>
            <p className="mt-1">
              {activeRange.from.slice(0, 10)} → {activeRange.to.slice(0, 10)}
            </p>
          </div>
        </div>
      </div>
    </PortalPanel>
  );
}
