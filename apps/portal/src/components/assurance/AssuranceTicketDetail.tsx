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
  SlaBreachStatus,
  TicketFieldDecision,
  TicketStatus,
  TicketTimelineEventType,
} from '@iwana/shared';
import type {
  AssuranceCommentSubmission,
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  AssignAssuranceTicketDto,
  InternalUser,
  LinkAssuranceWorkOrderDto,
  RequestAssuranceFieldServiceDto,
  TransitionAssuranceTicketDto,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFieldList,
  PortalFieldRow,
  PortalTimeline,
  portalFieldEmptyValueClassName,
  portalPanelDenseActionClassName,
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
  getAssuranceAuthorDisplayName,
  getAssuranceFieldDecisionLabel,
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
  getAssuranceTimelineDescription,
  getAssuranceTimelineEventLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import { isTerminalTicket } from './assurance-ticket-model';
import { assuranceTextareaClassName } from './assurance-ui';
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
  onLinkWorkOrder: (payload: LinkAssuranceWorkOrderDto) => Promise<unknown>;
}

/** Control que disparó la última acción: su mensaje se pinta a su lado (spec MOD10 §3 H). */
type ActionSource = 'status' | 'assignment' | 'fieldService' | 'workOrder' | 'comment';

/** Botón de la fila de acciones: 44 px de alto bajo `sm` (spec MOD05 §8.4). */
const actionRowButtonClassName = 'min-h-11 sm:min-h-0';

const inlineFormClassName =
  'space-y-3 rounded-xl border border-gray-200 p-3 dark:border-dark-border';

const fieldLabelClassName = 'text-sm font-medium text-gray-700 dark:text-gray-300';

function canRequestFieldService(status: string | null | undefined): boolean {
  return status === TicketStatus.IN_PROGRESS || status === TicketStatus.PENDING_INTERNAL;
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
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only">Cargando el ticket…</span>
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-6 w-32 rounded-full" />
        <SkeletonBlock className="h-6 w-24 rounded-full" />
        <SkeletonBlock className="h-6 w-20 rounded-full" />
      </div>
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-11 rounded-xl" />
        <SkeletonBlock className="h-11 rounded-xl" />
        <SkeletonBlock className="h-11 rounded-xl" />
      </div>
      <div aria-hidden="true" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonBlock key={index} className="h-4" />
        ))}
      </div>
      <div aria-hidden="true" className="space-y-3">
        <SkeletonBlock className="h-9 w-64 rounded-xl" />
        <SkeletonBlock className="h-20 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Contenido del detalle del ticket (spec MOD10 §3 A–I y K): cabecera de acciones, propiedades,
 * descripción y adjuntos, fila de acciones, hilo, redactor y mensajes. Lo usan el panel
 * (`AssuranceTicketDrawer`) y la página propia (`/dashboard/assurance/tickets/[id]`).
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
  openInPageHref,
  emptyDescription = 'Selecciona otro caso desde la tabla para consultar su trazabilidad operativa.',
  children,
  onAddComment,
  onTransitionStatus,
  onAssign,
  onRequestFieldService,
  onLinkWorkOrder,
}: AssuranceTicketDetailProps) {
  const [commentBody, setCommentBody] = useState('');
  const [commentIsInternal, setCommentIsInternal] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [composerFocused, setComposerFocused] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [queueName, setQueueName] = useState('');
  const [fieldServiceNotes, setFieldServiceNotes] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [workOrderNotes, setWorkOrderNotes] = useState('');
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [workOrderFormOpen, setWorkOrderFormOpen] = useState(false);
  const [actionSource, setActionSource] = useState<ActionSource | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const idPrefix = useId();
  const visitFormId = `${idPrefix}-visit-form`;
  const workOrderFormId = `${idPrefix}-work-order-form`;
  const linkedTaskHintId = `${idPrefix}-linked-task-hint`;
  const visitHintId = `${idPrefix}-visit-hint`;
  const commentBodyId = `${idPrefix}-comment-body`;

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
    setWorkOrderId(ticket.workOrderId ?? '');
    setCommentBody('');
    setCommentIsInternal(false);
    setCommentFiles([]);
    setNextStatus('');
    setStatusNotes('');
    setFieldServiceNotes('');
    setWorkOrderNotes('');
  }, [ticket]);

  // El consumidor recarga el ticket tras cada acción (objeto nuevo, mismo id): el origen del
  // mensaje y los formularios abiertos solo se reinician al cambiar de caso.
  const ticketId = ticket?.id ?? null;
  useEffect(() => {
    setActionSource(null);
    setVisitFormOpen(false);
    setWorkOrderFormOpen(false);
  }, [ticketId]);

  const messagesFor = (source: ActionSource) =>
    actionSource === source ? (
      <ActionMessages feedback={actionFeedback} error={actionError} />
    ) : null;

  const transitionOptions = ASSURANCE_TICKET_STATUS_OPTIONS.filter(
    (option) => option.value !== ticket?.status,
  );
  const assigneeOptions = assignees.map((user) => ({
    value: user.id,
    label: getAssuranceUserDisplayName(user),
  }));
  const terminal = ticket ? isTerminalTicket(ticket) : false;
  const fieldServiceAllowed = canRequestFieldService(ticket?.status);
  const showComposer = canOperate && !isLoading && !error && Boolean(ticket);
  // Guardar asignación aparece solo cuando cambia responsable o área (ajuste CA-2).
  const assignmentChanged =
    assignedUserId !== (ticket?.assignedUserId ?? '') || queueName !== (ticket?.queueName ?? '');
  // Formularios en línea: no se abren sin el permiso de su acción (spec §4 nota v1.1).
  // La fila usa la guarda completa de H5 de su acción (spec §4 nota v1.1): sin ella, el botón
  // queda deshabilitado y no abre. Es la misma expresión que deshabilita la confirmación.
  const fieldServiceBlocked = !canOperate || !fieldServiceAllowed || terminal;
  const visitFormVisible = visitFormOpen && !fieldServiceBlocked;
  const workOrderFormVisible = workOrderFormOpen && canManage;
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
    if (!canManage) setWorkOrderFormOpen(false);
  }, [canManage]);
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

  const content = (
    <>
      {isLoading ? (
        <TicketPanelSkeleton />
      ) : error ? (
        <PortalAlert variant="error" title="No fue posible cargar el ticket" description={error} />
      ) : !ticket ? (
        <PortalEmptyState title="Ticket no disponible" description={emptyDescription} />
      ) : (
        <div className="space-y-3">
          {showTopMessages ? (
            <ActionMessages feedback={actionFeedback} error={actionError} />
          ) : null}

          {/* B · Cabecera de acciones: insignias y una fila con Estado, Responsable y Área. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">{getAssuranceTicketTypeLabel(ticket.type)}</Badge>
              <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
                {getAssuranceTicketStatusLabel(ticket.status)}
              </Badge>
              <Badge variant={getAssuranceTicketPriorityVariant(ticket.priority)}>
                {getAssuranceTicketPriorityLabel(ticket.priority)}
              </Badge>
              {/* Sin política de plazos (p. ej. importados) «En tiempo» no significa nada. */}
              {ticket.slaPolicyId ? (
                <Badge variant={getAssuranceSlaStatusVariant(ticket.slaBreachStatus)}>
                  {getAssuranceSlaStatusLabel(ticket.slaBreachStatus)}
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

            {ticket.slaBreachStatus !== SlaBreachStatus.OK ? (
              <PortalAlert
                variant="warning"
                density="compact"
                title="Plazo de atención en seguimiento"
                description={`Estado actual: ${getAssuranceSlaStatusLabel(ticket.slaBreachStatus)}.`}
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

            <div className="grid items-start gap-3 sm:grid-cols-3">
              {/* En estado terminal el estado es solo su insignia: sin formulario (§3 B). */}
              {!terminal ? (
                <div role="group" aria-label="Cambiar estado" className="space-y-2">
                  <Select
                    id={`${idPrefix}-transition-status`}
                    label="Nuevo estado"
                    value={nextStatus}
                    placeholder="Selecciona un estado"
                    options={transitionOptions}
                    onChange={(event) => setNextStatus(event.target.value)}
                    disabled={!canOperate || terminal}
                  />
                  {nextStatus ? (
                    <>
                      <Input
                        id={`${idPrefix}-transition-notes`}
                        label="Nota"
                        value={statusNotes}
                        onChange={(event) => setStatusNotes(event.target.value)}
                        placeholder="Opcional salvo al resolver"
                        helperText={
                          nextStatus === TicketStatus.RESOLVED
                            ? 'Para resolver el caso la nota es obligatoria.'
                            : undefined
                        }
                      />
                      <Button
                        type="button"
                        className="w-full"
                        loading={isTransitionSubmitting}
                        disabled={!canOperate || !nextStatus || terminal}
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
                  {messagesFor('status')}
                </div>
              ) : null}

              <div role="group" aria-label="Asignación" className="space-y-2 sm:col-span-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    id={`${idPrefix}-assign-user`}
                    label="Responsable"
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
                  {/* Área vive solo aquí (spec §4 nota v1.1): comparte el guardado con Responsable. */}
                  <Select
                    id={`${idPrefix}-assign-queue`}
                    label="Área"
                    value={queueName}
                    placeholder={ASSURANCE_EMPTY_QUEUE_LABEL}
                    options={ASSURANCE_QUEUE_OPTIONS}
                    onChange={(event) => setQueueName(event.target.value)}
                    disabled={!canManage}
                  />
                </div>
                {assignmentChanged ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      loading={isAssignmentSubmitting}
                      disabled={!canManage}
                      onClick={async () => {
                        setActionSource('assignment');
                        await onAssign({
                          assignedUserId: assignedUserId || undefined,
                          queueName: (queueName ||
                            undefined) as AssignAssuranceTicketDto['queueName'],
                        });
                      }}
                    >
                      Guardar asignación
                    </Button>
                  </div>
                ) : null}
                {messagesFor('assignment')}
              </div>
            </div>
          </div>

          {/* C · Propiedades: una superficie a dos columnas (densidad v1.1). */}
          <PortalFieldList columns={2}>
            <PortalFieldRow label="Solicitante">
              {getAssuranceRequesterTypeLabel(ticket.requesterType)}
            </PortalFieldRow>
            <PortalFieldRow
              label="Relacionado con"
              empty={!ticket.subjectType}
              emptyLabel="No disponible"
            >
              {ticket.subjectType ? getAssuranceSubjectTypeLabel(ticket.subjectType) : null}
            </PortalFieldRow>
            <PortalFieldRow
              label="Visita técnica"
              empty={ticket.fieldDecision === TicketFieldDecision.NOT_REQUIRED}
              emptyLabel={getAssuranceFieldDecisionLabel(TicketFieldDecision.NOT_REQUIRED)}
            >
              {getAssuranceFieldDecisionLabel(ticket.fieldDecision)}
            </PortalFieldRow>
            <PortalFieldRow label="Abierto">
              {formatAssuranceDateTime(ticket.createdAt)}
            </PortalFieldRow>
            <PortalFieldRow
              label="Orden de trabajo"
              mono
              empty={!ticket.workOrderId}
              emptyLabel={ASSURANCE_UNLINKED_WORK_ORDER_LABEL}
            >
              {formatAssuranceReference(ticket.workOrderId)}
            </PortalFieldRow>
            <PortalFieldRow label="Actualizado">
              {formatAssuranceDateTime(ticket.updatedAt)}
            </PortalFieldRow>
            <PortalFieldRow label="Origen">{getAssuranceSourceLabel(ticket.source)}</PortalFieldRow>
            {/* Los importados de UISP no traen fecha real de cierre: coincide con la apertura. */}
            {ticket.closedAt && ticket.closedAt !== ticket.createdAt ? (
              <PortalFieldRow label="Cerrado">
                {formatAssuranceDateTime(ticket.closedAt)}
              </PortalFieldRow>
            ) : null}
            {ticket.slaPolicyId ? (
              <>
                <PortalFieldRow label="Responder antes de">
                  {formatAssuranceDateTime(ticket.slaFirstResponseAt)}
                </PortalFieldRow>
                <PortalFieldRow label="Resolver antes de">
                  {formatAssuranceDateTime(ticket.slaResolveByAt)}
                </PortalFieldRow>
              </>
            ) : null}
          </PortalFieldList>

          {/* D · Descripción y adjuntos, sin tarjeta propia. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <h3 className={portalPanelDenseTitleClassName}>Descripción</h3>
              {ticket.description?.trim() ? (
                <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">
                  {ticket.description.trim()}
                </p>
              ) : (
                <p className={cn('mt-1 text-sm', portalFieldEmptyValueClassName)}>
                  Sin descripción adicional registrada para este caso.
                </p>
              )}
            </div>
            <section
              aria-labelledby={`${idPrefix}-attachments-title`}
              data-testid="ticket-attachments-section"
              className="min-w-0"
            >
              <h3 id={`${idPrefix}-attachments-title`} className={portalPanelDenseTitleClassName}>
                Adjuntos ({ticketAttachments.length})
              </h3>
              {ticketAttachments.length === 0 ? (
                <p className={cn('mt-1 text-sm', portalFieldEmptyValueClassName)}>
                  Este caso no tiene archivos adjuntos.
                </p>
              ) : (
                <div className="mt-1">
                  <TicketAttachmentList
                    ticketId={ticket.id}
                    attachments={ticketAttachments}
                    variant="compact"
                    label={`Adjuntos del caso: ${formatTicketAttachmentCount(ticketAttachments.length)}`}
                  />
                </div>
              )}
            </section>
          </div>

          {/* E · Visita y orden: fila de acciones; cada una abre su formulario en línea. */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Sin permiso de la acción el botón queda deshabilitado y no abre su formulario. */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={actionRowButtonClassName}
                aria-expanded={visitFormVisible}
                aria-controls={visitFormId}
                aria-describedby={canOperate && !fieldServiceAllowed ? visitHintId : undefined}
                disabled={fieldServiceBlocked}
                onClick={() => setVisitFormOpen((current) => !current)}
              >
                Solicitar visita
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={actionRowButtonClassName}
                aria-expanded={workOrderFormVisible}
                aria-controls={workOrderFormId}
                disabled={!canManage}
                onClick={() => setWorkOrderFormOpen((current) => !current)}
              >
                Vincular orden de trabajo
              </Button>
              {canOperate && !terminal && onCreateLinkedTask ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={actionRowButtonClassName}
                    aria-describedby={linkedTaskHintId}
                    onClick={onCreateLinkedTask}
                  >
                    Crear tarea vinculada
                  </Button>
                  <span id={linkedTaskHintId} className="text-xs text-gray-600 dark:text-gray-300">
                    No crea una visita automática.
                  </span>
                </>
              ) : null}
              {/* La ayuda de la visita se ve junto a la fila: el formulario no abre en ese estado. */}
              {canOperate && !fieldServiceAllowed ? (
                <span id={visitHintId} className="text-xs text-gray-600 dark:text-gray-300">
                  Disponible solo cuando el ticket está en progreso o en espera interna.
                </span>
              ) : null}
            </div>

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
                <Input
                  id={`${idPrefix}-work-order-id`}
                  label="Orden de trabajo"
                  value={workOrderId}
                  onChange={(event) => setWorkOrderId(event.target.value)}
                  placeholder="Identificador de la orden"
                />
                <div>
                  <label htmlFor={`${idPrefix}-link-wo-notes`} className={fieldLabelClassName}>
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
                <Button
                  type="button"
                  loading={isLinkingWorkOrder}
                  disabled={!canManage || !workOrderId.trim()}
                  onClick={async () => {
                    setActionSource('workOrder');
                    await onLinkWorkOrder({
                      workOrderId: workOrderId.trim(),
                      notes: workOrderNotes.trim() || undefined,
                    });
                    setWorkOrderNotes('');
                  }}
                >
                  Confirmar vínculo
                </Button>
              </div>
            ) : null}
            {/* Fuera de los formularios: tras confirmar, el estado puede cerrar el formulario y el
                mensaje debe seguir a la vista junto a la fila de acciones. */}
            {messagesFor('fieldService')}
            {messagesFor('workOrder')}
          </div>

          {/* F · Hilo: filtro Comentarios (por defecto), Historial, Todo. */}
          <Tabs defaultValue="comments">
            <TabsList aria-label="Filtrar el hilo del caso">
              <TabsTrigger value="comments">Comentarios</TabsTrigger>
              <TabsTrigger value="history">Historial</TabsTrigger>
              <TabsTrigger value="all">Todo</TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="mt-3 space-y-3">
              {comments.length === 0 ? (
                <PortalEmptyState
                  embedded
                  title="Sin comentarios registrados"
                  description="Usa este espacio para dejar contexto operativo o trazabilidad de atención."
                />
              ) : (
                comments.map((comment) => (
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
                ))
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
      )}
    </>
  );

  return children({ content, composer });
}
