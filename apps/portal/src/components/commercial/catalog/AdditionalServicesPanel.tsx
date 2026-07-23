'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  CheckboxCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@iwana/ui';
import {
  commercialApi,
  type AdditionalService,
  type CreateAdditionalServiceDto,
  type UpdateAdditionalServiceDto,
} from '@/lib/api-client';
import { ChargeType } from '@iwana/shared';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalResultsStrip,
  PortalSearchField,
  PortalSidePeek,
  PortalSkeletonBlock,
  PortalSuccessAlert,
  portalDataTableCellClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { commercialTextareaClassName } from '@/components/commercial/commercial-field-styles';
import {
  applyServiceCatalogFilters,
  parseServiceCatalogFilters,
  type CatalogStatusFilter,
  type ServiceCatalogFilters,
} from '@/components/commercial/catalog/catalog-filter-params';

const SERVICE_CHARGE_TYPES = [
  ChargeType.ONE_TIME,
  ChargeType.ON_DEMAND,
  ChargeType.RECURRING,
] as const;

const serviceFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(100, 'Máximo 100 caracteres.'),
  description: z.string().trim().max(240, 'Máximo 240 caracteres.').optional(),
  chargeType: z.enum(SERVICE_CHARGE_TYPES),
  basePrice: z.coerce.number().min(0, 'No puede ser negativo.'),
  installationFee: z.coerce.number().min(0, 'No puede ser negativo.'),
  isActive: z.boolean(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

interface AdditionalServicesPanelProps {
  canEdit: boolean;
}

function getDefaultServiceFormValues(): ServiceFormValues {
  return {
    name: '',
    description: '',
    chargeType: ChargeType.ONE_TIME,
    basePrice: 0,
    installationFee: 0,
    isActive: true,
  };
}

function toServiceFormValues(service: AdditionalService): ServiceFormValues {
  return {
    name: service.name,
    description: service.description ?? '',
    chargeType: service.chargeType,
    basePrice: service.basePrice,
    installationFee: service.installationFee,
    isActive: service.isActive,
  };
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function chargeTypeLabel(chargeType: ChargeType): string {
  if (chargeType === ChargeType.ONE_TIME) {
    return 'Única vez';
  }

  if (chargeType === ChargeType.ON_DEMAND) {
    return 'Bajo demanda';
  }

  return 'Recurrente';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function filtersEqual(a: ServiceCatalogFilters, b: ServiceCatalogFilters): boolean {
  return a.q === b.q && a.status === b.status && a.charge === b.charge;
}

export function AdditionalServicesPanel({ canEdit }: AdditionalServicesPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();

  // searchParamsKey captura cambios de query (back/forward / replace).
  const filtersFromUrl = useMemo(
    () => parseServiceCatalogFilters(searchParams),
    [searchParams, searchParamsKey],
  );

  const [services, setServices] = useState<AdditionalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [searchValue, setSearchValue] = useState(filtersFromUrl.q);
  const [statusFilter, setStatusFilter] = useState<CatalogStatusFilter>(filtersFromUrl.status);
  const [chargeTypeFilter, setChargeTypeFilter] = useState(filtersFromUrl.charge);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: getDefaultServiceFormValues(),
  });

  useEffect(() => {
    const current: ServiceCatalogFilters = {
      q: searchValue,
      status: statusFilter,
      charge: chargeTypeFilter,
    };
    if (filtersEqual(current, filtersFromUrl)) {
      return;
    }
    setSearchValue(filtersFromUrl.q);
    setStatusFilter(filtersFromUrl.status);
    setChargeTypeFilter(filtersFromUrl.charge);
  }, [filtersFromUrl, searchValue, statusFilter, chargeTypeFilter]);

  function syncFiltersToUrl(next: ServiceCatalogFilters) {
    const params = new URLSearchParams(searchParams.toString());
    applyServiceCatalogFilters(params, next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function updateFilters(patch: Partial<ServiceCatalogFilters>) {
    setSuccessMessage(null);
    setActionError(null);

    const next: ServiceCatalogFilters = {
      q: patch.q ?? searchValue,
      status: patch.status ?? statusFilter,
      charge: patch.charge ?? chargeTypeFilter,
    };

    if (patch.q !== undefined) setSearchValue(patch.q);
    if (patch.status !== undefined) setStatusFilter(patch.status);
    if (patch.charge !== undefined) setChargeTypeFilter(patch.charge);

    syncFiltersToUrl(next);
  }

  useEffect(() => {
    void loadServices();
  }, []);

  async function loadServices() {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const data = await commercialApi.getAdditionalServices();
      setServices(data);
    } catch {
      setLoadError('No se pudieron cargar los servicios adicionales.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingServiceId(null);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    reset(getDefaultServiceFormValues());
    setIsFormOpen(true);
  }

  function openEditForm(service: AdditionalService) {
    setEditingServiceId(service.id);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    reset(toServiceFormValues(service));
    setIsFormOpen(true);
  }

  function handleFormOpenChange(nextOpen: boolean) {
    setIsFormOpen(nextOpen);

    if (!nextOpen) {
      setEditingServiceId(null);
      setFormError(null);
      reset(getDefaultServiceFormValues());
    }
  }

  async function onSubmit(values: ServiceFormValues) {
    setSaving(true);
    setFormError(null);

    const normalizedDescription = values.description?.trim()
      ? values.description.trim()
      : undefined;

    try {
      if (editingServiceId) {
        const dto: UpdateAdditionalServiceDto = {
          name: values.name.trim(),
          description: normalizedDescription,
          chargeType: values.chargeType,
          basePrice: values.basePrice,
          installationFee: values.installationFee,
          isActive: values.isActive,
        };
        const updated = await commercialApi.updateAdditionalService(editingServiceId, dto);
        setServices(updated);
        setSuccessMessage('Servicio actualizado.');
      } else {
        const dto: CreateAdditionalServiceDto = {
          name: values.name.trim(),
          description: normalizedDescription,
          chargeType: values.chargeType,
          basePrice: values.basePrice,
          installationFee: values.installationFee,
          isActive: values.isActive,
        };
        const created = await commercialApi.createAdditionalService(dto);
        setServices(created);
        setSuccessMessage('Servicio creado.');
      }

      handleFormOpenChange(false);
    } catch {
      setFormError('No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(deleteTarget.id);
    setActionError(null);

    try {
      const updated = await commercialApi.deleteAdditionalService(deleteTarget.id);
      setServices(updated);
      setDeleteTarget(null);
      setSuccessMessage('Servicio eliminado.');
    } catch {
      setActionError('No se pudo eliminar el servicio.');
    } finally {
      setDeleting(null);
    }
  }

  const totalServices = services.length;
  const activeServicesCount = services.filter((service) => service.isActive).length;
  const inactiveServicesCount = totalServices - activeServicesCount;

  const filteredServices = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchValue);

    return [...services]
      .filter((service) => {
        if (statusFilter === 'ACTIVE' && !service.isActive) {
          return false;
        }

        if (statusFilter === 'INACTIVE' && service.isActive) {
          return false;
        }

        if (chargeTypeFilter !== 'ALL' && service.chargeType !== chargeTypeFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return [service.name, service.description ?? '', chargeTypeLabel(service.chargeType)]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }

        return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
      });
  }, [chargeTypeFilter, searchValue, services, statusFilter]);

  const hasActiveFilters =
    Boolean(searchValue.trim()) || statusFilter !== 'ALL' || chargeTypeFilter !== 'ALL';

  function clearFilters() {
    updateFilters({
      q: '',
      status: 'ALL',
      charge: 'ALL',
    });
  }

  const resultsLabel =
    filteredServices.length === totalServices
      ? `${totalServices} registros`
      : `${filteredServices.length} de ${totalServices} registros`;

  const showLoadErrorOnly = Boolean(loadError) && services.length === 0 && !loading;

  return (
    <PortalPanel
      eyebrow="Catálogo"
      title="Servicios adicionales"
      description="Administra servicios complementarios, tipos de cobro y tarifas."
      actions={
        <>
          <Badge variant="neutral">{totalServices} total</Badge>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activeServicesCount} activo{activeServicesCount === 1 ? '' : 's'}
          </Badge>
          <Badge variant="neutral">
            {inactiveServicesCount} inactivo{inactiveServicesCount === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button onClick={openCreateForm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agregar servicio
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <PortalSkeletonBlock className="h-10 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
        </div>
      ) : showLoadErrorOnly ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar servicios"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadServices()}>
              Reintentar
            </Button>
          }
        />
      ) : services.length === 0 ? (
        <PortalEmptyState
          title="Catálogo listo para servicios"
          description="No hay servicios adicionales. Crea uno para empezar."
          icon={CheckCircle2}
          {...(canEdit
            ? {
                action: (
                  <Button onClick={openCreateForm}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar servicio
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="space-y-6">
          {successMessage ? (
            <PortalSuccessAlert
              message={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}

          {actionError && !deleteTarget && (
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

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_220px_220px_auto] lg:items-end">
            <PortalSearchField
              id="service-search"
              label="Buscar servicio"
              placeholder="Buscar por nombre, descripción o tipo de cobro"
              value={searchValue}
              onChange={(value) => updateFilters({ q: value })}
            />

            <Select
              id="service-status-filter"
              label="Estado"
              value={statusFilter}
              onChange={(event) =>
                updateFilters({ status: event.target.value as CatalogStatusFilter })
              }
              className="h-12"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </Select>

            <Select
              id="service-charge-filter"
              label="Tipo de cobro"
              value={chargeTypeFilter}
              onChange={(event) => updateFilters({ charge: event.target.value })}
              className="h-12"
            >
              <option value="ALL">Todos</option>
              {SERVICE_CHARGE_TYPES.map((chargeType) => (
                <option key={chargeType} value={chargeType}>
                  {chargeTypeLabel(chargeType)}
                </option>
              ))}
            </Select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={clearFilters}
                className="h-12 px-4"
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

          {filteredServices.length === 0 ? (
            <PortalEmptyState
              title="No hay servicios para los filtros seleccionados"
              description="Ajusta la búsqueda, estado o tipo de cobro para recuperar resultados."
              icon={CircleAlert}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={clearFilters}
                  className="h-12 px-4"
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <div className={portalDataTableShellClassName}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                    <tr>
                      <PortalDataTableHead>Servicio</PortalDataTableHead>
                      <PortalDataTableHead>Tipo de cobro</PortalDataTableHead>
                      <PortalDataTableHead>Precio vigente</PortalDataTableHead>
                      <PortalDataTableHead>Estado</PortalDataTableHead>
                      <PortalDataTableHead>Actualización</PortalDataTableHead>
                      {canEdit && (
                        <PortalDataTableHead className="w-40">Acciones</PortalDataTableHead>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                    {filteredServices.map((service) => (
                      <tr
                        key={service.id}
                        className={cn(
                          portalTableRowHoverClassName,
                          !service.isActive && 'opacity-70',
                        )}
                      >
                        <td className={portalDataTableCellClassName}>
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {service.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {service.description?.trim() || 'Sin descripción operativa.'}
                            </p>
                          </div>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {chargeTypeLabel(service.chargeType)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <div className="space-y-1">
                            <p className="font-mono font-medium tabular-nums text-gray-900 dark:text-white">
                              {formatCurrency(service.basePrice)}
                            </p>
                            <p className="font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                              Instalación: {formatCurrency(service.installationFee)}
                            </p>
                          </div>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge
                            variant={getPortalActiveBadgeVariant(service.isActive)}
                            className="text-xs"
                          >
                            {service.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {new Date(service.updatedAt).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </td>
                        {canEdit && (
                          <td className={portalDataTableCellClassName}>
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="icon"
                                aria-label={`Editar servicio ${service.name}`}
                                title={`Editar servicio ${service.name}`}
                                onClick={() => openEditForm(service)}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                variant="softDestructive"
                                size="icon"
                                aria-label={`Eliminar servicio ${service.name}`}
                                title={`Eliminar servicio ${service.name}`}
                                onClick={() => {
                                  setActionError(null);
                                  setDeleteTarget({ id: service.id, name: service.name });
                                }}
                                disabled={deleting === service.id}
                                loading={deleting === service.id}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <PortalSidePeek
        open={isFormOpen}
        onClose={() => handleFormOpenChange(false)}
        eyebrow="Catálogo comercial"
        title={editingServiceId ? 'Editar servicio' : 'Crear servicio'}
        description={
          editingServiceId
            ? 'Actualiza la información básica y la configuración comercial del servicio.'
            : 'Agrega un servicio comercial al catálogo maestro de la empresa.'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => handleFormOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="additional-service-form"
              disabled={!isDirty && !!editingServiceId}
              loading={saving}
            >
              Guardar
            </Button>
          </div>
        }
      >
        <form
          id="additional-service-form"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Información básica</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Define el servicio y su alcance comercial sin mezclar facturación ni inventario.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Input
                  label="Nombre"
                  {...register('name')}
                  placeholder="Ej. Instalación adicional, IP pública fija"
                  aria-invalid={errors.name ? 'true' : 'false'}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-error-600">{errors.name.message}</p>
                )}
              </div>

              <Controller
                name="chargeType"
                control={control}
                render={({ field }) => (
                  <Select
                    label="Tipo de cobro"
                    className="h-11"
                    name={field.name}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {SERVICE_CHARGE_TYPES.map((chargeType) => (
                      <option key={chargeType} value={chargeType}>
                        {chargeTypeLabel(chargeType)}
                      </option>
                    ))}
                  </Select>
                )}
              />

              <div>
                <label htmlFor="service-description" className="portal-eyebrow-muted">
                  Descripción corta
                </label>
                <textarea
                  id="service-description"
                  {...register('description')}
                  rows={4}
                  placeholder="Describe el servicio y cuándo debe aplicarse en la operación comercial."
                  className={`mt-2 ${commercialTextareaClassName}`}
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-error-600">{errors.description.message}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Configuración comercial</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Define precio vigente para cotización y disponibilidad en nuevas operaciones de la
                empresa.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Input
                  label="Precio base (COP)"
                  type="number"
                  min={0}
                  step="100"
                  {...register('basePrice', { valueAsNumber: true })}
                  placeholder="0"
                  aria-invalid={errors.basePrice ? 'true' : 'false'}
                />
                {errors.basePrice && (
                  <p className="mt-1 text-sm text-error-600">{errors.basePrice.message}</p>
                )}
              </div>

              <div>
                <Input
                  label="Cargo de instalación (COP)"
                  type="number"
                  min={0}
                  step="100"
                  {...register('installationFee', { valueAsNumber: true })}
                  placeholder="0"
                  aria-invalid={errors.installationFee ? 'true' : 'false'}
                />
                {errors.installationFee && (
                  <p className="mt-1 text-sm text-error-600">{errors.installationFee.message}</p>
                )}
              </div>
            </div>

            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <CheckboxCard
                  label="Activo"
                  description="Disponible para nuevas operaciones comerciales."
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              )}
            />
          </section>

          {formError && (
            <PortalAlert
              variant="error"
              title="No fue posible guardar el servicio"
              description={formError}
              icon={CircleAlert}
            />
          )}
        </form>
      </PortalSidePeek>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar servicio</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTarget?.name}</strong>? Esta acción es irreversible.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <PortalAlert
              variant="error"
              title="No fue posible eliminar"
              description={actionError}
              icon={CircleAlert}
              className="mt-3"
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!!deleting}
              onClick={() => {
                setDeleteTarget(null);
                setActionError(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} loading={!!deleting}>
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
