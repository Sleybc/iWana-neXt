'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccessPermissionKey, TicketFieldDecision } from '@iwana/shared';
import type { ContractResponse } from '@iwana/shared';
import type {
  AssuranceCommentSubmission,
  AssuranceSlaPolicy,
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  AssignAssuranceTicketDto,
  InternalUser,
  LinkAssuranceWorkOrderDto,
  RequestAssuranceFieldServiceDto,
  SubscriberRecord,
  TransitionAssuranceTicketDto,
} from '@/lib/api-client';
import { assuranceApi, usersApi } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatContractAlias, formatSubscriberName } from './subscriber-ui';
import { SUBSCRIBER_TICKETS_PANEL_ID, SubscriberTicketsSection } from './SubscriberTicketsSection';
import {
  SUBSCRIBER_VISITS_PANEL_ID,
  SubscriberVisitsSection,
  isOpenVisitEntry,
  type VisitEntry,
} from './SubscriberVisitsSection';
import { AssuranceCreateTicketForm } from '@/components/assurance/AssuranceCreateTicketForm';
import type { AssuranceCreateTicketSubmitPayload } from '@/components/assurance/AssuranceCreateTicketForm';
import { AssuranceTicketDrawer } from '@/components/assurance/AssuranceTicketDrawer';
import { getTicketCommentAttachmentError } from '@/components/assurance/ticket-attachments';
import { createAssuranceVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { PortalSuccessAlert } from '@/components/shared/portal-ui';
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
    (ticket: AssuranceTicket, opener: HTMLButtonElement) => {
      if (!canReadTickets || subscriber.privacyRestricted) return;
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
        setDrawerTicket(ticketResult.status === 'fulfilled' ? ticketResult.value : ticket);
        setComments(commentsResult.status === 'fulfilled' ? commentsResult.value : []);
        setTimeline(timelineResult.status === 'fulfilled' ? timelineResult.value : []);
        if (
          ticketResult.status === 'rejected' ||
          commentsResult.status === 'rejected' ||
          timelineResult.status === 'rejected'
        ) {
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
      if (commentsResult.status === 'fulfilled') setComments(commentsResult.value);
      if (timelineResult.status === 'fulfilled') setTimeline(timelineResult.value);
      return ticketResult.status === 'fulfilled' ? ticketResult.value : null;
    },
    [],
  );

  const closeDrawer = useCallback(() => {
    const closedTicket = drawerTicket;
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

  const upcomingVisits = useMemo(
    () => (canReadVisits && visitEntries ? visitEntries.filter(isOpenVisitEntry).length : null),
    [canReadVisits, visitEntries],
  );
  const showVisits = useCallback(() => focusPanelHeading(SUBSCRIBER_VISITS_PANEL_ID), []);

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
        if (result && typeof result === 'object' && 'ticketNumber' in result) {
          setDrawerTicket(result as AssuranceTicket);
        }
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
    [canManageTickets, drawerTicket, refreshTickets],
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

  return (
    <div className="space-y-4">
      {/* Sin lectura de tickets no hay lista: el aviso va arriba (con lectura va sobre la lista, §7). */}
      {createFeedback && !canReadTickets ? (
        <PortalSuccessAlert message={createFeedback} onDismiss={dismissCreateFeedback} />
      ) : null}

      {/* Dirección A (§3): una columna; Tickets a ancho completo y Visitas compacta debajo. */}
      <SubscriberTicketsSection
        subscriber={subscriber}
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
              onClick={() => {
                setCreateError(null);
                dismissCreateFeedback();
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Crear ticket
            </Button>
          ) : undefined
        }
      />
      <SubscriberVisitsSection
        subscriber={subscriber}
        canRead={canReadVisits}
        onEntriesChange={setVisitEntries}
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
        open={drawerOpen}
        ticket={drawerTicket}
        comments={comments}
        timeline={timeline}
        assignees={assignees}
        isLoading={drawerLoading}
        error={drawerError}
        actionFeedback={drawerFeedback}
        actionError={drawerActionError}
        isCommentSubmitting={drawerAction === 'comment'}
        isTransitionSubmitting={drawerAction === 'transition'}
        isAssignmentSubmitting={drawerAction === 'assignment'}
        isFieldServiceSubmitting={drawerAction === 'field-service'}
        isLinkingWorkOrder={drawerAction === 'link-work-order'}
        canManage={canManageTickets}
        canOperate={canManageTickets}
        onClose={closeDrawer}
        onAddComment={(payload: AssuranceCommentSubmission) =>
          runDrawerAction('comment', async () => {
            const ticketId = drawerTicket!.id;
            const added = await assuranceApi.tickets.submitComment(ticketId, payload);
            setComments((current) => [...current, added]);
            // runDrawerAction recarga el listado (clip y «Adjuntos (N)»); aquí, el ticket abierto.
            return (await reloadOpenTicket(ticketId)) ?? added;
          })
        }
        onTransitionStatus={(payload: TransitionAssuranceTicketDto) =>
          runDrawerAction('transition', () =>
            assuranceApi.tickets.transitionStatus(drawerTicket!.id, payload),
          )
        }
        onAssign={(payload: AssignAssuranceTicketDto) =>
          runDrawerAction('assignment', () =>
            assuranceApi.tickets.assign(drawerTicket!.id, payload),
          )
        }
        onRequestFieldService={(payload: RequestAssuranceFieldServiceDto) =>
          runDrawerAction('field-service', () =>
            assuranceApi.tickets.requestFieldService(drawerTicket!.id, payload),
          )
        }
        onLinkWorkOrder={(payload: LinkAssuranceWorkOrderDto) =>
          runDrawerAction('link-work-order', () =>
            assuranceApi.tickets.linkWorkOrder(drawerTicket!.id, payload),
          )
        }
      />
    </div>
  );
}
