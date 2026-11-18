/**
 * QA1 — panel del ticket, paso 1 (spec MOD10 2026-11-16 v1.0, CA-4 y CA-5).
 *
 * - CA-4: una prueba por guarda de H5, con permiso (la acción llega al consumidor con su payload)
 *   y sin permiso (el control falta o está deshabilitado y el consumidor no recibe nada).
 *   El inventario (`.inventory.spec.tsx`) recorre la matriz perfil × estado sobre la habilitación;
 *   aquí se prueba además el envío, que la matriz no cubre en todas las guardas.
 * - CA-5: axe sobre el diálogo en tema claro y con la clase `dark`; foco inicial, trampa y
 *   retorno de foco al disparador en los dos consumidores reales (H6).
 *   Límite de jsdom: no calcula estilos, así que axe no evalúa `color-contrast` (queda como
 *   «incomplete»). El contraste en claro y oscuro solo se mide en navegador.
 *
 * Fixtures sintéticos, sin PII real.
 */
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  AccessPermissionKey,
  ExecutionOrderStatus,
  SlaBreachStatus,
  TicketFieldDecision,
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
  SubscriberRecord,
} from '@/lib/api-client';
import { assuranceApi, usersApi } from '@/lib/api-client';
import { SubscriberSupportTab } from '@/components/crm/subscribers/SubscriberSupportTab';
import { AssuranceClient } from './AssuranceClient';
import { AssuranceTicketDrawer } from './AssuranceTicketDrawer';
import {
  getAssuranceQueueLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';

// ── Dobles (mismos que el inventario y AssuranceClient.spec) ─────────────────────────────────

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockSearchParams = new URLSearchParams();
const mockAuth = {
  user: { id: 'user-session', role: UserRole.ADMIN as UserRole, tenantId: 'tenant-1' },
  isLoading: false,
};
const mockGrantedPermissions = { current: null as Set<AccessPermissionKey> | null };
const mockPermissions = {
  hasPermission: (permission: AccessPermissionKey) =>
    mockGrantedPermissions.current === null || mockGrantedPermissions.current.has(permission),
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard/assurance',
  useSearchParams: () => mockSearchParams,
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
        list: jest.fn(),
        get: jest.fn(),
        listComments: jest.fn(),
        listTimeline: jest.fn(),
        create: jest.fn(),
        submitComment: jest.fn(),
        transitionStatus: jest.fn(),
        assign: jest.fn(),
        requestFieldService: jest.fn(),
        linkWorkOrder: jest.fn(),
        // P2b §3 L: búsqueda de la orden por número.
        lookupExecutionOrder: jest.fn(),
        getAttachmentLink: jest.fn(),
      },
      dashboard: { getSummary: jest.fn() },
      slaPolicies: { list: jest.fn() },
    },
    subscribersApi: { list: jest.fn() },
    usersApi: { list: jest.fn() },
    wfmApi: {
      visitRequests: { list: jest.fn(), create: jest.fn() },
      events: { list: jest.fn() },
    },
  };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

const TICKET_ID = '6b0f1e2d-3c4a-4b5c-8d9e-0f1a2b3c4d5e';
const SUBSCRIBER_ID = '7c1a2b3d-4e5f-4061-8a7b-9c0d1e2f3a4b';
const WORK_ORDER_ID = 'c0ffee00-1111-4222-8333-444455556666';
const AGENT = {
  id: 'user-agent-qa1',
  email: 'agente.qa1@example.test',
  role: UserRole.SUPPORT,
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  mfaEnabled: false,
  mfaRequired: false,
  isOperationalResource: true,
  emailVerified: true,
  passwordResetRequired: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  firstName: 'Agente',
  lastName: 'Prueba',
} as InternalUser;

function makeTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-QA01',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    source: TicketSource.PORTAL,
    subject: 'Caso sintético de QA',
    description: 'Descripción sintética.',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: SUBSCRIBER_ID,
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: SUBSCRIBER_ID,
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    createdByUserId: AGENT.id,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    ...overrides,
  };
}

const COMMENTS: AssuranceTicketComment[] = [
  {
    id: 'comment-qa1',
    tenantId: 'tenant-1',
    ticketId: TICKET_ID,
    body: 'Comentario sintético de QA.',
    isInternal: false,
    authorUserId: AGENT.id,
    createdAt: '2026-11-01T12:00:00.000Z',
    attachments: [
      {
        id: 'att-qa1',
        filename: 'evidencia-sintetica.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        status: 'AVAILABLE',
      },
    ],
  } as AssuranceTicketComment,
];

const TIMELINE: AssuranceTimelineEvent[] = [
  {
    id: 'event-qa1',
    tenantId: 'tenant-1',
    ticketId: TICKET_ID,
    eventType: TicketTimelineEventType.STATUS_CHANGED,
    actorUserId: AGENT.id,
    payload: { from: TicketStatus.OPEN, to: TicketStatus.IN_PROGRESS },
    occurredAt: '2026-11-01T12:30:00.000Z',
  } as unknown as AssuranceTimelineEvent,
];

type DrawerProps = ComponentProps<typeof AssuranceTicketDrawer>;

function renderDrawer(overrides: Partial<DrawerProps> = {}, { linkedTask = true } = {}) {
  const handlers = {
    onAddComment: jest.fn(async () => true),
    onTransitionStatus: jest.fn(async () => undefined),
    onAssign: jest.fn(async () => undefined),
    onRequestFieldService: jest.fn(async () => undefined),
    onLinkWorkOrder: jest.fn(async () => undefined),
    onCreateLinkedTask: jest.fn(),
  };
  const props: DrawerProps = {
    open: true,
    ticket: makeTicket(),
    comments: COMMENTS,
    timeline: TIMELINE,
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
  // La pestaña Soporte no pasa la acción (H6): la prop se omite, no se pasa `undefined`.
  if (!linkedTask) delete (props as Partial<DrawerProps>).onCreateLinkedTask;
  render(<AssuranceTicketDrawer {...props} />);
  const dialog = screen.getByRole('dialog', { name: props.ticket?.ticketNumber ?? /.*/u });
  return { dialog, props };
}

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  label: string,
  option: string,
) {
  await user.click(within(dialog).getByRole('combobox', { name: label }));
  const listbox = await screen.findByRole('listbox', { name: label });
  await user.click(within(listbox).getByRole('option', { name: option }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGrantedPermissions.current = null;
  mockSearchParams = new URLSearchParams();
  mockAuth.user = { ...mockAuth.user, role: UserRole.ADMIN };
  Element.prototype.scrollIntoView = jest.fn();
  document.documentElement.classList.remove('dark');
});

// ── CA-4 · Una prueba por guarda de H5, con y sin permiso ────────────────────────────────────

describe('QA1 CA-4 · guarda «Crear tarea vinculada» (canOperate, no terminal, consumidor la pasa)', () => {
  it('con permiso: está a la vista y llama al consumidor', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer({ ticket: makeTicket({ status: TicketStatus.OPEN }) });
    await user.click(within(dialog).getByRole('button', { name: 'Crear tarea vinculada' }));
    expect(props.onCreateLinkedTask).toHaveBeenCalledTimes(1);
  });

  it('sin canOperate: no aparece', () => {
    const { dialog } = renderDrawer({ canOperate: false, canManage: false });
    expect(within(dialog).queryByRole('button', { name: 'Crear tarea vinculada' })).toBeNull();
  });

  it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
    'con permiso pero en estado terminal %s: no aparece',
    (status) => {
      const { dialog } = renderDrawer({ ticket: makeTicket({ status }) });
      expect(within(dialog).queryByRole('button', { name: 'Crear tarea vinculada' })).toBeNull();
    },
  );

  it('con permiso pero sin la acción del consumidor (pestaña Soporte): no aparece', () => {
    const { dialog } = renderDrawer({}, { linkedTask: false });
    expect(within(dialog).queryByRole('button', { name: 'Crear tarea vinculada' })).toBeNull();
  });
});

describe('QA1 CA-4 · guarda «Cambiar estado» (canOperate, no terminal)', () => {
  it('con permiso: elige un destino y lo envía con su nota', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer();
    await chooseOption(user, dialog, 'Nuevo estado', 'En espera interna');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nota' }), 'Nota QA');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar estado' }));
    expect(props.onTransitionStatus).toHaveBeenCalledWith({
      status: TicketStatus.PENDING_INTERNAL,
      notes: 'Nota QA',
    });
  });

  it('sin canOperate: lista deshabilitada; sin destino no hay envío que pulsar', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer({ canOperate: false, canManage: false });
    const list = within(dialog).getByRole('combobox', { name: 'Nuevo estado' });
    expect(list).toBeDisabled();
    await user.click(list);
    // Ajuste CA-2 aprobado 2026-11-16: Nota y «Guardar estado» aparecen solo al elegir destino.
    expect(screen.queryByRole('listbox', { name: 'Nuevo estado' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Guardar estado' })).toBeNull();
    expect(props.onTransitionStatus).not.toHaveBeenCalled();
  });

  it.each([TicketStatus.CLOSED, TicketStatus.CANCELLED])(
    'con permiso en estado terminal %s: muestra el estado sin dejar cambiarlo',
    (status) => {
      const { dialog } = renderDrawer({ ticket: makeTicket({ status }) });
      // Añadido aprobado 2026-11-16 (spec §3 B): en terminal no se pinta el formulario de estado.
      expect(within(dialog).getByText(getAssuranceTicketStatusLabel(status))).toBeVisible();
      expect(within(dialog).queryByRole('combobox', { name: 'Nuevo estado' })).toBeNull();
      expect(within(dialog).queryByRole('textbox', { name: 'Nota' })).toBeNull();
      expect(within(dialog).queryByRole('button', { name: 'Guardar estado' })).toBeNull();
    },
  );
});

describe('QA1 CA-4 · guarda «Responsable y área» (canManage)', () => {
  it('con permiso: envía responsable y área en un solo guardado', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer();
    await chooseOption(user, dialog, 'Responsable', getAssuranceUserDisplayName(AGENT));
    await chooseOption(user, dialog, 'Área', getAssuranceQueueLabel(TicketQueue.NOC));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar asignación' }));
    expect(props.onAssign).toHaveBeenCalledWith({
      assignedUserId: AGENT.id,
      queueName: TicketQueue.NOC,
    });
  });

  it('sin canManage (técnico que opera): responsable, área y guardado deshabilitados', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer({ canOperate: true, canManage: false });
    expect(within(dialog).getByRole('combobox', { name: 'Responsable' })).toBeDisabled();
    const area = within(dialog).getByRole('combobox', { name: 'Área' });
    expect(area).toBeDisabled();
    await user.click(area);
    // Ajuste CA-2 aprobado 2026-11-16: «Guardar asignación» aparece solo si cambia algo, y sin
    // canManage no se puede cambiar nada.
    expect(screen.queryByRole('listbox', { name: 'Área' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Guardar asignación' })).toBeNull();
    expect(props.onAssign).not.toHaveBeenCalled();
  });
});

describe('QA1 CA-4 · guarda «Solicitar visita» (canOperate, en progreso o espera interna, no terminal)', () => {
  async function openVisitForm(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    const toggle = within(dialog).getByRole('button', { name: 'Solicitar visita' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  it.each([TicketStatus.IN_PROGRESS, TicketStatus.PENDING_INTERNAL])(
    'con permiso en %s: envía la solicitud con su nota',
    async (status) => {
      const user = userEvent.setup();
      const { dialog, props } = renderDrawer({ ticket: makeTicket({ status }) });
      await openVisitForm(user, dialog);
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Nota para el equipo de campo' }),
        'Validar potencia',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Confirmar solicitud' }));
      expect(props.onRequestFieldService).toHaveBeenCalledWith({ notes: 'Validar potencia' });
      expect(
        within(dialog).queryByText(
          'Disponible solo cuando el ticket está en progreso o en espera interna.',
        ),
      ).toBeNull();
    },
  );

  it('sin canOperate: el formulario no se abre y el consumidor no recibe nada', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer({ canOperate: false, canManage: false });
    // Spec §4 nota v1.1: el botón de la fila queda deshabilitado y no abre su formulario.
    const toggle = within(dialog).getByRole('button', { name: 'Solicitar visita' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('button', { name: 'Confirmar solicitud' })).toBeNull();
    expect(props.onRequestFieldService).not.toHaveBeenCalled();
  });

  it.each([TicketStatus.OPEN, TicketStatus.CLOSED])(
    'con permiso en %s: el botón queda deshabilitado, no abre y conserva su texto de ayuda',
    async (status) => {
      const user = userEvent.setup();
      const { dialog, props } = renderDrawer({ ticket: makeTicket({ status }) });
      // Corrección 2026-11-16: la fila aplica la guarda completa de H5 (estado no permitido o
      // terminal); la ayuda sigue a la vista y describe el botón.
      const toggle = within(dialog).getByRole('button', { name: 'Solicitar visita' });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAccessibleDescription(
        'Disponible solo cuando el ticket está en progreso o en espera interna.',
      );
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(dialog).queryByRole('button', { name: 'Confirmar solicitud' })).toBeNull();
      expect(props.onRequestFieldService).not.toHaveBeenCalled();
    },
  );
});

describe('QA1 CA-4 · guarda «Vincular orden de trabajo» (canManage e identificador)', () => {
  async function openWorkOrderForm(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    const toggle = within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  // P2b §3 L (D4): el identificador se sustituye por el número de la orden de ejecución. Sin una
  // orden encontrada no hay «Confirmar vínculo» (antes: deshabilitado); con ella se envía su id.
  it('con permiso: sin orden encontrada no envía; con la orden encontrada envía su id y la nota', async () => {
    const user = userEvent.setup();
    jest.mocked(assuranceApi.tickets.lookupExecutionOrder).mockResolvedValue({
      id: WORK_ORDER_ID,
      number: 'OTE-20261101-001',
      status: ExecutionOrderStatus.ASSIGNED,
      result: null,
      closedAt: null,
      linkedTicket: 'NONE',
    });
    const { dialog, props } = renderDrawer();
    await openWorkOrderForm(user, dialog);
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Orden de trabajo' }),
      'OTE-20261101-001',
    );
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Buscar orden' }));
    const submit = await within(dialog).findByRole('button', { name: 'Confirmar vínculo' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Nota de vínculo' }), 'Vínculo QA');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(props.onLinkWorkOrder).toHaveBeenCalledWith({
      executionOrderId: WORK_ORDER_ID,
      notes: 'Vínculo QA',
    });
  });

  it('sin canManage: el formulario no se abre aunque haya identificador', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer({
      canOperate: true,
      canManage: false,
      ticket: makeTicket({ workOrderId: WORK_ORDER_ID }),
    });
    // Spec §4 nota v1.1: el botón de la fila queda deshabilitado y no abre su formulario.
    const toggle = within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).queryByRole('textbox', { name: 'Orden de trabajo' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Confirmar vínculo' })).toBeNull();
    expect(props.onLinkWorkOrder).not.toHaveBeenCalled();
  });
});

describe('QA1 CA-4 · guarda «Aviso de solo lectura» (sin canOperate)', () => {
  it('con permiso de operar: no hay aviso', () => {
    const { dialog } = renderDrawer();
    expect(within(dialog).queryByText('Acciones restringidas')).toBeNull();
  });

  it('sin permiso de operar: el aviso está a la vista sin abrir nada', () => {
    const { dialog } = renderDrawer({ canOperate: false, canManage: false });
    expect(within(dialog).getByText('Acciones restringidas')).toBeVisible();
    expect(
      within(dialog).getByText('Tu rol solo tiene acceso de lectura sobre este caso.'),
    ).toBeVisible();
  });
});

describe('QA1 CA-4 · guarda «Alerta de plazo» (estado del plazo distinto de en tiempo)', () => {
  it.each([
    SlaBreachStatus.AT_RISK,
    SlaBreachStatus.FIRST_RESPONSE_BREACHED,
    SlaBreachStatus.RESOLUTION_BREACHED,
  ])('con plazo %s: la alerta está a la vista', (slaBreachStatus) => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ slaBreachStatus }) });
    expect(within(dialog).getByText('Plazo de atención en seguimiento')).toBeVisible();
  });

  it('en tiempo: sin alerta', () => {
    const { dialog } = renderDrawer();
    expect(within(dialog).queryByText('Plazo de atención en seguimiento')).toBeNull();
  });
});

describe('QA1 CA-4 · guarda «Redactor» (canOperate)', () => {
  it('con permiso: envía el comentario con la marca de interno', async () => {
    const user = userEvent.setup();
    const { dialog, props } = renderDrawer();
    await user.type(within(dialog).getByRole('textbox', { name: 'Nuevo comentario' }), 'Texto QA');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Interno' }));
    await user.click(within(dialog).getByRole('button', { name: 'Agregar comentario' }));
    expect(props.onAddComment).toHaveBeenCalledWith({
      body: 'Texto QA',
      isInternal: true,
      files: [],
    });
  });

  it('sin permiso: no hay redactor, ni casilla, ni adjuntar, ni envío', () => {
    const { dialog } = renderDrawer({ canOperate: false, canManage: false });
    expect(within(dialog).queryByRole('textbox', { name: 'Nuevo comentario' })).toBeNull();
    expect(within(dialog).queryByRole('checkbox', { name: 'Interno' })).toBeNull();
    expect(within(dialog).queryByLabelText('Adjuntar archivos')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Agregar comentario' })).toBeNull();
  });
});

// ── CA-1 refuerzo (test-change-reviewer, hallazgo A) y §4 (hallazgo C) ──────────────────────

/** Valor del `<dd>` de una fila de Propiedades: no lo confunde con el `<select>` oculto. */
function propertyValue(dialog: HTMLElement, label: string): string | null {
  const term = within(dialog)
    .queryAllByRole('term')
    .find((element) => element.textContent === label);
  const definition = term?.nextElementSibling;
  return definition?.tagName === 'DD' ? (definition.textContent ?? '') : null;
}

describe('QA1 CA-1 · valores de cabecera y Propiedades leídos en su control', () => {
  it('ticket asignado con responsables cargados: el combobox Responsable muestra el agente', () => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ assignedUserId: AGENT.id }) });
    expect(within(dialog).getByRole('combobox', { name: 'Responsable' })).toHaveTextContent(
      getAssuranceUserDisplayName(AGENT),
    );
  });

  // Añadido aprobado 2026-11-16: Área solo en cabecera; sale de Propiedades.
  it('área asignada: el combobox Área muestra su nombre y Propiedades no la repite', () => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ queueName: TicketQueue.NOC }) });
    const label = getAssuranceQueueLabel(TicketQueue.NOC);
    expect(within(dialog).getByRole('combobox', { name: 'Área' }).textContent?.trim()).toBe(label);
    expect(propertyValue(dialog, 'Área')).toBeNull();
  });

  it('sin área: el combobox Área dice «Sin área»', () => {
    const { dialog } = renderDrawer();
    expect(within(dialog).getByRole('combobox', { name: 'Área' }).textContent?.trim()).toBe(
      'Sin área',
    );
  });

  it('sin canManage: el área sigue visible como valor de la cabecera', () => {
    const { dialog } = renderDrawer({
      canManage: false,
      ticket: makeTicket({ queueName: TicketQueue.NOC }),
    });
    const area = within(dialog).getByRole('combobox', { name: 'Área' });
    expect(area).toBeDisabled();
    expect(area.textContent?.trim()).toBe(getAssuranceQueueLabel(TicketQueue.NOC));
  });
});

describe('QA1 CA-7 · rótulos de «Visita técnica» (spec §4)', () => {
  it.each([
    [TicketFieldDecision.NOT_REQUIRED, 'No requiere'],
    [TicketFieldDecision.NEEDS_DIAGNOSIS, 'Por definir tras diagnóstico'],
    [TicketFieldDecision.FIELD_SERVICE_REQUIRED, 'Requerida'],
  ])('%s se muestra como «%s» en la fila «Visita técnica»', (fieldDecision, text) => {
    const { dialog } = renderDrawer({ ticket: makeTicket({ fieldDecision }) });
    expect(propertyValue(dialog, 'Visita técnica')).toBe(text);
  });
});

// ── CA-5 · Diálogo accesible: axe en claro y oscuro, foco y trampa ───────────────────────────

const AXE_WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function axeDialog(dialog: HTMLElement) {
  return axe(dialog, { runOnly: { type: 'tag', values: AXE_WCAG_TAGS } });
}

describe('QA1 CA-5 · axe sobre el panel abierto', () => {
  const scenarios: Array<[string, Partial<DrawerProps>]> = [
    [
      'gestión, con plazo en riesgo y orden vinculada',
      {
        ticket: makeTicket({
          slaPolicyId: 'sla-qa1',
          slaFirstResponseAt: '2026-11-02T13:00:00.000Z',
          slaResolveByAt: '2026-11-04T13:00:00.000Z',
          slaBreachStatus: SlaBreachStatus.AT_RISK,
          queueName: TicketQueue.SUPPORT,
          assignedUserId: AGENT.id,
          fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
          workOrderId: WORK_ORDER_ID,
        }),
      },
    ],
    ['solo lectura', { canOperate: false, canManage: false }],
    // Corrección H-A/H-B 2026-11-16: estados nuevos de la ronda CA-2.
    [
      'estado terminal, sin formulario de estado',
      { ticket: makeTicket({ status: TicketStatus.CLOSED }) },
    ],
    ['cargando', { ticket: null, isLoading: true }],
    ['con error de carga', { ticket: null, error: 'Error sintético' }],
  ];

  describe.each([
    ['claro', false],
    ['oscuro', true],
  ] as const)('tema %s', (_theme, dark) => {
    it.each(scenarios)('%s: sin violaciones', async (_name, overrides) => {
      if (dark) document.documentElement.classList.add('dark');
      render(
        <AssuranceTicketDrawer
          {...{
            open: true,
            ticket: makeTicket(),
            comments: COMMENTS,
            timeline: TIMELINE,
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
            onCreateLinkedTask: jest.fn(),
            ...overrides,
          }}
        />,
      );
      expect(document.documentElement.classList.contains('dark')).toBe(dark);
      expect(await axeDialog(screen.getByRole('dialog'))).toHaveNoViolations();
    });

    it('con los formularios en línea abiertos, Historial y Todo: sin violaciones', async () => {
      if (dark) document.documentElement.classList.add('dark');
      const user = userEvent.setup();
      const { dialog } = renderDrawer({ actionFeedback: 'Operación sintética.' });
      await user.click(within(dialog).getByRole('button', { name: 'Solicitar visita' }));
      await user.click(within(dialog).getByRole('button', { name: 'Vincular orden de trabajo' }));
      expect(await axeDialog(dialog)).toHaveNoViolations();
      await user.click(within(dialog).getByRole('tab', { name: 'Historial' }));
      expect(await axeDialog(dialog)).toHaveNoViolations();
      await user.click(within(dialog).getByRole('tab', { name: 'Todo' }));
      expect(await axeDialog(dialog)).toHaveNoViolations();
    });

    // Corrección H-A/H-B 2026-11-16: el redactor contraído (ronda CA-2) y expandido.
    it('con el redactor expandido (texto, «Interno» y adjuntar): sin violaciones', async () => {
      if (dark) document.documentElement.classList.add('dark');
      const user = userEvent.setup();
      const { dialog } = renderDrawer();
      await user.type(
        within(dialog).getByRole('textbox', { name: 'Nuevo comentario' }),
        'Comentario QA',
      );
      expect(within(dialog).getByRole('checkbox', { name: 'Interno' })).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Adjuntar archivos')).toBeInTheDocument();
      expect(await axeDialog(dialog)).toHaveNoViolations();
    });
  });
});

describe('QA1 CA-5 · trampa de foco', () => {
  it('Tab y Mayús+Tab nunca sacan el foco del diálogo', async () => {
    const user = userEvent.setup();
    const { dialog } = renderDrawer();
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    const first = document.activeElement as HTMLElement;
    expect(first).toHaveAccessibleName('Cerrar');

    // Mayús+Tab desde el primero salta al último, dentro del diálogo.
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).not.toBe(first);
    // Ajuste CA-2 aprobado 2026-11-16: el último control habilitado es el redactor contraído
    // («Agregar comentario» está deshabilitado sin texto). Al recibir el foco se expande y añade
    // detrás «Adjuntar archivos» e «Interno»: el cierre hacia delante son exactamente tres pasos.
    expect(document.activeElement).toBe(
      within(dialog).getByRole('textbox', { name: 'Nuevo comentario' }),
    );
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Adjuntar archivos'));
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('checkbox', { name: 'Interno' }));
    await user.tab();
    expect(document.activeElement).toBe(first);

    // Una vuelta completa hacia delante recorre el panel y vuelve al primero sin salir.
    let steps = 0;
    do {
      await user.tab();
      steps += 1;
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    } while (document.activeElement !== first && steps < 200);
    expect(document.activeElement).toBe(first);
    expect(steps).toBeGreaterThan(3);
  });
});

// ── CA-5 · Consumidores reales: foco inicial, retorno al disparador y axe ────────────────────

function listResponse(tickets: AssuranceTicket[]) {
  return {
    data: tickets,
    total: tickets.length,
    page: 1,
    limit: 20,
    meta: {
      mode: 'page',
      page: 1,
      limit: 20,
      total: tickets.length,
      totalPages: 1,
      hasMore: false,
      nextCursor: null,
      capabilities: { randomAccess: true, sortableFields: [] },
    },
  };
}

function primeTicketApi(ticket: AssuranceTicket) {
  jest.mocked(assuranceApi.tickets.list).mockResolvedValue(listResponse([ticket]) as never);
  jest.mocked(assuranceApi.tickets.get).mockResolvedValue(ticket);
  jest.mocked(assuranceApi.tickets.listComments).mockResolvedValue(COMMENTS);
  jest.mocked(assuranceApi.tickets.listTimeline).mockResolvedValue(TIMELINE);
  jest.mocked(assuranceApi.slaPolicies.list).mockResolvedValue([]);
  jest.mocked(assuranceApi.dashboard.getSummary).mockResolvedValue({
    openTickets: 1,
    breachedTickets: 0,
    fieldServiceTickets: 0,
    averageResolutionMinutes: 0,
  } as never);
  jest.mocked(usersApi.list).mockResolvedValue({
    data: [AGENT],
    meta: { nextCursor: null, total: 1 },
  } as never);
}

async function expectAccessibleDialogLifecycle(
  user: ReturnType<typeof userEvent.setup>,
  trigger: HTMLElement,
  ticket: AssuranceTicket,
) {
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: ticket.ticketNumber });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleDescription(ticket.subject);
  // Foco inicial dentro del diálogo.
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  // Contenido cargado antes de medir.
  await waitFor(() =>
    expect(within(dialog).getAllByText('evidencia-sintetica.pdf').length).toBeGreaterThan(0),
  );
  expect(await axeDialog(dialog)).toHaveNoViolations();

  // Trampa: una tabulación hacia atrás desde el primer foco no sale del diálogo.
  await user.tab({ shift: true });
  expect(dialog).toContainElement(document.activeElement as HTMLElement);

  // Escape cierra y devuelve el foco al disparador.
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
}

describe('QA1 CA-5 · consumidor bandeja (AssuranceClient)', () => {
  it.each([UserRole.ADMIN, UserRole.TECHNICIAN])(
    'rol %s: diálogo con nombre, foco inicial, trampa, axe y retorno al disparador',
    async (role) => {
      mockAuth.user = { ...mockAuth.user, role };
      const ticket = makeTicket();
      primeTicketApi(ticket);
      const user = userEvent.setup();
      render(<AssuranceClient />);
      // Bandeja §3 D: desaparece «Ver detalle»; el número (y la fila entera) abre el ticket.
      const trigger = await screen.findByRole('button', { name: ticket.ticketNumber });
      await expectAccessibleDialogLifecycle(user, trigger, ticket);
    },
  );
});

describe('QA1 CA-5 · consumidor pestaña Soporte (SubscriberSupportTab)', () => {
  const subscriber = {
    id: SUBSCRIBER_ID,
    tenantId: 'tenant-1',
    personType: 'NATURAL',
    firstName: 'Suscriptor',
    lastName: 'Prueba',
    businessName: null,
    city: 'Bogotá',
    privacyRestricted: false,
  } as SubscriberRecord;

  it.each([
    [
      'lectura y gestión',
      [AccessPermissionKey.ASSURANCE_TICKETS_READ, AccessPermissionKey.ASSURANCE_TICKETS_MANAGE],
    ],
    ['solo lectura', [AccessPermissionKey.ASSURANCE_TICKETS_READ]],
  ] as const)(
    'permiso de %s: diálogo con nombre, foco inicial, trampa, axe y retorno al disparador',
    async (_name, permissions) => {
      mockGrantedPermissions.current = new Set(permissions);
      const ticket = makeTicket();
      primeTicketApi(ticket);
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const trigger = await screen.findByRole('button', {
        name: new RegExp(`^Abrir ticket ${ticket.ticketNumber}`, 'u'),
      });
      await expectAccessibleDialogLifecycle(user, trigger, ticket);
    },
  );
});
