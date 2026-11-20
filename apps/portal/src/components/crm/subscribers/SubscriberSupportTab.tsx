'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccessPermissionKey, TicketFieldDecision, UserRole } from '@iwana/shared';
import type {
  ContractResponse,
  LinkExecutionOrderBody,
  SubscriberUpcomingVisitsResponse,
} from '@iwana/shared';
import type {
  AssuranceCommentSubmission,
  AssuranceSlaPolicy,
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  AssignAssuranceTicketDto,
  InternalUser,
  RequestAssuranceFieldServiceDto,
  SubscriberRecord,
  TransitionAssuranceTicketDto,
} from '@/lib/api-client';
import { assuranceApi, usersApi } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { useOptionalAuth } from '@/components/auth/AuthProvider';
import { getAssuranceTicketPath } from '@/components/assurance/assurance-routes';
import { formatContractAlias, formatSubscriberName } from './subscriber-ui';
import { SUBSCRIBER_TICKETS_PANEL_ID, SubscriberTicketsSection } from './SubscriberTicketsSection';
import {
  SUBSCRIBER_VISITS_PANEL_ID,
  SubscriberVisitsSection,
  isOpenVisitEntry,
  type VisitEntry,
} from './SubscriberVisitsSection';
import {
  SUBSCRIBER_UPCOMING_VISITS_PANEL_ID,
  SubscriberUpcomingVisitsStrip,
} from './SubscriberUpcomingVisitsStrip';
import { AssuranceCreateTicketForm } from '@/components/assurance/AssuranceCreateTicketForm';
import type { AssuranceCreateTicketSubmitPayload } from '@/components/assurance/AssuranceCreateTicketForm';
import {
  AssuranceTicketDrawer,
  AssuranceTicketPane,
} from '@/components/assurance/AssuranceTicketDrawer';
import type { AssuranceTicketDetailProps } from '@/components/assurance/AssuranceTicketDetail';
import { getTicketCommentAttachmentError } from '@/components/assurance/ticket-attachments';
import { createAssuranceVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { PortalSuccessAlert, useMinWidth } from '@/components/shared/portal-ui';
import { getAssuranceTicketStatusLabel } from '@/components/assurance/assurance-labels';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';

interface SubscriberSupportTabProps {
  subscriber: SubscriberRecord;
  /** Servicios ya cargados en la ficha; se ofrecen en «Relacionado con» al crear (spec §8). */
  contracts?: ContractResponse[];
}

type AssuranceTicketSharedProps = Omit<AssuranceTicketDetailProps, 'children' | 'openInPageHref'>;

const NO_CONTRACTS: ContractResponse[] = [];

type DrawerAction =
  | 'comment'
  | 'transition'
  | 'assignment'
  | 'field-service'
  | 'link-work-order'
  | null;

async function loadOperationalUsers(): Promise<InternalUser[]> {
  const collected = new Map<string, InternalUser>();
  let cursor: string | undefined;
  do {
    const response = await usersApi.list(cursor ? { cursor, limit: 100 } : { limit: 100 });
    response.data.forEach((user) => collected.set(user.id, user));
    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor);
  return [...collected.values()];
}

/** Corte de la vista dividida (dictamen D1 §2): `xl`, lista de 25rem y el ticket al lado. */
const SPLIT_VIEW_QUERY = '(min-width: 1280px)';
/** Panel del ticket en vista dividida: no más alto que la lista ni que la ventana. */
const SPLIT_PANE_CLASS_NAME = 'xl:max-h-[min(40rem,calc(100dvh-8rem))]';
/** Ticket abierto en la URL (spec §3 B); convive con `tab` y los filtros de H6. */
const TICKET_PARAM = 'ticket';

type TicketHistoryMode = 'push' | 'replace' | 'none';

function readTicketParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(TICKET_PARAM) || null;
}

/** Igual que los filtros de H6: historia nativa, sin navegar ni recargar la ficha. */
function writeTicketParam(ticketId: string | null, mode: Exclude<TicketHistoryMode, 'none'>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (ticketId) url.searchParams.set(TICKET_PARAM, ticketId);
  else url.searchParams.delete(TICKET_PARAM);
  if (url.href === window.location.href) return;
  if (mode === 'push') window.history.pushState(window.history.state, '', url);
  else window.history.replaceState(window.history.state, '', url);
}

/**
 * Ticket de entrada en vista dividida (spec v1.2 bloque J, ajusta C/D3): el primero de la lista
 * tal como está ordenada (abiertos primero, por urgencia), para que la fila seleccionada quede
 * arriba y a la vista (CA-18).
 */
function pickEntryTicket(tickets: readonly AssuranceTicket[]): AssuranceTicket | null {
  return tickets[0] ?? null;
}

/** Roles que el endpoint de próximas visitas acepta (contrato v1.0); además del permiso (CA-15). */
const UPCOMING_VISITS_ROLES = new Set<string>([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT]);

/** Resultado cumplido cuya carga es un arreglo: lo demás cuenta como fallo de carga. */
function isFulfilledList<T>(
  result: PromiseSettledResult<T[]>,
): result is PromiseFulfilledResult<T[]> {
  return result.status === 'fulfilled' && Array.isArray(result.value);
}

/** Lleva el foco al encabezado de un panel de la pestaña (CA-11 y franja de resumen). */
function focusPanelHeading(panelId: string): void {
  const panel = document.getElementById(panelId);
  const heading = panel?.querySelector<HTMLElement>('h2, h3');
  panel?.scrollIntoView?.({ block: 'start' });
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus();
}

export function SubscriberSupportTab({
  subscriber,
  contracts = NO_CONTRACTS,
}: SubscriberSupportTabProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canReadTickets = hasPermission(AccessPermissionKey.ASSURANCE_TICKETS_READ);
  const canManageTickets = hasPermission(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE);
  const canReadVisits = hasPermission(AccessPermissionKey.WFM_SCHEDULE_READ);
  const canManageWfmSchedule = hasPermission(AccessPermissionKey.WFM_SCHEDULE_MANAGE);
  const canReadUsers = hasPermission(AccessPermissionKey.USERS_READ);
  const role = useOptionalAuth()?.user?.role;
  // La franja solo se ofrece a quien el servidor la entrega: rol y permiso (CA-15).
  const canReadUpcomingVisits =
    canReadVisits && !subscriber.privacyRestricted && !!role && UPCOMING_VISITS_ROLES.has(role);
  // Nombres de responsables al montar, en paralelo con la lista (spec §12 paso 1, CA-4).
  const shouldLoadUsers =
    !subscriber.privacyRestricted && (canManageTickets || (canReadTickets && canReadUsers));
  const shouldLoadPolicies = !subscriber.privacyRestricted && (canReadTickets || canManageTickets);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFeedback, setCreateFeedback] = useState('');
  const [refreshTicketsKey, setRefreshTicketsKey] = useState(0);
  const [assignees, setAssignees] = useState<InternalUser[]>([]);
  const [usersPending, setUsersPending] = useState(shouldLoadUsers);
  const [slaPolicies, setSlaPolicies] = useState<AssuranceSlaPolicy[]>([]);
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const [visitEntries, setVisitEntries] = useState<VisitEntry[] | null>(null);
  const [upcoming, setUpcoming] = useState<SubscriberUpcomingVisitsResponse | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [closeAnnouncement, setCloseAnnouncement] = useState('');

  const [drawerTicket, setDrawerTicket] = useState<AssuranceTicket | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerFeedback, setDrawerFeedback] = useState<string | null>(null);
  const [drawerActionError, setDrawerActionError] = useState<string | null>(null);
  const [drawerAction, setDrawerAction] = useState<DrawerAction>(null);
  const [comments, setComments] = useState<AssuranceTicketComment[]>([]);
  const [timeline, setTimeline] = useState<AssuranceTimelineEvent[]>([]);
  const [ticketOpener, setTicketOpener] = useState<HTMLButtonElement | null>(null);
  const [listedTickets, setListedTickets] = useState<readonly AssuranceTicket[] | null>(null);
  const isWide = useMinWidth(SPLIT_VIEW_QUERY, false);
  const splitView = isWide && canReadTickets && listedTickets !== null && listedTickets.length > 0;
  // Id abierto, síncrono: evita una segunda carga del mismo ticket (R2) y el doble efecto.
  const openTicketIdRef = useRef<string | null>(null);
  const listedTicketsRef = useRef<readonly AssuranceTicket[]>([]);
  const urlSyncedRef = useRef(false);
  const autoSelectedRef = useRef(false);

  const refreshTickets = useCallback(() => setRefreshTicketsKey((current) => current + 1), []);

  useEffect(() => {
    if (!shouldLoadUsers && !shouldLoadPolicies) return;
    let active = true;
    void Promise.allSettled([
      shouldLoadUsers ? loadOperationalUsers() : Promise.resolve([]),
      shouldLoadPolicies ? assuranceApi.slaPolicies.list() : Promise.resolve([]),
    ]).then(([usersResult, policiesResult]) => {
      if (!active) return;
      setAssignees(usersResult.status === 'fulfilled' ? usersResult.value : []);
      setSlaPolicies(policiesResult.status === 'fulfilled' ? policiesResult.value : []);
      setUsersPending(false);
    });
    return () => {
      active = false;
    };
  }, [shouldLoadPolicies, shouldLoadUsers]);

  const dismissCreateFeedback = useCallback(() => {
    setCreateFeedback('');
    setCreatedTicketId(null);
  }, []);

  const closeCreate = useCallback(() => {
    if (createSubmitting) return;
    setCreateOpen(false);
    setCreateError(null);
  }, [createSubmitting]);

  const onCreateTicket = useCallback(
    async ({ ticket, followUpAction }: AssuranceCreateTicketSubmitPayload) => {
      if (!canManageTickets || subscriber.privacyRestricted) return;
      setCreateError(null);
      setCreateFeedback('');
      setCreateSubmitting(true);
      try {
        const createdTicket = await assuranceApi.tickets.create(ticket);
        if (
          ticket.fieldDecision === TicketFieldDecision.FIELD_SERVICE_REQUIRED &&
          followUpAction !== 'ticket-only' &&
          canManageWfmSchedule
        ) {
          const result = await createAssuranceVisitRequestAndRoute({
            ticketId: createdTicket.id,
            subject: createdTicket.subject,
            priority: createdTicket.priority,
            notes: createdTicket.description,
            nextAction: followUpAction,
          });
          setCreateOpen(false);
          if (canReadTickets) refreshTickets();
          router.push(result.href);
          return;
        }

        setCreateOpen(false);
        setCreateFeedback(
          canReadTickets ? 'Ticket creado y vinculado al suscriptor' : 'Ticket creado',
        );
        setCreatedTicketId(createdTicket.id);
        if (canReadTickets) refreshTickets();
      } catch {
        setCreateError('Revisa la información e inténtalo de nuevo.');
      } finally {
        setCreateSubmitting(false);
      }
    },
    [
      canManageTickets,
      canManageWfmSchedule,
      canReadTickets,
      refreshTickets,
      router,
      subscriber.privacyRestricted,
    ],
  );

  const openTicket = useCallback(
    (
      ticket: AssuranceTicket,
      opener: HTMLButtonElement | null,
      history: TicketHistoryMode = 'push',
    ) => {
      if (!canReadTickets || subscriber.privacyRestricted) return;
      if (history !== 'none') {
        writeTicketParam(ticket.id, openTicketIdRef.current === ticket.id ? 'replace' : history);
      }
      autoSelectedRef.current = false;
      if (openTicketIdRef.current === ticket.id) {
        // Ya abierto (otro clic, «atrás» o la URL): sin segunda carga.
        if (opener) setTicketOpener(opener);
        setDrawerOpen(true);
        return;
      }
      openTicketIdRef.current = ticket.id;
      setTicketOpener(opener);
      dismissCreateFeedback();
      setCloseAnnouncement('');
      setDrawerTicket(ticket);
      setDrawerOpen(true);
      setDrawerLoading(true);
      setDrawerError(null);
      setDrawerFeedback(null);
      setDrawerActionError(null);
      setComments([]);
      setTimeline([]);
      void Promise.allSettled([
        assuranceApi.tickets.get(ticket.id),
        assuranceApi.tickets.listComments(ticket.id),
        assuranceApi.tickets.listTimeline(ticket.id),
      ]).then(([ticketResult, commentsResult, timelineResult]) => {
        // Otro ticket se abrió mientras cargaba este: se descarta la respuesta tardía.
        if (openTicketIdRef.current !== ticket.id) return;
        setDrawerTicket(ticketResult.status === 'fulfilled' ? ticketResult.value : ticket);
        // Guarda de datos (QA3): una lista con forma inesperada se trata como fallo de carga,
        // no rompe el detalle.
        const commentsOk = isFulfilledList(commentsResult);
        const timelineOk = isFulfilledList(timelineResult);
        setComments(commentsOk ? commentsResult.value : []);
        setTimeline(timelineOk ? timelineResult.value : []);
        if (ticketResult.status === 'rejected' || !commentsOk || !timelineOk) {
          setDrawerError('No fue posible cargar todos los detalles del ticket.');
        }
        setDrawerLoading(false);
      });
    },
    [canReadTickets, dismissCreateFeedback, subscriber.privacyRestricted],
  );

  /** Relee el ticket abierto tras un comentario, como la mesa de ayuda; conserva lo que falle. */
  const reloadOpenTicket = useCallback(
    async (ticketId: string): Promise<AssuranceTicket | null> => {
      const [ticketResult, commentsResult, timelineResult] = await Promise.allSettled([
        assuranceApi.tickets.get(ticketId),
        assuranceApi.tickets.listComments(ticketId),
        assuranceApi.tickets.listTimeline(ticketId),
      ]);
      if (isFulfilledList(commentsResult)) setComments(commentsResult.value);
      if (isFulfilledList(timelineResult)) setTimeline(timelineResult.value);
      // Forma inesperada tras una acción: se avisa como al abrir, sin descartar en silencio.
      const malformed = [commentsResult, timelineResult].some(
        (result) => result.status === 'fulfilled' && !Array.isArray(result.value),
      );
      if (malformed) setDrawerError('No fue posible cargar todos los detalles del ticket.');
      return ticketResult.status === 'fulfilled' ? ticketResult.value : null;
    },
    [],
  );

  /** Cierra sin mover el foco ni tocar la URL («atrás» o salida de la vista dividida). */
  const dismissTicket = useCallback(() => {
    openTicketIdRef.current = null;
    autoSelectedRef.current = false;
    setDrawerOpen(false);
    setDrawerTicket(null);
    setTicketOpener(null);
  }, []);

  const closeDrawer = useCallback(() => {
    const closedTicket = drawerTicket;
    openTicketIdRef.current = null;
    writeTicketParam(null, 'replace');
    setDrawerOpen(false);
    setDrawerTicket(null);
    setTicketOpener(null);
    // Foco a la fila que lo abrió; si salió del filtro, al encabezado con anuncio (§6, CA-11).
    if (ticketOpener?.isConnected) {
      ticketOpener.focus();
      return;
    }
    focusPanelHeading(SUBSCRIBER_TICKETS_PANEL_ID);
    if (closedTicket) {
      setCloseAnnouncement(
        `El ticket ${closedTicket.ticketNumber} pasó a ${getAssuranceTicketStatusLabel(
          closedTicket.status,
        ).toLowerCase()}`,
      );
    }
  }, [drawerTicket, ticketOpener]);

  const onTicketsLoaded = useCallback((tickets: readonly AssuranceTicket[]) => {
    listedTicketsRef.current = tickets;
    setListedTickets(tickets);
  }, []);

  // B y C: con la lista cargada se resuelve el ticket de la URL (solo si es de este suscriptor,
  // CA-4: si no, se quita sin consultarlo) y, en vista dividida, el de entrada.
  useEffect(() => {
    if (!listedTickets) return;
    if (!urlSyncedRef.current) {
      urlSyncedRef.current = true;
      const requestedId = readTicketParam();
      if (requestedId) {
        const requested = listedTickets.find((item) => item.id === requestedId);
        if (requested) {
          openTicket(requested, null, 'none');
          return;
        }
        writeTicketParam(null, 'replace');
      }
    }
    if (!splitView || openTicketIdRef.current) return;
    const entry = pickEntryTicket(listedTickets);
    if (!entry) return;
    openTicket(entry, null, 'replace');
    autoSelectedRef.current = true;
  }, [listedTickets, openTicket, splitView]);

  // Al salir de la vista dividida, el ticket que se abrió solo se cierra: en panel nunca se abre
  // nada sin pedirlo (§3 C).
  const wasSplitRef = useRef(false);
  useEffect(() => {
    if (wasSplitRef.current && !splitView && autoSelectedRef.current) {
      dismissTicket();
      writeTicketParam(null, 'replace');
    }
    wasSplitRef.current = splitView;
  }, [dismissTicket, splitView]);

  // «Atrás» y «adelante» (CA-3): la URL manda; un id ajeno se ignora (CA-4).
  useEffect(() => {
    const onPopState = () => {
      const requestedId = readTicketParam();
      const requested = requestedId
        ? listedTicketsRef.current.find((item) => item.id === requestedId)
        : undefined;
      if (requested) {
        openTicket(requested, null, 'none');
        return;
      }
      if (openTicketIdRef.current) dismissTicket();
      // En vista dividida la columna nunca queda vacía: vuelve el ticket de entrada.
      const entry = wasSplitRef.current ? pickEntryTicket(listedTicketsRef.current) : null;
      if (entry) {
        openTicket(entry, null, 'replace');
        autoSelectedRef.current = true;
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dismissTicket, openTicket]);

  // «Visitas próximas» cuenta todas las de la franja (bloque I); sin franja, las propias de antes.
  const upcomingVisits = useMemo(() => {
    if (canReadUpcomingVisits && upcoming) return upcoming.total;
    return canReadVisits && visitEntries ? visitEntries.filter(isOpenVisitEntry).length : null;
  }, [canReadUpcomingVisits, canReadVisits, upcoming, visitEntries]);
  // Lo que ya muestra la franja no se repite en el historial (CA-14).
  const upcomingVisitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of upcoming?.items ?? []) {
      ids.add(item.id);
      if (item.visitRequestId) ids.add(item.visitRequestId);
      if (item.scheduleEventId) ids.add(item.scheduleEventId);
    }
    return ids;
  }, [upcoming]);
  const showVisits = useCallback(() => {
    if (canReadUpcomingVisits) {
      focusPanelHeading(SUBSCRIBER_UPCOMING_VISITS_PANEL_ID);
      return;
    }
    setHistoryOpen(true);
    focusPanelHeading(SUBSCRIBER_VISITS_PANEL_ID);
  }, [canReadUpcomingVisits]);
  // La visita de un ticket abre ese ticket en la pestaña (vista dividida o panel), con `ticket=`.
  const openTicketFromVisit = useCallback(
    (ticketId: string, opener: HTMLButtonElement) => {
      const ticket = listedTicketsRef.current.find((item) => item.id === ticketId);
      if (!ticket) return false;
      openTicket(ticket, opener, 'push');
      return true;
    },
    [openTicket],
  );

  const runDrawerAction = useCallback(
    async (
      action: Exclude<DrawerAction, null>,
      task: () => Promise<AssuranceTicket | unknown>,
    ): Promise<boolean> => {
      if (!canManageTickets || !drawerTicket) return false;
      setDrawerAction(action);
      setDrawerActionError(null);
      setDrawerFeedback(null);
      try {
        const result = await task();
        // La respuesta de las acciones es la entidad sin los datos del detalle (nombres, visita,
        // orden y destinos de estado, spec MOD10 §3 L): se relee el detalle. El comentario ya lo
        // relee en su tarea.
        const reloaded =
          action === 'comment' ? null : await reloadOpenTicket(drawerTicket.id).catch(() => null);
        const next =
          reloaded ??
          (result && typeof result === 'object' && 'ticketNumber' in result
            ? (result as AssuranceTicket)
            : null);
        if (next) setDrawerTicket(next);
        setDrawerFeedback('Cambios guardados.');
        refreshTickets();
        return true;
      } catch (cause) {
        // Un archivo rechazado trae su nombre y el motivo: se muestra tal cual (MOD09 adjuntos).
        setDrawerActionError(
          getTicketCommentAttachmentError(cause) ??
            'No fue posible guardar los cambios. Intenta de nuevo.',
        );
        return false;
      } finally {
        setDrawerAction(null);
      }
    },
    [canManageTickets, drawerTicket, refreshTickets, reloadOpenTicket],
  );

  const subscriberPickerItem = useMemo(
    () => ({
      id: subscriber.id,
      label: formatSubscriberName(subscriber),
      sublabel: subscriber.city?.trim() || undefined,
    }),
    [subscriber],
  );

  const subscriberServices = useMemo(
    () =>
      contracts.map((contract) => ({
        id: contract.id,
        label:
          formatContractAlias(contract.alias) || contract.installationAddress?.trim() || 'Servicio',
      })),
    [contracts],
  );

  if (subscriber.privacyRestricted) return null;

  // Un solo origen de datos del ticket para el panel lateral y el panel fijo (§3 A, R2).
  const ticketDetailProps: AssuranceTicketSharedProps = {
    ticket: drawerTicket,
    comments,
    timeline,
    assignees,
    isLoading: drawerLoading,
    error: drawerError,
    actionFeedback: drawerFeedback,
    actionError: drawerActionError,
    isCommentSubmitting: drawerAction === 'comment',
    isTransitionSubmitting: drawerAction === 'transition',
    isAssignmentSubmitting: drawerAction === 'assignment',
    isFieldServiceSubmitting: drawerAction === 'field-service',
    isLinkingWorkOrder: drawerAction === 'link-work-order',
    canManage: canManageTickets,
    canOperate: canManageTickets,
    onAddComment: (payload: AssuranceCommentSubmission) =>
      runDrawerAction('comment', async () => {
        const ticketId = drawerTicket!.id;
        const added = await assuranceApi.tickets.submitComment(ticketId, payload);
        setComments((current) => [...current, added]);
        // runDrawerAction recarga el listado (clip y «Adjuntos (N)»); aquí, el ticket abierto.
        return (await reloadOpenTicket(ticketId)) ?? added;
      }),
    onTransitionStatus: (payload: TransitionAssuranceTicketDto) =>
      runDrawerAction('transition', () =>
        assuranceApi.tickets.transitionStatus(drawerTicket!.id, payload),
      ),
    onAssign: (payload: AssignAssuranceTicketDto) =>
      runDrawerAction('assignment', () => assuranceApi.tickets.assign(drawerTicket!.id, payload)),
    onRequestFieldService: (payload: RequestAssuranceFieldServiceDto) =>
      runDrawerAction('field-service', () =>
        assuranceApi.tickets.requestFieldService(drawerTicket!.id, payload),
      ),
    onLinkWorkOrder: (payload: LinkExecutionOrderBody) =>
      runDrawerAction('link-work-order', () =>
        assuranceApi.tickets.linkExecutionOrder(drawerTicket!.id, payload),
      ),
  };

  return (
    <div className="space-y-4">
      {/* Sin lectura de tickets no hay lista: el aviso va arriba (con lectura va sobre la lista, §7). */}
      {createFeedback && !canReadTickets ? (
        <PortalSuccessAlert message={createFeedback} onDismiss={dismissCreateFeedback} />
      ) : null}

      {/* Franja única de visitas pendientes, sobre la lista (spec v1.1 bloque I). */}
      {canReadUpcomingVisits ? (
        <SubscriberUpcomingVisitsStrip
          subscriberId={subscriber.id}
          privacyRestricted={subscriber.privacyRestricted}
          onLoaded={setUpcoming}
          onOpenTicket={canReadTickets ? openTicketFromVisit : undefined}
          ticketFallbackHref={canReadTickets ? getAssuranceTicketPath : undefined}
        />
      ) : null}

      {/* Vista dividida desde 1280 px (§3 A, D1 §2): lista de 25rem y el ticket al lado. Por
          debajo, una columna y el panel lateral. El historial de visitas, plegado debajo. */}
      <div
        className={
          splitView
            ? 'xl:grid xl:grid-cols-[25rem_minmax(0,1fr)] xl:items-start xl:gap-4'
            : undefined
        }
      >
        <SubscriberTicketsSection
          subscriber={subscriber}
          dense={splitView}
          canRead={canReadTickets}
          users={assignees}
          usersPending={usersPending}
          slaPoliciesConfigured={slaPolicies.length > 0}
          upcomingVisits={upcomingVisits}
          onShowVisits={showVisits}
          refreshKey={refreshTicketsKey}
          onOpenTicket={openTicket}
          onFiltersChange={dismissCreateFeedback}
          highlightTicketId={createdTicketId}
          selectedTicketId={splitView ? (drawerTicket?.id ?? null) : null}
          onTicketsLoaded={onTicketsLoaded}
          notice={
            createFeedback && canReadTickets ? (
              <PortalSuccessAlert message={createFeedback} onDismiss={dismissCreateFeedback} />
            ) : null
          }
          actions={
            canManageTickets ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11 gap-1.5 sm:min-h-9"
                aria-label="Crear ticket"
                onClick={() => {
                  setCreateError(null);
                  dismissCreateFeedback();
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {splitView ? 'Crear' : 'Crear ticket'}
              </Button>
            ) : undefined
          }
        />
        {splitView && drawerTicket ? (
          <AssuranceTicketPane
            {...ticketDetailProps}
            // Alto acotado con desplazamiento propio (CA-8, §3 E): la grilla no crece con el
            // ticket y «Visitas» queda a la vista; 40rem ≈ el panel de la lista (32rem + cabecera).
            className={SPLIT_PANE_CLASS_NAME}
          />
        ) : null}
      </div>
      <SubscriberVisitsSection
        subscriber={subscriber}
        canRead={canReadVisits}
        onEntriesChange={setVisitEntries}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        excludeIds={canReadUpcomingVisits ? upcomingVisitIds : undefined}
      />

      <p className="sr-only" role="status">
        {closeAnnouncement}
      </p>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear ticket para {subscriberPickerItem.label}</DialogTitle>
            <DialogDescription className="sr-only">
              El ticket quedará vinculado a este suscriptor.
            </DialogDescription>
          </DialogHeader>
          {canManageTickets ? (
            <AssuranceCreateTicketForm
              subscriber={subscriberPickerItem}
              subscriberServices={subscriberServices}
              allowWfmFollowUp={canManageWfmSchedule}
              assignees={assignees}
              slaPolicies={slaPolicies}
              error={createError}
              isSubmitting={createSubmitting}
              onCancel={closeCreate}
              onSubmit={onCreateTicket}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AssuranceTicketDrawer
        // La página propia filtra por rol y esta pestaña por permiso (MOD10 P2a, decisión 2026-11-16).
        showOpenInPage={false}
        open={drawerOpen && !splitView}
        onClose={closeDrawer}
        {...ticketDetailProps}
      />
    </div>
  );
}
