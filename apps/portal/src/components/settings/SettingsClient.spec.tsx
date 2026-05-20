import { fireEvent, render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { SettingsSubTabs } from './SettingsSubTabs';
import { SettingsClient } from './SettingsClient';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('./WfmOperatingHoursManager', () => ({
  WfmOperatingHoursManager: ({ canEdit }: { canEdit: boolean }) => (
    <div>Horarios operativos {canEdit ? 'editable' : 'solo lectura'}</div>
  ),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
  tenantSelfApi: {
    getProfile: jest.fn(),
    getSettings: jest.fn(),
  },
  dashboardApi: {
    getSummary: jest.fn(),
  },
}));

describe('SettingsSubTabs', () => {
  it('should render branding sub-sections and switch active item', () => {
    const onChange = jest.fn();

    render(
      <SettingsSubTabs
        items={[
          { id: 'identity', label: 'Identidad visual' },
          { id: 'plans', label: 'Planes' },
          { id: 'products', label: 'Productos' },
          { id: 'coverage', label: 'Cobertura' },
        ]}
        activeTab="identity"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Planes' }));
    expect(onChange).toHaveBeenCalledWith('plans');
  });
});

describe('SettingsClient', () => {
  const mockProfile = {
    id: 'tenant-1',
    name: 'Test Company',
    slug: 'test-company',
    status: 'ACTIVE' as const,
    contactEmail: 'test@test.com',
    legalName: 'Test Company S.A.S.',
    nit: '123456789',
    nitDv: '1',
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: '+57300123456',
    website: null,
    createdAt: new Date().toISOString(),
    logoLightUrl: null,
    logoLightAssetId: null,
    logoDarkUrl: null,
    logoDarkAssetId: null,
    sealLightUrl: null,
    sealLightAssetId: null,
    sealDarkUrl: null,
    sealDarkAssetId: null,
    faviconLightUrl: null,
    faviconLightAssetId: null,
    faviconDarkUrl: null,
    faviconDarkAssetId: null,
    loginBackgroundLightUrl: null,
    loginBackgroundLightAssetId: null,
    loginBackgroundDarkUrl: null,
    loginBackgroundDarkAssetId: null,
  };

  const mockSettings = {
    timezone: 'America/Bogota',
    currency: 'COP',
    language: 'es-CO',
    country: 'Colombia',
    fiberInstallationThresholdMeters: 100,
    features: {
      billing: false,
      mfa_required_all: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', name: 'Test User', email: 'user@test.com', role: UserRole.ADMIN },
      isLoading: false,
    });

    const { tenantSelfApi, dashboardApi } = jest.requireMock('@/lib/api-client');
    tenantSelfApi.getProfile.mockResolvedValue(mockProfile);
    tenantSelfApi.getSettings.mockResolvedValue(mockSettings);
    dashboardApi.getSummary.mockResolvedValue({ alerts: [] });
  });

  it('should render branding form when marca tab is active', async () => {
    render(<SettingsClient />);
    await screen.findByText('Guardar perfil empresarial');

    fireEvent.click(screen.getByRole('tab', { name: /Marca/i }));

    expect(await screen.findByText('Guardar identidad visual')).toBeInTheDocument();
  });

  it('should render general and operations sections with their primary actions', async () => {
    render(<SettingsClient />);

    expect(await screen.findByText('Guardar perfil empresarial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Operación/i }));

    expect(await screen.findByText('Guardar configuración operativa')).toBeInTheDocument();
    expect(screen.getByText('Horarios operativos editable')).toBeInTheDocument();
  });
});
