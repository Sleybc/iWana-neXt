'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccessPermissionKey, TicketFieldDecision } from '@iwana/shared';
import type {
  AddAssuranceCommentDto,
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
import { formatSubscriberName } from './subscriber-ui';
import { SubscriberTicketsSection } from './SubscriberTicketsSection';
import { SubscriberVisitsSection } from './SubscriberVisitsSection';
import { AssuranceCreateTicketForm } from '@/components/assurance/AssuranceCreateTicketForm';
import type { AssuranceCreateTicketSubmitPayload } from '@/components/assurance/AssuranceCreateTicketForm';
import { AssuranceTicketDrawer } from '@/components/assurance/AssuranceTicketDrawer';
import { createAssuranceVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import { PortalAlert } from '@/components/shared/portal-ui';
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
}

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

export function SubscriberSupportTab({ subscriber }: SubscriberSupportTabProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canReadTickets = hasPermission(AccessPermissionKey.ASSURANCE_TICKETS_READ);
  const canManageTickets = hasPermission(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE);
  const canReadVisits = hasPermission(AccessPermissionKey.WFM_SCHEDULE_READ);
  const canManageWfmSchedule = hasPermission(AccessPermissionKey.WFM_SCHEDULE_MANAGE);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFeedback, setCreateFeedback] = useState('');
  const [refreshTicketsKey, setRefreshTicketsKey] = useState(0);
  const [assignees, setAssignees] = useState<InternalUser[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<AssuranceSlaPolicy[]>([]);

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
    if (!createOpen || !canManageTickets || subscriber.privacyRestricted) return;
    let active = true;
    void Promise.allSettled([loadOperationalUsers(), assuranceApi.slaPolicies.list()]).then(
      ([usersResult, policiesResult]) => {
        if (!active) return;
        setAssignees(usersResult.status === 'fulfilled' ? usersResult.value : []);
        setSlaPolicies(policiesResult.status === 'fulfilled' ? policiesResult.value : []);
      },
    );
    return () => {
      active = false;
    };
  }, [canManageTickets, createOpen, subscriber.privacyRestricted]);

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
        canManageTickets ? loadOperationalUsers() : Promise.resolve([]),
      ]).then(([ticketResult, commentsResult, timelineResult, usersResult]) => {
        setDrawerTicket(ticketResult.status === 'fulfilled' ? ticketResult.value : ticket);
        setComments(commentsResult.status === 'fulfilled' ? commentsResult.value : []);
        setTimeline(timelineResult.status === 'fulfilled' ? timelineResult.value : []);
        if (usersResult.status === 'fulfilled') setAssignees(usersResult.value);
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
    [canManageTickets, canReadTickets, subscriber.privacyRestricted],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setDrawerTicket(null);
    setTicketOpener((opener) => {
      opener?.focus();
      return null;
    });
  }, []);

  const runDrawerAction = useCallback(
    async (action: Exclude<DrawerAction, null>, task: () => Promise<AssuranceTicket | unknown>) => {
      if (!canManageTickets || !drawerTicket) return;
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
      } catch {
        setDrawerActionError('No fue posible guardar los cambios. Intenta de nuevo.');
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

  if (subscriber.privacyRestricted) return null;

  return (
    <div className="space-y-4">
      {createFeedback ? <PortalAlert variant="success" title={createFeedback} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="flex justify-end">
            {canManageTickets ? (
              <Button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setCreateFeedback('');
                  setCreateOpen(true);
                }}
              >
                Crear ticket
              </Button>
            ) : null}
          </div>
          <SubscriberTicketsSection
            subscriber={subscriber}
            canRead={canReadTickets}
            refreshKey={refreshTicketsKey}
            onOpenTicket={openTicket}
          />
        </div>
        <SubscriberVisitsSection subscriber={subscriber} canRead={canReadVisits} />
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear ticket</DialogTitle>
            <DialogDescription>
              El ticket quedará vinculado a {subscriberPickerItem.label}.
            </DialogDescription>
          </DialogHeader>
          {canManageTickets ? (
            <AssuranceCreateTicketForm
              subscriber={subscriberPickerItem}
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
        onAddComment={(payload: AddAssuranceCommentDto) =>
          runDrawerAction('comment', async () => {
            const added = await assuranceApi.tickets.addComment(drawerTicket!.id, payload);
            setComments((current) => [...current, added]);
            return added;
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
