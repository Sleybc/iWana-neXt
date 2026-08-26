'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, CircleAlert, Columns3, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  cn,
} from '@iwana/ui';
import type { PlanCatalogItem } from '@/lib/api-client';
import {
  hasMissingCurrentPrice,
  MissingCurrentPriceBadge,
} from '@/components/commercial/catalog/MissingCurrentPriceBadge';
import type { PlanCatalogFilters } from '@/components/commercial/catalog/catalog-filter-params';
import {
  formatInstallationText,
  formatMoney,
  formatSpeed,
  parseMoneyFromApi,
} from '@/components/commercial/catalog/plan-catalog-helpers';
import { PLAN_CATALOG_PAGE_SIZE_OPTIONS } from '@/components/commercial/catalog/plan-catalog-pagination';
import {
  PLAN_CATALOG_COLUMN_IDS,
  PLAN_CATALOG_COLUMN_LABELS,
  PLAN_CATALOG_LOCKED_COLUMNS,
  isColumnVisible,
  loadPlanCatalogColumnPrefs,
  persistPlanCatalogColumnPrefs,
  resolveVisibleColumns,
  type PlanCatalogColumnId,
  type PlanCatalogColumnPrefs,
  type PlanCatalogVisibleColumnId,
} from '@/components/commercial/catalog/plan-catalog-columns';
import { getPortalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import {
  PortalDataTableHead,
  PortalDataTableSortableHead,
  PortalEmptyState,
  PortalFilterChip,
  PortalPageSizeSelect,
  PortalSearchField,
  PortalSkeletonBlock,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import type { TableSortState } from '@/lib/use-table-query-state';
import {
  planCatalogSortField,
  planCatalogSortLabel,
} from '@/components/commercial/catalog/plan-catalog-sort';

function formatPlanDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function renderPlanColumnCell(
  plan: PlanCatalogItem,
  column: PlanCatalogVisibleColumnId,
  options: {
    canEdit: boolean;
    showTechnologySubtitle: boolean;
    onOpenEdit: (plan: PlanCatalogItem) => void;
  },
) {
  switch (column) {
    case 'plan':
      return (
        <>
          <p className="font-semibold text-gray-900 dark:text-white">{plan.name}</p>
          {options.showTechnologySubtitle ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{plan.technology}</p>
          ) : null}
        </>
      );
    case 'speed':
      return formatSpeed(plan);
    case 'price':
      return hasMissingCurrentPrice(plan) ? (
        <MissingCurrentPriceBadge />
      ) : (
        formatMoney(parseMoneyFromApi(plan.basePrice))
      );
    case 'installation':
      return formatInstallationText(plan);
    case 'status':
      return (
        <Badge variant={getPortalActiveBadgeVariant(plan.isActive)}>
          {plan.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      );
    case 'technology': {
      const technology = plan.technology.trim();
      return technology && technology.toUpperCase() !== 'N/A' ? technology : '—';
    }
    case 'description': {
      const description = (plan.description ?? '').trim();
      if (!description) {
        return '—';
      }
      return (
        <span className="line-clamp-2" title={description}>
          {description}
        </span>
      );
    }
    case 'created':
      return formatPlanDate(plan.createdAt);
    case 'updated':
      return formatPlanDate(plan.updatedAt);
    case 'actions':
      return options.canEdit ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label={`Editar plan ${plan.name}`}
            title={`Editar plan ${plan.name}`}
            onClick={() => options.onOpenEdit(plan)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null;
    default:
      return null;
  }
}

function columnCellClassName(column: PlanCatalogVisibleColumnId): string {
  if (column === 'speed' || column === 'price' || column === 'installation') {
    return cn(portalDataTableCellClassName, 'font-mono tabular-nums');
  }
  if (column === 'created' || column === 'updated') {
    return cn(portalDataTableCellClassName, 'tabular-nums');
  }
  return portalDataTableCellClassName;
}

function PlanCatalogColumnsMenu({
  rows,
  prefs,
  canEdit,
  onToggle,
}: {
  rows: readonly PlanCatalogItem[];
  prefs: PlanCatalogColumnPrefs;
  canEdit: boolean;
  onToggle: (id: PlanCatalogColumnId) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Columnas de la tabla"
          title="Columnas"
        >
          <Columns3 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width="w-56" sideOffset={8}>
        <DropdownMenuHeader title="Columnas" />
        {PLAN_CATALOG_COLUMN_IDS.map((id) => {
          const locked = PLAN_CATALOG_LOCKED_COLUMNS.has(id);
          const checked = isColumnVisible(id, rows, prefs);
          return (
            <DropdownMenuItem
              key={id}
              disabled={locked}
              aria-checked={checked}
              onClick={(event) => {
                event.preventDefault();
                onToggle(id);
              }}
              className="justify-between gap-3"
            >
              <span>{PLAN_CATALOG_COLUMN_LABELS[id]}</span>
              <Check
                className={cn('h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')}
                aria-hidden="true"
              />
            </DropdownMenuItem>
          );
        })}
        {canEdit ? (
          <DropdownMenuItem disabled aria-checked className="justify-between gap-3">
            <span>Acciones</span>
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface PlanCatalogTableProps {
  canEdit: boolean;
  isLoading: boolean;
  totalPlans: number;
  filteredPlans: PlanCatalogItem[];
  focusId?: string | null | undefined;
  searchValue: string;
  missingPriceFilter: boolean;
  hasActiveFilters: boolean;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onUpdateFilters: (patch: Partial<PlanCatalogFilters>) => void;
  onClearFilters: () => void;
  onOpenCreate: () => void;
  onOpenEdit: (plan: PlanCatalogItem) => void;
  sortableFields?: readonly string[];
  activeSort?: TableSortState | null;
  onSortChange?: (sort: TableSortState | null) => void;
}

export function PlanCatalogTable({
  canEdit,
  isLoading,
  totalPlans,
  filteredPlans,
  focusId = null,
  searchValue,
  missingPriceFilter,
  hasActiveFilters,
  page,
  pageCount,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onUpdateFilters,
  onClearFilters,
  onOpenCreate,
  onOpenEdit,
  sortableFields = [],
  activeSort = null,
  onSortChange,
}: PlanCatalogTableProps) {
  const [columnPrefs, setColumnPrefs] = useState<PlanCatalogColumnPrefs>({});

  useEffect(() => {
    setColumnPrefs(loadPlanCatalogColumnPrefs());
  }, []);

  const visibleColumns = useMemo(
    () => resolveVisibleColumns(filteredPlans, columnPrefs, canEdit),
    [canEdit, columnPrefs, filteredPlans],
  );
  const showTechnologySubtitle = !visibleColumns.includes('technology');

  const minPageSize = PLAN_CATALOG_PAGE_SIZE_OPTIONS[0];
  const showPageSizeSelect = totalPlans > minPageSize;
  const pageSizeSelect = (className?: string) =>
    showPageSizeSelect ? (
      <PortalPageSizeSelect
        value={pageSize}
        onChange={onPageSizeChange}
        options={PLAN_CATALOG_PAGE_SIZE_OPTIONS}
        disabled={isLoading}
        className={className}
      />
    ) : null;

  function toggleColumn(id: PlanCatalogColumnId) {
    if (PLAN_CATALOG_LOCKED_COLUMNS.has(id)) {
      return;
    }
    const nextVisible = !isColumnVisible(id, filteredPlans, columnPrefs);
    const nextPrefs = { ...columnPrefs, [id]: nextVisible };
    setColumnPrefs(nextPrefs);
    persistPlanCatalogColumnPrefs(nextPrefs);
  }

  const sortableFieldSet = useMemo(() => new Set(sortableFields), [sortableFields]);
  const canSort = sortableFieldSet.size > 0 && typeof onSortChange === 'function';

  const mobileSortOptions = useMemo(() => {
    const options = [{ value: '', label: 'Orden por defecto' }];
    for (const field of sortableFields) {
      const label = planCatalogSortLabel(field);
      options.push({ value: `${field}:asc`, label: `${label} · ascendente` });
      options.push({ value: `${field}:desc`, label: `${label} · descendente` });
    }
    return options;
  }, [sortableFields]);

  const mobileSortValue = activeSort ? `${activeSort.by}:${activeSort.dir}` : '';

  function renderColumnHead(column: PlanCatalogVisibleColumnId) {
    const label = column === 'actions' ? 'Acciones' : PLAN_CATALOG_COLUMN_LABELS[column];
    const field = planCatalogSortField(column);
    const headClassName = 'normal-case tracking-normal text-sm font-medium';
    if (canSort && field && sortableFieldSet.has(field) && onSortChange) {
      return (
        <PortalDataTableSortableHead
          key={column}
          field={field}
          activeSort={activeSort}
          onSortChange={onSortChange}
          loading={isLoading}
          className={headClassName}
        >
          {label}
        </PortalDataTableSortableHead>
      );
    }
    return (
      <PortalDataTableHead key={column} className={headClassName}>
        {label}
      </PortalDataTableHead>
    );
  }

  if (isLoading && filteredPlans.length === 0) {
    return (
      <div className="space-y-2" aria-busy="true">
        <PortalSkeletonBlock className="h-10 rounded-xl" />
        <PortalSkeletonBlock className="h-12 rounded-xl" />
        <PortalSkeletonBlock className="h-12 rounded-xl" />
        <PortalSkeletonBlock className="h-12 rounded-xl" />
      </div>
    );
  }

  if (totalPlans === 0 && !hasActiveFilters) {
    return (
      <PortalEmptyState
        title="Sin planes registrados"
        description="No hay planes registrados todavía. Crea el primero para empezar a vender."
        icon={CheckCircle2}
        {...(canEdit
          ? {
              action: (
                <Button variant="primary" onClick={onOpenCreate}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo plan
                </Button>
              ),
            }
          : {})}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <PortalSearchField
            id="plan-search"
            label="Buscar plan"
            placeholder="Buscar por nombre"
            value={searchValue}
            onChange={(value) => onUpdateFilters({ q: value })}
            className="min-w-[12rem] flex-1 basis-[16rem]"
          />

          <PortalFilterChip
            active={missingPriceFilter}
            onClick={() => onUpdateFilters({ missingPrice: !missingPriceFilter })}
            className={cn(
              'h-12 px-4',
              !missingPriceFilter &&
                'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:border-amber-400/50',
            )}
          >
            Sin precio vigente
          </PortalFilterChip>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClearFilters}
              className="h-12 px-4"
            >
              Limpiar filtros
            </Button>
          )}

          {pageSizeSelect('lg:hidden')}
        </div>

        <PlanCatalogColumnsMenu
          rows={filteredPlans}
          prefs={columnPrefs}
          canEdit={canEdit}
          onToggle={toggleColumn}
        />
      </div>

      {canSort ? (
        <div className="sm:hidden">
          <Select
            id="plan-mobile-sort"
            aria-label="Ordenar por"
            className="h-12"
            value={mobileSortValue}
            disabled={isLoading}
            onChange={(event) => {
              const raw = event.target.value;
              if (!raw) {
                onSortChange?.(null);
                return;
              }
              const [by, dir] = raw.split(':');
              if (by && (dir === 'asc' || dir === 'desc')) {
                onSortChange?.({ by, dir });
              }
            }}
            options={mobileSortOptions}
          />
        </div>
      ) : null}

      {filteredPlans.length === 0 ? (
        <PortalEmptyState
          title="No hay planes para los filtros seleccionados"
          description="Ajusta la búsqueda o el filtro «Sin precio vigente» para ver otros resultados."
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClearFilters}
              className="h-12 px-4"
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div
          className={portalDataTableShellClassName}
          data-testid="plan-catalog-table-shell"
          aria-busy={isLoading}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className={portalDataTableHeadRowClassName}>
                <tr>{visibleColumns.map((column) => renderColumnHead(column))}</tr>
              </thead>
              <tbody className={portalDataTableBodyClassName}>
                {filteredPlans.map((plan) => {
                  return (
                    <tr
                      key={plan.id}
                      data-focused={focusId === plan.id ? 'true' : undefined}
                      className={cn(
                        portalTableRowHoverClassName,
                        !plan.isActive && portalDataTableInactiveRowClassName,
                        focusId === plan.id &&
                          'bg-amber-50/80 ring-2 ring-inset ring-amber-400/60 dark:bg-amber-500/10',
                      )}
                    >
                      {visibleColumns.map((column) => (
                        <td key={column} className={columnCellClassName(column)}>
                          {renderPlanColumnCell(plan, column, {
                            canEdit,
                            showTechnologySubtitle,
                            onOpenEdit,
                          })}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPlans > 0 ? (
            <PortalTablePager
              page={page}
              pageCount={Math.max(1, pageCount)}
              onPageChange={onPageChange}
              from={from}
              to={to}
              total={totalPlans}
              resource={{ singular: 'plan', plural: 'planes' }}
              loading={isLoading}
              pageSizeControl={pageSizeSelect('hidden lg:flex') ?? undefined}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
