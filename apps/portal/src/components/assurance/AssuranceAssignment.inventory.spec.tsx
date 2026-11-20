/**
 * Inventario de la asignación — spec MOD10 2026-11-20 «Asignación visible», bloque W0.
 *
 * Fija con el código ACTUAL (antes de A–D):
 * - Hilo: pestañas Comentarios / Historial / Todo y qué muestra cada una; insignia Interno/Visible.
 * - Responsable en `TicketListItem` y `AssuranceTicketsTable`: texto, «Sin asignar»,
 *   «Responsable no disponible», y la cola acotada al responsable.
 * - «Asignarme» solo sin responsable y con permiso de gestión.
 * - Guardado conjunto de responsable y área en el detalle.
 *
 * Marcas `CAMBIA-ASIG-x` (x = bloque A/B/C/D): aserciones que la spec va a invertir o cambiar.
 * Toda aserción sin marca protege CA-7 y no debe cambiar de expectativa.
 */
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  TicketFieldDecision,
  SlaBreachStatus,
  TicketPriority,
  TicketQueue,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
  UserRole,
} from '@iwana/shared';
import type {
  AssuranceTicket,
  AssuranceTicketComment,
  AssuranceTimelineEvent,
  InternalUser,
  ListAssuranceTicketsParams,
} from '@/lib/api-client';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import { AssuranceTicketsTable } from './AssuranceTicketsTable';
import { TicketListItem } from './TicketListItem';
import { getAssuranceAssigneeLabel } from './assurance-labels';

// ── Dobles con referencia estable ──────────────────────────────────────────────────────────────
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockAuth = {
  user: { id: 'user-session', role: UserRole.ADMIN, tenantId: 'tenant-1' },
  isLoading: false,
};
const mockPermissions = { hasPermission: (_p: AccessPermissionKey) => true };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
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
      tickets: { getAttachmentLink: jest.fn(async () => null), lookupExecutionOrder: jest.fn() },
    },
    usersApi: { list: jest.fn() },
  };
});

// ── Datos sintéticos (sin PII real) ────────────────────────────────────────────────────────────
const TICKET_ID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
const AGENT_A = {
  id: 'user-agent-a',
  email: 'agente.a@example.test',
  firstName: 'Agente',
  lastName: 'Uno',
  role: UserRole.SUPPORT,
} as InternalUser;
const AGENT_B = {
  id: 'user-agent-b',
  email: 'agente.b@example.test',
  firstName: 'Agente',
  lastName: 'Dos',
  role: UserRole.NOC,
} as InternalUser;

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0901',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: 'Asunto sintético [asignación]',
    description: 'Descripción sintética.',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: 'req-1',
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: 'req-1',
    assignedUserId: AGENT_A.id,
    queueName: TicketQueue.SUPPORT,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    createdByUserId: AGENT_A.id,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    allowedTransitions: [],
    ...overrides,
  } as AssuranceTicket;
}

const COMMENTS: AssuranceTicketComment[] = [
  {
    id: 'c-public',
    ticketId: TICKET_ID,
    tenantId: 'tenant-1',
    body: 'Comentario visible sintético.',
    isInternal: false,
    authorUserId: AGENT_A.id,
    createdAt: '2026-11-01T11:00:00.000Z',
    attachments: [],
  },
  {
    id: 'c-internal',
    ticketId: TICKET_ID,
    tenantId: 'tenant-1',
    body: 'Nota interna sintética.',
    isInternal: true,
    authorUserId: AGENT_A.id,
    createdAt: '2026-11-01T13:00:00.000Z',
    attachments: [],
  },
];

function event(
  id: string,
  eventType: TicketTimelineEventType,
  occurredAt: string,
  payload: Record<string, unknown>,
): AssuranceTimelineEvent {
  return {
    id,
    ticketId: TICKET_ID,
    tenantId: 'tenant-1',
    eventType,
    payload,
    actorUserId: AGENT_B.id,
    occurredAt,
  };
}

const TIMELINE: AssuranceTimelineEvent[] = [
  event('e-assigned', TicketTimelineEventType.ASSIGNED, '2026-11-01T12:00:00.000Z', {
    assignedUserId: AGENT_A.id,
  }),
  event('e-reassigned', TicketTimelineEventType.REASSIGNED, '2026-11-02T09:00:00.000Z', {
    previousAssignedUserId: AGENT_A.id,
    assignedUserId: AGENT_B.id,
  }),
  event('e-priority', TicketTimelineEventType.PRIORITY_CHANGED, '2026-11-02T10:00:00.000Z', {
    previousPriority: TicketPriority.NORMAL,
    priority: TicketPriority.HIGH,
  }),
];

function renderDetail(overrides: Partial<ComponentProps<typeof AssuranceTicketDrawer>> = {}) {
  const onAssign = jest.fn(async () => undefined);
  render(
    <AssuranceTicketDrawer
      open
      onClose={jest.fn()}
      ticket={makeTicket()}
      comments={COMMENTS}
      timeline={TIMELINE}
      assignees={[AGENT_A, AGENT_B]}
      isLoading={false}
      error={null}
      actionFeedback={null}
      actionError={null}
      isCommentSubmitting={false}
      isTransitionSubmitting={false}
      isAssignmentSubmitting={false}
      isFieldServiceSubmitting={false}
      isLinkingWorkOrder={false}
      canManage
      canOperate
      onAddComment={jest.fn(async () => true)}
      onTransitionStatus={jest.fn(async () => undefined)}
      onAssign={onAssign}
      onRequestFieldService={jest.fn(async () => undefined)}
      onLinkWorkOrder={jest.fn(async () => undefined)}
      {...overrides}
    />,
  );
  return { onAssign, dialog: screen.getByRole('dialog') };
}

beforeEach(() => jest.clearAllMocks());

describe('Inventario W0 · hilo del ticket (bloque A)', () => {
  it('tres pestañas; abre en Comentarios', () => {
    const { dialog } = renderDetail();
    const tabs = within(dialog)
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    expect(tabs).toEqual(['Comentarios', 'Historial', 'Todo']);
    expect(within(dialog).getByRole('tab', { name: 'Comentarios' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Comentarios: solo comentarios, con insignia Interno/Visible', () => {
    const { dialog } = renderDetail();
    const panel = within(dialog).getByRole('tabpanel');
    expect(within(panel).getByText('Comentario visible sintético.')).toBeVisible();
    expect(within(panel).getByText('Nota interna sintética.')).toBeVisible();
    expect(within(panel).getByText('Interno')).toBeVisible();
    expect(within(panel).getByText('Visible')).toBeVisible();
    // CAMBIA-ASIG-A (ajustada por el bloque A, CA-1): las asignaciones y reasignaciones se
    // intercalan como líneas de una sola línea; los rótulos del historial siguen fuera. La
    // prioridad sigue fuera (CA-2: esta línea NO cambia).
    expect(within(panel).queryByText('Asignación registrada')).toBeNull();
    expect(within(panel).queryByText('Reasignación registrada')).toBeNull();
    expect(within(panel).getByText('Agente Dos asignó a Agente Uno')).toBeVisible();
    expect(within(panel).getByText('Agente Dos reasignó a Agente Dos')).toBeVisible();
    expect(within(panel).queryByText(/^Prioridad:/)).toBeNull();
  });

  it('Historial: los eventos con su rótulo y responsable, sin comentarios', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDetail();
    await user.click(within(dialog).getByRole('tab', { name: 'Historial' }));
    const panel = within(dialog).getByRole('tabpanel');
    expect(within(panel).getByText('Asignación registrada')).toBeVisible();
    expect(within(panel).getByText('Reasignación registrada')).toBeVisible();
    expect(within(panel).getByText('Responsable: Agente Uno')).toBeVisible();
    expect(within(panel).getByText('Responsable: Agente Dos')).toBeVisible();
    expect(within(panel).getByText(/^Prioridad:/)).toBeVisible();
    expect(within(panel).queryByText('Comentario visible sintético.')).toBeNull();
  });

  it('Todo: comentarios e historial intercalados por fecha', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDetail();
    await user.click(within(dialog).getByRole('tab', { name: 'Todo' }));
    const text = within(dialog).getByRole('tabpanel').textContent ?? '';
    const order = [
      'Comentario visible sintético.',
      'Asignación registrada',
      'Nota interna sintética.',
      'Reasignación registrada',
      'Prioridad:',
    ].map((needle) => text.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('el portal no filtra internos: muestra lo que el servidor devuelve (filtro en API, CA-3)', () => {
    const { dialog } = renderDetail({ comments: [COMMENTS[0]!] });
    const panel = within(dialog).getByRole('tabpanel');
    expect(within(panel).queryByText('Nota interna sintética.')).toBeNull();
    expect(within(panel).queryByText('Interno')).toBeNull();
  });
});

describe('Inventario W0 · guardado conjunto responsable + área (CA-7)', () => {
  it('«Guardar asignación» envía responsable y área juntos', async () => {
    const user = userEvent.setup();
    const { dialog, onAssign } = renderDetail();
    await user.click(within(dialog).getByRole('combobox', { name: 'Responsable' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Responsable' })).getByRole('option', {
        name: 'Agente Dos',
      }),
    );
    await user.click(within(dialog).getByRole('combobox', { name: 'Área' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Área' })).getByRole('option', {
        name: 'Facturación',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar asignación' }));
    // CAMBIA-ASIG-D: D añade una nota opcional; sin escribirla la llamada no debe exigir nada más
    // (CA-6). Si la forma del objeto crece con `note` vacío, test-change-reviewer decide.
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith({
      assignedUserId: AGENT_B.id,
      queueName: TicketQueue.BILLING,
    });
  });

  it('«Sin asignar» en el selector quita el responsable y conserva el área (ajuste 2026-11-20)', async () => {
    const user = userEvent.setup();
    const { dialog, onAssign } = renderDetail();
    await user.click(within(dialog).getByRole('combobox', { name: 'Responsable' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Responsable' })).getByRole('option', {
        name: 'Sin asignar',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar asignación' }));
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ assignedUserId: null }));
  });

  it('sin permiso de gestión, Responsable deshabilitado y sin «Guardar asignación»', () => {
    const { dialog } = renderDetail({ canManage: false, canOperate: false });
    expect(within(dialog).getByRole('combobox', { name: 'Responsable' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Guardar asignación' })).toBeNull();
  });
});

describe('Inventario W0 · responsable en la fila de la ficha (TicketListItem, bloque B)', () => {
  const baseItem = {
    id: 't-1',
    ticketNumber: 'TK-2026-0902',
    subject: 'Asunto sintético',
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    type: TicketType.CUSTOMER_INCIDENT,
    slaBreachStatus: SlaBreachStatus.OK,
    createdAt: '2026-11-12T10:00:00.000Z',
  };

  it.each([
    ['nombre', 'Agente Uno'],
    ['sin responsable', getAssuranceAssigneeLabel(null, null)],
    ['responsable no resuelto', getAssuranceAssigneeLabel('user-x', null)],
  ])('%s: la etiqueta se pinta como texto (normal y densa)', (_case, label) => {
    // Regla del dato (no cambia): los rótulos exactos.
    expect(getAssuranceAssigneeLabel(null, null)).toBe('Sin asignar');
    expect(getAssuranceAssigneeLabel('user-x', null)).toBe('Responsable no disponible');
    for (const dense of [false, true]) {
      const { unmount } = render(
        <ul>
          <TicketListItem
            ticket={baseItem}
            assigneeLabel={label}
            slaDeadline={null}
            dense={dense}
            onOpen={jest.fn()}
          />
        </ul>,
      );
      const row = screen.getByRole('button');
      // CAMBIA-ASIG-B (ajustada por el bloque B, CA-4): iniciales en círculo; el nombre completo
      // queda como texto accesible y como `title` del círculo. El rótulo del dato no cambia.
      expect(within(row).getByText(label)).toHaveClass('sr-only');
      expect(within(row).getByTestId('assignee-mark')).toHaveAttribute('title', label);
      if (dense) {
        expect(screen.getByText(new RegExp(`Responsable ${label}`))).toBeInTheDocument();
      } else {
        expect(within(row).getByText('Responsable:')).toHaveClass('sr-only');
      }
      unmount();
    }
  });
});

describe('Inventario W0 · bandeja (AssuranceTicketsTable, bloques B y C)', () => {
  const filters: ListAssuranceTicketsParams = { page: 1, limit: 20 };

  function renderTable(overrides: Partial<ComponentProps<typeof AssuranceTicketsTable>> = {}) {
    const onAssignToMe = jest.fn();
    const onReassign = jest.fn(
      async (
        _ticket: AssuranceTicket,
        _payload: { assignedUserId: string | null; note?: string },
      ) => undefined,
    );
    const props: ComponentProps<typeof AssuranceTicketsTable> = {
      tickets: [
        makeTicket({ id: 'tk-a', ticketNumber: 'TK-A', assignedUserId: AGENT_A.id }),
        makeTicket({ id: 'tk-none', ticketNumber: 'TK-NONE', assignedUserId: null }),
        makeTicket({ id: 'tk-gone', ticketNumber: 'TK-GONE', assignedUserId: 'user-gone' }),
      ],
      total: 3,
      isLoading: false,
      randomAccess: true,
      page: 1,
      pageCount: 1,
      pageSize: 20,
      from: 1,
      to: 3,
      hasMore: false,
      filters,
      searchValue: '',
      assigneeLabelById: new Map([[AGENT_A.id, 'Agente Uno']]),
      onFiltersChange: jest.fn(),
      onSearchChange: jest.fn(),
      onClearFilters: jest.fn(),
      onPageChange: jest.fn(),
      onPageSizeChange: jest.fn(),
      onLoadMore: jest.fn(),
      onOpenTicket: jest.fn(),
      onOpenCreate: jest.fn(),
      canManage: true,
      onAssignToMe,
      assigneeOptions: [
        { value: AGENT_A.id, label: 'Agente Uno' },
        { value: AGENT_B.id, label: 'Agente Dos' },
      ],
      onReassign,
      ...overrides,
    };
    render(<AssuranceTicketsTable {...props} />);
    return { onAssignToMe, onReassign };
  }

  function rowOf(ticketNumber: string): HTMLElement {
    return screen.getByRole('button', { name: ticketNumber }).closest('tr')!;
  }

  it('columna «Responsable y área»; nombre, «Sin asignar» y «Responsable no disponible» como texto', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: 'Responsable y área' })).toBeInTheDocument();
    // CAMBIA-ASIG-B y CAMBIA-ASIG-C (ajustadas, CA-4 y CA-5): iniciales con nombre accesible y
    // `title`; con permiso de gestión y `onReassign`, el responsable es un botón. Rótulos iguales.
    expect(within(rowOf('TK-A')).getByText('Agente Uno')).toBeInTheDocument();
    expect(within(rowOf('TK-NONE')).getByText('Sin asignar')).toBeInTheDocument();
    expect(within(rowOf('TK-GONE')).getByText('Responsable no disponible')).toBeInTheDocument();
    expect(within(rowOf('TK-A')).getByText(/Soporte/)).toBeInTheDocument();
    expect(within(rowOf('TK-A')).getByTestId('assignee-mark')).toHaveAttribute(
      'title',
      'Agente Uno',
    );
    // Ajuste del usuario (2026-11-20): en la bandeja el nombre también se ve junto a las
    // iniciales, truncado si no cabe; en la ficha (TicketListItem) siguen solo las iniciales.
    expect(within(rowOf('TK-A')).getByText('Agente Uno')).not.toHaveClass('sr-only');
    expect(within(rowOf('TK-A')).getByText('Agente Uno')).toHaveClass('truncate');
    expect(within(rowOf('TK-A')).queryByRole('combobox')).toBeNull();
    expect(
      within(rowOf('TK-A')).getByRole('button', {
        name: 'Cambiar responsable de TK-A: Agente Uno',
      }),
    ).toBeInTheDocument();
  });

  it('«Asignarme» solo en el ticket sin responsable y con permiso (CA-7)', async () => {
    const user = userEvent.setup();
    const { onAssignToMe } = renderTable();
    expect(within(rowOf('TK-A')).queryByRole('button', { name: /Asignarme/ })).toBeNull();
    expect(within(rowOf('TK-GONE')).queryByRole('button', { name: /Asignarme/ })).toBeNull();
    const assign = within(rowOf('TK-NONE')).getByRole('button', { name: 'Asignarme TK-NONE' });
    await user.click(assign);
    expect(onAssignToMe).toHaveBeenCalledTimes(1);
    expect(onAssignToMe.mock.calls[0][0]).toMatchObject({ id: 'tk-none' });
  });

  it('sin permiso de gestión no hay «Asignarme» (CA-7)', () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole('button', { name: /^Asignarme/ })).toBeNull();
  });

  it('«Asignarme» deshabilitado mientras se asigna ese ticket', () => {
    renderTable({ assigningTicketId: 'tk-none' });
    expect(screen.getByRole('button', { name: 'Asignarme TK-NONE' })).toBeDisabled();
  });

  it.each([
    ['cola «Míos»', { workQueue: 'mine' }],
    ['filtro por responsable', { assignedUserId: AGENT_A.id }],
  ] as const)('%s vacía: vacío propio de la cola acotada (CA-7)', (_case, scope) => {
    renderTable({
      tickets: [],
      total: 0,
      filters: { ...filters, ...scope } as ListAssuranceTicketsParams,
    });
    expect(screen.getByText('Sin tickets en esta cola')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay tickets')).toBeNull();
  });

  it('C · reasigna desde la fila en dos clics, sin nota (CA-5, CA-6)', async () => {
    const user = userEvent.setup();
    const { onReassign } = renderTable();
    await user.click(
      within(rowOf('TK-A')).getByRole('button', {
        name: 'Cambiar responsable de TK-A: Agente Uno',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Asignar a Agente Dos' }));
    expect(onReassign).toHaveBeenCalledTimes(1);
    expect(onReassign.mock.calls[0]).toEqual([
      expect.objectContaining({ id: 'tk-a' }),
      { assignedUserId: AGENT_B.id },
    ]);
  });

  it('C · «Dejar sin asignar» quita el responsable desde la fila (ajuste 2026-11-20)', async () => {
    const user = userEvent.setup();
    const { onReassign } = renderTable();
    await user.click(
      within(rowOf('TK-A')).getByRole('button', {
        name: 'Cambiar responsable de TK-A: Agente Uno',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Dejar sin asignar' }));
    expect(onReassign.mock.calls[0]).toEqual([
      expect.objectContaining({ id: 'tk-a' }),
      { assignedUserId: null },
    ]);
  });

  it('C · un ticket sin responsable no ofrece «Dejar sin asignar»', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(
      within(rowOf('TK-NONE')).getByRole('button', { name: /Cambiar responsable de TK-NONE/ }),
    );
    await screen.findByRole('list', { name: 'Asignar a' });
    expect(screen.queryByRole('button', { name: 'Dejar sin asignar' })).toBeNull();
  });

  it('C · la nota opcional viaja con la reasignación (CA-6)', async () => {
    const user = userEvent.setup();
    const { onReassign } = renderTable();
    await user.click(
      within(rowOf('TK-A')).getByRole('button', {
        name: 'Cambiar responsable de TK-A: Agente Uno',
      }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Nota para el nuevo responsable (opcional)' }),
      '  Revisar el equipo  ',
    );
    await user.click(screen.getByRole('button', { name: 'Asignar a Agente Dos' }));
    expect(onReassign.mock.calls[0]?.[1]).toEqual({
      assignedUserId: AGENT_B.id,
      note: 'Revisar el equipo',
    });
  });

  it('C · el responsable actual no se ofrece como destino', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(
      within(rowOf('TK-A')).getByRole('button', {
        name: 'Cambiar responsable de TK-A: Agente Uno',
      }),
    );
    await screen.findByRole('button', { name: 'Asignar a Agente Dos' });
    expect(screen.queryByRole('button', { name: 'Asignar a Agente Uno' })).toBeNull();
  });

  it('C · sin permiso de gestión el responsable es texto, no control (CA-5)', () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole('button', { name: /^Cambiar responsable/ })).toBeNull();
    expect(within(rowOf('TK-A')).getByText('Agente Uno')).toBeInTheDocument();
  });
});

describe('Asignación visible · bloques A y D en el detalle', () => {
  it('A · Comentarios intercala asignaciones y cambios de estado por fecha, con la nota', () => {
    const timeline = [
      ...TIMELINE.slice(0, 1),
      event('e-reassigned-note', TicketTimelineEventType.REASSIGNED, '2026-11-02T09:00:00.000Z', {
        previousAssignedUserId: AGENT_A.id,
        assignedUserId: AGENT_B.id,
        note: '<b>Revisar</b> el equipo',
      }),
      event('e-status', TicketTimelineEventType.STATUS_CHANGED, '2026-11-01T12:30:00.000Z', {
        from: TicketStatus.OPEN,
        to: TicketStatus.IN_PROGRESS,
      }),
      ...TIMELINE.slice(2),
    ];
    const { dialog } = renderDetail({ timeline });
    const panel = within(dialog).getByRole('tabpanel');
    const text = panel.textContent ?? '';
    const order = [
      'Comentario visible sintético.',
      'Agente Dos asignó a Agente Uno',
      'Agente Dos cambió el estado a',
      'Nota interna sintética.',
      'Agente Dos reasignó a Agente Dos',
    ].map((needle) => text.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Texto escrito por un usuario: se pinta tal cual, nunca como HTML.
    expect(within(panel).getByText('<b>Revisar</b> el equipo')).toBeVisible();
    expect(panel.querySelector('b')).toBeNull();
  });

  it('A · sin comentarios, las líneas de asignación se ven y no hay vacío', () => {
    const { dialog } = renderDetail({ comments: [] });
    const panel = within(dialog).getByRole('tabpanel');
    expect(within(panel).getByText('Agente Dos asignó a Agente Uno')).toBeVisible();
    expect(within(panel).queryByText('Sin comentarios registrados')).toBeNull();
  });

  it('A · las líneas no revelan el contenido de un comentario interno oculto (CA-3)', () => {
    const timeline = [
      ...TIMELINE,
      event('e-comment', TicketTimelineEventType.COMMENT_ADDED, '2026-11-01T13:00:00.000Z', {
        isInternal: true,
      }),
    ];
    const { dialog } = renderDetail({ comments: [COMMENTS[0]!], timeline });
    const panel = within(dialog).getByRole('tabpanel');
    expect(within(panel).queryByText(/interno/i)).toBeNull();
    expect(within(panel).queryByText('Nota interna sintética.')).toBeNull();
  });

  it('D · la nota opcional se envía con el guardado conjunto (CA-6)', async () => {
    const user = userEvent.setup();
    const { dialog, onAssign } = renderDetail();
    expect(
      within(dialog).queryByRole('textbox', { name: 'Nota para el nuevo responsable (opcional)' }),
    ).toBeNull();
    await user.click(within(dialog).getByRole('combobox', { name: 'Responsable' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Responsable' })).getByRole('option', {
        name: 'Agente Dos',
      }),
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nota para el nuevo responsable (opcional)' }),
      'Queda a cargo del cierre',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar asignación' }));
    expect(onAssign).toHaveBeenCalledWith({
      assignedUserId: AGENT_B.id,
      queueName: TicketQueue.SUPPORT,
      note: 'Queda a cargo del cierre',
    });
  });
});
