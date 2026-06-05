'use client';

import { useEffect, useState, useMemo } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { ArrowRightLeft, PhoneOutgoing, TrendingUp, User, UserCheck } from 'lucide-react';
import {
  crmApi,
  type AdditionalProduct,
  type ContactAttemptRecord,
  type CreateContactAttemptDto,
  type CreateAttributionDto,
  type ExpedienteActivityItem,
  type ExpedienteRecord,
  type ExpedienteTimelineChange,
  type InternalUser,
  type OperationalHistoryItem,
  type PlanCatalogItem,
  type ResponsibilitySnapshot,
  type SalesAttributionRecord,
} from '@/lib/api-client';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  EXPEDIENTE_STATUS_META,
  formatAcquisitionChannel,
  formatCrmDateTime,
} from './expediente-ui';
import {
  ExpedienteTimelinePanel,
  TIMELINE_DEFAULT_PAGE_SIZE,
  type TimelineEntry,
  type TimelineFilter,
  type TimelinePageSize,
} from './ExpedienteTimelinePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivePanel = 'contact' | 'responsibility' | 'attribution' | null;

// ─── Props ────────────────────────────────────────────────────────────────────

interface SeguimientoTabProps {
  expedienteId: string;
  expediente: Pick<
    ExpedienteRecord,
    'interestedPlanId' | 'additionalProductIds' | 'acquisitionChannel' | 'sourceDetail'
  >;
  canManageAttribution: boolean;
  responsibility: ResponsibilitySnapshot | null;
  responsibilityHistory: OperationalHistoryItem[];
  currentAttribution: SalesAttributionRecord | null;
  attributionHistory: SalesAttributionRecord[];
  sortedAttributionUsers: InternalUser[];
  loadingAttributionUsers: boolean;
  planCatalog?: PlanCatalogItem[];
  additionalProducts?: AdditionalProduct[];
  /** Actividad del sistema (guardado de secciones, creación, etc.) */
  recentActivity?: ExpedienteActivityItem[];
  /** Cambios de estado del pipeline */
  pipelineChanges?: ExpedienteTimelineChange[];
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
  expediente,
  canManageAttribution,
  responsibility,
  responsibilityHistory,
  currentAttribution,
  attributionHistory,
  sortedAttributionUsers,
  loadingAttributionUsers,
  planCatalog = [],
  additionalProducts = [],
  recentActivity = [],
  pipelineChanges = [],
  onSaved,
}: SeguimientoTabProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');
  const [timelinePageSize, setTimelinePageSize] = useState<TimelinePageSize>(
    TIMELINE_DEFAULT_PAGE_SIZE,
  );
  const [timelinePage, setTimelinePage] = useState(1);

  const [contactAttempts, setContactAttempts] = useState<ContactAttemptRecord[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);

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
    void loadAttempts();
  }, [expedienteId]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const loadAttempts = async () => {
    try {
      setLoadingAttempts(true);
      const response = await crmApi.listContactAttempts(expedienteId);
      setContactAttempts(response.data);
    } catch {
      // No bloqueante — el timeline mostrará los otros historiales sin intentos
    } finally {
      setLoadingAttempts(false);
    }
  };

  const showMsg = (text: string, tone: 'success' | 'error') => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 4500);
  };

  const togglePanel = (panel: Exclude<ActivePanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  // ─── Timeline unificado ───────────────────────────────────────────────────

  const allTimelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    for (const a of contactAttempts) {
      entries.push({
        id: `c-${a.id}`,
        kind: 'contact',
        sortAt: new Date(a.attemptedAt),
        data: a,
      });
    }
    for (const r of responsibilityHistory) {
      entries.push({
        id: `r-${r.id}`,
        kind: 'responsibility',
        sortAt: new Date(r.changedAt),
        data: r,
      });
    }
    for (const at of attributionHistory) {
      entries.push({
        id: `a-${at.id}`,
        kind: 'attribution',
        sortAt: new Date(at.attributedAt),
        data: at,
      });
    }
    for (const p of pipelineChanges) {
      entries.push({
        id: `p-${p.id}`,
        kind: 'pipeline',
        sortAt: new Date(p.changedAt),
        data: p,
      });
    }
    for (const s of recentActivity) {
      entries.push({
        id: `s-${s.id}`,
        kind: 'system',
        sortAt: new Date(s.occurredAt),
        data: s,
      });
    }

    return entries.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
  }, [contactAttempts, responsibilityHistory, attributionHistory, pipelineChanges, recentActivity]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (activeFilter === 'all') return allTimelineEntries;
    if (activeFilter === 'contact') return allTimelineEntries.filter((e) => e.kind === 'contact');
    if (activeFilter === 'asignaciones')
      return allTimelineEntries.filter(
        (e) => e.kind === 'responsibility' || e.kind === 'attribution',
      );
    if (activeFilter === 'pipeline') return allTimelineEntries.filter((e) => e.kind === 'pipeline');
    return allTimelineEntries.filter((e) => e.kind === 'system');
  }, [allTimelineEntries, activeFilter]);

  const effectiveTimelinePageSize =
    timelinePageSize === 'all' ? Math.max(1, timelineEntries.length) : timelinePageSize;
  const showTimelinePagination =
    timelinePageSize !== 'all' && timelineEntries.length > effectiveTimelinePageSize;

  const timelineTotalPages = Math.max(
    1,
    Math.ceil(timelineEntries.length / effectiveTimelinePageSize),
  );
  const paginatedTimelineEntries = useMemo<TimelineEntry[]>(() => {
    const start = (timelinePage - 1) * effectiveTimelinePageSize;
    return timelineEntries.slice(start, start + effectiveTimelinePageSize);
  }, [timelineEntries, timelinePage, effectiveTimelinePageSize]);
  const timelinePageButtons = useMemo<number[]>(() => {
    if (timelineTotalPages <= 5) {
      return Array.from({ length: timelineTotalPages }, (_, idx) => idx + 1);
    }

    const start = Math.max(1, timelinePage - 2);
    const end = Math.min(timelineTotalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);

    return Array.from({ length: end - adjustedStart + 1 }, (_, idx) => adjustedStart + idx);
  }, [timelinePage, timelineTotalPages]);
  const firstTimelinePageButton = timelinePageButtons[0] ?? 1;
  const lastTimelinePageButton = timelinePageButtons[timelinePageButtons.length - 1] ?? 1;

  useEffect(() => {
    setTimelinePage(1);
  }, [activeFilter, timelinePageSize]);

  useEffect(() => {
    if (timelinePage > timelineTotalPages) {
      setTimelinePage(timelineTotalPages);
    }
  }, [timelinePage, timelineTotalPages]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleContactSubmit = async () => {
    try {
      setSubmittingContact(true);
      await crmApi.createContactAttempt(expedienteId, contactForm);
      await loadAttempts();
      setActivePanel(null);
      setContactForm({
        channel: 'TELEFONO',
        result: 'EXITOSO',
        durationMinutes: undefined,
        notes: undefined,
      });
      showMsg('Intento de contacto registrado correctamente.', 'success');
    } catch (err) {
      showMsg(err instanceof Error ? err.message : 'No fue posible registrar el intento.', 'error');
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
      showMsg('Responsable actualizado correctamente.', 'success');
      await onSaved();
    } catch (err) {
      showMsg(
        err instanceof Error ? err.message : 'No fue posible actualizar el responsable.',
        'error',
      );
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
      showMsg('Atribución comercial actualizada correctamente.', 'success');
      await onSaved();
    } catch (err) {
      showMsg(
        err instanceof Error ? err.message : 'No fue posible guardar la atribución.',
        'error',
      );
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
      showMsg('Atribución revocada correctamente.', 'success');
      await onSaved();
    } catch (err) {
      showMsg(
        err instanceof Error ? err.message : 'No fue posible revocar la atribución.',
        'error',
      );
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
                <Select
                  id="rs-user"
                  label="Nuevo responsable"
                  value={responsibilityForm.responsibleUserId}
                  onChange={(e) =>
                    setResponsibilityForm((curr) => ({
                      ...curr,
                      responsibleUserId: e.target.value,
                    }))
                  }
                  disabled={loadingAttributionUsers}
                  placeholder={
                    loadingAttributionUsers
                      ? 'Cargando usuarios...'
                      : 'Selecciona un usuario activo'
                  }
                >
                  {sortedAttributionUsers.map((u) => {
                    const name =
                      [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
                      u.email ||
                      'Sin nombre';
                    return (
                      <option key={u.id} value={u.id}>
                        {name}
                      </option>
                    );
                  })}
                </Select>
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
                <Select
                  id="at-actor"
                  label="Actor originador"
                  value={attributionForm.actorId}
                  onChange={(e) =>
                    setAttributionForm((curr) => ({ ...curr, actorId: e.target.value }))
                  }
                  disabled={loadingAttributionUsers}
                  placeholder={
                    loadingAttributionUsers
                      ? 'Cargando usuarios activos...'
                      : 'Selecciona un usuario activo'
                  }
                >
                  {sortedAttributionUsers.map((u) => {
                    const name =
                      [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
                      u.email ||
                      'Sin nombre';
                    return (
                      <option key={u.id} value={u.id}>
                        {name}
                      </option>
                    );
                  })}
                </Select>
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
            loadingAttempts={loadingAttempts}
            allTimelineEntries={allTimelineEntries}
            timelineEntries={timelineEntries}
            paginatedTimelineEntries={paginatedTimelineEntries}
            activeFilter={activeFilter}
            onActiveFilterChange={setActiveFilter}
            timelinePageSize={timelinePageSize}
            onTimelinePageSizeChange={setTimelinePageSize}
            isHistoryExpanded={isHistoryExpanded}
            onHistoryExpandedChange={setIsHistoryExpanded}
            showTimelinePagination={showTimelinePagination}
            timelinePage={timelinePage}
            timelineTotalPages={timelineTotalPages}
            timelinePageButtons={timelinePageButtons}
            firstTimelinePageButton={firstTimelinePageButton}
            lastTimelinePageButton={lastTimelinePageButton}
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
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                Responsable
              </p>
            </div>
            {responsibility?.currentResponsibleUserId ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {responsibility.currentResponsible?.name || 'Usuario asignado'}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {responsibility.currentResponsible?.role || 'Rol no disponible'}
                </p>
                {responsibility.currentResponsibleAssignedAt && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Desde {formatCrmDateTime(responsibility.currentResponsibleAssignedAt)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin responsable asignado</p>
            )}
          </div>

          {/* Originador */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-iwana-secondary/15 dark:bg-iwana-secondary-700/20">
                <TrendingUp className="h-3.5 w-3.5 text-iwana-secondary-700" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                Originador
              </p>
            </div>
            {currentAttribution ? (
              <>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {currentAttribution.actorName}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {currentAttribution.actorRole}
                </p>
                <div className="mt-2">
                  <Badge variant="neutral">
                    {formatAcquisitionChannel(currentAttribution.acquisitionChannel)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  Desde {formatCrmDateTime(currentAttribution.attributedAt)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin atribución activa</p>
            )}
            {!canManageAttribution && (
              <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
                Solo ADMIN puede editar atribuciones.
              </p>
            )}
          </div>

          {/* Interés del cliente */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
                <User className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                Interés del cliente
              </p>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {planCatalog.find((p) => p.id === expediente.interestedPlanId)?.name ||
                expediente.interestedPlanId ||
                'Plan no registrado'}
            </p>
            {expediente.additionalProductIds && expediente.additionalProductIds.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-50 pt-2 dark:border-dark-border/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Servicios Adicionales
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {expediente.additionalProductIds.map((id) => (
                    <span
                      key={id}
                      className="rounded-full bg-blue-50/50 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/10 dark:text-blue-400"
                    >
                      {additionalProducts.find((product) => product.id === id)?.name || id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Origen de la oportunidad */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                Origen
              </p>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {formatAcquisitionChannel(
                currentAttribution?.acquisitionChannel ?? expediente.acquisitionChannel,
              )}
            </p>
            {expediente.sourceDetail && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {expediente.sourceDetail}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
