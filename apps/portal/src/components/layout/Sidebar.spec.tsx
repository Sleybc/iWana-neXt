import React from 'react';
import { render, screen } from '@testing-library/react';
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

describe('Sidebar', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { role: UserRole.SUPPORT },
    });
  });

  it('usa brandingProductName como nombre visible de la empresa cuando existe', () => {
    render(
      <Sidebar
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
        profile={
          {
            id: 'tenant-1',
            name: 'iWana',
            brandingProductName: 'Gestion C',
            showTenantName: true,
            sealLightUrl: null,
            sealDarkUrl: null,
          } as never
        }
      />,
    );

    expect(screen.getAllByText('Gestion C').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tenant-seal')[0]).toHaveTextContent('Gestion C');
  });

  it('muestra el acceso a Mesa de ayuda en el menu principal', () => {
    render(
      <Sidebar
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
        profile={null}
      />,
    );

    const helpDeskLink = screen.getByRole('link', { name: 'Mesa de ayuda' });
    expect(helpDeskLink).toHaveAttribute('href', '/dashboard/assurance');
  });

  it('muestra el acceso a Operaciones en el menu principal', () => {
    render(
      <Sidebar
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
        profile={null}
      />,
    );

    const operationsLink = screen.getByRole('link', { name: 'Operaciones' });
    expect(operationsLink).toHaveAttribute('href', '/dashboard/operations');
  });

  it('muestra el acceso a Inventario en el menu principal', () => {
    render(
      <Sidebar
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
        profile={null}
      />,
    );

    const inventoryLink = screen.getByRole('link', { name: 'Inventario' });
    expect(inventoryLink).toHaveAttribute('href', '/dashboard/inventory');
  });

  it('oculta Operaciones cuando el rol no tiene acceso al modulo', () => {
    useAuthMock.mockReturnValue({
      user: { role: UserRole.ACCOUNTANT },
    });

    render(
      <Sidebar
        desktopCollapsed={false}
        setDesktopCollapsed={jest.fn()}
        mobileOpen={false}
        setMobileOpen={jest.fn()}
        profile={null}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Operaciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inventario' })).not.toBeInTheDocument();
  });
});
