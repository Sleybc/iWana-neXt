/**
 * P3 y P3-J de la spec 2026-11-20 (Soporte en vista dividida, v1.2): franja «Próximas visitas»
 * (bloque I, CA-13 a CA-16), historial plegable (decisión del usuario 2026-11-20) y lista densa
 * (bloque J, CA-17 y CA-18). Datos sintéticos; mocks con referencia estable.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  ScheduleEventStatus,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
  UserRole,
  VisitRequestStatus,
  WfmWorkType,
} from '@iwana/shared';
import type { SubscriberUpcomingVisitItem } from '@iwana/shared';
import type {
  AssuranceTicket,
  SubscriberRecord,
  WfmScheduleEvent,
  WfmVisitRequest,
} from '@/lib/api-client';
import { assuranceApi, usersApi, wfmApi } from '@/lib/api-client';
import { formatWfmDateTime } from '@/components/scheduling/scheduling-ui';
import { SubscriberSupportTab } from './SubscriberSupportTab';

function routerPush(): jest.Mock {
  const navigation = jest.requireMock('next/navigation') as {
    useRouter: () => { push: jest.Mock };
  };
  return navigation.useRouter().push;
}

const mockPermissions = { current: new Set<AccessPermissionKey>() };
const mockAuth: { current: { user: { role: string } } | null } = { current: null };

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (permission: AccessPermissionKey) => mockPermissions.current.has(permission),
      });
  })(),
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useOptionalAuth: () => mockAuth.current,
}));

jest.mock('next/navigation', () => ({
  useRouter: (() => {
    let router: Record<string, unknown> | undefined;
    return () => (router ??= { push: jest.fn(), replace: jest.fn() });
  })(),
}));

jest.mock('@/lib/api-client', () => ({
  assuranceApi: {
    tickets: {
      list: jest.fn(),
      get: jest.fn(),
      listComments: jest.fn(),
      listTimeline: jest.fn(),
      create: jest.fn(),
      submitComment: jest.fn(),
    },
    slaPolicies: { list: jest.fn() },
  },
  usersApi: { list: jest.fn() },
  wfmApi: {
    subscriberUpcomingVisits: jest.fn(),
    visitRequests: { list: jest.fn() },
    events: { list: jest.fn() },
  },
}));

const subscriber = {
  id: '8d4943a8-a7d8-4053-942f-a99a0dd16603',
  tenantId: 'tenant-a',
  personType: 'NATURAL',
  firstName: 'Ada',
  lastName: 'Sintética',
  businessName: null,
  city: 'Bogotá',
  privacyRestricted: false,
} as SubscriberRecord;

const ALL = [
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
  AccessPermissionKey.WFM_SCHEDULE_READ,
];

function ticket(overrides: Partial<AssuranceTicket> & { id: string }): AssuranceTicket {
  return {
    tenantId: 'tenant-a',
    ticketNumber: 'TK-2026-0001',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: 'Asunto sintético',
    description: null,
    requesterType: TicketRequesterType.SUBSCRIBER,
    requesterRefId: subscriber.id,
    subjectType: null,
    subjectRefId: null,
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
    createdByUserId: 'user-a',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  } as AssuranceTicket;
}

const T_HIGH = ticket({
  id: 't-high',
  ticketNumber: 'TK-2026-1001',
  subject: 'Sin servicio sintético',
  priority: TicketPriority.HIGH,
  description: 'Relato sintético de la falla',
  attachmentCount: 1,
  commentCount: 2,
} as Partial<AssuranceTicket> & { id: string });
const T_NORMAL = ticket({
  id: 't-normal',
  ticketNumber: 'TK-2026-1002',
  subject: 'Lentitud sintética',
  createdAt: '2026-11-19T10:00:00.000Z',
});
const TICKETS = [T_HIGH, T_NORMAL];

const CONTRACT_EVENT_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const TICKET_REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const OLD_EVENT_ID = '44444444-4444-4444-8444-444444444444';

const ticketVisit: SubscriberUpcomingVisitItem = {
  key: `REQUEST:${TICKET_REQUEST_ID}`,
  kind: 'REQUEST',
  id: TICKET_REQUEST_ID,
  visitRequestId: TICKET_REQUEST_ID,
  scheduleEventId: null,
  status: VisitRequestStatus.PENDING,
  workType: WfmWorkType.SUPPORT,
  scheduledAt: null,
  requestedWindowStartAt: null,
  address: null,
  origin: {
    type: 'TICKET',
    ticketId: 't-normal',
    ticketNumber: 'TK-2026-1002',
    expedienteId: null,
    contractId: null,
  },
  createdAt: '2026-11-19T10:00:00.000Z',
};
const contractVisit: SubscriberUpcomingVisitItem = {
  key: `EVENT:${CONTRACT_EVENT_ID}`,
  kind: 'EVENT',
  id: CONTRACT_EVENT_ID,
  visitRequestId: CONTRACT_REQUEST_ID,
  scheduleEventId: CONTRACT_EVENT_ID,
  status: ScheduleEventStatus.SCHEDULED,
  workType: WfmWorkType.TECHNICAL_VISIT,
  scheduledAt: '2099-02-01T14:00:00.000Z',
  requestedWindowStartAt: null,
  address: 'Carrera sintética 1',
  origin: {
    type: 'CONTRACT',
    ticketId: null,
    ticketNumber: null,
    expedienteId: null,
    contractId: '55555555-5555-4555-8555-555555555555',
  },
  createdAt: '2026-11-18T10:00:00.000Z',
};

/** El cargador del historial trae la visita del contrato (abierta) y una ya terminada. */
const historyEvents = [
  {
    id: CONTRACT_EVENT_ID,
    tenantId: 'tenant-a',
    type: WfmWorkType.TECHNICAL_VISIT,
    status: ScheduleEventStatus.SCHEDULED,
    scheduledStartAt: '2099-02-01T14:00:00.000Z',
    address: 'Carrera sintética 1',
    expedienteId: null,
    contractId: '55555555-5555-4555-8555-555555555555',
    subscriberId: subscriber.id,
    ticketId: null,
    createdAt: '2026-11-18T10:00:00.000Z',
  },
  {
    id: OLD_EVENT_ID,
    tenantId: 'tenant-a',
    type: WfmWorkType.INSTALLATION,
    status: ScheduleEventStatus.COMPLETED,
    scheduledStartAt: '2026-01-10T14:00:00.000Z',
    address: 'Carrera sintética 1',
    expedienteId: null,
    contractId: '55555555-5555-4555-8555-555555555555',
    subscriberId: subscriber.id,
    ticketId: null,
    createdAt: '2026-01-01T10:00:00.000Z',
  },
] as unknown as WfmScheduleEvent[];

const WIDE_QUERY = '(min-width: 1280px)';
let wide = false;
function setViewport(isWide: boolean) {
  wide = isWide;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === WIDE_QUERY ? wide : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

function ticketRows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Tickets vinculados' })).getAllByRole('button', {
    name: /^Abrir ticket /,
  });
}

const scrollIntoView = jest.fn();

describe('SubscriberSupportTab — próximas visitas y lista densa (P3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setViewport(false);
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, '', '/dashboard/crm/subscribers/s-1?tab=soporte');
    mockPermissions.current = new Set(ALL);
    mockAuth.current = { user: { role: UserRole.SUPPORT } };
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: TICKETS });
    (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
      TICKETS.find((item) => item.id === id),
    );
    (assuranceApi.tickets.listComments as jest.Mock).mockResolvedValue([]);
    (assuranceApi.tickets.listTimeline as jest.Mock).mockResolvedValue([]);
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([]);
    (usersApi.list as jest.Mock).mockResolvedValue({ data: [], meta: { nextCursor: null } });
    (wfmApi.subscriberUpcomingVisits as jest.Mock).mockResolvedValue({
      items: [ticketVisit, contractVisit],
      total: 2,
      truncated: false,
    });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({
      items: [] as WfmVisitRequest[],
    });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: historyEvents });
  });

  describe('I · franja «Próximas visitas»', () => {
    it('CA-13: muestra las visitas de cualquier origen con fecha o «Por agendar», tipo y origen', async () => {
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const strip = await screen.findByRole('list', { name: 'Visitas pendientes' });
      expect(wfmApi.subscriberUpcomingVisits).toHaveBeenCalledTimes(1);
      expect(wfmApi.subscriberUpcomingVisits).toHaveBeenCalledWith(subscriber.id);
      expect(within(strip).getByText('Por agendar')).toBeInTheDocument();
      expect(within(strip).getByText('Ticket TK-2026-1002')).toBeInTheDocument();
      expect(within(strip).getByText('Contrato')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Próximas visitas' })).toBeInTheDocument();
    });

    it('CA-14: la visita de un ticket abre ese ticket en la pestaña y lo deja en la URL', async () => {
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(ticketRows()).toHaveLength(2));
      await user.click(await screen.findByRole('button', { name: /^Ver ticket TK-2026-1002: / }));
      expect(await screen.findByRole('heading', { name: 'TK-2026-1002' })).toBeInTheDocument();
      expect(new URLSearchParams(window.location.search).get('ticket')).toBe('t-normal');
    });

    it('CA-14: la visita de un contrato abre su visita en la agenda, como antes', async () => {
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const link = await screen.findByRole('link', { name: /^Abrir en Agendamiento: visita / });
      expect(link).toHaveAttribute('href', '/dashboard/scheduling/agenda');
    });

    it('CA-14: ninguna visita aparece dos veces; el historial, plegado, guarda solo las demás', async () => {
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await screen.findByRole('list', { name: 'Visitas pendientes' });
      const toggle = screen.getByRole('button', { name: 'Historial de visitas' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      const history = await screen.findByRole('list', { name: 'Visitas vinculadas' });
      const rows = within(history).getAllByRole('button', { name: /^Ver detalle de visita: / });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAccessibleName(expect.stringContaining('Instalación'));
      // Sus datos y acciones se conservan: detalle de solo lectura con «Abrir en Agendamiento».
      await user.click(rows[0]!);
      const detail = await screen.findByRole('dialog', { name: 'Detalle de la visita' });
      expect(within(detail).getByRole('link', { name: 'Abrir en Agendamiento' })).toBeVisible();
    });

    it('«Visitas próximas» cuenta todas las de la franja y lleva a ella', async () => {
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const figure = await screen.findByRole('button', { name: 'Ver 2 visitas próximas' });
      await user.click(figure);
      expect(screen.getByRole('heading', { name: 'Próximas visitas' })).toHaveFocus();
    });

    it('sin pendientes, la franja es una línea', async () => {
      (wfmApi.subscriberUpcomingVisits as jest.Mock).mockResolvedValue({
        items: [],
        total: 0,
        truncated: false,
      });
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(
        await screen.findByText('Este suscriptor no tiene visitas pendientes.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Visitas pendientes' })).not.toBeInTheDocument();
    });

    it('si falla, avisa y «Reintentar» vuelve a consultar sin romper los tickets', async () => {
      (wfmApi.subscriberUpcomingVisits as jest.Mock)
        .mockRejectedValueOnce(new Error('caído'))
        .mockResolvedValueOnce({ items: [contractVisit], total: 1, truncated: false });
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(
        await screen.findByText('No fue posible cargar las próximas visitas.'),
      ).toBeInTheDocument();
      await waitFor(() => expect(ticketRows()).toHaveLength(2));
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('list', { name: 'Visitas pendientes' })).toBeInTheDocument();
    });

    it.each([
      ['un rol sin acceso al endpoint', UserRole.TECHNICIAN, ALL],
      ['sin sesión resuelta', null, ALL],
      [
        'sin permiso de lectura de programación',
        UserRole.SUPPORT,
        [AccessPermissionKey.ASSURANCE_TICKETS_READ],
      ],
    ])('CA-15: con %s no se ofrece la franja ni se consulta', async (_label, role, permissions) => {
      mockAuth.current = role ? { user: { role } } : null;
      mockPermissions.current = new Set(permissions);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(ticketRows()).toHaveLength(2));
      expect(screen.queryByRole('heading', { name: 'Próximas visitas' })).not.toBeInTheDocument();
      expect(wfmApi.subscriberUpcomingVisits).not.toHaveBeenCalled();
    });

    it('CA-17: con 3 visitas muestra 2 en una línea y «+1 más» despliega la tercera con su detalle', async () => {
      const third: SubscriberUpcomingVisitItem = {
        ...contractVisit,
        key: `REQUEST:${OLD_EVENT_ID}`,
        kind: 'REQUEST',
        id: OLD_EVENT_ID,
        visitRequestId: OLD_EVENT_ID,
        scheduleEventId: null,
        status: VisitRequestStatus.PENDING,
        workType: WfmWorkType.INSTALLATION,
        scheduledAt: null,
        address: 'Calle sintética 3',
        origin: {
          ...contractVisit.origin,
          type: 'OPPORTUNITY',
          contractId: null,
          expedienteId: CONTRACT_REQUEST_ID,
        },
      };
      (wfmApi.subscriberUpcomingVisits as jest.Mock).mockResolvedValue({
        items: [ticketVisit, contractVisit, third],
        total: 3,
        truncated: false,
      });
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const strip = await screen.findByRole('list', { name: 'Visitas pendientes' });
      expect(within(strip).getAllByRole('listitem')).toHaveLength(2);
      expect(screen.queryByRole('link', { name: /Calle sintética 3/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ver 3 visitas próximas' })).toBeInTheDocument();
      const more = screen.getByRole('button', { name: 'Ver 1 visita pendiente más' });
      expect(more).toHaveTextContent('+1 más');
      expect(more).toHaveAttribute('aria-expanded', 'false');
      more.focus();
      await user.keyboard('{Enter}');
      expect(within(strip).getAllByRole('listitem')).toHaveLength(3);
      expect(within(strip).getByRole('link', { name: /Calle sintética 3/ })).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Mostrar solo las dos primeras visitas' }),
      ).toHaveAttribute('aria-expanded', 'true');
      await user.click(
        within(strip).getByRole('button', {
          name: 'Ver detalle de visita: Instalación, Pendiente',
        }),
      );
      const detail = await screen.findByRole('dialog', { name: 'Detalle de la visita' });
      expect(within(detail).getByRole('link', { name: 'Abrir en Agendamiento' })).toHaveAttribute(
        'href',
        expect.stringContaining(`visitRequestId=${OLD_EVENT_ID}`),
      );
    });
    it('una visita agendada muestra su fecha firme', async () => {
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const strip = await screen.findByRole('list', { name: 'Visitas pendientes' });
      expect(within(strip).getByText(formatWfmDateTime(contractVisit.scheduledAt!))).toBeVisible();
    });

    it('detalle de la visita de un ticket: acción «Abrir el ticket» con su enlace', async () => {
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await screen.findByRole('list', { name: 'Visitas pendientes' });
      await user.click(
        screen.getByRole('button', { name: 'Ver detalle de visita: Soporte, Pendiente' }),
      );
      const detail = await screen.findByRole('dialog', { name: 'Detalle de la visita' });
      expect(within(detail).getByText('Ticket TK-2026-1002')).toBeVisible();
      expect(within(detail).getByRole('link', { name: 'Abrir el ticket' })).toHaveAttribute(
        'href',
        '/dashboard/assurance/tickets/t-normal',
      );
    });

    it('si el ticket de la visita no está en la lista, navega a su página de respaldo', async () => {
      (wfmApi.subscriberUpcomingVisits as jest.Mock).mockResolvedValue({
        items: [
          {
            ...ticketVisit,
            origin: { ...ticketVisit.origin, ticketId: 't-ajeno', ticketNumber: 'TK-2026-1999' },
          },
        ],
        total: 1,
        truncated: false,
      });
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(ticketRows()).toHaveLength(2));
      await user.click(await screen.findByRole('button', { name: /^Ver ticket TK-2026-1999: / }));
      expect(routerPush()).toHaveBeenCalledWith('/dashboard/assurance/tickets/t-ajeno');
      expect(assuranceApi.tickets.get).not.toHaveBeenCalledWith('t-ajeno');
    });
    it('contenedor estrecho: una visita legible y «+1 más» en la misma línea', async () => {
      const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback(
            [{ contentRect: { width: 800 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        disconnect() {}
      };
      try {
        render(<SubscriberSupportTab subscriber={subscriber} />);
        const strip = await screen.findByRole('list', { name: 'Visitas pendientes' });
        await waitFor(() => expect(within(strip).getAllByRole('listitem')).toHaveLength(1));
        expect(screen.getByRole('button', { name: 'Ver 1 visita pendiente más' })).toBeVisible();
      } finally {
        (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
      }
    });
    it('una respuesta con forma inválida se trata como error con «Reintentar»', async () => {
      (wfmApi.subscriberUpcomingVisits as jest.Mock)
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ items: [contractVisit], total: 1, truncated: false });
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByText('No fue posible cargar las próximas visitas.')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('list', { name: 'Visitas pendientes' })).toBeVisible();
    });

    it.each([UserRole.ADMIN, UserRole.SUPPORT])(
      'R9 (%s): dirección visible, ventana preferida sin fecha y detalle de solo lectura',
      async (role) => {
        mockAuth.current = { user: { role } };
        (wfmApi.subscriberUpcomingVisits as jest.Mock).mockResolvedValue({
          items: [
            {
              ...contractVisit,
              key: `REQUEST:${CONTRACT_REQUEST_ID}`,
              kind: 'REQUEST',
              id: CONTRACT_REQUEST_ID,
              scheduleEventId: null,
              status: VisitRequestStatus.READY_TO_SCHEDULE,
              scheduledAt: null,
              requestedWindowStartAt: '2099-03-01T14:00:00.000Z',
            },
          ],
          total: 1,
          truncated: false,
        });
        const user = userEvent.setup();
        render(<SubscriberSupportTab subscriber={subscriber} />);
        const strip = await screen.findByRole('list', { name: 'Visitas pendientes' });
        // QA3 tercera pasada: la dirección sale de la línea (ilegible); queda en el nombre accesible y el detalle.
        expect(within(strip).queryByText('Carrera sintética 1')).not.toBeInTheDocument();
        expect(within(strip).getByText(/^Por agendar · ventana /)).toBeVisible();
        const link = within(strip).getByRole('link', { name: /^Abrir en Agendamiento: visita / });
        expect(link).toHaveAccessibleName(expect.stringContaining('Carrera sintética 1'));
        expect(link).toHaveAttribute(
          'href',
          expect.stringContaining(`visitRequestId=${CONTRACT_REQUEST_ID}`),
        );
        await user.click(within(strip).getByRole('button', { name: /^Ver detalle de visita: / }));
        const detail = await screen.findByRole('dialog', { name: 'Detalle de la visita' });
        expect(within(detail).getByText('Carrera sintética 1')).toBeVisible();
        expect(within(detail).getByText('Contrato')).toBeVisible();
        expect(within(detail).getByText(/^Por agendar · ventana /)).toBeVisible();
        expect(within(detail).getByRole('link', { name: 'Abrir en Agendamiento' })).toHaveAttribute(
          'href',
          expect.stringContaining(`visitRequestId=${CONTRACT_REQUEST_ID}`),
        );
      },
    );

    it('historial: un error de carga se ve sin desplegar, con «Reintentar»', async () => {
      (wfmApi.visitRequests.list as jest.Mock).mockRejectedValueOnce(new Error('caído'));
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByText('No fue posible cargar las visitas')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Historial de visitas' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      const history = screen
        .getByRole('heading', { name: 'Historial de visitas' })
        .closest('section, div[id]')!;
      await user.click(within(history as HTMLElement).getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(wfmApi.visitRequests.list).toHaveBeenCalledTimes(2));
      expect(screen.queryByText('No fue posible cargar las visitas')).not.toBeInTheDocument();
    });
    it('datos bloqueados: no consulta la franja y la pestaña no pinta nada, como hoy', () => {
      const { container } = render(
        <SubscriberSupportTab subscriber={{ ...subscriber, privacyRestricted: true }} />,
      );
      expect(container).toBeEmptyDOMElement();
      expect(wfmApi.subscriberUpcomingVisits).not.toHaveBeenCalled();
      expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
    });
  });

  describe('J · lista densa en vista dividida', () => {
    it('la fila tiene tres líneas como máximo y los ocho datos visibles o con nombre accesible', async () => {
      setViewport(true);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await screen.findByRole('heading', { name: 'TK-2026-1001' });
      const row = ticketRows()[0]!;
      // Línea 1 número y asunto; línea 2 estado, prioridad y datos; línea 3 relato.
      expect(row.children).toHaveLength(3);
      expect(row).toHaveAccessibleName(
        'Abrir ticket TK-2026-1001: Sin servicio sintético, Abierto, prioridad alta, con 1 adjunto, con 2 comentarios',
      );
      expect(row).toHaveAccessibleDescription(
        expect.stringMatching(/^Tipo incidente de cliente\. Responsable Sin asignar\. .*Abierto /),
      );
      expect(within(row).getByText('Relato sintético de la falla')).toBeInTheDocument();
      expect(within(row).getByTestId('ticket-attachment-clip')).toBeInTheDocument();
      expect(within(row).getByTestId('ticket-comment-count')).toBeInTheDocument();
    });

    it('comentarios con forma inesperada: avisa del error y no rompe el detalle (guarda de datos)', async () => {
      setViewport(true);
      (assuranceApi.tickets.listComments as jest.Mock).mockResolvedValue({ data: [] });
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-1001' })).toBeInTheDocument();
      expect(
        await screen.findByText('No fue posible cargar todos los detalles del ticket.'),
      ).toBeInTheDocument();
    });
    it('recarga tras una acción con forma inválida: avisa en lugar de descartar en silencio', async () => {
      setViewport(true);
      (assuranceApi.tickets.listComments as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValue({ data: [] });
      (assuranceApi.tickets.submitComment as jest.Mock).mockResolvedValue({
        id: 'c-1',
        ticketId: 't-high',
        body: 'Comentario sintético',
        isInternal: false,
        attachments: [],
        createdAt: '2026-11-20T10:00:00.000Z',
      });
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const pane = await screen.findByRole('region', { name: 'Ticket abierto' });
      await within(pane).findByRole('heading', { name: 'TK-2026-1001' });
      expect(
        within(pane).queryByText('No fue posible cargar todos los detalles del ticket.'),
      ).not.toBeInTheDocument();
      await user.type(
        within(pane).getByRole('textbox', { name: 'Nuevo comentario' }),
        'Comentario sintético',
      );
      await user.click(within(pane).getByRole('button', { name: 'Agregar comentario' }));
      expect(
        await within(pane).findByText('No fue posible cargar todos los detalles del ticket.'),
      ).toBeInTheDocument();
    });
    it('en panel (pantalla estrecha) la fila no cambia', async () => {
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(ticketRows()).toHaveLength(2));
      expect(ticketRows()[0]).not.toHaveAttribute('aria-describedby');
    });

    it('CA-18: al entrar abre el primero de la lista y lo desplaza a la vista', async () => {
      setViewport(true);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-1001' })).toBeInTheDocument();
      await waitFor(() => expect(ticketRows()[0]).toHaveAttribute('aria-current', 'true'));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }));
    });

    it('CA-18: el ticket pedido por URL se respeta y su fila se desplaza a la vista', async () => {
      setViewport(true);
      window.history.replaceState(null, '', '/x?tab=soporte&ticket=t-normal');
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-1002' })).toBeInTheDocument();
      await waitFor(() => expect(ticketRows()[1]).toHaveAttribute('aria-current', 'true'));
      await waitFor(() => expect(scrollIntoView.mock.contexts).toContainEqual(ticketRows()[1]));
    });
  });
});
