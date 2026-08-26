'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CircleDashed, Search } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import { ScheduleEventStatus, VisitRequestStatus, WfmWorkType } from '@iwana/shared';
import type {
  InternalUser,
  NonRealizationCause,
  ReviewNonRealizationDecision,
  WfmScheduleEvent,
  WfmVisitRequest,
} from '@/lib/api-client';
import { ApiError, wfmApi } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalResultsStrip,
  PortalSkeletonBlock,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatWfmDateRange,
  formatWfmDateTime,
  getTechnicianDisplayName,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
} from './scheduling-ui';
import {
  getVisitRequestReferenceLabel,
  getVisitRequestRetryChip,
  requiresAttemptDecision,
} from './pending-visits-ui';
import { ExhaustedAttemptsDecisionDialog } from './ExhaustedAttemptsDecisionDialog';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type ReviewAction = 'RESCHEDULE' | 'CLOSE_CASE' | 'RECLASSIFY';

interface UnrealizedItem {
  type: 'visit_request' | 'event';
  id: string;
  title: string;
  reference: string;
  workType: WfmWorkType;
  status: VisitRequestStatus | ScheduleEventStatus;
  date: string;
  endDate?: string;
  technicianId: string;
  causeLabel: string | null;
  causeId: string | null;
  isClassified: boolean;
  retryCount: number;
  visitRequestId: string | null;
  scheduleEventId: string | null;
  visitRequest: WfmVisitRequest | null;
}

interface ReviewDialogState {
  item: UnrealizedItem;
  action: ReviewAction;
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403) return 'Tu rol actual no puede revisar visitas sin realizar.';
    return error.message;
  }
  return 'No fue posible cargar la vista de visitas sin realizar.';
}

function toUnrealizedItem(visitRequest: WfmVisitRequest): UnrealizedItem {
  return {
    type: 'visit_request',
    id: visitRequest.id,
    title: visitRequest.title,
    reference: getVisitRequestReferenceLabel(visitRequest),
    workType: visitRequest.workType,
    status: visitRequest.status,
    date: visitRequest.createdAt,
    technicianId: visitRequest.scheduledByUserId ?? '',
    causeLabel: visitRequest.lastNonRealizationCauseLabel ?? null,
    causeId: visitRequest.nonRealizationCauseId ?? null,
    isClassified: Boolean(visitRequest.nonRealizationCauseId),
    retryCount: visitRequest.retryCount ?? 0,
    visitRequestId: visitRequest.id,
    scheduleEventId: visitRequest.scheduleEventId,
    visitRequest,
  };
}

function toUnrealizedEventItem(event: WfmScheduleEvent): UnrealizedItem {
  return {
    type: 'event',
    id: event.id,
    title: event.title,
    reference: `Evento ${event.id.slice(0, 8)}`,
    workType: event.type,
    status: event.status,
    date: event.scheduledStartAt ?? event.createdAt,
    endDate: event.scheduledEndAt ?? undefined,
    technicianId: event.assignedUserId,
    causeLabel: null,
    causeId: event.nonRealizationCauseId ?? null,
    isClassified: Boolean(event.nonRealizationCauseId || event.reviewedCauseId),
    retryCount: 0,
    visitRequestId: null,
    scheduleEventId: event.id,
    visitRequest: null,
  };
}

function reviewActionTitle(action: ReviewAction): string {
  if (action === 'RESCHEDULE') return 'Reprogramar visita';
  if (action === 'CLOSE_CASE') return 'Cerrar el caso';
  return 'Reclasificar causa';
}

function reviewActionDescription(action: ReviewAction): string {
  if (action === 'RESCHEDULE') {
    return 'Confirma o ajusta la causa y devuelve el trabajo a la bandeja para despacho.';
  }
  if (action === 'CLOSE_CASE') {
    return 'Confirma la causa y cierra la solicitud. Debes dejar una nota con el motivo.';
  }
  return 'Cambia la causa autoritativa. Se conserva lo que reportó el técnico.';
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function UnrealizedVisitsView() {
  const [items, setItems] = useState<UnrealizedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filterCauseId, setFilterCauseId] = useState('');
  const [filterTechnician, setFilterTechnician] = useState('');
  const [page, setPage] = useState(1);
  const [nonRealizationCauses, setNonRealizationCauses] = useState<NonRealizationCause[]>([]);
  const [techniciansById, setTechniciansById] = useState<Map<string, InternalUser>>(new Map());
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogState | null>(null);
  const [selectedCauseId, setSelectedCauseId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [exhaustedDecisionItem, setExhaustedDecisionItem] = useState<UnrealizedItem | null>(null);
  const [isExhaustedDecisionOpen, setIsExhaustedDecisionOpen] = useState(false);
  const [exhaustedDecisionError, setExhaustedDecisionError] = useState<string | null>(null);
  const [isExhaustedDecisionSubmitting, setIsExhaustedDecisionSubmitting] = useState(false);
  const limit = 20;

  const causeOptions = useMemo(
    () => [
      { value: '', label: 'Todas las causas' },
      ...nonRealizationCauses.map((c) => ({ value: c.id, label: c.label })),
    ],
    [nonRealizationCauses],
  );

  const reviewCauseOptions = useMemo(
    () => nonRealizationCauses.map((c) => ({ value: c.id, label: c.label })),
    [nonRealizationCauses],
  );

  const technicianOptions = useMemo(
    () => [
      { value: '', label: 'Todos los técnicos' },
      ...Array.from(techniciansById.values()).map((t) => ({
        value: t.id,
        label: getTechnicianDisplayName(t),
      })),
    ],
    [techniciansById],
  );

  const loadBootstrap = useCallback(async () => {
    setIsBootstrapping(true);
    try {
      const [causes, assignees] = await Promise.all([
        wfmApi.nonRealizationCauses.list(),
        wfmApi.eligibleAssignees.list(),
      ]);
      setNonRealizationCauses(causes);
      setTechniciansById(new Map(assignees.map((user) => [user.id, user])));
    } catch (bootstrapError) {
      setError(mapLoadError(bootstrapError));
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const visitRequestsResponse = await wfmApi.visitRequests.list({
        status: VisitRequestStatus.REQUIRES_RESCHEDULE,
        page: 1,
        limit: 100,
      });

      const noShowEvents = await wfmApi.events.list({
        status: ScheduleEventStatus.NO_SHOW,
        page: 1,
        limit: 100,
      });

      const expiredEvents = await wfmApi.events.list({
        status: ScheduleEventStatus.EXPIRED,
        page: 1,
        limit: 100,
      });

      const allItems: UnrealizedItem[] = [
        ...visitRequestsResponse.items.map(toUnrealizedItem),
        ...noShowEvents.data.map(toUnrealizedEventItem),
        ...expiredEvents.data.map(toUnrealizedEventItem),
      ];

      let filtered = allItems;
      if (filterCauseId) {
        filtered = filtered.filter((item) => item.causeId === filterCauseId);
      }

      if (filterTechnician) {
        filtered = filtered.filter((item) => item.technicianId === filterTechnician);
      }

      const totalCount = filtered.length;
      const start = (page - 1) * limit;
      const paged = filtered.slice(start, start + limit);

      setItems(paged);
      setTotal(totalCount);
      setHasMore(start + limit < totalCount);
    } catch (loadError) {
      setError(mapLoadError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [filterCauseId, filterTechnician, page]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }
    void loadItems();
  }, [isBootstrapping, loadItems]);

  function openReview(item: UnrealizedItem, action: ReviewAction) {
    if (
      action === 'RESCHEDULE' &&
      item.visitRequest &&
      requiresAttemptDecision(item.visitRequest)
    ) {
      setExhaustedDecisionItem(item);
      setExhaustedDecisionError(null);
      setIsExhaustedDecisionOpen(true);
      return;
    }

    setReviewDialog({ item, action });
    setSelectedCauseId(item.causeId ?? '');
    setReviewNotes('');
    setReviewError(null);
  }

  async function submitReview() {
    if (!reviewDialog) {
      return;
    }

    const { item, action } = reviewDialog;
    const eventId = item.scheduleEventId;
    if (!eventId && action !== 'CLOSE_CASE') {
      setReviewError('No hay evento vinculado para revisar la causa.');
      return;
    }

    if (!selectedCauseId) {
      setReviewError('Elige una causa antes de continuar.');
      return;
    }

    if (action === 'CLOSE_CASE' && !reviewNotes.trim()) {
      setReviewError('Indica el motivo del cierre para continuar.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const decision: ReviewNonRealizationDecision | null =
        action === 'RESCHEDULE' ? 'RESCHEDULE' : action === 'CLOSE_CASE' ? 'CLOSE_CASE' : null;

      if (eventId) {
        await wfmApi.events.reviewCause(eventId, {
          nonRealizationCauseId: selectedCauseId,
          notes: reviewNotes.trim() || null,
          ...(decision ? { decision } : {}),
        });
      }

      if (action === 'CLOSE_CASE' && item.visitRequestId) {
        await wfmApi.visitRequests.cancel(item.visitRequestId, {
          cancelReason: reviewNotes.trim(),
        });
      }

      const successMessage =
        action === 'RESCHEDULE'
          ? `La visita ${item.title} quedó lista para reprogramar.`
          : action === 'CLOSE_CASE'
            ? `El caso de ${item.title} quedó cerrado.`
            : `Se reclasificó la causa de ${item.title}.`;

      setFeedback(successMessage);
      setReviewDialog(null);
      await loadItems();
    } catch (submitError) {
      setReviewError(mapLoadError(submitError));
    } finally {
      setIsSubmittingReview(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitas sin realizar"
        subtitle="Trabajo agendado que no se ejecutó. Revisa la causa y decide si se reprograma o se cierra."
      />

      {feedback ? (
        <PortalAlert variant="success" title="Operación aplicada" description={feedback} />
      ) : null}

      <PortalPanel className="overflow-hidden p-0" contentClassName="p-0">
        <div className="grid gap-3 px-5 py-3 sm:grid-cols-2 xl:grid-cols-[repeat(2,minmax(0,1fr))_auto] xl:items-end">
          <Select
            id="unrealized-cause-filter"
            label="Causa"
            value={filterCauseId}
            placeholder="Todas las causas"
            options={causeOptions}
            onChange={(e) => {
              setFilterCauseId(e.target.value);
              setPage(1);
            }}
          />
          <Select
            id="unrealized-technician-filter"
            label="Técnico"
            value={filterTechnician}
            placeholder="Todos los técnicos"
            options={technicianOptions}
            onChange={(e) => {
              setFilterTechnician(e.target.value);
              setPage(1);
            }}
          />
          <Button asChild variant="primary">
            <Link href="/dashboard/scheduling/pending-visits">Ir a pendientes</Link>
          </Button>
        </div>

        <div className="space-y-4 px-5 pb-5">
          {items.length > 0 && (
            <PortalResultsStrip
              badge={<Badge variant="neutral">{total} visitas sin realizar</Badge>}
            />
          )}

          {error && !isLoading && !isBootstrapping && (
            <PortalAlert
              variant="error"
              title="No fue posible cargar la vista"
              description={error}
              icon={AlertTriangle}
              action={
                <Button
                  type="button"
                  onClick={() => {
                    void loadBootstrap();
                    void loadItems();
                  }}
                >
                  Reintentar
                </Button>
              }
            />
          )}

          {(isLoading || isBootstrapping) && <PortalSkeletonBlock className="h-[400px]" />}

          {!isLoading && !isBootstrapping && !error && (
            <div className={portalDataTableShellClassName}>
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-sm" aria-label="Visitas sin realizar">
                  <thead className={portalDataTableHeadRowClassName}>
                    <tr>
                      <PortalDataTableHead className="align-middle">Trabajo</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Tipo</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Fecha</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Técnico</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Causa</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Intento</PortalDataTableHead>
                      <PortalDataTableHead className="align-middle">Acción</PortalDataTableHead>
                    </tr>
                  </thead>
                  <tbody className={portalDataTableBodyClassName}>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={`${portalDataTableCellClassName} py-12`}>
                          <PortalEmptyState
                            title="No hay visitas sin realizar"
                            description={
                              filterCauseId || filterTechnician
                                ? 'Ninguna visita coincide con los filtros actuales.'
                                : 'Todo el trabajo agendado se ejecutó o está en curso.'
                            }
                            icon={CircleDashed}
                            className="w-full text-left"
                          />
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const technician = techniciansById.get(item.technicianId);
                        const technicianDisplay = technician
                          ? getTechnicianDisplayName(technician)
                          : 'No disponible';
                        const retryChip =
                          item.visitRequest != null
                            ? getVisitRequestRetryChip(item.visitRequest)
                            : null;

                        return (
                          <tr
                            key={`${item.type}:${item.id}`}
                            className={portalTableRowHoverClassName}
                          >
                            <td className={`${portalDataTableCellClassName} max-w-[240px]`}>
                              <span className="block truncate font-medium text-gray-900 dark:text-white">
                                {item.title}
                              </span>
                              <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                {item.reference}
                              </span>
                            </td>
                            <td className={portalDataTableCellClassName}>
                              <Badge variant={getWfmWorkTypeVariant(item.workType)}>
                                {getWfmWorkTypeLabel(item.workType)}
                              </Badge>
                            </td>
                            <td
                              className={`${portalDataTableCellClassName} text-xs text-gray-600 dark:text-gray-300`}
                            >
                              {item.endDate
                                ? formatWfmDateRange(item.date, item.endDate)
                                : formatWfmDateTime(item.date)}
                            </td>
                            <td
                              className={`${portalDataTableCellClassName} text-sm text-gray-600 dark:text-gray-300`}
                            >
                              {technicianDisplay}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {item.causeLabel ? (
                                <Badge variant="warning">{item.causeLabel}</Badge>
                              ) : !item.isClassified ? (
                                <Badge
                                  variant="error"
                                  aria-label="La franja venció y no se registró el cierre. Confirma qué pasó antes de decidir."
                                >
                                  Sin reporte
                                </Badge>
                              ) : (
                                <Badge variant="neutral">Sin causa</Badge>
                              )}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {retryChip ? (
                                <Badge
                                  variant={retryChip.variant}
                                  aria-label={retryChip.accessibleText}
                                >
                                  {retryChip.label}
                                </Badge>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  aria-label={`Reprogramar ${item.title}`}
                                  onClick={() => openReview(item, 'RESCHEDULE')}
                                >
                                  Reprogramar
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  aria-label={`Cerrar el caso de ${item.title}`}
                                  onClick={() => openReview(item, 'CLOSE_CASE')}
                                >
                                  Cerrar el caso
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Reclasificar ${item.title}`}
                                  onClick={() => openReview(item, 'RECLASSIFY')}
                                >
                                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                                  Reclasificar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <PortalTablePagination
            hasMore={hasMore}
            onLoadMore={() => setPage((p) => p + 1)}
            loading={isLoading}
            resourceLabel="visitas"
            shown={items.length}
            total={total}
          />
        </div>
      </PortalPanel>

      <Dialog
        open={reviewDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setReviewDialog(null);
            setReviewError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {reviewDialog ? (
            <>
              <DialogHeader>
                <DialogTitle>{reviewActionTitle(reviewDialog.action)}</DialogTitle>
                <DialogDescription>
                  {reviewActionDescription(reviewDialog.action)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {reviewDialog.item.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {reviewDialog.item.reference}
                  </p>
                </div>

                <Select
                  id="unrealized-review-cause"
                  label="Causa confirmada"
                  value={selectedCauseId}
                  placeholder="Elige una causa"
                  options={reviewCauseOptions}
                  onChange={(e) => setSelectedCauseId(e.target.value)}
                />

                <div className="space-y-2">
                  <label
                    htmlFor="unrealized-review-notes"
                    className="text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    {reviewDialog.action === 'CLOSE_CASE'
                      ? 'Motivo del cierre'
                      : 'Notas del coordinador'}
                  </label>
                  <textarea
                    id="unrealized-review-notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={
                      reviewDialog.action === 'CLOSE_CASE'
                        ? 'Indica por qué se cierra el caso'
                        : 'Opcional'
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-2 dark:text-white"
                  />
                </div>

                {reviewError ? (
                  <PortalAlert
                    variant="error"
                    title="No fue posible aplicar la acción"
                    description={reviewError}
                  />
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSubmittingReview}
                    onClick={() => setReviewDialog(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmittingReview}
                    onClick={() => void submitReview()}
                  >
                    {isSubmittingReview ? 'Aplicando…' : 'Confirmar'}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ExhaustedAttemptsDecisionDialog
        open={isExhaustedDecisionOpen}
        visitRequest={exhaustedDecisionItem?.visitRequest ?? null}
        error={exhaustedDecisionError}
        isSubmitting={isExhaustedDecisionSubmitting}
        onOpenChange={(open) => {
          setIsExhaustedDecisionOpen(open);
          if (!open) {
            setExhaustedDecisionError(null);
            setExhaustedDecisionItem(null);
          }
        }}
        onConfirm={async (decision, closeReason) => {
          const item = exhaustedDecisionItem;
          if (!item?.visitRequest) {
            return;
          }

          setIsExhaustedDecisionSubmitting(true);
          setExhaustedDecisionError(null);

          try {
            if (decision === 'CLOSE_CASE') {
              const reason = closeReason?.trim();
              if (!reason) {
                setExhaustedDecisionError('Indica el motivo del cierre para continuar.');
                return;
              }
              if (item.scheduleEventId && item.causeId) {
                await wfmApi.events.reviewCause(item.scheduleEventId, {
                  nonRealizationCauseId: item.causeId,
                  notes: reason,
                  decision: 'CLOSE_CASE',
                });
              }
              await wfmApi.visitRequests.cancel(item.visitRequest.id, {
                cancelReason: reason,
              });
              setFeedback(`El caso de ${item.title} quedó cerrado.`);
              setIsExhaustedDecisionOpen(false);
              setExhaustedDecisionItem(null);
              await loadItems();
              return;
            }

            setIsExhaustedDecisionOpen(false);
            setReviewDialog({ item, action: 'RESCHEDULE' });
            setSelectedCauseId(item.causeId ?? '');
            setReviewNotes('');
            setReviewError(null);
            setFeedback('Decisión registrada: confirma la causa para reprogramar de todas formas.');
          } catch (decisionError) {
            setExhaustedDecisionError(mapLoadError(decisionError));
          } finally {
            setIsExhaustedDecisionSubmitting(false);
          }
        }}
      />
    </div>
  );
}
