import { fireEvent, render, screen } from '@testing-library/react';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { DashboardMetricStrip, type DashboardMetricModel } from './DashboardMetricStrip';

const fourChips: DashboardMetricModel[] = [
  { id: 's1', label: 'Activas', count: 2, tone: 'primary', href: '/tenants?status=ACTIVE' },
  { id: 's2', label: 'En configuración', count: 1, tone: 'warning' },
  { id: 's3', label: 'Requieren atención', count: 0, tone: 'error' },
  { id: 's4', label: 'Cambios esta semana', count: 3, tone: 'neutral' },
];

const threeChips = fourChips.slice(0, 3);

function gridOf(name: string) {
  return screen.getByRole('region', { name }).querySelector('.grid');
}

describe('DashboardMetricStrip', () => {
  it('sin props nuevas conserva eyebrow, aria-label y 4 columnas del home', () => {
    render(<DashboardMetricStrip metrics={fourChips} isLoading={false} />);

    expect(
      screen.getByRole('region', { name: PLATFORM_UI_COPY.dashboard.summaryEyebrow }),
    ).toBeInTheDocument();
    expect(screen.getByText(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).toHaveClass(
      'portal-eyebrow',
    );
    expect(gridOf(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).toHaveClass('xl:grid-cols-4');
    expect(gridOf(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).not.toHaveClass('xl:grid-cols-3');
  });

  it('en carga sin skeletonCount pinta 4 skeletons en 4 columnas', () => {
    const { container } = render(<DashboardMetricStrip metrics={[]} isLoading />);

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(4);
    expect(gridOf(PLATFORM_UI_COPY.dashboard.summaryEyebrow)).toHaveClass('xl:grid-cols-4');
  });

  it('con 3 chips usa xl:grid-cols-3', () => {
    render(
      <DashboardMetricStrip
        metrics={threeChips}
        isLoading={false}
        eyebrow="Directorio"
        ariaLabel="Directorio"
      />,
    );

    expect(gridOf('Directorio')).toHaveClass('xl:grid-cols-3');
    expect(gridOf('Directorio')).not.toHaveClass('xl:grid-cols-4');
    expect(screen.getByText('Directorio')).toHaveClass('portal-eyebrow');
  });

  it('en carga con skeletonCount=3 usa 3 skeletons y xl:grid-cols-3', () => {
    const { container } = render(
      <DashboardMetricStrip
        metrics={[]}
        isLoading
        skeletonCount={3}
        eyebrow="Directorio"
        ariaLabel="Directorio"
      />,
    );

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(gridOf('Directorio')).toHaveClass('xl:grid-cols-3');
  });

  it('pinta enlace, cifra 0 como article y error con reintento (contrato DS §3)', () => {
    const { container, rerender } = render(
      <DashboardMetricStrip metrics={fourChips} isLoading={false} />,
    );

    expect(screen.getByRole('link', { name: /Activas|Ver/ })).toHaveAttribute(
      'href',
      '/tenants?status=ACTIVE',
    );
    const zero = screen.getByText('Requieren atención').closest('article');
    expect(zero).not.toBeNull();
    expect(zero?.className).toContain('bg-iwana-surface-soft');
    expect(container.innerHTML).not.toMatch(/rose-|rounded-3xl|\[[0-9]+px\]/);

    const onRetry = jest.fn();
    rerender(
      <DashboardMetricStrip
        metrics={fourChips}
        isLoading={false}
        error="Sin datos."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Sin datos.');
    fireEvent.click(screen.getByRole('button', { name: PLATFORM_UI_COPY.dashboard.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('con onActivate y cifra > 0 es un botón', () => {
    const onActivate = jest.fn();
    render(
      <DashboardMetricStrip
        metrics={[
          {
            id: 'x',
            label: 'Atención',
            count: 2,
            tone: 'error',
            ariaLabel: 'Ver desglose',
            onActivate,
          },
        ]}
        isLoading={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver desglose' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('F1-D1 (a): una cifra 0 va en tono neutral aunque la métrica pida otro (§3 empty)', () => {
    render(<DashboardMetricStrip metrics={fourChips} isLoading={false} />);
    const zero = screen.getByText('Requieren atención').closest('[class*="border-"]');
    expect(zero).toHaveClass('bg-iwana-surface-soft');
    expect(zero).not.toHaveClass('bg-error-50');
    const active = screen.getByRole('link', { name: /Activas/ });
    expect(active).toHaveClass('bg-iwana-primary-50');
  });
});
