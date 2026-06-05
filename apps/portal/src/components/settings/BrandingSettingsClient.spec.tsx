import { render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { BrandingSettingsClient } from './BrandingSettingsClient';

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('./BrandingForm', () => ({
  BrandingForm: () => <div>Formulario de marca</div>,
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  tenantSelfApi: {
    getProfile: jest.fn(),
  },
}));

function buildProfile() {
  return {
    id: 'tenant-1',
    name: 'ISP Demo',
    slug: 'isp-demo',
    status: 'ACTIVE' as const,
    contactEmail: 'ops@demo.co',
    legalName: null,
    nit: null,
    nitDv: null,
    city: null,
    department: null,
    countryCode: 'CO',
    phone: null,
    website: null,
    createdAt: '2026-04-30T00:00:00.000Z',
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
    showTenantName: true,
    brandingProductName: null,
    brandingSurfaceName: null,
    brandingMetadataTitle: null,
    brandingMetadataDescription: null,
  };
}

describe('BrandingSettingsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({
      user: { id: 'user-1', role: UserRole.ADMIN },
      isLoading: false,
    });

    const { tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: { getProfile: jest.Mock };
    };

    tenantSelfApi.getProfile.mockResolvedValue(buildProfile());
  });

  it('should render normalized enterprise copy without internal wording', async () => {
    render(<BrandingSettingsClient />);

    expect(await screen.findByText('Formulario de marca')).toBeInTheDocument();
    expect(screen.getByText('Marca')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Administra la identidad visual, los activos y los textos públicos del portal empresarial.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tenant/i)).not.toBeInTheDocument();
  });
});
