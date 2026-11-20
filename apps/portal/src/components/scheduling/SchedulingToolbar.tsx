'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { Button, DatePicker, Select, cn } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import type { SchedulingFilters } from './scheduling-ui';
import {
  buildSchedulingRangeForView,
  buildSchedulingFiltersForViewSwitch,
  getSchedulingAnchorDate,
  shiftSchedulingAnchorDate,
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
  onFiltersChange: (next: SchedulingFilters) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const calendarViewOptions: Array<{ value: SchedulingView; label: string }> = [
  { value: 'day', label: 'Día' },
  { value: 'list', label: 'Lista' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

const allFilterOption = { value: '', label: 'Todos' };
const filterFieldClassName = 'min-w-0 xl:w-32';

/**
 * Barra de la agenda en una fila (spec MOD09 agenda §3 B): Hoy, rango, vistas y filtros.
 * El rango visible vive en el encabezado de la página; aquí no se repite.
 */
export function SchedulingToolbar({
  filters,
  assigneeOptions,
  onFiltersChange,
  onRefresh,
  isRefreshing,
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

  return (
    <PortalPanel compact>
      <h2 className="sr-only">Control de agenda</h2>
      <div className="mb-3 flex gap-2 xl:hidden">
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

      <div className="flex flex-wrap items-end gap-2">
        <div
          className={cn(
            'flex-wrap items-center gap-2',
            activeMobileTab === 'agenda' ? 'flex' : 'hidden',
            'xl:flex',
          )}
        >
          <Button type="button" variant="secondary" className="px-4" onClick={resetToToday}>
            Hoy
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Ir al rango anterior"
            onClick={() => shiftRange(-1)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Ir al rango siguiente"
            onClick={() => shiftRange(1)}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Vista de agenda"
          >
            {calendarViewOptions.map((option) => {
              const isActive = filters.view === option.value;

              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={isActive ? 'primary' : 'secondary'}
                  className="px-3.5"
                  aria-pressed={isActive}
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div
          className={cn(
            'w-full grid-cols-1 items-end gap-2 sm:grid-cols-2',
            activeMobileTab === 'filters' ? 'grid' : 'hidden',
            'xl:flex xl:w-auto xl:flex-wrap',
          )}
        >
          <div className={cn(filterFieldClassName, 'xl:w-36')}>
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
          </div>
          <div className={filterFieldClassName}>
            <Select
              id="scheduling-assignee-filter"
              label="Responsable"
              value={filters.technicianId}
              options={[allFilterOption, ...assigneeOptions]}
              onChange={(event) => update('technicianId', event.target.value)}
            />
          </div>
          <div className={filterFieldClassName}>
            <Select
              id="scheduling-type-filter"
              label="Tipo"
              value={filters.type}
              options={[allFilterOption, ...WFM_WORK_TYPE_OPTIONS]}
              onChange={(event) => update('type', event.target.value as SchedulingFilters['type'])}
            />
          </div>
          <div className={filterFieldClassName}>
            <Select
              id="scheduling-status-filter"
              label="Estado"
              value={filters.status}
              options={[allFilterOption, ...SCHEDULE_EVENT_STATUS_OPTIONS]}
              onChange={(event) =>
                update('status', event.target.value as SchedulingFilters['status'])
              }
            />
          </div>
          {/* Sigue habilitado mientras recarga: pedir de nuevo descarta la respuesta vieja. */}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Actualizar"
            title="Actualizar"
            aria-busy={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCcw
              className={cn('h-4 w-4', isRefreshing && 'motion-safe:animate-spin')}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>
    </PortalPanel>
  );
}
