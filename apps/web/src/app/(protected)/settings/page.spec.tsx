import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  // ── Tab General ──────────────────────────────────────────────────────────

  describe('tab General', () => {
    it('muestra el texto informativo en el tab General por defecto', () => {
      render(<SettingsPage />);
      expect(screen.getByText(/la configuración operativa/i)).toBeInTheDocument();
    });

    it('renderiza los tres tabs con role="tab"', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Branding' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Seguridad' })).toBeInTheDocument();
    });
  });

  // ── Tab Seguridad ────────────────────────────────────────────────────────

  describe('tab Seguridad', () => {
    it('muestra el componente SecuritySettings al activar el tab', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: 'Seguridad' }));
      expect(screen.getByTestId('security-settings')).toBeInTheDocument();
    });
  });

  // ── Tab Branding ─────────────────────────────────────────────────────────

  describe('tab Branding — carga y visualización', () => {
    it('muestra branding propio de la consola web sin listar empresas', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: 'Branding' }));

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

    it('mantiene las opciones avanzadas de origen detrás de un disclosure secundario', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      await screen.findByDisplayValue('iWana neXt');

      expect(screen.getByText('Activos visuales principales')).toBeInTheDocument();
      const advancedOptions = screen.getAllByText('Opciones avanzadas del activo');
      expect(advancedOptions).toHaveLength(4);
      advancedOptions.forEach((summary) => {
        expect(summary.closest('details')).not.toHaveAttribute('open');
      });

      await user.click(advancedOptions[0] as HTMLElement);

      expect(advancedOptions[0]?.closest('details')).toHaveAttribute('open');
    });

    it('muestra estado de carga mientras la API está pendiente', async () => {
      const user = userEvent.setup();
      mockPlatformBrandingApi.get.mockReturnValue(new Promise(() => {}));
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('muestra error y botón Reintentar si la carga inicial falla', async () => {
      const user = userEvent.setup();
      mockPlatformBrandingApi.get.mockRejectedValue(new Error('Error de red'));
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: 'Branding' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
      });
    });
  });

  describe('tab Branding — guardar cambios', () => {
    it('permite editar y guardar el branding de plataforma en API', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await user.click(screen.getByRole('tab', { name: 'Branding' }));
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
  });

  describe('tab Branding — Restaurar base', () => {
    it('llama a platformBrandingApi.reset() al hacer clic en Restaurar base', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      await screen.findByDisplayValue('iWana neXt');

      await user.click(screen.getByRole('button', { name: /restaurar base/i }));

      await waitFor(() => {
        expect(mockPlatformBrandingApi.reset).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('tab Branding — eliminar imagen', () => {
    it('abre Dialog de confirmación al hacer clic en Eliminar imagen', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      await screen.findByDisplayValue('iWana neXt');

      // Abre el dialog
      const removeButtons = screen.getAllByRole('button', { name: /eliminar imagen/i });
      await user.click(removeButtons[0] as HTMLElement);

      // El Dialog de confirmación debe aparecer
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sí, eliminar/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
    });

    it('elimina imagen tras confirmar en el Dialog', async () => {
      const user = userEvent.setup();
      mockPlatformBrandingApi.update.mockResolvedValue({
        ...mockBranding,
        logoUrl: null,
        logoAssetId: null,
      });
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      await screen.findByDisplayValue('iWana neXt');

      const removeButtons = screen.getAllByRole('button', { name: /eliminar imagen/i });
      await user.click(removeButtons[0] as HTMLElement);
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: /sí, eliminar/i }));

      expect(await screen.findByText(/imagen eliminada/i)).toBeInTheDocument();
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
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      await screen.findByDisplayValue('iWana neXt');

      const removeButtons = screen.getAllByRole('button', { name: /eliminar imagen/i });
      await user.click(removeButtons[0] as HTMLElement);
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: /cancelar/i }));

      await waitFor(() => {
        expect(mockPlatformBrandingApi.update).not.toHaveBeenCalled();
      });
    });
  });
});
