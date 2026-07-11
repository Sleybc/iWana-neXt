'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import { CatalogItemType, DiscountType } from '@iwana/shared';
import {
  ApiError,
  commercialApi,
  type CommercialBundle,
  type CreateBundleDto,
  type PlanCatalogItem,
  type AdditionalProduct,
  type AdditionalService,
} from '@/lib/api-client';
import {
  CreateBundleModal,
  type BundleCatalogSelectableItem,
} from '@/components/commercial/CreateBundleModal';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';

interface BundlesManagerProps {
  canEdit: boolean;
}

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDateRange(validFrom: string, validTo: string | null): string {
  const from = new Date(validFrom).toLocaleDateString('es-CO');
  const to = validTo ? new Date(validTo).toLocaleDateString('es-CO') : 'Sin vencimiento';
  return `${from} - ${to}`;
}

function formatDiscount(bundle: CommercialBundle): string {
  if (bundle.discountType === DiscountType.PERCENTAGE) {
    return `${Number(bundle.discountValue)}%`;
  }

  return formatCurrency(bundle.discountValue);
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu rol no tiene permisos para consultar los combos.';
    }

    return error.message;
  }

  return 'No fue posible cargar los combos de la empresa.';
}

export function BundlesManager({ canEdit }: BundlesManagerProps) {
  const [bundles, setBundles] = useState<CommercialBundle[]>([]);
  const [bundleItemCount, setBundleItemCount] = useState<Record<string, number>>({});
  const [availableItems, setAvailableItems] = useState<BundleCatalogSelectableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null);

  const activeBundles = useMemo(() => bundles.filter((bundle) => bundle.isActive), [bundles]);

  const loadOfferCatalog = async () => {
    const [plans, products, services] = await Promise.all([
      commercialApi.getPlans(),
      commercialApi.getAdditionalProducts(),
      commercialApi.getAdditionalServices(),
    ]);

    const normalizedItems: BundleCatalogSelectableItem[] = [
      ...plans.map((item: PlanCatalogItem) => ({
        id: item.id,
        name: item.name,
        type: CatalogItemType.PLAN,
        isActive: item.isActive,
      })),
      ...products.map((item: AdditionalProduct) => ({
        id: item.id,
        name: item.name,
        type: CatalogItemType.PRODUCT,
        isActive: item.isActive,
      })),
      ...services.map((item: AdditionalService) => ({
        id: item.id,
        name: item.name,
        type: CatalogItemType.SERVICE,
        isActive: item.isActive,
      })),
    ].filter((item) => item.isActive);

    setAvailableItems(normalizedItems);
  };

  const loadBundles = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await commercialApi.getBundles();
      setBundles(data);

      const countEntries = await Promise.all(
        data.map(async (bundle) => {
          try {
            const detail = await commercialApi.getBundleDetail(bundle.id);
            return [bundle.id, detail.items.length] as const;
          } catch {
            return [bundle.id, 0] as const;
          }
        }),
      );

      setBundleItemCount(Object.fromEntries(countEntries));
      await loadOfferCatalog();
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBundles();
  }, []);

  const handleCreateBundle = async (dto: CreateBundleDto) => {
    setIsSubmitting(true);
    setMutationError(null);

    try {
      const updated = await commercialApi.createBundle(dto);
      setBundles(updated);

      const detail = await Promise.all(
        updated.map(async (bundle) => {
          const bundleInfo = await commercialApi.getBundleDetail(bundle.id);
          return [bundle.id, bundleInfo.items.length] as const;
        }),
      );
      setBundleItemCount(Object.fromEntries(detail));

      setIsModalOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setMutationError(error.message);
      } else {
        setMutationError('No fue posible crear el combo. Intenta de nuevo.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateBundle = async (bundleId: string) => {
    if (!window.confirm('Desactivar este combo?')) {
      return;
    }

    setDeletingBundleId(bundleId);
    setLoadError(null);

    try {
      const updated = await commercialApi.deactivateBundle(bundleId);
      setBundles(updated);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setDeletingBundleId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant={portalActiveCountBadgeVariant}>
          {activeBundles.length} activo{activeBundles.length === 1 ? '' : 's'}
        </Badge>
        {canEdit && (
          <Button size="sm" onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Crear combo
          </Button>
        )}
      </div>

      {isLoading ? (
        <PortalSkeletonBlock className="h-28" />
      ) : loadError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar combos"
          description={loadError}
          icon={CircleAlert}
        />
      ) : bundles.length === 0 ? (
        <PortalEmptyState
          title="Sin combos creados"
          description='Usa "Crear combo" para iniciar tu oferta compuesta.'
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                <tr>
                  <th className={portalDataTableHeadClassName}>Combo</th>
                  <th className={portalDataTableHeadClassName}>Items</th>
                  <th className={portalDataTableHeadClassName}>Descuento</th>
                  <th className={portalDataTableHeadClassName}>Vigencia</th>
                  <th className={portalDataTableHeadClassName}>Estado</th>
                  {canEdit && <th className={portalDataTableHeadClassName}>Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                {bundles.map((bundle) => (
                  <tr key={bundle.id}>
                    <td className={portalDataTableCellClassName}>
                      <p className="font-medium text-gray-800 dark:text-gray-100">{bundle.name}</p>
                      {bundle.description && (
                        <p className="mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
                          {bundle.description}
                        </p>
                      )}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {bundleItemCount[bundle.id] ?? 0}
                    </td>
                    <td className={portalDataTableCellClassName}>{formatDiscount(bundle)}</td>
                    <td className={portalDataTableCellClassName}>
                      {formatDateRange(bundle.validFrom, bundle.validTo)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge
                        variant={getPortalActiveBadgeVariant(bundle.isActive)}
                        className="rounded-full px-2 py-0.5 text-[11px]"
                      >
                        {bundle.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className={portalDataTableCellClassName}>
                        <button
                          type="button"
                          disabled={deletingBundleId === bundle.id || !bundle.isActive}
                          onClick={() => handleDeactivateBundle(bundle.id)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-red-700 transition-colors hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Desactivar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateBundleModal
        open={isModalOpen}
        canEdit={canEdit}
        isSubmitting={isSubmitting}
        serverError={mutationError}
        availableItems={availableItems}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setMutationError(null);
          }
        }}
        onSubmit={handleCreateBundle}
      />
    </div>
  );
}
