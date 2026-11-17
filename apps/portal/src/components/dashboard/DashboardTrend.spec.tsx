import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardTrend } from './DashboardTrend';
import { buildDashboardTrendTabs, type DashboardTrendTab } from './dashboard-trend';
import {
  billingSummaryFixture,
  casesSeriesFixture,
  subscribersSummaryFixture,
} from './dashboard-series-test-fixtures';

// La gráfica real (Recharts, carga diferida) se prueba en `@iwana/ui`; aquí basta su resumen.
jest.mock('@/components/shared/portal-chart', () => ({
  PortalChart: ({ summary }: { summary: string }) => <div role="img" aria-label={summary} />,
}));

function allTabs(): DashboardTrendTab[] {
  return buildDashboardTrendTabs({
    trendIds: ['subscribers', 'collections', 'cases'],
    subscribers: { data: subscribersSummaryFixture(), updating: false },
    collections: { data: billingSummaryFixture(), updating: false },
    cases: { data: casesSeriesFixture(), updating: false },
  });
}

describe('DashboardTrend', () => {
  it('sin pestañas y sin lecturas pendientes no monta el bloque (CA-PA-05)', () => {
    const { container } = render(<DashboardTrend tabs={[]} loading={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sin pestañas mientras llega la primera lectura ocupa su sitio con la silueta', () => {
    render(<DashboardTrend tabs={[]} loading />);
    expect(screen.getByRole('heading', { name: 'Tendencia' })).toBeInTheDocument();
    expect(screen.getByText('Cargando gráfica')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('con una sola serie pinta su gráfica sin selector', () => {
    const [collections] = allTabs().filter((tab) => tab.id === 'collections');
    render(<DashboardTrend tabs={[collections!]} loading={false} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Facturado y recaudado/ })).toBeInTheDocument();
    expect(screen.getByText(collections!.subtitle)).toBeInTheDocument();
  });

  it('con varias series ofrece pestañas y conmuta la gráfica y el subtítulo', async () => {
    const user = userEvent.setup();
    const tabs = allTabs();
    render(<DashboardTrend tabs={tabs} loading={false} />);

    expect(screen.getByRole('tablist', { name: 'Serie de la tendencia' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Suscriptores',
      'Recaudo',
      'Casos',
    ]);
    expect(screen.getByRole('tab', { name: 'Suscriptores' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('img', { name: /Altas y retiros/ })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Recaudo' }));
    expect(screen.getByRole('img', { name: /Facturado y recaudado/ })).toBeInTheDocument();
    expect(screen.getByText(tabs[1]!.subtitle)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Casos' }));
    expect(screen.getByRole('img', { name: /Casos creados y resueltos/ })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('una pestaña fuera del registro no pinta gráfica (guarda exhaustiva en runtime)', () => {
    // Dato fuera del tipo: el `default` del switch devuelve la entrada tal cual, sin PortalChart.
    const unknownTab = 'pestaña-desconocida' as unknown as DashboardTrendTab;
    render(<DashboardTrend tabs={[unknownTab]} loading={false} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('pestaña-desconocida')).toBeInTheDocument();
  });
});
