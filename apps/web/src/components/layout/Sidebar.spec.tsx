import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { interactiveFocusClassName } from '@iwana/ui';
import { Sidebar } from './Sidebar';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/components/branding/PlatformBrandingProvider', () => ({
  usePlatformBrandingAssets: () => ({
    branding: { productName: 'iWana neXt' },
    logoUrl: '/brand/iwiso6.png',
    isLoading: false,
    refresh: jest.fn(),
  }),
}));

const NAV_DESTINATIONS = [
  { href: '/dashboard', label: PLATFORM_UI_COPY.navigation.home },
  { href: '/tenants', label: PLATFORM_UI_COPY.navigation.tenants },
  { href: '/users', label: PLATFORM_UI_COPY.navigation.users },
  { href: '/audit-logs', label: PLATFORM_UI_COPY.navigation.audit },
  { href: '/settings', label: PLATFORM_UI_COPY.navigation.settings },
] as const;

function renderSidebar(overrides?: Partial<React.ComponentProps<typeof Sidebar>>) {
  const setDesktopCollapsed = jest.fn();
  const setMobileOpen = jest.fn();
  render(
    <Sidebar
      desktopCollapsed={false}
      setDesktopCollapsed={setDesktopCollapsed}
      mobileOpen
      setMobileOpen={setMobileOpen}
      {...overrides}
    />,
  );
  return { setDesktopCollapsed, setMobileOpen };
}

describe('PLATFORM_UI_COPY.shell', () => {
  it('congela copy de nav/shell sin Gobierno ni grupos', () => {
    expect(PLATFORM_UI_COPY.shell.workspaceSubtitle).toBe('Consola de plataforma.');
    expect(PLATFORM_UI_COPY.shell.openMenu).toBe('Abrir menú');
    expect(PLATFORM_UI_COPY.shell.closeMenu).toBe('Cerrar menú');
    expect(PLATFORM_UI_COPY.shell.navLandmark).toBe('Navegación principal');
    expect(PLATFORM_UI_COPY.shell.menuLandmark).toBe('Menú principal');
    expect(PLATFORM_UI_COPY).not.toHaveProperty('navigationGroups');
    expect(JSON.stringify(PLATFORM_UI_COPY.shell)).not.toMatch(/[Gg]obierno/);
    expect(JSON.stringify(PLATFORM_UI_COPY.navigation)).not.toMatch(/[Gg]obierno/);
  });
});

describe('Sidebar (CA-NAV)', () => {
  it('renderiza una lista plana de cinco destinos en orden canónico', () => {
    renderSidebar();

    const nav = screen.getByRole('navigation', { name: PLATFORM_UI_COPY.shell.menuLandmark });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links.map((link) => [link.getAttribute('href'), link.textContent?.trim()])).toEqual(
      NAV_DESTINATIONS.map((item) => [item.href, item.label]),
    );
    expect(nav.querySelectorAll('ul')).toHaveLength(1);
    expect(nav.querySelector('hr')).toBeNull();
    expect(screen.queryByText(/operaci[oó]n/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gobierno/i)).not.toBeInTheDocument();
  });

  it('usa landmarks y cierre desde el catálogo, con aria-current en la ruta activa', () => {
    renderSidebar();

    const aside = screen.getByRole('complementary', { name: PLATFORM_UI_COPY.shell.navLandmark });
    expect(aside).toHaveClass('bg-white');
    expect(aside.className).toContain('z-(--z-shell-panel)');
    expect(aside.className).toContain('dark:bg-dark-surface-2');
    // BLOQUEO-3 / navy Superado: fill blanco es la receta; no reabrir bg-iwana-primary.
    expect(aside.className).not.toMatch(/backdrop-blur|bg-white\/95|bg-iwana-primary/);

    expect(screen.getByRole('button', { name: PLATFORM_UI_COPY.shell.closeMenu })).toHaveClass(
      'h-11',
      'w-11',
    );

    const home = within(screen.getByRole('navigation')).getByRole('link', {
      name: PLATFORM_UI_COPY.navigation.home,
    });
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home.className).toMatch(/min-h-11/);
    expect(home.className).toContain(interactiveFocusClassName);
    expect(home.querySelector('[aria-hidden="true"]')?.className).toMatch(
      /h-6 w-1.*rounded-r-full.*bg-iwana-secondary/,
    );

    const brandExpanded = within(aside).getByRole('link', { name: /iWana neXt/i });
    expect(brandExpanded.className).toMatch(/min-h-11/);
    expect(brandExpanded.className).toContain(interactiveFocusClassName);

    const brandCollapsed = within(aside).getByRole('link', {
      name: PLATFORM_UI_COPY.shell.goHome,
    });
    expect(brandCollapsed.className).toMatch(/min-h-11/);
    expect(brandCollapsed.className).toContain(interactiveFocusClassName);

    expect(
      screen.getByRole('button', { name: PLATFORM_UI_COPY.shell.closeMenu }).className,
    ).toContain(interactiveFocusClassName);
  });

  it('cierra el drawer mobile con Escape', () => {
    const { setMobileOpen } = renderSidebar({ mobileOpen: true });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(setMobileOpen).toHaveBeenCalledWith(false);
  });

  it('expone title en ítems cuando el panel está colapsado', () => {
    renderSidebar({ desktopCollapsed: true, mobileOpen: false });

    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: PLATFORM_UI_COPY.navigation.tenants,
      }),
    ).toHaveAttribute('title', PLATFORM_UI_COPY.navigation.tenants);
  });
});
