'use client';

import { Button, Select } from '@iwana/ui';
import { TaskStatus } from '@iwana/shared';
import { getTaskStatusLabel } from './operations-labels';

export interface TasksToolbarProps {
  statusFilter: TaskStatus | '';
  onStatusFilterChange: (value: TaskStatus | '') => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.values(TaskStatus).map((value) => ({
    value,
    label: getTaskStatusLabel(value),
  })),
];

export function TasksToolbar({
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  isRefreshing = false,
}: TasksToolbarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px]">
        <Select
          id="task-status-filter"
          label="Estado"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as TaskStatus | '')}
          options={STATUS_OPTIONS}
        />
      </div>
      <Button type="button" variant="secondary" onClick={onRefresh} disabled={isRefreshing}>
        {isRefreshing ? 'Actualizando…' : 'Actualizar'}
      </Button>
    </div>
  );
}
