'use client';

import { CalendarDays, LayoutDashboard, List, Plus, RefreshCcw } from 'lucide-react';
import { Button, DatePicker, Select } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import type { SchedulingFilters } from './scheduling-ui';
import { toDateFromLocalDateValue, toLocalDateValue } from './schedule-event-time';
import {
  SCHEDULE_EVENT_STATUS_OPTIONS,
  type SchedulingView,
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
  canViewCommandCenter: boolean;
}

export function SchedulingToolbar({
  filters,
  technicianOptions,
  onFiltersChange,
  onRefresh,
  onOpenCreate,
  isRefreshing,
  canManage,
  canViewCommandCenter,
}: SchedulingToolbarProps) {
  const update = <TKey extends keyof SchedulingFilters>(
    key: TKey,
    value: SchedulingFilters[TKey],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const setView = (view: SchedulingView) => {
    onFiltersChange({ ...filters, view });
  };

  return (
    <PortalPanel
      eyebrow="Programacion"
      title="Agenda operativa"
      description="Filtra por rango, técnico, tipo o estado para priorizar la ejecución diaria."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={onRefresh} loading={isRefreshing}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
          {canManage && (
            <Button type="button" onClick={onOpenCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear evento
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
        <DatePicker
          id="scheduling-from-date"
          label="Desde"
          value={toDateFromLocalDateValue(filters.fromDate)}
          onChange={(date) => update('fromDate', date ? toLocalDateValue(date) : '')}
        />
        <DatePicker
          id="scheduling-to-date"
          label="Hasta"
          value={toDateFromLocalDateValue(filters.toDate)}
          onChange={(date) => update('toDate', date ? toLocalDateValue(date) : '')}
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
          onChange={(event) => update('status', event.target.value as SchedulingFilters['status'])}
        />

        <div className="flex items-center gap-2 lg:justify-end">
          {canViewCommandCenter && (
            <Button
              type="button"
              variant={filters.view === 'command-center' ? 'primary' : 'secondary'}
              onClick={() => setView('command-center')}
              aria-pressed={filters.view === 'command-center'}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Command center
            </Button>
          )}
          <Button
            type="button"
            variant={filters.view === 'calendar' ? 'primary' : 'secondary'}
            onClick={() => setView('calendar')}
            aria-pressed={filters.view === 'calendar'}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Calendario
          </Button>
          <Button
            type="button"
            variant={filters.view === 'list' ? 'primary' : 'secondary'}
            onClick={() => setView('list')}
            aria-pressed={filters.view === 'list'}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            Lista
          </Button>
        </div>
      </div>
    </PortalPanel>
  );
}
