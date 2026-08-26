import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpedienteSchedulingActions } from './ExpedienteSchedulingActions';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';
import type { CrmInstallationFieldWork } from '@/components/scheduling/visit-request-origin-orchestration';
import { useCrmInstallationFieldWork } from './useCrmInstallationFieldWork';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createCrmVisitRequestAndRoute: jest.fn(),
}));

jest.mock('./useCrmInstallationFieldWork', () => ({
  useCrmInstallationFieldWork: jest.fn(),
}));

const createCrmVisitRequestAndRouteMock = createCrmVisitRequestAndRoute as jest.MockedFunction<
  typeof createCrmVisitRequestAndRoute
>;
const useCrmInstallationFieldWorkMock = useCrmInstallationFieldWork as jest.MockedFunction<
  typeof useCrmInstallationFieldWork
>;

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');

  return {
    ...actual,
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  };
});

const emptyFieldWork: CrmInstallationFieldWork = {
  kind: 'none',
  visitRequestId: null,
  scheduleEventId: null,
  activeEventStatus: null,
  scheduledStartAt: null,
  assignedUserId: null,
  href: null,
};

describe('ExpedienteSchedulingActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCrmInstallationFieldWorkMock.mockReturnValue({
      fieldWork: emptyFieldWork,
      isLoading: false,
      error: null,
      load: jest.fn().mockResolvedValue(emptyFieldWork),
    });
  });

  it('offers schedule-now and send-to-pending from CRM', async () => {
    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
        municipality="Bogotá"
        address="Cra 1 # 2-3"
        sector="Chapinero"
      />,
    );

    expect(screen.getByRole('button', { name: 'Agendar ahora' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar a pendientes' })).toBeInTheDocument();
  });

  it('routes through visit-request orchestration when scheduling now', async () => {
    const user = userEvent.setup();
    createCrmVisitRequestAndRouteMock.mockResolvedValue({
      visitRequest: { id: 'vr-001' } as never,
      href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    });

    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
        municipality="Bogotá"
        address="Cra 1 # 2-3"
        sector="Chapinero"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Agendar ahora' }));

    expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expedienteId: '550e8400-e29b-41d4-a716-446655440000',
        customerLabel: 'Cliente Demo',
        nextAction: 'schedule-now',
        municipality: 'Bogotá',
        address: 'Cra 1 # 2-3',
        sector: 'Chapinero',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    );
  });

  it('routes CRM requests to the pending inbox when requested', async () => {
    const user = userEvent.setup();
    createCrmVisitRequestAndRouteMock.mockResolvedValue({
      visitRequest: { id: 'vr-002' } as never,
      href: '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-002',
    });

    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Enviar a pendientes' }));

    expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({ nextAction: 'send-to-pending' }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-002',
    );
  });

  it('shows the scheduled E1 card instead of create buttons', async () => {
    const user = userEvent.setup();
    useCrmInstallationFieldWorkMock.mockReturnValue({
      fieldWork: {
        kind: 'scheduled',
        visitRequestId: 'vr-scheduled',
        scheduleEventId: 'evt-1',
        activeEventStatus: 'SCHEDULED',
        scheduledStartAt: '2026-08-10T14:30:00.000Z',
        assignedUserId: 'tech-1',
        href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-scheduled',
      },
      isLoading: false,
      error: null,
      load: jest.fn().mockResolvedValue(emptyFieldWork),
    });

    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
      />,
    );

    expect(screen.getByText('Visita ya coordinada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agendar ahora' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver la visita agendada' }));
    expect(mockPush).toHaveBeenCalledWith(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-scheduled',
    );
  });

  it('opens additional mode and submits schedule-now with isAdditional', async () => {
    const user = userEvent.setup();
    useCrmInstallationFieldWorkMock.mockReturnValue({
      fieldWork: {
        kind: 'in_progress',
        visitRequestId: 'vr-progress',
        scheduleEventId: 'evt-2',
        activeEventStatus: 'IN_PROGRESS',
        scheduledStartAt: '2026-08-10T09:00:00.000Z',
        assignedUserId: 'tech-2',
        href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-progress',
      },
      isLoading: false,
      error: null,
      load: jest.fn().mockResolvedValue(emptyFieldWork),
    });
    createCrmVisitRequestAndRouteMock.mockResolvedValue({
      visitRequest: { id: 'vr-additional' } as never,
      href: '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-additional',
    });

    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
      />,
    );

    expect(screen.getByText('Visita en curso')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coordinar otra visita' }));
    await user.type(
      screen.getByLabelText('Motivo de la segunda visita'),
      'Se requiere segunda visita',
    );
    await user.click(screen.getByRole('button', { name: 'Agendar de todas formas' }));

    await waitFor(() => {
      expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nextAction: 'schedule-now',
          isAdditional: true,
          additionalReason: 'Se requiere segunda visita',
        }),
      );
    });
  });

  it('shows pending inbox E1 card', () => {
    useCrmInstallationFieldWorkMock.mockReturnValue({
      fieldWork: {
        kind: 'pending_inbox',
        visitRequestId: 'vr-pending',
        scheduleEventId: null,
        activeEventStatus: null,
        scheduledStartAt: null,
        assignedUserId: null,
        href: '/dashboard/scheduling/pending-visits?selectedVisitRequestId=vr-pending',
      },
      isLoading: false,
      error: null,
      load: jest.fn().mockResolvedValue(emptyFieldWork),
    });

    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
      />,
    );

    expect(screen.getByText('Solicitud en bandeja')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir en pendientes' })).toBeInTheDocument();
  });
});
