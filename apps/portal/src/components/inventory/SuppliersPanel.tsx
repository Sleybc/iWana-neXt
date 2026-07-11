'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { Button } from '@iwana/ui';
import type { SupplierProfileRecord } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalSearchField,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { SuppliersTable } from './SuppliersTable';
import { InventoryCatalogProductsSkeleton } from './InventoryCatalogProductsSkeleton';

interface SuppliersPanelProps {
  suppliers: SupplierProfileRecord[];
  isLoading: boolean;
  isRefreshing?: boolean;
  onCreate: () => void;
  onRowClick: (supplier: SupplierProfileRecord) => void;
  createAction?: ReactNode;
}

export function SuppliersPanel({
  suppliers,
  isLoading,
  isRefreshing = false,
  onCreate,
  onRowClick,
  createAction,
}: SuppliersPanelProps) {
  const [search, setSearch] = useState('');

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return suppliers;
    }

    return suppliers.filter((supplier) => {
      const haystack = [
        supplier.party?.displayName ?? '',
        supplier.supplierCode,
        supplier.purchasingContactName ?? '',
        supplier.purchasingContactEmail ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [suppliers, search]);

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreate}>
      Nuevo proveedor
    </Button>
  );

  const hasSearch = Boolean(search.trim());
  const counterLabel = hasSearch
    ? `${filteredSuppliers.length} de ${suppliers.length} proveedores`
    : `${suppliers.length} proveedores`;

  if (isLoading && suppliers.length === 0) {
    return <InventoryCatalogProductsSkeleton />;
  }

  if (suppliers.length === 0) {
    return (
      <PortalEmptyState
        title="Sin proveedores registrados"
        description="Registra proveedores para vincularlos a compras y cotizaciones."
        icon={Truck}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{counterLabel}</p>
      </div>

      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_auto] xl:items-end">
          <PortalSearchField
            id="suppliers-search"
            label="Buscar proveedor"
            placeholder="Nombre o código"
            value={search}
            onChange={setSearch}
          />
          {hasSearch ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 px-4"
              onClick={() => setSearch('')}
            >
              Limpiar búsqueda
            </Button>
          ) : null}
        </div>
      </div>

      {filteredSuppliers.length === 0 ? (
        <PortalEmptyState
          title="Sin resultados con esta búsqueda"
          description="Cambia la búsqueda para encontrar otro proveedor."
          action={
            <Button type="button" variant="secondary" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <SuppliersTable
              suppliers={filteredSuppliers}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              suppressEmptyState
              onRowClick={onRowClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}
