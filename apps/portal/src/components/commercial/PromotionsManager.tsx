'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
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

interface PromotionsManagerProps {
  canEdit: boolean;
}

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-200';

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

  return 'No fue posible cargar las promociones del tenant.';
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
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Promociones temporales
            </p>
            <CardTitle className="mt-1 text-lg font-semibold">Campanas activas</CardTitle>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Publica beneficios temporales con control de vigencia, alcance y maximo de usos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {activePromotions.length} activa{activePromotions.length === 1 ? '' : 's'}
            </Badge>
            {canEdit && (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Crear promocion
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-28 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
        ) : loadError ? (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{loadError}</p>
          </div>
        ) : promotions.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 dark:border-dark-border dark:text-gray-300">
            No hay promociones creadas. Usa "Crear promocion" para iniciar una campana.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[24px] border border-gray-200 dark:border-dark-border">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
                <tr>
                  <th className={tableHeadClass}>Promocion</th>
                  <th className={tableHeadClass}>Codigo</th>
                  <th className={tableHeadClass}>Descuento</th>
                  <th className={tableHeadClass}>Alcance</th>
                  <th className={tableHeadClass}>Usos</th>
                  <th className={tableHeadClass}>Vigencia</th>
                  {canEdit && <th className={tableHeadClass}>Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                {promotions.map((promotion) => (
                  <tr key={promotion.id}>
                    <td className={cellClass}>
                      <p className="font-medium text-gray-800 dark:text-gray-100">
                        {promotion.name}
                      </p>
                      {promotion.description && (
                        <p className="mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
                          {promotion.description}
                        </p>
                      )}
                    </td>
                    <td className={cellClass}>
                      <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-dark-surface-3">
                        {promotion.code}
                      </span>
                    </td>
                    <td className={cellClass}>
                      {formatDiscount(promotion.discountType, promotion.discountValue)}
                    </td>
                    <td className={cellClass}>{formatScope(promotion.appliesTo)}</td>
                    <td className={cellClass}>
                      {promotion.currentUses} / {promotion.maxUses ?? '∞'}
                    </td>
                    <td className={cellClass}>
                      {formatRange(promotion.validFrom, promotion.validTo)}
                    </td>
                    {canEdit && (
                      <td className={cellClass}>
                        <button
                          type="button"
                          disabled={deletingPromotionId === promotion.id || !promotion.isActive}
                          onClick={() => handleDeactivatePromotion(promotion.id)}
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
        )}
      </CardContent>

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
    </Card>
  );
}
