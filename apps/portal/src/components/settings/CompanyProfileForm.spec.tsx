import { render, screen } from '@testing-library/react';
import { CompanyProfileForm } from './CompanyProfileForm';
import type { TenantSelf } from '@/lib/api-client';

const updateMeProfileMock = jest.fn();

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    updateMeProfile: (...args: unknown[]) => updateMeProfileMock(...args),
  },
}));

function buildProfile(): TenantSelf {
  return {
    id: 'tenant-1',
    name: 'ISP Demo',
    slug: 'isp-demo',
    status: 'ACTIVE' as const,
    contactEmail: 'admin@isp-demo.com',
    legalName: 'ISP Demo S.A.S.',
    nit: '900123456',
    nitDv: '1',
    city: 'Bogotá',
    department: 'Cundinamarca',
    countryCode: 'CO',
    phone: '+573001112233',
    website: 'https://empresa.co',
    createdAt: '2026-05-21T00:00:00.000Z',
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

describe('CompanyProfileForm', () => {
  beforeEach(() => {
    updateMeProfileMock.mockReset();
  });

  it('should render normalized enterprise copy in editable mode', () => {
    render(<CompanyProfileForm profile={buildProfile()} canEdit={true} onUpdated={jest.fn()} />);

    expect(screen.getByText('Perfil empresarial')).toBeInTheDocument();
    expect(screen.getByText('Datos legales y de contacto de la empresa.')).toBeInTheDocument();
    expect(screen.getByText('Perfil y contacto')).toBeInTheDocument();
    expect(screen.getByText('Identificación y ubicación')).toBeInTheDocument();
    expect(
      screen.getByText('Solo se guardan los campos que puedes editar en esta sección.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar perfil empresarial' })).toBeInTheDocument();
  });

  it('should render read-only guidance without save action', () => {
    render(<CompanyProfileForm profile={buildProfile()} canEdit={false} onUpdated={jest.fn()} />);

    expect(
      screen.getByText('Tu rol tiene acceso solo lectura sobre esta sección.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Guardar perfil empresarial' }),
    ).not.toBeInTheDocument();
  });
});
