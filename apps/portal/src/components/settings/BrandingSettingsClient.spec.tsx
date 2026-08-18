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

  it('should render the named loading state while the profile is pending', () => {
    const { tenantSelfApi } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: { getProfile: jest.Mock };
    };
    tenantSelfApi.getProfile.mockReturnValue(new Promise(() => undefined));

    render(<BrandingSettingsClient />);

    expect(screen.getByText('Cargando identidad visual de la empresa')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('should show the session unavailable state without an authenticated user', async () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: false });

    render(<BrandingSettingsClient />);

    expect(
      await screen.findByText('No fue posible resolver la sesión del portal.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Error al cargar la vista')).toBeInTheDocument();
  });

  it('should map an expired session api error to friendly copy', async () => {
    const { tenantSelfApi, ApiError } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: { getProfile: jest.Mock };
      ApiError: new (status: number, message: string) => Error;
    };
    tenantSelfApi.getProfile.mockRejectedValue(new ApiError(401, 'unauthorized'));

    render(<BrandingSettingsClient />);

    expect(
      await screen.findByText('Tu sesión expiró. Inicia sesión nuevamente.'),
    ).toBeInTheDocument();
  });

  it('should map a forbidden api error to friendly copy', async () => {
    const { tenantSelfApi, ApiError } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: { getProfile: jest.Mock };
      ApiError: new (status: number, message: string) => Error;
    };
    tenantSelfApi.getProfile.mockRejectedValue(new ApiError(403, 'forbidden'));

    render(<BrandingSettingsClient />);

    expect(
      await screen.findByText('No tienes permisos para consultar la marca de la empresa.'),
    ).toBeInTheDocument();
  });

  it('should surface the api message for other api errors and fallback copy for unknown errors', async () => {
    const { tenantSelfApi, ApiError } = jest.requireMock('@/lib/api-client') as {
      tenantSelfApi: { getProfile: jest.Mock };
      ApiError: new (status: number, message: string) => Error;
    };

    tenantSelfApi.getProfile.mockRejectedValueOnce(new ApiError(500, 'Fallo interno temporal'));
    const { unmount } = render(<BrandingSettingsClient />);
    expect(await screen.findByText('Fallo interno temporal')).toBeInTheDocument();
    unmount();

    tenantSelfApi.getProfile.mockRejectedValueOnce(new Error('Fallo de red'));
    render(<BrandingSettingsClient />);
    expect(
      await screen.findByText('No fue posible cargar la configuración de marca.'),
    ).toBeInTheDocument();
  });
});
