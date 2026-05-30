import { render, screen } from '@testing-library/react';
import { QuickActionsPanel } from './QuickActionsPanel';

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

describe('QuickActionsPanel', () => {
  it('muestra solo accesos disponibles y oculta Seguridad', () => {
    render(<QuickActionsPanel />);

    expect(screen.getByRole('link', { name: /Comercial/i })).toHaveAttribute(
      'href',
      '/dashboard/commercial',
    );
    expect(screen.getByRole('link', { name: /Configuración/i })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
    expect(screen.getByRole('link', { name: /Usuarios/i })).toHaveAttribute(
      'href',
      '/dashboard/users',
    );
    expect(screen.queryByText('Seguridad')).not.toBeInTheDocument();
  });

  it('mantiene los modulos futuros como tarjetas no navegables y actualiza el contador', () => {
    render(<QuickActionsPanel />);

    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Reportes/i })).not.toBeInTheDocument();
    expect(screen.getByText('3 accesos disponibles hoy')).toBeInTheDocument();
  });
});
