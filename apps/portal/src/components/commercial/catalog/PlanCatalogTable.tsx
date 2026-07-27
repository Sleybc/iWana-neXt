'use client';

import { CheckCircle2, CircleAlert, Pencil, Plus } from 'lucide-react';
import { Badge, Button, Select, cn } from '@iwana/ui';
import type { PlanCatalogItem } from '@/lib/api-client';
import {
  hasMissingCurrentPrice,
  MissingCurrentPriceBadge,
} from '@/components/commercial/catalog/MissingCurrentPriceBadge';
import type {
  CatalogStatusFilter,
  PlanCatalogFilters,
} from '@/components/commercial/catalog/catalog-filter-params';
import {
  formatInstallationText,
  formatMoney,
  formatSpeed,
  parseMoneyFromApi,
} from '@/components/commercial/catalog/plan-catalog-helpers';
import { getPortalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import {
  PortalDataTableHead,
  PortalEmptyState,
  PortalFilterChip,
  PortalResultsStrip,
  PortalSearchField,
  PortalSkeletonBlock,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalFilterChipGroupClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';

export interface PlanCatalogTableProps {
  canEdit: boolean;
  isLoading: boolean;
  totalPlans: number;
  filteredPlans: PlanCatalogItem[];
  focusId?: string | null | undefined;
  searchValue: string;
  statusFilter: CatalogStatusFilter;
  missingPriceFilter: boolean;
  hasActiveFilters: boolean;
  resultsLabel: string;
  hasMore: boolean;
  onLoadMore: () => void;
  onUpdateFilters: (patch: Partial<PlanCatalogFilters>) => void;
  onClearFilters: () => void;
  onOpenCreate: () => void;
  onOpenEdit: (plan: PlanCatalogItem) => void;
}

export function PlanCatalogTable({
  canEdit,
  isLoading,
  totalPlans,
  filteredPlans,
  focusId = null,
  searchValue,
  statusFilter,
  missingPriceFilter,
  hasActiveFilters,
  resultsLabel,
  hasMore,
  onLoadMore,
  onUpdateFilters,
  onClearFilters,
  onOpenCreate,
  onOpenEdit,
}: PlanCatalogTableProps) {
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
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_220px_auto] lg:items-end">
        <PortalSearchField
          id="plan-search"
          label="Buscar plan"
          placeholder="Buscar por nombre"
          value={searchValue}
          onChange={(value) => onUpdateFilters({ q: value })}
        />

        <Select
          id="plan-status-filter"
          label="Estado"
          value={statusFilter}
          onChange={(event) =>
            onUpdateFilters({ status: event.target.value as CatalogStatusFilter })
          }
          className="h-12"
        >
          <option value="ALL">Todos</option>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
        </Select>

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
      </div>

      <div className={portalFilterChipGroupClassName}>
        <PortalFilterChip
          active={missingPriceFilter}
          onClick={() => onUpdateFilters({ missingPrice: !missingPriceFilter })}
        >
          Sin precio vigente
        </PortalFilterChip>
      </div>

      <div data-testid="plan-catalog-results-strip">
        <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />
      </div>

      {filteredPlans.length === 0 ? (
        <PortalEmptyState
          title="No hay planes para los filtros seleccionados"
          description="Ajusta la búsqueda, el estado o el chip de precio vigente para recuperar resultados."
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
        <div className={portalDataTableShellClassName} data-testid="plan-catalog-table-shell">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className={portalDataTableHeadRowClassName}>
                <tr>
                  <PortalDataTableHead>Plan</PortalDataTableHead>
                  <PortalDataTableHead>Velocidad</PortalDataTableHead>
                  <PortalDataTableHead>Precio base</PortalDataTableHead>
                  <PortalDataTableHead>Instalación</PortalDataTableHead>
                  <PortalDataTableHead>Estado</PortalDataTableHead>
                  {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                </tr>
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
                      <td className={portalDataTableCellClassName}>
                        <p className="font-semibold text-gray-900 dark:text-white">{plan.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {plan.technology}
                        </p>
                      </td>
                      <td className={cn(portalDataTableCellClassName, 'font-mono tabular-nums')}>
                        {formatSpeed(plan)}
                      </td>
                      <td className={cn(portalDataTableCellClassName, 'font-mono tabular-nums')}>
                        {hasMissingCurrentPrice(plan) ? (
                          <MissingCurrentPriceBadge />
                        ) : (
                          formatMoney(parseMoneyFromApi(plan.basePrice))
                        )}
                      </td>
                      <td className={cn(portalDataTableCellClassName, 'font-mono tabular-nums')}>
                        {formatInstallationText(plan)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getPortalActiveBadgeVariant(plan.isActive)}>
                          {plan.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      {canEdit && (
                        <td className={portalDataTableCellClassName}>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="icon"
                              aria-label={`Editar plan ${plan.name}`}
                              title={`Editar plan ${plan.name}`}
                              onClick={() => onOpenEdit(plan)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PortalTablePagination
            hasMore={hasMore}
            onLoadMore={onLoadMore}
            loading={isLoading}
            resourceLabel="planes"
            shown={filteredPlans.length}
            total={totalPlans}
          />
        </div>
      )}
    </div>
  );
}
