'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { SlaBreachStatus, TicketStatus } from '@iwana/shared';
import type {
  AddAssuranceCommentDto,
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  AssignAssuranceTicketDto,
  InternalUser,
  LinkAssuranceWorkOrderDto,
  RequestAssuranceFieldServiceDto,
  TransitionAssuranceTicketDto,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import {
  ASSURANCE_QUEUE_OPTIONS,
  ASSURANCE_TICKET_STATUS_OPTIONS,
  formatAssuranceDateTime,
  formatAssuranceReference,
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
  getAssuranceTimelineDescription,
  getAssuranceTimelineEventLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';
import { AssuranceKeyValueItem, assuranceTextareaClassName } from './assurance-ui';

interface AssuranceTicketDrawerProps {
  open: boolean;
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
  onClose: () => void;
  onAddComment: (payload: AddAssuranceCommentDto) => Promise<void>;
  onTransitionStatus: (payload: TransitionAssuranceTicketDto) => Promise<void>;
  onAssign: (payload: AssignAssuranceTicketDto) => Promise<void>;
  onRequestFieldService: (payload: RequestAssuranceFieldServiceDto) => Promise<void>;
  onLinkWorkOrder: (payload: LinkAssuranceWorkOrderDto) => Promise<void>;
}

function isTerminalStatus(status: string | null | undefined): boolean {
  return status === TicketStatus.CLOSED || status === TicketStatus.CANCELLED;
}

function canRequestFieldService(status: string | null | undefined): boolean {
  return status === TicketStatus.IN_PROGRESS || status === TicketStatus.PENDING_INTERNAL;
}

export function AssuranceTicketDrawer({
  open,
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
  onClose,
  onAddComment,
  onTransitionStatus,
  onAssign,
  onRequestFieldService,
  onLinkWorkOrder,
}: AssuranceTicketDrawerProps) {
  const [commentBody, setCommentBody] = useState('');
  const [commentIsInternal, setCommentIsInternal] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [queueName, setQueueName] = useState('');
  const [fieldServiceNotes, setFieldServiceNotes] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [workOrderNotes, setWorkOrderNotes] = useState('');

  const usersById = useMemo(() => new Map(assignees.map((user) => [user.id, user])), [assignees]);

  useEffect(() => {
    if (!open) {
      return;
    }

    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  useEffect(() => {
    if (!ticket) {
      return;
    }

    setAssignedUserId(ticket.assignedUserId ?? '');
    setQueueName(ticket.queueName ?? '');
    setWorkOrderId(ticket.workOrderId ?? '');
    setCommentBody('');
    setCommentIsInternal(false);
    setNextStatus('');
    setStatusNotes('');
    setFieldServiceNotes('');
    setWorkOrderNotes('');
  }, [ticket]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const transitionOptions = ASSURANCE_TICKET_STATUS_OPTIONS.filter(
    (option) => option.value !== ticket?.status,
  );
  const assigneeOptions = assignees.map((user) => ({
    value: user.id,
    label: getAssuranceUserDisplayName(user),
  }));
  const terminal = isTerminalStatus(ticket?.status);
  const fieldServiceAllowed = canRequestFieldService(ticket?.status);
  const currentAssignee = ticket?.assignedUserId ? usersById.get(ticket.assignedUserId) : null;

  return (
    <div className="fixed inset-0 z-[1200] bg-black/45">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar detalle"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 z-[1201] flex w-full max-w-3xl flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface-2">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 dark:border-dark-border">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Mesa de ayuda
            </p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
              {ticket?.ticketNumber ?? 'Detalle del ticket'}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {ticket?.subject ?? 'Consulta comentarios, timeline y acciones operativas del caso.'}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-4" aria-busy="true">
              <div className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="h-32 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
                <div className="h-32 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
              </div>
            </div>
          ) : error ? (
            <PortalAlert
              variant="error"
              title="No fue posible cargar el ticket"
              description={error}
            />
          ) : !ticket ? (
            <PortalEmptyState
              title="Ticket no disponible"
              description="Selecciona otro caso desde la tabla para consultar su trazabilidad operativa."
            />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">{getAssuranceTicketTypeLabel(ticket.type)}</Badge>
                <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
                  {getAssuranceTicketStatusLabel(ticket.status)}
                </Badge>
                <Badge variant={getAssuranceTicketPriorityVariant(ticket.priority)}>
                  {getAssuranceTicketPriorityLabel(ticket.priority)}
                </Badge>
                <Badge variant={getAssuranceSlaStatusVariant(ticket.slaBreachStatus)}>
                  {getAssuranceSlaStatusLabel(ticket.slaBreachStatus)}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AssuranceKeyValueItem
                  label="Solicitante"
                  value={getAssuranceRequesterTypeLabel(ticket.requesterType)}
                />
                <AssuranceKeyValueItem
                  label="Ref. solicitante"
                  value={formatAssuranceReference(ticket.requesterRefId)}
                />
                <AssuranceKeyValueItem
                  label="Objeto afectado"
                  value={
                    ticket.subjectType
                      ? getAssuranceSubjectTypeLabel(ticket.subjectType)
                      : 'No disponible'
                  }
                />
                <AssuranceKeyValueItem
                  label="Ref. objeto"
                  value={formatAssuranceReference(ticket.subjectRefId)}
                />
                <AssuranceKeyValueItem
                  label="Cola funcional"
                  value={getAssuranceQueueLabel(ticket.queueName)}
                />
                <AssuranceKeyValueItem
                  label="Responsable"
                  value={getAssuranceUserDisplayName(currentAssignee)}
                />
                <AssuranceKeyValueItem
                  label="Origen"
                  value={getAssuranceSourceLabel(ticket.source)}
                />
                <AssuranceKeyValueItem
                  label="Decisión de campo"
                  value={getAssuranceFieldDecisionLabel(ticket.fieldDecision)}
                />
                <AssuranceKeyValueItem
                  label="Work order vinculada"
                  value={formatAssuranceReference(ticket.workOrderId)}
                />
                <AssuranceKeyValueItem
                  label="Primera respuesta SLA"
                  value={formatAssuranceDateTime(ticket.slaFirstResponseAt)}
                />
                <AssuranceKeyValueItem
                  label="Resolución SLA"
                  value={formatAssuranceDateTime(ticket.slaResolveByAt)}
                />
                <AssuranceKeyValueItem
                  label="Actualizado"
                  value={formatAssuranceDateTime(ticket.updatedAt)}
                />
              </div>

              <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Descripción controlada
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
                  {ticket.description?.trim() ||
                    'Sin descripción adicional registrada para este caso.'}
                </p>
              </div>

              {actionFeedback && (
                <PortalAlert
                  variant="success"
                  title="Operación completada"
                  description={actionFeedback}
                />
              )}
              {actionError && (
                <PortalAlert
                  variant="error"
                  title="No fue posible aplicar la acción"
                  description={actionError}
                />
              )}

              <Tabs defaultValue="comments">
                <TabsList>
                  <TabsTrigger value="comments">Comentarios</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="actions">Acciones</TabsTrigger>
                </TabsList>

                <TabsContent value="comments" className="space-y-4">
                  {comments.length === 0 ? (
                    <PortalEmptyState
                      title="Sin comentarios registrados"
                      description="Usa este espacio para dejar contexto operativo o trazabilidad de atención."
                    />
                  ) : (
                    <div className="space-y-3">
                      {comments.map((comment) => {
                        const author = usersById.get(comment.authorUserId);

                        return (
                          <article
                            key={comment.id}
                            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {getAssuranceUserDisplayName(author)}
                              </p>
                              <Badge variant={comment.isInternal ? 'warning' : 'info'}>
                                {comment.isInternal ? 'Interno' : 'Visible'}
                              </Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatAssuranceDateTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-200">
                              {comment.body}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  {canOperate ? (
                    <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                      <label
                        htmlFor="assurance-comment-body"
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Nuevo comentario
                      </label>
                      <textarea
                        id="assurance-comment-body"
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        placeholder="Documenta el diagnóstico, la conversación o el siguiente paso acordado."
                        className={assuranceTextareaClassName}
                      />
                      <label className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={commentIsInternal}
                          onChange={(event) => setCommentIsInternal(event.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
                        />
                        Marcar como comentario interno
                      </label>
                      <div className="mt-4 flex justify-end">
                        <Button
                          type="button"
                          loading={isCommentSubmitting}
                          disabled={!commentBody.trim()}
                          onClick={async () => {
                            await onAddComment({
                              body: commentBody.trim(),
                              isInternal: commentIsInternal,
                            });
                            setCommentBody('');
                            setCommentIsInternal(false);
                          }}
                        >
                          Agregar comentario
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="timeline">
                  {timeline.length === 0 ? (
                    <PortalEmptyState
                      title="Timeline no disponible"
                      description="Este caso aún no registra hitos funcionales adicionales en la mesa de ayuda."
                    />
                  ) : (
                    <ol className="space-y-4">
                      {timeline.map((event) => {
                        const actor = event.actorUserId ? usersById.get(event.actorUserId) : null;

                        return (
                          <li
                            key={event.id}
                            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {getAssuranceTimelineEventLabel(event.eventType)}
                                </p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                  {getAssuranceTimelineDescription(event, usersById)}
                                </p>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatAssuranceDateTime(event.occurredAt)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-gray-400">
                              Actor: {actor ? getAssuranceUserDisplayName(actor) : 'Sistema'}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </TabsContent>

                <TabsContent value="actions" className="space-y-5">
                  {!canOperate ? (
                    <PortalAlert
                      variant="warning"
                      title="Acciones restringidas"
                      description="Tu rol solo tiene acceso de lectura sobre este caso en el portal empresarial."
                    />
                  ) : null}

                  {canOperate && !terminal && onCreateLinkedTask ? (
                    <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Crear tarea vinculada
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Registra una tarea operativa asociada a este ticket sin crear una visita de
                        forma automática.
                      </p>
                      <div className="mt-4">
                        <Button type="button" variant="secondary" onClick={onCreateLinkedTask}>
                          Crear tarea vinculada
                        </Button>
                      </div>
                    </section>
                  ) : null}

                  <div className="grid gap-5 xl:grid-cols-2">
                    <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Transición de estado
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Avanza el flujo operativo respetando el contrato del backend.
                      </p>
                      <div className="mt-4 space-y-3">
                        <Select
                          id="assurance-transition-status"
                          label="Nuevo estado"
                          value={nextStatus}
                          placeholder="Selecciona un estado"
                          options={transitionOptions}
                          onChange={(event) => setNextStatus(event.target.value)}
                          disabled={!canOperate || terminal}
                        />
                        <div>
                          <label
                            htmlFor="assurance-transition-notes"
                            className="text-sm font-medium text-gray-700 dark:text-gray-300"
                          >
                            Nota operativa
                          </label>
                          <textarea
                            id="assurance-transition-notes"
                            value={statusNotes}
                            onChange={(event) => setStatusNotes(event.target.value)}
                            className={assuranceTextareaClassName}
                            placeholder="Opcional: registra contexto adicional para la transición."
                          />
                        </div>
                        <Button
                          type="button"
                          loading={isTransitionSubmitting}
                          disabled={!canOperate || !nextStatus || terminal}
                          onClick={async () => {
                            await onTransitionStatus({
                              status: nextStatus as TransitionAssuranceTicketDto['status'],
                              notes: statusNotes.trim() || undefined,
                            });
                            setNextStatus('');
                            setStatusNotes('');
                          }}
                        >
                          Aplicar transición
                        </Button>
                      </div>
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Asignación
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Reasigna responsable y cola sin salir del detalle del ticket.
                      </p>
                      <div className="mt-4 space-y-3">
                        <Select
                          id="assurance-assign-user"
                          label="Responsable"
                          value={assignedUserId}
                          placeholder="Sin asignar"
                          options={assigneeOptions}
                          onChange={(event) => setAssignedUserId(event.target.value)}
                          disabled={!canManage}
                        />
                        <Select
                          id="assurance-assign-queue"
                          label="Cola funcional"
                          value={queueName}
                          placeholder="Sin cola"
                          options={ASSURANCE_QUEUE_OPTIONS}
                          onChange={(event) => setQueueName(event.target.value)}
                          disabled={!canManage}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          loading={isAssignmentSubmitting}
                          disabled={!canManage}
                          onClick={async () => {
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
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Trabajo de campo
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Solicita escalamiento a WFM cuando el caso necesita visita técnica.
                      </p>
                      <div className="mt-4 space-y-3">
                        <div>
                          <label
                            htmlFor="assurance-field-service-notes"
                            className="text-sm font-medium text-gray-700 dark:text-gray-300"
                          >
                            Nota para WFM
                          </label>
                          <textarea
                            id="assurance-field-service-notes"
                            value={fieldServiceNotes}
                            onChange={(event) => setFieldServiceNotes(event.target.value)}
                            className={assuranceTextareaClassName}
                            placeholder="Describe qué debe validar el equipo de campo."
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          loading={isFieldServiceSubmitting}
                          disabled={!canOperate || !fieldServiceAllowed || terminal}
                          onClick={async () => {
                            await onRequestFieldService({
                              notes: fieldServiceNotes.trim() || undefined,
                            });
                            setFieldServiceNotes('');
                          }}
                        >
                          Solicitar trabajo de campo
                        </Button>
                        {!fieldServiceAllowed ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Disponible solo cuando el ticket está en progreso o en espera interna.
                          </p>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Vincular work order
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Asocia una OT existente sin consultar tablas internas de WFM desde el
                        portal.
                      </p>
                      <div className="mt-4 space-y-3">
                        <Input
                          label="Identificador de work order"
                          value={workOrderId}
                          onChange={(event) => setWorkOrderId(event.target.value)}
                          placeholder="UUID de la OT"
                        />
                        <div>
                          <label
                            htmlFor="assurance-link-wo-notes"
                            className="text-sm font-medium text-gray-700 dark:text-gray-300"
                          >
                            Nota de vínculo
                          </label>
                          <textarea
                            id="assurance-link-wo-notes"
                            value={workOrderNotes}
                            onChange={(event) => setWorkOrderNotes(event.target.value)}
                            className={assuranceTextareaClassName}
                            placeholder="Opcional: agrega contexto del vínculo operativo."
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          loading={isLinkingWorkOrder}
                          disabled={!canManage || !workOrderId.trim()}
                          onClick={async () => {
                            await onLinkWorkOrder({
                              workOrderId: workOrderId.trim(),
                              notes: workOrderNotes.trim() || undefined,
                            });
                            setWorkOrderNotes('');
                          }}
                        >
                          Vincular work order
                        </Button>
                      </div>
                    </section>
                  </div>

                  {ticket.slaBreachStatus !== SlaBreachStatus.OK ? (
                    <PortalAlert
                      variant="warning"
                      title="Seguimiento SLA requerido"
                      description={`Estado actual: ${getAssuranceSlaStatusLabel(ticket.slaBreachStatus)}.`}
                    />
                  ) : null}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
