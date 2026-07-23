'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CircleAlert, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
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
  CreatePromotionForm,
  type PromotionTargetItem,
} from '@/components/commercial/CreatePromotionForm';
import {
  applyCommercialOfferStatusToSearchParams,
  matchesCommercialExpiringOfferFilter,
  parseCommercialOfferStatus,
} from '@/components/commercial/commercial-tab-params';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalSidePeek,
  PortalSkeletonBlock,
  PortalSuccessAlert,
  portalDataTableCellClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';

interface PromotionsManagerProps {
  canEdit: boolean;
}

const CREATE_PROMOTION_FORM_ID = 'create-promotion-form';

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
  if (scope === PromotionScope.ITEM) return 'Ítem';
  if (scope === PromotionScope.BUNDLE) return 'Combo';
  return 'Instalación';
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

function mapActionError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible desactivar la promoción. Intenta de nuevo.';
}

export function PromotionsManager({ canEdit }: PromotionsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const offerStatusFilter = parseCommercialOfferStatus(searchParams.get('status'));

  const [promotions, setPromotions] = useState<CommercialPromotion[]>([]);
  const [bundles, setBundles] = useState<CommercialBundle[]>([]);
  const [targetItems, setTargetItems] = useState<PromotionTargetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const [deletingPromotionId, setDeletingPromotionId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const activePromotions = useMemo(
    () => promotions.filter((promotion) => promotion.isActive),
    [promotions],
  );

  const visiblePromotions = useMemo(() => {
    if (offerStatusFilter !== 'expiring') {
      return promotions;
    }

    return promotions.filter((promotion) =>
      matchesCommercialExpiringOfferFilter(promotion, 'promotion'),
    );
  }, [offerStatusFilter, promotions]);

  const clearExpiringFilter = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    applyCommercialOfferStatusToSearchParams(nextSearchParams, null);
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const loadContext = async () => {
    setIsLoading(true);
    setLoadError(null);
    setActionError(null);

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

  function openCreatePeek() {
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsPeekOpen(true);
  }

  function handlePeekClose() {
    setIsPeekOpen(false);
    setFormError(null);
  }

  const handleCreatePromotion = async (dto: CreatePromotionDto) => {
    setIsSubmitting(true);
    setFormError(null);

    try {
      const updated = await commercialApi.createPromotion(dto);
      setPromotions(updated);
      setIsPeekOpen(false);
      setSuccessMessage('Promoción creada.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('No fue posible crear la promoción. Intenta de nuevo.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivatePromotion = async () => {
    if (!deactivateTarget) return;

    setDeletingPromotionId(deactivateTarget.id);
    setActionError(null);

    try {
      const updated = await commercialApi.deactivatePromotion(deactivateTarget.id);
      setPromotions(updated);
      setDeactivateTarget(null);
      setSuccessMessage('Promoción desactivada.');
    } catch (error) {
      setActionError(mapActionError(error));
    } finally {
      setDeletingPromotionId(null);
    }
  };

  const showLoadErrorOnly = Boolean(loadError) && promotions.length === 0 && !isLoading;

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
            <Button onClick={openCreatePeek}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear promoción
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <PortalSkeletonBlock className="h-10 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
        </div>
      ) : showLoadErrorOnly ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar promociones"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadContext()}>
              Reintentar
            </Button>
          }
        />
      ) : promotions.length === 0 ? (
        <PortalEmptyState
          title="Sin promociones creadas"
          description='Usa "Crear promoción" para iniciar una campaña.'
          icon={CheckCircle2}
          {...(canEdit
            ? {
                action: (
                  <Button onClick={openCreatePeek}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Crear promoción
                  </Button>
                ),
              }
            : {})}
        />
      ) : offerStatusFilter === 'expiring' && visiblePromotions.length === 0 ? (
        <div className="space-y-4">
          {successMessage ? (
            <PortalSuccessAlert
              message={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}
          <PortalEmptyState
            title="Sin promociones en riesgo"
            description="No hay promociones que venzan en los próximos 7 días ni cerca del límite de usos."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={clearExpiringFilter}>
                Quitar filtro
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {successMessage ? (
            <PortalSuccessAlert
              message={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}

          {actionError && !deactivateTarget && (
            <PortalAlert
              variant="error"
              title="No fue posible completar la acción"
              description={actionError}
              icon={CircleAlert}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActionError(null)}
                >
                  Cerrar
                </Button>
              }
            />
          )}

          {offerStatusFilter === 'expiring' ? (
            <PortalAlert
              variant="info"
              title="Filtro activo"
              description="Mostrando promociones que vencen pronto o están cerca del límite de usos."
              action={
                <Button type="button" variant="ghost" size="sm" onClick={clearExpiringFilter}>
                  Quitar filtro
                </Button>
              }
            />
          ) : null}

          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                  <tr>
                    <PortalDataTableHead>Promoción</PortalDataTableHead>
                    <PortalDataTableHead>Código</PortalDataTableHead>
                    <PortalDataTableHead>Descuento</PortalDataTableHead>
                    <PortalDataTableHead>Alcance</PortalDataTableHead>
                    <PortalDataTableHead>Usos</PortalDataTableHead>
                    <PortalDataTableHead>Vigencia</PortalDataTableHead>
                    <PortalDataTableHead>Estado</PortalDataTableHead>
                    {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                  {visiblePromotions.map((promotion) => (
                    <tr key={promotion.id} className={portalTableRowHoverClassName}>
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
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getPortalActiveBadgeVariant(promotion.isActive)}>
                          {promotion.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </td>
                      {canEdit && (
                        <td className={portalDataTableCellClassName}>
                          <Button
                            type="button"
                            variant="softDestructive"
                            size="sm"
                            disabled={deletingPromotionId === promotion.id || !promotion.isActive}
                            loading={deletingPromotionId === promotion.id}
                            onClick={() => {
                              setActionError(null);
                              setDeactivateTarget({ id: promotion.id, name: promotion.name });
                            }}
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
        </div>
      )}

      <PortalSidePeek
        open={isPeekOpen}
        onClose={handlePeekClose}
        eyebrow="Ofertas"
        title="Crear promoción"
        description="Configura un incentivo temporal con alcance, vigencia y límite de uso opcional."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={handlePeekClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={CREATE_PROMOTION_FORM_ID}
              disabled={!canEdit}
              loading={isSubmitting}
            >
              Crear promoción
            </Button>
          </div>
        }
      >
        <CreatePromotionForm
          formId={CREATE_PROMOTION_FORM_ID}
          open={isPeekOpen}
          canEdit={canEdit}
          isSubmitting={isSubmitting}
          serverError={formError}
          bundles={bundles}
          items={targetItems}
          onSubmit={handleCreatePromotion}
        />
      </PortalSidePeek>

      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar promoción</DialogTitle>
            <DialogDescription>
              ¿Desactivar <strong>{deactivateTarget?.name}</strong>? La promoción dejará de
              aplicarse en nuevas ventas.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <PortalAlert
              variant="error"
              title="No fue posible desactivar"
              description={actionError}
              icon={CircleAlert}
              className="mt-3"
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!!deletingPromotionId}
              onClick={() => {
                setDeactivateTarget(null);
                setActionError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeactivatePromotion()}
              loading={!!deletingPromotionId}
            >
              Desactivar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
