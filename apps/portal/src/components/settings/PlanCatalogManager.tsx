'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, Layers3, Sparkles } from 'lucide-react';
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
  ApiError,
  tenantSelfApi,
  type CreatePlanCatalogItemDto,
  type PlanCatalogItem,
  type PlanInstallationRule,
  type UpdatePlanCatalogItemDto,
} from '@/lib/api-client';

interface PlanCatalogManagerProps {
  canEdit: boolean;
  fiberThresholdMeters: number;
}

type SpeedMode = 'SYMMETRIC' | 'ASYMMETRIC';

const planFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Ingresa un nombre de al menos 2 caracteres.')
      .max(140, 'Máximo 140 caracteres.'),
    technology: z
      .string()
      .trim()
      .min(2, 'Ingresa una tecnología válida.')
      .max(100, 'Máximo 100 caracteres.'),
    speedMode: z.enum(['SYMMETRIC', 'ASYMMETRIC']),
    downloadSpeedMbps: z.number().int().min(1).max(100000),
    uploadSpeedMbps: z.number().int().min(1).max(100000),
    basePrice: z.number().min(0, 'El precio no puede ser negativo.'),
    installationEnabled: z.boolean(),
    installationFee: z.number().min(0, 'El valor no puede ser negativo.'),
    installationRule: z.enum(['NONE', 'ALWAYS', 'FIBER_DROP_THRESHOLD']),
  })
  .superRefine((value, ctx) => {
    if (value.speedMode === 'SYMMETRIC' && value.downloadSpeedMbps !== value.uploadSpeedMbps) {
      ctx.addIssue({
        path: ['uploadSpeedMbps'],
        code: z.ZodIssueCode.custom,
        message: 'En modo simétrico, bajada y subida deben ser iguales.',
      });
    }

    if (value.installationEnabled && value.installationRule === 'NONE') {
      ctx.addIssue({
        path: ['installationRule'],
        code: z.ZodIssueCode.custom,
        message: 'Selecciona una regla válida cuando la instalación está habilitada.',
      });
    }
  });

type PlanFormValues = z.infer<typeof planFormSchema>;

const TECHNOLOGY_SUGGESTIONS = ['FTTH', 'GPON', 'XGS-PON', 'HFC', 'WIFI6', 'WIFI5'];

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-200';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(value);
}

function parseMoneyFromApi(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function formatSpeed(plan: PlanCatalogItem): string {
  if (plan.downloadSpeedMbps === plan.uploadSpeedMbps) {
    return `${plan.downloadSpeedMbps} Mbps simétricos`;
  }
  return `${plan.downloadSpeedMbps}↓ / ${plan.uploadSpeedMbps}↑ Mbps`;
}

function formatInstallationText(plan: PlanCatalogItem, fiberThresholdMeters: number): string {
  if (plan.installationRule === 'NONE') {
    return 'Sin instalación';
  }

  if (plan.installationRule === 'ALWAYS') {
    return `Siempre ${formatMoney(parseMoneyFromApi(plan.installationFee))}`;
  }

  return `Gratis hasta ${fiberThresholdMeters} m, luego ${formatMoney(parseMoneyFromApi(plan.installationFee))}`;
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu rol no tiene permisos para consultar el catálogo de planes.';
    }
    return error.message;
  }
  return 'No fue posible cargar el catálogo de planes. Intenta de nuevo.';
}

function mapMutationError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'No fue posible guardar el plan. Intenta de nuevo.';
}

function toFormValues(plan: PlanCatalogItem): PlanFormValues {
  const symmetric = plan.downloadSpeedMbps === plan.uploadSpeedMbps;
  return {
    name: plan.name,
    technology: plan.technology,
    speedMode: symmetric ? 'SYMMETRIC' : 'ASYMMETRIC',
    downloadSpeedMbps: plan.downloadSpeedMbps,
    uploadSpeedMbps: plan.uploadSpeedMbps,
    basePrice: parseMoneyFromApi(plan.basePrice),
    installationEnabled: plan.installationRule !== 'NONE',
    installationFee: parseMoneyFromApi(plan.installationFee),
    installationRule: plan.installationRule,
  };
}

export function PlanCatalogManager({ canEdit, fiberThresholdMeters }: PlanCatalogManagerProps) {
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [busySwitchPlanId, setBusySwitchPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  const activePlansCount = useMemo(() => plans.filter((item) => item.isActive).length, [plans]);

  const orderedPlans = useMemo(() => {
    // Regla de presentación: activos primero y, dentro de cada grupo, más recientes primero.
    return [...plans].sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }

      const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }

      return a.name.localeCompare(b.name, 'es');
    });
  }, [plans]);

  const editingPlan = useMemo(
    () => plans.find((plan) => plan.id === editingPlanId) ?? null,
    [plans, editingPlanId],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      name: '',
      technology: 'FTTH',
      speedMode: 'SYMMETRIC',
      downloadSpeedMbps: 300,
      uploadSpeedMbps: 300,
      basePrice: 120000,
      installationEnabled: true,
      installationFee: 120000,
      installationRule: 'FIBER_DROP_THRESHOLD',
    },
  });

  const speedMode = watch('speedMode');
  const installationEnabled = watch('installationEnabled');
  const installationRule = watch('installationRule');
  const downloadSpeed = watch('downloadSpeedMbps');

  useEffect(() => {
    if (speedMode === 'SYMMETRIC') {
      setValue('uploadSpeedMbps', downloadSpeed, { shouldValidate: true });
    }
  }, [downloadSpeed, setValue, speedMode]);

  useEffect(() => {
    if (!installationEnabled) {
      setValue('installationRule', 'NONE', { shouldValidate: true });
      setValue('installationFee', 0, { shouldValidate: true });
    }
  }, [installationEnabled, setValue]);

  useEffect(() => {
    if (installationEnabled && installationRule === 'NONE') {
      // Cuando se habilita instalación, forzamos una regla válida para evitar estado inconsistente.
      setValue('installationRule', 'FIBER_DROP_THRESHOLD', { shouldValidate: true });
    }
  }, [installationEnabled, installationRule, setValue]);

  const loadPlans = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await tenantSelfApi.getPlans();
      setPlans(data);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const handleOpenCreateDialog = () => {
    setEditingPlanId(null);
    setServerMessage(null);
    reset({
      name: '',
      technology: 'FTTH',
      speedMode: 'SYMMETRIC',
      downloadSpeedMbps: 300,
      uploadSpeedMbps: 300,
      basePrice: 120000,
      installationEnabled: true,
      installationFee: 120000,
      installationRule: 'FIBER_DROP_THRESHOLD',
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (plan: PlanCatalogItem) => {
    setEditingPlanId(plan.id);
    setServerMessage(null);
    reset(toFormValues(plan));
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (plan: PlanCatalogItem) => {
    const isLastActivePlan = plan.isActive && activePlansCount <= 1;
    if (!canEdit || isLastActivePlan) {
      return;
    }

    const previousPlans = plans;
    const nextIsActive = !plan.isActive;

    // Optimistic update para mantener feedback inmediato en la tabla.
    setPlans((current) =>
      current.map((item) => (item.id === plan.id ? { ...item, isActive: nextIsActive } : item)),
    );
    setBusySwitchPlanId(plan.id);
    setServerMessage(null);

    try {
      await tenantSelfApi.updatePlan(plan.id, { isActive: nextIsActive });
      void loadPlans();
    } catch (error) {
      setPlans(previousPlans);
      setServerMessage(mapMutationError(error));
    } finally {
      setBusySwitchPlanId(null);
    }
  };

  const handleDeletePlan = async (plan: PlanCatalogItem) => {
    setDeletingPlanId(plan.id);
    setServerMessage(null);
    try {
      await tenantSelfApi.deletePlan(plan.id);
      void loadPlans();
      setIsDialogOpen(false);
      setEditingPlanId(null);
    } catch (error) {
      setServerMessage(mapMutationError(error));
    } finally {
      setDeletingPlanId(null);
    }
  };

  const onSubmit = async (values: PlanFormValues) => {
    setServerMessage(null);

    const normalizedInstallationRule: PlanInstallationRule = values.installationEnabled
      ? values.installationRule
      : 'NONE';

    const payload: CreatePlanCatalogItemDto = {
      name: values.name.trim(),
      technology: values.technology.trim(),
      downloadSpeedMbps: values.downloadSpeedMbps,
      uploadSpeedMbps:
        values.speedMode === 'SYMMETRIC' ? values.downloadSpeedMbps : values.uploadSpeedMbps,
      basePrice: values.basePrice,
      installationRule: normalizedInstallationRule,
      installationFee: values.installationEnabled ? values.installationFee : 0,
    };

    try {
      if (!editingPlanId) {
        await tenantSelfApi.createPlan(payload);
      } else {
        await tenantSelfApi.updatePlan(editingPlanId, payload as UpdatePlanCatalogItemDto);
      }

      void loadPlans();
      setIsDialogOpen(false);
      setEditingPlanId(null);
    } catch (error) {
      setServerMessage(mapMutationError(error));
    }
  };

  return (
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
                <Layers3 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Oferta comercial
                </p>
                <CardTitle className="mt-1">Catálogo de planes</CardTitle>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona los planes comercializables del tenant autenticado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">
              {activePlansCount} activo{activePlansCount === 1 ? '' : 's'}
            </Badge>
            {canEdit && <Button onClick={handleOpenCreateDialog}>Nuevo plan</Button>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-[24px] border border-gray-100 bg-[#f8faf5] p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-iwana-secondary-700 shadow-sm dark:bg-dark-surface-2 dark:text-iwana-secondary-400">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                Reglas activas
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Mantén al menos un plan activo y define reglas de instalación coherentes con el umbral de acometida de {fiberThresholdMeters} m.
              </p>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{loadError}</p>
          </div>
        )}

        {serverMessage && !loadError && (
          <div className="flex items-start gap-3 rounded-[24px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(254,243,199,0.78))] px-4 py-3 text-sm text-amber-800 shadow-iwana-soft dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{serverMessage}</p>
          </div>
        )}

        {isLoading ? (
          <div className="h-44 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
        ) : (
          <div className="overflow-x-auto rounded-[24px] border border-gray-200 dark:border-dark-border">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-[#f6f8f4] dark:bg-dark-surface-3">
                <tr>
                  <th scope="col" className={tableHeadClass}>
                    Plan
                  </th>
                  <th scope="col" className={tableHeadClass}>
                    Velocidad
                  </th>
                  <th scope="col" className={tableHeadClass}>
                    Precio base
                  </th>
                  <th scope="col" className={tableHeadClass}>
                    Instalación
                  </th>
                  {canEdit && (
                    <>
                      <th scope="col" className={tableHeadClass}>
                        Estado
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Acciones
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {orderedPlans.length === 0 && (
                  <tr>
                    <td
                      colSpan={canEdit ? 6 : 4}
                      className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No hay planes registrados todavía.
                    </td>
                  </tr>
                )}

                {orderedPlans.map((plan) => {
                  const lastActivePlan = plan.isActive && activePlansCount <= 1;
                  const switchDisabled = !canEdit || busySwitchPlanId === plan.id || lastActivePlan;
                  const switchTitle = lastActivePlan
                    ? 'Debe existir al menos un plan activo en el catálogo.'
                    : canEdit
                      ? 'Activar o desactivar plan'
                      : 'Solo lectura para tu rol';

                  return (
                    <tr
                      key={plan.id}
                      className={cn(
                        'border-t border-gray-100 transition-colors hover:bg-[#fbfcf8] dark:border-dark-border dark:hover:bg-dark-surface-3',
                        !plan.isActive && 'opacity-55',
                      )}
                    >
                      <td className={cellClass}>
                        <p className="font-semibold text-gray-900 dark:text-white">{plan.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {plan.technology}
                        </p>
                      </td>
                      <td className={cellClass}>{formatSpeed(plan)}</td>
                      <td className={cellClass}>
                        {formatMoney(parseMoneyFromApi(plan.basePrice))}
                      </td>
                      <td className={cellClass}>
                        {formatInstallationText(plan, fiberThresholdMeters)}
                      </td>
                      {canEdit && (
                        <>
                          <td className={cellClass}>
                            <Badge variant={plan.isActive ? 'success' : 'neutral'}>
                              {plan.isActive ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                          <td className={cellClass}>
                            <div className="flex items-center gap-3">
                              <label className="inline-flex items-center">
                                <input
                                  type="checkbox"
                                  role="switch"
                                  aria-label={`Cambiar estado activo del plan ${plan.name}`}
                                  className="peer sr-only"
                                  checked={plan.isActive}
                                  disabled={switchDisabled}
                                  title={switchTitle}
                                  onChange={() => void handleToggleActive(plan)}
                                />
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'relative h-6 w-11 rounded-full bg-gray-300 transition peer-focus-visible:ring-2 peer-focus-visible:ring-iwana-primary peer-focus-visible:ring-offset-2 dark:bg-gray-600',
                                    plan.isActive && 'bg-iwana-primary dark:bg-iwana-primary-400',
                                    switchDisabled && 'cursor-not-allowed opacity-70',
                                  )}
                                >
                                  <span
                                    className={cn(
                                      'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                      plan.isActive && 'translate-x-5',
                                    )}
                                  />
                                </span>
                              </label>

                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenEditDialog(plan)}
                              >
                                Editar
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          aria-labelledby="plan-dialog-title"
          aria-describedby="plan-dialog-description"
        >
          <DialogHeader>
            <DialogTitle id="plan-dialog-title">
              {editingPlan ? `Editar plan: ${editingPlan.name}` : 'Nuevo plan'}
            </DialogTitle>
            <DialogDescription id="plan-dialog-description">
              Define tecnología, velocidad y reglas de instalación para el plan comercial.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              id="plan-name"
              label="Nombre del plan"
              disabled={!canEdit || isSubmitting}
              error={errors.name?.message}
              {...register('name')}
            />

            <div className="space-y-1.5">
              <label htmlFor="plan-technology" className="text-sm font-medium text-[#374151]">
                Tecnología
              </label>
              <input
                id="plan-technology"
                list="plan-technology-options"
                className={cn(
                  'flex h-11 w-full rounded-2xl border bg-gray-50/80 px-4 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-secondary/35 focus-visible:border-iwana-secondary focus-visible:bg-white',
                  errors.technology
                    ? 'border-[#EF4444]'
                    : 'border-[#D1D5DB] hover:border-[#9CA3AF]',
                )}
                disabled={!canEdit || isSubmitting}
                {...register('technology')}
              />
              <datalist id="plan-technology-options">
                {TECHNOLOGY_SUGGESTIONS.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              {errors.technology?.message && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.technology.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[#374151]">Modalidad de velocidad</p>
              <div role="radiogroup" aria-label="Modalidad de velocidad" className="flex gap-2">
                <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    value="SYMMETRIC"
                    disabled={!canEdit || isSubmitting}
                    {...register('speedMode')}
                  />
                  Simétrica
                </label>
                <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    value="ASYMMETRIC"
                    disabled={!canEdit || isSubmitting}
                    {...register('speedMode')}
                  />
                  Asimétrica
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                id="download-speed"
                type="number"
                label="Velocidad de bajada (Mbps)"
                min={1}
                max={100000}
                disabled={!canEdit || isSubmitting}
                error={errors.downloadSpeedMbps?.message}
                {...register('downloadSpeedMbps', { valueAsNumber: true })}
              />
              <Input
                id="upload-speed"
                type="number"
                label="Velocidad de subida (Mbps)"
                min={1}
                max={100000}
                disabled={!canEdit || isSubmitting || speedMode === 'SYMMETRIC'}
                error={errors.uploadSpeedMbps?.message}
                {...register('uploadSpeedMbps', { valueAsNumber: true })}
              />
            </div>

            <Input
              id="base-price"
              type="number"
              min={0}
              step="1000"
              label="Precio base (COP)"
              disabled={!canEdit || isSubmitting}
              error={errors.basePrice?.message}
              {...register('basePrice', { valueAsNumber: true })}
            />

            <div className="space-y-3 rounded-[24px] border border-gray-200 p-4 dark:border-dark-border">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  disabled={!canEdit || isSubmitting}
                  {...register('installationEnabled')}
                />
                Cobrar instalación
              </label>

              {installationEnabled && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Select
                      id="installation-rule"
                      label="Regla de instalación"
                      className="h-11"
                      disabled={!canEdit || isSubmitting}
                      {...register('installationRule')}
                    >
                      <option value="ALWAYS">Siempre cobrar instalación</option>
                      <option value="FIBER_DROP_THRESHOLD">
                        Cobrar solo sobre {fiberThresholdMeters} m de acometida
                      </option>
                    </Select>
                  </div>

                  <Input
                    id="installation-fee"
                    type="number"
                    min={0}
                    step="1000"
                    label="Valor instalación (COP)"
                    disabled={!canEdit || isSubmitting}
                    error={errors.installationFee?.message}
                    {...register('installationFee', { valueAsNumber: true })}
                  />
                </div>
              )}
            </div>

            {serverMessage && (
              <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>{serverMessage}</p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSubmitting || deletingPlanId === editingPlanId}
                >
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" loading={isSubmitting} disabled={!canEdit || isSubmitting}>
                {editingPlan ? 'Guardar cambios' : 'Crear plan'}
              </Button>
            </div>

            {editingPlan && (
              <div className="rounded-[24px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(254,243,199,0.78))] p-4 shadow-iwana-soft dark:border-amber-800 dark:bg-amber-900/20">
                <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                  Zona de peligro
                </p>
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
                  Eliminar el plan &quot;{editingPlan.name}&quot; es irreversible. Los clientes
                  asociados no se eliminan pero perderán la referencia a este plan.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  loading={deletingPlanId === editingPlanId}
                  disabled={deletingPlanId === editingPlanId || !canEdit}
                  onClick={() => void handleDeletePlan(editingPlan)}
                >
                  Eliminar este plan
                </Button>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
