/**
 * P1 de la spec 2026-11-20 (Soporte en vista dividida): B ticket en la URL, A vista dividida,
 * C ticket al entrar, D relato en la fila, E visitas, F0 y CA-7. Mocks con referencia estable.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  SlaBreachStatus,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  TicketSource,
  TicketStatus,
  TicketType,
} from '@iwana/shared';
import type { AssuranceTicket, AssuranceTicketComment, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi, usersApi, wfmApi } from '@/lib/api-client';
import { SubscriberSupportTab } from './SubscriberSupportTab';

const mockPermissions = { current: new Set<AccessPermissionKey>() };

// Referencias estables (useRouter, usePermissions): un objeto nuevo por render dispara efectos
// en bucle. La pestaña no usa useAuth hoy; si el rediseño lo introduce, se mockea igual.
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (permission: AccessPermissionKey) => mockPermissions.current.has(permission),
      });
  })(),
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
      transitionStatus: jest.fn(),
      assign: jest.fn(),
      requestFieldService: jest.fn(),
      linkWorkOrder: jest.fn(),
    },
    slaPolicies: { list: jest.fn() },
  },
  usersApi: { list: jest.fn() },
  wfmApi: {
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

const withClip = ticket({
  id: 't-clip',
  ticketNumber: 'TK-2026-0801',
  subject: 'Intermitencia sintética',
  priority: TicketPriority.HIGH,
  slaResolveByAt: '2099-01-01T10:00:00.000Z',
  attachmentCount: 2,
} as Partial<AssuranceTicket> & { id: string });
const emptyDescription = ticket({
  id: 't-empty',
  ticketNumber: 'TK-2026-0802',
  subject: 'Sin relato sintético',
  type: TicketType.SERVICE_REQUEST,
  slaResolveByAt: '2099-01-05T10:00:00.000Z',
  createdAt: '2026-10-21T10:00:00.000Z',
});
const closed = ticket({
  id: 't-closed',
  ticketNumber: 'TK-2026-0803',
  subject: 'Cerrado sintético',
  status: TicketStatus.CLOSED,
  closedAt: '2026-10-22T10:00:00.000Z',
});
const ALL_TICKETS = [withClip, emptyDescription, closed];

const comments = [
  {
    id: 'c-public',
    ticketId: 't-clip',
    tenantId: 'tenant-a',
    body: 'Comentario público sintético',
    isInternal: false,
    authorUserId: 'user-a',
    attachments: [],
    createdAt: '2026-10-20T11:00:00.000Z',
  },
  {
    id: 'c-internal',
    ticketId: 't-clip',
    tenantId: 'tenant-a',
    body: 'Nota interna sintética',
    isInternal: true,
    authorUserId: 'user-a',
    attachments: [],
    createdAt: '2026-10-20T12:00:00.000Z',
  },
] as unknown as AssuranceTicketComment[];

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

function rows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: /tickets/i })).getAllByRole('button', {
    name: /^Abrir ticket /,
  });
}

function row(number: string): HTMLElement {
  return rows().find((item) => item.getAttribute('aria-label')?.includes(number))!;
}

function urlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

describe('SubscriberSupportTab — vista dividida (P1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setViewport(false);
    window.history.replaceState(null, '', '/dashboard/crm/subscribers/s-1?tab=soporte');
    mockPermissions.current = new Set(ALL);
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: ALL_TICKETS });
    (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
      ALL_TICKETS.find((item) => item.id === id),
    );
    (assuranceApi.tickets.listComments as jest.Mock).mockImplementation(async (id: string) =>
      id === 't-clip' ? comments : [],
    );
    (assuranceApi.tickets.listTimeline as jest.Mock).mockResolvedValue([]);
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([]);
    (usersApi.list as jest.Mock).mockResolvedValue({ data: [], meta: { nextCursor: null } });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({ items: [] });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: [] });
  });

  describe('B · ticket en la URL (CA-3, CA-4)', () => {
    it('abrir un ticket lo escribe en la URL y conserva los demás parámetros', async () => {
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(rows()).toHaveLength(2));
      await user.click(row('TK-2026-0801'));
      expect(await screen.findByRole('heading', { name: 'TK-2026-0801' })).toBeInTheDocument();
      expect(urlParam('ticket')).toBe('t-clip');
      expect(urlParam('tab')).toBe('soporte');
    });

    it('abrir el enlace con el ticket lo muestra con una sola carga', async () => {
      window.history.replaceState(null, '', '/x?tab=soporte&ticket=t-empty');
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-0802' })).toBeInTheDocument();
      expect(assuranceApi.tickets.get).toHaveBeenCalledTimes(1);
      expect(assuranceApi.tickets.get).toHaveBeenCalledWith('t-empty');
    });

    it('cerrar el panel quita el ticket de la URL', async () => {
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(rows()).toHaveLength(2));
      await user.click(row('TK-2026-0801'));
      await screen.findByRole('heading', { name: 'TK-2026-0801' });
      await user.click(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(urlParam('ticket')).toBeNull());
      expect(urlParam('tab')).toBe('soporte');
    });

    it('«atrás» vuelve al ticket anterior', async () => {
      setViewport(true);
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-0802' })).toBeInTheDocument();
      await user.click(row('TK-2026-0801'));
      expect(await screen.findByRole('heading', { name: 'TK-2026-0801' })).toBeInTheDocument();
      act(() => {
        window.history.back();
      });
      expect(await screen.findByRole('heading', { name: 'TK-2026-0802' })).toBeInTheDocument();
      expect(urlParam('ticket')).toBe('t-empty');
    });

    it('un ticket ajeno o inexistente se ignora sin consultarlo ni revelar nada', async () => {
      window.history.replaceState(null, '', '/x?tab=soporte&ticket=ajeno-123');
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(rows()).toHaveLength(2));
      await waitFor(() => expect(urlParam('ticket')).toBeNull());
      expect(assuranceApi.tickets.get).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(urlParam('tab')).toBe('soporte');
    });
  });

  describe('A y C · vista dividida desde 1280 px', () => {
    it('en vista dividida el ticket se ve junto a la lista, sin diálogo', async () => {
      setViewport(true);
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(rows()).toHaveLength(2));
      await user.click(row('TK-2026-0801'));
      const pane = await screen.findByRole('region', { name: 'Ticket abierto' });
      expect(
        await within(pane).findByRole('heading', { name: 'TK-2026-0801' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(rows()).toHaveLength(2);
      expect(within(pane).getByRole('textbox', { name: 'Nuevo comentario' })).toBeInTheDocument();
      // Cambiar de ticket con el ratón deja el foco en la fila (no es modal).
      expect(row('TK-2026-0801')).toHaveFocus();
    });

    it('al entrar abre el abierto más reciente, con una sola carga (R2)', async () => {
      setViewport(true);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-0802' })).toBeInTheDocument();
      await waitFor(() => expect(assuranceApi.tickets.listTimeline).toHaveBeenCalled());
      expect(assuranceApi.tickets.get).toHaveBeenCalledTimes(1);
      expect(assuranceApi.tickets.listComments).toHaveBeenCalledTimes(1);
      expect(urlParam('ticket')).toBe('t-empty');
      // La apertura automática no roba el foco.
      expect(document.body).toHaveFocus();
    });

    it('sin abiertos abre el más reciente', async () => {
      setViewport(true);
      const older = ticket({
        id: 't-old',
        ticketNumber: 'TK-2026-0700',
        status: TicketStatus.CLOSED,
        createdAt: '2026-09-01T10:00:00.000Z',
      });
      (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [older, closed] });
      (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
        [older, closed].find((item) => item.id === id),
      );
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-0803' })).toBeInTheDocument();
    });

    it('en panel (pantalla estrecha) no abre nada solo', async () => {
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(assuranceApi.tickets.get).not.toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Ticket abierto' })).not.toBeInTheDocument();
      expect(urlParam('ticket')).toBeNull();
    });

    it('sin tickets no hay columna del ticket', async () => {
      setViewport(true);
      (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [] });
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByText('Este suscriptor no tiene tickets')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Ticket abierto' })).not.toBeInTheDocument();
      expect(assuranceApi.tickets.get).not.toHaveBeenCalled();
    });

    it('CA-8: el panel del ticket tiene alto acotado y desplazamiento propio', async () => {
      setViewport(true);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      const pane = await screen.findByRole('region', { name: 'Ticket abierto' });
      expect(pane).toHaveClass('flex', 'flex-col', 'xl:max-h-[min(40rem,calc(100dvh-8rem))]');
      expect(within(pane).getByTestId('ticket-pane-body')).toHaveClass(
        'min-h-0',
        'flex-1',
        'overflow-y-auto',
      );
      expect(screen.getByRole('list', { name: 'Tickets vinculados' })).toHaveClass(
        'xl:max-h-[32rem]',
        'xl:overflow-y-auto',
      );
    });

    it('D3: «abierto» es todo lo no resuelto ni cerrado; gana el más reciente aunque esté en progreso', async () => {
      setViewport(true);
      const open = ticket({
        id: 't-o',
        ticketNumber: 'TK-2026-0901',
        createdAt: '2026-11-20T10:00:00.000Z',
      });
      const inProgress = ticket({
        id: 't-p',
        ticketNumber: 'TK-2026-0902',
        status: TicketStatus.IN_PROGRESS,
        createdAt: '2026-11-20T10:00:01.000Z',
      });
      const resolved = ticket({
        id: 't-r',
        ticketNumber: 'TK-2026-0903',
        status: TicketStatus.RESOLVED,
        createdAt: '2026-11-20T10:00:02.000Z',
      });
      const data = [open, inProgress, resolved];
      (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data });
      (assuranceApi.tickets.get as jest.Mock).mockImplementation(async (id: string) =>
        data.find((item) => item.id === id),
      );
      render(<SubscriberSupportTab subscriber={subscriber} />);
      expect(await screen.findByRole('heading', { name: 'TK-2026-0902' })).toBeInTheDocument();
    });

    it('CA-7: la fila del ticket abierto se anuncia como actual', async () => {
      setViewport(true);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await screen.findByRole('heading', { name: 'TK-2026-0802' });
      expect(row('TK-2026-0802')).toHaveAttribute('aria-current', 'true');
      expect(row('TK-2026-0801')).not.toHaveAttribute('aria-current');
    });

    it('E: Visitas sigue presente bajo la vista dividida', async () => {
      setViewport(true);
      render(<SubscriberSupportTab subscriber={subscriber} />);
      await screen.findByRole('heading', { name: 'TK-2026-0802' });
      expect(screen.getByRole('heading', { name: 'Visitas' })).toBeInTheDocument();
    });
  });

  it('D · la fila muestra una línea del relato', async () => {
    const withStory = ticket({
      id: 't-story',
      ticketNumber: 'TK-2026-0900',
      description: 'El cliente reporta cortes cada noche',
    });
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [withStory] });
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(
      within(rows()[0]!).getByText('El cliente reporta cortes cada noche'),
    ).toBeInTheDocument();
  });

  it('F0 · sin descripción pero con comentarios no muestra el texto de vacío', async () => {
    const noStory = ticket({ id: 't-clip', ticketNumber: 'TK-2026-0801', description: '' });
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [noStory] });
    (assuranceApi.tickets.get as jest.Mock).mockResolvedValue(noStory);
    const user = userEvent.setup();
    render(<SubscriberSupportTab subscriber={subscriber} />);
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(rows()[0]!);
    expect(await screen.findByText('Comentario público sintético')).toBeInTheDocument();
    expect(
      screen.queryByText('Sin descripción adicional registrada para este caso.'),
    ).not.toBeInTheDocument();
  });
});
