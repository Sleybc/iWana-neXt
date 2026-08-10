import { render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('link', { name: 'Usuarios y accesos' })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
    expect(screen.getByRole('link', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Fase siguiente/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accesos disponibles hoy/i)).not.toBeInTheDocument();
  });

  it('TECHNICIAN solo ve programación y perfil (sin comerciales ni usuarios)', () => {
    render(<QuickActionsPanel role={UserRole.TECHNICIAN} />);

    expect(screen.getByRole('link', { name: 'Programación' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling',
    );
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Comercial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios y accesos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  it('objetivos táctiles ≥44px (min-h-11) en cada acceso', () => {
    render(<QuickActionsPanel role={UserRole.SALES} />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toMatch(/min-h-11/);
    }
  });

  it('lista en una columna sin truncate en descripciones', () => {
    const { container } = render(<QuickActionsPanel role={UserRole.ADMIN} />);
    expect(container.querySelector('.truncate')).toBeNull();
    expect(container.querySelector('ul')?.className).toMatch(/flex-col/);
  });

  it('mapa §4.14: SUBSCRIBER solo perfil', () => {
    expect(__listQuickAccessLabelsForRole(UserRole.SUBSCRIBER)).toEqual(['Mi perfil']);
  });
});
