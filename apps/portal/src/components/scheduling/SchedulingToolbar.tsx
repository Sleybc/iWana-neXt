'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, RefreshCcw } from 'lucide-react';
import { Button, DatePicker, Select } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import type { SchedulingFilters } from './scheduling-ui';
import {
  buildSchedulingRangeForView,
  buildSchedulingFiltersForViewSwitch,
  formatSchedulingRangeLabel,
  getRecommendedSchedulingViewForDensity,
  getSchedulingAnchorDate,
  getSchedulingViewDescription,
  getSchedulingViewMode,
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
  assigneeOptions: TechnicianOption[];
  visibleDayTaskCount: number;
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

const allFilterOption = { value: '', label: 'Todos' };

export function SchedulingToolbar({
  filters,
  assigneeOptions,
  visibleDayTaskCount,
  onFiltersChange,
  onRefresh,
  onOpenCreate,
  isRefreshing,
  canManage,
}: SchedulingToolbarProps) {
  const [activeMobileTab, setActiveMobileTab] = useState<'agenda' | 'filters'>('agenda');

  const update = <TKey extends keyof SchedulingFilters>(
    key: TKey,
    value: SchedulingFilters[TKey],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const setView = (view: SchedulingView) => {
    onFiltersChange(buildSchedulingFiltersForViewSwitch(filters, view));
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
  const activeViewDescription = getSchedulingViewDescription(filters.view);
  const recommendedView = getRecommendedSchedulingViewForDensity(filters, visibleDayTaskCount);
  const showListRecommendation =
    recommendedView === 'list' && filters.view !== 'list' && filters.view !== 'day';

  return (
    <PortalPanel
      eyebrow="Agenda"
      title="Control de agenda"
      description="Despacha en Día o Lista; usa Semana y Mes para leer capacidad y carga sin perder el contexto."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onRefresh} loading={isRefreshing}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
          {canManage && (
            <Button type="button" onClick={onOpenCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear solicitud manual
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 xl:hidden">
          <Button
            type="button"
            variant={activeMobileTab === 'agenda' ? 'primary' : 'secondary'}
            onClick={() => setActiveMobileTab('agenda')}
            aria-label="Ver agenda"
            aria-pressed={activeMobileTab === 'agenda'}
          >
            Agenda
          </Button>
          <Button
            type="button"
            variant={activeMobileTab === 'filters' ? 'primary' : 'secondary'}
            onClick={() => setActiveMobileTab('filters')}
            aria-label="Ver filtros"
            aria-pressed={activeMobileTab === 'filters'}
          >
            Filtros
          </Button>
        </div>

        <div
          className={`flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between ${activeMobileTab === 'agenda' ? 'block' : 'hidden'} xl:flex`}
        >
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

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Operativas
                </p>
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label="Vistas operativas"
                >
                  {calendarViewOptions
                    .filter((option) => getSchedulingViewMode(option.value) === 'operational')
                    .map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant={filters.view === option.value ? 'primary' : 'secondary'}
                        aria-pressed={filters.view === option.value}
                        onClick={() => setView(option.value)}
                      >
                        {option.value !== 'list' ? (
                          <CalendarDays className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <List className="h-4 w-4" aria-hidden="true" />
                        )}
                        {option.label}
                      </Button>
                    ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Analíticas
                </p>
                <div
                  className="flex flex-wrap items-center gap-2"
                  role="group"
                  aria-label="Vistas analíticas"
                >
                  {calendarViewOptions
                    .filter((option) => getSchedulingViewMode(option.value) === 'analytical')
                    .map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        variant={filters.view === option.value ? 'primary' : 'secondary'}
                        aria-pressed={filters.view === option.value}
                        onClick={() => setView(option.value)}
                      >
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                        {option.label}
                      </Button>
                    ))}
                </div>
              </div>
            </div>

            {activeViewDescription || showListRecommendation ? (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
                {activeViewDescription ? (
                  <p className="font-medium text-gray-900 dark:text-white">
                    {activeViewDescription}
                  </p>
                ) : null}
                {showListRecommendation ? (
                  <p
                    className={`text-xs text-iwana-secondary-700 dark:text-iwana-secondary-300${activeViewDescription ? ' mt-1' : ''}`}
                  >
                    Lista queda recomendada para revisar el volumen completo cuando esta jornada
                    cruza alta densidad.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={`grid gap-3 md:grid-cols-2 xl:grid-cols-5 ${activeMobileTab === 'filters' ? 'grid' : 'hidden'} xl:grid`}
        >
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
            id="scheduling-assignee-filter"
            label="Responsable"
            value={filters.technicianId}
            options={[allFilterOption, ...assigneeOptions]}
            onChange={(event) => update('technicianId', event.target.value)}
          />
          <Select
            id="scheduling-type-filter"
            label="Tipo"
            value={filters.type}
            options={[allFilterOption, ...WFM_WORK_TYPE_OPTIONS]}
            onChange={(event) => update('type', event.target.value as SchedulingFilters['type'])}
          />
          <Select
            id="scheduling-status-filter"
            label="Estado"
            value={filters.status}
            options={[allFilterOption, ...SCHEDULE_EVENT_STATUS_OPTIONS]}
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
