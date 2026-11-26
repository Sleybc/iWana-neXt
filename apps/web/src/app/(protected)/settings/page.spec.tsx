import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from './page';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { guardLeave } from '@/lib/leave-guard';

/** El foco está dentro de `element` y no se perdió en `body`. */
const expectFocusIn = (element: HTMLElement) => {
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toContainElement(element);
};

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
const mockPush = jest.fn();
const mockReplace = jest.fn();
type MockPlatformBrandingApi = {
  get: jest.Mock;
  update: jest.Mock;
  reset: jest.Mock;
  uploadAsset: jest.Mock;
};

var mockPlatformBrandingApi: MockPlatformBrandingApi;

jest.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useSearchParams: () => {
    const search = React.useSyncExternalStore(
      (listener) => {
        window.addEventListener('popstate', listener);
        window.addEventListener('test:urlchange', listener);
        return () => {
          window.removeEventListener('popstate', listener);
          window.removeEventListener('test:urlchange', listener);
        };
      },
      () => window.location.search,
    );
    return new URLSearchParams(search);
  },
  useRouter: () => ({
    push: mockPush,
    replace: (url: string, options?: { scroll?: boolean }) => {
      mockReplace(url, options);
      window.history.replaceState(null, '', url);
      // Un replace de Next.js no emite popstate: ese evento es solo de Atrás/Adelante.
      window.dispatchEvent(new Event('test:urlchange'));
    },
  }),
}));

jest.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
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
    window.history.replaceState(null, '', '/settings');
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

  it('las flechas mueven el foco sin tocar la URL; Enter cambia de sección y conserva el borrador', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const name = await screen.findByLabelText(identity.productLabel);
    await user.clear(name);
    await user.type(name, 'Nombre en borrador');
    screen.getByRole('tab', { name: new RegExp(`^${copy.tabIdentity}`) }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: copy.tabSecurity })).toHaveFocus();
    expect(mockReplace).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(window.location.search).toBe('?seccion=seguridad');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: new RegExp(`^${copy.tabIdentity}`) }));
    expect(name).toHaveValue('Nombre en borrador');
  });

  describe('cambios sin guardar en Identidad', () => {
    const identityTab = () => screen.getByRole('tab', { name: new RegExp(`^${copy.tabIdentity}`) });
    let link: HTMLAnchorElement;

    beforeEach(() => {
      link = document.createElement('a');
      link.href = '/tenants';
      link.textContent = 'Empresas';
      document.body.appendChild(link);
    });

    afterEach(() => link.remove());

    const editName = async (user: ReturnType<typeof userEvent.setup>) => {
      const name = await screen.findByLabelText(identity.productLabel);
      await user.type(name, ' borrador');
      return name;
    };

    it('marca la pestaña mientras hay cambios y la limpia al guardar', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await editName(user);
      expect(identityTab()).toHaveAccessibleName(`${copy.tabIdentity}${copy.tabPending}`);

      await user.click(screen.getByRole('button', { name: identity.save }));
      await waitFor(() => expect(identityTab()).toHaveAccessibleName(copy.tabIdentity));
    });

    it('un enlace interno pide confirmación; «Seguir editando» se queda con el borrador', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const name = await editName(user);

      expect(fireEvent.click(link)).toBe(false);
      const dialog = await screen.findByRole('dialog', { name: identity.leaveTitle });
      expect(dialog).toHaveTextContent(identity.leaveBody);
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: identity.leaveStay })).toHaveFocus(),
      );

      await user.click(within(dialog).getByRole('button', { name: identity.leaveStay }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(name).toHaveValue('iWana neXt borrador');
    });

    it('«Salir sin guardar» completa la navegación del enlace', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await editName(user);

      fireEvent.click(link);
      await user.click(await screen.findByRole('button', { name: identity.leaveConfirm }));
      expect(mockReplace).toHaveBeenCalledWith('/tenants', undefined);
    });

    it('Atrás con cambios pide confirmación y deja la página donde está', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const before = window.history.length;
      await editName(user);
      // La centinela: una entrada más con la misma URL.
      await waitFor(() => expect(window.history.length).toBe(before + 1));

      window.history.back();
      expect(await screen.findByRole('dialog', { name: identity.leaveTitle })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: identity.leaveStay }));
      expect(window.location.pathname).toBe('/settings');
      // Se repuso la centinela: un segundo Atrás vuelve a preguntar.
      window.history.back();
      expect(await screen.findByRole('dialog', { name: identity.leaveTitle })).toBeInTheDocument();
      const go = jest.spyOn(window.history, 'go');
      await user.click(screen.getByRole('button', { name: identity.leaveConfirm }));
      expect(go).toHaveBeenCalledWith(-2);
      go.mockRestore();
    });

    it('buscador global y cerrar sesión (guardLeave) piden confirmación con cambios', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await editName(user);
      const proceed = jest.fn();

      let held = false;
      act(() => {
        held = guardLeave(proceed);
      });
      expect(held).toBe(true);
      expect(proceed).not.toHaveBeenCalled();
      const dialog = await screen.findByRole('dialog', { name: identity.leaveTitle });
      await user.click(within(dialog).getByRole('button', { name: identity.leaveStay }));
      expect(proceed).not.toHaveBeenCalled();

      act(() => {
        guardLeave(proceed);
      });
      await user.click(await screen.findByRole('button', { name: identity.leaveConfirm }));
      expect(proceed).toHaveBeenCalledTimes(1);
    });

    it('sin cambios, guardLeave sale al instante sin preguntar', async () => {
      render(<SettingsPage />);
      await screen.findByRole('button', { name: identity.save });
      const proceed = jest.fn();
      expect(guardLeave(proceed)).toBe(false);
      expect(proceed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('no intercepta una ruta que el router leería como otro sitio («//host»)', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await editName(user);
      link.setAttribute('href', '/.//otro.example/ruta');

      expect(fireEvent.click(link)).toBe(true);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('sin cambios no pregunta: el enlace sigue su curso', async () => {
      render(<SettingsPage />);
      await screen.findByLabelText(identity.productLabel);

      const notPrevented = fireEvent.click(link);
      expect(notPrevented).toBe(true);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('cambia de sección sin sumar entradas al historial y conserva los demás parámetros', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/settings?origen=inicio');
    const entries = window.history.length;
    render(<SettingsPage />);

    await user.click(screen.getByRole('tab', { name: copy.tabSecurity }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/settings?origen=inicio&seccion=seguridad', {
      scroll: false,
    });
    expect(window.history.length).toBe(entries);
    expect(
      within(screen.getByRole('tabpanel', { name: copy.tabSecurity })).getByRole('link', {
        name: 'Abrir seguridad en Mi cuenta',
      }),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: copy.tabIdentity }));

    expect(
      await within(screen.getByRole('tabpanel', { name: copy.tabIdentity })).findByLabelText(
        identity.productLabel,
      ),
    ).toBeVisible();
    expect(window.history.length).toBe(entries);
  });

  describe('tab Seguridad', () => {
    it('enlaza a la seguridad personal desde Plataforma', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(screen.getByRole('tab', { name: copy.tabSecurity }));
      expect(screen.getByRole('link', { name: 'Abrir seguridad en Mi cuenta' })).toHaveAttribute(
        'href',
        '/profile#profile-security-heading',
      );
      expect(
        screen.queryByRole('button', { name: 'Actualizar contraseña' }),
      ).not.toBeInTheDocument();
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

  describe('tab Identidad — foco al reintentar', () => {
    it('si la carga vuelve, el foco va al título de Identidad', async () => {
      mockPlatformBrandingApi.get.mockRejectedValueOnce(new Error('Error de red'));
      render(<SettingsPage />);
      fireEvent.click(await screen.findByRole('button', { name: identity.retry }));
      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2, name: identity.title })).toHaveFocus(),
      );
    });

    it('si vuelve a fallar, el foco va al aviso', async () => {
      mockPlatformBrandingApi.get.mockRejectedValue(new Error('Error de red'));
      render(<SettingsPage />);
      fireEvent.click(await screen.findByRole('button', { name: identity.retry }));
      await waitFor(() => expect(mockPlatformBrandingApi.get).toHaveBeenCalledTimes(2));
      await waitFor(() => expectFocusIn(screen.getByText(identity.errorLoad)));
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

      const resetButton = screen.getByRole('button', { name: identity.resetDefaults });
      await user.click(resetButton);
      let confirm = screen.getByRole('dialog', { name: identity.resetConfirmTitle });
      expect(mockPlatformBrandingApi.reset).not.toHaveBeenCalled();
      await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
      expect(mockPlatformBrandingApi.reset).not.toHaveBeenCalled();
      await user.click(resetButton);
      confirm = screen.getByRole('dialog', { name: identity.resetConfirmTitle });
      await user.click(within(confirm).getByRole('button', { name: identity.resetDefaults }));

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
      const name = await screen.findByLabelText(identity.productLabel);
      await user.clear(name);
      await user.type(name, 'Nombre en borrador');

      const removeButtons = screen.getAllByRole('button', { name: identity.removeCta });
      await user.click(removeButtons[0] as HTMLElement);
      await screen.findByRole('dialog');

      await user.click(screen.getByRole('button', { name: identity.removeConfirm }));

      expect(await screen.findByText(identity.successRemove)).toBeInTheDocument();
      expect(name).toHaveValue('Nombre en borrador');
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

  describe('tab Identidad — dirección editada y sin guardar de la misma imagen', () => {
    const slots = [
      { slot: 'logo', field: 'logoUrl', label: identity.logoUrlLabel },
      { slot: 'favicon', field: 'faviconUrl', label: identity.faviconUrlLabel },
      {
        slot: 'fondo claro',
        field: 'loginBackgroundLightUrl',
        label: identity.loginBgLightUrlLabel,
      },
      {
        slot: 'fondo oscuro',
        field: 'loginBackgroundDarkUrl',
        label: identity.loginBgDarkUrlLabel,
      },
    ] as const;
    const otherField = (field: string) =>
      field === 'logoUrl'
        ? { field: 'faviconUrl', label: identity.faviconUrlLabel }
        : { field: 'logoUrl', label: identity.logoUrlLabel };

    const originalImage = global.Image;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;

    beforeEach(() => {
      URL.createObjectURL = () => 'blob:prueba';
      URL.revokeObjectURL = () => undefined;
      global.Image = class {
        naturalWidth = 1280;
        naturalHeight = 720;
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      } as unknown as typeof Image;
    });

    afterEach(() => {
      global.Image = originalImage;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });

    const edit = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    const cardOf = (label: string) =>
      screen.getByLabelText(label).closest('details')?.parentElement as HTMLElement;

    const upload = (slot: (typeof slots)[number]) => {
      const file =
        slot.field === 'faviconUrl'
          ? new File(['x'], 'nueva.ico', { type: 'image/x-icon' })
          : new File(['x'], 'nueva.png', { type: 'image/png' });
      fireEvent.change(cardOf(slot.label).querySelector('input[type="file"]') as HTMLElement, {
        target: { files: [file] },
      });
    };

    const isDraftProtected = () =>
      !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));

    async function saveAndGetPayload(): Promise<Record<string, unknown>> {
      mockPlatformBrandingApi.update.mockClear();
      fireEvent.click(screen.getByRole('button', { name: identity.save }));
      await waitFor(() => expect(mockPlatformBrandingApi.update).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(identity.successSave)).toBeInTheDocument();
      return mockPlatformBrandingApi.update.mock.calls[0][0];
    }

    it.each(slots)('al subir $slot, Guardar envía la imagen nueva', async (slot) => {
      const other = otherField(slot.field);
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');
      edit(slot.label, 'https://cdn.example.test/vieja.png');
      edit(other.label, 'https://cdn.example.test/otro-borrador.png');
      edit(identity.productLabel, 'Nombre en borrador');
      mockPlatformBrandingApi.uploadAsset.mockResolvedValue(undefined);
      mockPlatformBrandingApi.get.mockResolvedValue({
        ...mockBranding,
        [slot.field]: '/uploads/nueva.png',
      });

      upload(slot);

      expect(await screen.findByText(identity.successUpload)).toBeInTheDocument();
      expect(screen.getByLabelText(slot.label)).toHaveValue('/uploads/nueva.png');
      expect(screen.getByLabelText(other.label)).toHaveValue(
        'https://cdn.example.test/otro-borrador.png',
      );
      expect(isDraftProtected()).toBe(true);
      expect(await saveAndGetPayload()).toMatchObject({
        [slot.field]: '/uploads/nueva.png',
        [other.field]: 'https://cdn.example.test/otro-borrador.png',
        productName: 'Nombre en borrador',
      });
    });

    it.each(slots)('al eliminar $slot, Guardar no repone la dirección vieja', async (slot) => {
      const user = userEvent.setup();
      const other = otherField(slot.field);
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');
      edit(slot.label, 'https://cdn.example.test/vieja.png');
      edit(other.label, 'https://cdn.example.test/otro-borrador.png');
      edit(identity.productLabel, 'Nombre en borrador');

      await user.click(
        within(cardOf(slot.label)).getByRole('button', { name: identity.removeCta }),
      );
      await user.click(await screen.findByRole('button', { name: identity.removeConfirm }));

      expect(await screen.findByText(identity.successRemove)).toBeInTheDocument();
      expect(screen.getByLabelText(slot.label)).toHaveValue('');
      expect(isDraftProtected()).toBe(true);
      expect(await saveAndGetPayload()).toMatchObject({
        [slot.field]: null,
        [other.field]: 'https://cdn.example.test/otro-borrador.png',
        productName: 'Nombre en borrador',
      });
    });

    it('sin otros borradores, subir la imagen deja el formulario sin cambios pendientes', async () => {
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');
      edit(identity.logoUrlLabel, 'https://cdn.example.test/vieja.png');
      mockPlatformBrandingApi.uploadAsset.mockResolvedValue(undefined);
      mockPlatformBrandingApi.get.mockResolvedValue({
        ...mockBranding,
        logoUrl: '/uploads/nueva.png',
      });

      upload(slots[0]);

      expect(await screen.findByText(identity.successUpload)).toBeInTheDocument();
      expect(isDraftProtected()).toBe(false);
    });

    it('conserva un borrador escrito mientras la imagen se está subiendo', async () => {
      render(<SettingsPage />);
      await screen.findByDisplayValue('iWana neXt');
      let finishUpload: () => void = () => undefined;
      mockPlatformBrandingApi.uploadAsset.mockReturnValue(
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
      );

      upload(slots[0]);
      await waitFor(() => expect(mockPlatformBrandingApi.uploadAsset).toHaveBeenCalled());
      edit(identity.productLabel, 'Nombre durante la subida');
      finishUpload();

      expect(await screen.findByText(identity.successUpload)).toBeInTheDocument();
      expect(screen.getByLabelText(identity.productLabel)).toHaveValue('Nombre durante la subida');
    });
  });
});
