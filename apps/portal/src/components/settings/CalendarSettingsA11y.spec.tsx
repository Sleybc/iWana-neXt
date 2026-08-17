import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { UserRole } from '@iwana/shared';
import { BusinessHoursWeekday } from '@iwana/shared';
import { BusinessHoursWeekEditor, type BusinessHourDay } from './BusinessHoursWeekEditor';
import { CalendarSettingsClient } from './CalendarSettingsClient';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  organizationApi: {
    getCompanyHours: jest.fn(),
    list: jest.fn(),
    getExceptions: jest.fn(),
    get: jest.fn(),
    replaceCompanyHours: jest.fn(),
    replaceBusinessHours: jest.fn(),
    clearSiteOverride: jest.fn(),
    createException: jest.fn(),
    deleteException: jest.fn(),
  },
}));

jest.mock('./OperationalEventualitiesPanel', () => ({
  OperationalEventualitiesPanel: () => (
    <div data-testid="operational-eventualities-panel">
      <p>Paso 4 · Cambios puntuales</p>
    </div>
  ),
}));

function mockMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_WEEK: BusinessHourDay[] = [
  { weekday: BusinessHoursWeekday.MONDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.TUESDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.WEDNESDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.THURSDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.FRIDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.SATURDAY, isOpen: false, opensAt: null, closesAt: null },
  { weekday: BusinessHoursWeekday.SUNDAY, isOpen: false, opensAt: null, closesAt: null },
];

const mockSites = [
  { id: 'site-1', name: 'Sede centro', code: 'CENTRO', capabilities: [], isActive: true },
];

const mockExceptions = [
  {
    id: 'exc-1',
    exceptionDate: '2026-01-01',
    name: 'Año nuevo',
    isOpen: false,
    isRecurring: true,
    opensAt: null,
    closesAt: null,
    organizationSiteId: null,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('a11y WCAG 2.2 AA — calendario operativo (jest-axe)', () => {
  beforeEach(() => {
    const { organizationApi } = jest.requireMock('@/lib/api-client') as {
      organizationApi: {
        getCompanyHours: jest.Mock;
        list: jest.Mock;
        getExceptions: jest.Mock;
        get: jest.Mock;
      };
    };

    jest.clearAllMocks();
    mockMatchMedia();

    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    organizationApi.getCompanyHours.mockResolvedValue([
      { weekday: 'MONDAY' as const, isOpen: true, opensAt: '08:00', closesAt: '18:00' },
    ]);
    organizationApi.list.mockResolvedValue({
      data: mockSites,
      meta: {
        nextCursor: null,
        total: mockSites.length,
        totalIsEstimate: false,
        page: 1,
        limit: 100,
        totalPages: 1,
        hasMore: false,
        mode: 'page',
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
    organizationApi.getExceptions.mockResolvedValue(mockExceptions);
    organizationApi.get.mockResolvedValue({
      ...mockSites[0],
      siteType: 'OFFICE',
      address: null,
      municipality: null,
      department: null,
      isPrimary: true,
      businessHours: [],
      businessHoursResolved: [],
      businessHoursMode: 'BASE' as const,
    });
  });

  it('BusinessHoursWeekEditor editable sin violaciones de axe', async () => {
    const { container } = render(
      <BusinessHoursWeekEditor days={FULL_WEEK} canEdit onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bh-open-monday')).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('BusinessHoursWeekEditor en modo solo consulta sin violaciones de axe', async () => {
    const { container } = render(
      <BusinessHoursWeekEditor days={FULL_WEEK} canEdit={false} onChange={jest.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Lunes')).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('CalendarSettingsClient completo sin violaciones de axe', async () => {
    const { container } = render(<CalendarSettingsClient />);

    // Espera a que carguen los datos de los pasos 1-3 (paso 4 mockeado)
    await waitFor(() => {
      expect(screen.getByText('Estado operativo')).toBeInTheDocument();
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
