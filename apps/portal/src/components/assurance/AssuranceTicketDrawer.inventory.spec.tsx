/**
 * Inventario de no regresión del detalle del ticket — spec MOD10 2026-11-16 v1.0, CA-1 (bloque W0).
 *
 * Enumera las propiedades de H2 y las acciones de H5 con su guarda, y lo prueba en los dos
 * consumidores de H6: la bandeja (`AssuranceClient`, pasa `onCreateLinkedTask`) y la pestaña
 * Soporte de la ficha (`SubscriberSupportTab`, no la pasa).
 *
 * Cómo mantenerlo en P1/P2:
 * - Cada ítem se identifica por una clave semántica estable (`opened`, `changeStatus`, …). Los
 *   renombres de la tabla de vocabulario (spec §4) se aplican SOLO en `PROPERTY_LABELS`,
 *   `ACTION_INVENTORY` y `THREAD_LABELS`; las claves no cambian.
 * - Los valores salen de los helpers de `assurance-labels.ts`: si P1 corrige un texto en la
 *   fuente («Sin cola» → «Sin área»), el inventario lo sigue sin tocar este archivo.
 * - Desde P1 las acciones viven en la cabecera y en la fila de acciones, y el redactor está fijo
 *   al pie (spec §3 B, E, G). `revealSurface` despliega lo que esté oculto en reposo. La guarda de
 *   cada ítem (`expected`) transcribe H5; los cambios de presencia aprobados en la ronda CA-2 y
 *   en la spec v1.1 están anotados junto a cada ítem.
 * - Un ítem que desaparece hace fallar la prueba con su clave en el mensaje. Quitar una clave del
 *   mapa exige veredicto de `test-change-reviewer` (spec CA-9).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
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
  ASSURANCE_TICKET_STATUS_OPTIONS,
  formatAssuranceDateTime,
  formatAssuranceReference,
  getAssuranceFieldDecisionLabel,
  getAssuranceQueueLabel,
  getAssuranceRequesterTypeLabel,
  getAssuranceSlaStatusLabel,
  getAssuranceSourceLabel,
  getAssuranceSubjectTypeLabel,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketTypeLabel,
  getAssuranceTimelineEventLabel,
  getAssuranceAssigneeLabel,
  getAssuranceUserDisplayName,
} from './assurance-labels';

// ── Dobles: los mismos que usan AssuranceClient.spec y SubscriberSupportTab.spec ──────────────

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockSearchParams = new URLSearchParams();
const mockAuth = {
  user: { id: 'user-session', role: UserRole.ADMIN as UserRole, tenantId: 'tenant-1' },
  isLoading: false,
};
const mockGrantedPermissions = { current: null as Set<AccessPermissionKey> | null };
// Referencia estable: un objeto nuevo por render relanza las cargas en bucle (AssuranceClient.spec).
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

// ── Fixtures sintéticos (sin PII real) ───────────────────────────────────────────────────────

const TICKET_ID = '3d1f6c2a-0b7e-4c55-9a1d-2f0e8b6a7c11';
const SUBSCRIBER_ID = '8d4943a8-a7d8-4053-942f-a99a0dd16603';
const WORK_ORDER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const AGENT: InternalUser = {
  id: 'user-agent',
  email: 'agente@example.test',
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
  lastName: 'Sintético',
} as InternalUser;

/** Ticket con todas las propiedades condicionales encendidas (SLA, cierre real, orden, cola…). */
function fullTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return {
    id: TICKET_ID,
    tenantId: 'tenant-1',
    ticketNumber: 'TK-2026-0901',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.HIGH,
    source: TicketSource.PORTAL,
    subject: 'Intermitencia sintética',
    description: 'Diagnóstico sintético del caso.',
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: SUBSCRIBER_ID,
    subjectType: TicketSubjectType.SUBSCRIBER,
    subjectRefId: SUBSCRIBER_ID,
    assignedUserId: AGENT.id,
    queueName: TicketQueue.SUPPORT,
    slaPolicyId: 'sla-1',
    slaFirstResponseAt: '2026-11-02T13:00:00.000Z',
    slaResolveByAt: '2026-11-04T13:00:00.000Z',
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: '2026-11-05T16:30:00.000Z',
    slaBreachStatus: SlaBreachStatus.AT_RISK,
    fieldDecision: TicketFieldDecision.FIELD_SERVICE_REQUIRED,
    workOrderId: WORK_ORDER_ID,
    createdByUserId: AGENT.id,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T11:15:00.000Z',
    ...overrides,
  };
}

/** Ticket con todas las propiedades condicionales apagadas (importado sin SLA, sin cierre). */
function minimalTicket(overrides: Partial<AssuranceTicket> = {}): AssuranceTicket {
  return fullTicket({
    status: TicketStatus.OPEN,
    source: TicketSource.MIGRATION,
    description: null,
    subjectType: null,
    subjectRefId: null,
    assignedUserId: null,
    queueName: null,
    slaPolicyId: null,
    slaFirstResponseAt: null,
    slaResolveByAt: null,
    closedAt: null,
    slaBreachStatus: SlaBreachStatus.OK,
    fieldDecision: TicketFieldDecision.NOT_REQUIRED,
    workOrderId: null,
    ...overrides,
  });
}

const COMMENTS: AssuranceTicketComment[] = [
  {
    id: 'comment-1',
    tenantId: 'tenant-1',
    ticketId: TICKET_ID,
    body: 'Se revisa la potencia óptica.',
    isInternal: true,
    authorUserId: AGENT.id,
    createdAt: '2026-11-01T12:00:00.000Z',
    attachments: [
      {
        id: 'att-1',
        filename: 'acta-sintetica.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
        status: 'AVAILABLE',
      },
    ],
  } as AssuranceTicketComment,
];

const TIMELINE: AssuranceTimelineEvent[] = [
  {
    id: 'event-1',
    tenantId: 'tenant-1',
    ticketId: TICKET_ID,
    eventType: TicketTimelineEventType.STATUS_CHANGED,
    actorUserId: AGENT.id,
    payload: { from: TicketStatus.OPEN, to: TicketStatus.IN_PROGRESS },
    occurredAt: '2026-11-01T12:30:00.000Z',
  } as unknown as AssuranceTimelineEvent,
];

// ── Inventario: propiedades (H2) ─────────────────────────────────────────────────────────────

/** Clave estable → rótulo visible hoy. P1 actualiza solo los rótulos (spec §4). */
const PROPERTY_LABELS = {
  opened: 'Abierto',
  closed: 'Cerrado',
  requester: 'Solicitante',
  relatedTo: 'Relacionado con',
  area: 'Área',
  assignee: 'Responsable',
  source: 'Origen',
  fieldVisit: 'Visita técnica',
  workOrder: 'Orden de trabajo',
  firstResponseDue: 'Responder antes de',
  resolveDue: 'Resolver antes de',
  updated: 'Actualizado',
  description: 'Descripción',
} as const;

type PropertyKey = keyof typeof PROPERTY_LABELS;

interface PropertySpec {
  /** Valor esperado, calculado con los mismos helpers que pinta el panel. */
  value: (ticket: AssuranceTicket, users: InternalUser[]) => string;
  /** Condición de H2: sin ella la propiedad no se pinta. Por defecto, siempre visible. */
  when?: (ticket: AssuranceTicket) => boolean;
}

const PROPERTY_INVENTORY: Record<PropertyKey, PropertySpec> = {
  opened: { value: (t) => formatAssuranceDateTime(t.createdAt) },
  // Los importados de UISP traen cierre = apertura: no hay fecha real que mostrar.
  closed: {
    value: (t) => formatAssuranceDateTime(t.closedAt),
    when: (t) => Boolean(t.closedAt) && t.closedAt !== t.createdAt,
  },
  requester: { value: (t) => getAssuranceRequesterTypeLabel(t.requesterType) },
  relatedTo: {
    value: (t) => (t.subjectType ? getAssuranceSubjectTypeLabel(t.subjectType) : 'No disponible'),
  },
  area: { value: (t) => getAssuranceQueueLabel(t.queueName) },
  // Spec §4 nota v1.1: «Sin asignar» sin referencia; con referencia y sin el usuario en la
  // lista cargada (Soporte sin gestión), «Responsable no disponible».
  assignee: {
    value: (t, users) =>
      getAssuranceAssigneeLabel(
        t.assignedUserId,
        users.find((user) => user.id === t.assignedUserId) ?? null,
      ),
  },
  source: { value: (t) => getAssuranceSourceLabel(t.source) },
  fieldVisit: { value: (t) => getAssuranceFieldDecisionLabel(t.fieldDecision) },
  workOrder: {
    value: (t) => (t.workOrderId ? formatAssuranceReference(t.workOrderId) : 'Sin vincular'),
  },
  firstResponseDue: {
    value: (t) => formatAssuranceDateTime(t.slaFirstResponseAt),
    when: (t) => Boolean(t.slaPolicyId),
  },
  resolveDue: {
    value: (t) => formatAssuranceDateTime(t.slaResolveByAt),
    when: (t) => Boolean(t.slaPolicyId),
  },
  updated: { value: (t) => formatAssuranceDateTime(t.updatedAt) },
  description: {
    value: (t) => t.description?.trim() || 'Sin descripción adicional registrada para este caso.',
  },
};

/** Insignias de la cabecera (H2): tipo, estado, prioridad y plazo solo con política. */
const BADGE_INVENTORY: Record<
  'type' | 'status' | 'priority' | 'sla',
  { text: (t: AssuranceTicket) => string; when?: (t: AssuranceTicket) => boolean }
> = {
  type: { text: (t) => getAssuranceTicketTypeLabel(t.type) },
  status: { text: (t) => getAssuranceTicketStatusLabel(t.status) },
  priority: { text: (t) => getAssuranceTicketPriorityLabel(t.priority) },
  // Sin política (p. ej. importados) «En tiempo» no significa nada.
  sla: {
    text: (t) => getAssuranceSlaStatusLabel(t.slaBreachStatus),
    when: (t) => Boolean(t.slaPolicyId),
  },
};

/**
 * Una propiedad existe si su rótulo aparece y el contenedor inmediato del rótulo lleva su valor.
 * Distingue «Cerrado» (fecha) de «Cerrado» (insignia de estado) y sobrevive al cambio de
 * `AssuranceKeyValueItem` a `PortalFieldRow` mientras rótulo y valor compartan contenedor.
 */
function findProperty(panel: HTMLElement, label: string, value: string): HTMLElement | null {
  return (
    within(panel)
      .queryAllByText(label, { exact: true })
      .find((element) => element.parentElement?.textContent?.includes(value)) ?? null
  );
}

/**
 * Responsable y Área viven solo como controles de la cabecera (spec §3 B y §4 nota v1.1). Su valor
 * se lee en el texto visible del combobox, no en el contenedor del rótulo: ese contenedor también
 * lleva el `<select>` nativo oculto con todas las opciones y daría por buena cualquier opción.
 */
const HEADER_CONTROL_PROPERTIES: ReadonlySet<PropertyKey> = new Set(['assignee', 'area']);

function findHeaderControlValue(panel: HTMLElement, label: string, value: string) {
  const control = within(panel).queryByRole('combobox', { name: label });
  return control?.textContent?.trim() === value ? control : null;
}

function propertyMismatches(panel: HTMLElement, ticket: AssuranceTicket, users: InternalUser[]) {
  const mismatches: string[] = [];
  (Object.keys(PROPERTY_INVENTORY) as PropertyKey[]).forEach((key) => {
    const spec = PROPERTY_INVENTORY[key];
    const expected = spec.when ? spec.when(ticket) : true;
    const locate = HEADER_CONTROL_PROPERTIES.has(key) ? findHeaderControlValue : findProperty;
    const found = locate(panel, PROPERTY_LABELS[key], spec.value(ticket, users)) !== null;
    if (found !== expected) {
      mismatches.push(`propiedad ${key}: se esperaba ${expected ? 'visible' : 'ausente'}`);
    }
  });
  (Object.keys(BADGE_INVENTORY) as Array<keyof typeof BADGE_INVENTORY>).forEach((key) => {
    const spec = BADGE_INVENTORY[key];
    const expected = spec.when ? spec.when(ticket) : true;
    const found = within(panel).queryAllByText(spec.text(ticket), { exact: true }).length > 0;
    if (found !== expected) {
      mismatches.push(`insignia ${key}: se esperaba ${expected ? 'visible' : 'ausente'}`);
    }
  });
  // Adjuntos del caso (spec §3 D): sección con su conteo y `data-testid` estable.
  const section = within(panel).queryByTestId('ticket-attachments-section');
  const total = COMMENTS_IN_PANEL.current.flatMap((comment) => comment.attachments ?? []).length;
  if (!section || !within(section).queryByRole('heading', { name: `Adjuntos (${total})` })) {
    mismatches.push(`propiedad attachments: se esperaba «Adjuntos (${total})»`);
  }
  return mismatches;
}

// ── Inventario: acciones y su guarda (H5) ────────────────────────────────────────────────────

interface GuardContext {
  canOperate: boolean;
  canManage: boolean;
  /** El consumidor pasa `onCreateLinkedTask` (solo la bandeja, H6). */
  hasLinkedTask: boolean;
  /**
   * P2b §3 L: buscar la orden por número exige además `operations.execution_orders.read`
   * (guarda nueva, más estricta; ayuda visible probada en `AssuranceTicketDetail.p2b.spec.tsx`).
   */
  canReadExecutionOrders: boolean;
  status: TicketStatus;
  slaBreachStatus: SlaBreachStatus;
}

type ExpectedState = 'enabled' | 'disabled' | 'present' | 'absent';

/** Superficie de cada control: el hilo (con el redactor al pie) o la cabecera y la fila de acciones. */
type Surface = 'thread' | 'actions';

interface ActionSpec {
  surface: Surface;
  locate: (panel: HTMLElement) => HTMLElement | null;
  /** Guarda de H5. `present` = existe pero su habilitación depende de lo que se escriba. */
  expected: (ctx: GuardContext) => ExpectedState;
}

const isTerminal = (status: TicketStatus) =>
  status === TicketStatus.CLOSED || status === TicketStatus.CANCELLED;
const allowsFieldService = (status: TicketStatus) =>
  status === TicketStatus.IN_PROGRESS || status === TicketStatus.PENDING_INTERNAL;

const ACTION_INVENTORY: Record<string, ActionSpec> = {
  close: {
    surface: 'thread',
    locate: (p) => within(p).queryByRole('button', { name: /^Cerrar$/u }),
    expected: () => 'enabled',
  },
  createLinkedTask: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('button', { name: 'Crear tarea vinculada' }),
    expected: (c) =>
      c.canOperate && !isTerminal(c.status) && c.hasLinkedTask ? 'enabled' : 'absent',
  },
  // Ajuste CA-2 y añadido aprobados 2026-11-16 (spec §3 B): en estado terminal no hay formulario
  // de estado; la Nota y «Guardar estado» aparecen al elegir un destino (`revealSurface` lo elige
  // cuando la lista está habilitada). La guarda de envío (canOperate y no terminal) no cambia.
  changeStatus: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('combobox', { name: 'Nuevo estado' }),
    expected: (c) => (isTerminal(c.status) ? 'absent' : c.canOperate ? 'enabled' : 'disabled'),
  },
  changeStatusNote: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('textbox', { name: 'Nota' }),
    expected: (c) => (c.canOperate && !isTerminal(c.status) ? 'present' : 'absent'),
  },
  changeStatusSubmit: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('button', { name: 'Guardar estado' }),
    expected: (c) => (c.canOperate && !isTerminal(c.status) ? 'enabled' : 'absent'),
  },
  assignee: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('combobox', { name: 'Responsable' }),
    expected: (c) => (c.canManage ? 'enabled' : 'disabled'),
  },
  area: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('combobox', { name: 'Área' }),
    expected: (c) => (c.canManage ? 'enabled' : 'disabled'),
  },
  // Ajuste CA-2 aprobado 2026-11-16: aparece solo cuando cambia responsable o área
  // (`revealSurface` cambia el área cuando la lista está habilitada). Guarda sin cambio.
  assignmentSubmit: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('button', { name: 'Guardar asignación' }),
    expected: (c) => (c.canManage ? 'enabled' : 'absent'),
  },
  // Spec §4 nota v1.1: el formulario en línea no se abre sin el permiso de su acción; el botón
  // de la fila queda deshabilitado y es lo que se localiza cuando el formulario no está.
  // Corrección 2026-11-16: la fila aplica la guarda completa de H5 (permiso, estado permitido y no
  // terminal); el formulario, y con él su nota, solo existe cuando la acción está disponible.
  requestFieldVisitNote: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('textbox', { name: 'Nota para el equipo de campo' }),
    expected: (c) =>
      c.canOperate && allowsFieldService(c.status) && !isTerminal(c.status) ? 'present' : 'absent',
  },
  requestFieldVisit: {
    surface: 'actions',
    locate: (p) =>
      within(p).queryByRole('button', { name: 'Confirmar solicitud' }) ??
      within(p).queryByRole('button', { name: 'Solicitar visita' }),
    expected: (c) =>
      c.canOperate && allowsFieldService(c.status) && !isTerminal(c.status)
        ? 'enabled'
        : 'disabled',
  },
  requestFieldVisitHelp: {
    surface: 'actions',
    locate: (p) =>
      within(p).queryByText(
        'Disponible solo cuando el ticket está en progreso o en espera interna.',
      ),
    expected: (c) => (c.canOperate && !allowsFieldService(c.status) ? 'present' : 'absent'),
  },
  // P2b §3 L: el campo es el número de la orden (buscador) y exige también ver órdenes de trabajo.
  linkWorkOrderInput: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('textbox', { name: 'Orden de trabajo' }),
    expected: (c) => (c.canManage && c.canReadExecutionOrders ? 'present' : 'absent'),
  },
  linkWorkOrderNote: {
    surface: 'actions',
    locate: (p) => within(p).queryByRole('textbox', { name: 'Nota de vínculo' }),
    expected: (c) => (c.canManage && c.canReadExecutionOrders ? 'present' : 'absent'),
  },
  linkWorkOrder: {
    surface: 'actions',
    locate: (p) =>
      within(p).queryByRole('button', { name: 'Confirmar vínculo' }) ??
      within(p).queryByRole('button', { name: 'Vincular orden de trabajo' }),
    // P2b §3 L: «Confirmar vínculo» aparece con una orden encontrada; antes de buscar se localiza
    // el botón de la fila, que exige gestión y ver órdenes de trabajo.
    expected: (c) => (c.canManage && c.canReadExecutionOrders ? 'enabled' : 'disabled'),
  },
  readOnlyNotice: {
    surface: 'actions',
    locate: (p) => within(p).queryByText('Acciones restringidas'),
    expected: (c) => (c.canOperate ? 'absent' : 'present'),
  },
  slaAlert: {
    surface: 'actions',
    locate: (p) => within(p).queryByText('Plazo de atención en seguimiento'),
    expected: (c) => (c.slaBreachStatus !== SlaBreachStatus.OK ? 'present' : 'absent'),
  },
  commentBody: {
    surface: 'thread',
    locate: (p) => within(p).queryByRole('textbox', { name: 'Nuevo comentario' }),
    expected: (c) => (c.canOperate ? 'enabled' : 'absent'),
  },
  commentInternal: {
    surface: 'thread',
    locate: (p) => within(p).queryByRole('checkbox', { name: 'Interno' }),
    expected: (c) => (c.canOperate ? 'enabled' : 'absent'),
  },
  commentAttach: {
    surface: 'thread',
    locate: (p) => within(p).queryByLabelText('Adjuntar archivos'),
    expected: (c) => (c.canOperate ? 'enabled' : 'absent'),
  },
  commentSubmit: {
    surface: 'thread',
    locate: (p) => within(p).queryByRole('button', { name: 'Agregar comentario' }),
    // Sin texto está deshabilitado; la prueba de interacción cubre el habilitado.
    expected: (c) => (c.canOperate ? 'disabled' : 'absent'),
  },
};

/** Rótulos del hilo (spec §3 F): filtro Comentarios · Historial · Todo (P1). */
const THREAD_LABELS = {
  comments: 'Comentarios',
  history: 'Historial',
  all: 'Todo',
} as const;

/** Fila de acciones (spec §3 E): cada botón despliega su formulario en línea. */
const ACTION_ROW_TOGGLES = ['Solicitar visita', 'Vincular orden de trabajo'] as const;

/**
 * Pone a la vista la superficie donde vive el control. Desde P1 la cabecera (Estado, Responsable,
 * Área) y el redactor fijo al pie están siempre visibles: el hilo queda en «Comentarios» y, para
 * las acciones, se despliegan los formularios en línea de la fila de acciones (spec §3 B, E, G).
 */
async function revealSurface(
  user: ReturnType<typeof userEvent.setup>,
  panel: HTMLElement,
  surface: Surface,
) {
  if (surface === 'thread') {
    await user.click(within(panel).getByRole('tab', { name: THREAD_LABELS.comments }));
    // Ajuste CA-2: el redactor está contraído en reposo; al enfocarlo muestra «Interno» y adjuntar.
    const composer = within(panel).queryByRole('textbox', { name: 'Nuevo comentario' });
    if (composer) await user.click(composer);
    return;
  }
  for (const name of ACTION_ROW_TOGGLES) {
    const toggle = within(panel).getByRole('button', { name });
    if (
      !(toggle as HTMLButtonElement).disabled &&
      toggle.getAttribute('aria-expanded') !== 'true'
    ) {
      await user.click(toggle);
    }
  }
  // Ajuste CA-2: Nota y «Guardar estado» aparecen al elegir destino; «Guardar asignación», al
  // cambiar responsable o área. Se eligen solo si el control está habilitado.
  await chooseAnotherOption(user, panel, 'Nuevo estado');
  await chooseAnotherOption(user, panel, 'Área');
}

async function chooseAnotherOption(
  user: ReturnType<typeof userEvent.setup>,
  panel: HTMLElement,
  label: string,
) {
  const control = within(panel).queryByRole('combobox', { name: label });
  if (!control || (control as HTMLButtonElement).disabled) return;
  const current = control.textContent?.trim();
  await user.click(control);
  const listbox = await screen.findByRole('listbox', { name: label });
  const option = within(listbox)
    .getAllByRole('option')
    .find((candidate) => candidate.textContent?.trim() !== current);
  if (option) await user.click(option);
}

function stateOf(element: HTMLElement | null): Exclude<ExpectedState, 'present'> {
  if (!element) return 'absent';
  return (element as HTMLButtonElement).disabled ? 'disabled' : 'enabled';
}

async function actionMismatches(
  user: ReturnType<typeof userEvent.setup>,
  panel: HTMLElement,
  ctx: GuardContext,
) {
  const mismatches: string[] = [];
  for (const surface of ['thread', 'actions'] as const) {
    await revealSurface(user, panel, surface);
    Object.entries(ACTION_INVENTORY)
      .filter(([, spec]) => spec.surface === surface)
      .forEach(([key, spec]) => {
        const expected = spec.expected(ctx);
        const actual = stateOf(spec.locate(panel));
        const ok = expected === 'present' ? actual !== 'absent' : actual === expected;
        if (!ok) mismatches.push(`acción ${key}: se esperaba ${expected}, hay ${actual}`);
      });
  }
  return mismatches;
}

// ── Perfiles: las props que cada consumidor pasa de verdad al panel (H6) ─────────────────────

interface ConsumerProfile {
  name: string;
  canOperate: boolean;
  canManage: boolean;
  hasLinkedTask: boolean;
}

/**
 * Bandeja: `canOperate = canViewAssurance` (ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR),
 * `canManage = canManageAssurance` (ADMIN, NOC, SUPPORT) y siempre `onCreateLinkedTask`.
 * Soporte: `canOperate = canManage = ASSURANCE_TICKETS_MANAGE` y nunca `onCreateLinkedTask`.
 */
const PROFILES: ConsumerProfile[] = [
  { name: 'bandeja · gestión', canOperate: true, canManage: true, hasLinkedTask: true },
  { name: 'bandeja · técnico', canOperate: true, canManage: false, hasLinkedTask: true },
  { name: 'bandeja · sin operación', canOperate: false, canManage: false, hasLinkedTask: true },
  { name: 'soporte · gestión', canOperate: true, canManage: true, hasLinkedTask: false },
  { name: 'soporte · solo lectura', canOperate: false, canManage: false, hasLinkedTask: false },
];

const COMMENTS_IN_PANEL = { current: [] as AssuranceTicketComment[] };

function renderPanel(
  profile: ConsumerProfile,
  ticket: AssuranceTicket,
  handlers: Partial<React.ComponentProps<typeof AssuranceTicketDrawer>> = {},
) {
  const noop = jest.fn(async () => undefined);
  COMMENTS_IN_PANEL.current = COMMENTS;
  render(
    <AssuranceTicketDrawer
      open
      ticket={ticket}
      comments={COMMENTS}
      timeline={TIMELINE}
      assignees={[AGENT]}
      isLoading={false}
      error={null}
      actionFeedback={null}
      actionError={null}
      isCommentSubmitting={false}
      isTransitionSubmitting={false}
      isAssignmentSubmitting={false}
      isFieldServiceSubmitting={false}
      isLinkingWorkOrder={false}
      canManage={profile.canManage}
      canOperate={profile.canOperate}
      {...(profile.hasLinkedTask ? { onCreateLinkedTask: jest.fn() } : {})}
      onClose={jest.fn()}
      onAddComment={noop}
      onTransitionStatus={noop}
      onAssign={noop}
      onRequestFieldService={noop}
      onLinkWorkOrder={noop}
      {...handlers}
    />,
  );
  return getPanel(ticket.ticketNumber);
}

/** El panel se localiza por su título. Hoy es un `<aside>`; tras P1, un diálogo con nombre (CA-5). */
function getPanel(ticketNumber: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: ticketNumber, level: 2 });
  const panel = heading.closest<HTMLElement>('aside, [role="dialog"]');
  if (!panel) throw new Error(`No se encontró el panel del ticket ${ticketNumber}`);
  return panel;
}

function ctxFor(profile: ConsumerProfile, ticket: AssuranceTicket): GuardContext {
  return {
    canOperate: profile.canOperate,
    canManage: profile.canManage,
    hasLinkedTask: profile.hasLinkedTask,
    canReadExecutionOrders:
      mockGrantedPermissions.current === null ||
      mockGrantedPermissions.current.has(AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ),
    status: ticket.status as TicketStatus,
    slaBreachStatus: ticket.slaBreachStatus as SlaBreachStatus,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGrantedPermissions.current = null;
  mockSearchParams = new URLSearchParams();
  Element.prototype.scrollIntoView = jest.fn();
});

// ── 1. Panel con las props de cada consumidor ────────────────────────────────────────────────

describe('AssuranceTicketDrawer — inventario CA-1: propiedades de H2', () => {
  it.each(PROFILES.map((profile) => [profile.name, profile] as const))(
    '%s: con todas las condiciones encendidas, muestra todas las propiedades',
    (_name, profile) => {
      const ticket = fullTicket({ status: TicketStatus.CLOSED });
      const panel = renderPanel(profile, ticket);
      expect(propertyMismatches(panel, ticket, [AGENT])).toEqual([]);
      // Comprobación positiva explícita: las condicionales sí están (no basta con «no falta nada»).
      expect(
        findProperty(panel, PROPERTY_LABELS.closed, formatAssuranceDateTime(ticket.closedAt)),
      ).not.toBeNull();
      expect(
        findProperty(
          panel,
          PROPERTY_LABELS.firstResponseDue,
          formatAssuranceDateTime(ticket.slaFirstResponseAt),
        ),
      ).not.toBeNull();
    },
  );

  it.each(PROFILES.map((profile) => [profile.name, profile] as const))(
    '%s: con las condiciones apagadas, oculta Cerrado, los plazos y la insignia de plazo',
    (_name, profile) => {
      const ticket = minimalTicket();
      const panel = renderPanel(profile, ticket);
      expect(propertyMismatches(panel, ticket, [AGENT])).toEqual([]);
      expect(panel).not.toHaveTextContent(PROPERTY_LABELS.firstResponseDue);
      expect(panel).not.toHaveTextContent(PROPERTY_LABELS.resolveDue);
    },
  );

  it('importado con cierre igual a la apertura: no inventa la fecha de cierre', () => {
    const ticket = minimalTicket({
      status: TicketStatus.CLOSED,
      closedAt: '2026-11-01T10:00:00.000Z',
    });
    const panel = renderPanel(PROFILES[0]!, ticket);
    expect(propertyMismatches(panel, ticket, [AGENT])).toEqual([]);
    expect(
      findProperty(panel, PROPERTY_LABELS.closed, formatAssuranceDateTime(ticket.closedAt)),
    ).toBeNull();
  });
});

describe('AssuranceTicketDrawer — inventario CA-1: hilo del caso', () => {
  it('comentarios con autor, visibilidad, fecha, texto y adjuntos; historial con evento y actor', async () => {
    const user = userEvent.setup();
    const ticket = fullTicket();
    const panel = renderPanel(PROFILES[0]!, ticket);

    await user.click(within(panel).getByRole('tab', { name: THREAD_LABELS.comments }));
    const article = within(panel).getByRole('article');
    expect(article).toHaveTextContent(getAssuranceUserDisplayName(AGENT));
    expect(within(article).getByText('Interno', { exact: true })).toBeInTheDocument();
    expect(article).toHaveTextContent(formatAssuranceDateTime(COMMENTS[0]!.createdAt));
    expect(article).toHaveTextContent('Se revisa la potencia óptica.');
    expect(within(article).getByText('acta-sintetica.pdf')).toBeInTheDocument();

    await user.click(within(panel).getByRole('tab', { name: THREAD_LABELS.history }));
    expect(
      within(panel).getByText(
        getAssuranceTimelineEventLabel(TicketTimelineEventType.STATUS_CHANGED),
      ),
    ).toBeInTheDocument();
    expect(panel).toHaveTextContent(getAssuranceUserDisplayName(AGENT));
  });
});

describe('AssuranceTicketDrawer — inventario CA-1: acciones y guardas de H5', () => {
  const statuses = Object.values(TicketStatus);
  const cases = PROFILES.flatMap((profile) =>
    statuses.map((status) => [profile.name, status, profile] as const),
  );

  it.each(cases)('%s · %s: cada acción respeta su guarda', async (_name, status, profile) => {
    const user = userEvent.setup();
    const ticket = fullTicket({ status });
    const panel = renderPanel(profile, ticket);
    expect(await actionMismatches(user, panel, ctxFor(profile, ticket))).toEqual([]);
  });

  it('sin plazo en riesgo no hay alerta de plazo', async () => {
    const user = userEvent.setup();
    const ticket = fullTicket({ slaBreachStatus: SlaBreachStatus.OK });
    const panel = renderPanel(PROFILES[0]!, ticket);
    expect(await actionMismatches(user, panel, ctxFor(PROFILES[0]!, ticket))).toEqual([]);
    await revealSurface(user, panel, 'actions');
    expect(ACTION_INVENTORY.slaAlert!.locate(panel)).toBeNull();
  });

  it('cada ítem del inventario aparece disponible en algún escenario (ningún localizador vacío)', () => {
    const statusesToProbe = Object.values(TicketStatus);
    const reachable = Object.entries(ACTION_INVENTORY).filter(([, spec]) =>
      PROFILES.some((profile) =>
        statusesToProbe.some((status) => {
          const state = spec.expected({ ...ctxFor(profile, fullTicket({ status })) });
          return state !== 'absent';
        }),
      ),
    );
    expect(reachable.map(([key]) => key)).toEqual(Object.keys(ACTION_INVENTORY));
  });
});

describe('AssuranceTicketDrawer — inventario CA-1: acciones que dependen de lo escrito', () => {
  it('cambio de estado: ofrece todos los estados menos el actual y envía el elegido con su nota', async () => {
    const user = userEvent.setup();
    const onTransitionStatus = jest.fn(async () => undefined);
    const ticket = fullTicket({ status: TicketStatus.IN_PROGRESS });
    const panel = renderPanel(PROFILES[0]!, ticket, { onTransitionStatus });

    await revealSurface(user, panel, 'actions');
    await user.click(within(panel).getByRole('combobox', { name: 'Nuevo estado' }));
    // La lista de destinos se pinta en una capa propia del Select, fuera del panel.
    const listbox = await screen.findByRole('listbox', { name: 'Nuevo estado' });
    const offered = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent?.trim());
    expect(offered).toEqual(
      ASSURANCE_TICKET_STATUS_OPTIONS.filter((option) => option.value !== ticket.status).map(
        (option) => option.label,
      ),
    );
    await user.click(
      within(listbox).getByRole('option', {
        name: getAssuranceTicketStatusLabel(TicketStatus.RESOLVED),
      }),
    );
    await user.type(within(panel).getByRole('textbox', { name: 'Nota' }), 'Nota sintética');
    const submit = within(panel).getByRole('button', { name: 'Guardar estado' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onTransitionStatus).toHaveBeenCalledWith({
      status: TicketStatus.RESOLVED,
      notes: 'Nota sintética',
    });
  });

  it('redactor: habilita «Agregar comentario» con texto y envía la marca de interno', async () => {
    const user = userEvent.setup();
    const onAddComment = jest.fn(async () => true);
    const ticket = fullTicket();
    const panel = renderPanel(PROFILES[3]!, ticket, { onAddComment });

    await revealSurface(user, panel, 'thread');
    await user.type(
      within(panel).getByRole('textbox', { name: 'Nuevo comentario' }),
      'Texto sintético',
    );
    await user.click(within(panel).getByRole('checkbox', { name: 'Interno' }));
    const submit = within(panel).getByRole('button', { name: 'Agregar comentario' });
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onAddComment).toHaveBeenCalledWith({
      body: 'Texto sintético',
      isInternal: true,
      files: [],
    });
  });

  it('crear tarea vinculada: llama al consumidor que la ofrece', async () => {
    const user = userEvent.setup();
    const onCreateLinkedTask = jest.fn();
    const ticket = fullTicket({ status: TicketStatus.OPEN });
    const panel = renderPanel(PROFILES[0]!, ticket, { onCreateLinkedTask });

    await revealSurface(user, panel, 'actions');
    await user.click(within(panel).getByRole('button', { name: 'Crear tarea vinculada' }));
    expect(onCreateLinkedTask).toHaveBeenCalledTimes(1);
  });
});

// ── 2. Consumidores reales: abren el panel y le pasan sus props ──────────────────────────────

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
  COMMENTS_IN_PANEL.current = COMMENTS;
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

async function waitForLoadedPanel(ticket: AssuranceTicket): Promise<HTMLElement> {
  await screen.findByRole('heading', { name: ticket.ticketNumber, level: 2 });
  const panel = getPanel(ticket.ticketNumber);
  await waitFor(() =>
    expect(
      findProperty(panel, PROPERTY_LABELS.opened, formatAssuranceDateTime(ticket.createdAt)),
    ).not.toBeNull(),
  );
  // Comentarios cargados: el conteo de adjuntos ya refleja la respuesta.
  await waitFor(() =>
    expect(within(panel).getAllByText('acta-sintetica.pdf').length).toBeGreaterThan(0),
  );
  return panel;
}

describe('Consumidor bandeja (AssuranceClient) — inventario CA-1', () => {
  const bandejaCases = [
    [UserRole.ADMIN, PROFILES[0]!],
    [UserRole.TECHNICIAN, PROFILES[1]!],
  ] as const;

  it.each(bandejaCases)(
    'rol %s: el panel abierto desde la bandeja conserva propiedades y acciones con su guarda',
    async (role, profile) => {
      mockAuth.user = { ...mockAuth.user, role };
      const ticket = fullTicket({ status: TicketStatus.IN_PROGRESS });
      primeTicketApi(ticket);
      const user = userEvent.setup();

      render(<AssuranceClient />);
      await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));
      const panel = await waitForLoadedPanel(ticket);

      // La bandeja carga los responsables para cualquier rol (`loadOperationalUsers` sin guarda).
      const users = [AGENT];
      await waitFor(() => expect(propertyMismatches(panel, ticket, users)).toEqual([]));
      expect(await actionMismatches(user, panel, ctxFor(profile, ticket))).toEqual([]);
      // H6: la bandeja sí pasa «Crear tarea vinculada».
      expect(ACTION_INVENTORY.createLinkedTask!.locate(panel)).not.toBeNull();
    },
  );

  afterAll(() => {
    mockAuth.user = { ...mockAuth.user, role: UserRole.ADMIN };
  });
});

describe('Consumidor pestaña Soporte (SubscriberSupportTab) — inventario CA-1', () => {
  const subscriber = {
    id: SUBSCRIBER_ID,
    tenantId: 'tenant-1',
    personType: 'NATURAL',
    firstName: 'Suscriptor',
    lastName: 'Sintético',
    businessName: null,
    city: 'Bogotá',
    privacyRestricted: false,
  } as SubscriberRecord;

  const soporteCases = [
    [
      'lectura y gestión',
      [AccessPermissionKey.ASSURANCE_TICKETS_READ, AccessPermissionKey.ASSURANCE_TICKETS_MANAGE],
      PROFILES[3]!,
    ],
    ['solo lectura', [AccessPermissionKey.ASSURANCE_TICKETS_READ], PROFILES[4]!],
  ] as const;

  it.each(soporteCases)(
    'permiso de %s: el panel abierto desde la ficha conserva propiedades y acciones con su guarda',
    async (_name, permissions, profile) => {
      mockGrantedPermissions.current = new Set(permissions);
      const ticket = fullTicket({ status: TicketStatus.IN_PROGRESS });
      primeTicketApi(ticket);
      const user = userEvent.setup();

      render(<SubscriberSupportTab subscriber={subscriber} />);
      await user.click(
        await screen.findByRole('button', {
          name: new RegExp(`^Abrir ticket ${ticket.ticketNumber}`, 'u'),
        }),
      );
      const panel = await waitForLoadedPanel(ticket);

      // Soporte carga los responsables solo con gestión.
      const users = profile.canManage ? [AGENT] : [];
      await waitFor(() => expect(propertyMismatches(panel, ticket, users)).toEqual([]));
      expect(await actionMismatches(user, panel, ctxFor(profile, ticket))).toEqual([]);
      // H6: la pestaña Soporte no pasa «Crear tarea vinculada».
      expect(ACTION_INVENTORY.createLinkedTask!.locate(panel)).toBeNull();
    },
  );
});
