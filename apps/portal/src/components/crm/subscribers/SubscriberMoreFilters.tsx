'use client';

import { useId, useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, Select } from '@iwana/ui';
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

export interface SubscriberMoreFiltersDraft {
  status: string;
  personType: string;
  segment: string;
  stratum: string;
  sortValue: string;
}

export interface SubscriberMoreFiltersSortOption {
  value: string;
  label: string;
}

interface SubscriberFilterFieldsProps {
  visibleLabels?: boolean;
  status: string;
  personType: string;
  segment: string;
  stratum: string;
  onStatusChange: (value: string) => void;
  onPersonTypeChange: (value: string) => void;
  onSegmentChange: (value: string) => void;
  onStratumChange: (value: string) => void;
}

interface SubscriberMoreFiltersProps extends SubscriberFilterFieldsProps {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  activeFilters: SubscriberActiveFilter[];
  onRemoveFilter: (key: string) => void;
  onClearFilters: () => void;
  showSort: boolean;
  sortValue: string;
  sortOptions: ReadonlyArray<SubscriberMoreFiltersSortOption>;
  sortDisabled?: boolean;
  onApply: (draft: SubscriberMoreFiltersDraft) => void;
}

function SubscriberFilterFields({
  visibleLabels = false,
  status,
  personType,
  segment,
  stratum,
  onStatusChange,
  onPersonTypeChange,
  onSegmentChange,
  onStratumChange,
}: SubscriberFilterFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Select
        id="subscriber-status-filter"
        {...(visibleLabels ? { label: 'Estado' } : {})}
        aria-label="Estado"
        className="h-12 min-w-0"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        options={[{ value: '', label: 'Todos los estados' }, ...SUBSCRIBER_STATUS_OPTIONS]}
      />
      <Select
        id="subscriber-person-type-filter"
        {...(visibleLabels ? { label: 'Tipo de persona' } : {})}
        aria-label="Tipo de persona"
        className="h-12 min-w-0"
        value={personType}
        onChange={(event) => onPersonTypeChange(event.target.value)}
        options={[{ value: '', label: 'Todos los tipos' }, ...PERSON_TYPE_OPTIONS]}
      />
      <Select
        id="subscriber-segment-filter"
        {...(visibleLabels ? { label: 'Segmento' } : {})}
        aria-label="Segmento"
        className="h-12 min-w-0"
        value={segment}
        onChange={(event) => onSegmentChange(event.target.value)}
        options={[{ value: '', label: 'Todos los segmentos' }, ...CUSTOMER_SEGMENT_OPTIONS]}
      />
      <Select
        id="subscriber-stratum-filter"
        {...(visibleLabels ? { label: 'Estrato' } : {})}
        aria-label="Estrato"
        className="h-12 min-w-0"
        value={stratum}
        onChange={(event) => onStratumChange(event.target.value)}
        options={[{ value: '', label: 'Todos los estratos' }, ...STRATUM_OPTIONS]}
      />
    </div>
  );
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
  showSort,
  sortValue,
  sortOptions,
  sortDisabled = false,
  onApply,
}: SubscriberMoreFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [draft, setDraft] = useState<SubscriberMoreFiltersDraft>({
    status,
    personType,
    segment,
    stratum,
    sortValue,
  });
  const panelId = useId();

  function getCurrentDraft(): SubscriberMoreFiltersDraft {
    return { status, personType, segment, stratum, sortValue };
  }

  function changeOpen(next: boolean) {
    setMobileOpen(next);
    onExpandedChange(next);
  }

  function handleToggle() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      if (mobileOpen) {
        changeOpen(false);
        return;
      }
      setDraft(getCurrentDraft());
      changeOpen(true);
      return;
    }

    onExpandedChange(!expanded);
  }

  function updateDraft(patch: Partial<SubscriberMoreFiltersDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function clearDraft() {
    setDraft({ status: '', personType: '', segment: '', stratum: '', sortValue: '' });
  }

  function applyDraft() {
    onApply(draft);
    changeOpen(false);
  }

  const fieldCallbacks = {
    onStatusChange,
    onPersonTypeChange,
    onSegmentChange,
    onStratumChange,
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={mobileOpen || expanded}
        aria-controls={panelId}
        onClick={handleToggle}
        className="min-h-11 w-full justify-between gap-2 md:w-auto"
      >
        Más filtros
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${mobileOpen || expanded ? 'rotate-180' : ''}`}
        />
      </Button>

      {expanded && !mobileOpen ? (
        <div
          id={panelId}
          className="hidden rounded-xl border border-gray-200 p-4 md:block dark:border-dark-border"
        >
          <SubscriberFilterFields
            status={status}
            personType={personType}
            segment={segment}
            stratum={stratum}
            {...fieldCallbacks}
          />
        </div>
      ) : null}

      <Dialog open={mobileOpen} onOpenChange={changeOpen}>
        <DialogContent
          id={panelId}
          className="max-md:fixed max-md:inset-0 max-md:flex max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none max-md:flex-col max-md:overflow-hidden max-md:rounded-none max-md:p-0 max-md:animate-in max-md:slide-in-from-bottom max-md:duration-300"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-dark-border">
            <DialogTitle className="m-0">Más filtros</DialogTitle>
            <Button
              type="button"
              variant="ghost"
              aria-label="Cerrar filtros"
              onClick={() => changeOpen(false)}
              className="min-h-11 min-w-11 rounded-full p-0"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
            <SubscriberFilterFields
              status={draft.status}
              personType={draft.personType}
              segment={draft.segment}
              stratum={draft.stratum}
              visibleLabels
              onStatusChange={(value) => updateDraft({ status: value })}
              onPersonTypeChange={(value) => updateDraft({ personType: value })}
              onSegmentChange={(value) => updateDraft({ segment: value })}
              onStratumChange={(value) => updateDraft({ stratum: value })}
            />
            {showSort ? (
              <Select
                id="subscriber-mobile-sort-filter"
                label="Ordenar por"
                className="h-12 min-w-0"
                value={draft.sortValue}
                disabled={sortDisabled}
                onChange={(event) => updateDraft({ sortValue: event.target.value })}
                options={[...sortOptions]}
              />
            ) : null}
          </div>

          <div className="flex shrink-0 gap-3 border-t border-gray-200 bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-dark-border dark:bg-dark-surface-2">
            <Button
              type="button"
              variant="outline"
              onClick={clearDraft}
              className="min-h-11 flex-1"
            >
              Limpiar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={applyDraft}
              className="min-h-11 flex-1"
            >
              Aplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                className="min-h-11 min-w-11 rounded-full md:min-h-10 md:min-w-10"
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
