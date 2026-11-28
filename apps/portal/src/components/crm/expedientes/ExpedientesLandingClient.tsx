'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, PulseStrip, Select, cn } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import { AcquisitionChannel, CustomerSegment } from '@iwana/shared';
import { ArrowRight, Building2, CircleDashed, Plus, User } from 'lucide-react';
import { crmApi, usersApi, type ExpedienteRecord, type InternalUser } from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { getSafeCrmErrorMessage } from './crm-error-message';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { PrivacyMarks } from '@/components/privacy/PrivacyMarks';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalSearchField,
  PortalSkeletonBlock,
  PortalTablePager,
  interactiveFocusClassName,
  portalCheckboxClassName,
  portalDataBusyRegionClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTabLimeActiveClassName,
  portalTabInactiveClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  CUSTOMER_SEGMENT_OPTIONS,
  formatAcquisitionChannel,
  formatCrmDate,
  formatMunicipio,
  getStatusMeta,
} from '@/components/crm/expedientes/expediente-ui';
import {
  EXPEDIENTE_TAB_VIEWS,
  getDefaultExpedienteView,
  getExpedienteEmptyActionKind,
  getExpedienteEmptyCopy,
  getExpedienteViewIcon,
  getExpedienteViewLabel,
  getOriginViewFromStatus,
  parseExpedienteViewFromSearchParams,
  type ExpedienteListView,
} from '@/components/crm/expedientes/expediente-list-view';

const OPEN_STATUSES = [
  'NUEVO_POTENCIAL',
  'PRECALIFICADO',
  'VALIDANDO_COBERTURA',
  'EN_COTIZACION',
  'LISTO_PARA_INSTALACION',
] as const;
const CONVERTED_STATUSES = ['INSTALACION_AGENDADA'] as const;
const ARCHIVE_STATUSES = ['CLIENTE_ACTIVO', 'DESCARTADO'] as const;

const FILTER_KEYS = ['view', 'search', 'documentNumber', 'allViews'] as const;
const OPPORTUNITIES_RESOURCE = { singular: 'oportunidad', plural: 'oportunidades' } as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';
const CREATE_FORM_NAME_ID = 'expediente-full-name';

function getTabCount(
  view: 'open' | 'converted' | 'archive',
  summary: Record<string, number>,
): number {
  if (view === 'open') return OPEN_STATUSES.reduce((sum, key) => sum + (summary[key] ?? 0), 0);
  if (view === 'converted') {
    return CONVERTED_STATUSES.reduce((sum, key) => sum + (summary[key] ?? 0), 0);
  }
  return ARCHIVE_STATUSES.reduce((sum, key) => sum + (summary[key] ?? 0), 0);
}

function validateCreateValues(values: {
  fullName: string;
  acquisitionChannel: string;
  customerSegment: string;
}): string | null {
  const fullName = values.fullName.trim();

  if (!fullName || !values.acquisitionChannel) {
    return 'Nombre completo y origen son obligatorios para crear la oportunidad.';
  }

  if (!values.customerSegment) {
    return 'Selecciona el tipo de cliente.';
  }

  if (fullName.length > 160) {
    return 'El nombre completo no puede superar 160 caracteres.';
  }

  return null;
}

function mapListError(error: unknown): string {
  return getSafeCrmErrorMessage(error, 'No fue posible cargar las oportunidades de la empresa.');
}

function parseViewFilter(raw: string | undefined): ExpedienteListView {
  if (!raw) return getDefaultExpedienteView();
  return parseExpedienteViewFromSearchParams(new URLSearchParams({ view: raw }));
}

function ExpedientesLandingClientInner() {
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const createNameRef = useRef<HTMLInputElement | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({
      filterKeys: FILTER_KEYS,
      defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
    });

  const activeView = parseViewFilter(filters.view);
  const urlSearch = filters.search ?? '';
  const urlDocument = filters.documentNumber ?? '';
  const allViewsEnabled = filters.allViews === '1';

  const [searchDraft, setSearchDraft] = useState(urlSearch);
  const [documentDraft, setDocumentDraft] = useState(urlDocument);
  const [expedientes, setExpedientes] = useState<ExpedienteRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [attributionWarningExpedienteId, setAttributionWarningExpedienteId] = useState<
    string | null
  >(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [employees, setEmployees] = useState<InternalUser[]>([]);
  const [createValues, setCreateValues] = useState({
    fullName: '',
    customerSegment: '',
    acquisitionChannel: 'OTRO',
    originadorId: '',
  });

  const hasQueryText = Boolean(urlSearch || urlDocument);
  const effectiveView: ExpedienteListView = allViewsEnabled && hasQueryText ? 'all' : activeView;
  const hasActiveFilters = Boolean(urlSearch || urlDocument || allViewsEnabled);
  const emptyCopy = getExpedienteEmptyCopy(effectiveView, hasActiveFilters);
  const emptyActionKind = getExpedienteEmptyActionKind(effectiveView, hasActiveFilters);

  useEffect(() => {
    setSearchDraft(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    setDocumentDraft(urlDocument);
  }, [urlDocument]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = searchDraft.trim();
      const nextDocument = documentDraft.trim();
      if (nextSearch === urlSearch && nextDocument === urlDocument) return;
      setFilters({
        search: nextSearch || null,
        documentNumber: nextDocument || null,
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [documentDraft, searchDraft, setFilters, urlDocument, urlSearch]);

  const loadPage = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      setListError(null);
      setSummaryError(false);

      const listFilters: {
        view: ExpedienteListView;
        page: number;
        limit: number;
        search?: string;
        documentNumber?: string;
      } = { view: effectiveView, page, limit: pageSize };
      if (urlSearch) listFilters.search = urlSearch;
      if (urlDocument) listFilters.documentNumber = urlDocument;

      try {
        const [summaryResult, listResult] = await Promise.allSettled([
          crmApi.getPipelineSummary(),
          crmApi.listExpedientes(listFilters),
        ]);
        setSummary(summaryResult.status === 'fulfilled' ? summaryResult.value.data : null);
        setSummaryError(summaryResult.status === 'rejected');
        if (listResult.status === 'rejected') throw listResult.reason;
        const listRes = listResult.value;

        const nextMeta = normalizeListMeta(
          {
            ...listRes.meta,
            page: listRes.meta?.page ?? page,
            limit: listRes.meta?.limit ?? pageSize,
            total: listRes.meta?.total ?? listRes.total ?? listRes.data.length,
            mode: 'page',
            capabilities: listRes.meta?.capabilities ?? {
              randomAccess: true,
              sortableFields: [],
            },
          },
          { dataLength: listRes.data.length, limit: pageSize },
        );
        const requestedPage = page;
        const totalPages = nextMeta.totalPages ?? 0;

        if (totalPages > 0 && requestedPage > totalPages) {
          if (!outOfRangeShownRef.current) {
            outOfRangeShownRef.current = true;
            setOutOfRangeNotice(PAGE_OUT_OF_RANGE_NOTICE);
          }
          setQuery({ page: totalPages }, { history: 'replace' });
          return;
        }

        if (listRes.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
          const fallback = Math.max(1, totalPages || requestedPage - 1);
          setQuery({ page: fallback }, { history: 'replace' });
          return;
        }

        setExpedientes(listRes.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (error) {
        setListError(mapListError(error));
        if (!soft) {
          setExpedientes([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [effectiveView, page, pageSize, setQuery, urlDocument, urlSearch],
  );

  useEffect(() => {
    void loadPage({ soft: true });
  }, [loadPage]);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        let cursor: string | undefined;
        const all: InternalUser[] = [];
        do {
          const resp = await usersApi.list({ limit: 200, ...(cursor ? { cursor } : {}) });
          all.push(...resp.data);
          cursor = resp.meta.nextCursor ?? undefined;
        } while (cursor);
        setEmployees(all);
      } catch {
        // El alta sigue disponible sin el listado de asesores.
      }
    };
    void loadEmployees();
  }, []);

  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    const el = tableShellRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch {
        // jsdom / entornos sin layout
      }
    }
  }, [page]);

  const counts = summary ?? {};
  const summaryLoading = summary === null && !summaryError;
  const pageCount = meta.totalPages ?? (meta.total > 0 ? 1 : 0);
  const effectivePage = meta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: meta.limit || pageSize,
    total: meta.total,
  });
  const showPager = !initialLoading && meta.total > 0;
  const showPageSize = showPager && meta.total > Math.min(...[10, 20, 50]);

  const summaryCells = [
    {
      id: 'total',
      label: 'Total de oportunidades',
      hint: 'En todas las vistas',
      value: Object.values(counts).reduce((sum, value) => sum + value, 0),
      onRetry: summaryError && !listError ? () => void loadPage({ soft: true }) : undefined,
    },
    {
      id: 'captacion',
      label: 'Captación inicial',
      hint: 'Nuevas y precalificadas',
      value: (counts.NUEVO_POTENCIAL ?? 0) + (counts.PRECALIFICADO ?? 0),
    },
    {
      id: 'calificacion',
      label: 'Calificación',
      hint: 'Cobertura y cotización',
      value: (counts.VALIDANDO_COBERTURA ?? 0) + (counts.EN_COTIZACION ?? 0),
    },
    {
      id: 'instalacion',
      label: 'Instalación y activación',
      hint: 'Listas, agendadas y activas',
      value:
        (counts.LISTO_PARA_INSTALACION ?? 0) +
        (counts.INSTALACION_AGENDADA ?? 0) +
        (counts.CLIENTE_ACTIVO ?? 0),
    },
  ].map((cell) => ({
    ...cell,
    value: summary === null ? null : cell.value,
    state: summary === null ? ('error' as const) : ('idle' as const),
  }));

  function focusCreateForm() {
    createNameRef.current?.focus();
    createNameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function handleTabChange(view: (typeof EXPEDIENTE_TAB_VIEWS)[number]) {
    setFilters({
      view: view === 'open' ? null : view,
      allViews: null,
    });
  }

  function handleClearFilters() {
    setSearchDraft('');
    setDocumentDraft('');
    setFilters({
      search: null,
      documentNumber: null,
      allViews: null,
    });
  }

  async function handleCreateNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateCreateValues(createValues);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setAttributionWarningExpedienteId(null);
      const payload: {
        fullName: string;
        customerSegment: CustomerSegment;
        acquisitionChannel: AcquisitionChannel;
      } = {
        fullName: createValues.fullName.trim(),
        customerSegment: createValues.customerSegment as CustomerSegment,
        acquisitionChannel: createValues.acquisitionChannel as AcquisitionChannel,
      };

      const created = await crmApi.createExpediente(payload);

      if (createValues.originadorId) {
        try {
          await crmApi.createAttribution(created.id, {
            actorId: createValues.originadorId,
            acquisitionChannel: createValues.acquisitionChannel as AcquisitionChannel,
          });
        } catch {
          setAttributionWarningExpedienteId(created.id);
          await loadPage({ soft: true });
          return;
        }
      }

      setCreateValues({
        fullName: '',
        customerSegment: '',
        acquisitionChannel: 'OTRO',
        originadorId: '',
      });
      await loadPage({ soft: true });
    } catch (err) {
      setCreateError(getSafeCrmErrorMessage(err, 'No fue posible crear la oportunidad.'));
      setAttributionWarningExpedienteId(null);
    } finally {
      setCreating(false);
    }
  }

  const loadingAnnouncement =
    initialLoading && expedientes.length === 0
      ? 'Cargando oportunidades'
      : refreshing
        ? 'Actualizando listado de oportunidades'
        : `${expedientes.length} oportunidades mostradas`;

  return (
    <div className="min-w-0 space-y-3 pb-6">
      <PageHeader
        title="Oportunidades"
        subtitle="Registra y da seguimiento a tus oportunidades comerciales."
        className="border-0 bg-transparent px-0 py-1 shadow-none dark:bg-transparent"
      />

      <PulseStrip
        cells={summaryCells}
        loading={summaryLoading}
        ariaLabel="Resumen de oportunidades"
        labels={{
          unavailable: 'No disponible',
          noData: 'Sin dato disponible',
          retry: 'Reintentar',
          updating: 'Actualizando',
        }}
        className="grid-cols-2 lg:grid-cols-4 [&>article]:min-h-28 [&>article]:px-3 [&>article]:py-3 sm:[&>article]:px-4 [&>article>*]:max-w-full [&>article>.tabular-nums]:wrap-anywhere max-sm:[&>article>.tabular-nums]:text-2xl"
      />

      <PortalPanel compact title="Nueva oportunidad" labelled>
        <form
          id="nueva-oportunidad"
          onSubmit={handleCreateNew}
          className="scroll-mt-24 space-y-4"
          noValidate
        >
          <div className="grid grid-cols-2 items-end gap-3 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))_auto]">
            <Input
              id={CREATE_FORM_NAME_ID}
              ref={createNameRef}
              label="Nombre completo"
              value={createValues.fullName}
              onChange={(event) =>
                setCreateValues((current) => ({ ...current, fullName: event.target.value }))
              }
              placeholder="Ej. Empresa Demo SAS"
              maxLength={160}
              className="h-11"
              containerClassName="max-sm:col-span-2"
            />
            <div>
              <label
                htmlFor="expediente-customer-segment"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Tipo de cliente
              </label>
              <Select
                id="expediente-customer-segment"
                value={createValues.customerSegment}
                onChange={(event) =>
                  setCreateValues((current) => ({
                    ...current,
                    customerSegment: event.target.value,
                  }))
                }
                placeholder="Selecciona"
                className="h-11"
              >
                {CUSTOMER_SEGMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label
                htmlFor="expediente-acquisition-channel"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Origen
              </label>
              <Select
                id="expediente-acquisition-channel"
                value={createValues.acquisitionChannel}
                onChange={(event) =>
                  setCreateValues((current) => ({
                    ...current,
                    acquisitionChannel: event.target.value,
                  }))
                }
                className="h-11"
              >
                {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="max-sm:col-span-2">
              <label
                htmlFor="expediente-originador"
                className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Asesor de origen
              </label>
              <Select
                id="expediente-originador"
                value={createValues.originadorId}
                onChange={(event) =>
                  setCreateValues((current) => ({
                    ...current,
                    originadorId: event.target.value,
                  }))
                }
                className="h-11"
              >
                <option value="">Sin asignar</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {[
                      employee.firstName,
                      employee.lastName,
                      employee.firstName || employee.lastName ? '—' : '',
                      employee.email,
                    ]
                      .filter(Boolean)
                      .join(' ')
                      .trim()}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="submit"
              loading={creating}
              className="col-span-2 h-11 w-full sm:w-fit xl:col-span-1"
            >
              {!creating && <Plus className="h-4 w-4" aria-hidden="true" />}
              {creating ? 'Creando…' : 'Crear'}
            </Button>
          </div>

          {createError ? (
            <PortalAlert
              variant="error"
              title="No se pudo crear la oportunidad"
              description={createError}
            />
          ) : null}

          {attributionWarningExpedienteId ? (
            <PortalAlert
              variant="warning"
              title="La oportunidad se creó, pero falta el asesor de origen"
              description="La oportunidad se creó, pero no se pudo guardar el asesor de origen. Puedes corregirlo desde el detalle."
              live="assertive"
              action={
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/dashboard/crm/expedientes/${attributionWarningExpedienteId}`}>
                    Abrir detalle para corregirlo
                  </Link>
                </Button>
              }
            />
          ) : null}
        </form>
      </PortalPanel>

      {listError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar las oportunidades"
          description={listError}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadPage()}>
              Reintentar
            </Button>
          }
        />
      ) : null}

      {outOfRangeNotice ? (
        <PortalAlert
          variant="warning"
          title="Página fuera de rango"
          description={outOfRangeNotice}
          live="polite"
        />
      ) : null}

      <PortalPanel className="overflow-hidden p-0" contentClassName="p-0">
        <div
          role="tablist"
          aria-label="Vistas de oportunidades"
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] border-b border-gray-100 px-1 sm:flex sm:flex-wrap sm:gap-x-1 sm:px-4 dark:border-dark-border"
        >
          {EXPEDIENTE_TAB_VIEWS.map((view) => {
            const label = getExpedienteViewLabel(view);
            const ViewIcon = getExpedienteViewIcon(view);
            const count = getTabCount(view, counts);
            const isActive = activeView === view && effectiveView !== 'all';
            return (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(view)}
                className={cn(
                  'flex min-h-11 min-w-0 items-center justify-center gap-1 border-b-2 border-transparent px-1 py-2 text-xs font-medium transition-colors focus-visible:ring-inset sm:gap-2 sm:px-4 sm:text-sm',
                  interactiveFocusClassName,
                  isActive ? portalTabLimeActiveClassName : portalTabInactiveClassName,
                )}
              >
                <ViewIcon
                  className={
                    isActive
                      ? 'hidden h-4 w-4 shrink-0 text-iwana-secondary-700 sm:block dark:text-iwana-secondary'
                      : 'hidden h-4 w-4 shrink-0 text-gray-400 sm:block dark:text-gray-500'
                  }
                  aria-hidden="true"
                />
                <span>{label}</span>
                {/* El conteo se muestra también en 0: sin él, «En instalación» parecía sin cargar. */}
                {summary !== null && (
                  <span className="rounded-full bg-iwana-primary/10 px-1.5 py-0.5 text-xs wrap-anywhere text-iwana-primary tabular-nums dark:bg-iwana-primary/20 dark:text-iwana-primary-300">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2 px-3 py-3 sm:grid-cols-2 sm:gap-3 sm:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto_auto] lg:items-center">
          <PortalSearchField
            id="expediente-search"
            value={searchDraft}
            onChange={setSearchDraft}
            placeholder="Buscar por nombre…"
            label="Buscar oportunidad"
          />

          <Input
            id="expediente-document-filter"
            aria-label="Documento"
            value={documentDraft}
            onChange={(event) => setDocumentDraft(event.target.value)}
            placeholder="Número de documento"
            className="h-12"
          />

          <label className="flex min-h-12 items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className={portalCheckboxClassName}
              checked={allViewsEnabled}
              disabled={!searchDraft.trim() && !documentDraft.trim() && !allViewsEnabled}
              onChange={(event) => setFilters({ allViews: event.target.checked ? '1' : null })}
            />
            Buscar en todas las pestañas
          </label>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleClearFilters}
              className="h-12 justify-self-start lg:justify-self-auto"
            >
              Limpiar filtros
            </Button>
          ) : (
            <span className="hidden lg:block" />
          )}
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {loadingAnnouncement}
        </div>

        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div ref={tableShellRef} className={portalDataTableShellClassName}>
            <div
              className={
                refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
              }
              aria-busy={refreshing || undefined}
            >
              <table
                className="w-full min-w-[720px] border-collapse text-sm"
                aria-label="Listado de oportunidades"
              >
                <caption className="sr-only">
                  Oportunidades comerciales con estado, origen, ubicación y acceso al detalle
                </caption>
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    <PortalDataTableHead>Nombre</PortalDataTableHead>
                    <PortalDataTableHead>Estado</PortalDataTableHead>
                    <PortalDataTableHead>Fuente</PortalDataTableHead>
                    <PortalDataTableHead>Ubicación</PortalDataTableHead>
                    <PortalDataTableHead>Creado</PortalDataTableHead>
                    <PortalDataTableHead className="text-right">Acción</PortalDataTableHead>
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {initialLoading && expedientes.length === 0
                    ? Array.from({ length: 5 }, (_, index) => (
                        <tr key={`expediente-skeleton-${index}`}>
                          <td className={portalDataTableCellClassName} colSpan={6}>
                            <PortalSkeletonBlock className="h-10 w-full rounded-xl" />
                          </td>
                        </tr>
                      ))
                    : null}

                  {!initialLoading && !listError && expedientes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={cn(portalDataTableCellClassName, 'py-12')}>
                        <PortalEmptyState
                          title={emptyCopy.title}
                          description={emptyCopy.description}
                          icon={CircleDashed}
                          className="w-full text-left"
                          action={
                            emptyActionKind === 'clear-filters' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleClearFilters}
                              >
                                Limpiar filtros
                              </Button>
                            ) : emptyActionKind === 'create' ? (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={focusCreateForm}
                              >
                                Nueva oportunidad
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  ) : null}

                  {expedientes.map((expediente) => (
                    <tr key={expediente.id} className={portalTableRowHoverClassName}>
                      <td className={portalDataTableCellClassName}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-iwana-primary/10 dark:bg-iwana-primary/20">
                            {expediente.personType === 'PERSONA_NATURAL' ? (
                              <User
                                className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300"
                                aria-hidden="true"
                              />
                            ) : (
                              <Building2
                                className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <Link
                            href={`/dashboard/crm/expedientes/${expediente.id}`}
                            className="block min-w-0 truncate font-medium text-gray-900 transition-colors hover:text-iwana-primary dark:text-white dark:hover:text-iwana-primary-300"
                          >
                            {privacyDisplayValue(
                              expediente.anonymizedAt ? null : expediente.fullName,
                              {
                                privacyRestricted: expediente.privacyRestricted,
                                anonymizedAt: expediente.anonymizedAt,
                              },
                            )}
                          </Link>
                          <PrivacyMarks marks={expediente.privacyMarks ?? []} />
                        </div>
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getStatusMeta(expediente.status).variant}>
                          {getStatusMeta(expediente.status).label}
                        </Badge>
                        {effectiveView === 'all' ? (
                          <Badge variant="neutral" className="mt-1 block w-fit">
                            {getExpedienteViewLabel(getOriginViewFromStatus(expediente.status))}
                          </Badge>
                        ) : null}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant="neutral">
                          {formatAcquisitionChannel(expediente.acquisitionChannel)}
                        </Badge>
                        {expediente.sourceDetail &&
                        !expediente.privacyRestricted &&
                        !expediente.anonymizedAt ? (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {expediente.sourceDetail}
                          </p>
                        ) : null}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {privacyDisplayValue(
                          expediente.anonymizedAt
                            ? null
                            : formatMunicipio(expediente.municipality || ''),
                          {
                            privacyRestricted: expediente.privacyRestricted,
                            anonymizedAt: expediente.anonymizedAt,
                            emptyValue: 'Sin municipio',
                          },
                        )}
                      </td>
                      <td className={cn(portalDataTableCellClassName, 'font-mono tabular-nums')}>
                        {formatCrmDate(expediente.createdAt)}
                      </td>
                      <td className={cn(portalDataTableCellClassName, 'text-right')}>
                        <Button variant="ghost" asChild>
                          <Link
                            href={`/dashboard/crm/expedientes/${expediente.id}`}
                            aria-label={`Abrir oportunidad de ${
                              expediente.anonymizedAt || expediente.privacyRestricted
                                ? 'datos protegidos'
                                : expediente.fullName
                            }`}
                          >
                            Abrir
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showPager ? (
              <PortalTablePager
                page={effectivePage}
                pageCount={Math.max(1, pageCount)}
                onPageChange={setPage}
                from={from}
                to={to}
                total={meta.total}
                resource={OPPORTUNITIES_RESOURCE}
                totalIsEstimate={meta.totalIsEstimate}
                loading={refreshing}
                pageSizeControl={
                  showPageSize ? (
                    <PortalPageSizeSelect
                      value={pageSize}
                      onChange={setPageSize}
                      disabled={refreshing}
                    />
                  ) : undefined
                }
              />
            ) : null}
          </div>
        </div>
      </PortalPanel>
    </div>
  );
}

export function ExpedientesLandingClient() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy="true">
          <PortalSkeletonBlock className="h-20 rounded-2xl" />
          <PortalSkeletonBlock className="h-28 rounded-2xl" />
          <PortalSkeletonBlock className="h-64 rounded-2xl" />
        </div>
      }
    >
      <ExpedientesLandingClientInner />
    </Suspense>
  );
}
