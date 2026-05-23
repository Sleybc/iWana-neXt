import { render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { FieldOperationsSettingsClient } from './FieldOperationsSettingsClient';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('FieldOperationsSettingsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the despacho técnico page with link to calendar for admins', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<FieldOperationsSettingsClient />);

    expect(screen.getByText('Despacho técnico')).toBeInTheDocument();
    expect(screen.getByText('Ir a Calendario operativo y jornadas →')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ir a Calendario operativo y jornadas →' }),
    ).toHaveAttribute('href', '/dashboard/settings/calendar');
  });

  it('should show an unavailable session state when no portal session is resolved', () => {
    useAuthMock.mockReturnValue({
      user: null,
      isLoading: false,
    });

    render(<FieldOperationsSettingsClient />);

    expect(screen.getByText('Sesión no disponible')).toBeInTheDocument();
    expect(screen.getByText('Vista temporalmente no disponible')).toBeInTheDocument();
  });
});
