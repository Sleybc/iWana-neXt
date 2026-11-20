/**
 * Inventario del lateral del ticket — spec MOD10 2026-11-20 «lateral en un panel», CA-1 (bloque W0).
 *
 * Fija con el código ACTUAL los datos, acciones y avisos del lateral de `AssuranceTicketDetail`
 * en sus tres contenedores, con los mismos props que cada uno le pasa hoy:
 * - Ficha del suscriptor, vista dividida: `AssuranceTicketPane` (sin `onCreateLinkedTask` ni
 *   «Abrir en página», como `SubscriberSupportTab`).
 * - Mesa de ayuda: `AssuranceTicketDrawer` con `onCreateLinkedTask` y «Abrir en página» por defecto,
 *   como `AssuranceClient`.
 * - Página propia: `AssuranceTicketPageClient` con su carga real (API simulada).
 *
 * Escrita para sobrevivir al rediseño P1: aserciones por nombre accesible o texto dentro del
 * contenedor, nunca por tarjeta («Personas», «Atención»…) ni por orden DOM.
 *
 * P1 aplicado (spec §3, aprobado): las tres aserciones antes marcadas `CAMBIA-P1` ya afirman lo
 * nuevo. Adjuntos conservan testid y «Adjuntos (N)», pasan al hilo y sin adjuntos no hay bloque
 * (CA-6); «Actualizado» se retira (D1); «Relacionado con» se oculta solo en la ficha cuando es su
 * titular (CA-5). Se añade que Estado, Responsable y Área van en el riel antes de visita y orden.
 */
import { render, screen, within } from '@testing-library/react';
import {
  AccessPermissionKey,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
  UserRole,
  VisitRequestStatus,
} from '@iwana/shared';
import type {
  AssuranceTicket,
  AssuranceTicketAttachment,
  AssuranceTicketComment,
  InternalUser,
} from '@/lib/api-client';
import { assuranceApi, usersApi } from '@/lib/api-client';
import { AssuranceTicketDrawer, AssuranceTicketPane } from './AssuranceTicketDrawer';
import { AssuranceTicketPageClient } from './AssuranceTicketPageClient';
import {
  formatAssuranceDateTime,
  getAssuranceSourceLabel,
  getAssuranceSlaStatusLabel,
} from './assurance-labels';

// ── Dobles con referencia estable (un objeto nuevo por render relanza efectos en bucle) ────────
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: { id?: string } = {};
const mockAuth = {
  user: { id: 'user-session', role: UserRole.ADMIN, tenantId: 'tenant-1' },
  isLoading: false,
};
const mockPermissions = {
  hasPermission: (_permission: AccessPermissionKey) => true,
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => mockParams,
}));
jest.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockPermissions,
}));
jest.mock('@/components/shared/use-portal-modal-drawer-broadcast', () => ({
  usePortalModalDrawerBroadcast: () => undefined,
}));
jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createAssuranceVisitRequestAndRoute: jest.fn(),
}));
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client') as typeof import('@/lib/api-client');
  return {
    ...actual,
    assuranceApi: {
      tickets: {
        get: jest.fn(),
        listComments: jest.fn(),
        listTimeline: jest.fn(),
        getAttachmentLink: jest.fn(),
        lookupExecutionOrder: jest.fn(),
      },
    },
    usersApi: { list: jest.fn() },
  };
});

// ── Datos sintéticos (sin PII real) ────────────────────────────────────────────────────────────
const TICKET_ID = '3d1f6c2a-0b7e-4c55-9a1d-2f0e8b6a7c11';
const SUBSCRIBER_ID = '5b2a7c3e-1d4f-4e6a-8b9c-0a1b2c3d4e5f';
const EXPEDIENTE_ID = '6c3b8d4f-2e5a-4f7b-9c0d-1b2c3d4e5f60';
const VISIT_ID = '7d4c9e5a-3f6b-4a8c-8d1e-2c3d4e5f6071';
const ORDER_ID = '8e5d0f6b-4a7c-4b9d-9e2f-3d4e5f607182';
const ORDER_NUMBER = 'OTE-20261120-001';

const AGENT = {
  id: 'user-agent',
  email: 'agente@example.test',
  firstName: 'Agente',
  lastName: 'Sintético',
  role: UserRole.SUPPORT,
} as InternalUser;

function attachment(id: string, filename: string): AssuranceTicketAttachment {
  return { id, filename, contentType: 'image/jpeg', sizeBytes: 1024, status: 'AVAILABLE' };
}

const COMMENTS: AssuranceTicketComment[] = [
  {
    id: 'c1',
    ticketId: TICKET_ID,
    tenantId: 'tenant-1',
    body: 'Comentario sintético con evidencia.',
    isInternal: false,
    authorUserId: AGENT.id,
    createdAt: '2026-11-02T10:00:00.000Z',
    attachments: [attachment('a1', 'foto-a.jpg'), attachment('a2', 'foto-b.jpg')],
  },
];

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0777',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    source: TicketSource.PORTAL,
    subject: 'Intermitencia sintética [inventario]',
    description: 'Diagnóstico sintético del inventario.',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: SUBSCRIBER_ID,
    subjectType: TicketSubjectType.EXPEDIENTE,
    subjectRefId: EXPEDIENTE_ID,
    assignedUserId: AGENT.id,
    queueName: TicketQueue.SUPPORT,
    slaPolicyId: 'sla-1',
    slaFirstResponseAt: '2026-11-01T14:00:00.000Z',
    slaResolveByAt: '2026-11-03T10:00:00.000Z',
    firstRespondedAt: '2026-11-01T12:00:00.000Z',
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.AT_RISK,
    fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
    workOrderId: null,
    createdByUserId: AGENT.id,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T11:15:00.000Z',
    requester: {
      type: TicketRequesterType.SUBSCRIBER,
      refId: SUBSCRIBER_ID,
      displayName: 'Titular Sintético',
      nameState: 'AVAILABLE',
      profile: { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
    },
    relatedTo: {
      type: TicketSubjectType.EXPEDIENTE,
      refId: EXPEDIENTE_ID,
      displayName: 'Expediente Sintético',
      nameState: 'AVAILABLE',
      profile: { kind: 'EXPEDIENTE', id: EXPEDIENTE_ID },
    },
    activeVisit: {
      id: VISIT_ID,
      status: VisitRequestStatus.SCHEDULED,
      windowKind: 'SCHEDULED',
      windowStartAt: '2026-11-18T13:00:00.000Z',
      windowEndAt: '2026-11-18T17:00:00.000Z',
      scheduleEventId: null,
    },
    executionOrder: {
      id: ORDER_ID,
      number: ORDER_NUMBER,
      status: ExecutionOrderStatus.COMPLETED,
      result: ExecutionOrderResult.EXECUTED_WITH_OBSERVATIONS,
      closedAt: '2026-11-18T16:00:00.000Z',
    },
    executionOrderCount: 1,
    allowedTransitions: [
      { status: TicketStatus.PENDING_CUSTOMER, requiresNote: false, blockedReason: null },
      { status: TicketStatus.RESOLVED, requiresNote: true, blockedReason: null },
    ],
    ...overrides,
  };
}

function baseProps(ticket: AssuranceTicket, canOperate = true) {
  return {
    ticket,
    comments: COMMENTS,
    timeline: [],
    assignees: [AGENT],
    isLoading: false,
    error: null,
    actionFeedback: null,
    actionError: null,
    isCommentSubmitting: false,
    isTransitionSubmitting: false,
    isAssignmentSubmitting: false,
    isFieldServiceSubmitting: false,
    isLinkingWorkOrder: false,
    canManage: canOperate,
    canOperate,
    onAddComment: jest.fn(async () => true),
    onTransitionStatus: jest.fn(async () => undefined),
    onAssign: jest.fn(async () => undefined),
    onRequestFieldService: jest.fn(async () => undefined),
    onLinkWorkOrder: jest.fn(async () => undefined),
  };
}

type ContainerName = 'ficha' | 'mesa' | 'pagina';

/** Monta el contenedor y devuelve su raíz accesible. */
async function mount(
  container: ContainerName,
  ticket = makeTicket(),
  canOperate = true,
  comments: AssuranceTicketComment[] = COMMENTS,
): Promise<HTMLElement> {
  if (container === 'ficha') {
    // Como SubscriberSupportTab: sin onCreateLinkedTask ni openInPageHref, con el titular de la
    // ficha como contexto (CA-5).
    render(
      <AssuranceTicketPane
        {...baseProps(ticket, canOperate)}
        comments={comments}
        contextSubscriberId={SUBSCRIBER_ID}
      />,
    );
    return screen.getByRole('region', { name: 'Ticket abierto' });
  }
  if (container === 'mesa') {
    // Como AssuranceClient: «Abrir en página» por defecto y tarea vinculada.
    render(
      <AssuranceTicketDrawer
        open
        onClose={jest.fn()}
        onCreateLinkedTask={jest.fn()}
        {...baseProps(ticket, canOperate)}
        comments={comments}
      />,
    );
    return screen.getByRole('dialog');
  }
  mockParams = { id: TICKET_ID };
  jest.mocked(assuranceApi.tickets.get).mockResolvedValue(ticket);
  jest.mocked(assuranceApi.tickets.listComments).mockResolvedValue(comments);
  jest.mocked(assuranceApi.tickets.listTimeline).mockResolvedValue([]);
  jest.mocked(usersApi.list).mockResolvedValue({
    data: [AGENT],
    meta: { nextCursor: null, total: 1 },
  } as never);
  render(<AssuranceTicketPageClient />);
  const region = await screen.findByRole('region', { name: 'Detalle del ticket' });
  await within(region).findByText('Diagnóstico sintético del inventario.');
  return region;
}

function expectText(scope: HTMLElement, text: string | RegExp, key: string) {
  const found = within(scope).queryAllByText(text);
  if (found.length === 0) throw new Error(`Inventario CA-1: falta «${key}» (${String(text)})`);
  expect(found.length).toBeGreaterThan(0);
}

function expectLabel(scope: HTMLElement, label: string, key: string) {
  // Rótulo de dato (dt) o de campo: se busca como texto exacto.
  expectText(scope, new RegExp(`^${label}$`), key);
}

const CONTAINERS: ContainerName[] = ['ficha', 'mesa', 'pagina'];

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  jest.mocked(assuranceApi.tickets.getAttachmentLink).mockResolvedValue(null as never);
});

describe.each(CONTAINERS)('Inventario del lateral — contenedor %s', (container) => {
  it('datos: solicitante, relacionado, atención, plazos, visita, orden y registro', async () => {
    const scope = await mount(container);
    const ticket = makeTicket();

    expectLabel(scope, 'Solicitante', 'requester');
    expectText(scope, 'Titular Sintético', 'requesterName');
    // CA-5: el relacionado es un expediente, no el titular de la ficha: se ve en los tres.
    expectLabel(scope, 'Relacionado con', 'relatedTo');
    expectText(scope, 'Expediente Sintético', 'relatedName');

    expectLabel(scope, 'Origen', 'source');
    expectText(scope, getAssuranceSourceLabel(ticket.source), 'sourceValue');
    expectLabel(scope, 'Abierto', 'opened');
    expectText(scope, formatAssuranceDateTime(ticket.createdAt), 'openedValue');
    // P1 (spec §3 E, D1): «Actualizado» se retiró; el historial lo cubre.
    expect(within(scope).queryByText(/^Actualizado$/)).toBeNull();
    expectLabel(scope, 'Responder antes de', 'slaFirstResponse');
    expectLabel(scope, 'Resolver antes de', 'slaResolveBy');

    expectLabel(scope, 'Visita técnica', 'visit');
    expect(within(scope).getByRole('link', { name: 'Ver la visita técnica' })).toBeVisible();
    expectLabel(scope, 'Orden de trabajo', 'workOrder');
    expectText(scope, ORDER_NUMBER, 'workOrderNumber');
    expect(
      within(scope).getByRole('link', { name: `Ver la orden de trabajo ${ORDER_NUMBER}` }),
    ).toBeVisible();

    expectLabel(scope, 'Primera respuesta', 'firstResponse');
    expectLabel(scope, 'Resuelto', 'resolved');
    expectText(scope, 'Sin resolver', 'resolvedEmpty');
  });

  it('adjuntos del caso: conteo y testid estable, en el hilo y no en el lateral (P1, §3 F)', async () => {
    const scope = await mount(container);
    const section = within(scope).getByTestId('ticket-attachments-section');
    expect(within(section).getByText('Adjuntos (2)')).toBeVisible();
    expect(within(section).getAllByText(/foto-a\.jpg/).length).toBeGreaterThan(0);
    const rail = within(scope).getByRole('region', { name: 'Datos del caso' });
    expect(within(rail).queryByTestId('ticket-attachments-section')).toBeNull();
  });

  it('adjuntos del caso: sin adjuntos no hay bloque (CA-6)', async () => {
    const scope = await mount(container, makeTicket(), true, [
      { ...COMMENTS[0]!, attachments: [] },
    ]);
    expect(within(scope).queryByTestId('ticket-attachments-section')).toBeNull();
    expect(within(scope).queryByText(/^Adjuntos \(/)).toBeNull();
  });

  it('relacionado con: en la ficha se oculta si es su titular; en mesa y página se ve (CA-5)', async () => {
    const ticket = makeTicket({
      subjectType: TicketSubjectType.SUBSCRIBER,
      subjectRefId: SUBSCRIBER_ID,
      relatedTo: {
        type: TicketSubjectType.SUBSCRIBER,
        refId: SUBSCRIBER_ID,
        displayName: 'Titular Sintético',
        nameState: 'AVAILABLE',
        profile: { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
      },
    });
    const scope = await mount(container, ticket);
    const related = within(scope).queryByText(/^Relacionado con$/);
    if (container === 'ficha') expect(related).toBeNull();
    else expect(related).not.toBeNull();
  });

  it('estado y asignación: el estado entra al panel y va antes que visita y orden (§3 A–B)', async () => {
    const scope = await mount(container);
    const rail = within(scope).getByRole('region', { name: 'Datos del caso' });
    const status = within(rail).getByRole('combobox', { name: 'Nuevo estado' });
    const assignee = within(rail).getByRole('combobox', { name: 'Responsable' });
    const queue = within(rail).getByRole('combobox', { name: 'Área' });
    const visitRegion = within(rail).getByRole('region', { name: 'Visita y orden de trabajo' });
    for (const control of [status, assignee, queue]) {
      expect(
        control.compareDocumentPosition(visitRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('acciones: estado, responsable, área, visita, orden y tarea según contenedor', async () => {
    const scope = await mount(container);

    expect(within(scope).getByRole('group', { name: 'Cambiar estado' })).toBeVisible();
    expect(within(scope).getByRole('combobox', { name: 'Nuevo estado' })).toBeEnabled();
    expect(within(scope).getByRole('combobox', { name: 'Responsable' })).toBeEnabled();
    expect(within(scope).getByRole('combobox', { name: 'Área' })).toBeEnabled();
    expect(within(scope).getByRole('button', { name: 'Solicitar visita' })).toBeEnabled();
    expect(within(scope).getByRole('button', { name: 'Vincular orden de trabajo' })).toBeEnabled();

    const linkedTask = within(scope).queryByRole('button', { name: 'Crear tarea vinculada' });
    const openInPage = within(scope).queryByRole('link', { name: 'Abrir en página' });
    if (container === 'ficha') {
      expect(linkedTask).toBeNull();
      expect(openInPage).toBeNull();
    } else if (container === 'mesa') {
      expect(linkedTask).toBeEnabled();
      expect(openInPage).toHaveAttribute('href', expect.stringContaining(TICKET_ID));
    } else {
      expect(linkedTask).toBeEnabled();
      expect(openInPage).toBeNull();
    }
  });

  it('avisos: plazo en seguimiento y acciones restringidas en solo lectura', async () => {
    const scope = await mount(container, makeTicket(), container === 'pagina' ? true : false);
    expectText(scope, 'Plazo de atención en seguimiento', 'slaAlert');
    expectText(
      scope,
      `Estado actual: ${getAssuranceSlaStatusLabel(SlaBreachStatus.AT_RISK)}.`,
      'slaAlertDetail',
    );
    if (container !== 'pagina') {
      // La página deriva canOperate del rol (ADMIN): el aviso de solo lectura se prueba en la
      // ficha y la mesa, que lo reciben por props.
      expectText(scope, 'Acciones restringidas', 'readOnlyAlert');
      expect(within(scope).queryByRole('group', { name: 'Cambiar estado' })).toBeVisible();
      expect(within(scope).getByRole('combobox', { name: 'Responsable' })).toBeDisabled();
    }
  });
});

describe('Ticket cerrado en solo lectura (spec 2026-11-20 ticket cerrado §2, CA-4)', () => {
  const CLOSED_LINE = 'Este ticket está cerrado. Si el caso continúa, crea uno nuevo';

  it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
    '%s: sin redactor ni controles de asignación; línea y «Crear ticket»',
    (status) => {
      const onCreateFollowUpTicket = jest.fn();
      const ticket = makeTicket({ status, allowedTransitions: [] });
      render(
        <AssuranceTicketPane
          {...baseProps(ticket)}
          contextSubscriberId={SUBSCRIBER_ID}
          onCreateFollowUpTicket={onCreateFollowUpTicket}
        />,
      );
      const scope = screen.getByRole('region', { name: 'Ticket abierto' });
      expect(within(scope).queryByLabelText('Nuevo comentario')).toBeNull();
      expect(within(scope).queryByRole('button', { name: 'Agregar comentario' })).toBeNull();
      expect(within(scope).getByText(CLOSED_LINE)).toBeVisible();
      expect(within(scope).queryByRole('combobox', { name: 'Responsable' })).toBeNull();
      expect(within(scope).queryByRole('combobox', { name: 'Área' })).toBeNull();
      expect(within(scope).queryByRole('button', { name: 'Guardar asignación' })).toBeNull();
      // Visita y orden también en solo lectura: la API responde 409.
      expect(within(scope).getByRole('button', { name: 'Solicitar visita' })).toBeDisabled();
      expect(
        within(scope).getByRole('button', { name: 'Vincular orden de trabajo' }),
      ).toBeDisabled();
      // Responsable y área quedan como dato.
      expectLabel(scope, 'Responsable', 'assigneeData');
      expectText(scope, 'Agente Sintético', 'assigneeName');
      expectLabel(scope, 'Área', 'queueData');
      within(scope).getByRole('button', { name: 'Crear ticket' }).click();
      expect(onCreateFollowUpTicket).toHaveBeenCalledWith(
        expect.objectContaining({ id: TICKET_ID }),
      );
    },
  );

  it('sin permiso de crear: la línea sin botón', () => {
    render(<AssuranceTicketPane {...baseProps(makeTicket({ status: TicketStatus.CLOSED }))} />);
    const scope = screen.getByRole('region', { name: 'Ticket abierto' });
    expect(within(scope).getByText(CLOSED_LINE)).toBeVisible();
    expect(within(scope).queryByRole('button', { name: 'Crear ticket' })).toBeNull();
  });

  it('RESOLVED conserva el redactor y la asignación', () => {
    render(
      <AssuranceTicketPane
        {...baseProps(makeTicket({ status: TicketStatus.RESOLVED }))}
        onCreateFollowUpTicket={jest.fn()}
      />,
    );
    const scope = screen.getByRole('region', { name: 'Ticket abierto' });
    expect(within(scope).getByLabelText('Nuevo comentario')).toBeInTheDocument();
    expect(within(scope).queryByText(CLOSED_LINE)).toBeNull();
    expect(within(scope).getByRole('combobox', { name: 'Responsable' })).toBeInTheDocument();
  });
});
