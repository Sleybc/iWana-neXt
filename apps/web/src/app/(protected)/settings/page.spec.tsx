import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './page';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const copy = PLATFORM_UI_COPY.settings;
const identity = copy.identity;

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
  SecuritySettings: () => <div data-testid="security-settings">Seguridad mock</div>,
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

  describe('chrome de página', () => {
    it('muestra H1 Plataforma, subtítulo canónico y deslinde a Empresas', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('heading', { level: 1, name: 'Plataforma' })).toBeInTheDocument();
      expect(screen.getByText(`${copy.subtitle} ${copy.tenantsBoundary}`)).toBeInTheDocument();
      expect(screen.queryByText(/gobierno y configuración global/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/branding/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/parámetros/i)).not.toBeInTheDocument();
    });

    it('renderiza solo tabs Identidad y Seguridad; Identidad es el default', async () => {
      render(<SettingsPage />);
      expect(screen.getByRole('tab', { name: copy.tabIdentity })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: copy.tabSecurity })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'General' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Branding' })).not.toBeInTheDocument();
      expect(await screen.findByText(identity.title)).toBeInTheDocument();
    });

    it('CA-SET-03: tabs no viven dentro de un Card envolvente', async () => {
      render(<SettingsPage />);
      const tablist = screen.getByRole('tablist');
      expect(tablist.closest('.shadow-iwana-card')).toBeNull();
      expect(await screen.findByText(identity.assetsSection)).toBeInTheDocument();
    });
  });

  describe('tab Seguridad', () => {
    it('muestra el componente SecuritySettings al activar el tab', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: copy.tabSecurity }));
      expect(screen.getByTestId('security-settings')).toBeInTheDocument();
    });
  });

  describe('tab Identidad — carga y visualización', () => {
    it('muestra identidad de la consola sin listar empresas', async () => {
      render(<SettingsPage />);

      expect(await screen.findByText(identity.title)).toBeInTheDocument();
      expect(await screen.findByDisplayValue('iWana neXt')).toBeInTheDocument();
      expect(screen.getByText('Portal administrativo')).toBeInTheDocument();
      expect(screen.getByAltText(identity.logoImgAlt)).toHaveAttribute('src', '/brand/iwiso6.png');
      expect(screen.getByAltText(identity.faviconImgAlt)).toHaveAttribute(
        'src',
        '/brand/favicon-gecko.svg',
      );
      expect(screen.queryByRole('link', { name: 'Abrir branding' })).not.toBeInTheDocument();
      expect(screen.queryByText(/superficie/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/metadata/i)).not.toBeInTheDocument();
    });

    it('mantiene las opciones avanzadas de imagen detrás de un disclosure secundario', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');

      expect(screen.getByText(identity.assetsSection)).toBeInTheDocument();
      const advancedOptions = screen.getAllByText(identity.advancedOptions);
      expect(advancedOptions).toHaveLength(4);
      advancedOptions.forEach((summary) => {
        expect(summary.closest('details')).not.toHaveAttribute('open');
      });

      await user.click(advancedOptions[0] as HTMLElement);

      expect(advancedOptions[0]?.closest('details')).toHaveAttribute('open');
    });

    it('muestra estado de carga con skeleton mientras la API está pendiente', async () => {
      mockPlatformBrandingApi.get.mockReturnValue(new Promise(() => {}));
      render(<SettingsPage />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(identity.loading)).toBeInTheDocument();
    });

    it('muestra error y botón Reintentar si la carga inicial falla', async () => {
      mockPlatformBrandingApi.get.mockRejectedValue(new Error('Error de red'));
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: identity.retry })).toBeInTheDocument();
      });
      expect(screen.getByText(identity.errorLoad)).toBeInTheDocument();
    });
  });

  describe('tab Identidad — guardar cambios', () => {
    it('permite editar y guardar la identidad de consola en API', async () => {
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');

      fireEvent.change(screen.getByLabelText(identity.titleLabel), {
        target: { value: 'Consola interna iWana' },
      });
      fireEvent.change(screen.getByLabelText(identity.logoUrlLabel), {
        target: { value: 'https://cdn.example.test/platform-logo.svg' },
      });

      expect(screen.getByText('Consola interna iWana')).toBeInTheDocument();
      expect(screen.getByAltText(identity.logoImgAlt)).toHaveAttribute(
        'src',
        'https://cdn.example.test/platform-logo.svg',
      );

      fireEvent.click(screen.getByRole('button', { name: identity.save }));

      expect(await screen.findByText(identity.successSave)).toBeInTheDocument();
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
  });

  describe('tab Identidad — Restaurar valores por defecto', () => {
    it('llama a platformBrandingApi.reset() al restaurar valores por defecto', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');

      await user.click(screen.getByRole('button', { name: identity.resetDefaults }));

      await waitFor(() => {
        expect(mockPlatformBrandingApi.reset).toHaveBeenCalledTimes(1);
      });
      expect(await screen.findByText(identity.successReset)).toBeInTheDocument();
    });
  });

  describe('tab Identidad — eliminar imagen', () => {
    it('abre Dialog de confirmación al hacer clic en Eliminar imagen', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');

      const removeButtons = screen.getAllByRole('button', { name: identity.removeCta });
      await user.click(removeButtons[0] as HTMLElement);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: identity.removeConfirm })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: identity.cancel })).toBeInTheDocument();
      expect(screen.getByText(identity.removeDialogBody)).toBeInTheDocument();
    });

    it('elimina imagen tras confirmar en el Dialog', async () => {
      const user = userEvent.setup();
      mockPlatformBrandingApi.update.mockResolvedValue({
        ...mockBranding,
        logoUrl: null,
        logoAssetId: null,
      });
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');

      const removeButtons = screen.getAllByRole('button', { name: identity.removeCta });
      await user.click(removeButtons[0] as HTMLElement);
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: identity.removeConfirm }));

      expect(await screen.findByText(identity.successRemove)).toBeInTheDocument();
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

    it('cancela la eliminación al hacer clic en Cancelar del Dialog', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');

      const removeButtons = screen.getAllByRole('button', { name: identity.removeCta });
      await user.click(removeButtons[0] as HTMLElement);
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: identity.cancel }));

      await waitFor(() => {
        expect(mockPlatformBrandingApi.update).not.toHaveBeenCalled();
      });
    });
  });
});
