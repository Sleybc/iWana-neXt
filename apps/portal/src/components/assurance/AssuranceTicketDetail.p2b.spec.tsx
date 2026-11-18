/**
 * P2b · Riel y enlaces del detalle del ticket — spec MOD10 2026-11-16 v1.1 §3 J y L, CA-12.
 * Dos columnas con riel (Personas, Atención, Visita y orden de trabajo, Adjuntos, Registro),
 * nombres y enlaces contra el contrato del detalle (`ticket-detail.contract.ts`), búsqueda de la
 * orden por número y destinos de estado solo de `allowedTransitions`.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
} from '@iwana/shared';
import type { AssuranceTicket, InternalUser } from '@/lib/api-client';
import { ApiError, assuranceApi } from '@/lib/api-client';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';

const mockGranted: { current: ReadonlySet<AccessPermissionKey> } = { current: new Set() };
const mockPermissions = {
  hasPermission: (permission: AccessPermissionKey) => mockGranted.current.has(permission),
};

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => mockPermissions,
}));

jest.mock('@/components/shared/use-portal-modal-drawer-broadcast', () => ({
  usePortalModalDrawerBroadcast: () => undefined,
}));

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client') as typeof import('@/lib/api-client');
  return {
    ...actual,
    assuranceApi: {
      tickets: {
        getAttachmentLink: jest.fn(),
        lookupExecutionOrder: jest.fn(),
      },
    },
  };
});

const TICKET_ID = '3d1f6c2a-0b7e-4c55-9a1d-2f0e8b6a7c11';
const SUBSCRIBER_ID = '5b2a7c3e-1d4f-4e6a-8b9c-0a1b2c3d4e5f';
const EXPEDIENTE_ID = '6c3b8d4f-2e5a-4f7b-9c0d-1b2c3d4e5f60';
const VISIT_ID = '7d4c9e5a-3f6b-4a8c-8d1e-2c3d4e5f6071';
const ORDER_ID = '8e5d0f6b-4a7c-4b9d-9e2f-3d4e5f607182';

const AGENT = {
  id: 'user-agent',
  email: 'agente@example.test',
  firstName: 'Agente',
  lastName: 'Sintético',
  role: UserRole.SUPPORT,
} as InternalUser;

const ALL_LINK_PERMISSIONS: ReadonlySet<AccessPermissionKey> = new Set([
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  AccessPermissionKey.CRM_EXPEDIENTES_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
]);

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0888',
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
  const handlers = {
    onAddComment: jest.fn(async () => true),
    onTransitionStatus: jest.fn(async () => undefined),
    onAssign: jest.fn(async () => undefined),
    onRequestFieldService: jest.fn(async () => undefined),
    onLinkWorkOrder: jest.fn(async () => undefined),
  };
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
    ...handlers,
    ...overrides,
  };
  render(<AssuranceTicketDrawer {...props} />);
  return { dialog: screen.getByRole('dialog'), props };
}

function rail(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('region', { name: 'Datos del caso' });
}

function card(dialog: HTMLElement, name: string): HTMLElement {
  return within(rail(dialog)).getByRole('region', { name });
}

/** Fila de propiedad: el contenedor del rótulo (`dt`) dentro de su tarjeta. */
function row(scope: HTMLElement, label: string): HTMLElement {
  const term = within(scope).getByText(label, { selector: 'dt' });
  return term.parentElement as HTMLElement;
}

beforeEach(() => {
  mockGranted.current = ALL_LINK_PERMISSIONS;
  jest.mocked(assuranceApi.tickets.lookupExecutionOrder).mockReset();
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('P2b · J dos columnas con riel', () => {
  it('el riel trae sus cinco tarjetas en orden y se apila antes del hilo bajo lg', () => {
    const { dialog } = renderDrawer();
    const body = within(dialog).getByTestId('ticket-detail-body');
    expect(body.className).toContain('flex flex-col gap-4');
    expect(body.className).toContain('lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6');

    const aside = rail(dialog);
    const cards = within(aside)
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id ?? '')?.textContent);
    expect(cards).toEqual([
      'Personas',
      'Atención',
      'Visita y orden de trabajo',
      'Adjuntos (0)',
      'Registro',
    ]);

    // Orden del DOM = orden de lectura: el riel va antes del hilo; desde lg pasa a la derecha.
    const thread = within(dialog).getByRole('tablist', { name: 'Filtrar el hilo del caso' });
    expect(aside.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aside.className).toContain('lg:col-start-2');
    expect(aside.className).toContain('lg:row-start-1');
  });

  it('el panel usa el ancho con riel de D5', () => {
    const { dialog } = renderDrawer();
    expect(dialog.className).toContain('max-w-3xl');
    expect(dialog.className).toContain('lg:max-w-4xl');
  });

  it('Responsable se edita en Personas y Área en Atención; Estado sigue en la cabecera', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer();
    const people = card(dialog, 'Personas');
    const attention = card(dialog, 'Atención');
    expect(within(people).getByRole('combobox', { name: 'Responsable' })).toBeEnabled();
    expect(within(attention).getByRole('combobox', { name: 'Área' })).toBeEnabled();
    expect(within(rail(dialog)).queryByRole('combobox', { name: 'Nuevo estado' })).toBeNull();
    expect(within(dialog).getByRole('group', { name: 'Cambiar estado' })).toBeInTheDocument();

    await user.click(within(attention).getByRole('combobox', { name: 'Área' }));
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Área' })).getAllByRole('option')[0]!,
    );
    const save = within(attention).getByRole('button', { name: 'Guardar asignación' });
    await user.click(save);
    expect(props.onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ assignedUserId: AGENT.id }),
    );
  });

  it('ajuste CA-10: Estado va en la fila de las insignias, sin rótulo visible; la nota debajo', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer();
    const control = within(dialog).getByRole('combobox', { name: 'Nuevo estado' });
    const group = within(dialog).getByRole('group', { name: 'Cambiar estado' });
    const headerRow = group.parentElement as HTMLElement;
    // Misma fila que las insignias; bajo sm ocupa su propia línea sin desbordar.
    expect(within(headerRow).getByText('En progreso')).toBeInTheDocument();
    expect(headerRow.className).toContain('flex-wrap');
    expect(group.className).toContain('min-w-48 flex-1');
    // El nombre «Nuevo estado» solo lo leen los lectores de pantalla.
    expect(within(dialog).getByText('Nuevo estado')).toHaveClass('sr-only');
    expect(within(dialog).queryByText('Nuevo estado', { selector: 'label' })).toBeNull();

    await user.click(control);
    await user.click(
      within(await screen.findByRole('listbox', { name: 'Nuevo estado' })).getAllByRole(
        'option',
      )[0]!,
    );
    const note = within(dialog).getByRole('textbox', { name: 'Nota' });
    expect(headerRow.contains(note)).toBe(false);
    expect(headerRow.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Guardar estado' })).toBeInTheDocument();
  });

  it('ajuste CA-10: el motivo bajo la fila describe el control Estado', () => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ allowedTransitions: [] }) });
    expect(
      within(dialog).getByRole('combobox', { name: 'Nuevo estado' }),
    ).toHaveAccessibleDescription('No tienes cambios de estado disponibles para este caso.');
  });

  it('Atención lleva Origen, Abierto, Actualizado y los plazos; Registro, el cierre', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        slaPolicyId: 'sla-1',
        slaFirstResponseAt: '2026-11-02T13:00:00.000Z',
        slaResolveByAt: '2026-11-04T13:00:00.000Z',
        status: TicketStatus.RESOLVED,
        resolvedAt: '2026-11-03T09:00:00.000Z',
        closedAt: '2026-11-03T10:00:00.000Z',
      }),
    });
    const attention = card(dialog, 'Atención');
    for (const label of [
      'Origen',
      'Abierto',
      'Actualizado',
      'Responder antes de',
      'Resolver antes de',
    ]) {
      expect(within(attention).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
    const record = card(dialog, 'Registro');
    for (const label of ['Primera respuesta', 'Resuelto', 'Cerrado']) {
      expect(within(record).getByText(label, { selector: 'dt' })).toBeInTheDocument();
    }
  });
});

describe('P2b · L nombres con y sin dato', () => {
  it('con nombre: lo muestra y deja el tipo como texto de apoyo', () => {
    const { dialog } = renderDrawer();
    const people = card(dialog, 'Personas');
    const requester = row(people, 'Solicitante');
    expect(requester).toHaveTextContent('Titular Sintético');
    expect(requester).toHaveTextContent('Suscriptor');
    const related = row(people, 'Relacionado con');
    expect(related).toHaveTextContent('Expediente Sintético');
    expect(related).toHaveTextContent('Expediente');
  });

  it.each(['PROTECTED', 'NOT_PERMITTED', 'NOT_FOUND', 'UNAVAILABLE'] as const)(
    'sin nombre (%s): muestra lo de hoy, sin enlace y sin el estado crudo',
    (nameState) => {
      const { dialog } = renderDrawer({
        ticket: makeTicket({
          requester: {
            type: TicketRequesterType.SUBSCRIBER,
            refId: SUBSCRIBER_ID,
            displayName: null,
            nameState,
            profile: nameState === 'PROTECTED' ? { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID } : null,
          },
        }),
      });
      const requester = row(card(dialog, 'Personas'), 'Solicitante');
      expect(requester).toHaveTextContent('Suscriptor');
      expect(requester).not.toHaveTextContent('Titular Sintético');
      expect(requester).not.toHaveTextContent(nameState);
      expect(within(requester).queryByRole('link')).toBeNull();
    },
  );

  it('sin campos del detalle (respuesta anterior al paso 2): se muestra lo de hoy', () => {
    const legacy = makeTicket();
    delete legacy.requester;
    delete legacy.relatedTo;
    const { dialog } = renderDrawer({ ticket: legacy });
    const people = card(dialog, 'Personas');
    expect(row(people, 'Solicitante')).toHaveTextContent('Suscriptor');
    expect(row(people, 'Relacionado con')).toHaveTextContent('Expediente');
    expect(within(people).queryByRole('link')).toBeNull();
  });

  it('el nombre se pinta como texto: no interpreta HTML', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        requester: {
          type: TicketRequesterType.SUBSCRIBER,
          refId: SUBSCRIBER_ID,
          displayName: '<img src=x onerror="alert(1)">',
          nameState: 'AVAILABLE',
          profile: { kind: 'SUBSCRIBER', id: SUBSCRIBER_ID },
        },
      }),
    });
    const requester = row(card(dialog, 'Personas'), 'Solicitante');
    expect(requester.querySelector('img')).toBeNull();
    expect(requester).toHaveTextContent('<img src=x onerror="alert(1)">');
  });
});

describe('P2b · L enlaces con y sin permiso (CA-12)', () => {
  it('con permiso: cada dato enlaza a su pantalla', () => {
    const { dialog } = renderDrawer();
    const people = card(dialog, 'Personas');
    expect(within(people).getByRole('link', { name: 'Titular Sintético' })).toHaveAttribute(
      'href',
      `/dashboard/crm/subscribers/${SUBSCRIBER_ID}`,
    );
    expect(within(people).getByRole('link', { name: 'Expediente Sintético' })).toHaveAttribute(
      'href',
      `/dashboard/crm/expedientes/${EXPEDIENTE_ID}`,
    );
    const field = card(dialog, 'Visita y orden de trabajo');
    expect(within(field).getByRole('link', { name: 'Ver la visita técnica' })).toHaveAttribute(
      'href',
      `/dashboard/scheduling/pending-visits?selectedVisitRequestId=${VISIT_ID}`,
    );
    expect(
      within(field).getByRole('link', { name: 'Ver la orden de trabajo OTE-20261116-001' }),
    ).toHaveAttribute(
      'href',
      `/dashboard/operations/execution-orders?executionOrderId=${ORDER_ID}`,
    );
  });

  it.each([
    ['suscriptor', AccessPermissionKey.CRM_SUBSCRIBERS_READ, 'Titular Sintético'],
    ['expediente', AccessPermissionKey.CRM_EXPEDIENTES_READ, 'Expediente Sintético'],
    ['visita', AccessPermissionKey.WFM_SCHEDULE_READ, 'Ver la visita técnica'],
    [
      'orden',
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      'Ver la orden de trabajo OTE-20261116-001',
    ],
  ])('sin el permiso de lectura de %s: texto sin enlace', (_name, missing, linkName) => {
    mockGranted.current = new Set([...ALL_LINK_PERMISSIONS].filter((key) => key !== missing));
    const { dialog } = renderDrawer();
    expect(within(dialog).queryByRole('link', { name: linkName })).toBeNull();
    if (!linkName.startsWith('Ver')) {
      expect(within(dialog).getByText(linkName)).toBeInTheDocument();
    }
    // Los demás enlaces siguen.
    expect(within(rail(dialog)).getAllByRole('link')).toHaveLength(3);
  });

  it('un identificador que no es UUID no construye enlace', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        requester: {
          type: TicketRequesterType.SUBSCRIBER,
          refId: 'UISP-123',
          displayName: 'Titular Sintético',
          nameState: 'AVAILABLE',
          profile: { kind: 'SUBSCRIBER', id: '../../settings' },
        },
      }),
    });
    const requester = row(card(dialog, 'Personas'), 'Solicitante');
    expect(requester).toHaveTextContent('Titular Sintético');
    expect(within(requester).queryByRole('link')).toBeNull();
  });
});

describe('P2b · L visita y orden de trabajo', () => {
  it('visita: estado y ventana; orden: número, estado y resultado en español', () => {
    const { dialog } = renderDrawer();
    const field = card(dialog, 'Visita y orden de trabajo');
    const visit = row(field, 'Visita técnica');
    expect(visit).toHaveTextContent('Agendada');
    expect(visit).toHaveTextContent('18 nov');
    const order = row(field, 'Orden de trabajo');
    expect(order).toHaveTextContent('OTE-20261116-001');
    expect(order).toHaveTextContent('Ejecutada');
    expect(order).toHaveTextContent('Ejecutada con observaciones');
    expect(order).not.toHaveTextContent('EXECUTED_WITH_OBSERVATIONS');
    expect(order).not.toHaveTextContent('órdenes en este caso');
  });

  it('con más de una orden lo indica', () => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ executionOrderCount: 3 }) });
    expect(row(card(dialog, 'Visita y orden de trabajo'), 'Orden de trabajo')).toHaveTextContent(
      'Hay 3 órdenes en este caso; se muestra la más reciente.',
    );
  });

  it('sin visita ni orden: se muestra lo de hoy', () => {
    const { dialog } = renderDrawer({
      ticket: makeTicket({ activeVisit: null, executionOrder: null, executionOrderCount: 0 }),
    });
    const field = card(dialog, 'Visita y orden de trabajo');
    expect(row(field, 'Visita técnica')).toHaveTextContent('Requerida');
    expect(row(field, 'Orden de trabajo')).toHaveTextContent('Sin vincular');
    expect(within(field).queryByRole('link')).toBeNull();
  });
});

describe('P2b · L vincular orden por número', () => {
  async function openForm(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' }));
    return within(dialog).getByRole('textbox', { name: 'Orden de trabajo' });
  }

  it('encontrada y libre: muestra la orden y vincula con su identificador y la nota', async () => {
    const user = userEvent.setup();
    jest.mocked(assuranceApi.tickets.lookupExecutionOrder).mockResolvedValue({
      id: ORDER_ID,
      number: 'OTE-20261116-002',
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      closedAt: null,
      linkedTicket: 'NONE',
    });
    const { dialog, props } = renderDrawer();
    const input = await openForm(user, dialog);
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
    await user.type(input, 'ote-20261116-002');
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));

    expect(assuranceApi.tickets.lookupExecutionOrder).toHaveBeenCalledWith(
      'OTE-20261116-002',
      TICKET_ID,
    );
    const found = await within(dialog).findByRole('status', { name: 'Orden encontrada' });
    expect(found).toHaveTextContent('OTE-20261116-002');
    expect(found).toHaveTextContent('Asignada');

    await user.type(within(dialog).getByRole('textbox', { name: 'Nota de vínculo' }), 'Por QA');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar vínculo' }));
    expect(props.onLinkWorkOrder).toHaveBeenCalledWith({
      executionOrderId: ORDER_ID,
      notes: 'Por QA',
    });
  });

  it('no encontrada (404): lo dice y no ofrece vincular', async () => {
    const user = userEvent.setup();
    jest
      .mocked(assuranceApi.tickets.lookupExecutionOrder)
      .mockRejectedValue(new ApiError(404, 'EXECUTION_ORDER_NOT_FOUND', 'No encontrada'));
    const { dialog, props } = renderDrawer();
    await user.type(await openForm(user, dialog), 'OTE-20261116-999');
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));
    expect(
      await within(dialog).findByText('No hay una orden de trabajo con ese número.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
    expect(props.onLinkWorkOrder).not.toHaveBeenCalled();
  });

  it('formato inválido: no consulta y explica el formato', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer();
    await user.type(await openForm(user, dialog), '12345');
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));
    expect(
      within(dialog).getByText('Escribe el número completo, por ejemplo OTE-20261116-001.'),
    ).toBeInTheDocument();
    expect(assuranceApi.tickets.lookupExecutionOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['THIS', 'Esta orden ya está vinculada a este caso.'],
    ['OTHER', 'Esta orden ya está vinculada a otro caso.'],
  ] as const)('ya vinculada (%s): lo explica y no ofrece vincular', async (linked, message) => {
    const user = userEvent.setup();
    jest.mocked(assuranceApi.tickets.lookupExecutionOrder).mockResolvedValue({
      id: ORDER_ID,
      number: 'OTE-20261116-002',
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      closedAt: null,
      linkedTicket: linked,
    });
    const { dialog } = renderDrawer();
    await user.type(await openForm(user, dialog), 'OTE-20261116-002');
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
  });

  it('sin canManage: el formulario no se abre y no se busca', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer({ canManage: false });
    const toggle = within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(within(dialog).queryByRole('textbox', { name: 'Orden de trabajo' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Buscar orden' })).toBeNull();
  });
});

describe('P2b · L destinos de estado solo de allowedTransitions', () => {
  async function offered(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.click(within(dialog).getByRole('combobox', { name: 'Nuevo estado' }));
    const listbox = await screen.findByRole('listbox', { name: 'Nuevo estado' });
    return within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent?.trim());
  }

  it('ofrece solo los destinos del servidor', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer();
    expect(await offered(user, dialog)).toEqual(['En espera del cliente', 'Resuelto']);
  });

  it('requiresNote: avisa y no guarda sin nota', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer();
    await offered(user, dialog);
    await user.click(screen.getByRole('option', { name: 'Resuelto' }));
    expect(within(dialog).getByText('Para resolver el caso la nota es obligatoria.')).toBeVisible();
    const save = within(dialog).getByRole('button', { name: 'Guardar estado' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Nota' }), 'Se cambió la ONU');
    expect(save).toBeEnabled();
    await user.click(save);
    expect(props.onTransitionStatus).toHaveBeenCalledWith({
      status: TicketStatus.RESOLVED,
      notes: 'Se cambió la ONU',
    });
  });

  it('blockedReason: no ofrece el destino y explica por qué en lenguaje de usuario', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        type: TicketType.PQR,
        allowedTransitions: [
          { status: TicketStatus.PENDING_CUSTOMER, requiresNote: false, blockedReason: null },
          {
            status: TicketStatus.RESOLVED,
            requiresNote: true,
            blockedReason: 'PQR_RECORD_INCOMPLETE',
          },
        ],
      }),
    });
    expect(
      within(dialog).getByText(
        'Resuelto no está disponible: primero completa el registro de la PQR.',
      ),
    ).toBeVisible();
    expect(dialog).not.toHaveTextContent('PQR_RECORD_INCOMPLETE');
    expect(await offered(user, dialog)).toEqual(['En espera del cliente']);
  });

  it('lista vacía en estado abierto: el control queda deshabilitado con su motivo', () => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ allowedTransitions: [] }) });
    expect(within(dialog).getByRole('combobox', { name: 'Nuevo estado' })).toBeDisabled();
    expect(
      within(dialog).getByText('No tienes cambios de estado disponibles para este caso.'),
    ).toBeVisible();
  });

  it('no ofrece «Visita técnica solicitada» aunque lo traiga una respuesta vieja', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer({
      ticket: makeTicket({
        allowedTransitions: [
          {
            status: TicketStatus.FIELD_SERVICE_REQUESTED,
            requiresNote: false,
            blockedReason: null,
          },
          { status: TicketStatus.PENDING_CUSTOMER, requiresNote: false, blockedReason: null },
        ],
      }),
    });
    expect(await offered(user, dialog)).toEqual(['En espera del cliente']);
    await waitFor(() => expect(dialog).not.toHaveTextContent('Visita técnica solicitada'));
  });
});

describe('P2b · L buscador de orden exige ver órdenes de trabajo', () => {
  it('sin operations.execution_orders.read: el botón queda deshabilitado con ayuda visible', async () => {
    mockGranted.current = new Set(
      [...ALL_LINK_PERMISSIONS].filter(
        (key) => key !== AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
      ),
    );
    const user = userEvent.setup();
    const { dialog } = renderDrawer();
    const toggle = within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' });
    expect(toggle).toBeDisabled();
    const hint = within(dialog).getByText(
      'Para vincular una orden necesitas acceso a las órdenes de trabajo.',
    );
    expect(hint).toBeVisible();
    expect(toggle).toHaveAttribute('aria-describedby', hint.id);
    await user.click(toggle);
    expect(within(dialog).queryByRole('textbox', { name: 'Orden de trabajo' })).toBeNull();
    expect(assuranceApi.tickets.lookupExecutionOrder).not.toHaveBeenCalled();
  });

  it('visita y orden nulas por falta de permiso: se muestra lo de hoy, sin enlaces', () => {
    mockGranted.current = new Set([AccessPermissionKey.CRM_SUBSCRIBERS_READ]);
    const { dialog } = renderDrawer({
      ticket: makeTicket({ activeVisit: null, executionOrder: null, executionOrderCount: null }),
    });
    const field = card(dialog, 'Visita y orden de trabajo');
    expect(row(field, 'Visita técnica')).toHaveTextContent('Requerida');
    expect(row(field, 'Orden de trabajo')).toHaveTextContent('Sin vincular');
    expect(within(field).queryByRole('link')).toBeNull();
  });
});
