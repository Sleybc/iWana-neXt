/**
 * QA2 · Paso 2 del detalle del ticket — spec MOD10 2026-11-16 v1.1 §3 J–L, CA-12, regresión CA-5.
 * Completa lo que `AssuranceTicketDetail.p2b.spec.tsx` no cubría:
 * - «Relacionado con» sin nombre en cada `nameState` (p2b solo probaba Solicitante).
 * - Defensa en profundidad: un nombre que llega con `nameState` distinto de AVAILABLE no se pinta.
 * - UUID no válido en el relacionado, la visita y la orden (p2b solo probaba el solicitante).
 * - La página propia (`AssuranceTicketPageClient`) aplica las mismas reglas de nombre, enlace y
 *   buscador que el panel.
 * - axe en claro y oscuro sobre el panel con riel completo (nombres, enlaces, visita, orden
 *   encontrada en el buscador) y sobre la página propia.
 * Límite de jsdom: axe no evalúa `color-contrast`; el contraste se mide en navegador.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  AccessPermissionKey,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketType,
  UserRole,
  VisitRequestStatus,
  type TicketPartyNameState,
} from '@iwana/shared';
import type { AssuranceTicket, InternalUser } from '@/lib/api-client';
import { assuranceApi, usersApi } from '@/lib/api-client';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import { AssuranceTicketPageClient } from './AssuranceTicketPageClient';

const mockGranted: { current: ReadonlySet<AccessPermissionKey> } = { current: new Set() };
const mockPermissions = {
  hasPermission: (permission: AccessPermissionKey) => mockGranted.current.has(permission),
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: { id?: string } = {};
const mockAuth = {
  user: { id: 'user-session', role: UserRole.ADMIN, tenantId: 'tenant-1' },
  isLoading: false,
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => mockParams,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

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

const TICKET_ID = '3d1f6c2a-0b7e-4c55-9a1d-2f0e8b6a7c11';
const SUBSCRIBER_ID = '5b2a7c3e-1d4f-4e6a-8b9c-0a1b2c3d4e5f';
const EXPEDIENTE_ID = '6c3b8d4f-2e5a-4f7b-9c0d-1b2c3d4e5f60';
const VISIT_ID = '7d4c9e5a-3f6b-4a8c-8d1e-2c3d4e5f6071';
const ORDER_ID = '8e5d0f6b-4a7c-4b9d-9e2f-3d4e5f607182';
const OTHER_ORDER_ID = '9f6e1a7c-5b8d-4cae-8f3a-4e5f60718293';

const REQUESTER_NAME = 'Titular Sintético';
const RELATED_NAME = 'Expediente Sintético';
const NULL_NAME_STATES = ['PROTECTED', 'NOT_PERMITTED', 'NOT_FOUND', 'UNAVAILABLE'] as const;

const AGENT = {
  id: 'user-agent',
  email: 'agente@example.test',
  firstName: 'Agente',
  lastName: 'Sintético',
  role: UserRole.SUPPORT,
} as InternalUser;

const ALL_READ: ReadonlySet<AccessPermissionKey> = new Set([
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  AccessPermissionKey.CRM_EXPEDIENTES_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
]);

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0999',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    source: TicketSource.PORTAL,
    subject: 'Intermitencia sintética',
    description: 'Diagnóstico sintético.',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: SUBSCRIBER_ID,
    subjectType: TicketSubjectType.EXPEDIENTE,
    subjectRefId: EXPEDIENTE_ID,
    assignedUserId: AGENT.id,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
    workOrderId: null,
    createdByUserId: AGENT.id,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T11:15:00.000Z',
    requester: {
      type: TicketRequesterType.SUBSCRIBER,
      refId: SUBSCRIBER_ID,
      displayName: REQUESTER_NAME,
      nameState: 'AVAILABLE',
      profile: { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
    },
    relatedTo: {
      type: TicketSubjectType.EXPEDIENTE,
      refId: EXPEDIENTE_ID,
      displayName: RELATED_NAME,
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
      number: 'OTE-20261116-001',
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

function renderDrawer(overrides: Partial<Parameters<typeof AssuranceTicketDrawer>[0]> = {}) {
  const props = {
    open: true,
    ticket: makeTicket(),
    comments: [],
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
    canManage: true,
    canOperate: true,
    onClose: jest.fn(),
    onAddComment: jest.fn(async () => true),
    onTransitionStatus: jest.fn(async () => undefined),
    onAssign: jest.fn(async () => undefined),
    onRequestFieldService: jest.fn(async () => undefined),
    onLinkWorkOrder: jest.fn(async () => undefined),
    ...overrides,
  };
  render(<AssuranceTicketDrawer {...props} />);
  return { dialog: screen.getByRole('dialog'), props };
}

async function renderPage(ticket: AssuranceTicket = makeTicket()) {
  mockParams = { id: TICKET_ID };
  jest.mocked(assuranceApi.tickets.get).mockResolvedValue(ticket);
  jest.mocked(assuranceApi.tickets.listComments).mockResolvedValue([]);
  jest.mocked(assuranceApi.tickets.listTimeline).mockResolvedValue([]);
  jest.mocked(usersApi.list).mockResolvedValue({
    data: [AGENT],
    meta: { nextCursor: null, total: 1 },
  } as never);
  render(<AssuranceTicketPageClient />);
  const detail = await screen.findByRole('region', { name: 'Detalle del ticket' });
  await within(detail).findByText('Diagnóstico sintético.');
  return detail;
}

function rail(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole('region', { name: 'Datos del caso' });
}

function card(scope: HTMLElement, name: string): HTMLElement {
  return within(rail(scope)).getByRole('region', { name });
}

function row(scope: HTMLElement, label: string): HTMLElement {
  return within(scope).getByText(label, { selector: 'dt' }).parentElement as HTMLElement;
}

function nullParty(
  kind: 'requester' | 'relatedTo',
  nameState: TicketPartyNameState,
  displayName: string | null = null,
) {
  return kind === 'requester'
    ? {
        type: TicketRequesterType.SUBSCRIBER,
        refId: SUBSCRIBER_ID,
        displayName,
        nameState,
        profile:
          nameState === 'PROTECTED' ? { kind: 'SUBSCRIBER' as const, id: SUBSCRIBER_ID } : null,
      }
    : {
        type: TicketSubjectType.EXPEDIENTE,
        refId: EXPEDIENTE_ID,
        displayName,
        nameState,
        profile:
          nameState === 'PROTECTED' ? { kind: 'EXPEDIENTE' as const, id: EXPEDIENTE_ID } : null,
      };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted.current = ALL_READ;
  mockParams = {};
  mockAuth.user = { id: 'user-session', role: UserRole.ADMIN, tenantId: 'tenant-1' };
  mockAuth.isLoading = false;
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

// ── CA-12 · Nombre ausente con titular bloqueado o suprimido ──────────────────────────────────

describe('QA2 CA-12 · «Relacionado con» sin nombre', () => {
  it.each(NULL_NAME_STATES)(
    '%s: muestra el tipo de hoy, sin nombre, sin enlace y sin el estado crudo',
    (nameState) => {
      const { dialog } = renderDrawer({
        ticket: makeTicket({ relatedTo: nullParty('relatedTo', nameState) }),
      });
      const related = row(card(dialog, 'Personas'), 'Relacionado con');
      expect(related).toHaveTextContent('Expediente');
      expect(related).not.toHaveTextContent(RELATED_NAME);
      expect(related).not.toHaveTextContent(nameState);
      expect(within(related).queryByRole('link')).toBeNull();
      // El solicitante con nombre no se ve afectado.
      expect(row(card(dialog, 'Personas'), 'Solicitante')).toHaveTextContent(REQUESTER_NAME);
    },
  );
});

describe('QA2 CA-12 · defensa en profundidad: solo AVAILABLE pinta el nombre', () => {
  it.each(NULL_NAME_STATES)(
    'un nombre que llega con %s no aparece en ninguna parte del panel',
    (nameState) => {
      const { dialog } = renderDrawer({
        ticket: makeTicket({
          requester: nullParty('requester', nameState, REQUESTER_NAME) as never,
          relatedTo: nullParty('relatedTo', nameState, RELATED_NAME) as never,
        }),
      });
      expect(dialog).not.toHaveTextContent(REQUESTER_NAME);
      expect(dialog).not.toHaveTextContent(RELATED_NAME);
      const people = card(dialog, 'Personas');
      expect(row(people, 'Solicitante')).toHaveTextContent('Suscriptor');
      expect(row(people, 'Relacionado con')).toHaveTextContent('Expediente');
      expect(within(people).queryByRole('link')).toBeNull();
    },
  );

  it('un nombre vacío o de espacios con AVAILABLE cae al tipo de hoy', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        requester: {
          type: TicketRequesterType.SUBSCRIBER,
          refId: SUBSCRIBER_ID,
          displayName: '   ',
          nameState: 'AVAILABLE',
          profile: { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
        },
      }),
    });
    const requester = row(card(dialog, 'Personas'), 'Solicitante');
    expect(requester).toHaveTextContent('Suscriptor');
    expect(within(requester).queryByRole('link')).toBeNull();
  });
});

// ── CA-12 · Enlaces: UUID no válido en cada destino ──────────────────────────────────────────

describe('QA2 CA-12 · un identificador que no es UUID no genera enlace', () => {
  it('relacionado: muestra el nombre como texto', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        relatedTo: {
          type: TicketSubjectType.EXPEDIENTE,
          refId: EXPEDIENTE_ID,
          displayName: RELATED_NAME,
          nameState: 'AVAILABLE',
          profile: { kind: 'EXPEDIENTE', id: '../../settings' },
        },
      }),
    });
    const related = row(card(dialog, 'Personas'), 'Relacionado con');
    expect(related).toHaveTextContent(RELATED_NAME);
    expect(within(related).queryByRole('link')).toBeNull();
  });

  it('visita: muestra estado y ventana, sin «Ver»', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        activeVisit: { ...makeTicket().activeVisit!, id: 'visita-no-uuid' },
      }),
    });
    const visit = row(card(dialog, 'Visita y orden de trabajo'), 'Visita técnica');
    expect(visit).toHaveTextContent('Agendada');
    expect(within(dialog).queryByRole('link', { name: 'Ver la visita técnica' })).toBeNull();
  });

  it('orden: muestra número y estado, sin «Ver»', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        executionOrder: { ...makeTicket().executionOrder!, id: 'javascript:alert(1)' },
      }),
    });
    const order = row(card(dialog, 'Visita y orden de trabajo'), 'Orden de trabajo');
    expect(order).toHaveTextContent('OTE-20261116-001');
    expect(within(dialog).queryByRole('link', { name: /Ver la orden de trabajo/u })).toBeNull();
  });
});

// ── CA-12 · Mismas reglas en la página propia ────────────────────────────────────────────────

describe('QA2 CA-12 · página propia', () => {
  it('con todos los permisos: los cuatro enlaces, igual que en el panel', async () => {
    const detail = await renderPage();
    expect(within(detail).getByRole('link', { name: REQUESTER_NAME })).toHaveAttribute(
      'href',
      `/dashboard/crm/subscribers/${SUBSCRIBER_ID}`,
    );
    expect(within(detail).getByRole('link', { name: RELATED_NAME })).toHaveAttribute(
      'href',
      `/dashboard/crm/expedientes/${EXPEDIENTE_ID}`,
    );
    expect(within(detail).getByRole('link', { name: 'Ver la visita técnica' })).toHaveAttribute(
      'href',
      `/dashboard/scheduling/pending-visits?selectedVisitRequestId=${VISIT_ID}`,
    );
    expect(
      within(detail).getByRole('link', { name: 'Ver la orden de trabajo OTE-20261116-001' }),
    ).toHaveAttribute(
      'href',
      `/dashboard/operations/execution-orders?executionOrderId=${ORDER_ID}`,
    );
  });

  it('titular protegido: sin nombre ni enlace', async () => {
    const detail = await renderPage(
      makeTicket({ requester: nullParty('requester', 'PROTECTED') as never }),
    );
    expect(detail).not.toHaveTextContent(REQUESTER_NAME);
    const requester = row(card(detail, 'Personas'), 'Solicitante');
    expect(requester).toHaveTextContent('Suscriptor');
    expect(within(requester).queryByRole('link')).toBeNull();
  });

  it('sin permisos de lectura de los módulos destino: solo texto', async () => {
    mockGranted.current = new Set();
    const detail = await renderPage();
    expect(within(rail(detail)).queryAllByRole('link')).toHaveLength(0);
    expect(within(detail).getByText(REQUESTER_NAME)).toBeInTheDocument();
    expect(within(detail).getByText(RELATED_NAME)).toBeInTheDocument();
  });

  it('sin operations.execution_orders.read: buscador deshabilitado con ayuda visible', async () => {
    mockGranted.current = new Set(
      [...ALL_READ].filter((key) => key !== AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ),
    );
    const user = userEvent.setup();
    const detail = await renderPage();
    const toggle = within(detail).getByRole('button', { name: 'Vincular orden de trabajo' });
    expect(toggle).toBeDisabled();
    const hint = within(detail).getByText(
      'Para vincular una orden necesitas acceso a las órdenes de trabajo.',
    );
    expect(hint).toBeVisible();
    expect(toggle).toHaveAttribute('aria-describedby', hint.id);
    await user.click(toggle);
    expect(within(detail).queryByRole('textbox', { name: 'Orden de trabajo' })).toBeNull();
    expect(assuranceApi.tickets.lookupExecutionOrder).not.toHaveBeenCalled();
  });
});

// ── Regresión CA-5 · axe en claro y oscuro con el riel ───────────────────────────────────────

const AXE_WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axeScan(node: HTMLElement) {
  return axe(node, { runOnly: { type: 'tag', values: AXE_WCAG_TAGS } });
}

describe.each([
  ['claro', false],
  ['oscuro', true],
] as const)('QA2 regresión CA-5 · axe en tema %s', (_theme, dark) => {
  it('panel con riel completo (nombres, enlaces, visita, orden y varias órdenes)', async () => {
    if (dark) document.documentElement.classList.add('dark');
    const { dialog } = renderDrawer({ ticket: makeTicket({ executionOrderCount: 2 }) });
    expect(within(rail(dialog)).getAllByRole('link')).toHaveLength(4);
    expect(await axeScan(dialog)).toHaveNoViolations();
  });

  it('panel con titular protegido y sin permisos de lectura', async () => {
    if (dark) document.documentElement.classList.add('dark');
    mockGranted.current = new Set();
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        requester: nullParty('requester', 'PROTECTED') as never,
        relatedTo: nullParty('relatedTo', 'NOT_PERMITTED') as never,
        activeVisit: null,
        executionOrder: null,
        executionOrderCount: null,
      }),
    });
    expect(await axeScan(dialog)).toHaveNoViolations();
  });

  it('panel con una orden encontrada en el buscador, libre y de otro caso', async () => {
    if (dark) document.documentElement.classList.add('dark');
    const user = userEvent.setup();
    const { dialog } = renderDrawer({
      ticket: makeTicket({ executionOrder: null, executionOrderCount: 0 }),
    });
    await user.click(within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' }));
    const input = within(dialog).getByRole('textbox', { name: 'Orden de trabajo' });

    jest.mocked(assuranceApi.tickets.lookupExecutionOrder).mockResolvedValueOnce({
      id: OTHER_ORDER_ID,
      number: 'OTE-20261116-002',
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      closedAt: null,
      linkedTicket: 'NONE',
    });
    await user.type(input, 'OTE-20261116-002');
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));
    await within(dialog).findByRole('status', { name: 'Orden encontrada' });
    expect(within(dialog).getByRole('button', { name: 'Confirmar vínculo' })).toBeInTheDocument();
    expect(await axeScan(dialog)).toHaveNoViolations();

    jest.mocked(assuranceApi.tickets.lookupExecutionOrder).mockResolvedValueOnce({
      id: OTHER_ORDER_ID,
      number: 'OTE-20261116-003',
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      closedAt: null,
      linkedTicket: 'OTHER',
    });
    await user.clear(input);
    await user.type(input, 'OTE-20261116-003');
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));
    await within(dialog).findByText(/OTE-20261116-003/u, { selector: '[role="status"] *' });
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
    expect(await axeScan(dialog)).toHaveNoViolations();
  });

  it('panel sin permiso de órdenes: buscador deshabilitado con su ayuda', async () => {
    if (dark) document.documentElement.classList.add('dark');
    mockGranted.current = new Set(
      [...ALL_READ].filter((key) => key !== AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ),
    );
    const { dialog } = renderDrawer();
    expect(await axeScan(dialog)).toHaveNoViolations();
  });

  it('página propia con riel', async () => {
    if (dark) document.documentElement.classList.add('dark');
    await renderPage();
    expect(document.documentElement.classList.contains('dark')).toBe(dark);
    expect(await axeScan(document.body)).toHaveNoViolations();
  });
});
