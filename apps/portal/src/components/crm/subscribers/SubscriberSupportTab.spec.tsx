import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { AssuranceTicket, SubscriberRecord } from '@/lib/api-client';
import { assuranceApi, usersApi, wfmApi } from '@/lib/api-client';
import { SubscriberSupportTab } from './SubscriberSupportTab';

const mockPermissions = { current: new Set<AccessPermissionKey>() };

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({
    hasPermission: (permission: AccessPermissionKey) => mockPermissions.current.has(permission),
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/api-client', () => ({
  assuranceApi: {
    tickets: {
      list: jest.fn(),
      get: jest.fn(),
      listComments: jest.fn(),
      listTimeline: jest.fn(),
      create: jest.fn(),
      addComment: jest.fn(),
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
});
