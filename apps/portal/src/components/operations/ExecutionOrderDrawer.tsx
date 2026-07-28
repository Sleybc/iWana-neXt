'use client';

import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge, Button, Input, ProgressMeter, Select, OperationalSidePeek } from '@iwana/ui';
import {
  ExecutionOrderResult,
  ExecutionOrderStatus,
  ExecutionOrderItemAction,
  InventoryDisposition,
  WfmWorkType,
} from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderDetail,
  ExecutionOrderTemplateVersion,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateRequirement,
  RegisterActivityCommand,
} from '@iwana/shared';
import type { CloseExecutionOrderDto, RegisterExecutionOrderItemUsageDto } from '@/lib/api-client';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';
import { Camera, FileText, MapPin, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ExecutionOrderDrawerProps {
  open: boolean;
  order: ExecutionOrderDetail | null;
  activities: ExecutionOrderActivity[];
  itemUsage: ExecutionOrderItemUsage[];
  evidence: ExecutionOrderEvidence[];
  template: ExecutionOrderTemplateVersion | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  offline: boolean;
  onClose: () => void;
  onStart: (notes?: string | null) => Promise<void>;
  onRegisterActivity: (payload: RegisterActivityCommand) => Promise<void>;
  onRegisterItemUsage: (payload: RegisterExecutionOrderItemUsageDto) => Promise<void>;
  onUploadEvidence: (files: File[], requirementKey: string) => Promise<void>;
  onBlock?: (payload: { reasonCode: string; note?: string }) => Promise<void>;
  onUnblock?: (payload: { resolutionCode: string; note?: string }) => Promise<void>;
  onCloseOrder: (payload: CloseExecutionOrderDto) => Promise<void>;
  onCreateFollowUp: (reasonCode: string) => Promise<void>;
}

// ─── Labels ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ExecutionOrderStatus, string> = {
  [ExecutionOrderStatus.CREATED]: 'Creada',
  [ExecutionOrderStatus.ASSIGNED]: 'Asignada',
  [ExecutionOrderStatus.EN_ROUTE]: 'En ruta',
  [ExecutionOrderStatus.IN_PROGRESS]: 'En progreso',
  [ExecutionOrderStatus.BLOCKED]: 'Bloqueada',
  [ExecutionOrderStatus.COMPLETED]: 'Ejecutada',
  [ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS]: 'Completada con observaciones',
  [ExecutionOrderStatus.NOT_EXECUTED]: 'No ejecutada',
  [ExecutionOrderStatus.CANCELLED]: 'Cancelada',
};

const RESULT_LABELS: Record<ExecutionOrderResult, string> = {
  [ExecutionOrderResult.EXECUTED]: 'Ejecutada',
  [ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS]: 'Ejecutada con observaciones',
  [ExecutionOrderResult.NOT_EXECUTED]: 'No ejecutada',
  [ExecutionOrderResult.REQUIRES_FOLLOW_UP]: 'Requiere seguimiento',
  [ExecutionOrderResult.CANCELLED]: 'Cancelada',
};

const WORK_TYPE_LABELS: Record<WfmWorkType, string> = {
  INSTALLATION: 'Instalacion',
  SUPPORT: 'Soporte',
  TECHNICAL_VISIT: 'Visita tecnica',
  MAINTENANCE: 'Mantenimiento',
  RETIREMENT: 'Retiro',
};

const EVIDENCE_STATUS_LABELS: Record<string, string> = {
  PENDING_ANALYSIS: 'Pendiente de analisis',
  AVAILABLE: 'Disponible',
  REJECTED: 'Rechazada',
  EXPIRED: 'Expirada',
};

const MOVEMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  REJECTED: 'Rechazado',
};

const ITEM_ACTION_LABELS: Record<string, string> = {
  INSTALL: 'Instalar',
  CONSUME: 'Consumir',
  RETURN: 'Devolver',
  REMOVE: 'Retirar',
};

const DISPOSITION_LABELS: Record<string, string> = {
  INSTALLED_AT_CUSTOMER: 'Instalado en cliente',
  INTERNAL_CONSUMPTION: 'Consumo interno',
  RETURNED_TO_TECHNICIAN_STOCK: 'Retorno a custodia tecnica',
  RETURNED_TO_WAREHOUSE: 'Retorno a bodega',
  DAMAGED_OR_LOST: 'Danado o perdido',
  NOT_REQUIRED: 'No requiere conciliacion',
  PENDING: 'Conciliacion pendiente',
  CONFIRMED: 'Conciliacion confirmada',
  REJECTED: 'Conciliacion rechazada',
  DIVERGED: 'Conciliacion divergente',
};

const TERMINAL_STATUSES = new Set<ExecutionOrderStatus>([
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

function actionAllowed(order: ExecutionOrderDetail, action: ExecutionOrderAllowedAction): boolean {
  return order.allowedActions?.includes(action) === true;
}

function statusBadgeVariant(
  status: ExecutionOrderStatus,
): 'neutral' | 'primary' | 'warning' | 'success' | 'error' | 'lime' {
  if (status === ExecutionOrderStatus.COMPLETED) return 'lime';
  if (status === ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS) return 'warning';
  if (status === ExecutionOrderStatus.BLOCKED) return 'warning';
  if (status === ExecutionOrderStatus.NOT_EXECUTED) return 'error';
  if (status === ExecutionOrderStatus.CANCELLED) return 'error';
  if (status === ExecutionOrderStatus.CREATED) return 'neutral';
  return 'primary';
}

function syncStateCopy(state: ExecutionOrderDetail['syncState']): string {
  switch (state) {
    case 'IN_SYNC':
      return 'Sincronizada';
    case 'PENDING':
      return 'Sincronizacion pendiente';
    case 'DIVERGED':
      return 'La orden cambio; revisa la version vigente';
    case 'FAILED':
      return 'Error de sincronizacion';
  }
}

function dateFormatter(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function requirementIcon(kind: ExecutionOrderTemplateRequirement['kind']) {
  switch (kind) {
    case 'FIELD':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-gray-400" />;
    case 'ACTIVITY':
      return <FileText className="h-4 w-4 shrink-0 text-gray-400" />;
    case 'MEASUREMENT':
      return <span className="font-mono text-xs text-gray-400">m</span>;
    case 'EVIDENCE':
      return <Camera className="h-4 w-4 shrink-0 text-gray-400" />;
    case 'MATERIAL':
      return <span className="font-mono text-xs text-gray-400">#</span>;
    case 'COMPLIANCE':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-gray-400" />;
  }
}

// ─── Componente principal ───────────────────────────────────────────────────

export function ExecutionOrderDrawer({
  open,
  order,
  activities,
  itemUsage,
  evidence = [],
  template = null,
  isLoading,
  isSubmitting,
  error,
  offline,
  onClose,
  onStart,
  onRegisterActivity,
  onRegisterItemUsage,
  onUploadEvidence,
  onBlock,
  onUnblock,
  onCloseOrder,
  onCreateFollowUp,
}: ExecutionOrderDrawerProps) {
  const terminal = order ? TERMINAL_STATUSES.has(order.status) : false;
  const forbidden = order ? order.allowedActions === null : false;
  const canInteract = !terminal && !offline && !forbidden && order !== null;
  const canReadOnlyInteract = !offline && !forbidden && order !== null;

  const canStart = order ? actionAllowed(order, 'START') : false;
  const canRegisterActivity = order ? actionAllowed(order, 'REGISTER_ACTIVITY') : false;
  const canRegisterItems = order ? actionAllowed(order, 'REGISTER_ITEM_USAGE') : false;
  const canRegisterEvidence = order ? actionAllowed(order, 'REGISTER_EVIDENCE') : false;
  const canClose = order ? actionAllowed(order, 'CLOSE') : false;
  const canBlock = order ? actionAllowed(order, 'BLOCK') : false;
  const canUnblock = order ? actionAllowed(order, 'UNBLOCK') : false;
  const canFollowUp = order ? actionAllowed(order, 'CREATE_FOLLOW_UP') : false;

  // ─── State local ────────────────────────────────────────────────────

  // Block 3 — Trabajo realizado
  const [activityType, setActivityType] = useState('INSTALLATION');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityNovelty, setActivityNovelty] = useState(false);

  // Block 4 — Equipos y materiales
  const [itemId, setItemId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemSerial, setItemSerial] = useState('');
  const [itemAction, setItemAction] = useState<ExecutionOrderItemAction>(
    ExecutionOrderItemAction.INSTALL,
  );
  const [itemDisposition, setItemDisposition] = useState<InventoryDisposition>(
    InventoryDisposition.INSTALLED_AT_CUSTOMER,
  );

  // Block 6 — Cierre
  const [closeResult, setCloseResult] = useState<ExecutionOrderResult>(
    ExecutionOrderResult.EXECUTED,
  );
  const [closeReason, setCloseReason] = useState('');
  const [closeSummary, setCloseSummary] = useState('');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [followUpReason, setFollowUpReason] = useState('');

  // Evidencia — file input ref
  const evidenceFileRef = useRef<HTMLInputElement>(null);

  const activityTypeOptions = useMemo(
    () => [
      { value: 'INSTALLATION', label: 'Instalacion' },
      { value: 'FIELD_NOTE', label: 'Nota de campo' },
      { value: 'CONFIGURATION', label: 'Configuracion' },
      { value: 'TESTING', label: 'Prueba' },
      { value: 'NOVELTY', label: 'Novedad' },
    ],
    [],
  );

  const resultOptions = useMemo(
    () => [
      { value: ExecutionOrderResult.EXECUTED, label: 'Ejecutada' },
      {
        value: ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
        label: 'Ejecutada con observaciones',
      },
      { value: ExecutionOrderResult.NOT_EXECUTED, label: 'No ejecutada' },
    ],
    [],
  );

  const actionOptions = useMemo(
    () => [
      { value: 'INSTALL', label: 'Instalar' },
      { value: 'CONSUME', label: 'Consumir' },
      { value: 'RETURN', label: 'Devolver' },
      { value: 'REMOVE', label: 'Retirar' },
    ],
    [],
  );

  const dispositionOptions = useMemo(
    () => [
      { value: 'INSTALLED_AT_CUSTOMER', label: 'Instalado en cliente' },
      { value: 'INTERNAL_CONSUMPTION', label: 'Consumo interno' },
      { value: 'RETURNED_TO_TECHNICIAN_STOCK', label: 'Retorno a custodia tecnica' },
      { value: 'RETURNED_TO_WAREHOUSE', label: 'Retorno a bodega' },
      { value: 'DAMAGED_OR_LOST', label: 'Danado o perdido' },
    ],
    [],
  );

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleRegisterActivity = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!activityDescription.trim()) return;
      const payload: Parameters<typeof onRegisterActivity>[0] = {
        activityType,
        description: activityDescription.trim(),
      };
      if (activityNovelty) {
        payload.measurements = [{ key: 'novedad', value: true }];
      }
      await onRegisterActivity(payload);
      setActivityDescription('');
      setActivityNovelty(false);
    },
    [activityType, activityDescription, activityNovelty, onRegisterActivity],
  );

  const handleRegisterItem = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!itemId.trim()) return;
      const payload: Parameters<typeof onRegisterItemUsage>[0] = {
        itemId: itemId.trim(),
        technicianCustodyId: order?.assignee?.id ?? '',
        quantity: Number(itemQty) || 1,
        action: itemAction,
        finalDisposition: itemDisposition,
      };
      const s = itemSerial.trim();
      if (s) payload.serialNumber = s;
      await onRegisterItemUsage(payload);
      setItemId('');
      setItemQty('1');
      setItemSerial('');
    },
    [
      order?.assignee?.id,
      itemId,
      itemQty,
      itemSerial,
      itemAction,
      itemDisposition,
      onRegisterItemUsage,
    ],
  );

  const handleCloseConfirm = useCallback(async () => {
    if (!closeSummary.trim()) return;
    setCloseConfirmOpen(false);
    const payload: Parameters<typeof onCloseOrder>[0] = {
      result: closeResult,
      summary: closeSummary.trim(),
    };
    const rc = closeReason.trim();
    if (rc) payload.reasonCode = rc;
    await onCloseOrder(payload);
  }, [closeResult, closeReason, closeSummary, onCloseOrder]);

  const handleCreateFollowUp = useCallback(async () => {
    if (!followUpReason.trim()) return;
    await onCreateFollowUp(followUpReason.trim());
    setFollowUpReason('');
  }, [followUpReason, onCreateFollowUp]);

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <OperationalSidePeek
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={order?.number ?? 'OT de ejecucion'}
      description="Espacio de ejecucion de la orden de trabajo"
      size="wide"
      busy={isSubmitting}
    >
      {/* ── Loading ── */}
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando orden de trabajo">
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
        </div>
      ) : !order ? (
        /* ── Empty / Error ── */
        error ? (
          <PortalAlert variant="error" title="No fue posible cargar la OT" description={error} />
        ) : (
          <PortalEmptyState
            title="Sin OT seleccionada"
            description="Abre una orden de trabajo desde Agenda u Operaciones."
          />
        )
      ) : (
        /* ── Contenido ── */
        <div className="space-y-5">
          {/* Error inline */}
          {error && !isLoading ? (
            <PortalAlert
              variant="error"
              title="No fue posible completar la operacion"
              description={error}
            />
          ) : null}

          {/* Offline banner */}
          {offline && (
            <PortalAlert
              variant="warning"
              title="Sin conexion"
              description="Sin conexion; vuelve a intentar cuando recuperes la red."
            />
          )}

          {/* Forbidden */}
          {forbidden && (
            <PortalAlert
              variant="info"
              title="Sin acceso"
              description="No tienes acceso a esta orden."
            />
          )}

          {/* Sync state warning */}
          {order.syncState !== 'IN_SYNC' && (
            <PortalAlert
              variant={order.syncState === 'FAILED' ? 'error' : 'warning'}
              title="Sincronizacion"
              description={syncStateCopy(order.syncState)}
            />
          )}

          {/* ── Resumen ── */}
          <ExecutionOrderSummary order={order} readonly={terminal || offline} canOpen={false} />

          {/* ── 1. Compromiso ── */}
          <section
            aria-labelledby="eo-commitment-heading"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="eo-commitment-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Compromiso
            </h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Sitio
                </p>
                <p className="mt-1 text-sm text-gray-900 dark:text-white">
                  {order.site.label || order.site.address || 'Sitio autorizado'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Ventana
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {dateFormatter(order.schedule.window.startAt)} –{' '}
                  {dateFormatter(order.schedule.window.endAt)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Responsable
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {order.assignee?.displayLabel ?? 'Sin responsable asignado'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Tipo de trabajo
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {WORK_TYPE_LABELS[order.workType]}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Estado
                </p>
                <Badge className="mt-1" variant={statusBadgeVariant(order.status)}>
                  {STATUS_LABELS[order.status]}
                </Badge>
              </div>
              {order.result && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Resultado
                  </p>
                  <Badge className="mt-1" variant="neutral">
                    {RESULT_LABELS[order.result]}
                  </Badge>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Plantilla
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {template
                    ? `${template.label} · v${template.version}`
                    : `${order.template.label} · v${order.template.version}`}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                  Requisitos completados
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {order.completion.progress}%
                </p>
              </div>
            </div>
            {/* Start button */}
            {canInteract && canStart && (
              <Button
                type="button"
                className="mt-4"
                disabled={isSubmitting}
                loading={isSubmitting}
                onClick={() => void onStart('Inicio de ejecucion en campo')}
              >
                Iniciar ejecucion
              </Button>
            )}
            {/* Block/Unblock */}
            {canInteract && canUnblock && (
              <Button
                type="button"
                className="mt-4"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => onUnblock?.({ resolutionCode: 'RESUELTO_EN_CAMPO' })}
              >
                Desbloquear OT
              </Button>
            )}
            {canInteract && canBlock && (
              <Button
                type="button"
                className="mt-4"
                variant="softDestructive"
                disabled={isSubmitting}
                onClick={() => onBlock?.({ reasonCode: 'BLOQUEO_CAMPO' })}
              >
                Bloquear OT
              </Button>
            )}
          </section>

          {/* ── 2. Checklist ── */}
          <section
            aria-labelledby="eo-checklist-heading"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="eo-checklist-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Checklist de instalacion
            </h3>
            <div className="mt-3">
              <ProgressMeter
                value={order.completion.progress}
                label="Avance de requisitos"
                ariaLabel="Avance de requisitos de instalacion"
              />
            </div>
            {template && template.requirements.length > 0 && (
              <ul className="mt-4 space-y-1.5" role="list">
                {template.requirements.map((req) => (
                  <li
                    key={req.key}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                  >
                    {requirementIcon(req.kind)}
                    <span className="text-gray-700 dark:text-gray-200">{req.label}</span>
                    {req.required && (
                      <Badge variant="warning" className="ml-auto shrink-0 text-xs">
                        Requerido
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!template && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Revisa los requisitos de la plantilla aplicada antes de cerrar.
              </p>
            )}
          </section>

          {/* ── 3. Trabajo realizado ── */}
          <section
            aria-label="Trabajo realizado"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="eo-work-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Trabajo realizado
            </h3>
            {/* Activity list */}
            <div className="mt-3 space-y-2">
              {activities.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Aun no hay actividades registradas.
                </p>
              ) : (
                activities.map((act) => (
                  <article
                    key={act.id}
                    className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {act.activityType === 'INSTALLATION'
                          ? 'Instalacion'
                          : act.activityType === 'FIELD_NOTE'
                            ? 'Nota de campo'
                            : act.activityType === 'CONFIGURATION'
                              ? 'Configuracion'
                              : act.activityType === 'TESTING'
                                ? 'Prueba'
                                : act.activityType === 'NOVELTY'
                                  ? 'Novedad'
                                  : act.activityType}
                      </p>
                      <span className="shrink-0 text-xs text-gray-500 font-mono">
                        {dateFormatter(act.occurredAt ?? act.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                      {act.description}
                    </p>
                    {act.measurements && act.measurements.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {act.measurements.map((m, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-surface-3 dark:text-gray-400"
                          >
                            {m.key}: {String(m.value)}
                            {m.unit ? ` ${m.unit}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>

            {/* Registration form */}
            {canInteract && canRegisterActivity && (
              <form
                onSubmit={handleRegisterActivity}
                className="mt-4 space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border"
              >
                <p className="text-xs font-medium text-gray-500">Registrar nueva actividad</p>
                <Select
                  id="eo-activity-type"
                  label="Tipo de actividad"
                  value={activityType}
                  options={activityTypeOptions}
                  disabled={isSubmitting}
                  onChange={(e) => setActivityType(e.target.value)}
                />
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Descripcion de la actividad
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
                    value={activityDescription}
                    disabled={isSubmitting}
                    onChange={(e) => setActivityDescription(e.target.value)}
                    placeholder="Describe el trabajo realizado..."
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                    checked={activityNovelty}
                    onChange={(e) => setActivityNovelty(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  Marcar como novedad
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isSubmitting || activityDescription.trim().length === 0}
                >
                  Registrar actividad
                </Button>
              </form>
            )}
          </section>

          {/* ── 4. Equipos y materiales ── */}
          <section
            aria-labelledby="eo-materials-heading"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="eo-materials-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Equipos y materiales
            </h3>
            {/* Item usage list */}
            <div className="mt-3 space-y-2">
              {itemUsage.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Aun no hay consumos registrados.
                </p>
              ) : (
                itemUsage.map((usage) => (
                  <article
                    key={usage.id}
                    className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {usage.serial ?? usage.itemId}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {ITEM_ACTION_LABELS[usage.action] ?? usage.action} · Cantidad:{' '}
                          {usage.quantity}
                        </p>
                      </div>
                      <Badge
                        variant={
                          usage.movementStatus === 'CONFIRMED'
                            ? 'success'
                            : usage.movementStatus === 'REJECTED'
                              ? 'error'
                              : 'warning'
                        }
                      >
                        {MOVEMENT_STATUS_LABELS[usage.movementStatus] ?? usage.movementStatus}
                      </Badge>
                    </div>
                  </article>
                ))
              )}
            </div>

            {/* Inventory reconciliation */}
            {order.inventoryReconciliation !== 'NOT_REQUIRED' && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {DISPOSITION_LABELS[order.inventoryReconciliation] ?? order.inventoryReconciliation}
              </p>
            )}

            {/* Add item form */}
            {canInteract && canRegisterItems && (
              <form
                onSubmit={handleRegisterItem}
                className="mt-4 space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border"
              >
                <p className="text-xs font-medium text-gray-500">Agregar material o equipo</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    id="eo-item-id"
                    label="Item (SKU o descripcion)"
                    value={itemId}
                    disabled={isSubmitting}
                    onChange={(e) => setItemId(e.target.value)}
                    placeholder="ej. ONT-001"
                  />
                  <Input
                    id="eo-item-qty"
                    label="Cantidad"
                    type="number"
                    value={itemQty}
                    disabled={isSubmitting}
                    onChange={(e) => setItemQty(e.target.value)}
                  />
                  <Input
                    id="eo-item-serial"
                    label="Serial o lote"
                    value={itemSerial}
                    disabled={isSubmitting}
                    onChange={(e) => setItemSerial(e.target.value)}
                    placeholder="Opcional"
                  />
                  <Select
                    id="eo-item-disposition"
                    label="Destino"
                    value={itemDisposition}
                    options={dispositionOptions}
                    disabled={isSubmitting}
                    onChange={(e) => setItemDisposition(e.target.value as InventoryDisposition)}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isSubmitting || itemId.trim().length === 0}
                >
                  Registrar material
                </Button>
              </form>
            )}
          </section>

          {/* ── 5. Evidencia y conformidad ── */}
          <section
            aria-labelledby="eo-evidence-heading"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="eo-evidence-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Evidencia y conformidad
            </h3>

            {/* Evidence list */}
            <div className="mt-3 space-y-2">
              {evidence.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Sin evidencias registradas.
                </p>
              ) : (
                evidence.map((ev) => (
                  <article
                    key={ev.id}
                    className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                  >
                    {ev.evidenceType === 'PHOTO' ? (
                      <Camera className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                    ) : ev.evidenceType === 'SIGNATURE' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                    ) : (
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {ev.evidenceType === 'PHOTO'
                          ? 'Foto '
                          : ev.evidenceType === 'SIGNATURE'
                            ? 'Firma '
                            : 'Documento '}
                        · {ev.requirementKey}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {dateFormatter(ev.capturedAt ?? ev.receivedAt)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        ev.status === 'AVAILABLE'
                          ? 'success'
                          : ev.status === 'REJECTED'
                            ? 'error'
                            : ev.status === 'EXPIRED'
                              ? 'error'
                              : 'warning'
                      }
                    >
                      {EVIDENCE_STATUS_LABELS[ev.status] ?? ev.status}
                    </Badge>
                  </article>
                ))
              )}
            </div>

            {/* Geo reference */}
            {order.site.address && (
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{order.site.address}</span>
              </div>
            )}

            {/* Upload area */}
            {canInteract && canRegisterEvidence && (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-center dark:border-dark-border">
                <p className="text-sm text-gray-600 dark:text-gray-300">Adjuntar evidencia</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Arrastra fotos o documentos relacionados con la instalacion.
                </p>
                <input
                  ref={evidenceFileRef}
                  type="file"
                  aria-label="Adjuntar evidencia"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    const requirementKey =
                      template?.requirements?.filter((r) => r.kind === 'EVIDENCE')?.find(() => true)
                        ?.key ?? '';
                    void onUploadEvidence(files, requirementKey);
                    // Reset para permitir re-subir el mismo archivo
                    if (evidenceFileRef.current) {
                      evidenceFileRef.current.value = '';
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-2"
                  disabled={isSubmitting}
                  onClick={() => {
                    evidenceFileRef.current?.click();
                  }}
                >
                  Seleccionar archivos
                </Button>
              </div>
            )}
          </section>

          {/* ── 6. Cierre ── */}
          <section
            aria-labelledby="eo-close-heading"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="eo-close-heading"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Cierre
            </h3>

            {terminal ? (
              /* Readonly close block */
              <div className="mt-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  La OT esta cerrada y solo puede consultarse.
                </p>
                {order.result && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge
                      variant={
                        order.result === ExecutionOrderResult.EXECUTED
                          ? 'lime'
                          : order.result === ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS
                            ? 'warning'
                            : 'error'
                      }
                    >
                      {RESULT_LABELS[order.result]}
                    </Badge>
                  </div>
                )}
                {order.completion.closedAt && (
                  <p className="mt-1 text-xs text-gray-500">
                    Cerrada el {dateFormatter(order.completion.closedAt)}
                  </p>
                )}
                {canReadOnlyInteract && canFollowUp && (
                  <div className="mt-3 space-y-2">
                    <Input
                      id="eo-follow-up-reason"
                      label="Motivo de seguimiento"
                      value={followUpReason}
                      disabled={isSubmitting}
                      onChange={(e) => setFollowUpReason(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSubmitting || followUpReason.trim().length === 0}
                      onClick={handleCreateFollowUp}
                    >
                      Crear seguimiento
                    </Button>
                  </div>
                )}
              </div>
            ) : canInteract && canClose ? (
              /* Close form */
              <div className="mt-3 space-y-3">
                <Select
                  id="eo-close-result"
                  label="Resultado"
                  value={closeResult}
                  options={resultOptions}
                  disabled={isSubmitting}
                  onChange={(e) => setCloseResult(e.target.value as ExecutionOrderResult)}
                />
                <Input
                  id="eo-close-reason"
                  label="Causa (cuando no se ejecuta)"
                  value={closeReason}
                  disabled={isSubmitting}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="ej. Sin acceso al sitio"
                />
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Resumen de cierre
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-iwana-primary focus:ring-2 focus:ring-iwana-primary/20 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white"
                    value={closeSummary}
                    disabled={isSubmitting}
                    onChange={(e) => setCloseSummary(e.target.value)}
                    placeholder="Describe el resultado final del trabajo..."
                  />
                </label>

                {/* Incomplete requirements */}
                {template && order.completion.progress < 100 && (
                  <PortalAlert
                    variant="warning"
                    title="Requisitos pendientes"
                    description={`Aun faltan requisitos de la plantilla. Progreso actual: ${order.completion.progress}%`}
                  />
                )}

                {!closeConfirmOpen ? (
                  <Button
                    type="button"
                    disabled={isSubmitting || closeSummary.trim().length === 0}
                    onClick={() => setCloseConfirmOpen(true)}
                  >
                    Cerrar OT
                  </Button>
                ) : (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Confirmar cierre
                    </p>
                    <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                      Esta accion es definitiva. No podras editar la OT despues del cierre.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="softDestructive"
                        disabled={isSubmitting}
                        onClick={handleCloseConfirm}
                      >
                        Confirmar cierre
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isSubmitting}
                        onClick={() => setCloseConfirmOpen(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* No close permission */
              <div className="mt-3">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {offline ? 'Sin conexion.' : 'No puedes cerrar esta orden.'}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </OperationalSidePeek>
  );
}

// Reexport for convenience
export { ExecutionOrderDrawer as default };
