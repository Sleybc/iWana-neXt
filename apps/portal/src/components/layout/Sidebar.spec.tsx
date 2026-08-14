import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { UserRole } from '@iwana/shared';
import { Sidebar } from './Sidebar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

const useAuthMock = jest.fn();

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
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

  it('alinea el nav con el inicio: Oportunidades, Programación, Usuarios y accesos; sin Reportes', () => {
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Oportunidades' })).toHaveAttribute(
      'href',
      '/dashboard/crm/expedientes',
    );
    expect(screen.getByRole('link', { name: 'Programación' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling',
    );
    expect(screen.getByRole('link', { name: 'Usuarios y accesos' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
    expect(screen.queryByRole('link', { name: 'CRM' })).not.toBeInTheDocument();
    expect(screen.queryByText('Programacion')).not.toBeInTheDocument();
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Siguiente fase/i)).not.toBeInTheDocument();
    expect(screen.getByText('Menú')).toBeInTheDocument();
    expect(screen.getByText('Administración')).toBeInTheDocument();
  });
});
