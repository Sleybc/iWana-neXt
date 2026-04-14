'use client';

import { type ReactNode, useEffect, useState, useMemo } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import {
  ArrowRightLeft,
  ChevronDown,
  Edit,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneOutgoing,
  TrendingUp,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  crmApi,
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
  formatExpedienteStatus,
  getStatusBadgeVariant,
  getContactChannelBadgeVariant,
  getContactResultBadgeVariant,
} from './expediente-ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivePanel = 'contact' | 'responsibility' | 'attribution' | null;
type TimelineKind = 'contact' | 'responsibility' | 'attribution' | 'system' | 'pipeline';
type TimelineFilter = 'all' | 'contact' | 'asignaciones' | 'pipeline' | 'system';
type TimelinePageSize = 5 | 10 | 20 | 50 | 'all';
const TIMELINE_DEFAULT_PAGE_SIZE: TimelinePageSize = 5;
const TIMELINE_PAGE_SIZE_OPTIONS: TimelinePageSize[] = [5, 10, 20, 50, 'all'];

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  sortAt: Date;
  data: ContactAttemptRecord | OperationalHistoryItem | SalesAttributionRecord | ExpedienteActivityItem | ExpedienteTimelineChange;
}

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

// ─── Icono de canal ───────────────────────────────────────────────────────────

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const cls = className ?? 'h-4 w-4';
  switch (channel) {
    case 'EMAIL':
      return <Mail className={cls} aria-hidden="true" />;
    case 'WHATSAPP':
      return <MessageCircle className={cls} aria-hidden="true" />;
    case 'SMS':
      return <MessageSquare className={cls} aria-hidden="true" />;
    case 'PRESENCIAL':
      return <Users className={cls} aria-hidden="true" />;
    default:
      return <Phone className={cls} aria-hidden="true" />;
  }
}

// ─── Entradas del timeline ────────────────────────────────────────────────────

function ContactEntry({ attempt }: { attempt: ContactAttemptRecord }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getContactChannelBadgeVariant(attempt.channel)}>{attempt.channel}</Badge>
        <Badge variant={getContactResultBadgeVariant(attempt.result)}>{attempt.result}</Badge>
        {attempt.durationMinutes && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {attempt.durationMinutes} min
          </span>
        )}
      </div>
      {attempt.notes && (
        <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">{attempt.notes}</p>
      )}
      {attempt.actorName && (
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">por {attempt.actorName}</p>
      )}
    </div>
  );
}

function ResponsibilityEntry({ item }: { item: OperationalHistoryItem }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white">
        {item.newResponsible.name || 'Usuario asignado'}
      </p>
      {item.newResponsible.role && (
        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          Nuevo rol: {item.newResponsible.role}
        </p>
      )}
      {item.previousResponsible && (
        <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
          Anterior: {item.previousResponsible.name || 'Sin nombre'}
        </p>
      )}
      {item.notes && (
        <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Nota: {item.notes}</p>
      )}
    </div>
  );
}

function AttributionEntry({ item }: { item: SalesAttributionRecord }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-900 dark:text-white">{item.actorName}</p>
      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
        {item.actorRole} · {formatAcquisitionChannel(item.acquisitionChannel)}
      </p>
      {item.revokedAt && (
        <p className="mt-1 text-[10px] text-red-400">Revocado · {item.revokedReason || 'Sin motivo'}</p>
      )}
    </div>
  );
}

function PipelineEntry({ change }: { change: ExpedienteTimelineChange }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getStatusBadgeVariant(change.toStatus)}>
          {formatExpedienteStatus(change.toStatus)}
        </Badge>
        {change.fromStatus && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            ← {formatExpedienteStatus(change.fromStatus)}
          </span>
        )}
      </div>
      {change.actor?.name && (
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">por {change.actor.name}</p>
      )}
      {change.reason && (
        <p className="mt-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] dark:bg-dark-surface-3">
          {change.reason}
        </p>
      )}
    </div>
  );
}

function SystemActivityEntry({ activity }: { activity: ExpedienteActivityItem }) {
  const actorName = activity.actor?.name?.trim() || null;
  return (
    <div className="space-y-0">
      {activity.type === 'SECTION_UPDATED' && (
        <div className="space-y-0">
          <p className="text-xs font-medium leading-tight text-gray-900 dark:text-white">
            {activity.sectionLabel ?? 'Sección actualizada'}
          </p>
          {activity.reason && (
            <p className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] leading-tight text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
              {activity.reason}
            </p>
          )}
        </div>
      )}
      {activity.type === 'STATUS_CHANGED' && activity.toStatus && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getStatusBadgeVariant(activity.toStatus)}>
            {formatExpedienteStatus(activity.toStatus)}
          </Badge>
          {activity.fromStatus && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              ← {formatExpedienteStatus(activity.fromStatus)}
            </span>
          )}
        </div>
      )}
      {activity.type === 'CREATED' && (
        <p className="text-xs leading-tight text-gray-600 dark:text-gray-300">Registro inicial del expediente.</p>
      )}
      {actorName && (
        <p className="text-[10px] leading-tight text-gray-400 dark:text-gray-500">por {actorName}</p>
      )}
    </div>
  );
}


function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const iconNode =
    entry.kind === 'contact' ? (
      <ChannelIcon
        channel={(entry.data as ContactAttemptRecord).channel}
        className="h-3.5 w-3.5 text-iwana-primary"
      />
    ) : entry.kind === 'responsibility' ? (
      <UserCheck className="h-3.5 w-3.5 text-iwana-secondary-700" aria-hidden="true" />
    ) : entry.kind === 'attribution' ? (
      <TrendingUp className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
    ) : entry.kind === 'pipeline' ? (
      <ArrowRightLeft className="h-3.5 w-3.5 text-iwana-primary" aria-hidden="true" />
    ) : (
      // system: ícono según tipo de actividad
      (() => {
        const act = entry.data as ExpedienteActivityItem;
        if (act.type === 'CREATED') return <FileText className="h-3.5 w-3.5 text-iwana-secondary-700" aria-hidden="true" />;
        if (act.type === 'SECTION_UPDATED') return <Edit className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />;
        return <ArrowRightLeft className="h-3.5 w-3.5 text-iwana-primary" aria-hidden="true" />;
      })()
    );

  const kindLabel =
    entry.kind === 'contact'
      ? 'Intento de contacto'
      : entry.kind === 'responsibility'
        ? 'Cambio de responsable'
        : entry.kind === 'attribution'
          ? 'Atribución comercial'
          : entry.kind === 'pipeline'
            ? 'Cambio de estado'
            : (() => {
                const act = entry.data as ExpedienteActivityItem;
                if (act.type === 'CREATED') return 'Oportunidad creada';
                if (act.type === 'SECTION_UPDATED') return 'Actualización de sección';
                return 'Actividad del sistema';
              })();

  return (
    <div className="relative pb-1.5 pl-6">
      {/* Burbuja de icono (centrada en la línea ajustada) */}
      <span className="absolute -left-[13px] top-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
        {iconNode}
      </span>
      {/* Tarjeta */}
      <div className="rounded-[14px] border border-gray-100 bg-white px-3 py-2.5 shadow-iwana-soft transition-shadow hover:shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
        <p className="text-[10px] font-bold uppercase tracking-wide leading-tight text-gray-400 dark:text-gray-500">
          {kindLabel}
        </p>
        {entry.kind === 'contact' && (
          <ContactEntry attempt={entry.data as ContactAttemptRecord} />
        )}
        {entry.kind === 'responsibility' && (
          <ResponsibilityEntry item={entry.data as OperationalHistoryItem} />
        )}
        {entry.kind === 'attribution' && (
          <AttributionEntry item={entry.data as SalesAttributionRecord} />
        )}
        {entry.kind === 'pipeline' && (
          <PipelineEntry change={entry.data as ExpedienteTimelineChange} />
        )}
        {entry.kind === 'system' && (
          <SystemActivityEntry activity={entry.data as ExpedienteActivityItem} />
        )}
        <p className="text-[11px] leading-tight text-gray-400 dark:text-gray-500">
          {entry.sortAt.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>
    </div>
  );
}

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
  recentActivity = [],
  pipelineChanges = [],
  onSaved,
}: SeguimientoTabProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>('all');
  const [timelinePageSize, setTimelinePageSize] = useState<TimelinePageSize>(TIMELINE_DEFAULT_PAGE_SIZE);
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
    if (activeFilter === 'contact')
      return allTimelineEntries.filter((e) => e.kind === 'contact');
    if (activeFilter === 'asignaciones')
      return allTimelineEntries.filter((e) => e.kind === 'responsibility' || e.kind === 'attribution');
    if (activeFilter === 'pipeline')
      return allTimelineEntries.filter((e) => e.kind === 'pipeline');
    return allTimelineEntries.filter((e) => e.kind === 'system');
  }, [allTimelineEntries, activeFilter]);

  const effectiveTimelinePageSize =
    timelinePageSize === 'all' ? Math.max(1, timelineEntries.length) : timelinePageSize;
  const showTimelinePagination =
    timelinePageSize !== 'all' && timelineEntries.length > effectiveTimelinePageSize;

  const timelineTotalPages = Math.max(1, Math.ceil(timelineEntries.length / effectiveTimelinePageSize));
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
      showMsg(
        err instanceof Error ? err.message : 'No fue posible registrar el intento.',
        'error',
      );
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
          className={`rounded-[20px] border px-4 py-3 text-sm shadow-iwana-soft ${
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

          {/* Panel intento de contacto */}
          {activePanel === 'contact' && (
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
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
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
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
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2">
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
                      acquisitionChannel:
                        e.target.value as CreateAttributionDto['acquisitionChannel'],
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
          <div>
            {/* Cabecera con contador y filtros */}
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                disabled={allTimelineEntries.length === 0 && !loadingAttempts}
                className="group flex items-center gap-2 outline-none"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  Bitácora de actividad
                  {allTimelineEntries.length > 0 && ` (${allTimelineEntries.length})`}
                </p>
                {allTimelineEntries.length > 0 && (
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 dark:text-gray-500 ${
                      isHistoryExpanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                )}
              </button>
              {/* Filtros de tipo */}
              {allTimelineEntries.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { key: 'all', label: 'Todos', icon: null },
                        {
                          key: 'contact',
                          label: 'Contactos',
                          icon: <Phone className="h-3 w-3" aria-hidden="true" />,
                        },
                        {
                          key: 'pipeline',
                          label: 'Pipeline',
                          icon: <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />,
                        },
                        {
                          key: 'asignaciones',
                          label: 'Asignaciones',
                          icon: <UserCheck className="h-3 w-3" aria-hidden="true" />,
                        },
                        {
                          key: 'system',
                          label: 'Auditoría',
                          icon: <FileText className="h-3 w-3" aria-hidden="true" />,
                        },
                      ] as { key: TimelineFilter; label: string; icon: ReactNode | null }[]
                    ).map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setActiveFilter(f.key)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                          activeFilter === f.key
                            ? 'bg-iwana-primary text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-border'
                        }`}
                      >
                        {f.icon}
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="h-4 w-px bg-gray-200 dark:bg-dark-border" aria-hidden="true" />

                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      Ver
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {TIMELINE_PAGE_SIZE_OPTIONS.map((size) => {
                        const isActive = timelinePageSize === size;
                        const label = size === 'all' ? 'Todo' : String(size);

                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setTimelinePageSize(size)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                              isActive
                                ? 'bg-iwana-secondary-700 text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-dark-surface-3 dark:text-gray-400 dark:hover:bg-dark-border'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {loadingAttempts ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-iwana-primary" aria-hidden="true" />
              </div>
            ) : allTimelineEntries.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center dark:border-dark-border dark:bg-dark-surface-3">
                <Phone
                  className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm text-gray-400 dark:text-gray-500">
                  Aún no hay actividad registrada para esta oportunidad.
                </p>
              </div>
            ) : (
              isHistoryExpanded && (
                <>
                  <div className="relative ml-4 space-y-3 border-l border-gray-100 pl-0 dark:border-dark-border">
                    {timelineEntries.length > 0 ? (
                      paginatedTimelineEntries.map((entry) => (
                        <TimelineItem key={entry.id} entry={entry} />
                      ))
                    ) : (
                      <p className="py-4 text-sm text-gray-400 dark:text-gray-500">
                        Sin resultados para este filtro.
                      </p>
                    )}
                  </div>

                  {showTimelinePagination && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <button
                        type="button"
                        onClick={() => setTimelinePage((current) => Math.max(1, current - 1))}
                        disabled={timelinePage === 1}
                        className="rounded-lg border border-gray-200 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border"
                      >
                        Anterior
                      </button>
                      <span className="whitespace-nowrap">
                        Página {timelinePage} de {timelineTotalPages}
                      </span>
                      <div className="hidden items-center gap-1 sm:flex">
                        {firstTimelinePageButton > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setTimelinePage(1)}
                              className="rounded-md border border-gray-200 px-2 py-1 dark:border-dark-border"
                            >
                              1
                            </button>
                            {firstTimelinePageButton > 2 && <span className="px-0.5">...</span>}
                          </>
                        )}

                        {timelinePageButtons.map((page) => (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setTimelinePage(page)}
                            className={`rounded-md border px-2 py-1 ${
                              page === timelinePage
                                ? 'border-iwana-primary bg-iwana-primary text-white'
                                : 'border-gray-200 dark:border-dark-border'
                            }`}
                          >
                            {page}
                          </button>
                        ))}

                        {lastTimelinePageButton < timelineTotalPages && (
                          <>
                            {lastTimelinePageButton < timelineTotalPages - 1 && (
                              <span className="px-0.5">...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setTimelinePage(timelineTotalPages)}
                              className="rounded-md border border-gray-200 px-2 py-1 dark:border-dark-border"
                            >
                              {timelineTotalPages}
                            </button>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setTimelinePage((current) => Math.min(timelineTotalPages, current + 1))
                        }
                        disabled={timelinePage === timelineTotalPages}
                        className="rounded-lg border border-gray-200 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>

        {/* ── Columna derecha: Sidebar de estado ──────────────── */}
        <aside className="space-y-4">
          {/* Responsable actual */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2">
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
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2">
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
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2">
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
                      {planCatalog.find((p) => p.id === id)?.name || id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Origen de la oportunidad */}
          <div className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2">
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
