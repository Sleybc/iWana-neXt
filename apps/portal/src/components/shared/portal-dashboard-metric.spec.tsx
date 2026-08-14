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

  it('omite la ranura eyebrow cuando no se pasa o viene vacía (B-1 / DS v1.3)', () => {
    const { rerender, container } = render(
      <PortalDashboardMetric label="Visitas de hoy" value={12} icon={Calendar} />,
    );

    expect(container.querySelector('.portal-eyebrow-muted')).toBeNull();
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    rerender(
      <PortalDashboardMetric eyebrow="   " label="Visitas de hoy" value={12} icon={Calendar} />,
    );
    expect(container.querySelector('.portal-eyebrow-muted')).toBeNull();

    rerender(
      <PortalDashboardMetric eyebrow="Agenda" label="Visitas de hoy" value={12} icon={Calendar} />,
    );
    expect(screen.getByText('Agenda')).toBeInTheDocument();
  });

  it('en danger/warning el eyebrow usa escalón AA gray-700 (DS §1.7)', () => {
    const { rerender } = render(
      <PortalDashboardMetric
        eyebrow="Crítico"
        label="Casos abiertos"
        value={4}
        accent="danger"
        icon={Calendar}
      />,
    );

    expect(screen.getByText('Crítico')).toHaveClass('portal-eyebrow-muted');
    expect(screen.getByText('Crítico')).toHaveClass('text-gray-700');
    expect(screen.getByText('Crítico')).toHaveClass('dark:text-gray-200');

    rerender(
      <PortalDashboardMetric
        eyebrow="Atención"
        label="Pendientes"
        value={2}
        accent="warning"
        icon={Calendar}
      />,
    );

    expect(screen.getByText('Atención')).toHaveClass('portal-eyebrow-muted');
    expect(screen.getByText('Atención')).toHaveClass('text-gray-700');

    rerender(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={12}
        accent="neutral"
        icon={Calendar}
      />,
    );

    expect(screen.getByText('Agenda')).toHaveClass('portal-eyebrow-muted');
    expect(screen.getByText('Agenda')).not.toHaveClass('text-gray-700');
  });

  it('usa cáscara default min-h-24 y no reserva 148 px (DS v1.4 / v1.6)', () => {
    const { container } = render(
      <PortalDashboardMetric label="Visitas de hoy" value={12} icon={Calendar} />,
    );

    expect(container.firstElementChild?.className).toMatch(/min-h-24/);
    expect(container.firstElementChild?.className).toMatch(/flex-col/);
    expect(container.firstElementChild?.className).not.toMatch(/min-h-\[148px\]/);
    expect(screen.getByText('12')).toHaveClass('text-2xl');
  });

  it('con density=compact usa KPI vertical min-h-24 flex-col text-2xl rounded-2xl (DS v1.7 / U-D3)', () => {
    const { container } = render(
      <PortalDashboardMetric
        density="compact"
        label="Visitas de hoy"
        value={12}
        description="Programadas para la jornada"
        icon={Calendar}
      />,
    );

    expect(container.firstElementChild?.className).toMatch(/min-h-24/);
    expect(container.firstElementChild?.className).toMatch(/flex-col/);
    expect(container.firstElementChild?.className).toMatch(/rounded-2xl/);
    expect(container.firstElementChild?.className).not.toMatch(/min-h-14/);
    expect(container.firstElementChild?.className).not.toMatch(/flex-row/);
    expect(screen.getByText('12')).toHaveClass('text-2xl');
    expect(screen.getByText('Programadas para la jornada').className).toMatch(/sr-only/);
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
