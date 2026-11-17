import { render, screen, within } from '@testing-library/react';
import {
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
} from '@iwana/shared';
import type { AssuranceTicket } from '@/lib/api-client';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';

jest.mock('@/components/shared/use-portal-modal-drawer-broadcast', () => ({
  usePortalModalDrawerBroadcast: () => undefined,
}));

function ticket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: 'ticket-1',
    tenantId: 'tenant-1',
    ticketNumber: 'UISP-25790',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.CLOSED,
    priority: TicketPriority.NORMAL,
    source: TicketSource.MIGRATION,
    subject: 'CAMBIO DE ONU',
    description: null,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: '56b52e94-4396-4039-a41c-94bc6a66962d',
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: '56b52e94-4396-4039-a41c-94bc6a66962d',
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: '2026-08-03T15:00:00.000Z',
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    createdByUserId: 'user-1',
    createdAt: '2026-06-24T20:13:00.000Z',
    updatedAt: '2026-11-15T15:31:00.000Z',
    ...overrides,
  };
}

function renderDrawer(value: AssuranceTicket) {
  const noop = jest.fn(async () => undefined);
  return render(
    <AssuranceTicketDrawer
      open
      ticket={value}
      comments={[]}
      timeline={[]}
      assignees={[]}
      isLoading={false}
      error={null}
      actionFeedback={null}
      actionError={null}
      isCommentSubmitting={false}
      isTransitionSubmitting={false}
      isAssignmentSubmitting={false}
      isFieldServiceSubmitting={false}
      isLinkingWorkOrder={false}
      canManage={false}
      canOperate={false}
      onClose={jest.fn()}
      onAddComment={noop}
      onTransitionStatus={noop}
      onAssign={noop}
      onRequestFieldService={noop}
      onLinkWorkOrder={noop}
    />,
  );
}

describe('AssuranceTicketDrawer — datos del caso (2026-11-16)', () => {
  it('sin SLA: no muestra la insignia de tiempo ni los vencimientos; muestra apertura y cierre reales', () => {
    renderDrawer(ticket());
    const panel = screen.getByRole('dialog', { name: 'UISP-25790' });
    expect(within(panel).getByText('Abierto', { selector: 'dt' })).toBeInTheDocument();
    // «Cerrado» aparece como estado y como fecha de cierre.
    expect(within(panel).getAllByText('Cerrado')).toHaveLength(2);
    expect(within(panel).getByText('Importación')).toBeInTheDocument();
    expect(within(panel).getByText('Sin vincular')).toBeInTheDocument();
    expect(panel).not.toHaveTextContent('En tiempo');
    expect(panel).not.toHaveTextContent('Responder antes de');
    expect(panel).not.toHaveTextContent('Resolver antes de');
    expect(panel).not.toHaveTextContent('Ref. solicitante');
    expect(panel).not.toHaveTextContent('Ref. objeto');
    expect(panel).not.toHaveTextContent('56B52E94');
    expect(panel).not.toHaveTextContent('Descripción controlada');
  });

  it('con SLA: muestra la insignia y los vencimientos', () => {
    renderDrawer(
      ticket({
        status: TicketStatus.OPEN,
        source: TicketSource.PORTAL,
        closedAt: null,
        slaPolicyId: 'sla-1',
        slaFirstResponseAt: '2026-06-25T13:00:00.000Z',
        slaResolveByAt: '2026-06-27T13:00:00.000Z',
      }),
    );
    const panel = screen.getByRole('dialog', { name: 'UISP-25790' });
    expect(panel).toHaveTextContent('En tiempo');
    expect(panel).toHaveTextContent('Responder antes de');
    expect(panel).toHaveTextContent('Resolver antes de');
  });
});

describe('AssuranceTicketDrawer — comentario importado sin texto (D4)', () => {
  it('no deja un párrafo vacío cuando el comentario solo trae adjuntos', () => {
    const noop = jest.fn(async () => undefined);
    render(
      <AssuranceTicketDrawer
        open
        ticket={ticket()}
        comments={[
          {
            id: 'comment-1',
            tenantId: 'tenant-1',
            ticketId: 'ticket-1',
            body: '',
            isInternal: false,
            authorUserId: 'user-1',
            createdAt: '2026-06-24T20:13:00.000Z',
            attachments: [],
          } as unknown as React.ComponentProps<typeof AssuranceTicketDrawer>['comments'][number],
        ]}
        timeline={[]}
        assignees={[]}
        isLoading={false}
        error={null}
        actionFeedback={null}
        actionError={null}
        isCommentSubmitting={false}
        isTransitionSubmitting={false}
        isAssignmentSubmitting={false}
        isFieldServiceSubmitting={false}
        isLinkingWorkOrder={false}
        canManage={false}
        canOperate={false}
        onClose={jest.fn()}
        onAddComment={noop}
        onTransitionStatus={noop}
        onAssign={noop}
        onRequestFieldService={noop}
        onLinkWorkOrder={noop}
      />,
    );
    const article = screen.getByRole('dialog', { name: 'UISP-25790' }).querySelector('article');
    expect(article).not.toBeNull();
    expect(article!.querySelector('p.leading-6')).toBeNull();
  });
});

describe('AssuranceTicketDrawer — cierre de importados', () => {
  it('no muestra «Cerrado» como fecha cuando coincide con la apertura (importados sin cierre real)', () => {
    renderDrawer(ticket({ closedAt: '2026-06-24T20:13:00.000Z' }));
    const panel = screen.getByRole('dialog', { name: 'UISP-25790' });
    // Solo la insignia de estado; no hay fecha de cierre falsa.
    expect(within(panel).getAllByText('Cerrado')).toHaveLength(1);
  });
});
