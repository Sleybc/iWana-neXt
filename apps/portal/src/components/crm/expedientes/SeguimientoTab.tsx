'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { ArrowRightLeft, PhoneOutgoing, TrendingUp, User, UserCheck } from 'lucide-react';
import {
  commercialApi,
  crmApi,
  usersApi,
  mapPickerSearchResponse,
  type CreateContactAttemptDto,
  type CreateAttributionDto,
  type ExpedienteDetailAttributionSummary,
  type ExpedienteDetailSummary,
  type ExpedienteOperationalMetadata,
  type ResponsibilitySnapshot,
} from '@/lib/api-client';
import { SearchablePicker, type SearchablePickerItem } from '@/components/shared/SearchablePicker';
import { getPortalUserRoleLabel } from '@/lib/user-labels';
import {
  getCachedExpedienteResource,
  getCachedExpedienteTimelinePage,
  invalidateExpedienteTimelineCache,
  resolveExpedienteCacheScope,
} from './expediente-detail-cache';
import { getSafeCrmErrorMessage } from './crm-error-message';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  EXPEDIENTE_STATUS_META,
  formatAcquisitionChannel,
  formatCrmDateTime,
} from './expediente-ui';
import {
  ExpedienteTimelinePanel,
  TIMELINE_DEFAULT_PAGE_SIZE,
  TIMELINE_MAX_EVENTS,
  dedupeTimelineEvents,
  type TimelineEntry,
  type TimelineFilter,
  type TimelinePageSize,
  toTimelineEntry,
} from './ExpedienteTimelinePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivePanel = 'contact' | 'responsibility' | 'attribution' | null;

const CATALOG_LABEL_LOADING = 'Cargando…';
const CATALOG_PLAN_UNAVAILABLE = 'Plan no disponible';
const CATALOG_ITEM_UNAVAILABLE = 'No disponible';

function normalizeCatalogIds(ids: string[] | null | undefined): string[] {
  return (ids ?? []).map((id) => id.trim()).filter(Boolean);
}

function catalogLabelFromMap(
  id: string,
  labels: Record<string, string>,
  loading: boolean,
  fallback: string,
): string {
  return labels[id] ?? (loading ? CATALOG_LABEL_LOADING : fallback);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SeguimientoTabProps {
  expedienteId: string;
  tenantScope?: string;
  timelineRevision?: number;
  expediente: Pick<
    ExpedienteDetailSummary,
    'interestedPlanId' | 'additionalProductIds' | 'additionalServiceIds' | 'acquisitionChannel'
  >;
  canManageAttribution: boolean;
  originCreator: ExpedienteOperationalMetadata['createdBy'] | null;
  responsibility: ResponsibilitySnapshot | null;
  currentAttribution: ExpedienteDetailAttributionSummary | null;
  /** @deprecated El historial se obtiene desde el endpoint unificado paginado. */
  responsibilityHistory?: unknown[];
  /** @deprecated El historial se obtiene desde el endpoint unificado paginado. */
  attributionHistory?: unknown[];
  /** @deprecated El timeline se obtiene desde el endpoint unificado paginado. */
  recentActivity?: unknown[];
  /** @deprecated El timeline se obtiene desde el endpoint unificado paginado. */
  pipelineChanges?: unknown[];
  onSaved: () => Promise<void>;
}

// ─── Opciones ────────────────────────────────────────────────────────────────

const CHANNEL_OPTS = [
  { value: 'TELEFONO', label: 'Teléfono' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PRESENCIAL', label: 'Presencial' },
  { value: 'SMS', label: 'SMS' },
  { value: 'OTRO', label: 'Otro' },
] as const;

const RESULT_OPTS = [
  { value: 'EXITOSO', label: 'Exitoso' },
  { value: 'NO_CONTESTA', label: 'No contesta' },
  { value: 'BUZON', label: 'Buzón de voz' },
  { value: 'OCUPADO', label: 'Ocupado' },
  { value: 'NUMERO_INVALIDO', label: 'Número inválido' },
  { value: 'RECHAZADO', label: 'Rechazado' },
  { value: 'REPROGRAMADO', label: 'Reprogramado' },
] as const;

// ─── Componente principal ─────────────────────────────────────────────────────

export function SeguimientoTab({
  expedienteId,
  tenantScope,
  timelineRevision = 0,
  expediente,
  canManageAttribution,
  originCreator,
  responsibility,
  currentAttribution,
  onSaved,
}: SeguimientoTabProps) {
  const resolvedTenantScope = tenantScope ?? resolveExpedienteCacheScope();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');
  const [timelinePageSize, setTimelinePageSize] = useState<TimelinePageSize>(
    TIMELINE_DEFAULT_PAGE_SIZE,
  );
  const [timelinePage, setTimelinePage] = useState(1);
  const [planNameById, setPlanNameById] = useState<Record<string, string>>({});
  const [productNameById, setProductNameById] = useState<Record<string, string>>({});
  const [serviceNameById, setServiceNameById] = useState<Record<string, string>>({});
  const [catalogLabelsLoading, setCatalogLabelsLoading] = useState(() => {
    const hasPlan = Boolean(expediente.interestedPlanId?.trim());
    const hasProducts = (expediente.additionalProductIds?.length ?? 0) > 0;
    const hasServices = (expediente.additionalServiceIds?.length ?? 0) > 0;
    return hasPlan || hasProducts || hasServices;
  });

  const interestedPlanId = expediente.interestedPlanId?.trim() || null;
  const additionalProductIds = normalizeCatalogIds(expediente.additionalProductIds);
  const additionalServiceIds = normalizeCatalogIds(expediente.additionalServiceIds);
  const additionalProductIdsKey = additionalProductIds.join(',');
  const additionalServiceIdsKey = additionalServiceIds.join(',');

  const [responsibleSelectedItem, setResponsibleSelectedItem] = useState<Pick<
    SearchablePickerItem,
    'label' | 'sublabel'
  > | null>(null);
  const [actorSelectedItem, setActorSelectedItem] = useState<Pick<
    SearchablePickerItem,
    'label' | 'sublabel'
  > | null>(null);

  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineTotalPages, setTimelineTotalPages] = useState(1);
  const [loadingTimeline, setLoadingTimeline] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const timelineRequestGenerationRef = useRef(0);
  const lastTimelineRevisionRef = useRef(timelineRevision);

  const [contactForm, setContactForm] = useState<CreateContactAttemptDto>({
    channel: 'TELEFONO',
    result: 'EXITOSO',
    durationMinutes: undefined,
    notes: undefined,
  });
  const [submittingContact, setSubmittingContact] = useState(false);

  const [responsibilityForm, setResponsibilityForm] = useState({
    responsibleUserId: '',
    notes: '',
  });
  const [savingResponsibility, setSavingResponsibility] = useState(false);

  const [attributionForm, setAttributionForm] = useState<CreateAttributionDto>({
    actorId: '',
    acquisitionChannel:
      (expediente.acquisitionChannel as CreateAttributionDto['acquisitionChannel']) ?? 'OTRO',
    notes: '',
    reattributionReason: '',
  });
  const [revokeReason, setRevokeReason] = useState('');
  const [savingAttribution, setSavingAttribution] = useState(false);

  const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  const activePanelMeta: Record<
    Exclude<ActivePanel, null>,
    { title: string; description: string }
  > = {
    contact: {
      title: 'Registro de contacto activo',
      description: 'Documenta el resultado del intento para mantener trazabilidad comercial.',
    },
    responsibility: {
      title: 'Reasignación de responsable activa',
      description: 'Define quién continúa la gestión de esta oportunidad y agrega contexto.',
    },
    attribution: {
      title: 'Gestión de originador activa',
      description: 'Actualiza la atribución comercial y el canal de captación del caso.',
    },
  };

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !interestedPlanId &&
      additionalProductIds.length === 0 &&
      additionalServiceIds.length === 0
    ) {
      setPlanNameById({});
      setProductNameById({});
      setServiceNameById({});
      setCatalogLabelsLoading(false);
      return;
    }

    let cancelled = false;
    setCatalogLabelsLoading(true);

    void (async () => {
      const resolveName = async (id: string, load: () => Promise<{ name: string }>) => {
        try {
          const item = await load();
          const name = item.name?.trim();
          return name ? ([id, name] as const) : null;
        } catch {
          return null;
        }
      };

      const planEntry = interestedPlanId
        ? await resolveName(interestedPlanId, () =>
            getCachedExpedienteResource(
              resolvedTenantScope,
              `catalog:plan:${interestedPlanId}`,
              () => commercialApi.getPlanById(interestedPlanId),
            ),
          )
        : null;

      const productEntries = (
        await Promise.all(
          additionalProductIds.map((id) =>
            resolveName(id, () =>
              getCachedExpedienteResource(resolvedTenantScope, `catalog:item:${id}`, () =>
                commercialApi.getCatalogItemById(id),
              ),
            ),
          ),
        )
      ).filter((entry): entry is readonly [string, string] => entry !== null);

      const serviceEntries = (
        await Promise.all(
          additionalServiceIds.map((id) =>
            resolveName(id, () =>
              getCachedExpedienteResource(resolvedTenantScope, `catalog:item:${id}`, () =>
                commercialApi.getCatalogItemById(id),
              ),
            ),
          ),
        )
      ).filter((entry): entry is readonly [string, string] => entry !== null);

      if (cancelled) {
        return;
      }

      setPlanNameById(planEntry ? Object.fromEntries([planEntry]) : {});
      setProductNameById(Object.fromEntries(productEntries));
      setServiceNameById(Object.fromEntries(serviceEntries));
      setCatalogLabelsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // IDs normalizados vía keys estables; evita re-fetch por nuevas refs de array.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- product/service ids derivados
  }, [interestedPlanId, additionalProductIdsKey, additionalServiceIdsKey, resolvedTenantScope]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const showMsg = (text: string, tone: 'success' | 'error') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4500);
  };

  const searchActiveUsers = useCallback(async (query: string, signal: AbortSignal) => {
    const response = await usersApi.searchForPicker({ q: query, status: 'ACTIVE' }, { signal });
    return mapPickerSearchResponse(response);
  }, []);

  const togglePanel = (panel: Exclude<ActivePanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  const loadTimelinePage = useCallback(
    async (force = false, reportError = true): Promise<boolean> => {
      const requestGeneration = ++timelineRequestGenerationRef.current;
      const isCurrentRequest = () => requestGeneration === timelineRequestGenerationRef.current;

      try {
        setLoadingTimeline(true);
        setTimelineError(null);
        const response = await getCachedExpedienteTimelinePage(
          resolvedTenantScope,
          expedienteId,
          timelinePage,
          timelinePageSize,
          activeFilter,
          async () =>
            crmApi.getExpedienteTimelinePage(expedienteId, {
              page: timelinePage,
              limit: timelinePageSize,
              filter: activeFilter,
            }),
          force,
        );

        if (!isCurrentRequest()) return false;

        const entries = dedupeTimelineEvents(response.data.events).map(toTimelineEntry);

        setTimelineEntries(entries);
        const maxPage = Math.max(1, Math.floor(TIMELINE_MAX_EVENTS / response.meta.limit));
        const safeTotalPages = Math.min(Math.max(1, response.meta.totalPages), maxPage);
        const safePage = Math.min(Math.max(1, response.meta.page), safeTotalPages);
        setTimelineTotal(Math.min(response.meta.total, TIMELINE_MAX_EVENTS));
        setTimelineTotalPages(safeTotalPages);
        if (safePage !== timelinePage) {
          setTimelinePage(safePage);
        }
        return true;
      } catch {
        if (isCurrentRequest() && reportError) {
          setTimelineError('Intenta de nuevo para consultar la actividad de esta oportunidad.');
        }
        return false;
      } finally {
        if (isCurrentRequest()) {
          setLoadingTimeline(false);
        }
      }
    },
    [activeFilter, expedienteId, resolvedTenantScope, timelinePage, timelinePageSize],
  );

  useEffect(() => {
    void loadTimelinePage();
  }, [loadTimelinePage]);

  const handleTimelineFilterChange = useCallback((filter: TimelineFilter) => {
    setActiveFilter(filter);
    setTimelinePage(1);
  }, []);

  const handleTimelinePageSizeChange = useCallback((size: TimelinePageSize) => {
    setTimelinePageSize(size);
    setTimelinePage(1);
  }, []);

  const resetTimelineView = useCallback(() => {
    timelineRequestGenerationRef.current += 1;
    setTimelineEntries([]);
    setTimelineTotal(0);
    setTimelineTotalPages(1);
    setTimelineError(null);
  }, []);

  useEffect(() => {
    if (lastTimelineRevisionRef.current === timelineRevision) {
      return;
    }

    lastTimelineRevisionRef.current = timelineRevision;
    invalidateExpedienteTimelineCache(resolvedTenantScope, expedienteId);
    resetTimelineView();
    void loadTimelinePage(true);
  }, [expedienteId, loadTimelinePage, resetTimelineView, resolvedTenantScope, timelineRevision]);

  const refreshTimelineAfterMutation = useCallback(async () => {
    invalidateExpedienteTimelineCache(resolvedTenantScope, expedienteId);
    timelineRequestGenerationRef.current += 1;
    setTimelineError(null);
    return loadTimelinePage(true, false);
  }, [expedienteId, loadTimelinePage, resolvedTenantScope]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleContactSubmit = async () => {
    try {
      setSubmittingContact(true);
      await crmApi.createContactAttempt(expedienteId, contactForm);
      const timelineRefreshed = await refreshTimelineAfterMutation();
      setActivePanel(null);
      setContactForm({
        channel: 'TELEFONO',
        result: 'EXITOSO',
        durationMinutes: undefined,
        notes: undefined,
      });
      showMsg(
        timelineRefreshed
          ? 'Intento de contacto registrado correctamente.'
          : 'Intento de contacto guardado. No fue posible actualizar la bitácora; puedes reintentar.',
        'success',
      );
    } catch (err) {
      showMsg('No fue posible registrar el intento.', 'error');
    } finally {
      setSubmittingContact(false);
    }
  };

  const handleResponsibilitySubmit = async () => {
    if (!responsibilityForm.responsibleUserId.trim()) {
      showMsg('Debes seleccionar un usuario responsable.', 'error');
      return;
    }
    try {
      setSavingResponsibility(true);
      await crmApi.updateResponsibility(expedienteId, {
        responsibleUserId: responsibilityForm.responsibleUserId.trim(),
        ...(responsibilityForm.notes.trim() ? { notes: responsibilityForm.notes.trim() } : {}),
      });
      setResponsibilityForm({ responsibleUserId: '', notes: '' });
      setActivePanel(null);
      const timelineRefreshed = await refreshTimelineAfterMutation();
      showMsg(
        timelineRefreshed
          ? 'Responsable actualizado correctamente.'
          : 'Responsable actualizado. No fue posible actualizar la bitácora; puedes reintentar.',
        'success',
      );
      await onSaved();
    } catch (err) {
      showMsg(getSafeCrmErrorMessage(err, 'No fue posible actualizar el responsable.'), 'error');
    } finally {
      setSavingResponsibility(false);
    }
  };

  const handleAttributionSubmit = async () => {
    if (!attributionForm.actorId.trim()) {
      showMsg('Debes seleccionar el actor originador.', 'error');
      return;
    }
    if (currentAttribution && !attributionForm.reattributionReason?.trim()) {
      showMsg('La reatribución exige motivo.', 'error');
      return;
    }
    try {
      setSavingAttribution(true);
      const payload: CreateAttributionDto = {
        actorId: attributionForm.actorId.trim(),
        acquisitionChannel: attributionForm.acquisitionChannel,
      };
      if (attributionForm.notes?.trim()) payload.notes = attributionForm.notes.trim();
      if (attributionForm.reattributionReason?.trim())
        payload.reattributionReason = attributionForm.reattributionReason.trim();

      await crmApi.createAttribution(expedienteId, payload);
      setAttributionForm((curr) => ({ ...curr, notes: '', reattributionReason: '' }));
      setActivePanel(null);
      const timelineRefreshed = await refreshTimelineAfterMutation();
      showMsg(
        timelineRefreshed
          ? 'Atribución comercial actualizada correctamente.'
          : 'Atribución comercial actualizada. No fue posible actualizar la bitácora; puedes reintentar.',
        'success',
      );
      await onSaved();
    } catch (err) {
      showMsg(getSafeCrmErrorMessage(err, 'No fue posible guardar la atribución.'), 'error');
    } finally {
      setSavingAttribution(false);
    }
  };

  const handleRevokeSubmit = async () => {
    if (!revokeReason.trim()) {
      showMsg('La revocación exige motivo.', 'error');
      return;
    }
    try {
      setSavingAttribution(true);
      await crmApi.revokeAttribution(expedienteId, revokeReason.trim());
      setRevokeReason('');
      const timelineRefreshed = await refreshTimelineAfterMutation();
      showMsg(
        timelineRefreshed
          ? 'Atribución revocada correctamente.'
          : 'Atribución revocada. No fue posible actualizar la bitácora; puedes reintentar.',
        'success',
      );
      await onSaved();
    } catch (err) {
      showMsg(getSafeCrmErrorMessage(err, 'No fue posible revocar la atribución.'), 'error');
    } finally {
      setSavingAttribution(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Feedback */}
      {msg && (
        <p
          className={`rounded-[20px] border px-4 py-3 text-sm shadow-sm ${
            msg.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Layout dos columnas */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* ── Columna izquierda: Actividad ──────────────────────── */}
        <div className="min-w-0 space-y-5">
          {/* Barra de acciones */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={activePanel === 'contact' ? 'secondary' : 'primary'}
              onClick={() => togglePanel('contact')}
            >
              <PhoneOutgoing className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {activePanel === 'contact' ? 'Cancelar' : 'Registrar contacto'}
            </Button>
            {canManageAttribution && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={activePanel === 'responsibility' ? 'secondary' : 'ghost'}
                  onClick={() => togglePanel('responsibility')}
                >
                  <UserCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {activePanel === 'responsibility' ? 'Cancelar' : 'Reasignar responsable'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePanel === 'attribution' ? 'secondary' : 'ghost'}
                  onClick={() => togglePanel('attribution')}
                >
                  <TrendingUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {activePanel === 'attribution' ? 'Cancelar' : 'Gestionar originador'}
                </Button>
              </>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 dark:border-dark-border dark:bg-dark-surface-3">
            {activePanel ? (
              <div>
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">
                  {activePanelMeta[activePanel].title}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activePanelMeta[activePanel].description}
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Selecciona una acción rápida para iniciar una gestión operativa en esta oportunidad.
              </p>
            )}
          </div>

          {/* Panel intento de contacto */}
          {activePanel === 'contact' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
              <p className="mb-4 text-sm font-bold text-gray-900 dark:text-white">
                Nuevo intento de contacto
              </p>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    id="ct-channel"
                    label="Canal"
                    value={contactForm.channel}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setContactForm({ ...contactForm, channel: e.target.value })
                    }
                  >
                    {CHANNEL_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    id="ct-result"
                    label="Resultado"
                    value={contactForm.result}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setContactForm({ ...contactForm, result: e.target.value })
                    }
                  >
                    {RESULT_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Input
                  id="ct-duration"
                  type="number"
                  label="Duración (minutos)"
                  value={contactForm.durationMinutes ?? ''}
                  onChange={(e) =>
                    setContactForm({
                      ...contactForm,
                      durationMinutes: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="Duración de la llamada"
                />
                <div>
                  <label
                    htmlFor="ct-notes"
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Notas
                  </label>
                  <textarea
                    id="ct-notes"
                    value={contactForm.notes ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setContactForm({ ...contactForm, notes: e.target.value || undefined })
                    }
                    rows={3}
                    placeholder="Observaciones del contacto..."
                    className="flex w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActivePanel(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={submittingContact}
                    disabled={!contactForm.channel || !contactForm.result}
                    onClick={handleContactSubmit}
                  >
                    Registrar contacto
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Panel reasignar responsable */}
          {activePanel === 'responsibility' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
              <p className="mb-4 text-sm font-bold text-gray-900 dark:text-white">
                Reasignar responsable
              </p>
              <div className="space-y-4">
                <SearchablePicker
                  id="rs-user"
                  label="Nuevo responsable"
                  resource={{ singular: 'usuario', plural: 'usuarios' }}
                  value={responsibilityForm.responsibleUserId || null}
                  selectedItem={responsibleSelectedItem}
                  onChange={(item) => {
                    setResponsibilityForm((curr) => ({
                      ...curr,
                      responsibleUserId: item?.id ?? '',
                    }));
                    setResponsibleSelectedItem(
                      item ? { label: item.label, sublabel: item.sublabel } : null,
                    );
                  }}
                  onSearch={searchActiveUsers}
                  placeholder="Buscar usuario…"
                />
                <Input
                  id="rs-notes"
                  label="Notas (opcional)"
                  value={responsibilityForm.notes}
                  onChange={(e) =>
                    setResponsibilityForm((curr) => ({ ...curr, notes: e.target.value }))
                  }
                  placeholder="Motivo de la reasignación"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActivePanel(null);
                      setResponsibilityForm({ responsibleUserId: '', notes: '' });
                      setResponsibleSelectedItem(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={savingResponsibility}
                    onClick={handleResponsibilitySubmit}
                  >
                    Guardar responsable
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Panel gestionar originador */}
          {activePanel === 'attribution' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
              <p className="mb-4 text-sm font-bold text-gray-900 dark:text-white">
                Gestionar originador comercial
              </p>
              <div className="space-y-4">
                <SearchablePicker
                  id="at-actor"
                  label="Actor originador"
                  resource={{ singular: 'usuario', plural: 'usuarios' }}
                  value={attributionForm.actorId || null}
                  selectedItem={actorSelectedItem}
                  onChange={(item) => {
                    setAttributionForm((curr) => ({
                      ...curr,
                      actorId: item?.id ?? '',
                    }));
                    setActorSelectedItem(
                      item ? { label: item.label, sublabel: item.sublabel } : null,
                    );
                  }}
                  onSearch={searchActiveUsers}
                  placeholder="Buscar usuario…"
                />
                <Select
                  id="at-channel"
                  label="Canal de captación"
                  value={attributionForm.acquisitionChannel}
                  onChange={(e) =>
                    setAttributionForm((curr) => ({
                      ...curr,
                      acquisitionChannel: e.target
                        .value as CreateAttributionDto['acquisitionChannel'],
                    }))
                  }
                >
                  {ACQUISITION_CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Input
                  id="at-notes"
                  label="Notas (opcional)"
                  value={attributionForm.notes ?? ''}
                  onChange={(e) =>
                    setAttributionForm((curr) => ({ ...curr, notes: e.target.value }))
                  }
                  placeholder="Contexto de la atribución"
                />
                <Input
                  id="at-reason"
                  label="Motivo de reatribución"
                  value={attributionForm.reattributionReason ?? ''}
                  onChange={(e) =>
                    setAttributionForm((curr) => ({
                      ...curr,
                      reattributionReason: e.target.value,
                    }))
                  }
                  placeholder="Obligatorio cuando ya existe atribución activa"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setActivePanel(null);
                      setAttributionForm((curr) => ({
                        ...curr,
                        notes: '',
                        reattributionReason: '',
                      }));
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={savingAttribution}
                    onClick={handleAttributionSubmit}
                  >
                    Guardar atribución
                  </Button>
                </div>

                {/* Revocar atribución — dentro del mismo panel */}
                {currentAttribution && (
                  <div className="mt-2 space-y-3 rounded-2xl border border-red-100 bg-red-50/50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-500 dark:text-red-400">
                      Revocar atribución actual
                    </p>
                    <Input
                      id="at-revoke"
                      label="Motivo de revocación"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder="Motivo obligatorio"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={savingAttribution}
                      onClick={handleRevokeSubmit}
                    >
                      Revocar atribución
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Timeline unificado ─────────────────────────────── */}
          <ExpedienteTimelinePanel
            loadingTimeline={loadingTimeline}
            timelineError={timelineError}
            onRetryTimeline={() => void loadTimelinePage(true)}
            timelineEntries={timelineEntries}
            timelineTotal={timelineTotal}
            activeFilter={activeFilter}
            onActiveFilterChange={handleTimelineFilterChange}
            timelinePageSize={timelinePageSize}
            onTimelinePageSizeChange={handleTimelinePageSizeChange}
            isHistoryExpanded={isHistoryExpanded}
            onHistoryExpandedChange={setIsHistoryExpanded}
            timelinePage={timelinePage}
            timelineTotalPages={timelineTotalPages}
            onTimelinePageChange={setTimelinePage}
          />
        </div>

        {/* ── Columna derecha: Sidebar de estado ──────────────── */}
        <aside className="space-y-4">
          {/* Responsable actual */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-iwana-primary/10">
                <UserCheck className="h-3.5 w-3.5 text-iwana-primary" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-400">
                Responsable
              </p>
            </div>
            {responsibility?.currentResponsibleUserId ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {responsibility.currentResponsible?.name || 'Usuario asignado'}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {responsibility.currentResponsible?.role
                    ? getPortalUserRoleLabel(responsibility.currentResponsible.role)
                    : 'Rol no disponible'}
                </p>
                {responsibility.currentResponsibleAssignedAt && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-400">
                    Desde {formatCrmDateTime(responsibility.currentResponsibleAssignedAt)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-400">Sin responsable asignado</p>
            )}
          </div>

          {/* Asesor de origen */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-iwana-secondary/15 dark:bg-iwana-secondary-700/20">
                <TrendingUp className="h-3.5 w-3.5 text-iwana-secondary-700" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-400">
                Asesor de origen
              </p>
            </div>
            {currentAttribution ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {currentAttribution.actorName}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {getPortalUserRoleLabel(currentAttribution.actorRole)}
                </p>
                <div className="mt-2">
                  <Badge variant="neutral">
                    {formatAcquisitionChannel(currentAttribution.acquisitionChannel)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-400">
                  Desde {formatCrmDateTime(currentAttribution.attributedAt)}
                </p>
              </>
            ) : originCreator?.name?.trim() ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {originCreator.name.trim()}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Creado por</p>
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-400">Sin atribución activa</p>
            )}
            {!canManageAttribution && (
              <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-400">
                Solo un administrador puede editar el origen.
              </p>
            )}
          </div>

          {/* Interés del cliente */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                <User className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-400">
                Interés del cliente
              </p>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {interestedPlanId
                ? catalogLabelFromMap(
                    interestedPlanId,
                    planNameById,
                    catalogLabelsLoading,
                    CATALOG_PLAN_UNAVAILABLE,
                  )
                : 'Plan no registrado'}
            </p>
            {(additionalProductIds.length > 0 || additionalServiceIds.length > 0) && (
              <div className="mt-2 space-y-1 border-t border-gray-50 pt-2 dark:border-dark-border/50">
                {additionalProductIds.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-400">
                      Productos adicionales
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {additionalProductIds.map((id) => (
                        <span
                          key={id}
                          className="rounded-full bg-blue-50/50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/10 dark:text-blue-400"
                        >
                          {catalogLabelFromMap(
                            id,
                            productNameById,
                            catalogLabelsLoading,
                            CATALOG_ITEM_UNAVAILABLE,
                          )}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {additionalServiceIds.length > 0 && (
                  <>
                    <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-400">
                      Servicios adicionales
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {additionalServiceIds.map((id) => (
                        <span
                          key={id}
                          className="rounded-full bg-blue-50/50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/10 dark:text-blue-400"
                        >
                          {catalogLabelFromMap(
                            id,
                            serviceNameById,
                            catalogLabelsLoading,
                            CATALOG_ITEM_UNAVAILABLE,
                          )}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Origen de la oportunidad */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-400">
                Origen
              </p>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {formatAcquisitionChannel(
                currentAttribution?.acquisitionChannel ?? expediente.acquisitionChannel,
              )}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
