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
import { CatalogItemType, DiscountType } from '@iwana/shared';
import {
  ApiError,
  COMMERCIAL_LIST_PAGE_SIZE,
  COMMERCIAL_PICKER_LIMIT,
  commercialApi,
  type CommercialBundle,
  type CommercialListMeta,
  type CommercialListParams,
  type CreateBundleDto,
  type PlanCatalogItem,
  type AdditionalProduct,
  type AdditionalService,
  type UpdateBundleDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import {
  CreateBundleForm,
  type BundleCatalogSelectableItem,
} from '@/components/commercial/CreateBundleForm';
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

interface BundlesManagerProps {
  canEdit: boolean;
  focusId?: string | null | undefined;
  onFocusConsumed?: (() => void) | undefined;
}

const BUNDLE_FORM_ID = 'bundle-form';

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

function mapActionError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return 'No fue posible desactivar el combo. Intenta de nuevo.';
}

export function BundlesManager({ canEdit, focusId = null, onFocusConsumed }: BundlesManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const offerStatusFilter = parseCommercialOfferStatusFromSearchParams(searchParams);

  const [bundles, setBundles] = useState<CommercialBundle[]>([]);
  const [availableItems, setAvailableItems] = useState<BundleCatalogSelectableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<CommercialBundle | null>(null);
  const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isEditMode = editingBundle !== null;

  const activeBundles = useMemo(() => bundles.filter((bundle) => bundle.isActive), [bundles]);

  const visibleBundles = bundles;

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

  function buildBundleListParams(): CommercialListParams {
    const params: CommercialListParams = { limit: COMMERCIAL_LIST_PAGE_SIZE };
    if (offerStatusFilter === 'expiring') {
      params.offerStatus = 'expiring';
    }
    return params;
  }

  const loadOfferCatalog = async () => {
    const picker = { limit: COMMERCIAL_PICKER_LIMIT, isActive: true as const };
    const [plans, products, services] = await Promise.all([
      commercialApi.getPlans(picker),
      commercialApi.getAdditionalProducts(picker),
      commercialApi.getAdditionalServices(picker),
    ]);

    const normalizedItems: BundleCatalogSelectableItem[] = [
      ...plans.data.map((item: PlanCatalogItem) => ({
        id: item.id,
        name: item.name,
        type: CatalogItemType.PLAN,
        isActive: item.isActive,
      })),
      ...products.data.map((item: AdditionalProduct) => ({
        id: item.id,
        name: item.name,
        type: CatalogItemType.PRODUCT,
        isActive: item.isActive,
      })),
      ...services.data.map((item: AdditionalService) => ({
        id: item.id,
        name: item.name,
        type: CatalogItemType.SERVICE,
        isActive: item.isActive,
      })),
    ].filter((item) => item.isActive);

    setAvailableItems(normalizedItems);
  };

  const loadBundles = useCallback(async (params: CommercialListParams, append = false) => {
    setIsLoading(true);
    setLoadError(null);
    setActionError(null);

    try {
      const result = await commercialApi.getBundles(params);
      const page = result.data ?? [];
      setBundles((prev) => (append ? [...prev, ...page] : page));
      setMeta(result.meta ?? { ...EMPTY_LIST_META, nextCursor: null, total: page.length });
      setListParams(params);
      if (!append) {
        await loadOfferCatalog();
      }
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void loadBundles({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  useEffect(() => {
    void loadBundles(buildBundleListParams());
  }, [loadBundles, offerStatusFilter]);

  function openCreatePeek() {
    setEditingBundle(null);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsPeekOpen(true);
  }

  function openEditPeek(bundle: CommercialBundle) {
    setEditingBundle(bundle);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsPeekOpen(true);
  }

  function handlePeekClose() {
    setIsPeekOpen(false);
    setEditingBundle(null);
    setFormError(null);
  }

  useCommercialFocusConsume({
    focusId,
    isLoading,
    items: bundles,
    getId: (item) => item.id,
    onMatch: (bundle) => {
      if (canEdit) {
        openEditPeek(bundle);
      }
      const row = document.querySelector(`[data-commercial-focus="${bundle.id}"]`);
      if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest' });
      }
    },
    onFocusConsumed,
  });

  const handleSubmitBundle = async (dto: CreateBundleDto | UpdateBundleDto) => {
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingBundle) {
        await commercialApi.updateBundle(editingBundle.id, dto as UpdateBundleDto);
        handlePeekClose();
        setSuccessMessage('Combo actualizado.');
        void loadBundles(buildBundleListParams());
        return;
      }

      await commercialApi.createBundle(dto as CreateBundleDto);
      handlePeekClose();
      setSuccessMessage('Combo creado.');
      void loadBundles(buildBundleListParams());
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError(
          isEditMode
            ? 'No fue posible guardar el combo. Intenta de nuevo.'
            : 'No fue posible crear el combo. Intenta de nuevo.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateBundle = async () => {
    if (!deactivateTarget) return;

    setDeletingBundleId(deactivateTarget.id);
    setActionError(null);

    try {
      await commercialApi.deactivateBundle(deactivateTarget.id);
      setDeactivateTarget(null);
      setSuccessMessage('Combo desactivado.');
      void loadBundles(buildBundleListParams());
    } catch (error) {
      setActionError(mapActionError(error));
    } finally {
      setDeletingBundleId(null);
    }
  };

  const hasMore = meta?.nextCursor != null;
  const totalBundles = meta?.total ?? bundles.length;
  const resourceWord = totalBundles === 1 ? 'combo' : 'combos';
  const resultsLabel = hasMore
    ? `${visibleBundles.length} de ${totalBundles} ${resourceWord}`
    : `${totalBundles} ${resourceWord}`;

  const showLoadErrorOnly = Boolean(loadError) && bundles.length === 0 && !isLoading;

  return (
    <PortalPanel
      eyebrow="Ofertas"
      title="Combos"
      description="Administra combos compuestos con descuentos y vigencia."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activeBundles.length} activo{activeBundles.length === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button onClick={openCreatePeek}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear combo
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
          title="No fue posible cargar combos"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadBundles(buildBundleListParams())}
            >
              Reintentar
            </Button>
          }
        />
      ) : offerStatusFilter === 'expiring' && bundles.length === 0 ? (
        <div className="space-y-4">
          {successMessage ? (
            <PortalSuccessAlert
              message={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}
          <PortalEmptyState
            title="Sin combos que vencen pronto"
            description="No hay combos con vigencia en los próximos 7 días."
            action={
              <Button type="button" variant="secondary" size="sm" onClick={clearExpiringFilter}>
                Quitar filtro
              </Button>
            }
          />
        </div>
      ) : bundles.length === 0 ? (
        <PortalEmptyState
          title="Sin combos creados"
          description='Usa "Crear combo" para iniciar tu oferta compuesta.'
          icon={CheckCircle2}
          {...(canEdit
            ? {
                action: (
                  <Button onClick={openCreatePeek}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Crear combo
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
              description="Mostrando combos que vencen en los próximos 7 días."
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
                    <PortalDataTableHead>Combo</PortalDataTableHead>
                    <PortalDataTableHead>Ítems</PortalDataTableHead>
                    <PortalDataTableHead>Descuento</PortalDataTableHead>
                    <PortalDataTableHead>Vigencia</PortalDataTableHead>
                    <PortalDataTableHead>Estado</PortalDataTableHead>
                    {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {visibleBundles.map((bundle) => (
                    <tr
                      key={bundle.id}
                      data-commercial-focus={bundle.id}
                      data-focused={focusId === bundle.id ? 'true' : undefined}
                      className={cn(
                        portalTableRowHoverClassName,
                        !bundle.isActive && portalDataTableInactiveRowClassName,
                        focusId === bundle.id &&
                          'bg-amber-50/80 ring-2 ring-inset ring-amber-400/60 dark:bg-amber-500/10',
                      )}
                    >
                      <td className={portalDataTableCellClassName}>
                        <p className="font-medium text-gray-800 dark:text-gray-100">
                          {bundle.name}
                        </p>
                        {bundle.description && (
                          <p className="mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
                            {bundle.description}
                          </p>
                        )}
                      </td>
                      <td className={`${portalDataTableCellClassName} font-mono tabular-nums`}>
                        {bundle.itemCount ?? 0}
                      </td>
                      <td className={portalDataTableCellClassName}>{formatDiscount(bundle)}</td>
                      <td className={portalDataTableCellClassName}>
                        {formatDateRange(bundle.validFrom, bundle.validTo)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getPortalActiveBadgeVariant(bundle.isActive)}>
                          {bundle.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      {canEdit && (
                        <td className={portalDataTableCellClassName}>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditPeek(bundle)}
                              aria-label={`Editar combo ${bundle.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="softDestructive"
                              size="sm"
                              disabled={deletingBundleId === bundle.id || !bundle.isActive}
                              loading={deletingBundleId === bundle.id}
                              onClick={() => {
                                setActionError(null);
                                setDeactivateTarget({ id: bundle.id, name: bundle.name });
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
              loading={isLoading}
              resourceLabel="combos"
              shown={visibleBundles.length}
              total={totalBundles}
            />
          </div>
        </div>
      )}

      <PortalSidePeek
        open={isPeekOpen}
        onClose={handlePeekClose}
        eyebrow="Ofertas"
        title={isEditMode ? 'Editar combo' : 'Crear combo'}
        description={
          isEditMode
            ? 'Actualiza el descuento y la vigencia del combo. La composición de ítems no se modifica aquí.'
            : 'Define una oferta compuesta con descuento y vigencia para el catálogo comercial.'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={handlePeekClose}>
              Cancelar
            </Button>
            <Button type="submit" form={BUNDLE_FORM_ID} disabled={!canEdit} loading={isSubmitting}>
              {isEditMode ? 'Guardar' : 'Crear combo'}
            </Button>
          </div>
        }
      >
        <CreateBundleForm
          formId={BUNDLE_FORM_ID}
          open={isPeekOpen}
          canEdit={canEdit}
          isSubmitting={isSubmitting}
          serverError={formError}
          availableItems={availableItems}
          mode={isEditMode ? 'edit' : 'create'}
          initialBundle={editingBundle}
          onSubmit={handleSubmitBundle}
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
            <DialogTitle>Desactivar combo</DialogTitle>
            <DialogDescription>
              ¿Desactivar <strong>{deactivateTarget?.name}</strong>? Podrás reactivarlo más adelante
              si el catálogo lo permite.
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
              disabled={!!deletingBundleId}
              onClick={() => {
                setDeactivateTarget(null);
                setActionError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeactivateBundle()}
              loading={!!deletingBundleId}
            >
              Desactivar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
