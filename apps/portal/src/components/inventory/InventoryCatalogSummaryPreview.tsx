'use client';

import { Button } from '@iwana/ui';
import type { InventoryItemRecord } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { InventoryItemsTable } from './InventoryItemsTable';

const PREVIEW_LIMIT = 6;

interface InventoryCatalogSummaryPreviewProps {
  items: InventoryItemRecord[];
  totalCount?: number;
  isLoading?: boolean;
  onOpenCatalog: () => void;
}

export function InventoryCatalogSummaryPreview({
  items,
  totalCount,
  isLoading = false,
  onOpenCatalog,
}: InventoryCatalogSummaryPreviewProps) {
  const previewItems = items.slice(0, PREVIEW_LIMIT);
  const resolvedTotal = totalCount ?? items.length;
  const hasMore = resolvedTotal > PREVIEW_LIMIT;

  return (
    <PortalPanel
      eyebrow="Catálogo"
      title="Vista previa de productos"
      description="Muestra los primeros productos del catálogo. Para filtrar, editar o administrar, abre la pestaña Catálogo."
      actions={
        <Button type="button" variant="secondary" onClick={onOpenCatalog}>
          Ir al catálogo
        </Button>
      }
    >
      {isLoading ? (
        <PortalSkeletonBlock className="h-48 rounded-2xl" />
      ) : items.length === 0 ? (
        <PortalEmptyState
          title="Sin productos registrados"
          description="Crea el primer producto desde la pestaña Catálogo."
          action={
            <Button type="button" onClick={onOpenCatalog}>
              Ir al catálogo
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <InventoryItemsTable items={previewItems} />
          {hasMore ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Mostrando {PREVIEW_LIMIT} de {resolvedTotal} productos.
            </p>
          ) : null}
        </div>
      )}
    </PortalPanel>
  );
}
