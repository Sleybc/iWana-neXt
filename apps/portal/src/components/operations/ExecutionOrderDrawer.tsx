'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Input,
  ProgressMeter,
  Select,
  SkeletonBlock,
  OperationalSidePeek,
} from '@iwana/ui';
import {
  ExecutionOrderResult,
  ExecutionOrderStatus,
  ExecutionOrderItemAction,
  InventoryDisposition,
  SerializedAssetStatus,
} from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ExecutionOrderTemplateRequirement,
  RegisterActivityCommand,
  ListMeta,
} from '@iwana/shared';
import type {
  CloseExecutionOrderDto,
  ExecutionOrderDetailResponse,
  RegisterExecutionOrderItemUsageDto,
  NonRealizationCause,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import type { ExecutionOrderMissingRequirement } from './OperationsClient';
import {
  PortalAlert,
  PortalEmptyState,
  PortalTablePagination,
} from '@/components/shared/portal-ui';
import { getSerializedAssetStatusLabel } from '@/components/inventory/inventory-labels';
import { ExecutionOrderSummary, type ExecutionOrderSyncState } from './ExecutionOrderSummary';
import { getExecutionOrderCompletionDisplay } from './execution-order-view';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_STATUS_VARIANTS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';
import { Camera, FileText, MapPin, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ExecutionOrderDrawerProps {
  open: boolean;
  order: ExecutionOrderDetailResponse | null;
  activities: ExecutionOrderActivity[];
  activitiesMeta?: ListMeta;
  itemUsage: ExecutionOrderItemUsage[];
  itemUsageMeta?: ListMeta;
  evidence?: ExecutionOrderEvidence[] | null;
  evidenceMeta?: ListMeta;
  evidenceState?: 'loading' | 'available' | 'unavailable';
  /** Estado de carga del inventario autorizado (ítems y custodias). */
  itemsState?: 'loading' | 'available' | 'unavailable';
  /** Estado de la custodia del ejecutor (sub-sección de solo lectura del bloque 4). */
  executorCustodyState?: 'loading' | 'available' | 'unavailable';
  /** Nombre de la ubicación móvil en custodia; null si no hay custodia activa. */
  executorCustodyName?: string | null;
  /** Equipos serializados en custodia (páginas acumuladas). */
  executorCustodyAssets?: SerializedAssetRecord[];
  executorCustodyAssetsMeta?: ListMeta;
  /** Materiales con stock en custodia (páginas acumuladas). */
  executorCustodyBalances?: StockBalanceRecord[];
  executorCustodyBalancesMeta?: ListMeta;
  isLoadingMoreExecutorCustody: boolean;
  onLoadMoreExecutorCustody: () => void | Promise<void>;
  template: ExecutionOrderTemplateVersion | null;
  missingRequirements?: ExecutionOrderMissingRequirement[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  successMessage?: string | null;
  offline: boolean;
  onClose: () => void;
  onRefreshDetail?: () => Promise<void>;
  isLoadingMoreActivities: boolean;
  isLoadingMoreItemUsage: boolean;
  isLoadingMoreEvidence: boolean;
  onLoadMoreActivities: () => void | Promise<void>;
  onLoadMoreItemUsage: () => void | Promise<void>;
  onLoadMoreEvidence: () => void | Promise<void>;
  onStart: (notes?: string | null) => Promise<void>;
  onRegisterActivity: (payload: RegisterActivityCommand) => Promise<void | boolean>;
  onUpdateActivity?: (
    activityId: string,
    payload: Partial<RegisterActivityCommand>,
  ) => Promise<void | boolean>;
  onDeleteActivity?: (activityId: string) => Promise<void | boolean>;
  onRegisterItemUsage: (payload: RegisterExecutionOrderItemUsageDto) => Promise<void | boolean>;
  onUploadEvidence: (file: File, requirementKey: string) => Promise<void | boolean>;
  onBlock?: (payload: { reasonCode: string; note?: string }) => Promise<void>;
  onUnblock?: (payload: { resolutionCode: string; note?: string }) => Promise<void>;
  onCloseOrder: (payload: CloseExecutionOrderDto) => Promise<void>;
  /** Opciones entregadas por el boundary de asignacion; no admite texto libre. */
  custodyOptions?: ExecutionOrderCustodyOption[];
  /** Opciones de inventario autorizadas; el formulario no acepta IDs escritos a mano. */
  itemOptions?: Array<{ value: string; label: string }>;
  /** ADR-077 — causas de no realización del catálogo. */
  nonRealizationCauses?: NonRealizationCause[] | null;
  /** ADR-077 — callback de subida de evidencia para intento fallido. */
  onUploadNonRealizationEvidence?: (file: File) => Promise<void | boolean>;
}

type CustomerAcceptanceMethod = NonNullable<CloseExecutionOrderDto['customerAcceptance']>['method'];

export interface ExecutionOrderCustodyOption {
  type: 'TECHNICIAN' | 'CREW';
  id: string;
  label: string;
}

// ─── Labels ─────────────────────────────────────────────────────────────────

const EVIDENCE_STATUS_LABELS: Record<string, string> = {
  PENDING_ANALYSIS: 'Pendiente de análisis',
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
  RETURNED_TO_TECHNICIAN_STOCK: 'Retorno a custodia técnica',
  RETURNED_TO_WAREHOUSE: 'Retorno a bodega',
  DAMAGED_OR_LOST: 'Dañado o perdido',
  NOT_REQUIRED: 'No requiere conciliación',
  PENDING: 'Conciliación pendiente',
  CONFIRMED: 'Conciliación confirmada',
  REJECTED: 'Conciliación rechazada',
  DIVERGED: 'Conciliación divergente',
};

const TERMINAL_STATUSES = new Set<ExecutionOrderStatus>([
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
]);

const EMPTY_EVIDENCE: ExecutionOrderEvidence[] = [];

// Hint pre-inicio compartido por los bloques 3/4/5; mismo vocabulario que el del checklist.
const PRE_START_HINT_DESCRIPTION =
  'El registro queda bloqueado hasta iniciar la ejecución. Pulsa Iniciar ejecución en Compromiso para comenzar.';

// ─── Helpers ────────────────────────────────────────────────────────────────

function actionAllowed(
  order: ExecutionOrderDetailResponse,
  action: ExecutionOrderAllowedAction,
): boolean {
  return order.allowedActions?.includes(action) === true;
}

function syncStateCopy(
  state: ExecutionOrderDetailResponse['syncState'] | null | undefined,
): string {
  switch (state) {
    case 'IN_SYNC':
      return 'Sincronizada';
    case 'PENDING':
      return 'Sincronización pendiente';
    case 'DIVERGED':
      return 'La orden cambió; revisa la versión vigente';
    case 'FAILED':
      return 'Error de sincronización';
    default:
      return 'Estado de sincronización no disponible';
  }
}

function toSummarySyncState(
  state: ExecutionOrderDetailResponse['syncState'] | null | undefined,
): ExecutionOrderSyncState | undefined {
  switch (state) {
    case 'IN_SYNC':
      return 'synced';
    case 'PENDING':
      return 'pending';
    case 'DIVERGED':
      return 'conflict';
    case 'FAILED':
      return 'error';
    default:
      return undefined;
  }
}

function requirementKindLabel(kind: string): string {
  switch (kind) {
    case 'FIELD':
      return 'Información requerida';
    case 'ACTIVITY':
      return 'Actividad requerida';
    case 'MEASUREMENT':
      return 'Medición requerida';
    case 'EVIDENCE':
      return 'Evidencia requerida';
    case 'MATERIAL':
      return 'Material o equipo requerido';
    case 'COMPLIANCE':
      return 'Aceptación del cliente';
    default:
      return 'Requisito pendiente';
  }
}

function requirementLabel(requirement: ExecutionOrderTemplateRequirement): string {
  const label = typeof requirement.label === 'string' ? requirement.label.trim() : '';
  return label || requirementKindLabel(requirement.kind);
}

function dateFormatter(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function templateRequiresCustomerAcceptance(
  template: ExecutionOrderTemplateVersion | null,
): boolean {
  return (
    template?.requirements.some(
      (requirement) => requirement.required && requirement.kind === 'COMPLIANCE',
    ) ?? false
  );
}

function closureRequiresCustomerAcceptance(
  result: ExecutionOrderResult,
  itemUsage: ExecutionOrderItemUsage[],
  template: ExecutionOrderTemplateVersion | null,
): boolean {
  const resultImpliesInstallation = [
    ExecutionOrderResult.EXECUTED,
    ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
  ].includes(result);
  const materialInstalledAtCustomer = itemUsage.some(
    (usage) => usage.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER,
  );

  return (
    templateRequiresCustomerAcceptance(template) ||
    (resultImpliesInstallation && materialInstalledAtCustomer)
  );
}

function isCustomerAcceptanceComplete(
  artifactId: string,
  method: CustomerAcceptanceMethod | '',
): boolean {
  return artifactId.trim().length > 0 && method === 'SIGNATURE';
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

function measurementLabel(value: number | string | boolean, unit?: string): string {
  return `Medición registrada: ${String(value)}${unit ? ` ${unit}` : ''}`;
}

function collectionCountLabel(visible: number, total: number, noun: string): string {
  return visible < total ? `Mostrando ${visible} de ${total} ${noun}` : `${total} ${noun}`;
}

/** Normaliza el string numérico de stock a una cifra legible sin ceros forzados. */
function custodyQuantityLabel(quantityOnHand: string): string {
  const value = Number(quantityOnHand);
  return Number.isFinite(value) ? String(value) : quantityOnHand;
}

// ─── Componente principal ───────────────────────────────────────────────────

export function ExecutionOrderDrawer({
  open,
  order,
  activities,
  activitiesMeta,
  itemUsage,
  itemUsageMeta,
  evidence,
  evidenceMeta,
  evidenceState = 'available',
  itemsState = 'available',
  executorCustodyState = 'available',
  executorCustodyName = null,
  executorCustodyAssets = [],
  executorCustodyAssetsMeta,
  executorCustodyBalances = [],
  executorCustodyBalancesMeta,
  isLoadingMoreExecutorCustody,
  onLoadMoreExecutorCustody,
  template = null,
  missingRequirements = [],
  isLoading,
  isSubmitting,
  error,
  successMessage = null,
  offline,
  onClose,
  onRefreshDetail,
  isLoadingMoreActivities,
  isLoadingMoreItemUsage,
  isLoadingMoreEvidence,
  onLoadMoreActivities,
  onLoadMoreItemUsage,
  onLoadMoreEvidence,
  onStart,
  onRegisterActivity,
  onUpdateActivity,
  onDeleteActivity,
  onRegisterItemUsage,
  onUploadEvidence,
  onBlock,
  onUnblock,
  onCloseOrder,
  custodyOptions,
  itemOptions = [],
  nonRealizationCauses = null,
  onUploadNonRealizationEvidence,
}: ExecutionOrderDrawerProps) {
  const normalizedEvidence = evidence ?? EMPTY_EVIDENCE;
  const terminal = order ? TERMINAL_STATUSES.has(order.status) : false;
  const forbidden = order ? order.allowedActions === null : false;
  const canInteract =
    !terminal && !offline && !forbidden && order !== null && order.syncState === 'IN_SYNC';

  const canStart = order ? actionAllowed(order, 'START') : false;
  const canRegisterActivity = order ? actionAllowed(order, 'REGISTER_ACTIVITY') : false;
  const canRegisterItems = order ? actionAllowed(order, 'REGISTER_ITEM_USAGE') : false;
  const canRegisterEvidence = order ? actionAllowed(order, 'REGISTER_EVIDENCE') : false;
  const canClose = order ? template !== null && actionAllowed(order, 'CLOSE') : false;
  const canBlock = order ? actionAllowed(order, 'BLOCK') : false;
  const canUnblock = order ? actionAllowed(order, 'UNBLOCK') : false;
  // Pre-inicio = CREATED | ASSIGNED | EN_ROUTE (PROMPT-MOD11 §4.4): única fuente
  // de verdad para el gate del checklist y los hints de los bloques 3/4/5.
  const hasStarted =
    order != null &&
    order.status !== ExecutionOrderStatus.CREATED &&
    order.status !== ExecutionOrderStatus.ASSIGNED &&
    order.status !== ExecutionOrderStatus.EN_ROUTE;
  const isChecklistActive = hasStarted || terminal;
  const isPreStart = order != null && !hasStarted && !terminal;
  const completion = getExecutionOrderCompletionDisplay(order?.completion);
  const evidenceRequirementKey =
    template?.requirements
      .find((requirement) => requirement.kind === 'EVIDENCE' && requirement.key.trim().length > 0)
      ?.key.trim() ?? null;
  const canUploadEvidence = canInteract && canRegisterEvidence && evidenceRequirementKey !== null;

  // ─── State local ────────────────────────────────────────────────────

  // Block 3 — Trabajo realizado
  const [activityType, setActivityType] = useState('INSTALLATION');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityNovelty, setActivityNovelty] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editActivityType, setEditActivityType] = useState('INSTALLATION');
  const [editActivityDescription, setEditActivityDescription] = useState('');
  const [editActivityNovelty, setEditActivityNovelty] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  // Pliegue manual del formulario de actividad; solo aplica cuando ya hay actividades.
  const [isActivityFormExpanded, setActivityFormExpanded] = useState(false);
  // Derivado sin efectos: sin actividades el formulario nace expandido; evita parpadeos
  // con carga async y, si se eliminan todas las actividades, vuelve a expandido por derivación.
  const activityFormExpanded = activities.length === 0 || isActivityFormExpanded;

  // Block 4 — Equipos y materiales
  const [itemId, setItemId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemSerial, setItemSerial] = useState('');
  const [itemAction, setItemAction] = useState<ExecutionOrderItemAction | ''>('');
  const [selectedCustodyId, setSelectedCustodyId] = useState('');
  const [itemDisposition, setItemDisposition] = useState<InventoryDisposition | ''>('');

  // Block 6 — Cierre
  const [closeResult, setCloseResult] = useState<ExecutionOrderResult>(
    ExecutionOrderResult.EXECUTED,
  );
  const [closeSummary, setCloseSummary] = useState('');
  const [customerAcceptanceArtifactId, setCustomerAcceptanceArtifactId] = useState('');
  const [customerAcceptanceMethod, setCustomerAcceptanceMethod] = useState<
    CustomerAcceptanceMethod | ''
  >('');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeValidationError, setCloseValidationError] = useState<string | null>(null);

  // ADR-077 — cierre con causa de no realización
  const [selectedNonRealizationCauseId, setSelectedNonRealizationCauseId] = useState('');
  const [nonRealizationNote, setNonRealizationNote] = useState('');
  const [nonRealizationEvidenceFile, setNonRealizationEvidenceFile] = useState<File | null>(null);
  const nonRealizationEvidenceRef = useRef<HTMLInputElement>(null);
  const isNotExecuted = closeResult === ExecutionOrderResult.NOT_EXECUTED;
  const selectedNonRealizationCause = isNotExecuted
    ? ((nonRealizationCauses ?? []).find((c) => c.id === selectedNonRealizationCauseId) ?? null)
    : null;
  const nonRealizationRequiresEvidence = selectedNonRealizationCause?.requiresEvidence === true;
  const nonRealizationCanConfirm =
    !isNotExecuted ||
    (selectedNonRealizationCauseId.length > 0 &&
      (!nonRealizationRequiresEvidence || nonRealizationEvidenceFile !== null));

  useEffect(() => {
    setItemAction('');
    setSelectedCustodyId('');
    setItemDisposition('');
  }, [order?.id]);

  // Evidencia — file input ref
  const evidenceFileRef = useRef<HTMLInputElement>(null);

  const activityTypeOptions = useMemo(
    () => [
      { value: 'INSTALLATION', label: 'Instalación' },
      { value: 'FIELD_NOTE', label: 'Nota de campo' },
      { value: 'CONFIGURATION', label: 'Configuración' },
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
      ...(nonRealizationCauses && nonRealizationCauses.length > 0
        ? [{ value: ExecutionOrderResult.NOT_EXECUTED, label: 'No ejecutada' }]
        : []),
    ],
    [nonRealizationCauses],
  );

  const customerAcceptanceRequired = closureRequiresCustomerAcceptance(
    closeResult,
    itemUsage,
    template,
  );

  const actionOptions = useMemo(
    () => [
      { value: ExecutionOrderItemAction.INSTALL, label: 'Instalar' },
      { value: ExecutionOrderItemAction.CONSUME, label: 'Consumir' },
      { value: ExecutionOrderItemAction.RETURN, label: 'Devolver' },
      { value: ExecutionOrderItemAction.REMOVE, label: 'Retirar' },
    ],
    [],
  );

  const resolvedCustodyOptions = useMemo<ExecutionOrderCustodyOption[]>(() => {
    if (custodyOptions && custodyOptions.length > 0) {
      return custodyOptions;
    }
    // Red de seguridad: si el boundary no aporta opciones, la custodia elegible
    // por contrato es el técnico/cuadrilla asignados a la OT.
    if (order?.assignee?.id && order.assignee.type) {
      return [
        {
          type: order.assignee.type,
          id: order.assignee.id,
          label: order.assignee.displayLabel ?? 'Custodia asignada',
        },
      ];
    }
    return [];
  }, [custodyOptions, order?.assignee]);

  // Nombres de ítem para la custodia del ejecutor: se resuelven contra las
  // opciones de inventario ya cargadas para la orden (sin llamadas extra).
  const custodyItemLabelById = useMemo(
    () => new Map(itemOptions.map((option) => [option.value, option.label])),
    [itemOptions],
  );

  const custodySelectOptions = useMemo(
    () => resolvedCustodyOptions.map(({ id, label }) => ({ value: id, label })),
    [resolvedCustodyOptions],
  );

  const dispositionOptions = useMemo(
    () => [
      { value: 'INSTALLED_AT_CUSTOMER', label: 'Instalado en cliente' },
      { value: 'INTERNAL_CONSUMPTION', label: 'Consumo interno' },
      { value: 'RETURNED_TO_TECHNICIAN_STOCK', label: 'Retorno a custodia técnica' },
      { value: 'RETURNED_TO_WAREHOUSE', label: 'Retorno a bodega' },
      { value: 'DAMAGED_OR_LOST', label: 'Dañado o perdido' },
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
      const result = await onRegisterActivity(payload);
      if (result === false) return;
      setActivityDescription('');
      setActivityNovelty(false);
      setActivityFormExpanded(false);
    },
    [activityType, activityDescription, activityNovelty, onRegisterActivity],
  );

  const handleStartEditActivity = useCallback((act: ExecutionOrderActivity) => {
    setEditingActivityId(act.id);
    setEditActivityType(act.activityType);
    setEditActivityDescription(act.description);
    const isNovelty = act.measurements?.some((m) => m.key === 'novedad' && m.value === true);
    setEditActivityNovelty(Boolean(isNovelty));
    setDeletingActivityId(null);
  }, []);

  const handleCancelEditActivity = useCallback(() => {
    setEditingActivityId(null);
    setEditActivityDescription('');
    setEditActivityNovelty(false);
  }, []);

  const handleSaveEditActivity = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!editingActivityId || !editActivityDescription.trim() || !onUpdateActivity) return;
      const payload: Partial<RegisterActivityCommand> = {
        activityType: editActivityType,
        description: editActivityDescription.trim(),
      };
      // measurements manejo simplificado: si marca novedad, enviarla; si no, omitir
      if (editActivityNovelty) {
        (payload as RegisterActivityCommand).measurements = [{ key: 'novedad', value: true }];
      }
      const result = await onUpdateActivity(editingActivityId, payload);
      if (result === false) return;
      setEditingActivityId(null);
    },
    [
      editingActivityId,
      editActivityType,
      editActivityDescription,
      editActivityNovelty,
      onUpdateActivity,
    ],
  );

  const handleConfirmDeleteActivity = useCallback(
    async (activityId: string) => {
      if (!onDeleteActivity) return;
      const result = await onDeleteActivity(activityId);
      if (result === false) return;
      setDeletingActivityId(null);
      if (editingActivityId === activityId) setEditingActivityId(null);
    },
    [onDeleteActivity, editingActivityId],
  );

  const handleRegisterItem = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const quantity = Number(itemQty);
      if (
        !itemId.trim() ||
        !itemAction ||
        !selectedCustodyId ||
        !itemDisposition ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return;
      }
      const payload: Parameters<typeof onRegisterItemUsage>[0] = {
        itemId: itemId.trim(),
        technicianCustodyId: selectedCustodyId,
        quantity,
        action: itemAction,
        finalDisposition: itemDisposition as InventoryDisposition,
      };
      const s = itemSerial.trim();
      if (s) payload.serialNumber = s;
      const result = await onRegisterItemUsage(payload);
      if (result === false) {
        // El boundary puede informar un fallo sin lanzar; restituimos explícitamente la captura
        // para que el operador pueda corregirla o actualizar el detalle sin perderla.
        setItemId(itemId);
        setItemQty(itemQty);
        setItemSerial(itemSerial);
        setItemAction(itemAction);
        setSelectedCustodyId(selectedCustodyId);
        setItemDisposition(itemDisposition);
        return;
      }
      setItemId('');
      setItemQty('1');
      setItemSerial('');
      setItemAction('');
      setSelectedCustodyId('');
    },
    [
      itemId,
      itemQty,
      itemSerial,
      itemAction,
      selectedCustodyId,
      itemDisposition,
      onRegisterItemUsage,
    ],
  );

  const itemQuantityError =
    itemQty.trim().length === 0
      ? 'Ingresa una cantidad entera mayor que cero.'
      : !Number.isInteger(Number(itemQty)) || Number(itemQty) <= 0
        ? 'La cantidad debe ser entera y mayor que cero.'
        : null;

  const handleCloseConfirm = useCallback(async () => {
    if (!closeSummary.trim()) return;

    // La confirmación puede permanecer abierta mientras cambia el formulario. Revalidar aquí
    // contra el requisito contractual evita enviar un cierre sin aceptación cuando la plantilla
    // exige conformidad del cliente.
    const customerAcceptanceRequiredAtSend = closureRequiresCustomerAcceptance(
      closeResult,
      itemUsage,
      template,
    );
    const artifactId = customerAcceptanceArtifactId.trim();
    const acceptanceMethod = customerAcceptanceMethod;
    const acceptanceProvided = artifactId.length > 0 || acceptanceMethod !== '';
    const acceptanceComplete = isCustomerAcceptanceComplete(artifactId, acceptanceMethod);
    if (
      (customerAcceptanceRequiredAtSend && !acceptanceComplete) ||
      (acceptanceProvided && !acceptanceComplete)
    ) {
      setCloseValidationError(
        'La aceptación del cliente debe incluir una firma disponible y validada en esta orden.',
      );
      return;
    }

    setCloseValidationError(null);
    setCloseConfirmOpen(false);
    const payload: Parameters<typeof onCloseOrder>[0] = {
      result: closeResult,
      summary: closeSummary.trim(),
    };
    if (isNotExecuted && selectedNonRealizationCauseId) {
      payload.reasonCode = selectedNonRealizationCauseId;
      if (selectedNonRealizationCause) {
        payload.followUp = {
          reasonCode: selectedNonRealizationCause.code,
        };
      }
    }
    if (acceptanceComplete) {
      payload.customerAcceptance = {
        artifactId,
        method: 'SIGNATURE',
      };
    }
    await onCloseOrder(payload);
  }, [
    closeResult,
    closeSummary,
    customerAcceptanceArtifactId,
    customerAcceptanceMethod,
    itemUsage,
    template,
    onCloseOrder,
    isNotExecuted,
    selectedNonRealizationCauseId,
    selectedNonRealizationCause,
  ]);

  const customerAcceptanceProvided =
    customerAcceptanceArtifactId.trim().length > 0 || customerAcceptanceMethod !== '';
  const customerAcceptanceIncomplete =
    customerAcceptanceRequired || customerAcceptanceProvided
      ? !isCustomerAcceptanceComplete(customerAcceptanceArtifactId, customerAcceptanceMethod)
      : false;

  const customerAcceptanceMethodOptions = useMemo(
    () => [{ value: 'SIGNATURE', label: 'Firma' }],
    [],
  );

  const customerSignatureEvidence = useMemo(
    () =>
      normalizedEvidence.filter(
        (ev) =>
          ev.status === 'AVAILABLE' &&
          ev.evidenceType === 'SIGNATURE' &&
          ev.requirementKey === 'CUSTOMER_SIGNATURE',
      ),
    [normalizedEvidence],
  );

  const customerAcceptanceEvidenceOptions = useMemo(
    () =>
      customerSignatureEvidence.map((ev) => ({
        value: ev.mediaAssetId,
        label: `Firma del cliente · ${dateFormatter(ev.capturedAt ?? ev.receivedAt)}`,
      })),
    [customerSignatureEvidence],
  );

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <OperationalSidePeek
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={forbidden ? 'Orden de trabajo' : (order?.number ?? 'OT')}
      description="Registra y consulta el trabajo realizado en la OT"
      size="wide"
      busy={isSubmitting}
    >
      {/* ── Loading ── */}
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando orden de trabajo">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-48" />
        </div>
      ) : !order ? (
        /* ── Empty / Error ── */
        error ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar la OT"
            description={error}
            action={
              onRefreshDetail ? (
                <Button type="button" onClick={() => void onRefreshDetail()}>
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        ) : (
          <PortalEmptyState
            title="Sin OT seleccionada"
            description="Abre una orden de trabajo desde Agenda u Operaciones."
          />
        )
      ) : forbidden ? (
        <PortalAlert
          variant="info"
          title="Sin acceso"
          description="No tienes acceso a esta orden."
        />
      ) : (
        /* ── Contenido ── */
        <div className="space-y-5">
          {/* Error inline */}
          {error && !isLoading ? (
            <PortalAlert
              variant="error"
              title="No fue posible completar la operación"
              description={error}
              action={
                onRefreshDetail ? (
                  <Button type="button" onClick={() => void onRefreshDetail()}>
                    Actualizar detalle
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {successMessage ? (
            <PortalAlert
              variant="success"
              title="Operación completada"
              description={successMessage}
            />
          ) : null}

          {/* Offline banner */}
          {offline && (
            <PortalAlert
              variant="warning"
              title="Sin conexión"
              description="Sin conexión; vuelve a intentar cuando recuperes la red."
            />
          )}

          {/* Sync state warning */}
          {order.syncState !== 'IN_SYNC' && (
            <PortalAlert
              variant={order.syncState === 'FAILED' ? 'error' : 'warning'}
              title="Sincronización"
              description={`${syncStateCopy(order.syncState)}. Solo puedes consultar o actualizar el detalle.`}
            />
          )}

          {/* ── Resumen ── */}
          <ExecutionOrderSummary
            order={order}
            syncState={toSummarySyncState(order.syncState)}
            readonly={terminal || offline || order.syncState !== 'IN_SYNC'}
            canOpen={false}
            hideProgress
          />

          {/* ── 1. Compromiso — sin duplicar resumen superior ── */}
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
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Sitio, ventana, responsable y plantilla se resumen arriba. Aquí solo el estado
              operativo y la acción.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="portal-eyebrow-muted">Tipo de trabajo</p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  {EXECUTION_ORDER_WORK_TYPE_LABELS[order.workType] ?? 'Trabajo operativo'}
                </p>
              </div>
              <div>
                <p className="portal-eyebrow-muted">Estado</p>
                <Badge className="mt-1" variant={EXECUTION_ORDER_STATUS_VARIANTS[order.status]}>
                  {EXECUTION_ORDER_STATUS_LABELS[order.status] ?? 'Estado operativo'}
                </Badge>
              </div>
              {order.result && (
                <div>
                  <p className="portal-eyebrow-muted">Resultado</p>
                  <Badge className="mt-1" variant={EXECUTION_ORDER_RESULT_VARIANTS[order.result]}>
                    {EXECUTION_ORDER_RESULT_LABELS[order.result] ?? 'Resultado registrado'}
                  </Badge>
                </div>
              )}
            </div>
            {/* Start button */}
            {canInteract && canStart ? (
              <Button
                type="button"
                className="mt-4"
                disabled={isSubmitting}
                loading={isSubmitting}
                onClick={() => void onStart('Inicio de ejecución en campo')}
              >
                Iniciar ejecución
              </Button>
            ) : canInteract &&
              !terminal &&
              !canStart &&
              order.status !== ExecutionOrderStatus.BLOCKED ? (
              <PortalAlert
                variant="info"
                className="mt-4"
                title="No puedes iniciar esta orden"
                description={
                  !order.assignee
                    ? 'La orden no tiene técnico asignado. Un supervisor debe asignarla o cualquier técnico del pool puede reclamarla al iniciar.'
                    : 'Solo el técnico asignado puede iniciar la ejecución cuando la orden está sincronizada.'
                }
              />
            ) : null}
            {/* Block/Unblock */}
            {canInteract && canUnblock && onUnblock && (
              <div className="mt-4 space-y-3">
                <PortalAlert
                  variant="warning"
                  title="Desbloqueo no disponible"
                  description="El catálogo de motivos aún no informa qué opciones aplican a este comando."
                />
              </div>
            )}
            {canInteract && canBlock && onBlock && (
              <div className="mt-4 space-y-3">
                <PortalAlert
                  variant="warning"
                  title="Bloqueo no disponible"
                  description="El catálogo de motivos aún no informa qué opciones aplican a este comando."
                />
              </div>
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
              Checklist de instalación
            </h3>
            {!isChecklistActive && (
              <PortalAlert
                variant="info"
                title="Inicia la ejecución para habilitar el checklist"
                description="Aquí consultarás los requisitos; el registro queda bloqueado hasta el inicio. Pulsa Iniciar ejecución en Compromiso para comenzar."
                className="mt-3"
              />
            )}
            <div
              className={isChecklistActive ? 'mt-3' : 'mt-3 opacity-60 pointer-events-none'}
              {...(!isChecklistActive ? { 'aria-disabled': 'true' } : {})}
            >
              <ProgressMeter
                value={completion.value}
                label="Avance de requisitos"
                ariaLabel="Avance de requisitos de instalación"
              />
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                Completados: {completion.label}
              </p>
              {template && template.requirements.length > 0 && (
                <ul className="mt-4 space-y-1.5" role="list">
                  {template.requirements.map((req) => (
                    <li
                      key={req.key}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                    >
                      {requirementIcon(req.kind)}
                      <span className="text-gray-700 dark:text-gray-200">
                        {requirementLabel(req)}
                      </span>
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
                <PortalEmptyState
                  className="mt-3"
                  title="Requisitos no disponibles"
                  description="Revisa la plantilla aplicada antes de cerrar la orden."
                />
              )}
            </div>
            {isChecklistActive && missingRequirements.length > 0 && (
              <div className="mt-4 space-y-2" role="alert" aria-label="Requisitos pendientes">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Para cerrar la OT, completa lo siguiente:
                </p>
                <ul className="space-y-2" role="list">
                  {missingRequirements.map((requirement) => (
                    <li
                      key={requirement.requirementId}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/30"
                    >
                      <p className="font-medium text-amber-950 dark:text-amber-100">
                        {requirement.label?.trim() || requirementKindLabel(requirement.kind)}
                      </p>
                      <p className="mt-0.5 text-amber-900 dark:text-amber-200">
                        {requirement.reason?.trim() ||
                          'Completa el requisito pendiente antes de cerrar la orden.'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
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
            {isPreStart && (
              <PortalAlert
                variant="info"
                title="Inicia la ejecución para registrar el trabajo realizado"
                description={PRE_START_HINT_DESCRIPTION}
                className="mt-3"
              />
            )}
            {/* Activity list */}
            <div className="mt-3 space-y-2">
              {activitiesMeta && activitiesMeta.total > 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                  {collectionCountLabel(activities.length, activitiesMeta.total, 'actividades')}
                </p>
              ) : null}
              {activities.length === 0 ? (
                <PortalEmptyState
                  title="Aún no hay actividades registradas"
                  description="Registra el trabajo realizado para conservar la trazabilidad de la ejecución."
                />
              ) : (
                activities.map((act) => {
                  const isEditing = editingActivityId === act.id;
                  const isDeleting = deletingActivityId === act.id;
                  return (
                    <article
                      key={act.id}
                      className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                    >
                      {isEditing ? (
                        <form onSubmit={handleSaveEditActivity} className="space-y-3">
                          <Select
                            id={`eo-edit-activity-type-${act.id}`}
                            label="Tipo de actividad"
                            value={editActivityType}
                            options={activityTypeOptions}
                            disabled={isSubmitting}
                            onChange={(e) => setEditActivityType(e.target.value)}
                          />
                          <Input
                            id={`eo-edit-activity-description-${act.id}`}
                            label="Descripción"
                            value={editActivityDescription}
                            disabled={isSubmitting}
                            onChange={(e) => setEditActivityDescription(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={editActivityNovelty ? 'secondary' : 'ghost'}
                              aria-pressed={editActivityNovelty}
                              disabled={isSubmitting}
                              onClick={() => setEditActivityNovelty((c) => !c)}
                            >
                              Marcar como novedad
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              variant="primary"
                              disabled={isSubmitting || editActivityDescription.trim().length === 0}
                            >
                              Guardar
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={isSubmitting}
                              onClick={handleCancelEditActivity}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {act.activityType === 'INSTALLATION'
                                ? 'Instalación'
                                : act.activityType === 'FIELD_NOTE'
                                  ? 'Nota de campo'
                                  : act.activityType === 'CONFIGURATION'
                                    ? 'Configuración'
                                    : act.activityType === 'TESTING'
                                      ? 'Prueba'
                                      : act.activityType === 'NOVELTY'
                                        ? 'Novedad'
                                        : 'Actividad de campo'}
                            </p>
                            <span className="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400">
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
                                  {measurementLabel(m.value, m.unit)}
                                </span>
                              ))}
                            </div>
                          )}
                          {canInteract &&
                            canRegisterActivity &&
                            (onUpdateActivity || onDeleteActivity) && (
                              <div className="mt-2 flex gap-2">
                                {onUpdateActivity && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isSubmitting}
                                    onClick={() => handleStartEditActivity(act)}
                                  >
                                    Modificar
                                  </Button>
                                )}
                                {onDeleteActivity && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={isSubmitting}
                                    onClick={() => setDeletingActivityId(act.id)}
                                  >
                                    Eliminar
                                  </Button>
                                )}
                              </div>
                            )}
                          {isDeleting && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                              <p className="text-sm text-red-800 dark:text-red-200">
                                ¿Eliminar este trabajo realizado? Esta acción no se puede deshacer.
                              </p>
                              <div className="mt-2 flex gap-2">
                                <Button
                                  type="button"
                                  variant="softDestructive"
                                  size="sm"
                                  disabled={isSubmitting}
                                  onClick={() => void handleConfirmDeleteActivity(act.id)}
                                >
                                  Confirmar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isSubmitting}
                                  onClick={() => setDeletingActivityId(null)}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  );
                })
              )}
              <PortalTablePagination
                hasMore={activitiesMeta?.hasMore === true}
                onLoadMore={() => void onLoadMoreActivities()}
                loading={isLoadingMoreActivities}
                resourceLabel="actividades"
                shown={activities.length}
                total={activitiesMeta?.total}
              />
            </div>

            {/* Registration form — replegado tras el toggle cuando ya hay actividades */}
            {canInteract && canRegisterActivity && activities.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="mt-4"
                aria-expanded={activityFormExpanded}
                onClick={() => setActivityFormExpanded(true)}
              >
                Registrar nueva actividad
              </Button>
            )}
            {canInteract && canRegisterActivity && activityFormExpanded && (
              <form
                onSubmit={handleRegisterActivity}
                className="mt-4 space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border"
              >
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Registrar nueva actividad
                </p>
                <Select
                  id="eo-activity-type"
                  label="Tipo de actividad"
                  value={activityType}
                  options={activityTypeOptions}
                  disabled={isSubmitting}
                  onChange={(e) => setActivityType(e.target.value)}
                />
                <Input
                  id="eo-activity-description"
                  label="Descripción de la actividad"
                  value={activityDescription}
                  disabled={isSubmitting}
                  onChange={(e) => setActivityDescription(e.target.value)}
                  placeholder="Describe el trabajo realizado..."
                />
                <Button
                  type="button"
                  variant={activityNovelty ? 'secondary' : 'ghost'}
                  aria-pressed={activityNovelty}
                  disabled={isSubmitting}
                  onClick={() => setActivityNovelty((current) => !current)}
                >
                  Marcar como novedad
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting || activityDescription.trim().length === 0}
                  >
                    Registrar actividad
                  </Button>
                  {activities.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={() => setActivityFormExpanded(false)}
                    >
                      Ocultar
                    </Button>
                  )}
                </div>
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
            {/* Custodia del ejecutor: lectura pura, visible también en pre-inicio
                y oculta en estados terminales junto al resto de acciones. */}
            {!terminal && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  En custodia del ejecutor
                </p>
                {executorCustodyState === 'unavailable' ? (
                  <PortalAlert
                    variant="warning"
                    title="Custodia no disponible"
                    description="No pudimos consultar la custodia del ejecutor. El resto de la orden sigue disponible."
                    action={
                      onRefreshDetail ? (
                        <Button type="button" onClick={() => void onRefreshDetail()}>
                          Actualizar detalle
                        </Button>
                      ) : undefined
                    }
                    className="mt-2"
                  />
                ) : executorCustodyState === 'loading' ? (
                  <div
                    aria-busy="true"
                    aria-label="Cargando custodia del ejecutor"
                    className="mt-2"
                  >
                    <SkeletonBlock className="h-20" />
                  </div>
                ) : executorCustodyAssets.length === 0 && executorCustodyBalances.length === 0 ? (
                  <PortalEmptyState
                    className="mt-2"
                    title="El ejecutor no tiene equipos ni materiales en custodia"
                    description="Lo asignado desde inventario aparecerá aquí."
                  />
                ) : (
                  <div className="mt-2 space-y-2">
                    {executorCustodyName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {executorCustodyName}
                      </p>
                    )}
                    {executorCustodyAssets.length > 0 && (
                      <>
                        {executorCustodyAssetsMeta && executorCustodyAssetsMeta.total > 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                            {collectionCountLabel(
                              executorCustodyAssets.length,
                              executorCustodyAssetsMeta.total,
                              'equipos',
                            )}
                          </p>
                        ) : null}
                        {executorCustodyAssets.map((asset) => (
                          <article
                            key={asset.id}
                            className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {asset.serialNumber ?? 'Equipo en custodia'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {[
                                  custodyItemLabelById.get(asset.inventoryItemId),
                                  getSerializedAssetStatusLabel(asset.currentStatus),
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                    {executorCustodyBalances.length > 0 && (
                      <>
                        {executorCustodyBalancesMeta && executorCustodyBalancesMeta.total > 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                            {collectionCountLabel(
                              executorCustodyBalances.length,
                              executorCustodyBalancesMeta.total,
                              'materiales',
                            )}
                          </p>
                        ) : null}
                        {executorCustodyBalances.map((balance) => (
                          <article
                            key={balance.id}
                            className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {custodyItemLabelById.get(balance.itemId) ?? 'Material en custodia'}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Cantidad disponible: {custodyQuantityLabel(balance.quantityOnHand)}
                              </p>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                    <PortalTablePagination
                      hasMore={
                        executorCustodyAssetsMeta?.hasMore === true ||
                        executorCustodyBalancesMeta?.hasMore === true
                      }
                      onLoadMore={() => void onLoadMoreExecutorCustody()}
                      loading={isLoadingMoreExecutorCustody}
                      resourceLabel="elementos en custodia"
                      shown={executorCustodyAssets.length + executorCustodyBalances.length}
                      total={
                        (executorCustodyAssetsMeta?.total ?? 0) +
                        (executorCustodyBalancesMeta?.total ?? 0)
                      }
                    />
                  </div>
                )}
              </div>
            )}
            {isPreStart && (
              <PortalAlert
                variant="info"
                title="Inicia la ejecución para registrar equipos y materiales"
                description={PRE_START_HINT_DESCRIPTION}
                className="mt-3"
              />
            )}
            {/* Item usage list */}
            <div className="mt-3 space-y-2">
              {itemUsageMeta && itemUsageMeta.total > 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                  {collectionCountLabel(itemUsage.length, itemUsageMeta.total, 'consumos')}
                </p>
              ) : null}
              {itemUsage.length === 0 ? (
                <PortalEmptyState
                  title="Aún no hay consumos registrados"
                  description="Los equipos y materiales registrados aparecerán aquí."
                />
              ) : (
                itemUsage.map((usage) => (
                  <article
                    key={usage.id}
                    className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {usage.serial ?? 'Material registrado'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {ITEM_ACTION_LABELS[usage.action] ?? 'Movimiento registrado'} · Cantidad:{' '}
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
                        {MOVEMENT_STATUS_LABELS[usage.movementStatus] ??
                          'Pendiente de conciliación'}
                      </Badge>
                    </div>
                  </article>
                ))
              )}
              <PortalTablePagination
                hasMore={itemUsageMeta?.hasMore === true}
                onLoadMore={() => void onLoadMoreItemUsage()}
                loading={isLoadingMoreItemUsage}
                resourceLabel="consumos"
                shown={itemUsage.length}
                total={itemUsageMeta?.total}
              />
            </div>

            {/* Inventory reconciliation */}
            {order.inventoryReconciliation !== 'NOT_REQUIRED' && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {DISPOSITION_LABELS[order.inventoryReconciliation] ?? 'Estado de conciliación'}
              </p>
            )}

            {/* Add item form */}
            {canInteract && canRegisterItems && (
              <form
                onSubmit={handleRegisterItem}
                className="mt-4 space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border"
              >
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Agregar material o equipo
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Select
                    id="eo-item-id"
                    label="Ítem"
                    value={itemId}
                    options={itemOptions}
                    placeholder={
                      itemsState === 'loading'
                        ? 'Cargando inventario…'
                        : itemsState === 'unavailable'
                          ? 'Inventario no disponible'
                          : 'No hay ítems activos disponibles'
                    }
                    {...(itemsState === 'unavailable'
                      ? {
                          helperText:
                            'No fue posible cargar el inventario autorizado; actualiza el detalle para reintentar.',
                        }
                      : itemsState === 'loading'
                        ? {
                            helperText: 'Cargando los ítems autorizados para esta orden.',
                          }
                        : itemOptions.length === 0
                          ? {
                              helperText:
                                'La organización no tiene ítems activos autorizados para movimientos.',
                            }
                          : {
                              helperText:
                                'Selecciona un ítem autorizado para registrar el movimiento.',
                            })}
                    disabled={
                      isSubmitting || itemsState !== 'available' || itemOptions.length === 0
                    }
                    onChange={(e) => setItemId(e.target.value)}
                  />
                  <Input
                    id="eo-item-qty"
                    label="Cantidad"
                    type="number"
                    min="1"
                    step="1"
                    value={itemQty}
                    error={itemQuantityError ?? undefined}
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
                    id="eo-item-action"
                    label="Acción"
                    value={itemAction}
                    placeholder="Selecciona una acción"
                    options={actionOptions}
                    disabled={isSubmitting}
                    onChange={(e) => setItemAction(e.target.value as ExecutionOrderItemAction)}
                  />
                  <Select
                    id="eo-item-custody"
                    label="Custodia de origen"
                    value={selectedCustodyId}
                    placeholder={
                      resolvedCustodyOptions.length > 0
                        ? 'Selecciona una custodia'
                        : 'No hay custodia elegible'
                    }
                    options={custodySelectOptions}
                    disabled={isSubmitting || resolvedCustodyOptions.length === 0}
                    {...(resolvedCustodyOptions.length === 0
                      ? {
                          helperText:
                            'La orden no tiene una custodia técnica o de cuadrilla elegible.',
                        }
                      : {})}
                    onChange={(e) => setSelectedCustodyId(e.target.value)}
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
                  variant="primary"
                  disabled={
                    isSubmitting ||
                    itemId.trim().length === 0 ||
                    itemQuantityError !== null ||
                    !itemAction ||
                    !selectedCustodyId ||
                    !itemDisposition
                  }
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
            {isPreStart && (
              <PortalAlert
                variant="info"
                title="Inicia la ejecución para registrar evidencia"
                description={PRE_START_HINT_DESCRIPTION}
                className="mt-3"
              />
            )}

            {/* Evidence list */}
            <div className="mt-3 space-y-2">
              {evidenceState === 'unavailable' ? (
                <PortalAlert
                  variant="warning"
                  title="Evidencias no disponibles"
                  description="No pudimos consultar las evidencias en este momento. La OT sigue disponible y podrás intentarlo cuando el servicio esté disponible."
                  action={
                    onRefreshDetail ? (
                      <Button type="button" onClick={() => void onRefreshDetail()}>
                        Actualizar detalle
                      </Button>
                    ) : undefined
                  }
                />
              ) : evidenceState === 'loading' ? (
                <div aria-busy="true" aria-label="Cargando evidencias">
                  <SkeletonBlock className="h-20" />
                </div>
              ) : normalizedEvidence.length === 0 ? (
                <PortalEmptyState
                  title="Sin evidencias registradas"
                  description="Adjunta fotos o documentos cuando formen parte de los requisitos de la orden."
                />
              ) : (
                <>
                  {evidenceMeta && evidenceMeta.total > 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400" role="status">
                      {collectionCountLabel(
                        normalizedEvidence.length,
                        evidenceMeta.total,
                        'evidencias',
                      )}
                    </p>
                  ) : null}
                  {normalizedEvidence.map((ev) => (
                    <article
                      key={ev.id}
                      className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                    >
                      {ev.evidenceType === 'PHOTO' ? (
                        <Camera className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                      ) : ev.evidenceType === 'SIGNATURE' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                      ) : (
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {ev.evidenceType === 'PHOTO'
                            ? 'Foto '
                            : ev.evidenceType === 'SIGNATURE'
                              ? 'Firma '
                              : 'Documento '}
                          ·{' '}
                          {(() => {
                            const requirement = template?.requirements.find(
                              (req) => req.key === ev.requirementKey,
                            );
                            return requirement
                              ? requirementLabel(requirement)
                              : 'Evidencia asociada';
                          })()}
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
                        {EVIDENCE_STATUS_LABELS[ev.status] ?? 'Estado no disponible'}
                      </Badge>
                    </article>
                  ))}
                  <PortalTablePagination
                    hasMore={evidenceMeta?.hasMore === true}
                    onLoadMore={() => void onLoadMoreEvidence()}
                    loading={isLoadingMoreEvidence}
                    resourceLabel="evidencias"
                    shown={normalizedEvidence.length}
                    total={evidenceMeta?.total}
                  />
                </>
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
            {canInteract && canRegisterEvidence && !canUploadEvidence && (
              <PortalAlert
                variant="warning"
                title={
                  template ? 'Requisito de evidencia no disponible' : 'Plantilla no disponible'
                }
                description={
                  template
                    ? 'No hay un requisito de evidencia válido para asociar el archivo. Actualiza el detalle antes de intentarlo.'
                    : 'No es posible asociar evidencia sin la plantilla aplicada. Actualiza el detalle antes de intentarlo.'
                }
                action={
                  onRefreshDetail ? (
                    <Button type="button" onClick={() => void onRefreshDetail()}>
                      Actualizar detalle
                    </Button>
                  ) : undefined
                }
              />
            )}
            {canUploadEvidence && (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-center dark:border-dark-border">
                <p className="text-sm text-gray-600 dark:text-gray-300">Adjuntar evidencia</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Arrastra fotos o documentos relacionados con la instalación.
                </p>
                <input
                  ref={evidenceFileRef}
                  type="file"
                  aria-label="Adjuntar evidencia"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!evidenceRequirementKey) return;
                    void onUploadEvidence(file, evidenceRequirementKey).then((result) => {
                      if (result === false) return;
                      // Reset para permitir re-subir el mismo archivo tras un registro exitoso.
                      if (evidenceFileRef.current) {
                        evidenceFileRef.current.value = '';
                      }
                    });
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
                  La OT está cerrada y solo puede consultarse.
                </p>
                {order.result && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[order.result]}>
                      {EXECUTION_ORDER_RESULT_LABELS[order.result] ?? 'Resultado registrado'}
                    </Badge>
                  </div>
                )}
                {order.completion.closedAt && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Cerrada el {dateFormatter(order.completion.closedAt)}
                  </p>
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
                  onChange={(e) => {
                    const next = e.target.value as ExecutionOrderResult;
                    setCloseResult(next);
                    if (next !== ExecutionOrderResult.NOT_EXECUTED) {
                      setSelectedNonRealizationCauseId('');
                      setNonRealizationNote('');
                      setNonRealizationEvidenceFile(null);
                    }
                  }}
                />
                {isNotExecuted && nonRealizationCauses && nonRealizationCauses.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Causa de la visita no realizada
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Elige la causa antes de confirmar el cierre. Es obligatoria para conservar la
                      trazabilidad.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {nonRealizationCauses.map((cause) => {
                        const isSelected = cause.id === selectedNonRealizationCauseId;
                        const categoryLabel =
                          cause.category === 'CUSTOMER'
                            ? 'Cliente'
                            : cause.category === 'OPERATIONAL'
                              ? 'Operación'
                              : 'Fuerza mayor';
                        return (
                          <button
                            key={cause.id}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={isSubmitting}
                            onClick={() => setSelectedNonRealizationCauseId(cause.id)}
                            className={`rounded-xl border p-3 text-left text-sm transition-colors min-h-[44px] ${
                              isSelected
                                ? 'border-iwana-primary bg-iwana-primary-50/60 dark:border-iwana-primary-300 dark:bg-iwana-primary-900/15'
                                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-dark-border dark:bg-dark-surface-2'
                            }`}
                          >
                            <span className="block font-medium text-gray-900 dark:text-white">
                              {cause.label}
                            </span>
                            <span className="block mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {categoryLabel}
                              {cause.requiresEvidence ? ' · Requiere evidencia' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {nonRealizationRequiresEvidence && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          Toma una foto del sitio. Es lo que respalda que la visita se intentó.
                        </p>
                        <input
                          ref={nonRealizationEvidenceRef}
                          type="file"
                          aria-label="Evidencia de intento fallido"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setNonRealizationEvidenceFile(file);
                            if (onUploadNonRealizationEvidence) {
                              void onUploadNonRealizationEvidence(file);
                            }
                          }}
                        />
                        {nonRealizationEvidenceFile ? (
                          <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{nonRealizationEvidenceFile.name}</span>
                            <button
                              type="button"
                              className="text-red-600 underline dark:text-red-400"
                              onClick={() => setNonRealizationEvidenceFile(null)}
                            >
                              Quitar
                            </button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isSubmitting}
                            onClick={() => nonRealizationEvidenceRef.current?.click()}
                          >
                            <Camera className="h-4 w-4" />
                            Adjuntar evidencia
                          </Button>
                        )}
                      </div>
                    )}
                    <Input
                      id="eo-non-realization-note"
                      label="Cuéntanos qué pasó"
                      value={nonRealizationNote}
                      disabled={isSubmitting}
                      onChange={(e) => setNonRealizationNote(e.target.value)}
                      placeholder="Una línea ayuda a la reclasificación..."
                    />
                  </div>
                )}
                {isNotExecuted && (!nonRealizationCauses || nonRealizationCauses.length === 0) && (
                  <PortalAlert
                    variant="warning"
                    title="Causas no disponibles"
                    description="El catálogo de causas aún no está disponible. Consulta al coordinador para registrar este caso."
                  />
                )}
                <Input
                  id="eo-close-summary"
                  label="Resumen de cierre"
                  value={closeSummary}
                  disabled={isSubmitting}
                  onChange={(e) => setCloseSummary(e.target.value)}
                  placeholder="Describe el resultado final del trabajo..."
                  requiredIndicator
                />

                <fieldset className="space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border">
                  <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                    Aceptación del cliente{' '}
                    {customerAcceptanceRequired ? '(obligatoria)' : '(opcional)'}
                  </legend>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Selecciona una firma del cliente disponible y validada en esta orden.
                  </p>
                  <Select
                    id="eo-customer-acceptance-artifact"
                    label="Referencia de evidencia"
                    value={customerAcceptanceArtifactId}
                    options={customerAcceptanceEvidenceOptions}
                    placeholder="Selecciona una firma disponible"
                    disabled={isSubmitting || customerAcceptanceEvidenceOptions.length === 0}
                    required={customerAcceptanceRequired}
                    {...(customerAcceptanceEvidenceOptions.length === 0
                      ? {
                          helperText:
                            'No hay una firma de cliente disponible y validada. Carga la evidencia de firma del cliente antes de cerrar.',
                        }
                      : {})}
                    onChange={(e) => setCustomerAcceptanceArtifactId(e.target.value)}
                  />
                  <Select
                    id="eo-customer-acceptance-method"
                    label="Forma de aceptación"
                    value={customerAcceptanceMethod}
                    placeholder="Selecciona una forma"
                    options={customerAcceptanceMethodOptions}
                    disabled={isSubmitting}
                    onChange={(e) =>
                      setCustomerAcceptanceMethod(e.target.value as CustomerAcceptanceMethod)
                    }
                  />
                  {customerAcceptanceIncomplete && (
                    <p className="text-xs text-amber-800 dark:text-amber-200" role="alert">
                      Completa la referencia y la forma de aceptación para enviarlas.
                    </p>
                  )}
                </fieldset>

                {/* Incomplete requirements */}
                {template && !completion.isComplete && (
                  <PortalAlert
                    variant="warning"
                    title="Requisitos pendientes"
                    description={`Aún faltan requisitos de la plantilla. Progreso actual: ${completion.label}`}
                  />
                )}

                {!closeConfirmOpen ? (
                  <Button
                    type="button"
                    disabled={
                      isSubmitting ||
                      closeSummary.trim().length === 0 ||
                      customerAcceptanceIncomplete ||
                      !nonRealizationCanConfirm
                    }
                    onClick={() => {
                      setCloseValidationError(null);
                      if (!nonRealizationCanConfirm) {
                        setCloseValidationError('Elige una causa para cerrar como no ejecutada.');
                        return;
                      }
                      setCloseConfirmOpen(true);
                    }}
                  >
                    Cerrar OT
                  </Button>
                ) : (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Confirmar cierre
                    </p>
                    <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                      Esta acción es definitiva. No podrás editar la OT después del cierre.
                    </p>
                    {closeValidationError && (
                      <p
                        className="mt-2 text-xs font-medium text-red-800 dark:text-red-200"
                        role="alert"
                      >
                        {closeValidationError}
                      </p>
                    )}
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
                {template === null && !terminal ? (
                  <PortalAlert
                    variant="error"
                    title="Plantilla no disponible"
                    description="No es posible validar los requisitos de cierre. La orden permanece abierta hasta recuperar la versión asignada."
                  />
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {offline ? 'Sin conexión.' : 'No puedes cerrar esta orden.'}
                  </p>
                )}
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
