import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentActivityPanel, auditActionLabel, auditEntityTypeLabel } from './RecentActivityPanel';

const auditList = jest.fn();

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
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

describe('RecentActivityPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('traduce action y entityType a vocabulario amigable', async () => {
    auditList.mockResolvedValue([
      {
        id: '1',
        tenantId: 't-1',
        userId: 'u-1',
        action: 'MFA_ENABLED',
        entityType: 'User',
        entityId: 'u-1',
        oldValue: null,
        newValue: null,
        ipAddress: null,
        userAgent: null,
        requestId: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<RecentActivityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Verificación en dos pasos activada en usuario')).toBeInTheDocument();
    });
    expect(screen.queryByText('MFA_ENABLED')).not.toBeInTheDocument();
    expect(screen.queryByText(/\ben User\b/)).not.toBeInTheDocument();
  });

  it('vacío indica siguiente acción', async () => {
    auditList.mockResolvedValue([]);

    render(<RecentActivityPanel />);

    await waitFor(() => {
      expect(screen.getByText('Sin cambios recientes')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Ir a configuración/i })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
  });

  it('error ofrece reintento por bloque', async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireMock('@/lib/api-client') as {
      ApiError: new (status: number, message: string) => Error;
    };
    auditList.mockRejectedValueOnce(new ApiError(500, 'down')).mockResolvedValueOnce([]);

    render(<RecentActivityPanel />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reintentar/i }));

    await waitFor(() => {
      expect(screen.getByText('Sin cambios recientes')).toBeInTheDocument();
    });
    expect(auditList).toHaveBeenCalledTimes(2);
  });

  it('helpers de vocabulario cubren enums frecuentes', () => {
    expect(auditActionLabel('CREATE')).toBe('Creación');
    expect(auditActionLabel('UNKNOWN_X')).toBe('Cambio registrado');
    expect(auditEntityTypeLabel('AccessProfile')).toBe('perfil de acceso');
    expect(auditEntityTypeLabel('FooBar')).toBe('registro');
  });
});
