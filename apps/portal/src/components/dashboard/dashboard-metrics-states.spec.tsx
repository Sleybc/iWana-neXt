import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendar } from 'lucide-react';
import {
  PortalAlert,
  PortalDashboardMetric,
  portalMetricCardShellClassName,
} from '@/components/shared/portal-ui';
import { PageHeader } from '@/components/layout/PageHeader';

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

/**
 * D-1 / D-2 / D-7 · estados de métrica, null honesto, contraste AA por token
 * y sombra dual iWana sobre la superficie del inicio.
 */
describe('Dashboard metrics states (D-1/D-2/D-7)', () => {
  it('value null no inventa cero (CA-V2-11)', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={null}
        emptyLabel="Sin dato disponible"
        icon={Calendar}
      />,
    );

    expect(screen.getByText('Sin dato disponible')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('dato no disponible usa tokens AA en claro y oscuro (CA-V2-07/11)', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={null}
        emptyLabel="Sin dato disponible"
        icon={Calendar}
      />,
    );

    const empty = screen.getByText('Sin dato disponible');
    expect(empty.className).toMatch(/text-gray-700/);
    expect(empty.className).toMatch(/dark:text-gray-200/);
    expect(empty.className).not.toMatch(/text-gray-400/);
    expect(empty.className).not.toMatch(/dark:text-gray-500/);
  });

  it('loading reserva la ranura de cifra', () => {
    const { container } = render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={null}
        state="loading"
        icon={Calendar}
      />,
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
  });

  it('error muestra reintento y conserva rótulo (estado error)', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();

    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={null}
        state="error"
        onRetry={onRetry}
        icon={Calendar}
      />,
    );

    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error de bloque PortalAlert no usa gradiente arbitrario (H-01 / backgroundImage)', () => {
    const { container } = render(
      <PortalAlert variant="error" title="No pudimos cargar el resumen" live="polite" />,
    );

    const alert =
      container.querySelector('[role="status"], [role="alert"]') ?? container.firstElementChild;
    expect(alert).toBeTruthy();
    const className = (alert as HTMLElement).className;
    expect(className).not.toMatch(/bg-\[linear-gradient/);
    expect(className).toMatch(/dark:bg-red-950/);
    expect(className).toMatch(/bg-red-50/);
  });

  it('idle cargado muestra cifra tabular sin inventar null como cero', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={3}
        href="/dashboard/scheduling"
        icon={Calendar}
      />,
    );

    const link = screen.getByRole('link', { name: 'Visitas de hoy' });
    expect(link).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('Sin dato disponible')).not.toBeInTheDocument();
  });

  it('vacío accionable: value 0 es cero real, distinto de null', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={0}
        emptyLabel="Sin dato disponible"
        icon={Calendar}
      />,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('Sin dato disponible')).not.toBeInTheDocument();
  });

  it('cáscara de métrica usa sombra dual soft + active en interacción (D-7)', () => {
    render(
      <PortalDashboardMetric
        eyebrow="Agenda"
        label="Visitas de hoy"
        value={2}
        href="/dashboard/scheduling"
        icon={Calendar}
      />,
    );

    const link = screen.getByRole('link', { name: 'Visitas de hoy' });
    expect(portalMetricCardShellClassName).toMatch(/shadow-iwana-soft/);
    expect(link.className).toMatch(/shadow-iwana-soft/);
    expect(link.className).toMatch(/hover:shadow-iwana-active/);
  });

  it('PageHeader del inicio usa sombra soft de reposo (D-7 firma)', () => {
    const { container } = render(
      <PageHeader title="ISP Prueba" subtitle="Última lectura: hace un momento" />,
    );

    const header = container.firstElementChild as HTMLElement;
    expect(header.className).toMatch(/shadow-iwana-soft/);
    expect(header.className).not.toMatch(/\bshadow-sm\b/);
    expect(header.className).not.toMatch(/shadow-iwana-card/);
  });

  it('description sobre accent danger/warning usa escalón muted v1.2 (CA-V2-07)', () => {
    const { rerender } = render(
      <PortalDashboardMetric
        eyebrow="Mesa de ayuda"
        label="Casos en riesgo de incumplir"
        value={2}
        description="Acuerdo de servicio en riesgo"
        accent="danger"
      />,
    );

    const dangerDescription = screen.getByText('Acuerdo de servicio en riesgo');
    expect(dangerDescription.className).toMatch(/text-gray-700/);
    expect(dangerDescription.className).toMatch(/dark:text-gray-200/);
    expect(dangerDescription.className).not.toMatch(/text-gray-500/);

    rerender(
      <PortalDashboardMetric
        eyebrow="Comercial"
        label="Planes sin precio vigente"
        value={1}
        description="Catálogo incompleto para facturar"
        accent="primary"
      />,
    );

    const primaryDescription = screen.getByText('Catálogo incompleto para facturar');
    expect(primaryDescription.className).toMatch(/text-gray-500/);
    expect(primaryDescription.className).toMatch(/dark:text-gray-400/);
  });
});
