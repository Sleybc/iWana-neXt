'use client';

import { useId, useState } from 'react';
import { ACTIVATED_SUBSCRIBER_STATUSES } from '@iwana/shared';
import { Button, Dialog, DialogContent, DialogTitle, Select } from '@iwana/ui';
import { ChevronDown, X } from 'lucide-react';
import {
  CUSTOMER_SEGMENT_OPTIONS,
  PERSON_TYPE_OPTIONS,
  STRATUM_OPTIONS,
  SUBSCRIBER_STATUS_META,
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
  /** Solo cuando el filtro por etiqueta está disponible. */
  tag?: string;
  sortValue: string;
}

export interface SubscriberMoreFiltersSortOption {
  value: string;
  label: string;
}

interface SubscriberFilterFieldsProps {
  status: string;
  personType: string;
  segment: string;
  stratum: string;
  onStatusChange: (value: string) => void;
  onPersonTypeChange: (value: string) => void;
  onSegmentChange: (value: string) => void;
  onStratumChange: (value: string) => void;
  /** Catálogo de etiquetas (ADR-110 D8); sin opciones, el filtro no se muestra. */
  tag?: string;
  tagOptions?: ReadonlyArray<{ value: string; label: string }>;
  onTagChange?: (value: string) => void;
}

interface SubscriberMoreFiltersProps extends SubscriberFilterFieldsProps {
  hasActiveFilters: boolean;
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
  status,
  personType,
  segment,
  stratum,
  onStatusChange,
  onPersonTypeChange,
  onSegmentChange,
  onStratumChange,
  tag = '',
  tagOptions = [],
  onTagChange,
}: SubscriberFilterFieldsProps) {
  const id = useId();
  const showTag = Boolean(onTagChange && (tag || tagOptions.length > 0));
  const missingTag = tag && !tagOptions.some(({ value }) => value === tag);
  return (
    <div
      className={`grid min-w-0 gap-2 sm:grid-cols-2 ${showTag ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}
    >
      <Select
        id={`${id}-status`}
        label="Estado"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        options={[
          { value: '', label: 'Todos los estados' },
          ...ACTIVATED_SUBSCRIBER_STATUSES.map((value) => ({
            value,
            label: SUBSCRIBER_STATUS_META[value].label,
          })),
        ]}
      />
      <Select
        id={`${id}-person-type`}
        label="Tipo de persona"
        value={personType}
        onChange={(event) => onPersonTypeChange(event.target.value)}
        options={[{ value: '', label: 'Todos los tipos' }, ...PERSON_TYPE_OPTIONS]}
      />
      <Select
        id={`${id}-segment`}
        label="Segmento"
        value={segment}
        onChange={(event) => onSegmentChange(event.target.value)}
        options={[{ value: '', label: 'Todos los segmentos' }, ...CUSTOMER_SEGMENT_OPTIONS]}
      />
      <Select
        id={`${id}-stratum`}
        label="Estrato"
        value={stratum}
        onChange={(event) => onStratumChange(event.target.value)}
        options={[{ value: '', label: 'Todos los estratos' }, ...STRATUM_OPTIONS]}
      />
      {showTag ? (
        <Select
          id={`${id}-tag`}
          label="Etiqueta"
          value={tag}
          onChange={(event) => onTagChange?.(event.target.value)}
          options={[
            { value: '', label: 'Todas las etiquetas' },
            ...tagOptions,
            ...(missingTag ? [{ value: tag, label: 'Etiqueta eliminada' }] : []),
          ]}
        />
      ) : null}
    </div>
  );
}

export function SubscriberMoreFilters({
  hasActiveFilters,
  status,
  personType,
  segment,
  stratum,
  onStatusChange,
  onPersonTypeChange,
  onSegmentChange,
  onStratumChange,
  tag = '',
  tagOptions = [],
  onTagChange,
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
    ...(onTagChange ? { tag } : {}),
    sortValue,
  });
  const panelId = useId();

  function getCurrentDraft(): SubscriberMoreFiltersDraft {
    return {
      status,
      personType,
      segment,
      stratum,
      ...(onTagChange ? { tag } : {}),
      sortValue,
    };
  }

  function openMobileFilters() {
    setDraft(getCurrentDraft());
    setMobileOpen(true);
  }

  function updateDraft(patch: Partial<SubscriberMoreFiltersDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function clearDraft() {
    setDraft({
      status: '',
      personType: '',
      segment: '',
      stratum: '',
      ...(onTagChange ? { tag: '' } : {}),
      sortValue: '',
    });
  }

  function applyDraft() {
    onApply(draft);
    setMobileOpen(false);
  }

  const fieldCallbacks = {
    onStatusChange,
    onPersonTypeChange,
    onSegmentChange,
    onStratumChange,
    ...(onTagChange ? { onTagChange } : {}),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="hidden min-w-0 md:block">
          <SubscriberFilterFields
            status={status}
            personType={personType}
            segment={segment}
            stratum={stratum}
            tag={tag}
            tagOptions={tagOptions}
            {...fieldCallbacks}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
          aria-controls={mobileOpen ? panelId : undefined}
          onClick={openMobileFilters}
          className="min-h-11 gap-2 md:hidden"
        >
          Más filtros
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </Button>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="min-h-11"
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
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
              onClick={() => setMobileOpen(false)}
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
              onStatusChange={(value) => updateDraft({ status: value })}
              onPersonTypeChange={(value) => updateDraft({ personType: value })}
              onSegmentChange={(value) => updateDraft({ segment: value })}
              onStratumChange={(value) => updateDraft({ stratum: value })}
              tag={draft.tag ?? ''}
              tagOptions={tagOptions}
              {...(onTagChange
                ? { onTagChange: (value: string) => updateDraft({ tag: value }) }
                : {})}
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
        <div className="flex flex-wrap items-center gap-2 md:hidden" aria-label="Filtros activos">
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
        </div>
      ) : null}
    </div>
  );
}
