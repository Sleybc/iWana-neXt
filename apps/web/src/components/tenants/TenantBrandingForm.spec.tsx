import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TenantBrandingForm } from './TenantBrandingForm';
import { tenantApi, type TenantListItem } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  tenantApi: {
    updateBranding: jest.fn(),
    uploadBrandingAsset: jest.fn(),
    getOne: jest.fn(),
  },
}));

const tenantApiMock = tenantApi as unknown as {
  updateBranding: jest.Mock;
  uploadBrandingAsset: jest.Mock;
  getOne: jest.Mock;
};

function buildTenant(overrides: Partial<TenantListItem> = {}): TenantListItem {
  return {
    id: 'tenant-1',
    name: 'ISP Demo',
    slug: 'isp-demo',
    schemaName: 'tenant_isp_demo',
    status: 'ACTIVE',
    contactEmail: 'ops@demo.co',
    maxSubscribers: 500,
    settings: {},
    legalName: null,
    nit: null,
    nitDv: null,
    companyType: null,
    address: null,
    city: null,
    department: null,
    countryCode: 'CO',
    postalCode: null,
    coordinates: null,
    phone: null,
    website: null,
    economicSector: null,
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
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('TenantBrandingForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('guarda URL externa de branding con payload incremental', async () => {
    const updatedTenant = buildTenant({
      sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
      sealLightAssetId: null,
    });
    tenantApiMock.updateBranding.mockResolvedValue(updatedTenant);

    const onUpdated = jest.fn();
    render(<TenantBrandingForm tenantId="tenant-1" tenant={buildTenant()} onUpdated={onUpdated} />);

    const urlInputs = screen.getAllByLabelText('URL HTTPS externa');
    const firstUrlInput = urlInputs[0];

    expect(firstUrlInput).toBeDefined();

    fireEvent.change(firstUrlInput as HTMLElement, {
      target: { value: 'https://cdn.demo.co/branding/seal-light.svg' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar branding' }));

    await waitFor(() => {
      expect(tenantApiMock.updateBranding).toHaveBeenCalledWith('tenant-1', {
        sealLightUrl: 'https://cdn.demo.co/branding/seal-light.svg',
        sealLightAssetId: null,
      });
    });

    expect(onUpdated).toHaveBeenCalledWith(updatedTenant);
    expect(screen.getByText('Branding del tenant actualizado correctamente.')).toBeInTheDocument();
  });

  it('sube un activo y recarga el tenant para refrescar el formulario', async () => {
    tenantApiMock.uploadBrandingAsset.mockResolvedValue({ id: 'asset-1' });

    const updatedTenant = buildTenant({
      sealLightUrl: 'https://cdn.demo.co/branding/seal-light-uploaded.svg',
      sealLightAssetId: 'asset-1',
    });
    tenantApiMock.getOne.mockResolvedValue(updatedTenant);

    const onUpdated = jest.fn();
    render(<TenantBrandingForm tenantId="tenant-1" tenant={buildTenant()} onUpdated={onUpdated} />);

    const fileInput = document.getElementById('seal-light-file') as HTMLInputElement;
    const file = new File(['svg-content'], 'seal-light.svg', { type: 'image/svg+xml' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(tenantApiMock.uploadBrandingAsset).toHaveBeenCalledWith('tenant-1', {
        usage: 'seal',
        themeVariant: 'light',
        file,
      });
    });

    await waitFor(() => {
      expect(tenantApiMock.getOne).toHaveBeenCalledWith('tenant-1');
    });

    expect(onUpdated).toHaveBeenCalledWith(updatedTenant);
    expect(screen.getByText('Activo subido y asignado correctamente.')).toBeInTheDocument();
  });
});
