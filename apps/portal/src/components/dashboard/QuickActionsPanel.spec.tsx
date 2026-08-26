import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole } from '@iwana/shared';
import { QuickActionsPanel, __listQuickAccessLabelsForRole } from './QuickActionsPanel';

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    className,
    'aria-label': ariaLabel,
    ...props
  }: React.PropsWithChildren<{ href: string; className?: string; 'aria-label'?: string }>) {
    return (
      <a href={href} className={className} aria-label={ariaLabel} {...props}>
        {children}
      </a>
    );
  };
});

describe('QuickActionsPanel', () => {
  it('filtra por rol ADMIN y omite Reportes / Fase siguiente', () => {
    render(<QuickActionsPanel role={UserRole.ADMIN} />);

    expect(screen.getByRole('link', { name: 'Comercial' })).toHaveAttribute(
      'href',
      '/dashboard/commercial',
    );
    expect(screen.getByRole('button', { name: /Ver más/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Fase siguiente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accesos disponibles hoy/i)).not.toBeInTheDocument();
  });

  it('ADMIN con Ver más revela el resto de accesos (tope 5, U-D2)', async () => {
    const user = userEvent.setup();
    render(<QuickActionsPanel role={UserRole.ADMIN} />);

    expect(
      screen.getAllByRole('link').filter((el) => el.getAttribute('href')?.startsWith('/dashboard')),
    ).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /Ver más/i }));
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
    expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
  });

  it('TECHNICIAN solo ve programación y perfil (sin comerciales ni usuarios)', () => {
    render(<QuickActionsPanel role={UserRole.TECHNICIAN} />);

    expect(screen.getByRole('link', { name: 'Programación' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling',
    );
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Comercial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver más/i })).not.toBeInTheDocument();
  });

  it('objetivos táctiles ≥44px (min-h-11) en cada acceso', () => {
    render(<QuickActionsPanel role={UserRole.SALES} />);

    const links = screen.getAllByRole('link').filter((el) => el.className.includes('min-h-11'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toMatch(/min-h-11/);
    }
  });

  it('grid de dos columnas y meta sr-only (U-D2)', () => {
    const { container } = render(<QuickActionsPanel role={UserRole.ADMIN} />);
    expect(container.querySelector('ul')?.className).toMatch(/sm:grid-cols-2/);
    expect(container.querySelector('.line-clamp-1')).toBeNull();
    expect(container.querySelector('.sr-only')).toBeTruthy();
  });

  it('mapa §4.14: SUBSCRIBER solo perfil', () => {
    expect(__listQuickAccessLabelsForRole(UserRole.SUBSCRIBER)).toEqual(['Mi perfil']);
  });

  it('muestra estado vacío y destino de perfil para un rol sin accesos', () => {
    render(<QuickActionsPanel role={'ROLE_NOT_REGISTERED' as UserRole} />);

    expect(screen.getByText('Sin destinos disponibles')).toBeInTheDocument();
    expect(screen.getByText(/no tiene accesos rápidos/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi perfil' })).toHaveAttribute(
      'href',
      '/dashboard/profile',
    );
  });
});
