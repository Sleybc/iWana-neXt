'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BriefcaseBusiness, CheckCircle2, CircleAlert, Pencil, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';

const SERVICE_CHARGE_TYPES = [
  ChargeType.ONE_TIME,
  ChargeType.ON_DEMAND,
  ChargeType.RECURRING,
] as const;

const serviceFormSchema = z.object({
  name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(100, 'Maximo 100 caracteres.'),
  description: z.string().trim().max(240, 'Maximo 240 caracteres.').optional(),
  chargeType: z.enum(SERVICE_CHARGE_TYPES),
  basePrice: z.coerce.number().min(0, 'No puede ser negativo.'),
  installationFee: z.coerce.number().min(0, 'No puede ser negativo.'),
  isActive: z.boolean(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;
type ServiceStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';
const searchInputClass =
  'h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-11 pr-4 text-sm text-iwana-primary shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-iwana-secondary focus:bg-white focus:outline-none focus:ring-2 focus:ring-iwana-secondary/35 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100 dark:placeholder-gray-500';

interface AdditionalServicesManagerProps {
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

export function AdditionalServicesManager({ canEdit }: AdditionalServicesManagerProps) {
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
    <Card className="rounded-2xl border border-white/70 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
              <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Venta consultiva
              </p>
              <CardTitle className="mt-1 text-lg font-semibold">Catalogo de servicios</CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Configura servicios recurrentes y operativos con tipo de cobro y precio vigente para
                cotizacion diaria.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {totalServices} total
            </Badge>
            <Badge
              variant="success"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {activeServicesCount} activo{activeServicesCount === 1 ? '' : 's'}
            </Badge>
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {inactiveServicesCount} inactivo{inactiveServicesCount === 1 ? '' : 's'}
            </Badge>
            {canEdit && (
              <Button onClick={openCreateDialog} size="sm">
                Agregar servicio
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
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
              <div className="min-w-[200px]">
                <label htmlFor="service-search" className="sr-only">
                  Buscar servicio
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    id="service-search"
                    type="search"
                    placeholder="Buscar por nombre, descripcion o tipo de cobro"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    className={searchInputClass}
                  />
                </div>
              </div>

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

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-[#f8faf5] px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Gestiona servicios del catalogo comercial con una vista operativa para ventas,
                soporte y facturacion.
              </p>
              <Badge
                variant="neutral"
                className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              >
                {resultsLabel}
              </Badge>
            </div>

            {filteredServices.length === 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-4 text-sm text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">No hay servicios para los filtros seleccionados.</p>
                  <p className="mt-1">
                    Ajusta la busqueda, estado o tipo de cobro para recuperar resultados.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
                    <tr>
                      <th className={tableHeadClass}>Servicio</th>
                      <th className={tableHeadClass}>Tipo de cobro</th>
                      <th className={tableHeadClass}>Precio vigente</th>
                      <th className={tableHeadClass}>Estado</th>
                      <th className={tableHeadClass}>Actualizacion</th>
                      {canEdit && <th className={cn(tableHeadClass, 'w-40')}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-1">
                    {filteredServices.map((service) => (
                      <tr
                        key={service.id}
                        className={cn(
                          'transition-colors hover:bg-[#fbfcf8] dark:hover:bg-dark-surface-3',
                          !service.isActive && 'opacity-70',
                        )}
                      >
                        <td className={cellClass}>
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {service.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {service.description?.trim() || 'Sin descripcion operativa.'}
                            </p>
                          </div>
                        </td>
                        <td className={cellClass}>{chargeTypeLabel(service.chargeType)}</td>
                        <td className={cellClass}>
                          <div className="space-y-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatCurrency(service.basePrice)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Instalacion: {formatCurrency(service.installationFee)}
                            </p>
                          </div>
                        </td>
                        <td className={cellClass}>
                          <Badge
                            variant={service.isActive ? 'success' : 'neutral'}
                            className="text-xs"
                          >
                            {service.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className={cellClass}>
                          {new Date(service.updatedAt).toLocaleDateString('es-CO', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </td>
                        {canEdit && (
                          <td className={cellClass}>
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
            )}
          </div>
        )}
      </CardContent>

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
            <section className="space-y-4 rounded-2xl border border-gray-100 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
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

                <Select {...register('chargeType')} label="Tipo de cobro" className="h-11">
                  {SERVICE_CHARGE_TYPES.map((chargeType) => (
                    <option key={chargeType} value={chargeType}>
                      {chargeTypeLabel(chargeType)}
                    </option>
                  ))}
                </Select>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Descripcion corta
                  </label>
                  <textarea
                    {...register('description')}
                    rows={4}
                    placeholder="Describe el servicio y cuando debe aplicarse en la operacion comercial."
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm transition-colors placeholder:text-gray-400 focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/30 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-gray-100 p-4 dark:border-dark-border">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Configuracion comercial
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Define precio vigente para cotizacion y disponibilidad en nuevas operaciones del
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
    </Card>
  );
}
