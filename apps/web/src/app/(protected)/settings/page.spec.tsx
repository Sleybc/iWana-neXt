import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from './page';

const mockBranding = {
  productName: 'iWana neXt',
  surfaceName: 'Portal administrativo',
  metadataTitle: 'iWana neXt — Portal Administrativo',
  metadataDescription: 'Portal administrativo para operadores ISP iWana neXt',
  logoUrl: '/brand/iwiso6.png',
  logoAssetId: null,
  faviconUrl: '/brand/favicon-gecko.svg',
  faviconAssetId: null,
  loginBackgroundLightUrl: null,
  loginBackgroundLightAssetId: null,
  loginBackgroundDarkUrl: null,
  loginBackgroundDarkAssetId: null,
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const mockRefreshBranding = jest.fn();
type MockPlatformBrandingApi = {
  get: jest.Mock;
  update: jest.Mock;
  reset: jest.Mock;
  uploadAsset: jest.Mock;
};

var mockPlatformBrandingApi: MockPlatformBrandingApi;

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}));

jest.mock('@/components/settings/SecuritySettings', () => ({
  SecuritySettings: () => <div>Seguridad mock</div>,
}));

jest.mock('@/components/branding/PlatformBrandingProvider', () => ({
  usePlatformBrandingAssets: () => ({
    branding: mockBranding,
    refresh: mockRefreshBranding,
    isLoading: false,
    logoUrl: mockBranding.logoUrl,
    faviconUrl: mockBranding.faviconUrl,
    loginBackgroundLightUrl: null,
    loginBackgroundDarkUrl: null,
  }),
}));

jest.mock('@/lib/api-client', () => {
  mockPlatformBrandingApi = {
    get: jest.fn(),
    update: jest.fn(),
    reset: jest.fn(),
    uploadAsset: jest.fn(),
  };

  return {
    ApiError: class ApiError extends Error {
      constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
      ) {
        super(message);
      }
    },
    platformBrandingApi: mockPlatformBrandingApi,
  };
});

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatformBrandingApi.get.mockResolvedValue(mockBranding);
    mockPlatformBrandingApi.update.mockImplementation(async (payload) => ({
      ...mockBranding,
      ...payload,
    }));
    mockPlatformBrandingApi.reset.mockResolvedValue(mockBranding);
    mockRefreshBranding.mockResolvedValue(undefined);
  });

  it('muestra branding propio de la consola web sin listar empresas tenant', async () => {
    render(<SettingsPage />);

    const brandingTab = screen.getByRole('button', { name: 'Branding' });
    expect(brandingTab).toBeInTheDocument();

    fireEvent.click(brandingTab);

    expect(screen.getByText('Branding de plataforma')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('iWana neXt')).toBeInTheDocument();
    expect(screen.getByText('Portal administrativo')).toBeInTheDocument();
    expect(screen.getByAltText('Logo de plataforma')).toHaveAttribute('src', '/brand/iwiso6.png');
    expect(screen.getByAltText('Favicon de plataforma')).toHaveAttribute(
      'src',
      '/brand/favicon-gecko.svg',
    );
    expect(screen.queryByRole('link', { name: 'Abrir branding' })).not.toBeInTheDocument();
  });

  it('permite editar y guardar el branding de plataforma en API', async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Branding' }));
    await screen.findByDisplayValue('iWana neXt');

    fireEvent.change(screen.getByLabelText('Título público'), {
      target: { value: 'Consola interna iWana' },
    });
    fireEvent.change(screen.getByLabelText('Logo'), {
      target: { value: 'https://cdn.example.test/platform-logo.svg' },
    });

    expect(screen.getByText('Consola interna iWana')).toBeInTheDocument();
    expect(screen.getByAltText('Logo de plataforma')).toHaveAttribute(
      'src',
      'https://cdn.example.test/platform-logo.svg',
    );

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

    expect(await screen.findByText('Branding de plataforma actualizado.')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockPlatformBrandingApi.update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadataTitle: 'Consola interna iWana',
          logoUrl: 'https://cdn.example.test/platform-logo.svg',
        }),
      );
    });
    expect(mockRefreshBranding).toHaveBeenCalled();
  });

  it('permite eliminar una imagen de slot y vuelve al fallback base', async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Branding' }));
    await screen.findByDisplayValue('iWana neXt');

    const removeButtons = screen.getAllByRole('button', { name: /Eliminar imagen/ });
    fireEvent.click(removeButtons[0] as HTMLElement);

    expect(await screen.findByText(/Imagen eliminada/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockPlatformBrandingApi.update).toHaveBeenCalledWith(
        expect.objectContaining({
          logoUrl: null,
          logoAssetId: null,
        }),
      );
    });
    expect(mockRefreshBranding).toHaveBeenCalled();
  });
});
