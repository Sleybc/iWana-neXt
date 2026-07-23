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
  CreateBundleForm,
  type BundleCatalogSelectableItem,
} from '@/components/commercial/CreateBundleForm';
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

interface BundlesManagerProps {
  canEdit: boolean;
}

const CREATE_BUNDLE_FORM_ID = 'create-bundle-form';

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

export function BundlesManager({ canEdit }: BundlesManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const offerStatusFilter = parseCommercialOfferStatus(searchParams.get('status'));

  const [bundles, setBundles] = useState<CommercialBundle[]>([]);
  const [availableItems, setAvailableItems] = useState<BundleCatalogSelectableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPeekOpen, setIsPeekOpen] = useState(false);
  const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const activeBundles = useMemo(() => bundles.filter((bundle) => bundle.isActive), [bundles]);

  const visibleBundles = useMemo(() => {
    if (offerStatusFilter !== 'expiring') {
      return bundles;
    }

    return bundles.filter((bundle) => matchesCommercialExpiringOfferFilter(bundle, 'bundle'));
  }, [bundles, offerStatusFilter]);

  const clearExpiringFilter = () => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    applyCommercialOfferStatusToSearchParams(nextSearchParams, null);
    const nextQuery = nextSearchParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

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
    setActionError(null);

    try {
      const data = await commercialApi.getBundles();
      setBundles(data);
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

  const handleCreateBundle = async (dto: CreateBundleDto) => {
    setIsSubmitting(true);
    setFormError(null);

    try {
      const updated = await commercialApi.createBundle(dto);
      setBundles(updated);
      setIsPeekOpen(false);
      setSuccessMessage('Combo creado.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('No fue posible crear el combo. Intenta de nuevo.');
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
      const updated = await commercialApi.deactivateBundle(deactivateTarget.id);
      setBundles(updated);
      setDeactivateTarget(null);
      setSuccessMessage('Combo desactivado.');
    } catch (error) {
      setActionError(mapActionError(error));
    } finally {
      setDeletingBundleId(null);
    }
  };

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
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadBundles()}>
              Reintentar
            </Button>
          }
        />
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
      ) : offerStatusFilter === 'expiring' && visibleBundles.length === 0 ? (
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

          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                  <tr>
                    <PortalDataTableHead>Combo</PortalDataTableHead>
                    <PortalDataTableHead>Ítems</PortalDataTableHead>
                    <PortalDataTableHead>Descuento</PortalDataTableHead>
                    <PortalDataTableHead>Vigencia</PortalDataTableHead>
                    <PortalDataTableHead>Estado</PortalDataTableHead>
                    {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                  {visibleBundles.map((bundle) => (
                    <tr key={bundle.id} className={portalTableRowHoverClassName}>
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
                      <td className={portalDataTableCellClassName}>{bundle.itemCount ?? 0}</td>
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
        title="Crear combo"
        description="Define una oferta compuesta con descuento y vigencia para el catálogo comercial."
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={isSubmitting} onClick={handlePeekClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={CREATE_BUNDLE_FORM_ID}
              disabled={!canEdit}
              loading={isSubmitting}
            >
              Crear combo
            </Button>
          </div>
        }
      >
        <CreateBundleForm
          formId={CREATE_BUNDLE_FORM_ID}
          open={isPeekOpen}
          canEdit={canEdit}
          isSubmitting={isSubmitting}
          serverError={formError}
          availableItems={availableItems}
          onSubmit={handleCreateBundle}
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
