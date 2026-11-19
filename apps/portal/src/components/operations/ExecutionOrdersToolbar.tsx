// apps/portal/src/components/operations/ExecutionOrdersToolbar.tsx
// Toolbar de filtros de la bandeja de OT (spec UX §7.2 — H5): Estado,
// Resultado, Tipo de trabajo, Asignado a, Sede y Ventana planificada. Los
// valores de los selectores provienen de los mapas canónicos de
// `operations-labels.ts` (sin enums crudos). El parámetro «Asignado a» usa el
// typeahead de personas (D-P1: degradación 403 visible); en v1 busca
// técnicos — el contrato no expone búsqueda de cuadrillas (hallazgo
// registrado en el informe de fase).
//
// Queda fuera del contrato de componente de las tablas (F3 §1); la composición
// y el estado en la URL viven en `ExecutionOrdersClient` (ADR-065 §9).
'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Select } from '@iwana/ui';
import {
  ExecutionOrderNumberSearchSchema,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  WfmWorkType,
} from '@iwana/shared';
import type { ListExecutionOrdersQuery, OrganizationSiteSummary } from '@/lib/api-client';
import { organizationApi } from '@/lib/api-client';
import { OperationsUserPicker } from './OperationsUserPicker';
import type { ExecutionOrdersQueryPatch } from './execution-orders-query';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';

/** Claves de filtro de la bandeja de OT (los parámetros de trazabilidad
 * cruzada no se exponen como filtros en v1 — UX spec §4.5, D8). */
export const EXECUTION_ORDER_FILTER_KEYS = [
  'status',
  'result',
  'workType',
  'assigneeId',
  'organizationSiteId',
  'windowFrom',
  'windowTo',
  'number',
] as const;

/** J · Espera antes de llevar la búsqueda por número a la URL. */
export const EXECUTION_ORDER_NUMBER_SEARCH_DEBOUNCE_MS = 350;

export type ExecutionOrdersFilterPatch = ExecutionOrdersQueryPatch;

export interface ExecutionOrdersToolbarProps {
  filters: ListExecutionOrdersQuery;
  onFilterChange: (patch: ExecutionOrdersFilterPatch) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Etiqueta del asignado filtrado, resuelta de las filas cargadas. */
  assigneeLabel: string | null;
}

const STATUS_OPTIONS = Object.values(ExecutionOrderStatus).map((value) => ({
  value,
  label: EXECUTION_ORDER_STATUS_LABELS[value],
}));

const RESULT_OPTIONS = Object.values(ExecutionOrderResult).map((value) => ({
  value,
  label: EXECUTION_ORDER_RESULT_LABELS[value],
}));

const WORK_TYPE_OPTIONS = Object.values(WfmWorkType).map((value) => ({
  value,
  label: EXECUTION_ORDER_WORK_TYPE_LABELS[value],
}));

/** Formato fecha-only del rango en la URL (la conversión a ISO 8601 es del
 * cliente en el momento de consultar — el backend exige datetime). */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WINDOW_HELP_ID = 'execution-orders-window-help';
const FIELD_CLASS_NAME = 'min-w-[200px] xl:min-w-0 xl:flex-1';
const WIDE_FIELD_CLASS_NAME = 'min-w-[240px] xl:min-w-0 xl:flex-[1.3]';

export function ExecutionOrdersToolbar({
  filters,
  onFilterChange,
  onClearFilters,
  onRefresh,
  isRefreshing = false,
  assigneeLabel,
}: ExecutionOrdersToolbarProps) {
  const [sites, setSites] = useState<OrganizationSiteSummary[]>([]);

  // Sede: catálogo acotado del tenant (patrón CalendarSettingsClient:
  // una página con el tope estándar); el fallo deja el selector sin sedes en
  // vez de bloquear la bandeja (deuda registrada en el informe).
  useEffect(() => {
    let cancelled = false;
    organizationApi
      .list({ page: 1, limit: 100 })
      .then((response) => {
        if (!cancelled) {
          setSites(response.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSites([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // J · Búsqueda por número (spec 2026-11-19 §3 J): borrador local con espera;
  // solo un valor que el contrato acepta llega a la URL. Nunca busca por cliente.
  const urlNumber = filters.number ?? '';
  const [numberDraft, setNumberDraft] = useState(urlNumber);
  useEffect(() => {
    setNumberDraft(urlNumber);
  }, [urlNumber]);
  const trimmedDraft = numberDraft.trim();
  const numberIsValid =
    trimmedDraft === '' || ExecutionOrderNumberSearchSchema.safeParse(trimmedDraft).success;
  useEffect(() => {
    if (!numberIsValid || trimmedDraft === urlNumber) return undefined;
    const timeout = window.setTimeout(() => {
      onFilterChange({ number: trimmedDraft || undefined });
    }, EXECUTION_ORDER_NUMBER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
    // El efecto solo reacciona al borrador; `onFilterChange` cambia en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedDraft, numberIsValid, urlNumber]);

  const hasActiveFilters = EXECUTION_ORDER_FILTER_KEYS.some((key) => Boolean(filters[key]));

  return (
    // C · Una fila desde 1280 px (spec 2026-11-19 §3 C): los campos ceden ancho
    // en vez de saltar de línea; por debajo conservan su mínimo y envuelven.
    // P-4: alineación arriba para que la ayuda visible del rango crezca hacia
    // abajo sin desalinear los demás campos; las acciones bajan con `pt-6`
    // (alto del rótulo) para quedar a la altura de los controles.
    <div className="flex flex-wrap items-start gap-3 xl:flex-nowrap xl:gap-2">
      <div className={FIELD_CLASS_NAME}>
        <Input
          id="execution-orders-number-search"
          type="search"
          label="Número de orden"
          placeholder="Ej. OTE-20261119"
          autoComplete="off"
          value={numberDraft}
          error={
            numberIsValid ? undefined : 'Usa solo letras, números y . _ / - (hasta 40 caracteres).'
          }
          onChange={(event) => setNumberDraft(event.target.value)}
        />
      </div>
      <div className={FIELD_CLASS_NAME}>
        <Select
          id="execution-orders-status-filter"
          label="Estado"
          value={filters.status ?? ''}
          onChange={(event) =>
            onFilterChange({
              status: (event.target.value || undefined) as ExecutionOrdersFilterPatch['status'],
            })
          }
          options={[{ value: '', label: 'Todos los estados' }, ...STATUS_OPTIONS]}
        />
      </div>

      <div className={FIELD_CLASS_NAME}>
        <Select
          id="execution-orders-result-filter"
          label="Resultado"
          value={filters.result ?? ''}
          onChange={(event) =>
            onFilterChange({
              result: (event.target.value || undefined) as ExecutionOrdersFilterPatch['result'],
            })
          }
          options={[{ value: '', label: 'Todos los resultados' }, ...RESULT_OPTIONS]}
        />
      </div>

      <div className={FIELD_CLASS_NAME}>
        <Select
          id="execution-orders-work-type-filter"
          label="Tipo de trabajo"
          value={filters.workType ?? ''}
          onChange={(event) =>
            onFilterChange({
              workType: (event.target.value || undefined) as ExecutionOrdersFilterPatch['workType'],
            })
          }
          options={[{ value: '', label: 'Todos los tipos' }, ...WORK_TYPE_OPTIONS]}
        />
      </div>

      <div className={WIDE_FIELD_CLASS_NAME}>
        <OperationsUserPicker
          id="execution-orders-assignee-filter"
          label="Asignado a"
          value={filters.assigneeId ?? null}
          selectedItem={assigneeLabel ? { label: assigneeLabel } : null}
          onChange={(item) => onFilterChange({ assigneeId: item?.id ?? undefined })}
          placeholder="Busca por nombre de técnico"
          unavailableTitle="No puedes buscar personas"
          unavailableDescription="Tu perfil no tiene acceso al buscador de personas. La bandeja funciona igual sin este filtro: la persona asignada aparece en cada orden."
        />
      </div>

      <div className={FIELD_CLASS_NAME}>
        <Select
          id="execution-orders-site-filter"
          label="Sede"
          value={filters.organizationSiteId ?? ''}
          onChange={(event) =>
            onFilterChange({ organizationSiteId: event.target.value || undefined })
          }
          options={[
            { value: '', label: 'Todas las sedes' },
            ...sites.map((site) => ({ value: site.id, label: site.name })),
          ]}
        />
      </div>

      <div className="min-w-[240px] xl:min-w-0 xl:shrink-0">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Ventana planificada
        </span>
        <div className="flex items-center gap-2">
          <Input
            id="execution-orders-window-from"
            type="date"
            aria-label="Desde"
            aria-describedby={WINDOW_HELP_ID}
            value={filters.windowFrom ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onFilterChange({
                windowFrom: value && DATE_ONLY_PATTERN.test(value) ? value : undefined,
              });
            }}
          />
          <span aria-hidden="true" className="text-gray-400">
            –
          </span>
          <Input
            id="execution-orders-window-to"
            type="date"
            aria-label="Hasta"
            aria-describedby={WINDOW_HELP_ID}
            value={filters.windowTo ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              onFilterChange({
                windowTo: value && DATE_ONLY_PATTERN.test(value) ? value : undefined,
              });
            }}
          />
        </div>
        {/* P-4: ayuda visible de §7.2 y descripción de ambos campos. */}
        <p id={WINDOW_HELP_ID} className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          Filtra por la fecha de inicio planificada.
        </p>
      </div>

      <div className="flex shrink-0 items-end gap-2 pt-6">
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
