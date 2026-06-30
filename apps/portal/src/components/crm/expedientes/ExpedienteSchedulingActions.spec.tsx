import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpedienteSchedulingActions } from './ExpedienteSchedulingActions';
import { createCrmVisitRequestAndRoute } from '@/components/scheduling/visit-request-origin-orchestration';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/scheduling/visit-request-origin-orchestration', () => ({
  createCrmVisitRequestAndRoute: jest.fn(),
}));

const createCrmVisitRequestAndRouteMock = createCrmVisitRequestAndRoute as jest.MockedFunction<
  typeof createCrmVisitRequestAndRoute
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

describe('ExpedienteSchedulingActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers schedule-now and send-to-pending from CRM', async () => {
    render(
      <ExpedienteSchedulingActions
        expedienteId="550e8400-e29b-41d4-a716-446655440000"
        customerLabel="Cliente Demo"
        municipality="Bogotá"
        address="Cra 1 # 2-3"
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
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Agendar ahora' }));

    expect(createCrmVisitRequestAndRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expedienteId: '550e8400-e29b-41d4-a716-446655440000',
        customerLabel: 'Cliente Demo',
        nextAction: 'schedule-now',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      '/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=vr-001',
    );
  });
});
