'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from '@iwana/ui';
import { CatalogItemType, DiscountType, PromotionScope } from '@iwana/shared';
import {
  ApiError,
  COMMERCIAL_LIST_PAGE_SIZE,
  COMMERCIAL_PICKER_LIMIT,
  commercialApi,
  type AdditionalProduct,
  type AdditionalService,
  type CommercialBundle,
  type CommercialListMeta,
  type CommercialListParams,
  type CommercialPromotion,
  type CreatePromotionDto,
  type PlanCatalogItem,
  type UpdatePromotionDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import {
  CreatePromotionForm,
  type PromotionTargetItem,
} from '@/components/commercial/CreatePromotionForm';
import {
  applyCommercialOfferStatusToSearchParams,
  parseCommercialOfferStatusFromSearchParams,
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
  PortalResultsStrip,
  PortalSuccessAlert,
  PortalTablePagination,
  portalDataTableCellClassName,
  portalDataTableBodyClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { useCommercialFocusConsume } from '@/components/commercial/useCommercialFocusConsume';

interface PromotionsManagerProps {
  canEdit: boolean;
  focusId?: string | null | undefined;
  onFocusConsumed?: (() => void) | undefined;
}

const PROMOTION_FORM_ID = 'promotion-form';

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

export function PromotionsManager({
  canEdit,
  focusId = null,
  onFocusConsumed,
}: PromotionsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const offerStatusFilter = parseCommercialOfferStatusFromSearchParams(searchParams);

  const [promotions, setPromotions] = useState<CommercialPromotion[]>([]);
  const [bundles, setBundles] = useState<CommercialBundle[]>([]);
  const [targetItems, setTargetItems] = useState<PromotionTargetItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<CommercialPromotion | null>(null);
  const [deletingPromotionId, setDeletingPromotionId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isEditMode = editingPromotion !== null;

  const activePromotions = useMemo(
    () => promotions.filter((promotion) => promotion.isActive),
    [promotions],
  );

  const visiblePromotions = promotions;

  const clearExpiringFilter = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    applyCommercialOfferStatusToSearchParams(nextSearchParams, null);
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const [meta, setMeta] = useState<CommercialListMeta | null>(null);
  const [listParams, setListParams] = useState<CommercialListParams>({
    limit: COMMERCIAL_LIST_PAGE_SIZE,
  });

  function buildPromotionListParams(): CommercialListParams {
    const params: CommercialListParams = { limit: COMMERCIAL_LIST_PAGE_SIZE };
    if (offerStatusFilter === 'expiring') {
      params.offerStatus = 'expiring';
    }
    return params;
  }

  const loadContext = useCallback(async (params: CommercialListParams, append = false) => {
    // En append solo se marca loadingMore: la tabla permanece visible durante la paginación.
    if (append) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);
    setActionError(null);

    try {
      const picker = { limit: COMMERCIAL_PICKER_LIMIT };
      const [promotionResult, bundleResult, plans, products, services] = await Promise.all([
        commercialApi.getPromotions(params),
        append
          ? Promise.resolve(null)
          : commercialApi.getBundles({ limit: COMMERCIAL_PICKER_LIMIT }),
        append ? Promise.resolve(null) : commercialApi.getPlans(picker),
        append ? Promise.resolve(null) : commercialApi.getAdditionalProducts(picker),
        append ? Promise.resolve(null) : commercialApi.getAdditionalServices(picker),
      ]);

      setPromotions((prev) => {
        const page = promotionResult.data ?? [];
        return append ? [...prev, ...page] : page;
      });
      setMeta(
        promotionResult.meta ?? {
          ...EMPTY_LIST_META,
          nextCursor: null,
          total: promotionResult.data?.length ?? 0,
        },
      );
      setListParams(params);

      if (!append && bundleResult && plans && products && services) {
        setBundles(bundleResult.data ?? []);
        const allItems: PromotionTargetItem[] = [
          ...(plans.data ?? []).map((item: PlanCatalogItem) => ({
            id: item.id,
            name: item.name,
            type: CatalogItemType.PLAN,
          })),
          ...(products.data ?? []).map((item: AdditionalProduct) => ({
            id: item.id,
            name: item.name,
            type: CatalogItemType.PRODUCT,
          })),
          ...(services.data ?? []).map((item: AdditionalService) => ({
            id: item.id,
            name: item.name,
            type: CatalogItemType.SERVICE,
          })),
        ];
        setTargetItems(allItems);
      }
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void loadContext({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  useEffect(() => {
    void loadContext(buildPromotionListParams());
  }, [loadContext, offerStatusFilter]);

  function openCreatePeek() {
    setEditingPromotion(null);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsPeekOpen(true);
  }

  function openEditPeek(promotion: CommercialPromotion) {
    setEditingPromotion(promotion);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsPeekOpen(true);
  }

  function handlePeekClose() {
    setIsPeekOpen(false);
    setEditingPromotion(null);
    setFormError(null);
  }

  useCommercialFocusConsume({
    focusId,
    isLoading,
    items: promotions,
    getId: (item) => item.id,
    onMatch: (promotion) => {
      if (canEdit) {
        openEditPeek(promotion);
      }
      const row = document.querySelector(`[data-commercial-focus="${promotion.id}"]`);
      if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest' });
      }
    },
    onFocusConsumed,
  });

  const handleSubmitPromotion = async (dto: CreatePromotionDto | UpdatePromotionDto) => {
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingPromotion) {
        await commercialApi.updatePromotion(editingPromotion.id, dto as UpdatePromotionDto);
        handlePeekClose();
        setSuccessMessage('Promoción actualizada.');
        void loadContext(buildPromotionListParams());
        return;
      }

      await commercialApi.createPromotion(dto as CreatePromotionDto);
      handlePeekClose();
      setSuccessMessage('Promoción creada.');
      void loadContext(buildPromotionListParams());
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError(
          isEditMode
            ? 'No fue posible guardar la promoción. Intenta de nuevo.'
            : 'No fue posible crear la promoción. Intenta de nuevo.',
        );
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
      await commercialApi.deactivatePromotion(deactivateTarget.id);
      setDeactivateTarget(null);
      setSuccessMessage('Promoción desactivada.');
      void loadContext(buildPromotionListParams());
    } catch (error) {
      setActionError(mapActionError(error));
    } finally {
      setDeletingPromotionId(null);
    }
  };

  const hasMore = meta?.nextCursor != null;
  const totalPromotions = meta?.total ?? promotions.length;
  const resourceWord = totalPromotions === 1 ? 'promoción' : 'promociones';
  const resultsLabel = hasMore
    ? `${visiblePromotions.length} de ${totalPromotions} ${resourceWord}`
    : `${totalPromotions} ${resourceWord}`;

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
            <Button variant="primary" onClick={openCreatePeek}>
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadContext(buildPromotionListParams())}
            >
              Reintentar
            </Button>
          }
        />
      ) : offerStatusFilter === 'expiring' && promotions.length === 0 ? (
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
      ) : promotions.length === 0 ? (
        <PortalEmptyState
          title="Sin promociones creadas"
          description='Usa "Crear promoción" para iniciar una campaña.'
          icon={CheckCircle2}
          {...(canEdit
            ? {
                action: (
                  <Button variant="primary" onClick={openCreatePeek}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Crear promoción
                  </Button>
                ),
              }
            : {})}
        />
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

          <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className={portalDataTableHeadRowClassName}>
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
                <tbody className={portalDataTableBodyClassName}>
                  {visiblePromotions.map((promotion) => (
                    <tr
                      key={promotion.id}
                      data-commercial-focus={promotion.id}
                      data-focused={focusId === promotion.id ? 'true' : undefined}
                      className={cn(
                        portalTableRowHoverClassName,
                        !promotion.isActive && portalDataTableInactiveRowClassName,
                        focusId === promotion.id &&
                          'bg-amber-50/80 ring-2 ring-inset ring-amber-400/60 dark:bg-amber-500/10',
                      )}
                    >
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
                      <td className={cn(portalDataTableCellClassName, 'font-mono tabular-nums')}>
                        {formatDiscount(promotion.discountType, promotion.discountValue)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {formatScope(promotion.appliesTo)}
                      </td>
                      <td className={`${portalDataTableCellClassName} font-mono tabular-nums`}>
                        {promotion.currentUses} / {promotion.maxUses ?? 'Sin límite'}
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
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditPeek(promotion)}
                              aria-label={`Editar promoción ${promotion.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              Editar
                            </Button>
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
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PortalTablePagination
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              loading={loadingMore}
              resourceLabel="promociones"
              shown={visiblePromotions.length}
              total={totalPromotions}
            />
          </div>
        </div>
      )}

      <PortalSidePeek
        open={isPeekOpen}
        onClose={handlePeekClose}
        eyebrow="Ofertas"
        title={isEditMode ? 'Editar promoción' : 'Crear promoción'}
        description={
          isEditMode
            ? 'Actualiza el nombre, la descripción y la vigencia. El código no se modifica.'
            : 'Configura un incentivo temporal con alcance, vigencia y límite de uso opcional.'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={handlePeekClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={PROMOTION_FORM_ID}
              disabled={!canEdit}
              loading={isSubmitting}
            >
              {isEditMode ? 'Guardar' : 'Crear promoción'}
            </Button>
          </div>
        }
      >
        <CreatePromotionForm
          formId={PROMOTION_FORM_ID}
          open={isPeekOpen}
          canEdit={canEdit}
          isSubmitting={isSubmitting}
          serverError={formError}
          bundles={bundles}
          items={targetItems}
          mode={isEditMode ? 'edit' : 'create'}
          initialPromotion={editingPromotion}
          onSubmit={handleSubmitPromotion}
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
