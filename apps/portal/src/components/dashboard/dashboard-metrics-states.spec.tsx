import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Calendar } from 'lucide-react';
import { PortalDashboardMetric } from '@/components/shared/portal-ui';

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
 * C-8 · contratos de métrica del inicio (null / loading / error)
 * sobre el primitive compartido usado por DashboardClient.
 */
describe('Dashboard metrics states (C-8)', () => {
  it('value null no inventa cero', () => {
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

  it('error muestra reintento', async () => {
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
    await user.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
