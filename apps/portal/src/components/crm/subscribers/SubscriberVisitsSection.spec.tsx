import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ScheduleEventStatus,
  VisitRequestStatus,
  WfmWorkType,
  WorkOrderSourceContext,
} from '@iwana/shared';
import type { SubscriberRecord, WfmScheduleEvent, WfmVisitRequest } from '@/lib/api-client';
import { wfmApi } from '@/lib/api-client';
import { SubscriberVisitsSection } from './SubscriberVisitsSection';

jest.mock('@/lib/api-client', () => ({
  wfmApi: {
    visitRequests: { list: jest.fn() },
    events: { list: jest.fn() },
  },
}));

const subscriber = {
  id: '8d4943a8-a7d8-4053-942f-a99a0dd16603',
  privacyRestricted: false,
} as SubscriberRecord;

function visitRequest(
  overrides: Partial<WfmVisitRequest> & Pick<WfmVisitRequest, 'id' | 'status'>,
): WfmVisitRequest {
  const { id, status, ...rest } = overrides;
  return {
    tenantId: 'tenant-a',
    id,
    status,
    originContext: WorkOrderSourceContext.CRM,
    originRef: 'exp-1',
    originLabel: null,
    workType: WfmWorkType.SUPPORT,
    priority: 'NORMAL',
    title: 'Visita sintética',
    description: null,
    requestedWindowStartAt: null,
    requestedWindowEndAt: null,
    slaDueAt: null,
    address: 'Carrera 1',
    municipality: null,
    sector: null,
    latitude: null,
    longitude: null,
    expedienteId: 'exp-1',
    subscriberId: subscriber.id,
    ticketId: null,
    contractId: null,
    scheduleEventId: null,
    workOrderId: null,
    requestedByUserId: 'user-a',
    scheduledByUserId: null,
    scheduledAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancelReason: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    deletedAt: null,
    ...rest,
  } as WfmVisitRequest;
}

function scheduleEvent(
  overrides: Partial<WfmScheduleEvent> & Pick<WfmScheduleEvent, 'id' | 'status'>,
): WfmScheduleEvent {
  const { id, status, ...rest } = overrides;
  return {
    id,
    tenantId: 'tenant-a',
    workOrderId: null,
    type: WfmWorkType.TECHNICAL_VISIT,
    status,
    title: 'Evento sintético',
    description: null,
    scheduledStartAt: '2026-10-22T14:00:00.000Z',
    scheduledEndAt: '2026-10-22T15:00:00.000Z',
    assignedUserId: 'user-a',
    assignedTeamId: null,
    address: 'Carrera 2',
    municipality: null,
    sector: null,
    latitude: null,
    longitude: null,
    expedienteId: 'exp-2',
    subscriberId: subscriber.id,
    organizationSiteId: null,
    ticketId: null,
    contractId: null,
    createdBy: 'user-a',
    updatedBy: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    deletedAt: null,
    ...rest,
  } as WfmScheduleEvent;
}

describe('SubscriberVisitsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no consulta WFM si falta permiso de lectura', () => {
    render(<SubscriberVisitsSection subscriber={subscriber} canRead={false} />);

    expect(screen.getByText('No tienes acceso a las visitas')).toBeInTheDocument();
    expect(wfmApi.visitRequests.list).not.toHaveBeenCalled();
    expect(wfmApi.events.list).not.toHaveBeenCalled();
  });

  it('filtra visitas de tickets y filas duplicadas, y abre el detalle de solo lectura', async () => {
    const pending = visitRequest({ id: 'visit-pending', status: VisitRequestStatus.PENDING });
    const duplicate = visitRequest({
      id: 'visit-duplicate',
      status: VisitRequestStatus.SCHEDULED,
      scheduleEventId: 'event-linked',
    });
    const ticketOrigin = visitRequest({
      id: 'visit-from-ticket',
      status: VisitRequestStatus.PENDING,
      originContext: WorkOrderSourceContext.ASSURANCE,
      ticketId: 'ticket-1',
    });
    const linkedEvent = scheduleEvent({
      id: 'event-linked',
      status: ScheduleEventStatus.SCHEDULED,
    });
    const ticketEvent = scheduleEvent({
      id: 'event-from-ticket',
      status: ScheduleEventStatus.SCHEDULED,
      ticketId: 'ticket-1',
    });
    (wfmApi.visitRequests.list as jest.Mock).mockResolvedValue({
      items: [ticketOrigin, duplicate, pending],
    });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({
      data: [ticketEvent, linkedEvent],
    });

    render(<SubscriberVisitsSection subscriber={subscriber} canRead />);

    const list = await screen.findByRole('list', { name: 'Visitas vinculadas' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName('Ver detalle de visita: Soporte, Pendiente');
    expect(rows[1]).toHaveAccessibleName('Ver detalle de visita: Visita técnica, Programado');
    expect(wfmApi.visitRequests.list).toHaveBeenCalledWith({
      subscriberId: subscriber.id,
      page: 1,
      limit: 100,
      scope: 'all',
    });
    expect(wfmApi.events.list).toHaveBeenCalledWith({
      subscriberId: subscriber.id,
      page: 1,
      limit: 100,
    });

    fireEvent.click(rows[0]!);
    expect(
      await screen.findByRole('heading', { name: 'Detalle de la visita' }),
    ).toBeInTheDocument();
    const closeButton = screen.getByRole('button', { name: 'Cerrar detalle de la visita' });
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(screen.getByText('Expediente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir en Agendamiento' })).toHaveAttribute(
      'href',
      expect.stringContaining('visitRequestId=visit-pending'),
    );
    expect(
      screen.queryByRole('button', { name: /Editar|Cancelar visita/ }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Detalle de la visita' }),
      ).not.toBeInTheDocument(),
    );
    expect(rows[0]).toHaveFocus();
  });

  it('reintenta ambas consultas de Visitas y muestra el vacío de producto', async () => {
    (wfmApi.visitRequests.list as jest.Mock)
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce({ items: [] });
    (wfmApi.events.list as jest.Mock).mockResolvedValue({ data: [] });

    render(<SubscriberVisitsSection subscriber={subscriber} canRead />);

    expect(await screen.findByText('No fue posible cargar las visitas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Este suscriptor no tiene visitas')).toBeInTheDocument();
    await waitFor(() => expect(wfmApi.visitRequests.list).toHaveBeenCalledTimes(2));
    expect(wfmApi.events.list).toHaveBeenCalledTimes(2);
  });
});
