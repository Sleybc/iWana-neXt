'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { UserRole } from '@iwana/shared';
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
import { ApiError, assuranceApi, usersApi } from '@/lib/api-client';

const USERS_PAGE_SIZE = 100;

/** Mensaje de error de la mesa de ayuda para el usuario (sin detalles técnicos). */
export function mapAssuranceError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403)
      return 'No tienes permisos para operar esta vista de la mesa de ayuda.';
    if (error.status === 404) return 'El ticket consultado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta de nuevo.';
}

/** Responsables operativos (todas las páginas del listado de usuarios). */
export async function loadOperationalUsers(): Promise<InternalUser[]> {
  const collected = new Map<string, InternalUser>();
  let cursor: string | undefined;

  do {
    const response = await usersApi.list(
      cursor ? { cursor, limit: USERS_PAGE_SIZE } : { limit: USERS_PAGE_SIZE },
    );

    response.data.forEach((user) => {
      collected.set(user.id, user);
    });

    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor);

  return Array.from(collected.values());
}

/** Acceso por rol a la mesa de ayuda: el mismo en la bandeja y en la página del ticket. */
export function getAssuranceRoleAccess(role: string | null | undefined) {
  const canManage = role === UserRole.ADMIN || role === UserRole.NOC || role === UserRole.SUPPORT;
  const canView = canManage || role === UserRole.TECHNICIAN || role === UserRole.CONTRACTOR;
  return { canView, canManage };
}

/** Avisos de cada acción, iguales en la bandeja y en la página (spec MOD10 §3 H y §4). */
export const ASSURANCE_ACTION_MESSAGES = {
  comment: 'Comentario registrado.',
  status: 'Estado actualizado.',
  assignment: 'Asignación actualizada.',
  fieldService: 'Solicitud de visita técnica registrada.',
  workOrder: 'Orden de trabajo vinculada al caso.',
} as const;

interface UseAssuranceTicketDetailOptions {
  /** Se ejecuta junto a la recarga del ticket tras cada acción (p. ej. refrescar la bandeja). */
  onAfterAction?: (() => Promise<unknown>) | undefined;
}

/**
 * Estado y acciones del detalle de un ticket: carga ticket, comentarios e historial, y expone
 * los manejadores que espera `AssuranceTicketDetail`. Lo comparten la bandeja (panel) y la
 * página propia del ticket (spec MOD10 §3 K), para que ambas carguen y actúen igual.
 */
export function useAssuranceTicketDetail({ onAfterAction }: UseAssuranceTicketDetailOptions = {}) {
  const [ticket, setTicket] = useState<AssuranceTicket | null>(null);
  const [comments, setComments] = useState<AssuranceTicketComment[]>([]);
  const [timeline, setTimeline] = useState<AssuranceTimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [isTransitionSubmitting, setIsTransitionSubmitting] = useState(false);
  const [isAssignmentSubmitting, setIsAssignmentSubmitting] = useState(false);
  const [isFieldServiceSubmitting, setIsFieldServiceSubmitting] = useState(false);
  const [isLinkingWorkOrder, setIsLinkingWorkOrder] = useState(false);
  // Solo la última apertura escribe el estado: una respuesta tardía de otro ticket se descarta.
  const requestIdRef = useRef(0);
  const ticketIdRef = useRef<string | null>(null);
  const onAfterActionRef = useRef(onAfterAction);
  onAfterActionRef.current = onAfterAction;

  const refresh = useCallback(async (ticketId: string) => {
    const requestId = requestIdRef.current;
    const [ticketResult, commentsResult, timelineResult] = await Promise.allSettled([
      assuranceApi.tickets.get(ticketId),
      assuranceApi.tickets.listComments(ticketId),
      assuranceApi.tickets.listTimeline(ticketId),
    ]);

    if (requestId !== requestIdRef.current) return;
    if (ticketResult.status === 'rejected') {
      throw ticketResult.reason;
    }

    setTicket(ticketResult.value);
    setComments(commentsResult.status === 'fulfilled' ? commentsResult.value : []);
    setTimeline(timelineResult.status === 'fulfilled' ? timelineResult.value : []);
  }, []);

  /** Abre un ticket. `seed` (la fila de la bandeja) pinta número y asunto mientras carga. */
  const open = useCallback(
    async (ticketId: string, seed: AssuranceTicket | null = null) => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      ticketIdRef.current = ticketId;
      setTicket(seed);
      setComments([]);
      setTimeline([]);
      setError(null);
      setErrorStatus(null);
      setActionFeedback(null);
      setActionError(null);
      setIsLoading(true);

      try {
        await refresh(ticketId);
      } catch (loadError) {
        if (requestId !== requestIdRef.current) return;
        setError(mapAssuranceError(loadError));
        setErrorStatus(loadError instanceof ApiError ? loadError.status : null);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [refresh],
  );

  /** Limpia los avisos (al cerrar el panel o salir de la página). */
  const clearMessages = useCallback(() => {
    setActionFeedback(null);
    setActionError(null);
  }, []);

  const reloadAfterAction = useCallback(
    async (ticketId: string, successMessage: string) => {
      await Promise.all([onAfterActionRef.current?.(), refresh(ticketId)]);
      setActionFeedback(successMessage);
      setActionError(null);
    },
    [refresh],
  );

  /** Ejecuta una acción del ticket abierto con su bandera de envío, recarga y aviso. */
  const runAction = useCallback(
    async (
      setSubmitting: (value: boolean) => void,
      request: (ticketId: string) => Promise<unknown>,
      successMessage: string,
    ) => {
      const ticketId = ticketIdRef.current;
      if (!ticketId) return;
      setSubmitting(true);
      try {
        await request(ticketId);
        await reloadAfterAction(ticketId, successMessage);
      } catch (actionFailure) {
        setActionError(mapAssuranceError(actionFailure));
      } finally {
        setSubmitting(false);
      }
    },
    [reloadAfterAction],
  );

  const onAddComment = useCallback(
    async (payload: AssuranceCommentSubmission) => {
      const ticketId = ticketIdRef.current;
      if (!ticketId) return false;
      setIsCommentSubmitting(true);
      try {
        await assuranceApi.tickets.submitComment(ticketId, payload);
      } catch (commentError) {
        setActionError(mapAssuranceError(commentError));
        return false;
      } finally {
        setIsCommentSubmitting(false);
      }
      try {
        await reloadAfterAction(ticketId, ASSURANCE_ACTION_MESSAGES.comment);
      } catch (reloadError) {
        setActionError(mapAssuranceError(reloadError));
      }
      return true;
    },
    [reloadAfterAction],
  );

  const onTransitionStatus = useCallback(
    (payload: TransitionAssuranceTicketDto) =>
      runAction(
        setIsTransitionSubmitting,
        (ticketId) => assuranceApi.tickets.transitionStatus(ticketId, payload),
        ASSURANCE_ACTION_MESSAGES.status,
      ),
    [runAction],
  );

  const onAssign = useCallback(
    (payload: AssignAssuranceTicketDto) =>
      runAction(
        setIsAssignmentSubmitting,
        (ticketId) => assuranceApi.tickets.assign(ticketId, payload),
        ASSURANCE_ACTION_MESSAGES.assignment,
      ),
    [runAction],
  );

  const onRequestFieldService = useCallback(
    (payload: RequestAssuranceFieldServiceDto) =>
      runAction(
        setIsFieldServiceSubmitting,
        (ticketId) => assuranceApi.tickets.requestFieldService(ticketId, payload),
        ASSURANCE_ACTION_MESSAGES.fieldService,
      ),
    [runAction],
  );

  const onLinkWorkOrder = useCallback(
    (payload: LinkAssuranceWorkOrderDto) =>
      runAction(
        setIsLinkingWorkOrder,
        (ticketId) => assuranceApi.tickets.linkWorkOrder(ticketId, payload),
        ASSURANCE_ACTION_MESSAGES.workOrder,
      ),
    [runAction],
  );

  /** Props de `AssuranceTicketDetail` que dependen de este estado. */
  const detailProps = useMemo(
    () => ({
      ticket,
      comments,
      timeline,
      isLoading,
      error,
      actionFeedback,
      actionError,
      isCommentSubmitting,
      isTransitionSubmitting,
      isAssignmentSubmitting,
      isFieldServiceSubmitting,
      isLinkingWorkOrder,
      onAddComment,
      onTransitionStatus,
      onAssign,
      onRequestFieldService,
      onLinkWorkOrder,
    }),
    [
      ticket,
      comments,
      timeline,
      isLoading,
      error,
      actionFeedback,
      actionError,
      isCommentSubmitting,
      isTransitionSubmitting,
      isAssignmentSubmitting,
      isFieldServiceSubmitting,
      isLinkingWorkOrder,
      onAddComment,
      onTransitionStatus,
      onAssign,
      onRequestFieldService,
      onLinkWorkOrder,
    ],
  );

  return { detailProps, ticketId: ticket?.id ?? null, errorStatus, open, clearMessages };
}
