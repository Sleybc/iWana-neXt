'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import {
  commercialApi,
  type CommercialListMeta,
  type CommercialListParams,
  type CreatePlanCatalogItemDto,
  type PlanCatalogItem,
  type PlanInstallationRule,
  type UpdatePlanCatalogItemDto,
} from '@/lib/api-client';
import { InstallationRule } from '@iwana/shared';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';
import { useCommercialFocusConsume } from '@/components/commercial/useCommercialFocusConsume';
import {
  parsePlanCatalogFilters,
  type PlanCatalogFilters,
} from '@/components/commercial/catalog/catalog-filter-params';
import {
  PLAN_CATALOG_PAGE_OUT_OF_RANGE_NOTICE,
  PLAN_CATALOG_PAGE_SIZE_OPTIONS,
} from '@/components/commercial/catalog/plan-catalog-pagination';
import { portalActiveCountBadgeVariant } from '@/lib/portal-status-badge-rules';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  TECHNOLOGY_SUGGESTIONS,
  filterAllowedTechnologies,
  isBlockedTechnology,
  loadPersistedTechnologies,
  mapLoadError,
  mapMutationError,
  mergeTechnologyOptions,
  normalizeTechnologyName,
  parseMoneyFromApi,
  persistTechnologies,
  planFormSchema,
  toFormValues,
  type PlanFormValues,
} from '@/components/commercial/catalog/plan-catalog-helpers';
import { PlanCatalogTable } from '@/components/commercial/catalog/PlanCatalogTable';
import { PlanCatalogFormPeek } from '@/components/commercial/catalog/PlanCatalogFormPeek';

interface PlanCatalogPanelProps {
  canEdit: boolean;
  focusId?: string | null | undefined;
  onFocusConsumed?: (() => void) | undefined;
}

const PLAN_FILTER_KEYS = ['q', 'status', 'missingPrice'] as const;

export function PlanCatalogPanel({
  canEdit,
  focusId = null,
  onFocusConsumed,
}: PlanCatalogPanelProps) {
  const {
    page,
    pageSize,
    sort,
    sortBy,
    sortDir,
    filters,
    setPage,
    setPageSize,
    setFilters,
    setQuery,
    setSort,
  } = useTableQueryState({
    filterKeys: PLAN_FILTER_KEYS,
    pageSizeOptions: PLAN_CATALOG_PAGE_SIZE_OPTIONS,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const catalogFilters = useMemo(
    () =>
      parsePlanCatalogFilters({
        get: (name) => filters[name] ?? null,
      }),
    [filters],
  );

  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [meta, setMeta] = useState<CommercialListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlanCatalogItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Inicialmente vacío para evitar mismatch SSR/cliente. El useEffect de mount carga desde localStorage.
  const [technologyOptions, setTechnologyOptions] = useState<string[]>([]);
  const [technologyDraft, setTechnologyDraft] = useState('');
  const [editingTechnologyOriginal, setEditingTechnologyOriginal] = useState<string | null>(null);
  const [editingTechnologyDraft, setEditingTechnologyDraft] = useState('');
  const [searchDraft, setSearchDraft] = useState(catalogFilters.q);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const outOfRangeShownRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const prevPageRef = useRef(page);

  const missingPriceFilter = catalogFilters.missingPrice;
  const searchValue = searchDraft;

  const activePlansCount = useMemo(() => plans.filter((item) => item.isActive).length, [plans]);
  const totalPlans = meta.total;
  const { from, to } = listPageWindow({
    page: meta.page ?? page,
    limit: meta.limit || pageSize,
    total: meta.total,
  });
  const pageCount = Math.max(1, meta.totalPages ?? 1);

  const hasActiveFilters = Boolean(searchDraft.trim()) || missingPriceFilter;

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

  const loadPlans = useCallback(
    async (requestedPage = page) => {
      const params: CommercialListParams = {
        page: requestedPage,
        limit: pageSize,
      };
      const q = catalogFilters.q.trim();
      if (q) {
        params.name = q;
      }
      if (missingPriceFilter) {
        params.missingPrice = true;
      }
      if (sortBy && sortDir) {
        params.sortBy = sortBy;
        params.sortDir = sortDir;
      }

      const firstLoad = !hasLoadedOnceRef.current;
      if (firstLoad) {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const response = await commercialApi.getPlans(params);
        const nextMeta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit: pageSize,
        });
        const totalPages = nextMeta.totalPages ?? 0;

        if (totalPages > 0 && requestedPage > totalPages) {
          if (!outOfRangeShownRef.current) {
            outOfRangeShownRef.current = true;
            setOutOfRangeNotice(PLAN_CATALOG_PAGE_OUT_OF_RANGE_NOTICE);
          }
          setQuery({ page: totalPages }, { history: 'replace' });
          return;
        }

        if (response.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
          setQuery({ page: Math.max(1, totalPages || requestedPage - 1) }, { history: 'replace' });
          return;
        }

        outOfRangeShownRef.current = false;
        setPlans(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (error) {
        setLoadError(mapLoadError(error));
        if (firstLoad) {
          setPlans([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [catalogFilters.q, missingPriceFilter, page, pageSize, setQuery, sortBy, sortDir],
  );

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    setSearchDraft(catalogFilters.q);
  }, [catalogFilters.q]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (prevPageRef.current === page) {
      return;
    }
    prevPageRef.current = page;
    const el = tableShellRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch {
        // jsdom no implementa scrollIntoView de forma fiable.
      }
    }
  }, [page]);

  useCommercialFocusConsume({
    focusId,
    isLoading,
    items: plans,
    getId: (item) => item.id,
    onMatch: (plan) => {
      reset(toFormValues(plan));
      setEditingPlanId(plan.id);
      setIsDialogOpen(true);
      setServerMessage(null);
    },
    onFocusConsumed,
  });

  // Carga tecnologías desde localStorage una sola vez al montar. La escritura se hace de forma
  // síncrona en cada handler (persistTechnologies) para evitar race conditions con React StrictMode.
  useEffect(() => {
    setTechnologyOptions(filterAllowedTechnologies(loadPersistedTechnologies()));
  }, []);

  function persistPlanCatalogFilters(next: Partial<PlanCatalogFilters>) {
    const merged: PlanCatalogFilters = {
      q: next.q ?? catalogFilters.q,
      status: 'ALL',
      missingPrice: next.missingPrice ?? catalogFilters.missingPrice,
    };
    setFilters({
      q: merged.q.trim() || null,
      status: null,
      missingPrice: merged.missingPrice ? '1' : null,
    });
  }

  function updateFilters(patch: Partial<PlanCatalogFilters>) {
    setServerMessage(null);

    if (patch.q !== undefined) {
      const nextQ = patch.q;
      setSearchDraft(nextQ);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = setTimeout(() => {
        persistPlanCatalogFilters({ q: nextQ });
      }, 300);
      return;
    }

    persistPlanCatalogFilters(patch);
  }

  function clearFilters() {
    setServerMessage(null);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    setSearchDraft('');
    setFilters({
      q: null,
      status: null,
      missingPrice: null,
    });
  }

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

  const handleCloseFormPeek = () => {
    setIsDialogOpen(false);
    setEditingPlanId(null);
    setServerMessage(null);
    setTechnologyDraft('');
    setEditingTechnologyOriginal(null);
    setEditingTechnologyDraft('');
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
    setDeleteError(null);
    setServerMessage(null);
    try {
      await commercialApi.deletePlan(plan.id);
      setDeleteTarget(null);
      void loadPlans();
      handleCloseFormPeek();
    } catch (error) {
      setDeleteError(mapMutationError(error));
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
      handleCloseFormPeek();
    } catch (error) {
      setServerMessage(mapMutationError(error));
    }
  };

  return (
    <PortalPanel
      eyebrow="Catálogo"
      title="Planes"
      description="Administra planes de conectividad, velocidades y precios vigentes para venta."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activePlansCount} activo{activePlansCount === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button variant="primary" onClick={handleOpenCreateDialog}>
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
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadPlans()}>
              Reintentar
            </Button>
          }
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

      {outOfRangeNotice ? (
        <PortalAlert
          variant="warning"
          title="Página fuera de rango"
          description={outOfRangeNotice}
          live="polite"
        />
      ) : null}

      <div ref={tableShellRef}>
        <PlanCatalogTable
          canEdit={canEdit}
          isLoading={isLoading}
          totalPlans={totalPlans}
          filteredPlans={plans}
          focusId={focusId}
          searchValue={searchValue}
          missingPriceFilter={missingPriceFilter}
          hasActiveFilters={hasActiveFilters}
          page={meta.page ?? page}
          pageCount={pageCount}
          from={from}
          to={to}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onUpdateFilters={updateFilters}
          onClearFilters={clearFilters}
          onOpenCreate={handleOpenCreateDialog}
          onOpenEdit={handleOpenEditDialog}
          sortableFields={meta.capabilities.sortableFields}
          activeSort={sort}
          onSortChange={setSort}
        />
      </div>

      <PlanCatalogFormPeek
        open={isDialogOpen}
        onClose={handleCloseFormPeek}
        canEdit={canEdit}
        editingPlan={editingPlan}
        editingPlanId={editingPlanId}
        deletingPlanId={deletingPlanId}
        serverMessage={serverMessage}
        control={control}
        register={register}
        handleSubmit={handleSubmit}
        setValue={setValue}
        onSubmit={onSubmit}
        errors={errors}
        isSubmitting={isSubmitting}
        speedMode={speedMode}
        installationEnabled={installationEnabled}
        selectTechnologyOptions={selectTechnologyOptions}
        effectiveTechnologyOptions={effectiveTechnologyOptions}
        technologiesInActivePlans={technologiesInActivePlans}
        technologyDraft={technologyDraft}
        setTechnologyDraft={setTechnologyDraft}
        editingTechnologyOriginal={editingTechnologyOriginal}
        setEditingTechnologyOriginal={setEditingTechnologyOriginal}
        editingTechnologyDraft={editingTechnologyDraft}
        setEditingTechnologyDraft={setEditingTechnologyDraft}
        onAddTechnology={handleAddTechnology}
        onStartEditTechnology={handleStartEditTechnology}
        onSaveEditedTechnology={handleSaveEditedTechnology}
        onDeleteTechnology={handleDeleteTechnology}
        onRequestDelete={() => {
          if (!editingPlan) {
            return;
          }
          setDeleteError(null);
          setDeleteTarget(editingPlan);
        }}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar plan</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTarget?.name}</strong>? Esta acción es irreversible. Los
              clientes asociados no se eliminan, pero perderán la referencia a este plan.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <PortalAlert
              variant="error"
              title="No fue posible eliminar"
              description={deleteError}
              icon={CircleAlert}
              className="mt-3"
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!!deletingPlanId}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={!!deletingPlanId}
              onClick={() => {
                if (deleteTarget) {
                  void handleDeletePlan(deleteTarget);
                }
              }}
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
