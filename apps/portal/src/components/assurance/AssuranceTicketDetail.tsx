'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import {
  Badge,
  Button,
  Input,
  Select,
  SkeletonBlock,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@iwana/ui';
import {
  AccessPermissionKey,
  EXECUTION_ORDER_NUMBER_PATTERN,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  type ExecutionOrderLookupResponse,
  type LinkExecutionOrderBody,
  type TicketPartyRef,
} from '@iwana/shared';
import type {
  AssuranceCommentSubmission,
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  AssignAssuranceTicketDto,
  InternalUser,
  RequestAssuranceFieldServiceDto,
  TransitionAssuranceTicketDto,
} from '@/lib/api-client';
import { ApiError, assuranceApi } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_STATUS_LABELS,
} from '@/components/operations/operations-labels';
import { getVisitRequestStatusLabel } from '@/components/scheduling/pending-visits-ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  PortalTimeline,
  portalFieldEmptyValueClassName,
  portalPanelDenseActionClassName,
  portalPanelDenseClassName,
  portalPanelDenseTitleClassName,
  type PortalTimelineItem,
} from '@/components/shared/portal-ui';
import {
  ASSURANCE_EMPTY_QUEUE_LABEL,
  ASSURANCE_QUEUE_OPTIONS,
  ASSURANCE_TICKET_STATUS_OPTIONS,
  ASSURANCE_UNASSIGNED_LABEL,
  ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL,
  ASSURANCE_UNLINKED_WORK_ORDER_LABEL,
  formatAssuranceDateTime,
  formatAssuranceReference,
  getAssuranceAssigneeLabel,
  getAssuranceAuthorDisplayName,
  getAssuranceFieldDecisionLabel,
  getAssuranceQueueLabel,
  getAssuranceRequesterTypeLabel,
  getAssuranceSlaStatusLabel,
  getAssuranceSlaStatusVariant,
  getAssuranceSourceLabel,
  getAssuranceSubjectTypeLabel,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketPriorityVariant,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
  getAssuranceTicketTypeLabel,
  getAssuranceThreadLine,
  getAssuranceTimelineDescription,
  getAssuranceTimelineEventLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import { formatTicketVisitWindow, isTerminalTicket } from './assurance-ticket-model';
import {
  getTicketExecutionOrderHref,
  getTicketPartyProfileHref,
  getTicketVisitHref,
} from './assurance-ticket-links';
import { assuranceTextareaClassName } from './assurance-ui';
import { ASSIGNMENT_NOTE_MAX_LENGTH, withAssignmentNote } from './AssigneeReassignControl';
import { TicketAttachmentList } from './TicketAttachmentList';
import { TicketAttachmentPicker } from './TicketAttachmentPicker';
import { formatTicketAttachmentCount } from './ticket-attachments';

/** Partes del detalle: el contenedor (panel o página) decide dónde va cada una. */
export interface AssuranceTicketDetailParts {
  content: ReactNode;
  /** Redactor; `undefined` sin `canOperate` o mientras no hay ticket cargado. */
  composer: ReactNode | undefined;
}

export interface AssuranceTicketDetailProps {
  ticket: AssuranceTicket | null;
  comments: AssuranceTicketComment[];
  timeline: AssuranceTimelineEvent[];
  assignees: InternalUser[];
  isLoading: boolean;
  error: string | null;
  actionFeedback: string | null;
  actionError: string | null;
  isCommentSubmitting: boolean;
  isTransitionSubmitting: boolean;
  isAssignmentSubmitting: boolean;
  isFieldServiceSubmitting: boolean;
  isLinkingWorkOrder: boolean;
  canManage: boolean;
  canOperate: boolean;
  onCreateLinkedTask?: () => void;
  /**
   * Crear un ticket nuevo del mismo cliente desde un ticket cerrado o cancelado (spec 2026-11-20
   * ticket cerrado §2). Solo lo pasa el contenedor cuando quien lo ve puede crear tickets.
   */
  onCreateFollowUpTicket?: ((ticket: AssuranceTicket) => void) | undefined;
  /** Enlace «Abrir en página» en la cabecera de acciones (solo en el panel, spec §3 K). */
  openInPageHref?: string | undefined;
  /** Texto del estado «Ticket no disponible»; cambia según el contenedor. */
  emptyDescription?: string | undefined;
  children: (parts: AssuranceTicketDetailParts) => ReactNode;
  /** Devuelve `false` si no se guardó: el formulario conserva el texto y los archivos. */
  onAddComment: (payload: AssuranceCommentSubmission) => Promise<boolean | void>;
  onTransitionStatus: (payload: TransitionAssuranceTicketDto) => Promise<unknown>;
  onAssign: (payload: AssignAssuranceTicketDto) => Promise<unknown>;
  onRequestFieldService: (payload: RequestAssuranceFieldServiceDto) => Promise<unknown>;
  /** Vínculo de la orden de trabajo (de ejecución) encontrada por número (spec §3 L, D4). */
  onLinkWorkOrder: (payload: LinkExecutionOrderBody) => Promise<unknown>;
  /**
   * Titular de la ficha desde la que se abre el ticket (solo la ficha del suscriptor). Si el caso
   * está relacionado con ese mismo titular, «Relacionado con» no se repite (spec 2026-11-20 CA-5).
   */
  contextSubscriberId?: string | undefined;
}

/** Control que disparó la última acción: su mensaje se pinta a su lado (spec MOD10 §3 H). */
type ActionSource = 'status' | 'assignment' | 'fieldService' | 'workOrder' | 'comment';

/** Búsqueda de la orden por número (spec §3 L). */
type OrderLookup =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string }
  | { kind: 'found'; order: ExecutionOrderLookupResponse };

/** Botón de la fila de acciones: 44 px de alto bajo `sm` (spec MOD05 §8.4). */
const actionRowButtonClassName = 'min-h-11 sm:min-h-0';

/** Acciones de la sección Visita y orden: densas desde `sm` para caber en el riel (CA-2). */
const railActionButtonClassName = 'min-h-11 sm:h-7 sm:min-h-0 sm:px-2.5 sm:text-xs';

const inlineFormClassName =
  'space-y-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border';

const fieldLabelClassName = 'text-sm font-medium text-gray-700 dark:text-gray-300';

const supportTextClassName = 'text-xs text-gray-600 dark:text-gray-300';

/** Sección del riel en un panel: el separador es el `divide-y` del cuerpo (dictamen D3 §2). */
const railSectionClassName = 'space-y-1.5 px-4 py-2';

/** Filas de dato del riel con menos aire vertical (CA-2: lateral ≤ 700 px). */
const railFieldRowClassName = 'py-1';

/** Selects del riel con el mismo alto denso desde `sm`; bajo `sm` conservan 44 px. */
const railSelectClassName = 'sm:h-8 sm:py-1';

/** Cuerpo con riel (spec MOD05 §8.6, D5): con contenedor < 48rem el riel se apila antes del hilo. */
const detailBodyClassName =
  'flex flex-col gap-4 @3xl:grid @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:gap-6';

const ORDER_NUMBER_EXAMPLE = 'OTE-20261116-001';

/** Motivo de un destino bloqueado, en lenguaje de usuario (contrato `blockedReason`). */
const TRANSITION_BLOCKED_REASON_TEXT = {
  PQR_RECORD_INCOMPLETE: 'primero completa el registro de la PQR',
} as const;

function canRequestFieldService(status: string | null | undefined): boolean {
  return status === TicketStatus.IN_PROGRESS || status === TicketStatus.PENDING_INTERNAL;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

function ActionMessages({
  feedback,
  error,
}: {
  feedback: string | null;
  error: string | null;
}): ReactNode {
  if (!feedback && !error) {
    return null;
  }
  return (
    <div className="space-y-2">
      {feedback ? (
        <PortalAlert
          variant="success"
          density="compact"
          title="Operación completada"
          description={feedback}
        />
      ) : null}
      {error ? (
        <PortalAlert
          variant="error"
          density="compact"
          title="No fue posible aplicar la acción"
          description={error}
        />
      ) : null}
    </div>
  );
}

function TicketPanelSkeleton() {
  return (
    <div aria-busy="true" className="@container space-y-4">
      <span className="sr-only">Cargando el ticket…</span>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-6 w-32 rounded-full" />
        <SkeletonBlock className="h-6 w-24 rounded-full" />
        <SkeletonBlock className="h-6 w-20 rounded-full" />
        <SkeletonBlock className="h-8 w-56 rounded-xl sm:ml-auto" />
      </div>
      <div aria-hidden="true" className={detailBodyClassName}>
        <div
          className={cn(
            portalPanelDenseClassName,
            'divide-y divide-gray-100 dark:divide-dark-border @3xl:col-start-2 @3xl:row-start-1',
          )}
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={railSectionClassName}>
              <SkeletonBlock className="h-16 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="space-y-3 @3xl:col-start-1 @3xl:row-start-1">
          <SkeletonBlock className="h-9 w-64 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Nombre de una parte del ticket (spec §3 L). Con nombre: el nombre (enlazado a su ficha si hay
 * permiso) y el tipo como texto de apoyo. Sin nombre (protegido, sin permiso o sin dato): el tipo,
 * como antes. El nombre es texto: React lo escapa.
 */
function TicketPartyValue({
  party,
  typeLabel,
  hasPermission,
}: {
  party: TicketPartyRef | null | undefined;
  typeLabel: string;
  hasPermission: (permission: AccessPermissionKey) => boolean;
}) {
  const name = party?.nameState === 'AVAILABLE' ? party.displayName?.trim() : null;
  if (!name) return <>{typeLabel}</>;
  const href = getTicketPartyProfileHref(party?.profile, hasPermission);
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {href ? (
        <Link href={href} className={cn('self-start', portalPanelDenseActionClassName)}>
          {name}
        </Link>
      ) : (
        <span>{name}</span>
      )}
      <span className={supportTextClassName}>{typeLabel}</span>
    </span>
  );
}

/** Fecha de la línea compacta (dictamen D3 §5); sin valor muestra su texto de vacío. */
function TicketDate({
  label,
  emptyLabel,
  children,
}: {
  label: string;
  emptyLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mr-3 inline-block whitespace-nowrap">
      <dt className="mr-1 inline text-gray-500 dark:text-gray-400">{label}</dt>
      <dd
        className={cn(
          'inline tabular-nums',
          children ? 'text-gray-900 dark:text-white' : portalFieldEmptyValueClassName,
        )}
      >
        {children ?? emptyLabel}
      </dd>
    </div>
  );
}

/** Enlace «Ver» al final de una fila; su nombre accesible nombra el dato (§8.2). */
function RowLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <Link href={href} aria-label={label} className={portalPanelDenseActionClassName}>
      Ver
    </Link>
  );
}

/**
 * Contenido del detalle del ticket (spec MOD10 §3 A–L): cabecera con estado, cuerpo a dos columnas
 * (descripción e hilo a la izquierda; riel Personas, Atención, Visita y orden de trabajo, Adjuntos
 * y Registro a la derecha), redactor y mensajes. Lo usan el panel (`AssuranceTicketDrawer`) y la
 * página propia (`/dashboard/assurance/tickets/[id]`).
 */
export function AssuranceTicketDetail({
  ticket,
  comments,
  timeline,
  assignees,
  isLoading,
  error,
  actionFeedback,
  actionError,
  isCommentSubmitting,
  isTransitionSubmitting,
  isAssignmentSubmitting,
  isFieldServiceSubmitting,
  isLinkingWorkOrder,
  canManage,
  canOperate,
  onCreateLinkedTask,
  onCreateFollowUpTicket,
  openInPageHref,
  emptyDescription = 'Selecciona otro caso desde la tabla para consultar su trazabilidad operativa.',
  children,
  onAddComment,
  onTransitionStatus,
  onAssign,
  onRequestFieldService,
  onLinkWorkOrder,
  contextSubscriberId,
}: AssuranceTicketDetailProps) {
  const { hasPermission } = usePermissions();
  const [commentBody, setCommentBody] = useState('');
  const [commentIsInternal, setCommentIsInternal] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [queueName, setQueueName] = useState('');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [fieldServiceNotes, setFieldServiceNotes] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderLookup, setOrderLookup] = useState<OrderLookup>({ kind: 'idle' });
  const [workOrderNotes, setWorkOrderNotes] = useState('');
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [workOrderFormOpen, setWorkOrderFormOpen] = useState(false);
  const [actionSource, setActionSource] = useState<ActionSource | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const lookupRequestRef = useRef(0);

  const idPrefix = useId();
  const visitFormId = `${idPrefix}-visit-form`;
  const workOrderFormId = `${idPrefix}-work-order-form`;
  const linkedTaskHintId = `${idPrefix}-linked-task-hint`;
  const visitHintId = `${idPrefix}-visit-hint`;
  const workOrderHintId = `${idPrefix}-work-order-hint`;
  const commentBodyId = `${idPrefix}-comment-body`;
  const assignmentNoteId = `${idPrefix}-assignment-note`;
  const statusSectionTitleId = `${idPrefix}-rail-status`;
  const visitSectionTitleId = `${idPrefix}-rail-visit`;
  const caseSectionTitleId = `${idPrefix}-rail-case`;
  const datesSectionTitleId = `${idPrefix}-rail-dates`;

  const usersById = useMemo(() => new Map(assignees.map((user) => [user.id, user])), [assignees]);
  // «Adjuntos (N)»: los de los comentarios que esta persona puede ver (la API ya filtra los
  // internos), en orden de creación. Sale de la misma respuesta de comentarios: sin otra carga.
  const ticketAttachments = useMemo(
    () => comments.flatMap((comment) => comment.attachments ?? []),
    [comments],
  );

  useEffect(() => {
    if (!ticket) {
      return;
    }

    setAssignedUserId(ticket.assignedUserId ?? '');
    setQueueName(ticket.queueName ?? '');
    setAssignmentNote('');
    setCommentBody('');
    setCommentIsInternal(false);
    setCommentFiles([]);
    setNextStatus('');
    setStatusNotes('');
    setFieldServiceNotes('');
    setWorkOrderNotes('');
  }, [ticket]);

  // El consumidor recarga el ticket tras cada acción (objeto nuevo, mismo id): el origen del
  // mensaje, los formularios abiertos y la búsqueda de orden solo se reinician al cambiar de caso.
  const ticketId = ticket?.id ?? null;
  useEffect(() => {
    setActionSource(null);
    setVisitFormOpen(false);
    setWorkOrderFormOpen(false);
    setOrderNumber('');
    setOrderLookup({ kind: 'idle' });
    lookupRequestRef.current += 1;
  }, [ticketId]);

  const messagesFor = (source: ActionSource) =>
    actionSource === source ? (
      <ActionMessages feedback={actionFeedback} error={actionError} />
    ) : null;

  // Estado (spec §3 L): con `allowedTransitions` del servidor solo se ofrecen sus destinos; sin el
  // campo (respuesta sin los datos del paso 2) se ofrece lo de hoy y el servidor sigue validando.
  // «Visita técnica solicitada» nunca es destino directo: se llega con «Solicitar visita» (D4).
  const serverTransitions = ticket?.allowedTransitions?.filter(
    (transition) => transition.status !== TicketStatus.FIELD_SERVICE_REQUESTED,
  );
  const offeredTransitions = serverTransitions?.filter((transition) => !transition.blockedReason);
  const blockedTransitions =
    serverTransitions?.filter((transition) => transition.blockedReason) ?? [];
  const transitionOptions = offeredTransitions
    ? offeredTransitions.map((transition) => ({
        value: transition.status,
        label: getAssuranceTicketStatusLabel(transition.status),
      }))
    : ASSURANCE_TICKET_STATUS_OPTIONS.filter((option) => option.value !== ticket?.status);
  const selectedTransition = offeredTransitions?.find(
    (transition) => transition.status === nextStatus,
  );
  const noteRequired = selectedTransition
    ? selectedTransition.requiresNote
    : nextStatus === TicketStatus.RESOLVED;
  const noTransitions = offeredTransitions?.length === 0;
  const blockedTransitionHint = blockedTransitions.length
    ? `${joinLabels(
        blockedTransitions.map((transition) => getAssuranceTicketStatusLabel(transition.status)),
      )} ${blockedTransitions.length === 1 ? 'no está disponible' : 'no están disponibles'}: ${
        TRANSITION_BLOCKED_REASON_TEXT[blockedTransitions[0]!.blockedReason!]
      }.`
    : null;

  // Motivo visible bajo el control Estado del riel; lo describe (spec 2026-11-20 §3 B).
  const statusHint = !canOperate
    ? null
    : (blockedTransitionHint ??
      (noTransitions ? 'No tienes cambios de estado disponibles para este caso.' : null));
  const statusLabelId = `${idPrefix}-transition-status-label`;
  const statusHintId = statusHint ? `${idPrefix}-transition-status-hint` : undefined;
  const statusMessages =
    actionSource === 'status' && (actionFeedback || actionError) ? messagesFor('status') : null;

  const assigneeOptions = assignees.map((user) => ({
    value: user.id,
    label: getAssuranceUserDisplayName(user),
  }));
  const terminal = ticket ? isTerminalTicket(ticket) : false;
  const fieldServiceAllowed = canRequestFieldService(ticket?.status);
  // Cerrado o cancelado: sin redactor; la línea de cierre ocupa su lugar (spec ticket cerrado §2).
  const showComposer = canOperate && !isLoading && !error && Boolean(ticket) && !terminal;
  const showClosedNotice = !isLoading && !error && Boolean(ticket) && terminal;
  // Responsable y área quedan como dato en un ticket terminal (spec ticket cerrado §2).
  const assignmentEditable = !terminal;
  // «Guardar asignación» aparece una sola vez bajo la fila Responsable/Área (spec 2026-11-20 §3 B)
  // y guarda los dos juntos.
  const assigneeChanged = assignedUserId !== (ticket?.assignedUserId ?? '');
  const queueChanged = queueName !== (ticket?.queueName ?? '');
  // Formularios en línea: no se abren sin el permiso de su acción (spec §4 nota v1.1).
  // La fila usa la guarda completa de H5 de su acción (spec §4 nota v1.1): sin ella, el botón
  // queda deshabilitado y no abre. Es la misma expresión que deshabilita la confirmación.
  const fieldServiceBlocked = !canOperate || !fieldServiceAllowed || terminal;
  const visitFormVisible = visitFormOpen && !fieldServiceBlocked;
  // Buscar la orden por número exige ver órdenes de trabajo, además de gestionar el ticket.
  const canLookupOrders = hasPermission(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ);
  // Vincular orden también queda bloqueado en un ticket terminal (spec ticket cerrado §2; la API responde 409).
  const workOrderBlocked = !canManage || !canLookupOrders || terminal;
  const workOrderFormVisible = workOrderFormOpen && !workOrderBlocked;
  // Un mensaje se pinta junto a su control mientras ese control siga montado. Si la acción lo
  // retiró (p. ej. el estado pasó a terminal y ya no hay formulario de estado), cae al inicio del
  // panel para que nunca se pierda (spec §0 y §3 H).
  const isSourceMounted = (source: ActionSource): boolean => {
    switch (source) {
      case 'status':
        return !terminal;
      case 'comment':
        return showComposer;
      default:
        // Asignación y la fila de acciones (visita y orden) siempre están montadas.
        return true;
    }
  };
  const showTopMessages = actionSource === null || !isSourceMounted(actionSource);

  // Un formulario cuya acción se bloquea (p. ej. tras confirmar la visita el estado ya no la
  // admite) se cierra: no debe reaparecer solo si el estado vuelve a permitirla.
  useEffect(() => {
    if (fieldServiceBlocked) setVisitFormOpen(false);
  }, [fieldServiceBlocked]);
  useEffect(() => {
    if (workOrderBlocked) setWorkOrderFormOpen(false);
  }, [workOrderBlocked]);
  // Redactor contraído en reposo; se expande con foco, texto, archivos o envío en curso.
  const composerExpanded =
    composerFocused ||
    commentBody.length > 0 ||
    commentFiles.length > 0 ||
    isCommentSubmitting ||
    (actionSource === 'comment' && Boolean(actionError));

  const handleComposerBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    // Se decide cuando el foco ya se movió. Si el selector de archivos del sistema le quita el
    // foco a la ventana, el elemento activo sigue siendo el campo de archivo: no se contrae.
    window.setTimeout(() => {
      if (!composerRef.current?.contains(document.activeElement)) {
        setComposerFocused(false);
      }
    }, 0);
  };

  const searchOrder = async () => {
    const normalized = orderNumber.trim().toUpperCase();
    if (!EXECUTION_ORDER_NUMBER_PATTERN.test(normalized)) {
      setOrderLookup({ kind: 'invalid' });
      return;
    }
    lookupRequestRef.current += 1;
    const requestId = lookupRequestRef.current;
    setOrderLookup({ kind: 'searching' });
    try {
      const order = await assuranceApi.tickets.lookupExecutionOrder(
        normalized,
        ticketId ?? undefined,
      );
      if (requestId === lookupRequestRef.current) setOrderLookup({ kind: 'found', order });
    } catch (lookupError) {
      if (requestId !== lookupRequestRef.current) return;
      const status = lookupError instanceof ApiError ? lookupError.status : null;
      setOrderLookup({
        kind: 'error',
        message:
          status === 404
            ? 'No hay una orden de trabajo con ese número.'
            : status === 403
              ? 'No tienes acceso para buscar órdenes de trabajo.'
              : 'No fue posible buscar la orden. Intenta de nuevo.',
      });
    }
  };

  const historyItems: PortalTimelineItem[] = timeline.map((event) => {
    const actor = event.actorUserId ? usersById.get(event.actorUserId) : null;
    return {
      id: event.id,
      title: getAssuranceTimelineEventLabel(event.eventType),
      at: event.occurredAt,
      detail: getAssuranceTimelineDescription(event, usersById),
      meta: `Actor: ${actor ? getAssuranceUserDisplayName(actor) : 'Sistema'}`,
    };
  });

  const renderCommentBody = (comment: AssuranceTicketComment) => (
    <>
      {/* Importados de UISP solo con adjuntos llegan sin texto (D4). */}
      {comment.body.trim() ? (
        <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">{comment.body}</p>
      ) : null}
      {ticket ? (
        <TicketAttachmentList
          ticketId={ticket.id}
          attachments={comment.attachments ?? []}
          variant="preview"
          label="Adjuntos del comentario"
        />
      ) : null}
    </>
  );

  const renderVisibilityBadge = (comment: AssuranceTicketComment) => (
    <Badge variant={comment.isInternal ? 'warning' : 'info'}>
      {comment.isInternal ? 'Interno' : 'Visible'}
    </Badge>
  );

  // «Comentarios» intercala por fecha las asignaciones y los cambios de estado como líneas de una
  // sola línea (spec 2026-11-20 asignación visible, bloque A). Solo lee el historial que la API
  // ya entrega a esta persona: no añade nada de los comentarios internos que no puede ver (CA-3).
  type ConversationEntry =
    | { kind: 'comment'; at: string; comment: AssuranceTicketComment }
    | { kind: 'line'; at: string; id: string; text: string; note: string | null };
  const conversation: ConversationEntry[] = [
    ...comments.map((comment) => ({ kind: 'comment' as const, at: comment.createdAt, comment })),
    ...timeline.flatMap((event) => {
      const line = getAssuranceThreadLine(event, usersById);
      return line ? [{ kind: 'line' as const, at: event.occurredAt, id: event.id, ...line }] : [];
    }),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // «Todo» intercala comentarios e historial por fecha y omite «Comentario agregado», que
  // repetiría el comentario que ya está en la lista (spec MOD10 §3 F, riesgo R6).
  const allItems: PortalTimelineItem[] = [
    ...comments.map((comment) => ({
      id: `comment-${comment.id}`,
      title: `Comentario de ${getAssuranceAuthorDisplayName(usersById.get(comment.authorUserId))}`,
      at: comment.createdAt,
      meta: renderVisibilityBadge(comment),
      detail: renderCommentBody(comment),
    })),
    ...historyItems.filter(
      (_, index) => timeline[index]?.eventType !== TicketTimelineEventType.COMMENT_ADDED,
    ),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const closedNotice =
    showClosedNotice && ticket ? (
      // Aviso en la cabecera, visible sin desplazar en los tres contenedores (ajuste del usuario
      // 2026-11-20); `role="status"` para que el lector de pantalla lo anuncie.
      <div
        role="status"
        className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-dark-surface-2"
      >
        <p className="mr-auto min-w-0 text-sm text-gray-700 dark:text-gray-200">
          {ticket.status === TicketStatus.CANCELLED
            ? 'Este ticket está cancelado. Si el caso continúa, crea uno nuevo'
            : 'Este ticket está cerrado. Si el caso continúa, crea uno nuevo'}
        </p>
        {onCreateFollowUpTicket ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={actionRowButtonClassName}
            onClick={() => onCreateFollowUpTicket(ticket)}
          >
            Crear ticket
          </Button>
        ) : null}
      </div>
    ) : undefined;

  const composer = showComposer ? (
    <div
      ref={composerRef}
      className="space-y-2"
      onFocus={() => setComposerFocused(true)}
      onBlur={handleComposerBlur}
    >
      {messagesFor('comment')}
      <label htmlFor={commentBodyId} className="sr-only">
        Nuevo comentario
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <textarea
          id={commentBodyId}
          rows={composerExpanded ? 3 : 1}
          value={commentBody}
          onChange={(event) => setCommentBody(event.target.value)}
          placeholder="Escribe un comentario: diagnóstico, conversación o siguiente paso."
          className={cn(
            assuranceTextareaClassName,
            composerExpanded
              ? 'min-h-20 basis-full'
              : 'min-h-11 w-auto min-w-0 flex-1 basis-0 resize-none py-2.5',
          )}
        />
        {composerExpanded ? (
          <>
            <div className="basis-full">
              <TicketAttachmentPicker
                files={commentFiles}
                onChange={setCommentFiles}
                disabled={isCommentSubmitting}
              />
            </div>
            <label className="mr-auto flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={commentIsInternal}
                onChange={(event) => setCommentIsInternal(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
              />
              Interno
            </label>
            {isCommentSubmitting && commentFiles.length > 0 ? (
              <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
                Subiendo {formatTicketAttachmentCount(commentFiles.length)}…
              </p>
            ) : null}
          </>
        ) : null}
        <Button
          type="button"
          loading={isCommentSubmitting}
          disabled={!commentBody.trim()}
          onClick={async () => {
            setActionSource('comment');
            const saved = await onAddComment({
              body: commentBody.trim(),
              isInternal: commentIsInternal,
              files: commentFiles,
            });
            // Si no se guardó, el texto y los archivos quedan para reintentar.
            if (saved === false) return;
            setCommentBody('');
            setCommentIsInternal(false);
            setCommentFiles([]);
          }}
        >
          Agregar comentario
        </Button>
      </div>
    </div>
  ) : undefined;

  // CA-5: solo la ficha pasa su titular; Mesa de ayuda y la página propia lo muestran siempre.
  const relatedIsContext =
    Boolean(contextSubscriberId) &&
    ticket?.subjectType === TicketSubjectType.SUBSCRIBER &&
    ticket.subjectRefId === contextSubscriberId;

  const assignmentSave = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={actionRowButtonClassName}
      loading={isAssignmentSubmitting}
      disabled={!canManage}
      onClick={async () => {
        setActionSource('assignment');
        // La nota solo acompaña un cambio de responsable y, vacía, no viaja (CA-6).
        await onAssign(
          withAssignmentNote(
            {
              assignedUserId: assignedUserId || undefined,
              queueName: (queueName || undefined) as AssignAssuranceTicketDto['queueName'],
            },
            assigneeChanged ? assignmentNote : '',
          ),
        );
      }}
    >
      Guardar asignación
    </Button>
  );

  const renderDetail = (current: AssuranceTicket) => {
    const visit = current.activeVisit ?? null;
    const visitWindow = visit ? formatTicketVisitWindow(visit) : null;
    const order = current.executionOrder ?? null;
    const orderCount = current.executionOrderCount ?? 0;
    const lookupOrder = orderLookup.kind === 'found' ? orderLookup.order : null;

    return (
      <div className="@container space-y-2">
        {showTopMessages ? <ActionMessages feedback={actionFeedback} error={actionError} /> : null}

        {/* B · Cabecera: insignias y control Estado en una fila (spec §3 J; ajuste CA-10). */}
        <div className="space-y-2">
          {closedNotice}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{getAssuranceTicketTypeLabel(current.type)}</Badge>
            {/* El estado actual se muestra en el riel, junto a su control (spec 2026-11-20 §3 B). */}
            <Badge variant={getAssuranceTicketPriorityVariant(current.priority)}>
              {getAssuranceTicketPriorityLabel(current.priority)}
            </Badge>
            {/* Sin política de plazos (p. ej. importados) «En tiempo» no significa nada. */}
            {current.slaPolicyId ? (
              <Badge variant={getAssuranceSlaStatusVariant(current.slaBreachStatus)}>
                {getAssuranceSlaStatusLabel(current.slaBreachStatus)}
              </Badge>
            ) : null}
            {openInPageHref ? (
              <Link
                href={openInPageHref}
                className={cn('ml-auto', portalPanelDenseActionClassName)}
              >
                Abrir en página
              </Link>
            ) : null}
          </div>
        </div>

        {/* J · Dos columnas: el riel va antes del hilo en el DOM y desde `@3xl` pasa a la derecha.
            Riel en un solo panel con cuatro secciones (spec 2026-11-20 §3 A; dictamen D3). */}
        <div data-testid="ticket-detail-body" className={detailBodyClassName}>
          <section
            aria-label="Datos del caso"
            className="min-w-0 @3xl:col-start-2 @3xl:row-start-1"
          >
            <PortalPanel
              density="dense"
              as="div"
              contentClassName="divide-y divide-gray-100 p-0 dark:divide-dark-border"
            >
              {/* 1 · Estado y asignación (§3 B). */}
              <section aria-labelledby={statusSectionTitleId} className={railSectionClassName}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id={statusSectionTitleId} className={portalPanelDenseTitleClassName}>
                    Estado y asignación
                  </h3>
                  <Badge variant={getAssuranceTicketStatusVariant(current.status)}>
                    {getAssuranceTicketStatusLabel(current.status)}
                  </Badge>
                </div>

                {/* En estado terminal el estado es solo su insignia: sin control (§3 B). */}
                {!terminal ? (
                  <div role="group" aria-label="Cambiar estado" className="space-y-1">
                    <span id={statusLabelId} className={cn('block', fieldLabelClassName)}>
                      Nuevo estado
                    </span>
                    <Select
                      id={`${idPrefix}-transition-status`}
                      aria-labelledby={statusLabelId}
                      aria-describedby={statusHintId}
                      className={railSelectClassName}
                      value={nextStatus}
                      placeholder="Selecciona un estado"
                      options={transitionOptions}
                      onChange={(event) => setNextStatus(event.target.value)}
                      disabled={!canOperate || terminal || noTransitions}
                    />
                    {statusHint ? (
                      <p id={statusHintId} className={supportTextClassName}>
                        {statusHint}
                      </p>
                    ) : null}
                    {nextStatus ? (
                      <>
                        <Input
                          id={`${idPrefix}-transition-notes`}
                          label="Nota"
                          value={statusNotes}
                          onChange={(event) => setStatusNotes(event.target.value)}
                          placeholder="Opcional salvo al resolver"
                          helperText={
                            noteRequired
                              ? nextStatus === TicketStatus.RESOLVED
                                ? 'Para resolver el caso la nota es obligatoria.'
                                : 'Para este cambio la nota es obligatoria.'
                              : undefined
                          }
                        />
                        <Button
                          type="button"
                          className="w-full"
                          loading={isTransitionSubmitting}
                          disabled={
                            !canOperate ||
                            !nextStatus ||
                            terminal ||
                            Boolean(selectedTransition?.requiresNote && !statusNotes.trim())
                          }
                          onClick={async () => {
                            setActionSource('status');
                            await onTransitionStatus({
                              status: nextStatus as TransitionAssuranceTicketDto['status'],
                              notes: statusNotes.trim() || undefined,
                            });
                            setNextStatus('');
                            setStatusNotes('');
                          }}
                        >
                          Guardar estado
                        </Button>
                      </>
                    ) : null}
                    {statusMessages}
                  </div>
                ) : null}

                {current.slaBreachStatus !== SlaBreachStatus.OK ? (
                  <PortalAlert
                    variant="warning"
                    density="compact"
                    title="Plazo de atención en seguimiento"
                    description={`Estado actual: ${getAssuranceSlaStatusLabel(current.slaBreachStatus)}.`}
                  />
                ) : null}

                {!canOperate ? (
                  <PortalAlert
                    variant="warning"
                    density="compact"
                    title="Acciones restringidas"
                    description="Tu rol solo tiene acceso de lectura sobre este caso."
                  />
                ) : null}

                {/* Responsable y Área en una fila con su guardado único. La fila se apila bajo
                    29rem: «Monitoreo operativo», la etiqueta más larga de Área, no cabe en 2/5 del
                    riel de 20rem ni a 375 px (dictamen D3 §3). */}
                {!assignmentEditable ? (
                  <PortalFieldList>
                    <PortalFieldRow className={railFieldRowClassName} label="Responsable">
                      {getAssuranceAssigneeLabel(
                        current.assignedUserId,
                        assignees.find((user) => user.id === current.assignedUserId),
                      )}
                    </PortalFieldRow>
                    <PortalFieldRow className={railFieldRowClassName} label="Área">
                      {getAssuranceQueueLabel(current.queueName)}
                    </PortalFieldRow>
                  </PortalFieldList>
                ) : (
                  <div className="@container">
                    <div className="grid grid-cols-1 gap-1.5 @[29rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                      <Select
                        id={`${idPrefix}-assign-user`}
                        label="Responsable"
                        className={railSelectClassName}
                        value={assignedUserId}
                        placeholder={
                          assignedUserId
                            ? ASSURANCE_UNAVAILABLE_ASSIGNEE_LABEL
                            : ASSURANCE_UNASSIGNED_LABEL
                        }
                        options={assigneeOptions}
                        onChange={(event) => setAssignedUserId(event.target.value)}
                        disabled={!canManage}
                      />
                      <Select
                        id={`${idPrefix}-assign-queue`}
                        label="Área"
                        className={railSelectClassName}
                        value={queueName}
                        placeholder={ASSURANCE_EMPTY_QUEUE_LABEL}
                        options={ASSURANCE_QUEUE_OPTIONS}
                        onChange={(event) => setQueueName(event.target.value)}
                        disabled={!canManage}
                      />
                    </div>
                  </div>
                )}
                {assignmentEditable && assigneeChanged && canManage ? (
                  <div className="space-y-1">
                    <label
                      htmlFor={assignmentNoteId}
                      className="block text-xs font-medium text-gray-700 dark:text-gray-200"
                    >
                      Nota para el nuevo responsable (opcional)
                    </label>
                    <textarea
                      id={assignmentNoteId}
                      rows={2}
                      maxLength={ASSIGNMENT_NOTE_MAX_LENGTH}
                      value={assignmentNote}
                      onChange={(event) => setAssignmentNote(event.target.value)}
                      className={cn(assuranceTextareaClassName, 'min-h-14')}
                    />
                  </div>
                ) : null}
                {assignmentEditable && (assigneeChanged || queueChanged) ? (
                  <div className="flex justify-end">{assignmentSave}</div>
                ) : null}
                {messagesFor('assignment')}
              </section>

              {/* 2 · Visita y orden: datos, fila de acciones y formularios en línea (§3 C). */}
              <section aria-labelledby={visitSectionTitleId} className={railSectionClassName}>
                <h3 id={visitSectionTitleId} className={portalPanelDenseTitleClassName}>
                  Visita y orden de trabajo
                </h3>
                <div className="space-y-2">
                  <PortalFieldList>
                    {visit ? (
                      <PortalFieldRow
                        className={railFieldRowClassName}
                        label="Visita técnica"
                        action={
                          <RowLink
                            href={getTicketVisitHref(
                              visit.id,
                              hasPermission,
                              visit.scheduleEventId,
                            )}
                            label="Ver la visita técnica"
                          />
                        }
                      >
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                          <span>{getVisitRequestStatusLabel(visit.status)}</span>
                          {visitWindow ? (
                            <span className={supportTextClassName}>{visitWindow}</span>
                          ) : null}
                        </span>
                      </PortalFieldRow>
                    ) : (
                      <PortalFieldRow
                        className={railFieldRowClassName}
                        label="Visita técnica"
                        empty={current.fieldDecision === TicketFieldDecision.NOT_REQUIRED}
                        emptyLabel={getAssuranceFieldDecisionLabel(
                          TicketFieldDecision.NOT_REQUIRED,
                        )}
                      >
                        {getAssuranceFieldDecisionLabel(current.fieldDecision)}
                      </PortalFieldRow>
                    )}
                    {order ? (
                      <PortalFieldRow
                        className={railFieldRowClassName}
                        label="Orden de trabajo"
                        action={
                          <RowLink
                            href={getTicketExecutionOrderHref(order.id, hasPermission)}
                            label={`Ver la orden de trabajo ${order.number}`}
                          />
                        }
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="font-mono">{order.number}</span>
                          <span className={supportTextClassName}>
                            {EXECUTION_ORDER_STATUS_LABELS[order.status] ?? 'Estado no disponible'}
                            {order.result
                              ? ` · ${EXECUTION_ORDER_RESULT_LABELS[order.result] ?? 'Sin resultado'}`
                              : ''}
                          </span>
                          {orderCount > 1 ? (
                            <span className={supportTextClassName}>
                              {`Hay ${orderCount} órdenes en este caso; se muestra la más reciente.`}
                            </span>
                          ) : null}
                        </span>
                      </PortalFieldRow>
                    ) : (
                      <PortalFieldRow
                        className={railFieldRowClassName}
                        label="Orden de trabajo"
                        mono
                        empty={!current.workOrderId}
                        emptyLabel={ASSURANCE_UNLINKED_WORK_ORDER_LABEL}
                      >
                        {formatAssuranceReference(current.workOrderId)}
                      </PortalFieldRow>
                    )}
                  </PortalFieldList>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Sin permiso de la acción el botón queda deshabilitado y no abre su formulario. */}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className={railActionButtonClassName}
                      aria-expanded={visitFormVisible}
                      aria-controls={visitFormId}
                      aria-describedby={
                        canOperate && !fieldServiceAllowed ? visitHintId : undefined
                      }
                      disabled={fieldServiceBlocked}
                      onClick={() => setVisitFormOpen((open) => !open)}
                    >
                      Solicitar visita
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className={railActionButtonClassName}
                      aria-expanded={workOrderFormVisible}
                      aria-controls={workOrderFormId}
                      aria-describedby={canManage && !canLookupOrders ? workOrderHintId : undefined}
                      disabled={workOrderBlocked}
                      onClick={() => setWorkOrderFormOpen((open) => !open)}
                    >
                      Vincular orden de trabajo
                    </Button>
                    {canOperate && !terminal && onCreateLinkedTask ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={railActionButtonClassName}
                          aria-describedby={linkedTaskHintId}
                          onClick={onCreateLinkedTask}
                        >
                          Crear tarea vinculada
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {/* Ayudas bajo la fila, en un bloque compacto (CA-2): siguen visibles y describen
                      su botón. La de la visita explica por qué no abre en ese estado. */}
                  {(canOperate && !terminal && onCreateLinkedTask) ||
                  (canOperate && !fieldServiceAllowed) ||
                  (canManage && !canLookupOrders) ? (
                    <p className={supportTextClassName}>
                      {canOperate && !terminal && onCreateLinkedTask ? (
                        <span id={linkedTaskHintId} className="mr-1">
                          No crea una visita automática.
                        </span>
                      ) : null}
                      {canOperate && !fieldServiceAllowed ? (
                        <span id={visitHintId} className="mr-1">
                          Disponible solo cuando el ticket está en progreso o en espera interna.
                        </span>
                      ) : null}
                      {canManage && !canLookupOrders ? (
                        <span id={workOrderHintId} className="mr-1">
                          Para vincular una orden necesitas acceso a las órdenes de trabajo.
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {visitFormVisible ? (
                    <div id={visitFormId} className={inlineFormClassName}>
                      <div>
                        <label
                          htmlFor={`${idPrefix}-field-service-notes`}
                          className={fieldLabelClassName}
                        >
                          Nota para el equipo de campo
                        </label>
                        <textarea
                          id={`${idPrefix}-field-service-notes`}
                          value={fieldServiceNotes}
                          onChange={(event) => setFieldServiceNotes(event.target.value)}
                          className={cn(assuranceTextareaClassName, 'min-h-20')}
                          placeholder="Describe qué debe validar el equipo de campo."
                        />
                      </div>
                      <Button
                        type="button"
                        loading={isFieldServiceSubmitting}
                        disabled={fieldServiceBlocked}
                        onClick={async () => {
                          setActionSource('fieldService');
                          await onRequestFieldService({
                            notes: fieldServiceNotes.trim() || undefined,
                          });
                          setFieldServiceNotes('');
                        }}
                      >
                        Confirmar solicitud
                      </Button>
                    </div>
                  ) : null}

                  {workOrderFormVisible ? (
                    <div id={workOrderFormId} className={inlineFormClassName}>
                      <div className="flex flex-wrap items-end gap-2">
                        <Input
                          id={`${idPrefix}-work-order-number`}
                          label="Orden de trabajo"
                          value={orderNumber}
                          containerClassName="min-w-0 flex-1"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={ORDER_NUMBER_EXAMPLE}
                          onChange={(event) => {
                            setOrderNumber(event.target.value);
                            lookupRequestRef.current += 1;
                            setOrderLookup({ kind: 'idle' });
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void searchOrder();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className={actionRowButtonClassName}
                          loading={orderLookup.kind === 'searching'}
                          disabled={!orderNumber.trim()}
                          onClick={() => void searchOrder()}
                        >
                          Buscar orden
                        </Button>
                      </div>
                      {orderLookup.kind === 'invalid' ? (
                        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                          {`Escribe el número completo, por ejemplo ${ORDER_NUMBER_EXAMPLE}.`}
                        </p>
                      ) : null}
                      {orderLookup.kind === 'error' ? (
                        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                          {orderLookup.message}
                        </p>
                      ) : null}
                      {lookupOrder ? (
                        <div
                          role="status"
                          aria-label="Orden encontrada"
                          className="space-y-1 text-sm text-gray-700 dark:text-gray-200"
                        >
                          <p>
                            <span className="font-mono">{lookupOrder.number}</span>
                            {` · ${EXECUTION_ORDER_STATUS_LABELS[lookupOrder.status] ?? 'Estado no disponible'}`}
                            {lookupOrder.result
                              ? ` · ${EXECUTION_ORDER_RESULT_LABELS[lookupOrder.result] ?? 'Sin resultado'}`
                              : ''}
                          </p>
                          {lookupOrder.linkedTicket === 'THIS' ? (
                            <p className={supportTextClassName}>
                              Esta orden ya está vinculada a este caso.
                            </p>
                          ) : null}
                          {lookupOrder.linkedTicket === 'OTHER' ? (
                            <p className={supportTextClassName}>
                              Esta orden ya está vinculada a otro caso.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <div>
                        <label
                          htmlFor={`${idPrefix}-link-wo-notes`}
                          className={fieldLabelClassName}
                        >
                          Nota de vínculo
                        </label>
                        <textarea
                          id={`${idPrefix}-link-wo-notes`}
                          value={workOrderNotes}
                          onChange={(event) => setWorkOrderNotes(event.target.value)}
                          className={cn(assuranceTextareaClassName, 'min-h-20')}
                          placeholder="Opcional: agrega contexto del vínculo."
                        />
                      </div>
                      {/* Solo una orden encontrada y libre se puede vincular (spec §3 L). */}
                      {lookupOrder?.linkedTicket === 'NONE' ? (
                        <Button
                          type="button"
                          loading={isLinkingWorkOrder}
                          disabled={workOrderBlocked}
                          onClick={async () => {
                            setActionSource('workOrder');
                            await onLinkWorkOrder({
                              executionOrderId: lookupOrder.id,
                              notes: workOrderNotes.trim() || undefined,
                            });
                            setWorkOrderNotes('');
                          }}
                        >
                          Confirmar vínculo
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {/* Fuera de los formularios: tras confirmar, el estado puede cerrar el formulario y
                    el mensaje debe seguir a la vista junto a la fila de acciones. */}
                  {messagesFor('fieldService')}
                  {messagesFor('workOrder')}
                </div>
              </section>

              {/* 3 · Datos del caso (§3 D). Grupo, no región: la región externa ya se llama así. */}
              <div
                role="group"
                aria-labelledby={caseSectionTitleId}
                className={railSectionClassName}
              >
                <h3 id={caseSectionTitleId} className={portalPanelDenseTitleClassName}>
                  Datos del caso
                </h3>
                <PortalFieldList>
                  <PortalFieldRow className={railFieldRowClassName} label="Solicitante">
                    <TicketPartyValue
                      party={current.requester}
                      typeLabel={getAssuranceRequesterTypeLabel(current.requesterType)}
                      hasPermission={hasPermission}
                    />
                  </PortalFieldRow>
                  {/* CA-5: en la ficha no se repite el titular que ya está en pantalla. */}
                  {!relatedIsContext && current.subjectType ? (
                    <PortalFieldRow
                      className={railFieldRowClassName}
                      label="Relacionado con"
                      empty={!current.subjectType}
                      emptyLabel="No disponible"
                    >
                      {current.subjectType ? (
                        <TicketPartyValue
                          party={current.relatedTo}
                          typeLabel={getAssuranceSubjectTypeLabel(current.subjectType)}
                          hasPermission={hasPermission}
                        />
                      ) : null}
                    </PortalFieldRow>
                  ) : null}
                  <PortalFieldRow className={railFieldRowClassName} label="Origen">
                    {getAssuranceSourceLabel(current.source)}
                  </PortalFieldRow>
                </PortalFieldList>
              </div>

              {/* 4 · Fechas en una línea compacta (§3 E). «Actualizado» se retira (D1). */}
              <section aria-labelledby={datesSectionTitleId} className={railSectionClassName}>
                {/* Rótulo en línea con las fechas: una sola línea que se parte (CA-2). */}
                <div className="text-xs leading-5">
                  <h3
                    id={datesSectionTitleId}
                    className={cn('mr-3 inline', portalPanelDenseTitleClassName)}
                  >
                    Fechas
                  </h3>
                  <dl className="inline">
                    <TicketDate label="Abierto">
                      {formatAssuranceDateTime(current.createdAt)}
                    </TicketDate>
                    <TicketDate label="Primera respuesta" emptyLabel="Sin respuesta">
                      {current.firstRespondedAt
                        ? formatAssuranceDateTime(current.firstRespondedAt)
                        : null}
                    </TicketDate>
                    <TicketDate label="Resuelto" emptyLabel="Sin resolver">
                      {current.resolvedAt ? formatAssuranceDateTime(current.resolvedAt) : null}
                    </TicketDate>
                    {/* Los importados de UISP no traen fecha real de cierre: coincide con la apertura. */}
                    {current.closedAt && current.closedAt !== current.createdAt ? (
                      <TicketDate label="Cerrado">
                        {formatAssuranceDateTime(current.closedAt)}
                      </TicketDate>
                    ) : null}
                    {current.slaPolicyId ? (
                      <>
                        <TicketDate label="Responder antes de">
                          {formatAssuranceDateTime(current.slaFirstResponseAt)}
                        </TicketDate>
                        <TicketDate label="Resolver antes de">
                          {formatAssuranceDateTime(current.slaResolveByAt)}
                        </TicketDate>
                      </>
                    ) : null}
                  </dl>
                </div>
              </section>
            </PortalPanel>
          </section>

          {/* Izquierda: descripción e hilo (el redactor lo ubica el contenedor). */}
          <div className="min-w-0 space-y-3 @3xl:col-start-1 @3xl:row-start-1">
            {/* F0: sin descripción pero con comentarios, el relato está en el hilo; no se avisa. */}
            {current.description?.trim() || comments.length === 0 ? (
              <div className="min-w-0">
                <h3 className={portalPanelDenseTitleClassName}>Descripción</h3>
                {current.description?.trim() ? (
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                    {current.description.trim()}
                  </p>
                ) : (
                  <p className={cn('mt-1 text-sm', portalFieldEmptyValueClassName)}>
                    Sin descripción adicional registrada para este caso.
                  </p>
                )}
              </div>
            ) : null}

            {/* Adjuntos del caso en el hilo, sobre los comentarios y solo si hay (§3 F, D2). */}
            {ticketAttachments.length > 0 ? (
              <div data-testid="ticket-attachments-section">
                <PortalPanel
                  density="dense"
                  as="section"
                  labelled
                  title={`Adjuntos (${ticketAttachments.length})`}
                >
                  <TicketAttachmentList
                    ticketId={current.id}
                    attachments={ticketAttachments}
                    variant="compact"
                    label={`Adjuntos del caso: ${formatTicketAttachmentCount(ticketAttachments.length)}`}
                  />
                </PortalPanel>
              </div>
            ) : null}

            {/* F · Hilo: filtro Comentarios (por defecto), Historial, Todo. */}
            <Tabs defaultValue="comments">
              <TabsList aria-label="Filtrar el hilo del caso">
                <TabsTrigger value="comments">Comentarios</TabsTrigger>
                <TabsTrigger value="history">Historial</TabsTrigger>
                <TabsTrigger value="all">Todo</TabsTrigger>
              </TabsList>

              <TabsContent value="comments" className="mt-3 space-y-3">
                {conversation.length === 0 ? (
                  <PortalEmptyState
                    embedded
                    title="Sin comentarios registrados"
                    description="Usa este espacio para dejar contexto operativo o trazabilidad de atención."
                  />
                ) : (
                  conversation.map((entry) => {
                    if (entry.kind === 'line') {
                      return (
                        <div
                          key={`line-${entry.id}`}
                          className="px-3 text-xs text-gray-600 dark:text-gray-300"
                        >
                          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                            <span>{entry.text}</span>
                            <span aria-hidden="true">·</span>
                            <time dateTime={entry.at}>{formatAssuranceDateTime(entry.at)}</time>
                          </p>
                          {entry.note ? (
                            <p className="mt-0.5 whitespace-pre-line break-words text-gray-700 dark:text-gray-200">
                              {entry.note}
                            </p>
                          ) : null}
                        </div>
                      );
                    }
                    const { comment } = entry;
                    return (
                      <article
                        key={comment.id}
                        className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {getAssuranceAuthorDisplayName(usersById.get(comment.authorUserId))}
                          </p>
                          {renderVisibilityBadge(comment)}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatAssuranceDateTime(comment.createdAt)}
                          </span>
                        </div>
                        {renderCommentBody(comment)}
                      </article>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3">
                <PortalTimeline
                  label="Historial del caso"
                  items={historyItems}
                  formatAt={formatAssuranceDateTime}
                  empty={
                    <PortalEmptyState
                      embedded
                      title="Historial no disponible"
                      description="Este caso aún no registra hitos funcionales adicionales en la mesa de ayuda."
                    />
                  }
                />
              </TabsContent>

              <TabsContent value="all" className="mt-3">
                <PortalTimeline
                  label="Comentarios e historial del caso"
                  items={allItems}
                  formatAt={formatAssuranceDateTime}
                  empty={
                    <PortalEmptyState
                      embedded
                      title="Sin actividad registrada"
                      description="Este caso aún no tiene comentarios ni hitos en la mesa de ayuda."
                    />
                  }
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  };

  const content = isLoading ? (
    <TicketPanelSkeleton />
  ) : error ? (
    <PortalAlert variant="error" title="No fue posible cargar el ticket" description={error} />
  ) : !ticket ? (
    <PortalEmptyState title="Ticket no disponible" description={emptyDescription} />
  ) : (
    renderDetail(ticket)
  );

  return children({ content, composer });
}
