import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrandingForm } from './BrandingForm';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { validateBrandingFileForUpload } from '@/lib/branding-validation';

jest.mock('@/lib/api-client', () => ({
  tenantSelfApi: {
    updateBranding: jest.fn(),
    uploadBrandingAsset: jest.fn(),
    getProfile: jest.fn(),
  },
}));

jest.mock('@/components/layout/TenantSeal', () => ({
  TenantSeal: ({ name }: { name: string }) => <div data-testid="tenant-seal">{name}</div>,
}));

jest.mock('@/lib/branding-validation', () => ({
  BRANDING_SLOT_RULES: {
    logo: {
      allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
      helpText: 'regla logo',
    },
    seal: {
      allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
      helpText: 'regla seal',
    },
    favicon: {
      allowedMimes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
      helpText: 'regla favicon',
    },
    login_background: {
      allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
      helpText: 'regla login_background',
    },
  },
  validateBrandingFileForUpload: jest.fn(async () => null),
}));

const tenantSelfApiMock = tenantSelfApi as unknown as {
  updateBranding: jest.Mock;
  uploadBrandingAsset: jest.Mock;
  getProfile: jest.Mock;
};

const validateBrandingFileForUploadMock = validateBrandingFileForUpload as jest.Mock;

function buildProfile(overrides: Partial<TenantSelf> = {}): TenantSelf {
  return {
    id: 'tenant-1',
    name: 'ISP Demo',
    slug: 'isp-demo',
    status: 'ACTIVE',
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
    ...overrides,
  };
}

async function expandIdentityAccordion(): Promise<void> {
  const identityToggle = screen.getByRole('button', { name: /Nombres e identidad/i });

  if (identityToggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(identityToggle);
  }

  await waitFor(() => {
    expect(screen.getByLabelText('Producto')).toBeVisible();
  });
}

describe('BrandingForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateBrandingFileForUploadMock.mockResolvedValue(null);
  });

  it('envia payload incremental de URL externa al guardar branding', async () => {
    const updatedProfile = buildProfile({
      sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
      sealLightAssetId: null,
    });
    tenantSelfApiMock.updateBranding.mockResolvedValue(updatedProfile);

    const onUpdated = jest.fn();
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={onUpdated} />);

    fireEvent.change(screen.getByLabelText('URL HTTPS para sello compacto · variante clara'), {
      target: { value: 'https://cdn.demo.co/branding/seal-light.svg' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar marca' }));

    await waitFor(() => {
      expect(tenantSelfApiMock.updateBranding).toHaveBeenCalledWith({
        sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
        sealLightAssetId: null,
      });
    });

    expect(onUpdated).toHaveBeenCalledWith(updatedProfile);
    expect(screen.getAllByText('La marca se actualizó correctamente.').length).toBeGreaterThan(0);
  });

  it('sube activo del slot y refresca perfil para aplicar la asignacion', async () => {
    tenantSelfApiMock.uploadBrandingAsset.mockResolvedValue({ id: 'asset-1' });

    const updatedProfile = buildProfile({
      sealLightUrl: 'https://cdn.demo.co/branding/seal-light-uploaded.svg',
      sealLightAssetId: 'asset-1',
    });
    tenantSelfApiMock.getProfile.mockResolvedValue(updatedProfile);

    const onUpdated = jest.fn();
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={onUpdated} />);

    const fileInput = document.getElementById('seal-light-file') as HTMLInputElement;
    const file = new File(['svg-content'], 'seal-light.svg', { type: 'image/svg+xml' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(tenantSelfApiMock.uploadBrandingAsset).toHaveBeenCalledWith({
        usage: 'seal',
        themeVariant: 'light',
        file,
      });
    });

    await waitFor(() => {
      expect(tenantSelfApiMock.getProfile).toHaveBeenCalledTimes(1);
    });

    expect(onUpdated).toHaveBeenCalledWith(updatedProfile);
    expect(
      screen.getAllByText('El activo se subió y asignó correctamente.').length,
    ).toBeGreaterThan(0);
  });

  it('bloquea upload cuando la validación del slot falla', async () => {
    validateBrandingFileForUploadMock.mockResolvedValueOnce(
      'La imagen debe ser al menos de 1280x720 px.',
    );

    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={jest.fn()} />);

    const fileInput = document.getElementById('seal-light-file') as HTMLInputElement;
    const file = new File(['invalid-content'], 'seal-light.svg', { type: 'image/svg+xml' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(validateBrandingFileForUploadMock).toHaveBeenCalledWith(file, 'seal');
    });

    expect(tenantSelfApiMock.uploadBrandingAsset).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getAllByText((text) => text.includes('1280x720')).length).toBeGreaterThan(0);
    });
  });

  it('envia metadata de nombres e identidad en payload incremental', async () => {
    const updatedProfile = buildProfile({
      brandingProductName: 'ISP Demo Pro',
      brandingSurfaceName: 'Portal empresarial',
      brandingMetadataTitle: 'ISP Demo Pro — Portal empresarial',
      brandingMetadataDescription:
        'Portal empresarial para la operación de ISP Demo Pro en iWana neXt.',
    });
    tenantSelfApiMock.updateBranding.mockResolvedValue(updatedProfile);

    const onUpdated = jest.fn();
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={onUpdated} />);

    await expandIdentityAccordion();

    fireEvent.change(screen.getByLabelText('Producto'), {
      target: { value: 'ISP Demo Pro' },
    });
    fireEvent.change(screen.getByLabelText('Superficie'), {
      target: { value: 'Portal empresarial' },
    });
    fireEvent.change(screen.getByLabelText('Título público'), {
      target: { value: 'ISP Demo Pro — Portal empresarial' },
    });
    fireEvent.change(screen.getByLabelText('Descripción pública'), {
      target: { value: 'Portal empresarial para la operación de ISP Demo Pro en iWana neXt.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar marca' }));

    await waitFor(() => {
      expect(tenantSelfApiMock.updateBranding).toHaveBeenCalledWith({
        brandingProductName: 'ISP Demo Pro',
        brandingSurfaceName: 'Portal empresarial',
        brandingMetadataTitle: 'ISP Demo Pro — Portal empresarial',
        brandingMetadataDescription:
          'Portal empresarial para la operación de ISP Demo Pro en iWana neXt.',
      });
    });

    expect(onUpdated).toHaveBeenCalledWith(updatedProfile);
  });

  it('organiza los activos visuales en una grilla responsive 1/2/4', () => {
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={jest.fn()} />);

    expect(screen.getByTestId('branding-assets-grid')).toHaveClass(
      'grid',
      'grid-cols-1',
      'md:grid-cols-2',
      'xl:grid-cols-4',
    );
    expect(screen.getByText('Sello compacto')).toBeInTheDocument();
    expect(screen.getByText('Logo horizontal')).toBeInTheDocument();
    expect(screen.getByText('Favicon')).toBeInTheDocument();
    expect(screen.getByText('Fondo del login')).toBeInTheDocument();
  });

  it('muestra nombres e identidad en un acordeón colapsado inicialmente', async () => {
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={jest.fn()} />);

    const identityToggle = screen.getByRole('button', { name: /Nombres e identidad/i });

    expect(identityToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Producto')).not.toBeInTheDocument();

    fireEvent.click(identityToggle);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Nombres e identidad/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByLabelText('Producto')).toBeVisible();
      expect(screen.getByLabelText('Superficie')).toBeVisible();
      expect(screen.getByLabelText('Título público')).toBeVisible();
      expect(screen.getByLabelText('Descripción pública')).toBeVisible();
    });
  });

  it('usa el título público efectivo en la vista previa de pestaña', () => {
    render(
      <BrandingForm
        profile={buildProfile({
          brandingMetadataTitle: 'ISP Demo Pro — Portal empresarial',
        })}
        canEdit
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getAllByText('ISP Demo Pro — Portal empresarial').length).toBeGreaterThan(0);
  });

  it('usa el nombre de producto efectivo en la vista previa de navegación', () => {
    render(
      <BrandingForm
        profile={buildProfile({
          brandingProductName: 'ISP Demo Pro',
        })}
        canEdit
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getAllByText('ISP Demo Pro').length).toBeGreaterThan(0);
  });

  it('restaura branding base limpiando assets y metadata tenant', async () => {
    tenantSelfApiMock.updateBranding.mockResolvedValue(buildProfile());

    render(
      <BrandingForm
        profile={buildProfile({
          logoLightUrl: 'https://cdn.demo.co/logo-light.png',
          logoDarkUrl: 'https://cdn.demo.co/logo-dark.png',
          sealLightUrl: 'https://cdn.demo.co/seal-light.png',
          sealDarkUrl: 'https://cdn.demo.co/seal-dark.png',
          faviconLightUrl: 'https://cdn.demo.co/favicon-light.png',
          faviconDarkUrl: 'https://cdn.demo.co/favicon-dark.png',
          loginBackgroundLightUrl: 'https://cdn.demo.co/login-bg-light.png',
          loginBackgroundDarkUrl: 'https://cdn.demo.co/login-bg-dark.png',
          brandingProductName: 'ISP Demo Pro',
          brandingSurfaceName: 'Portal empresarial',
          brandingMetadataTitle: 'ISP Demo Pro — Portal empresarial',
          brandingMetadataDescription:
            'Portal empresarial para la operación de ISP Demo Pro en iWana neXt.',
        })}
        canEdit
        onUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar base' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(tenantSelfApiMock.updateBranding).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Restaurar base' })[1] as HTMLElement);

    await waitFor(() => {
      expect(tenantSelfApiMock.updateBranding).toHaveBeenCalledWith(
        expect.objectContaining({
          logoLightUrl: null,
          logoDarkUrl: null,
          sealLightUrl: null,
          sealDarkUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
          loginBackgroundLightUrl: null,
          loginBackgroundDarkUrl: null,
          brandingProductName: null,
          brandingSurfaceName: null,
          brandingMetadataTitle: null,
          brandingMetadataDescription: null,
        }),
      );
    });
  });

  it('expone controles accesibles para subir archivos y usar URLs externas', () => {
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={jest.fn()} />);

    expect(
      screen.getByLabelText('Subir archivo para Sello compacto, variante clara'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('URL HTTPS para sello compacto · variante clara'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Requisitos recomendados:/i).length).toBeGreaterThan(0);
  });
});
