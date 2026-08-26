'use client';

import {
  CalendarDays,
  CalendarX2,
  CircleDashed,
  ClipboardList,
  PanelRightOpen,
  RefreshCcw,
} from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, Button, Select, cn } from '@iwana/ui';
import { VisitRequestStatus, WorkOrderPriority, WorkOrderSourceContext } from '@iwana/shared';
import type {
  ListWfmVisitRequestsResponse,
  WfmVisitRequest,
  WfmVisitRequestFilterOptionsResponse,
} from '@/lib/api-client';
import {
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalResultsStrip,
  PortalTablePagination,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalInlineTextLinkClassName,
  portalTabInactiveClassName,
  portalTabLimeActiveClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatWfmDateTime,
  getWorkOrderPriorityLabel,
  getWorkOrderPriorityVariant,
  getWfmWorkTypeLabel,
} from './scheduling-ui';
import {
  formatVisitRequestTerritory,
  type PendingVisitFilters,
  buildDefaultPendingVisitFilters,
  getVisitRequestOriginLabel,
  getVisitRequestPresentationStatus,
  getVisitRequestReferenceLabel,
  getVisitRequestRetryChip,
  getVisitRequestStatusLabel,
  getVisitRequestStatusVariant,
  hasExhaustedRetries,
  requiresAttemptDecision,
} from './pending-visits-ui';

function schedulingShortcutClassName(active: boolean): string {
  return cn(
    'flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
    interactiveFocusClassName,
    active ? portalTabLimeActiveClassName : portalTabInactiveClassName,
  );
}

function schedulingShortcutIconClassName(active: boolean): string {
  return active
    ? 'h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary'
    : 'h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500';
}

interface PendingVisitRequestInboxProps {
  filters: PendingVisitFilters;
  response: ListWfmVisitRequestsResponse | null;
  crmCustomerNames?: Record<string, string>;
  selectedVisitRequestId: string | null;
  openDispatchVisitRequestId?: string | null;
  filterOptions: WfmVisitRequestFilterOptionsResponse | null;
  isLoading: boolean;
  isLoadingMore?: boolean;
  isLoadingFilterOptions: boolean;
  onFiltersChange: (next: PendingVisitFilters) => void;
  onLoadMore?: () => void;
  onOpenDispatch: (visitRequestId: string) => void;
  /** E5 — cuando el chip es «Requiere decisión», abre el diálogo de override. */
  onDecideExhaustedAttempts?: (visitRequestId: string) => void;
  onRefresh: () => void;
  extraActions?: ReactNode;
  compactMode?: boolean;
  maxItems?: number;
  onOpenFullInbox?: (() => void) | undefined;
}

function getCrmCustomerName(
  visitRequest: WfmVisitRequest,
  crmCustomerNames?: Record<string, string>,
): string | null {
  if (visitRequest.originContext !== WorkOrderSourceContext.CRM) {
    return null;
  }

  if (visitRequest.customerDisplayName?.trim()) {
    return visitRequest.customerDisplayName.trim();
  }

  if (visitRequest.expedienteId) {
    const fromCache = crmCustomerNames?.[visitRequest.expedienteId];
    if (fromCache) {
      return fromCache;
    }
  }

  if (visitRequest.originRef) {
    const fromOriginRef = crmCustomerNames?.[visitRequest.originRef];
    if (fromOriginRef) {
      return fromOriginRef;
    }
  }

  const originLabel = visitRequest.originLabel?.trim();
  if (originLabel) {
    const opportunityMatch = originLabel.match(/^Oportunidad\s+([A-Za-z0-9-]+)/i);
    const opportunityCode = opportunityMatch?.[1]?.toUpperCase();

    if (opportunityCode) {
      const fromOpportunityCode = crmCustomerNames?.[opportunityCode];
      if (fromOpportunityCode) {
        return fromOpportunityCode;
      }
    }
  }

  if (originLabel && originLabel.toLowerCase().startsWith('cliente ')) {
    const normalized = originLabel.slice('Cliente '.length).trim();
    return normalized || null;
  }

  return null;
}

function getVisitRequestDisplayName(
  visitRequest: WfmVisitRequest,
  crmCustomerNames?: Record<string, string>,
): string {
  return getCrmCustomerName(visitRequest, crmCustomerNames) ?? visitRequest.title;
}

function getDispatchActionLabel(isDispatchOpen: boolean, needsDecision: boolean): string {
  if (needsDecision) {
    return 'Decidir';
  }
  return isDispatchOpen ? 'Continuar despacho' : 'Abrir despacho';
}

const statusOptions = Object.values(VisitRequestStatus).map((value) => ({
  value,
  label: getVisitRequestStatusLabel(value),
}));

const originOptions = Object.values(WorkOrderSourceContext).map((value) => ({
  value,
  label: getVisitRequestOriginLabel(value),
}));

const priorityOptions = Object.values(WorkOrderPriority).map((value) => ({
  value,
  label: getWorkOrderPriorityLabel(value),
}));

function VisitRequestDispatchButton({
  visitRequestId,
  displayName,
  isDispatchOpen,
  needsDecision,
  compact,
  onOpenDispatch,
  onDecideExhaustedAttempts,
}: {
  visitRequestId: string;
  displayName: string;
  isDispatchOpen: boolean;
  needsDecision: boolean;
  compact?: boolean;
  onOpenDispatch: (visitRequestId: string) => void;
  onDecideExhaustedAttempts?: (visitRequestId: string) => void;
}) {
  const label = getDispatchActionLabel(isDispatchOpen, needsDecision);

  return (
    <Button
      type="button"
      variant={needsDecision ? 'primary' : isDispatchOpen ? 'primary' : 'secondary'}
      className={compact ? 'w-full' : undefined}
      aria-label={`${label} para ${displayName}`}
      onClick={(event) => {
        event.stopPropagation();
        if (needsDecision && onDecideExhaustedAttempts) {
          onDecideExhaustedAttempts(visitRequestId);
          return;
        }
        onOpenDispatch(visitRequestId);
      }}
    >
      <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

function VisitRequestRow({
  visitRequest,
  isSelected,
  isDispatchOpen,
  onOpenDispatch,
  onDecideExhaustedAttempts,
  compact,
  crmCustomerNames,
}: {
  visitRequest: WfmVisitRequest;
  isSelected: boolean;
  isDispatchOpen: boolean;
  onOpenDispatch: (visitRequestId: string) => void;
  onDecideExhaustedAttempts?: (visitRequestId: string) => void;
  compact?: boolean;
  crmCustomerNames?: Record<string, string>;
}) {
  const presentationStatus = getVisitRequestPresentationStatus(visitRequest);
  const displayName = getVisitRequestDisplayName(visitRequest, crmCustomerNames);
  const retryChip = getVisitRequestRetryChip(visitRequest);
  const isExhausted = hasExhaustedRetries(visitRequest);
  const needsDecision = requiresAttemptDecision(visitRequest);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => {
        if (needsDecision && onDecideExhaustedAttempts) {
          onDecideExhaustedAttempts(visitRequest.id);
          return;
        }
        onOpenDispatch(visitRequest.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (needsDecision && onDecideExhaustedAttempts) {
            onDecideExhaustedAttempts(visitRequest.id);
            return;
          }
          onOpenDispatch(visitRequest.id);
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-2xl border text-left transition-colors',
        compact ? 'px-3 py-3' : 'px-4 py-4',
        isSelected
          ? 'border-iwana-primary bg-iwana-primary-50/60 dark:border-iwana-primary-300 dark:bg-iwana-primary-900/15'
          : 'border-gray-200 bg-white hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3',
        interactiveFocusClassName,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {displayName}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {getVisitRequestReferenceLabel(visitRequest)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {retryChip && (
            <Badge variant={retryChip.variant} aria-label={retryChip.accessibleText}>
              {retryChip.label}
            </Badge>
          )}
          <Badge variant={getVisitRequestStatusVariant(presentationStatus)}>
            {getVisitRequestStatusLabel(presentationStatus)}
          </Badge>
        </div>
      </div>

      {isExhausted && (
        <div className={`${compact ? 'mt-2' : 'mt-3'}`}>
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-100">
            <p className="font-medium">Se alcanzó el límite de intentos</p>
            <p className="mt-0.5">
              No se pudo hacer la visita en tres oportunidades. Requiere decisión del coordinador.
            </p>
          </div>
        </div>
      )}

      <div className={`${compact ? 'mt-2' : 'mt-3'} flex flex-wrap gap-2`}>
        <Badge variant="neutral">{getVisitRequestOriginLabel(visitRequest.originContext)}</Badge>
        <Badge variant={getWorkOrderPriorityVariant(visitRequest.priority)}>
          {getWorkOrderPriorityLabel(visitRequest.priority)}
        </Badge>
        <Badge variant="info">{getWfmWorkTypeLabel(visitRequest.workType)}</Badge>
      </div>

      <div
        className={`${compact ? 'mt-2' : 'mt-3'} grid gap-1 text-xs text-gray-500 dark:text-gray-400`}
      >
        <p>{formatVisitRequestTerritory(visitRequest.municipality, visitRequest.sector)}</p>
        <p>
          {visitRequest.slaDueAt
            ? `Tiempo comprometido ${formatWfmDateTime(visitRequest.slaDueAt)}`
            : `Creada ${formatWfmDateTime(visitRequest.createdAt)}`}
        </p>
      </div>

      <div
        className={`${compact ? 'mt-2' : 'mt-3'} flex justify-end`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <VisitRequestDispatchButton
          visitRequestId={visitRequest.id}
          displayName={displayName}
          isDispatchOpen={isDispatchOpen}
          needsDecision={needsDecision}
          {...(compact ? { compact: true } : {})}
          onOpenDispatch={onOpenDispatch}
          {...(onDecideExhaustedAttempts ? { onDecideExhaustedAttempts } : {})}
        />
      </div>
    </article>
  );
}

function toTerritoryOptions(
  options: WfmVisitRequestFilterOptionsResponse | null,
  key: 'municipalities' | 'sectors',
) {
  const optionsByValue = new Map<string, { label: string; count: number }>();

  for (const option of options?.[key] ?? []) {
    const label =
      option.label === 'Sin dato'
        ? key === 'municipalities'
          ? 'Sin municipio'
          : 'Sin sector'
        : option.label;
    const current = optionsByValue.get(option.value);

    if (current) {
      current.count += option.count;
      continue;
    }

    optionsByValue.set(option.value, { label, count: option.count });
  }

  return Array.from(optionsByValue, ([value, option]) => ({
    value,
    label: `${option.label} (${option.count})`,
  }));
}

export function PendingVisitRequestInbox({
  filters,
  response,
  crmCustomerNames,
  selectedVisitRequestId,
  openDispatchVisitRequestId = null,
  filterOptions,
  isLoading,
  isLoadingMore = false,
  isLoadingFilterOptions,
  onFiltersChange,
  onLoadMore,
  onOpenDispatch,
  onDecideExhaustedAttempts,
  onRefresh,
  extraActions,
  compactMode = false,
  maxItems = 5,
  onOpenFullInbox,
}: PendingVisitRequestInboxProps) {
  const pathname = usePathname();
  const pendingActive = pathname.startsWith('/dashboard/scheduling/pending-visits');
  const agendaActive = pathname.startsWith('/dashboard/scheduling/agenda');
  const unrealizedActive = pathname.startsWith('/dashboard/scheduling/unrealized-visits');
  const items = response?.items ?? [];
  const meta = response?.meta;
  const visibleItems = compactMode ? items.slice(0, maxItems) : items;
  const hasMore =
    !compactMode && meta != null && meta.page < meta.totalPages && Boolean(onLoadMore);
  const resultsLabel =
    meta == null
      ? `${items.length} solicitudes`
      : hasMore
        ? `${items.length} de ${meta.total} solicitudes`
        : `${meta.total} ${meta.total === 1 ? 'solicitud' : 'solicitudes'}`;
  const panelTitle = compactMode ? 'Decisiones pendientes' : 'Pendiente por agendar';
  const panelDescription = compactMode
    ? 'Solicitudes que ya exigen decisión operativa sin abrir todavía la bandeja completa.'
    : 'Elige una solicitud o usa Abrir despacho en cada fila para calcular franjas o enviarla a agenda.';
  const emptyCopy = {
    title: 'No hay solicitudes en esta vista',
    description:
      'Ajusta los filtros o espera nuevas solicitudes desde oportunidades, mesa de ayuda o flujos manuales.',
  };
  const municipalityOptions = toTerritoryOptions(filterOptions, 'municipalities');
  const sectorOptions = toTerritoryOptions(filterOptions, 'sectors');
  const hasActiveFilters = Boolean(
    filters.status ||
    filters.originContext ||
    filters.priority ||
    filters.municipality ||
    filters.sector,
  );
  const compactInboxLink =
    compactMode && onOpenFullInbox ? (
      <button type="button" onClick={onOpenFullInbox} className={portalInlineTextLinkClassName}>
        Ver bandeja completa
      </button>
    ) : null;
  const panelActions =
    extraActions || compactInboxLink ? (
      <>
        {extraActions}
        {compactInboxLink}
      </>
    ) : undefined;

  return (
    <PortalPanel
      eyebrow="Bandeja"
      title={panelTitle}
      description={panelDescription}
      actions={panelActions}
      className="h-full"
      contentClassName={compactMode ? 'space-y-3' : 'space-y-4'}
    >
      {compactMode ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            className="min-h-11"
            onClick={onRefresh}
            loading={isLoading}
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </Button>
        </div>
      ) : null}

      {!compactMode ? (
        <div
          role="tablist"
          aria-label="Vistas de programación"
          className="flex gap-1 border-b border-gray-100 dark:border-dark-border"
        >
          <Link
            href="/dashboard/scheduling/pending-visits"
            role="tab"
            aria-selected={pendingActive}
            className={schedulingShortcutClassName(pendingActive)}
            aria-current={pendingActive ? 'page' : undefined}
          >
            <ClipboardList
              className={schedulingShortcutIconClassName(pendingActive)}
              aria-hidden="true"
            />
            <span>Pendientes</span>
          </Link>
          <Link
            href="/dashboard/scheduling/agenda"
            role="tab"
            aria-selected={agendaActive}
            className={schedulingShortcutClassName(agendaActive)}
            aria-current={agendaActive ? 'page' : undefined}
          >
            <CalendarDays
              className={schedulingShortcutIconClassName(agendaActive)}
              aria-hidden="true"
            />
            <span>Ir a agenda</span>
          </Link>
          <Link
            href="/dashboard/scheduling/unrealized-visits"
            role="tab"
            aria-selected={unrealizedActive}
            className={schedulingShortcutClassName(unrealizedActive)}
            aria-current={unrealizedActive ? 'page' : undefined}
          >
            <CalendarX2
              className={schedulingShortcutIconClassName(unrealizedActive)}
              aria-hidden="true"
            />
            <span>Visitas sin realizar</span>
          </Link>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className={schedulingShortcutClassName(false)}
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCcw className={schedulingShortcutIconClassName(false)} aria-hidden="true" />
            <span>{isLoading ? 'Actualizando…' : 'Actualizar'}</span>
          </button>
        </div>
      ) : null}

      {!compactMode && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[repeat(5,minmax(0,1fr))_auto] 2xl:items-end">
          <Select
            id="pending-visits-status-filter"
            label="Estado"
            value={filters.status}
            placeholder="Todos"
            options={statusOptions}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.target.value as PendingVisitFilters['status'],
                page: 1,
              })
            }
          />
          <Select
            id="pending-visits-origin-filter"
            label="Origen"
            value={filters.originContext}
            placeholder="Todos"
            options={originOptions}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                originContext: event.target.value as PendingVisitFilters['originContext'],
                page: 1,
              })
            }
          />
          <Select
            id="pending-visits-priority-filter"
            label="Prioridad"
            value={filters.priority}
            placeholder="Todas"
            options={priorityOptions}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                priority: event.target.value as PendingVisitFilters['priority'],
                page: 1,
              })
            }
          />
          <Select
            id="pending-visits-municipality-filter"
            label="Municipio"
            value={filters.municipality}
            placeholder={isLoadingFilterOptions ? 'Cargando...' : 'Todos'}
            options={municipalityOptions}
            onChange={(event) =>
              onFiltersChange({ ...filters, municipality: event.target.value, sector: '', page: 1 })
            }
          />
          <Select
            id="pending-visits-sector-filter"
            label="Sector"
            value={filters.sector}
            placeholder={isLoadingFilterOptions ? 'Cargando...' : 'Todos'}
            options={sectorOptions}
            onChange={(event) =>
              onFiltersChange({ ...filters, sector: event.target.value, page: 1 })
            }
          />
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={() =>
                onFiltersChange({
                  ...buildDefaultPendingVisitFilters(),
                  limit: filters.limit,
                })
              }
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      )}

      {!compactMode && items.length > 0 ? (
        <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />
      ) : (
        <div
          className={`flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 ${
            compactMode ? 'pt-0.5' : ''
          }`}
        >
          <span>
            {meta
              ? compactMode
                ? `${meta.total} pendientes · mostrando ${Math.min(visibleItems.length, maxItems)}`
                : resultsLabel
              : 'Sin datos cargados'}
          </span>
        </div>
      )}

      {visibleItems.length === 0 ? (
        compactMode ? (
          <PortalEmptyState
            title={emptyCopy.title}
            description={emptyCopy.description}
            icon={CircleDashed}
            className="w-full text-left"
          />
        ) : (
          <div>
            <div className={`${portalDataTableShellClassName} hidden lg:block`}>
              <div className="overflow-x-auto">
                <table
                  className="min-w-[1080px] w-full text-sm"
                  aria-label="Solicitudes pendientes"
                >
                  <thead className={portalDataTableHeadRowClassName}>
                    <tr>
                      <PortalDataTableHead className="align-middle">Prioridad</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Estado</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Origen</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Solicitud</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Municipio</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">
                        Tiempo comprometido
                      </PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Acción</PortalDataTableHead>
                    </tr>
                  </thead>
                  <tbody className={portalDataTableBodyClassName}>
                    <tr>
                      <td colSpan={7} className={cn(portalDataTableCellClassName, 'py-12')}>
                        <PortalEmptyState
                          title={emptyCopy.title}
                          description={emptyCopy.description}
                          icon={CircleDashed}
                          className="w-full text-left"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="lg:hidden">
              <PortalEmptyState
                title={emptyCopy.title}
                description={emptyCopy.description}
                icon={CircleDashed}
                className="w-full text-left"
              />
            </div>
          </div>
        )
      ) : compactMode ? (
        <div className="grid gap-2">
          {visibleItems.map((visitRequest) => (
            <VisitRequestRow
              key={visitRequest.id}
              visitRequest={visitRequest}
              isSelected={visitRequest.id === selectedVisitRequestId}
              isDispatchOpen={visitRequest.id === openDispatchVisitRequestId}
              onOpenDispatch={onOpenDispatch}
              {...(onDecideExhaustedAttempts ? { onDecideExhaustedAttempts } : {})}
              {...(crmCustomerNames ? { crmCustomerNames } : {})}
              compact
            />
          ))}
        </div>
      ) : (
        <div>
          <div className={`${portalDataTableShellClassName} hidden lg:block`}>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] w-full text-sm">
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    <PortalDataTableHead className="align-middle">Prioridad</PortalDataTableHead>
                    <PortalDataTableHead className="align-middle">Estado</PortalDataTableHead>
                    <PortalDataTableHead className="align-middle">Origen</PortalDataTableHead>
                    <PortalDataTableHead className="align-middle">Solicitud</PortalDataTableHead>
                    <PortalDataTableHead className="align-middle">Municipio</PortalDataTableHead>
                    <PortalDataTableHead className="align-middle">
                      Tiempo comprometido
                    </PortalDataTableHead>
                    <PortalDataTableHead className="align-middle">Acción</PortalDataTableHead>
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {visibleItems.map((visitRequest) => {
                    const presentationStatus = getVisitRequestPresentationStatus(visitRequest);
                    const displayName = getVisitRequestDisplayName(visitRequest, crmCustomerNames);
                    const isSelected = visitRequest.id === selectedVisitRequestId;
                    const isDispatchOpen = visitRequest.id === openDispatchVisitRequestId;
                    const retryChip = getVisitRequestRetryChip(visitRequest);
                    const isExhausted = hasExhaustedRetries(visitRequest);
                    const needsDecision = requiresAttemptDecision(visitRequest);

                    return (
                      <tr
                        key={visitRequest.id}
                        className={cn(
                          'cursor-pointer',
                          portalTableRowHoverClassName,
                          isSelected && 'bg-iwana-primary-50/70 dark:bg-iwana-primary-900/15',
                        )}
                        onClick={() => {
                          if (needsDecision && onDecideExhaustedAttempts) {
                            onDecideExhaustedAttempts(visitRequest.id);
                            return;
                          }
                          onOpenDispatch(visitRequest.id);
                        }}
                      >
                        <td className={portalDataTableCellClassName}>
                          <Badge variant={getWorkOrderPriorityVariant(visitRequest.priority)}>
                            {getWorkOrderPriorityLabel(visitRequest.priority)}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {retryChip && (
                              <Badge
                                variant={retryChip.variant}
                                aria-label={retryChip.accessibleText}
                              >
                                {retryChip.label}
                              </Badge>
                            )}
                            <Badge variant={getVisitRequestStatusVariant(presentationStatus)}>
                              {getVisitRequestStatusLabel(presentationStatus)}
                            </Badge>
                          </div>
                          {isExhausted && (
                            <p className="mt-1.5 text-xs text-red-600 dark:text-red-300">
                              Se alcanzó el límite de intentos. Requiere decisión del coordinador.
                            </p>
                          )}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge variant="neutral">
                            {getVisitRequestOriginLabel(visitRequest.originContext)}
                          </Badge>
                        </td>
                        <td className={`${portalDataTableCellClassName} max-w-[280px]`}>
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-gray-900 dark:text-white">
                              {displayName}
                            </span>
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                              {getVisitRequestReferenceLabel(visitRequest)} ·{' '}
                              {getWfmWorkTypeLabel(visitRequest.workType)}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`${portalDataTableCellClassName} text-sm text-gray-600 dark:text-gray-300`}
                        >
                          {formatVisitRequestTerritory(
                            visitRequest.municipality,
                            visitRequest.sector,
                          )}
                        </td>
                        <td
                          className={`${portalDataTableCellClassName} text-xs text-gray-500 dark:text-gray-400`}
                        >
                          {visitRequest.slaDueAt
                            ? formatWfmDateTime(visitRequest.slaDueAt)
                            : formatWfmDateTime(visitRequest.createdAt)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <VisitRequestDispatchButton
                            visitRequestId={visitRequest.id}
                            displayName={displayName}
                            isDispatchOpen={isDispatchOpen}
                            needsDecision={needsDecision}
                            onOpenDispatch={onOpenDispatch}
                            {...(onDecideExhaustedAttempts ? { onDecideExhaustedAttempts } : {})}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 lg:hidden">
            {visibleItems.map((visitRequest) => (
              <VisitRequestRow
                key={visitRequest.id}
                visitRequest={visitRequest}
                isSelected={visitRequest.id === selectedVisitRequestId}
                isDispatchOpen={visitRequest.id === openDispatchVisitRequestId}
                onOpenDispatch={onOpenDispatch}
                {...(crmCustomerNames ? { crmCustomerNames } : {})}
              />
            ))}
          </div>
        </div>
      )}

      {!compactMode ? (
        <PortalTablePagination
          hasMore={hasMore}
          onLoadMore={() => onLoadMore?.()}
          loading={isLoadingMore}
          resourceLabel="solicitudes"
          shown={items.length}
          total={meta?.total}
        />
      ) : null}
    </PortalPanel>
  );
}
