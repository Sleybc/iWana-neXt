import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendar } from 'lucide-react';
import { PortalDashboardMetric, PortalNavListRow, interactiveFocusClassName } from './portal-ui';

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    className,
    'aria-busy': ariaBusy,
    'aria-label': ariaLabel,
    ...props
  }: React.PropsWithChildren<{
    href: string;
    className?: string;
    'aria-busy'?: boolean;
    'aria-label'?: string;
  }>) {
    return (
      <a href={href} className={className} aria-busy={ariaBusy} aria-label={ariaLabel} {...props}>
        {children}
      </a>
    );
  };
});

describe('PortalDashboardMetric', () => {
  it('rinde enlace navegable con href y foco normado', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={12}
        href="/dashboard/scheduling?filter=today"
        icon={Calendar}
      />,
    );

    const link = screen.getByRole('link', { name: 'Visitas de hoy' });
    expect(link).toHaveAttribute('href', '/dashboard/scheduling?filter=today');
    expect(link.className.split(/\s+/)).toEqual(
      expect.arrayContaining(interactiveFocusClassName.split(/\s+/)),
    );
  });

  it('muestra valor nulo con texto accesible sin cifras mono', () => {
    const { container } = render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={null}
        emptyLabel="Sin dato disponible"
        icon={Calendar}
      />,
    );

    const empty = screen.getByText('Sin dato disponible');
    expect(empty).toHaveClass('text-gray-700');
    expect(empty).not.toHaveClass('font-mono');
    expect(empty).not.toHaveClass('uppercase');
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('en idle con valor usa cifras tabulares mono', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={1284}
        icon={Calendar}
      />,
    );

    const value = screen.getByText('1.284');
    expect(value).toHaveClass('font-mono');
    expect(value).toHaveClass('tabular-nums');
  });

  it('en loading marca aria-busy y sustituye solo la cifra por esqueleto', () => {
    const { container } = render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={12}
        state="loading"
        href="/dashboard/scheduling"
        icon={Calendar}
      />,
    );

    const link = screen.getByRole('link', { name: 'Visitas de hoy' });
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"].animate-pulse')).toBeTruthy();
  });

  it('en error conserva rótulo y eyebrow y no emite aria-live propio', () => {
    const onRetry = jest.fn();
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={12}
        state="error"
        errorLabel="No disponible"
        onRetry={onRetry}
        icon={Calendar}
      />,
    );

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('delta de avance usa badge lima; acento no admite lima decorativo', () => {
    const { container } = render(
      <PortalDashboardMetric
        eyebrow="Configuración"
        label="Pasos completados"
        value={3}
        total={5}
        accent="neutral"
        delta={{ label: '60 % completado', tone: 'progress' }}
        icon={Calendar}
      />,
    );

    expect(screen.getByText('60 % completado')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/accent.*secondary|tone=["']secondary/);
    expect(container.firstElementChild?.className).not.toMatch(
      /secondary-50|bg-iwana-secondary(?!-)/,
    );
  });
});

describe('PortalNavListRow', () => {
  it('con href rinde enlace con foco normado y altura táctil ≥44 px', () => {
    render(
      <PortalNavListRow title="Agenda de hoy" meta="Programación" href="/dashboard/scheduling" />,
    );

    const link = screen.getByRole('link', { name: /Agenda de hoy/i });
    expect(link).toHaveAttribute('href', '/dashboard/scheduling');
    expect(link.className.split(/\s+/)).toEqual(
      expect.arrayContaining(interactiveFocusClassName.split(/\s+/)),
    );
    expect(link.className).toMatch(/min-h-11/);
  });

  it('conserva onClick en botón con foco normado', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(<PortalNavListRow title="Abrir agenda" onClick={onClick} />);

    const button = screen.getByRole('button', { name: /Abrir agenda/i });
    expect(button.className.split(/\s+/)).toEqual(
      expect.arrayContaining(interactiveFocusClassName.split(/\s+/)),
    );
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('con href deshabilitado no rinde enlace', () => {
    render(
      <PortalNavListRow
        title="Módulo futuro"
        href="/dashboard/reports"
        disabled
        trailing="Próximamente"
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Módulo futuro')).toBeInTheDocument();
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
  });
});
