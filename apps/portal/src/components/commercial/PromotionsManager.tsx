'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import { CatalogItemType, DiscountType, PromotionScope } from '@iwana/shared';
import {
  ApiError,
  commercialApi,
  type AdditionalProduct,
  type AdditionalService,
  type CommercialBundle,
  type CommercialPromotion,
  type CreatePromotionDto,
  type PlanCatalogItem,
} from '@/lib/api-client';
import {
  CreatePromotionModal,
  type PromotionTargetItem,
} from '@/components/commercial/CreatePromotionModal';
import { portalActiveCountBadgeVariant } from '@/lib/portal-status-badge-rules';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';

interface PromotionsManagerProps {
  canEdit: boolean;
}

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDiscount(type: DiscountType, value: string): string {
  if (type === DiscountType.PERCENTAGE) {
    return `${Number(value)}%`;
  }

  if (type === DiscountType.FREE_MONTHS) {
    return `${Number(value)} mes(es)`;
  }

  return formatCurrency(value);
}

function formatScope(scope: PromotionScope): string {
  if (scope === PromotionScope.ALL) return 'Todo';
  if (scope === PromotionScope.ITEM) return 'Item';
  if (scope === PromotionScope.BUNDLE) return 'Combo';
  return 'Instalacion';
}

function formatRange(validFrom: string, validTo: string): string {
  const from = new Date(validFrom).toLocaleDateString('es-CO');
  const to = new Date(validTo).toLocaleDateString('es-CO');
  return `${from} - ${to}`;
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu rol no tiene permisos para consultar promociones.';
    }

    return error.message;
  }

  return 'No fue posible cargar las promociones de la empresa.';
}

export function PromotionsManager({ canEdit }: PromotionsManagerProps) {
  const [promotions, setPromotions] = useState<CommercialPromotion[]>([]);
  const [bundles, setBundles] = useState<CommercialBundle[]>([]);
  const [targetItems, setTargetItems] = useState<PromotionTargetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingPromotionId, setDeletingPromotionId] = useState<string | null>(null);

  const activePromotions = useMemo(
    () => promotions.filter((promotion) => promotion.isActive),
    [promotions],
  );

  const loadContext = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [promotionData, bundleData, plans, products, services] = await Promise.all([
        commercialApi.getPromotions(),
        commercialApi.getBundles(),
        commercialApi.getPlans(),
        commercialApi.getAdditionalProducts(),
        commercialApi.getAdditionalServices(),
      ]);

      setPromotions(promotionData);
      setBundles(bundleData);

      const allItems: PromotionTargetItem[] = [
        ...plans.map((item: PlanCatalogItem) => ({
          id: item.id,
          name: item.name,
          type: CatalogItemType.PLAN,
        })),
        ...products.map((item: AdditionalProduct) => ({
          id: item.id,
          name: item.name,
          type: CatalogItemType.PRODUCT,
        })),
        ...services.map((item: AdditionalService) => ({
          id: item.id,
          name: item.name,
          type: CatalogItemType.SERVICE,
        })),
      ];

      setTargetItems(allItems);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, []);

  const handleCreatePromotion = async (dto: CreatePromotionDto) => {
    setIsSubmitting(true);
    setMutationError(null);

    try {
      const updated = await commercialApi.createPromotion(dto);
      setPromotions(updated);
      setIsModalOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setMutationError(error.message);
      } else {
        setMutationError('No fue posible crear la promocion. Intenta de nuevo.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivatePromotion = async (promotionId: string) => {
    if (!window.confirm('Desactivar esta promocion?')) {
      return;
    }

    setDeletingPromotionId(promotionId);
    setLoadError(null);

    try {
      const updated = await commercialApi.deactivatePromotion(promotionId);
      setPromotions(updated);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setDeletingPromotionId(null);
    }
  };

  return (
    <PortalPanel
      eyebrow="Ofertas"
      title="Promociones"
      description="Administra promociones temporales con códigos y límites de uso."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activePromotions.length} activa{activePromotions.length === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Crear promoción
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {isLoading ? (
        <PortalSkeletonBlock className="h-28" />
      ) : loadError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar promociones"
          description={loadError}
          icon={CircleAlert}
        />
      ) : promotions.length === 0 ? (
        <PortalEmptyState
          title="Sin promociones creadas"
          description='Usa "Crear promoción" para iniciar una campaña.'
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                <tr>
                  <th className={portalDataTableHeadClassName}>Promoción</th>
                  <th className={portalDataTableHeadClassName}>Código</th>
                  <th className={portalDataTableHeadClassName}>Descuento</th>
                  <th className={portalDataTableHeadClassName}>Alcance</th>
                  <th className={portalDataTableHeadClassName}>Usos</th>
                  <th className={portalDataTableHeadClassName}>Vigencia</th>
                  {canEdit && <th className={portalDataTableHeadClassName}>Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                {promotions.map((promotion) => (
                  <tr key={promotion.id}>
                    <td className={portalDataTableCellClassName}>
                      <p className="font-medium text-gray-800 dark:text-gray-100">
                        {promotion.name}
                      </p>
                      {promotion.description && (
                        <p className="mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
                          {promotion.description}
                        </p>
                      )}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-dark-surface-3">
                        {promotion.code}
                      </span>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatDiscount(promotion.discountType, promotion.discountValue)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatScope(promotion.appliesTo)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {promotion.currentUses} / {promotion.maxUses ?? '∞'}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatRange(promotion.validFrom, promotion.validTo)}
                    </td>
                    {canEdit && (
                      <td className={portalDataTableCellClassName}>
                        <Button
                          type="button"
                          variant="softDestructive"
                          size="sm"
                          disabled={deletingPromotionId === promotion.id || !promotion.isActive}
                          onClick={() => handleDeactivatePromotion(promotion.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Desactivar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreatePromotionModal
        open={isModalOpen}
        canEdit={canEdit}
        isSubmitting={isSubmitting}
        serverError={mutationError}
        bundles={bundles}
        items={targetItems}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setMutationError(null);
          }
        }}
        onSubmit={handleCreatePromotion}
      />
    </PortalPanel>
  );
}
