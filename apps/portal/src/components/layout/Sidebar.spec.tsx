import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { Sidebar } from './Sidebar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}));

const usePermissionsMock = jest.fn();

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => usePermissionsMock(),
}));

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

jest.mock('./TenantSeal', () => ({
  TenantSeal: ({ name }: { name: string }) => <div data-testid="tenant-seal">{name}</div>,
}));

const ALL_NAV_PERMISSIONS: AccessPermissionKey[] = [
  AccessPermissionKey.CRM_EXPEDIENTES_READ,
  AccessPermissionKey.CRM_SUBSCRIBERS_READ,
  AccessPermissionKey.WFM_SCHEDULE_READ,
  AccessPermissionKey.ASSURANCE_TICKETS_READ,
  AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
  AccessPermissionKey.INVENTORY_STOCK_READ,
  AccessPermissionKey.SETTINGS_READ,
  AccessPermissionKey.USERS_READ,
  AccessPermissionKey.COMMERCIAL_CATALOG_READ,
];

function mockPermissionsReady(permissions: AccessPermissionKey[] = ALL_NAV_PERMISSIONS) {
  usePermissionsMock.mockReturnValue({
    status: 'ready',
    effectivePermissions: new Set(permissions),
    hasPermission: (permission: AccessPermissionKey) => permissions.includes(permission),
    hasAnyPermission: (required: readonly AccessPermissionKey[]) =>
      required.some((permission) => permissions.includes(permission)),
    retry: jest.fn(),
  });
}

function mockPermissionsStatus(
  status: 'loading' | 'ready' | 'degraded',
  permissions: AccessPermissionKey[] = [],
) {
  usePermissionsMock.mockReturnValue({
    status,
    effectivePermissions: new Set(permissions),
    hasPermission: (permission: AccessPermissionKey) => permissions.includes(permission),
    hasAnyPermission: (required: readonly AccessPermissionKey[]) =>
      required.some((permission) => permissions.includes(permission)),
    retry: jest.fn(),
  });
}

type MatchMediaListener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<MatchMediaListener>();

  const mediaQuery = {
    matches,
    media: '(max-width: 1023px)',
    onchange: null,
    addEventListener: jest.fn((_event: 'change', listener: MatchMediaListener) => {
      listeners.add(listener);
    }),
    removeEventListener: jest.fn((_event: 'change', listener: MatchMediaListener) => {
      listeners.delete(listener);
    }),
    addListener: jest.fn((listener: MatchMediaListener) => {
      listeners.add(listener);
    }),
    removeListener: jest.fn((listener: MatchMediaListener) => {
      listeners.delete(listener);
    }),
    dispatchEvent: jest.fn(),
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation(() => mediaQuery),
  });
}

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props: React.ComponentProps<typeof Sidebar> = {
    desktopCollapsed: false,
    setDesktopCollapsed: jest.fn(),
    mobileOpen: false,
    setMobileOpen: jest.fn(),
    profile: null,
    ...overrides,
  };

  return render(<Sidebar {...props} />);
}

describe('Sidebar', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { role: UserRole.SUPPORT },
    });
    mockPermissionsReady();
    mockMatchMedia(false);
  });

  it('usa brandingProductName como nombre visible de la empresa cuando existe', () => {
    renderSidebar({
      profile: {
        id: 'tenant-1',
        name: 'iWana',
        brandingProductName: 'Gestion C',
        showTenantName: true,
        sealLightUrl: null,
        sealDarkUrl: null,
      } as never,
    });

    expect(screen.getAllByText('Gestion C').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tenant-seal')[0]).toHaveTextContent('Gestion C');
  });

  it('muestra el acceso a Mesa de ayuda en el menu principal', () => {
    renderSidebar();

    const helpDeskLink = screen.getByRole('link', { name: 'Mesa de ayuda' });
    expect(helpDeskLink).toHaveAttribute('href', '/dashboard/assurance');
  });

  it('muestra el acceso a Operaciones en el menu principal', () => {
    renderSidebar();

    const operationsLink = screen.getByRole('link', { name: 'Operaciones' });
    expect(operationsLink).toHaveAttribute('href', '/dashboard/operations');
  });

  it('muestra el acceso a Inventario en el menu principal', () => {
    renderSidebar();

    const inventoryLink = screen.getByRole('link', { name: 'Inventario' });
    expect(inventoryLink).toHaveAttribute('href', '/dashboard/inventory');
  });

  it('oculta Operaciones cuando el rol no tiene acceso al modulo', () => {
    useAuthMock.mockReturnValue({
      user: { role: UserRole.ACCOUNTANT },
    });

    renderSidebar();

    expect(screen.queryByRole('link', { name: 'Operaciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inventario' })).not.toBeInTheDocument();
  });

  it('en viewport móvil con drawer cerrado, el aside es inerte y los enlaces no son tabulables', () => {
    mockMatchMedia(true);

    renderSidebar({ mobileOpen: false });

    const sidebar = screen.getByRole('complementary', { hidden: true });
    expect(sidebar).toHaveAttribute('inert');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
  });

  it('al abrir el drawer móvil el foco entra al panel y los enlaces son alcanzables', () => {
    mockMatchMedia(true);

    const { rerender } = renderSidebar({ mobileOpen: false });

    rerender(
      <Sidebar
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen
        setMobileOpen={jest.fn()}
        profile={null}
      />,
    );

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).not.toHaveAttribute('inert');
    expect(sidebar).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveFocus();
  });

  it('Escape con drawer abierto invoca el cierre', () => {
    mockMatchMedia(true);
    const setMobileOpen = jest.fn();

    renderSidebar({ mobileOpen: true, setMobileOpen });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('el ítem activo conserva aria-current y muestra la barra lima de firma', () => {
    renderSidebar({ mobileOpen: true });

    const activeLink = screen.getByRole('link', { name: 'Inicio' });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink.className).toMatch(/relative/);

    const limeBar = activeLink.querySelector('span.absolute.left-0');
    expect(limeBar).not.toBeNull();
    expect(limeBar).toHaveAttribute('aria-hidden', 'true');
    expect(limeBar?.className).toMatch(/bg-iwana-secondary/);
  });

  it('en desktop el sidebar permanece disponible aunque mobileOpen sea false', () => {
    mockMatchMedia(false);

    renderSidebar({ mobileOpen: false });

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).not.toHaveAttribute('inert');
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('con un drawer modal abierto, el sidebar queda inerte y aria-hidden en desktop', () => {
    mockMatchMedia(false);

    renderSidebar({ mobileOpen: false, modalDrawerOpen: true });

    const sidebar = screen.getByRole('complementary', { hidden: true });
    expect(sidebar).toHaveAttribute('inert');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('link', { name: 'Inicio' })).not.toBeInTheDocument();
  });

  it('el sidebar no cambia de escalon con un drawer modal: lo cubre la capa del drawer', () => {
    mockMatchMedia(false);

    renderSidebar({ mobileOpen: false, modalDrawerOpen: true });

    const sidebar = screen.getByRole('complementary', { hidden: true });
    // `lg:static` deja el token z-(--z-shell-panel) sin efecto en desktop: el
    // velo del drawer modal viaja DENTRO de su propia capa `--z-modal`
    // (C-DS-04 §2bis) y pinta encima, atenuando + desenfocando el chrome.
    expect(sidebar.className).toMatch(/lg:static/);
    expect(sidebar.className).not.toMatch(/lg:relative/);
    // El escalón NO cambia: degradar el chrome exigía un viaje de evento y un
    // re-render, y el retardo se veía. La capa del drawer (`--z-modal`) es la
    // que se monta por encima.
    expect(sidebar.className).toMatch(/z-\(--z-shell-panel\)/);
    // `--z-base` quedó retirado por C-DS-04 (sin consumidor; `z-index: 0` no
    // equivale a `auto`). El guardia se conserva: la vía de regresión que
    // cierra es reintroducirlo para degradar el chrome bajo el velo.
    expect(sidebar.className).not.toMatch(/z-\(--z-base\)/);
    // `transition-all` arrastraría cualquier propiedad futura, `z-index`
    // incluido, que es interpolable y convertiría un cambio de capa en
    // animación.
    expect(sidebar.className).toMatch(/transition-\[width,transform\]/);
    expect(sidebar.className).not.toMatch(/transition-all/);
  });

  it('targets táctiles del shell: cierre h-11 w-11 y filas/marca min-h-11', () => {
    mockMatchMedia(true);
    renderSidebar({ mobileOpen: true });

    const closeBtn = screen.getByRole('button', { name: 'Cerrar menú' });
    expect(closeBtn.className).toMatch(/h-11/);
    expect(closeBtn.className).toMatch(/w-11/);

    const brand = screen
      .getAllByRole('link', { name: /./ })
      .find((el) => el.getAttribute('href') === '/dashboard');
    expect(brand?.className).toMatch(/min-h-11/);

    const homeNav = screen.getByRole('link', { name: 'Inicio' });
    expect(homeNav.className).toMatch(/min-h-11/);
  });

  it('alinea el nav: Comercial en Administración; Usuarios; sin Reportes', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Oportunidades' })).toHaveAttribute(
      'href',
      '/dashboard/crm/expedientes',
    );
    expect(screen.getByRole('link', { name: 'Programación' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling',
    );
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
    expect(screen.getByRole('link', { name: 'Comercial' })).toHaveAttribute(
      'href',
      '/dashboard/commercial',
    );
    expect(screen.queryByRole('link', { name: 'CRM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios y accesos' })).not.toBeInTheDocument();
    expect(screen.queryByText('Programacion')).not.toBeInTheDocument();
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Siguiente fase/i)).not.toBeInTheDocument();
    expect(screen.getByText('Menú')).toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();

    const adminHeading = screen.getByText('Administración');
    const adminGroup = adminHeading.closest('div');
    expect(adminGroup).not.toBeNull();
    const adminLinks = within(adminGroup!).getAllByRole('link');
    expect(adminLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard/settings',
      '/dashboard/users',
      '/dashboard/commercial',
    ]);
  });

  describe('gating por permisos efectivos (spec MOD00 §1)', () => {
    it('CA-NAV-01: sin crm.subscribers.read el ítem Suscriptores no existe en el DOM', () => {
      mockPermissionsReady(
        ALL_NAV_PERMISSIONS.filter((key) => key !== AccessPermissionKey.CRM_SUBSCRIBERS_READ),
      );

      renderSidebar();

      expect(screen.queryByRole('link', { name: 'Suscriptores' })).not.toBeInTheDocument();
      expect(screen.queryByText('Suscriptores')).not.toBeInTheDocument();
    });

    it('CA-NAV-02: el permiso efectivo muestra el ítem aunque el rol no esté en listas previas', () => {
      useAuthMock.mockReturnValue({ user: { role: UserRole.TECHNICIAN } });
      mockPermissionsReady([
        AccessPermissionKey.CRM_SUBSCRIBERS_READ,
        AccessPermissionKey.SETTINGS_READ,
      ]);

      renderSidebar();

      expect(screen.getByRole('link', { name: 'Suscriptores' })).toHaveAttribute(
        'href',
        '/dashboard/crm/subscribers',
      );
      // Sin techo estático que lo excluya, otros ítems con permiso también aparecen
      expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
    });

    it('CA-NAV-03: en carga cada slot gateado muestra un skeleton no focoable e Inicio es clicable', () => {
      mockPermissionsStatus('loading');

      renderSidebar();

      // Inicio (sin gate) visible desde el primer render
      const home = screen.getByRole('link', { name: 'Inicio' });
      expect(home).toHaveAttribute('href', '/dashboard');

      // Ningún ítem gateado real interactivo durante la carga
      expect(screen.queryByRole('link', { name: 'Suscriptores' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Mesa de ayuda' })).not.toBeInTheDocument();

      // Skeletons con forma de ítem: un li aria-hidden por slot gateado (9)
      const nav = screen.getByRole('navigation', { name: 'Menú principal' });
      const skeletonRows = nav.querySelectorAll('li[aria-hidden="true"]');
      expect(skeletonRows).toHaveLength(9);
      const focusablePlaceholders = Array.from(skeletonRows).filter(
        (element) => element.querySelector('a, button, [tabindex]:not([tabindex="-1"])') !== null,
      );
      expect(focusablePlaceholders).toHaveLength(0);

      // Anuncio sr-only y aria-busy del contenedor del menú
      expect(screen.getByText('Cargando navegación')).toHaveAttribute('role', 'status');
      expect(screen.getByRole('navigation', { name: 'Menú principal' })).toHaveAttribute(
        'aria-busy',
        'true',
      );
    });

    it('CA-NAV-04: con datos ya resueltos ningún ítem visible se oculta después (sin flash)', () => {
      mockPermissionsReady([AccessPermissionKey.SETTINGS_READ]);

      renderSidebar();

      // Resuelto: los ítems con permiso están y los que no, no existen;
      // no hay estado intermedio con ítems reales que luego desaparecen.
      expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Suscriptores' })).not.toBeInTheDocument();
      expect(screen.queryByText('Cargando navegación')).not.toBeInTheDocument();
    });

    it('CA-NAV-05: con el endpoint en error degrada al filtrado estático sin mensajes', () => {
      mockPermissionsStatus('degraded');

      renderSidebar();

      // Filtrado estático: mismos ítems que hoy para SUPPORT
      expect(screen.getByRole('link', { name: 'Mesa de ayuda' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Operaciones' })).toBeInTheDocument();
      expect(screen.queryByText(/No pudimos/i)).not.toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Menú principal' })).not.toHaveAttribute(
        'aria-busy',
      );
    });

    it('CA-NAV-06: no-ADMIN con set vacío en ready cae a filtrado estático (tripwire)', () => {
      useAuthMock.mockReturnValue({ user: { role: UserRole.SUPPORT } });
      mockPermissionsStatus('ready', []);

      renderSidebar();

      expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Mesa de ayuda' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
    });

    it('CA-NAV-09: un grupo sin ítems visibles no renderiza su encabezado', () => {
      mockPermissionsReady(
        ALL_NAV_PERMISSIONS.filter(
          (key) =>
            key !== AccessPermissionKey.SETTINGS_READ &&
            key !== AccessPermissionKey.USERS_READ &&
            key !== AccessPermissionKey.COMMERCIAL_CATALOG_READ,
        ),
      );

      renderSidebar();

      expect(screen.getByText('Menú')).toBeInTheDocument();
      expect(screen.queryByText('Administración')).not.toBeInTheDocument();
    });
  });
});
