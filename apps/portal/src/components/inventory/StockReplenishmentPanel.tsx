'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import { Badge, Input } from '@iwana/ui';
import {
  ApiError,
  inventoryApi,
  type PurchaseRequestLineRecord,
  type ReplenishmentSuggestionRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import type { PurchaseComposerInitialValues } from './PurchaseRequestComposer';
import { PurchaseSelectionBar } from './PurchaseSelectionBar';
import {
  STOCK_AVAILABLE_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  formatInventoryCurrency,
  formatInventoryQuantity,
  getReplenishmentCriticalityLabel,
} from './inventory-labels';

interface StockReplenishmentPanelProps {
  onGeneratePurchaseRequest: (values: PurchaseComposerInitialValues) => void;
}

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar sugerencias de reposición.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible cargar las sugerencias de reposición.';
}

function createSyntheticLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `replenishment-line-${crypto.randomUUID()}`;
  }

  return `replenishment-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function criticalityBadgeVariant(
  criticality: ReplenishmentSuggestionRecord['criticality'],
): 'error' | 'warning' {
  return criticality === 'out' ? 'error' : 'warning';
}

function pluralizeCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildComposerInitialValues(
  suggestions: ReplenishmentSuggestionRecord[],
  quantities: Record<string, string>,
): PurchaseComposerInitialValues {
  const isoDate = new Date().toISOString().slice(0, 10);
  const count = suggestions.length;
  const now = new Date().toISOString();

  const lines: PurchaseRequestLineRecord[] = suggestions.map((suggestion) => ({
    id: createSyntheticLineId(),
    tenantId: '',
    purchaseRequestId: '',
    sourceKind: PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
    inventoryItemId: suggestion.itemId,
    freeTextDescription: `${suggestion.itemSku} - ${suggestion.itemName}`,
    quantityRequested: quantities[suggestion.itemId] ?? suggestion.suggestedQty,
    unitOfMeasure: suggestion.unitOfMeasure,
    suggestedPartyRefId: suggestion.preferredSupplier?.partyRefId ?? null,
    lineStatus: PurchaseRequestLineStatus.OPEN,
    notes: null,
    createdAt: now,
    updatedAt: now,
  }));

  const supplierLabels: Record<string, string> = {};
  for (const suggestion of suggestions) {
    const partyRefId = suggestion.preferredSupplier?.partyRefId;
    const displayName = suggestion.preferredSupplier?.displayName?.trim();
    if (partyRefId && displayName) {
      supplierLabels[partyRefId] = displayName;
    }
  }

  return {
    title: `Reposición sugerida ${isoDate} — ${pluralizeCount(count, 'ítem', 'ítems')} bajo punto de reorden`,
    requestType: PurchaseRequestType.REPLENISHMENT,
    priority: PurchaseRequestPriority.NORMAL,
    requestingArea: 'Existencias',
    justification: `Generada desde existencias con ${pluralizeCount(count, 'producto', 'productos')} bajo punto de reorden.`,
    neededByDate: null,
    lines,
    ...(Object.keys(supplierLabels).length > 0 ? { supplierLabels } : {}),
  };
}

export function StockReplenishmentPanel({
  onGeneratePurchaseRequest,
}: StockReplenishmentPanelProps) {
  const [suggestions, setSuggestions] = useState<ReplenishmentSuggestionRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void inventoryApi
      .listReplenishmentSuggestions()
      .then((result) => {
        if (cancelled) return;
        setSuggestions(result);
        setQuantities(
          Object.fromEntries(result.map((row) => [row.itemId, row.suggestedQty] as const)),
        );
        setSelectedIds(
          new Set(result.filter((row) => row.criticality === 'out').map((row) => row.itemId)),
        );
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(mapInventoryError(loadError));
        setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCount = selectedIds.size;
  const allSelected = suggestions.length > 0 && selectedIds.size === suggestions.length;

  const selectedSuggestions = useMemo(
    () => suggestions.filter((row) => selectedIds.has(row.itemId)),
    [selectedIds, suggestions],
  );

  function toggleItem(itemId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(suggestions.map((row) => row.itemId)));
  }

  function handleGenerate() {
    if (selectedSuggestions.length === 0) {
      return;
    }
    onGeneratePurchaseRequest(buildComposerInitialValues(selectedSuggestions, quantities));
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <PortalSkeletonBlock className="h-12 rounded-xl" />
        <PortalSkeletonBlock className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <PortalAlert
        variant="error"
        title="No fue posible cargar la reposición"
        description={error}
      />
    );
  }

  if (suggestions.length === 0) {
    return (
      <PortalEmptyState
        title="Sin ítems bajo punto de reorden"
        description="No hay productos que requieran reposición con el material disponible y lo ya pedido."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className={portalDataTableShellClassName}>
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className={portalDataTableHeadClassName}>
                <input
                  type="checkbox"
                  className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                  aria-label="Seleccionar todos los productos"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                SKU
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Producto
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                {STOCK_AVAILABLE_LABEL}
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Pendiente
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Punto reorden
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Sugerido
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Proveedor
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Costo estimado
              </th>
              <th scope="col" className={portalDataTableHeadClassName}>
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((row) => {
              const selected = selectedIds.has(row.itemId);
              const quantity = quantities[row.itemId] ?? row.suggestedQty;
              const supplierLabel =
                row.preferredSupplier?.displayName?.trim() ||
                (row.preferredSupplier ? 'Proveedor no identificado' : 'Sin proveedor');

              return (
                <tr key={row.itemId} className={portalTableRowHoverClassName}>
                  <td className={portalDataTableCellClassName}>
                    <input
                      type="checkbox"
                      className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                      aria-label={`Seleccionar ${row.itemSku} ${row.itemName}`}
                      checked={selected}
                      onChange={() => toggleItem(row.itemId)}
                    />
                  </td>
                  <td className={portalDataTableCellClassName}>{row.itemSku}</td>
                  <td className={portalDataTableCellClassName}>{row.itemName}</td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.available)}
                  </td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.pendingPurchase)}
                  </td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.reorderPoint)}
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`Cantidad sugerida para ${row.itemSku}`}
                      value={quantity}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setQuantities((current) => ({
                          ...current,
                          [row.itemId]: nextValue,
                        }));
                      }}
                      className="w-24 tabular-nums"
                    />
                  </td>
                  <td className={portalDataTableCellClassName}>{supplierLabel}</td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {row.estimatedUnitCost == null
                      ? 'Sin costo'
                      : formatInventoryCurrency(row.estimatedLineValue)}
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <Badge variant={criticalityBadgeVariant(row.criticality)}>
                      {getReplenishmentCriticalityLabel(row.criticality)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
        {STOCK_RESERVED_HELP_TEXT}
      </p>

      <PurchaseSelectionBar
        count={selectedCount}
        resolveAddLabel={(count) => `Generar solicitud de compra (${count})`}
        onClear={() => setSelectedIds(new Set())}
        onAdd={handleGenerate}
      />
    </div>
  );
}
