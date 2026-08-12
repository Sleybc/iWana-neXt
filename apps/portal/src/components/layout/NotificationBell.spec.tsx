import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from './NotificationBell';
import { __resetAuditFeedCacheForTests } from '@/lib/audit-feed-cache';

const useAuthMock = jest.fn();
const auditList = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      Object.setPrototypeOf(this, MockApiError.prototype);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  return {
    ApiError: MockApiError,
    auditApi: {
      list: (...args: unknown[]) => auditList(...args),
    },
  };
});

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAuditFeedCacheForTests();
    useAuthMock.mockReturnValue({
      user: { id: 'u-1', role: 'ADMIN', tenantId: 't-1', displayName: 'Admin' },
      isLoading: false,
    });
    auditList.mockResolvedValue([
      {
        id: 'a-1',
        tenantId: 't-1',
        userId: 'u-1',
        actor: { id: 'u-1', type: 'tenant', displayName: 'Ana Operaciones' },
        action: 'MFA_ENABLED',
        entityType: 'User',
        entityId: 'entity-uuid-should-not-render',
        oldValue: null,
        newValue: null,
        ipAddress: null,
        userAgent: null,
        requestId: null,
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  it('muestra vocabulario amigable y oculta enum e identificador', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);

    await waitFor(() => {
      expect(auditList).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: 'Notificaciones' }));
    expect(screen.getByText('Verificación en dos pasos activada · usuario')).toBeInTheDocument();
    expect(screen.queryByText('MFA_ENABLED')).not.toBeInTheDocument();
    expect(screen.queryByText(/entity-uuid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ID:/i)).not.toBeInTheDocument();
  });

  it('usa warning/error y nunca lima como señal de avisos', async () => {
    render(<NotificationBell />);

    await waitFor(() => {
      expect(auditList).toHaveBeenCalledTimes(1);
    });

    const trigger = screen.getByRole('button', { name: 'Notificaciones' });
    await waitFor(() => {
      expect(trigger.innerHTML).toMatch(/bg-amber-500|text-amber-600/);
    });
    expect(trigger.innerHTML).not.toMatch(/bg-iwana-secondary/);
    expect(trigger.innerHTML).not.toMatch(/text-iwana-secondary/);
  });

  it('marca error cuando el historial falla, sin lima de recuento', async () => {
    auditList.mockRejectedValue(new Error('boom'));
    render(<NotificationBell />);

    const trigger = screen.getByRole('button', { name: 'Notificaciones' });
    await waitFor(() => {
      expect(trigger.innerHTML).toMatch(/bg-error-500|text-error-600/);
    });
    expect(trigger.innerHTML).not.toMatch(/bg-iwana-secondary/);
  });

  it('no pide historial cuando el perfil no ve la campana', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'u-2', role: 'SUPPORT', tenantId: 't-1', displayName: 'Soporte' },
      isLoading: false,
    });

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
    });
    expect(auditList).not.toHaveBeenCalled();
  });
});
