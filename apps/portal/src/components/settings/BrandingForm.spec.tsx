import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrandingForm } from './BrandingForm';
import { tenantSelfApi, type TenantSelf } from '@/lib/api-client';

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

const tenantSelfApiMock = tenantSelfApi as unknown as {
  updateBranding: jest.Mock;
  uploadBrandingAsset: jest.Mock;
  getProfile: jest.Mock;
};

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
    ...overrides,
  };
}

describe('BrandingForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envia payload incremental de URL externa al guardar branding', async () => {
    const updatedProfile = buildProfile({
      sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
      sealLightAssetId: null,
    });
    tenantSelfApiMock.updateBranding.mockResolvedValue(updatedProfile);

    const onUpdated = jest.fn();
    render(<BrandingForm profile={buildProfile()} canEdit onUpdated={onUpdated} />);

    const urlInputs = screen.getAllByLabelText('URL HTTPS externa');
    const firstUrlInput = urlInputs[0];

    expect(firstUrlInput).toBeDefined();

    fireEvent.change(firstUrlInput as HTMLElement, {
      target: { value: 'https://cdn.demo.co/branding/seal-light.svg' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar branding' }));

    await waitFor(() => {
      expect(tenantSelfApiMock.updateBranding).toHaveBeenCalledWith({
        sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
        sealLightAssetId: null,
      });
    });

    expect(onUpdated).toHaveBeenCalledWith(updatedProfile);
    expect(screen.getByText('Branding empresarial actualizado correctamente.')).toBeInTheDocument();
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
    expect(screen.getByText('Activo subido y asignado correctamente.')).toBeInTheDocument();
  });
});
