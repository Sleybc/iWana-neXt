'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, ChevronDown, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
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
  ApiError,
  commercialApi,
  type CreatePlanCatalogItemDto,
  type PlanCatalogItem,
  type PlanInstallationRule,
  type UpdatePlanCatalogItemDto,
} from '@/lib/api-client';
import { InstallationRule } from '@iwana/shared';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSearchField,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';
import {
  commercialFieldClassName,
  commercialTableRowHoverClassName,
} from '@/components/commercial/commercial-field-styles';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';

interface PlanCatalogPanelProps {
  canEdit: boolean;
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
    installationRule: z.nativeEnum(InstallationRule),
  })
  .superRefine((value, ctx) => {
    if (value.speedMode === 'SYMMETRIC' && value.downloadSpeedMbps !== value.uploadSpeedMbps) {
      ctx.addIssue({
        path: ['uploadSpeedMbps'],
        code: z.ZodIssueCode.custom,
        message: 'En modo simétrico, bajada y subida deben ser iguales.',
      });
    }

    if (value.installationEnabled && value.installationRule === 'NEVER') {
      ctx.addIssue({
        path: ['installationRule'],
        code: z.ZodIssueCode.custom,
        message: 'Selecciona una regla válida cuando la instalación está habilitada.',
      });
    }
  });

type PlanFormValues = z.infer<typeof planFormSchema>;

const BLOCKED_TECHNOLOGIES = new Set(['FTTH']);
const TECHNOLOGY_SUGGESTIONS = ['GPON', 'XGS-PON', 'HFC', 'WIFI6', 'WIFI5'];
const TECHNOLOGY_OPTIONS_STORAGE_KEY = 'iwana.portal.commercial.plan-technology-options';

/** Lee tecnologías del localStorage; retorna los defaults si no hay datos o están corruptos. */
function loadPersistedTechnologies(): string[] {
  if (typeof window === 'undefined') {
    return mergeTechnologyOptions([], TECHNOLOGY_SUGGESTIONS);
  }
  try {
    const stored = window.localStorage.getItem(TECHNOLOGY_OPTIONS_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = (parsed as unknown[]).filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        );
        if (valid.length > 0) {
          return mergeTechnologyOptions([], valid);
        }
      }
    }
  } catch {
    // localStorage no accesible — usar defaults.
  }
  return mergeTechnologyOptions([], TECHNOLOGY_SUGGESTIONS);
}

/** Escribe tecnologías al localStorage de forma síncrona. */
function persistTechnologies(options: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(TECHNOLOGY_OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // localStorage no disponible (incógnito bloqueado, cuota llena, etc.).
  }
}

const cellClass = portalDataTableCellClassName;

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

function formatInstallationText(plan: PlanCatalogItem): string {
  if (plan.installationRule === 'NEVER') {
    return 'Sin instalación';
  }

  if (plan.installationRule === 'ALWAYS') {
    return `Siempre ${formatMoney(parseMoneyFromApi(plan.installationFee))}`;
  }

  return `Bajo demanda (${formatMoney(parseMoneyFromApi(plan.installationFee))})`;
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

function normalizeTechnologyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function mergeTechnologyOptions(current: string[], incoming: string[]): string[] {
  const unique = new Map<string, string>();

  [...current, ...incoming].forEach((item) => {
    const normalized = normalizeTechnologyName(item);
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  });

  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function isBlockedTechnology(value: string): boolean {
  return BLOCKED_TECHNOLOGIES.has(normalizeTechnologyName(value).toUpperCase());
}

function filterAllowedTechnologies(options: string[]): string[] {
  return options.filter((option) => !isBlockedTechnology(option));
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
    installationEnabled: plan.installationRule !== 'NEVER',
    installationFee: parseMoneyFromApi(plan.installationFee),
    installationRule: plan.installationRule,
  };
}

export function PlanCatalogPanel({ canEdit }: PlanCatalogPanelProps) {
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  // Inicialmente vacío para evitar mismatch SSR/cliente. El useEffect de mount carga desde localStorage.
  const [technologyOptions, setTechnologyOptions] = useState<string[]>([]);
  const [technologyDraft, setTechnologyDraft] = useState('');
  const [editingTechnologyOriginal, setEditingTechnologyOriginal] = useState<string | null>(null);
  const [editingTechnologyDraft, setEditingTechnologyDraft] = useState('');

  const activePlansCount = useMemo(() => plans.filter((item) => item.isActive).length, [plans]);

  const orderedPlans = useMemo(() => {
    // Regla de presentación: activos primero y, dentro de cada grupo, más recientes primero.
    return [...plans].sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }

      const createdAtDiff =
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
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

  const technologiesInActivePlans = useMemo(() => {
    const usedByActive = new Set<string>();

    plans.forEach((plan) => {
      if (!plan.isActive) {
        return;
      }

      const normalized = normalizeTechnologyName(plan.technology).toLowerCase();
      if (normalized) {
        usedByActive.add(normalized);
      }
    });

    return usedByActive;
  }, [plans]);

  const {
    control,
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
      installationRule: InstallationRule.ON_DEMAND,
    },
  });

  const speedMode = watch('speedMode');
  const installationEnabled = watch('installationEnabled');
  const installationRule = watch('installationRule');
  const downloadSpeed = watch('downloadSpeedMbps');
  const selectedTechnology = watch('technology');

  // Mientras el mount effect no ha cargado desde localStorage (estado vacío), usa suggestions de default.
  const effectiveTechnologyOptions =
    technologyOptions.length > 0
      ? technologyOptions
      : mergeTechnologyOptions([], TECHNOLOGY_SUGGESTIONS);

  const selectTechnologyOptions = useMemo(() => {
    if (!selectedTechnology || isBlockedTechnology(selectedTechnology)) {
      return effectiveTechnologyOptions;
    }

    return mergeTechnologyOptions(effectiveTechnologyOptions, [selectedTechnology]);
  }, [effectiveTechnologyOptions, selectedTechnology]);

  useEffect(() => {
    if (speedMode === 'SYMMETRIC') {
      setValue('uploadSpeedMbps', downloadSpeed, { shouldValidate: true });
    }
  }, [downloadSpeed, setValue, speedMode]);

  useEffect(() => {
    if (!installationEnabled) {
      setValue('installationRule', InstallationRule.NEVER, { shouldValidate: true });
      setValue('installationFee', 0, { shouldValidate: true });
    }
  }, [installationEnabled, setValue]);

  useEffect(() => {
    if (installationEnabled && installationRule === 'NEVER') {
      // Cuando se habilita instalación, forzamos una regla válida para evitar estado inconsistente.
      setValue('installationRule', InstallationRule.ON_DEMAND, { shouldValidate: true });
    }
  }, [installationEnabled, installationRule, setValue]);

  const loadPlans = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await commercialApi.getPlans();
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

  // Carga tecnologías desde localStorage una sola vez al montar. La escritura se hace de forma
  // síncrona en cada handler (persistTechnologies) para evitar race conditions con React StrictMode.
  useEffect(() => {
    setTechnologyOptions(filterAllowedTechnologies(loadPersistedTechnologies()));
  }, []);

  const handleOpenCreateDialog = () => {
    setEditingPlanId(null);
    setServerMessage(null);
    setTechnologyDraft('');
    setEditingTechnologyOriginal(null);
    setEditingTechnologyDraft('');
    const defaultTechnology = effectiveTechnologyOptions[0] ?? '';
    reset({
      name: '',
      technology: defaultTechnology,
      speedMode: 'SYMMETRIC',
      downloadSpeedMbps: 300,
      uploadSpeedMbps: 300,
      basePrice: 120000,
      installationEnabled: true,
      installationFee: 120000,
      installationRule: InstallationRule.ON_DEMAND,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (plan: PlanCatalogItem) => {
    setEditingPlanId(plan.id);
    setServerMessage(null);
    setTechnologyDraft('');
    setEditingTechnologyOriginal(null);
    setEditingTechnologyDraft('');
    reset(toFormValues(plan));
    setIsDialogOpen(true);
  };

  const handleAddTechnology = () => {
    const normalized = normalizeTechnologyName(technologyDraft);
    if (!normalized) {
      return;
    }

    if (isBlockedTechnology(normalized)) {
      setServerMessage('FTTH ya no está disponible como tecnología comercial.');
      return;
    }

    const next = mergeTechnologyOptions(technologyOptions, [normalized]);
    setTechnologyOptions(next);
    persistTechnologies(next);
    setValue('technology', normalized, { shouldValidate: true, shouldDirty: true });
    setTechnologyDraft('');
  };

  const handleStartEditTechnology = (technology: string) => {
    setEditingTechnologyOriginal(technology);
    setEditingTechnologyDraft(technology);
  };

  const handleSaveEditedTechnology = () => {
    if (!editingTechnologyOriginal) {
      return;
    }

    const normalized = normalizeTechnologyName(editingTechnologyDraft);
    if (!normalized) {
      return;
    }

    if (isBlockedTechnology(normalized)) {
      setServerMessage('FTTH ya no está disponible como tecnología comercial.');
      return;
    }

    const currentTechnology = normalizeTechnologyName(watch('technology'));
    const replaced = technologyOptions.map((item) =>
      item.toLowerCase() === editingTechnologyOriginal.toLowerCase() ? normalized : item,
    );
    const next = mergeTechnologyOptions([], replaced);
    setTechnologyOptions(next);
    persistTechnologies(next);

    if (currentTechnology.toLowerCase() === editingTechnologyOriginal.toLowerCase()) {
      setValue('technology', normalized, { shouldValidate: true, shouldDirty: true });
    }

    setEditingTechnologyOriginal(null);
    setEditingTechnologyDraft('');
  };

  const handleDeleteTechnology = (technology: string) => {
    const isUsedByActivePlan = technologiesInActivePlans.has(
      normalizeTechnologyName(technology).toLowerCase(),
    );

    if (isUsedByActivePlan) {
      setServerMessage(
        'No puedes eliminar una tecnología asociada a planes activos. Desactiva o migra esos planes primero.',
      );
      return;
    }

    const next = technologyOptions.filter(
      (item) => item.toLowerCase() !== technology.toLowerCase(),
    );
    setTechnologyOptions(next);
    persistTechnologies(next);

    const currentTechnology = normalizeTechnologyName(watch('technology'));
    if (currentTechnology.toLowerCase() === technology.toLowerCase()) {
      setValue('technology', '', { shouldValidate: true, shouldDirty: true });
    }

    if (editingTechnologyOriginal?.toLowerCase() === technology.toLowerCase()) {
      setEditingTechnologyOriginal(null);
      setEditingTechnologyDraft('');
    }
  };

  const handleDeletePlan = async (plan: PlanCatalogItem) => {
    setDeletingPlanId(plan.id);
    setServerMessage(null);
    try {
      await commercialApi.deletePlan(plan.id);
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

    if (isBlockedTechnology(values.technology)) {
      setServerMessage('FTTH ya no está disponible como tecnología comercial.');
      return;
    }

    const normalizedInstallationRule: PlanInstallationRule = values.installationEnabled
      ? values.installationRule
      : InstallationRule.NEVER;

    const payload: CreatePlanCatalogItemDto = {
      name: values.name.trim(),
      technology: normalizeTechnologyName(values.technology),
      downloadSpeedMbps: values.downloadSpeedMbps,
      uploadSpeedMbps:
        values.speedMode === 'SYMMETRIC' ? values.downloadSpeedMbps : values.uploadSpeedMbps,
      basePrice: values.basePrice,
      installationRule: normalizedInstallationRule,
      installationFee: values.installationEnabled ? values.installationFee : 0,
    };

    try {
      if (!editingPlanId) {
        await commercialApi.createPlan(payload);
      } else {
        const current = plans.find((plan) => plan.id === editingPlanId);

        if (!current) {
          throw new Error('No fue posible encontrar el plan a editar.');
        }

        const nextUploadSpeed =
          values.speedMode === 'SYMMETRIC' ? values.downloadSpeedMbps : values.uploadSpeedMbps;
        const nextInstallationFee = values.installationEnabled ? values.installationFee : 0;
        const currentTechnology = normalizeTechnologyName(current.technology);

        const updatePayload: UpdatePlanCatalogItemDto = {};

        if (payload.name !== current.name) {
          updatePayload.name = payload.name;
        }

        if (payload.technology !== currentTechnology) {
          updatePayload.technology = payload.technology;
        }

        if (payload.downloadSpeedMbps !== current.downloadSpeedMbps) {
          updatePayload.downloadSpeedMbps = payload.downloadSpeedMbps;
        }

        if (nextUploadSpeed !== current.uploadSpeedMbps) {
          updatePayload.uploadSpeedMbps = nextUploadSpeed;
        }

        if (normalizedInstallationRule !== current.installationRule) {
          updatePayload.installationRule = normalizedInstallationRule;
        }

        const currentBasePrice = parseMoneyFromApi(current.basePrice);
        const currentInstallationFee = parseMoneyFromApi(current.installationFee);
        const priceChanged =
          payload.basePrice !== currentBasePrice || nextInstallationFee !== currentInstallationFee;

        if (priceChanged) {
          // El endpoint de precios requiere un snapshot completo; enviamos ambos campos juntos.
          updatePayload.basePrice = payload.basePrice;
          updatePayload.installationFee = nextInstallationFee;
        }

        if (Object.keys(updatePayload).length > 0) {
          await commercialApi.updatePlan(editingPlanId, updatePayload);
        }
      }

      void loadPlans();
      setIsDialogOpen(false);
      setEditingPlanId(null);
    } catch (error) {
      setServerMessage(mapMutationError(error));
    }
  };

  return (
    <PortalPanel
      eyebrow="Catálogo"
      title="Planes comerciales"
      description="Administra planes de conectividad, velocidades y precios vigentes para venta."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activePlansCount} activo{activePlansCount === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo plan
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {loadError && (
        <PortalAlert
          variant="error"
          title="No fue posible cargar planes"
          description={loadError}
          icon={CircleAlert}
        />
      )}

      {serverMessage && !loadError && (
        <PortalAlert
          variant="warning"
          title="Revisión requerida"
          description={serverMessage}
          icon={CircleAlert}
        />
      )}

      {isLoading ? (
        <PortalSkeletonBlock className="h-44" />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                <tr>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Plan
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Velocidad
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Precio base
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Instalación
                  </th>
                  {canEdit && (
                    <>
                      <th scope="col" className={portalDataTableHeadClassName}>
                        Estado
                      </th>
                      <th scope="col" className={portalDataTableHeadClassName}>
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
                  return (
                    <tr
                      key={plan.id}
                      className={cn(
                        'border-t border-gray-100 dark:border-dark-border',
                        commercialTableRowHoverClassName,
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
                      <td className={cellClass}>{formatInstallationText(plan)}</td>
                      {canEdit && (
                        <>
                          <td className={cellClass}>
                            <Badge variant={getPortalActiveBadgeVariant(plan.isActive)}>
                              {plan.isActive ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                          <td className={cellClass}>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="icon"
                                aria-label={`Editar plan ${plan.name}`}
                                title={`Editar plan ${plan.name}`}
                                onClick={() => handleOpenEditDialog(plan)}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
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
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent
          aria-labelledby="plan-dialog-title"
          aria-describedby="plan-dialog-description"
          className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader>
            <p className="portal-eyebrow">Catálogo comercial</p>
            <DialogTitle id="plan-dialog-title" className="mt-1">
              {editingPlan ? `Editar plan: ${editingPlan.name}` : 'Nuevo plan'}
            </DialogTitle>
            <DialogDescription id="plan-dialog-description">
              {editingPlan
                ? 'Actualiza velocidad, precio e instalación del plan.'
                : 'Registra nombre, tecnología, velocidad y precio del plan.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {serverMessage ? (
              <PortalAlert
                variant="error"
                title={
                  editingPlan ? 'No fue posible guardar el plan' : 'No fue posible crear el plan'
                }
                description={serverMessage}
              />
            ) : null}

            <section className="space-y-4" aria-labelledby="plan-section-identity">
              <p id="plan-section-identity" className="portal-eyebrow-muted">
                Identidad del plan
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  id="plan-name"
                  label="Nombre del plan"
                  disabled={!canEdit || isSubmitting}
                  error={errors.name?.message}
                  {...register('name')}
                />

                <Controller
                  name="technology"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="plan-technology"
                      label="Tecnología"
                      className="h-11"
                      disabled={!canEdit || isSubmitting}
                      name={field.name}
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      {...(errors.technology?.message ? { error: errors.technology.message } : {})}
                    >
                      {selectTechnologyOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>

              <details className="group rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
                <summary
                  className={cn(
                    'flex cursor-pointer list-none items-center justify-between gap-3',
                    interactiveFocusClassName,
                  )}
                >
                  <div>
                    <p className="portal-eyebrow-muted">Gestionar tecnologías</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {effectiveTechnologyOptions.length} en la lista · opcional
                    </p>
                  </div>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>

                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {effectiveTechnologyOptions.length === 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        No hay tecnologías registradas.
                      </span>
                    )}

                    {effectiveTechnologyOptions.map((technology) => {
                      const isEditing =
                        editingTechnologyOriginal?.toLowerCase() === technology.toLowerCase();
                      const isUsedByActivePlan = technologiesInActivePlans.has(
                        technology.toLowerCase(),
                      );

                      return (
                        <div
                          key={technology}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs dark:border-dark-border dark:bg-dark-surface-3"
                        >
                          {isEditing ? (
                            <>
                              <input
                                aria-label={`Editar tecnología ${technology}`}
                                value={editingTechnologyDraft}
                                onChange={(event) => setEditingTechnologyDraft(event.target.value)}
                                disabled={!canEdit || isSubmitting}
                                className={cn(
                                  'portal-input-surface h-7 w-28 px-2 text-xs text-gray-700 dark:text-gray-200',
                                  interactiveFocusClassName,
                                )}
                              />
                              <button
                                type="button"
                                aria-label={`Guardar tecnología ${technology}`}
                                disabled={!canEdit || isSubmitting}
                                onClick={handleSaveEditedTechnology}
                                className={cn(
                                  'rounded-md p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30',
                                  interactiveFocusClassName,
                                )}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Cancelar edición de tecnología ${technology}`}
                                disabled={!canEdit || isSubmitting}
                                onClick={() => {
                                  setEditingTechnologyOriginal(null);
                                  setEditingTechnologyDraft('');
                                }}
                                className={cn(
                                  'rounded-md px-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-dark-surface-2',
                                  interactiveFocusClassName,
                                )}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={!canEdit || isSubmitting}
                                onClick={() =>
                                  setValue('technology', technology, { shouldValidate: true })
                                }
                                className={cn(
                                  'font-medium text-gray-700 hover:text-iwana-primary disabled:opacity-50 dark:text-gray-200',
                                  interactiveFocusClassName,
                                )}
                                aria-label={`Usar tecnología ${technology}`}
                              >
                                {technology}
                              </button>
                              <button
                                type="button"
                                aria-label={`Editar tecnología ${technology}`}
                                disabled={!canEdit || isSubmitting}
                                onClick={() => handleStartEditTechnology(technology)}
                                className={cn(
                                  'rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-iwana-primary disabled:opacity-50 dark:text-gray-300 dark:hover:bg-dark-surface-2',
                                  interactiveFocusClassName,
                                )}
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Eliminar tecnología ${technology}`}
                                title={
                                  isUsedByActivePlan
                                    ? 'No se puede eliminar: hay planes activos usando esta tecnología.'
                                    : 'Eliminar tecnología'
                                }
                                disabled={!canEdit || isSubmitting || isUsedByActivePlan}
                                onClick={() => handleDeleteTechnology(technology)}
                                className={cn(
                                  'rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-dark-surface-2',
                                  interactiveFocusClassName,
                                )}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      id="technology-new"
                      label="Nueva tecnología"
                      value={technologyDraft}
                      onChange={(event) => setTechnologyDraft(event.target.value)}
                      disabled={!canEdit || isSubmitting}
                      placeholder="Ej: EPON"
                      className="min-w-[220px] flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={
                        !canEdit || isSubmitting || !normalizeTechnologyName(technologyDraft)
                      }
                      onClick={handleAddTechnology}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Agregar
                    </Button>
                  </div>
                </div>
              </details>
            </section>

            <section className="space-y-4" aria-labelledby="plan-section-speed">
              <p id="plan-section-speed" className="portal-eyebrow-muted">
                Velocidad
              </p>
              <Controller
                name="speedMode"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Modalidad de velocidad
                    </p>
                    <div
                      role="radiogroup"
                      aria-label="Modalidad de velocidad"
                      className={cn(portalModuleTabsTrackClassName, 'inline-flex w-fit gap-1 p-1')}
                    >
                      {(
                        [
                          { value: 'SYMMETRIC' as const, label: 'Simétrica' },
                          { value: 'ASYMMETRIC' as const, label: 'Asimétrica' },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={field.value === option.value}
                          disabled={!canEdit || isSubmitting}
                          onClick={() => field.onChange(option.value)}
                          className={cn(
                            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            interactiveFocusClassName,
                            field.value === option.value
                              ? 'bg-iwana-primary text-white shadow-sm'
                              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              />

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
            </section>

            <section className="space-y-4" aria-labelledby="plan-section-price">
              <p id="plan-section-price" className="portal-eyebrow-muted">
                Precio comercial
              </p>
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
            </section>

            <section
              className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
              aria-labelledby="plan-section-installation"
            >
              <p id="plan-section-installation" className="portal-eyebrow-muted">
                Instalación
              </p>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  disabled={!canEdit || isSubmitting}
                  className={cn(
                    'h-4 w-4 rounded border-gray-300 accent-iwana-primary',
                    interactiveFocusClassName,
                  )}
                  {...register('installationEnabled')}
                />
                Cobrar instalación
              </label>

              {installationEnabled && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Controller
                    name="installationRule"
                    control={control}
                    render={({ field }) => (
                      <Select
                        id="installation-rule"
                        label="Regla de instalación"
                        className="h-11"
                        disabled={!canEdit || isSubmitting}
                        name={field.name}
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      >
                        <option value="ALWAYS">Siempre cobrar instalación</option>
                        <option value="ON_DEMAND">Cobrar instalación bajo demanda</option>
                        <option value="NEVER">Nunca cobrar instalación</option>
                      </Select>
                    )}
                  />

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
            </section>

            {editingPlan ? (
              <section
                className="space-y-3 border-t border-gray-200 pt-4 dark:border-dark-border"
                aria-labelledby="plan-section-danger"
              >
                <p id="plan-section-danger" className="portal-eyebrow-muted">
                  Acciones destructivas
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Eliminar el plan &quot;{editingPlan.name}&quot; es irreversible. Los clientes
                  asociados no se eliminan pero perderán la referencia a este plan.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  loading={deletingPlanId === editingPlanId}
                  disabled={deletingPlanId === editingPlanId || !canEdit}
                  onClick={() => void handleDeletePlan(editingPlan)}
                >
                  Eliminar este plan
                </Button>
              </section>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-dark-border">
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
          </form>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
