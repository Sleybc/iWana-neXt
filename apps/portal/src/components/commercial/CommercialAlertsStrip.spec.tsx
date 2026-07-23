import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { CommercialAlertsStrip } from './CommercialAlertsStrip';

function buildSummary(
  overrides: Partial<CommercialDashboardSummary> = {},
): CommercialDashboardSummary {
  return {
    plansCount: 4,
    activePlansCount: 3,
    productsCount: 6,
    activeProductsCount: 5,
    servicesCount: 2,
    activeServicesCount: 2,
    bundlesCount: 1,
    activeBundlesCount: 1,
    promotionsCount: 3,
    activePromotionsCount: 2,
    compatibilityRulesCount: 4,
    activeCompatibilityRulesCount: 3,
    taxRulesCount: 5,
    activeTaxRulesCount: 4,
    offersExpiringSoonCount: 0,
    offersNearUseLimitCount: 0,
    offersAtRiskCount: 0,
    catalogActiveCount: 10,
    catalogSellableActiveCount: 10,
    catalogIncompleteActiveCount: 0,
    missingCurrentPriceCount: 0,
    activeBundlesWithInactiveItemsCount: 0,
    taxRulesCoverageGapCount: 0,
    rulesGapCount: 0,
    activeOffersCount: 3,
    attentionItems: [],
    recentChanges: [],
    ...overrides,
  };
}

describe('CommercialAlertsStrip', () => {
  it('muestra skeleton mientras carga, sin depender del summary', () => {
    render(<CommercialAlertsStrip summary={null} isLoading />);

    expect(screen.getByRole('region', { name: 'Cargando alertas operativas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cargando alertas operativas' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('no renderiza contenedor cuando no hay summary y no está cargando', () => {
    const { container } = render(<CommercialAlertsStrip summary={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza contenedor en estado saludable', () => {
    const { container } = render(
      <CommercialAlertsStrip summary={buildSummary()} isLoading={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza las alertas activas con region etiquetada', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.getByRole('region', { name: 'Alertas operativas' })).toBeInTheDocument();
    expect(screen.getByText('Huecos en reglas')).toBeInTheDocument();
  });

  it('no anuncia las alertas de la tira como regiones live', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('navega al tab destino con el filtro de la alerta', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialAlertsStrip
        summary={buildSummary({ offersAtRiskCount: 2 })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver ofertas' }));

    expect(onNavigateTab).toHaveBeenCalledWith('bundles', { status: 'expiring' });
  });

  it('navega sin filtro cuando la alerta no lo declara', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialAlertsStrip
        summary={buildSummary({ catalogIncompleteActiveCount: 1 })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Completar catálogo' }));

    expect(onNavigateTab).toHaveBeenCalledWith('plans', { status: null });
  });

  it('omite las acciones cuando no hay handler de navegación', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.queryByRole('button', { name: 'Revisar reglas' })).not.toBeInTheDocument();
  });
});
