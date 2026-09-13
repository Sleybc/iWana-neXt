// apps/portal/src/components/operations/TasksToolbar.tsx
// Toolbar de filtros de la bandeja de tareas (spec UX §7.1 — H5): Estado,
// Tipo, Responsable y Ticket. `type`, `responsibleRefId` y `ticketId` ya los
// soporta `ListTaskQuerySchema`; su exposición y el estado en la URL son F5
// (paso 4 del encargo). El filtro «Ticket» es exacto y se aplica al confirmar
// (Enter o salida del campo). El responsable usa el typeahead de personas con
// degradación 403 visible (D-P1, Salida 2) — nunca el crawl del directorio.
'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import { TaskStatus, TaskType } from '@iwana/shared';
import { OperationsUserPicker } from './OperationsUserPicker';
import { getTaskStatusLabel, getTaskTypeLabel } from './operations-labels';

export interface TasksToolbarFilters {
  status: TaskStatus | '';
  type: TaskType | '';
  responsibleRefId: string;
  ticketId: string;
}

export interface TasksToolbarProps {
  filters: TasksToolbarFilters;
  onFilterChange: (patch: Partial<TasksToolbarFilters>) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Etiqueta del responsable filtrado, resuelta de las filas cargadas. */
  responsibleLabel: string | null;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.values(TaskStatus).map((value) => ({
    value,
    label: getTaskStatusLabel(value),
  })),
];

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  ...Object.values(TaskType).map((value) => ({
    value,
    label: getTaskTypeLabel(value),
  })),
];

export function TasksToolbar({
  filters,
  onFilterChange,
  onClearFilters,
  onRefresh,
  isRefreshing = false,
  responsibleLabel,
}: TasksToolbarProps) {
  // El filtro de ticket es exacto y se aplica al confirmar: el borrador local
  // viaja en el estado del campo y solo confirma con Enter o al salir.
  const [ticketDraft, setTicketDraft] = useState(filters.ticketId);

  // Un filtro entrado por deep link (o limpiado desde fuera) sincroniza el borrador.
  useEffect(() => {
    setTicketDraft(filters.ticketId);
  }, [filters.ticketId]);

  const hasActiveFilters = Boolean(
    filters.status || filters.type || filters.responsibleRefId || filters.ticketId,
  );

  function commitTicketFilter() {
    if (ticketDraft.trim() !== filters.ticketId) {
      onFilterChange({ ticketId: ticketDraft.trim() });
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-[200px]">
        <Select
          id="task-status-filter"
          label="Estado"
          value={filters.status}
          onChange={(event) =>
            onFilterChange({ status: (event.target.value || '') as TasksToolbarFilters['status'] })
          }
          options={STATUS_OPTIONS}
        />
      </div>

      <div className="min-w-[200px]">
        <Select
          id="task-type-filter"
          label="Tipo"
          value={filters.type}
          onChange={(event) =>
            onFilterChange({ type: (event.target.value || '') as TasksToolbarFilters['type'] })
          }
          options={TYPE_OPTIONS}
        />
      </div>

      <div className="min-w-[240px]">
        <OperationsUserPicker
          id="task-responsible-filter"
          label="Responsable"
          value={filters.responsibleRefId || null}
          selectedItem={responsibleLabel ? { label: responsibleLabel } : null}
          onChange={(item) => onFilterChange({ responsibleRefId: item?.id ?? '' })}
          placeholder="Escribe para buscar"
          unavailableTitle="No puedes buscar personas"
          unavailableDescription="Tu perfil no tiene acceso al buscador de personas. La bandeja funciona igual sin este filtro: el responsable aparece en cada tarea."
        />
      </div>

      <div className="min-w-[220px]">
        <Input
          id="task-ticket-filter"
          label="Ticket"
          placeholder="Referencia del ticket"
          helperText="Filtra las tareas derivadas de un ticket de mesa de ayuda; usa la referencia del ticket."
          value={ticketDraft}
          onChange={(event) => setTicketDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitTicketFilter();
            }
          }}
          onBlur={commitTicketFilter}
        />
      </div>

      <div className="flex items-end gap-3">
        {hasActiveFilters ? (
          <Button type="button" variant="secondary" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Actualizando…' : 'Actualizar'}
        </Button>
      </div>
    </div>
  );
}
