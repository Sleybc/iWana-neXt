'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, Pencil, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
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
  PortalEmptyState,
  PortalPanel,
  PortalSearchField,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { commercialTextareaClassName } from '@/components/commercial/commercial-field-styles';

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
type ServiceStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

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
    return 'Unica vez';
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

export function AdditionalServicesPanel({ canEdit }: AdditionalServicesPanelProps) {
  const [services, setServices] = useState<AdditionalService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatusFilter>('ALL');
  const [chargeTypeFilter, setChargeTypeFilter] = useState<string>('ALL');

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
    void loadServices();
  }, []);

  async function loadServices() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await commercialApi.getAdditionalServices();
      setServices(data);
    } catch (err) {
      console.error('Error loading additional services:', err);
      setLoadError('No se pudieron cargar los servicios adicionales.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingServiceId(null);
    setFormError(null);
    reset(getDefaultServiceFormValues());
    setIsDialogOpen(true);
  }

  function openEditDialog(service: AdditionalService) {
    setEditingServiceId(service.id);
    setFormError(null);
    reset(toServiceFormValues(service));
    setIsDialogOpen(true);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setIsDialogOpen(nextOpen);

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
      }

      handleDialogOpenChange(false);
    } catch (err) {
      console.error('Error saving additional service:', err);
      setFormError('No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(serviceId: string) {
    if (!window.confirm('Eliminar este servicio adicional?')) return;

    setDeleting(serviceId);
    setLoadError(null);

    try {
      const updated = await commercialApi.deleteAdditionalService(serviceId);
      setServices(updated);
    } catch (err) {
      console.error('Error deleting additional service:', err);
      setLoadError('No se pudo eliminar el servicio.');
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

  const resultsLabel =
    filteredServices.length === totalServices
      ? `${totalServices} registros`
      : `${filteredServices.length} de ${totalServices} registros`;

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
            <Button onClick={openCreateDialog} size="sm">
              Agregar servicio
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {loading ? (
        <PortalSkeletonBlock className="h-28" />
      ) : loadError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar servicios"
          description={loadError}
          icon={CircleAlert}
        />
      ) : services.length === 0 ? (
        <PortalEmptyState
          title="Catálogo listo para servicios"
          description="No hay servicios adicionales. Crea uno para empezar."
          icon={CheckCircle2}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_220px_220px_auto] lg:items-end">
            <PortalSearchField
              id="service-search"
              label="Buscar servicio"
              placeholder="Buscar por nombre, descripción o tipo de cobro"
              value={searchValue}
              onChange={(value) => setSearchValue(value)}
            />

            <Select
              id="service-status-filter"
              label="Estado"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ServiceStatusFilter)}
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
              onChange={(event) => setChargeTypeFilter(event.target.value)}
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
              <button
                type="button"
                onClick={() => {
                  setSearchValue('');
                  setStatusFilter('ALL');
                  setChargeTypeFilter('ALL');
                }}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-iwana-primary transition-colors hover:border-iwana-secondary/40 hover:bg-iwana-secondary-50 dark:border-dark-border dark:text-gray-100 dark:hover:bg-dark-surface-3"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Gestiona servicios del catálogo comercial con una vista operativa para ventas, soporte
              y facturación.
            </p>
            <Badge variant="neutral">{resultsLabel}</Badge>
          </div>

          {filteredServices.length === 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-4 text-sm text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">No hay servicios para los filtros seleccionados.</p>
                <p className="mt-1">
                  Ajusta la búsqueda, estado o tipo de cobro para recuperar resultados.
                </p>
              </div>
            </div>
          ) : (
            <div className={portalDataTableShellClassName}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                    <tr>
                      <th className={portalDataTableHeadClassName}>Servicio</th>
                      <th className={portalDataTableHeadClassName}>Tipo de cobro</th>
                      <th className={portalDataTableHeadClassName}>Precio vigente</th>
                      <th className={portalDataTableHeadClassName}>Estado</th>
                      <th className={portalDataTableHeadClassName}>Actualización</th>
                      {canEdit && (
                        <th className={cn(portalDataTableHeadClassName, 'w-40')}>Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-1">
                    {filteredServices.map((service) => (
                      <tr
                        key={service.id}
                        className={cn(
                          'transition-colors hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3',
                          !service.isActive && 'opacity-70',
                        )}
                      >
                        <td className={portalDataTableCellClassName}>
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {service.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {service.description?.trim() || 'Sin descripcion operativa.'}
                            </p>
                          </div>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {chargeTypeLabel(service.chargeType)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <div className="space-y-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatCurrency(service.basePrice)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Instalacion: {formatCurrency(service.installationFee)}
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
                                onClick={() => openEditDialog(service)}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                variant="softDestructive"
                                size="icon"
                                aria-label={`Eliminar servicio ${service.name}`}
                                title={`Eliminar servicio ${service.name}`}
                                onClick={() => handleDelete(service.id)}
                                disabled={deleting === service.id}
                                loading={deleting === service.id}
                              >
                                {deleting !== service.id && (
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                )}
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

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServiceId ? 'Editar servicio' : 'Crear servicio'}</DialogTitle>
            <DialogDescription>
              {editingServiceId
                ? 'Actualiza la informacion basica y la configuracion comercial del servicio.'
                : 'Agrega un servicio comercial al catálogo maestro de la empresa.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <section className="space-y-4 rounded-2xl border border-gray-100 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Informacion basica
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Define el servicio y su alcance comercial sin mezclar facturacion ni inventario.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Input
                    label="Nombre"
                    {...register('name')}
                    placeholder="Ej. Instalacion adicional, IP publica fija"
                    aria-invalid={errors.name ? 'true' : 'false'}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
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
                    <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-gray-100 p-4 dark:border-dark-border">
              <div>
                <p className="portal-eyebrow">Configuración comercial</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
                    <p className="mt-1 text-sm text-red-600">{errors.basePrice.message}</p>
                  )}
                </div>

                <div>
                  <Input
                    label="Cargo de instalacion (COP)"
                    type="number"
                    min={0}
                    step="100"
                    {...register('installationFee', { valueAsNumber: true })}
                    placeholder="0"
                    aria-invalid={errors.installationFee ? 'true' : 'false'}
                  />
                  {errors.installationFee && (
                    <p className="mt-1 text-sm text-red-600">{errors.installationFee.message}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  {...register('isActive')}
                  type="checkbox"
                  id="service-is-active"
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label
                  htmlFor="service-is-active"
                  className="text-sm text-gray-700 dark:text-gray-200"
                >
                  Activo
                </label>
              </div>
            </section>

            {formError && (
              <PortalAlert
                variant="error"
                title="No fue posible guardar el servicio"
                description={formError}
                icon={CircleAlert}
              />
            )}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={(!isDirty && !!editingServiceId) || saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
