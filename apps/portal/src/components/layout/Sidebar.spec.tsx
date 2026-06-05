import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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
});
