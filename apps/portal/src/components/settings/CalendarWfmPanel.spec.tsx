import { render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { CalendarWfmPanel } from './CalendarWfmPanel';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('./WfmOperatingHoursManager', () => ({
  WfmOperatingHoursManager: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="wfm-operating-hours-manager">
      {canEdit ? 'Ventana técnica editable' : 'Ventana técnica solo lectura'}
    </div>
  ),
}));

describe('CalendarWfmPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders WfmOperatingHoursManager with edit access for ADMIN', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    render(<CalendarWfmPanel />);

    expect(screen.getByTestId('wfm-operating-hours-manager')).toBeInTheDocument();
    expect(screen.getByText('Ventana técnica editable')).toBeInTheDocument();
  });

  it('renders WfmOperatingHoursManager in read-only mode for NOC', () => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-2', role: UserRole.NOC },
      isLoading: false,
    });

    render(<CalendarWfmPanel />);

    expect(screen.getByTestId('wfm-operating-hours-manager')).toBeInTheDocument();
    expect(screen.getByText('Ventana técnica solo lectura')).toBeInTheDocument();
  });

  it('renders in read-only mode when no user is resolved', () => {
    useAuthMock.mockReturnValue({
      user: null,
      isLoading: false,
    });

    render(<CalendarWfmPanel />);

    expect(screen.getByTestId('wfm-operating-hours-manager')).toBeInTheDocument();
    expect(screen.getByText('Ventana técnica solo lectura')).toBeInTheDocument();
  });
});
