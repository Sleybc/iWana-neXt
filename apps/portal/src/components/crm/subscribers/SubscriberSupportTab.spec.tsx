import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  TicketFieldDecision,
  TicketPriority,
  TicketRequesterType,
  SlaBreachStatus,
  TicketSource,
  TicketStatus,
  TicketType,
} from '@iwana/shared';
import type { AssuranceTicket, AssuranceTicketComment, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi, usersApi, wfmApi } from '@/lib/api-client';
import { SubscriberSupportTab } from './SubscriberSupportTab';

const mockPermissions = { current: new Set<AccessPermissionKey>() };

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
    return () => (router ??= { push: jest.fn() });
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
  lastName: 'Lovelace',
  businessName: null,
  city: 'Bogotá',
  privacyRestricted: false,
} as SubscriberRecord;

function createdTicket(): AssuranceTicket {
  return {
    id: 'ticket-created',
    tenantId: 'tenant-a',
    ticketNumber: 'TK-2026-1001',
    type: TicketType.CUSTOMER_INCIDENT,
    status: TicketStatus.OPEN,
    priority: TicketPriority.NORMAL,
    source: TicketSource.PORTAL,
    subject: 'Sin conexión',
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
  };
}

describe('SubscriberSupportTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissions.current = new Set();
    (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [] });
    (assuranceApi.slaPolicies.list as jest.Mock).mockResolvedValue([]);
    (usersApi.list as jest.Mock).mockResolvedValue({ data: [], meta: { nextCursor: null } });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({ items: [] });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: [] });
    (assuranceApi.tickets.create as jest.Mock).mockResolvedValue(createdTicket());
  });

  it('mantiene la lectura de módulos independiente y no lista cuando solo se concede gestión', async () => {
    mockPermissions.current = new Set([AccessPermissionKey.ASSURANCE_TICKETS_MANAGE]);
    render(<SubscriberSupportTab subscriber={subscriber} />);

    expect(await screen.findByText('No tienes acceso a los tickets')).toBeInTheDocument();
    expect(screen.getByText('No tienes acceso a las visitas')).toBeInTheDocument();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
    expect(wfmApi.events.list).not.toHaveBeenCalled();
  });

  it('crea el ticket con el suscriptor fijado y no consulta la lista sin permiso de lectura', async () => {
    mockPermissions.current = new Set([AccessPermissionKey.ASSURANCE_TICKETS_MANAGE]);
    render(<SubscriberSupportTab subscriber={subscriber} />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Suscriptor')).toHaveValue('Ada Lovelace');
    expect(within(dialog).getByText('Bogotá')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Asunto operativo'), {
      target: { value: 'Sin conexión' },
    });
    fireEvent.change(within(dialog).getByLabelText('Decisión de campo'), {
      target: { value: TicketFieldDecision.FIELD_SERVICE_REQUIRED },
    });
    expect(within(dialog).queryByLabelText('Siguiente paso')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Crear ticket$/u }));

    await waitFor(() => expect(assuranceApi.tickets.create).toHaveBeenCalled());
    expect(assuranceApi.tickets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterType: TicketRequesterType.SUBSCRIBER,
        requesterRefId: subscriber.id,
        subject: 'Sin conexión',
      }),
    );
    expect(await screen.findByText('Ticket creado', { exact: true })).toBeInTheDocument();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
  });

  it('refresca solo Tickets cuando el perfil tiene permiso de lectura y gestión', async () => {
    mockPermissions.current = new Set([
      AccessPermissionKey.ASSURANCE_TICKETS_READ,
      AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
    ]);
    render(<SubscriberSupportTab subscriber={subscriber} />);

    await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(1));
    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Crear ticket' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Asunto operativo'), {
      target: { value: 'Sin conexión' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Crear ticket$/u }));

    await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(2));
    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
    expect(wfmApi.events.list).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Ticket creado y vinculado al suscriptor', { exact: true }),
    ).toBeInTheDocument();
  });

  it('no monta la pestaña ni solicita datos cuando la ficha está restringida', () => {
    const restrictedSubscriber = { ...subscriber, privacyRestricted: true } as SubscriberRecord;
    const { container } = render(<SubscriberSupportTab subscriber={restrictedSubscriber} />);

    expect(container).toBeEmptyDOMElement();
    expect(assuranceApi.tickets.list).not.toHaveBeenCalled();
    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
    expect(wfmApi.events.list).not.toHaveBeenCalled();
  });

  describe('comentario desde la pestaña (MOD09 adjuntos)', () => {
    const ticket = { ...createdTicket(), id: 'ticket-1', ticketNumber: 'TK-1', subject: 'Caso 1' };

    function comment(id: string, body: string): AssuranceTicketComment {
      return {
        id,
        ticketId: ticket.id,
        authorUserId: 'user-a',
        body,
        isInternal: false,
        createdAt: '2026-11-16T10:00:00.000Z',
        attachments: [],
      } as unknown as AssuranceTicketComment;
    }

    async function openTicketAndComment(text: string) {
      mockPermissions.current = new Set([
        AccessPermissionKey.ASSURANCE_TICKETS_READ,
        AccessPermissionKey.ASSURANCE_TICKETS_MANAGE,
      ]);
      (assuranceApi.tickets.list as jest.Mock).mockResolvedValue({ data: [ticket] });
      (assuranceApi.tickets.get as jest.Mock).mockResolvedValue(ticket);
      (assuranceApi.tickets.listComments as jest.Mock).mockResolvedValue([]);
      (assuranceApi.tickets.listTimeline as jest.Mock).mockResolvedValue([]);
      const user = userEvent.setup();
      render(<SubscriberSupportTab subscriber={subscriber} />);

      await user.click(await screen.findByRole('button', { name: /^Abrir ticket TK-1/u }));
      const box = await screen.findByLabelText('Nuevo comentario');
      await waitFor(() => expect(assuranceApi.tickets.listComments).toHaveBeenCalledTimes(1));
      await user.type(box, text);
      await user.click(screen.getByRole('button', { name: 'Agregar comentario' }));
    }

    it('guarda el comentario y recarga el listado y el ticket abierto', async () => {
      (assuranceApi.tickets.submitComment as jest.Mock).mockResolvedValue(
        comment('c1', 'Se cambió la ONU'),
      );
      await openTicketAndComment('Se cambió la ONU');
      (assuranceApi.tickets.listComments as jest.Mock).mockResolvedValue([
        comment('c1', 'Se cambió la ONU'),
      ]);

      await waitFor(() =>
        expect(assuranceApi.tickets.submitComment).toHaveBeenCalledWith(
          'ticket-1',
          expect.objectContaining({ body: 'Se cambió la ONU' }),
        ),
      );
      expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
      // Listado (clip y «Adjuntos (N)») y ticket abierto se releen; sin sondeo.
      await waitFor(() => expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(2));
      expect(assuranceApi.tickets.get).toHaveBeenCalledTimes(2);
      expect(assuranceApi.tickets.listComments).toHaveBeenCalledTimes(2);
      expect(assuranceApi.tickets.listTimeline).toHaveBeenCalledTimes(2);
    });

    it('muestra el motivo de la API cuando rechaza un archivo y no recarga', async () => {
      (assuranceApi.tickets.submitComment as jest.Mock).mockRejectedValue(
        Object.assign(new Error('El archivo acta.exe no es un tipo permitido.'), {
          status: 400,
          code: 'TICKET_ATTACHMENT_REJECTED',
        }),
      );
      await openTicketAndComment('Con archivo');

      expect(
        await screen.findByText('El archivo acta.exe no es un tipo permitido.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Cambios guardados.')).not.toBeInTheDocument();
      expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(1);
      expect(assuranceApi.tickets.get).toHaveBeenCalledTimes(1);
    });

    it('muestra el mensaje genérico ante otro error', async () => {
      (assuranceApi.tickets.submitComment as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Internal'), { status: 500, code: 'INTERNAL_ERROR' }),
      );
      await openTicketAndComment('Texto');

      expect(
        await screen.findByText('No fue posible guardar los cambios. Intenta de nuevo.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Internal')).not.toBeInTheDocument();
      expect(assuranceApi.tickets.list).toHaveBeenCalledTimes(1);
    });
  });
});
