'use client';

import { Button, Select } from '@iwana/ui';
import { ChevronDown, X } from 'lucide-react';
import {
  CUSTOMER_SEGMENT_OPTIONS,
  PERSON_TYPE_OPTIONS,
  STRATUM_OPTIONS,
  SUBSCRIBER_STATUS_OPTIONS,
} from './subscriber-ui';

export interface SubscriberActiveFilter {
  key: string;
  label: string;
  value: string;
}

interface SubscriberMoreFiltersProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  status: string;
  personType: string;
  segment: string;
  stratum: string;
  onStatusChange: (value: string) => void;
  onPersonTypeChange: (value: string) => void;
  onSegmentChange: (value: string) => void;
  onStratumChange: (value: string) => void;
  activeFilters: SubscriberActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onClearFilters: () => void;
}

export function SubscriberMoreFilters({
  expanded,
  onExpandedChange,
  status,
  personType,
  segment,
  stratum,
  onStatusChange,
  onPersonTypeChange,
  onSegmentChange,
  onStratumChange,
  activeFilters,
  onRemoveFilter,
  onClearFilters,
}: SubscriberMoreFiltersProps) {
  const panelId = 'subscriber-more-filters-panel';

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => onExpandedChange(!expanded)}
        className="min-h-11 justify-between gap-2"
      >
        Más filtros
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </Button>

      {expanded ? (
        <div
          id={panelId}
          className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-dark-border"
        >
          <Select
            id="subscriber-status-filter"
            aria-label="Estado"
            className="h-12 min-w-0"
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            options={SUBSCRIBER_STATUS_OPTIONS}
          >
            <option value="">Todos los estados</option>
          </Select>
          <Select
            id="subscriber-person-type-filter"
            aria-label="Tipo de persona"
            className="h-12 min-w-0"
            value={personType}
            onChange={(event) => onPersonTypeChange(event.target.value)}
            options={[...PERSON_TYPE_OPTIONS]}
          >
            <option value="">Todos los tipos</option>
          </Select>
          <Select
            id="subscriber-segment-filter"
            aria-label="Segmento"
            className="h-12 min-w-0"
            value={segment}
            onChange={(event) => onSegmentChange(event.target.value)}
            options={[...CUSTOMER_SEGMENT_OPTIONS]}
          >
            <option value="">Todos los segmentos</option>
          </Select>
          <Select
            id="subscriber-stratum-filter"
            aria-label="Estrato"
            className="h-12 min-w-0"
            value={stratum}
            onChange={(event) => onStratumChange(event.target.value)}
            options={[...STRATUM_OPTIONS]}
          >
            <option value="">Todos los estratos</option>
          </Select>
        </div>
      ) : null}

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
          {activeFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100"
            >
              <span>
                {filter.label}: {filter.value}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar filtro: ${filter.label}: ${filter.value}`}
                onClick={() => onRemoveFilter(filter.key)}
                className="min-h-8 min-w-8 rounded-full"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
          ))}
          {activeFilters.length > 1 ? (
            <Button type="button" variant="ghost" onClick={onClearFilters} className="min-h-11">
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
