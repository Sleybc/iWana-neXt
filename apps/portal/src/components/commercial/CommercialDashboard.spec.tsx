import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { CommercialDashboard } from './CommercialDashboard';

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

describe('CommercialDashboard', () => {
  it('muestra skeleton de carga (5 KPIs + lista)', () => {
    const { container } = render(<CommercialDashboard summary={null} isLoading />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(7);
    expect(screen.getByLabelText('Cargando resumen comercial')).toBeInTheDocument();
  });

  it('muestra empty de error cuando no hay summary', () => {
    render(<CommercialDashboard summary={null} />);

    expect(screen.getByText('Indicadores no disponibles')).toBeInTheDocument();
  });

  it('muestra empty de primera vez sin KPIs', () => {
    render(
      <CommercialDashboard
        summary={buildSummary({
          plansCount: 0,
          activePlansCount: 0,
          productsCount: 0,
          activeProductsCount: 0,
          servicesCount: 0,
          activeServicesCount: 0,
          catalogActiveCount: 0,
          catalogSellableActiveCount: 0,
          activeOffersCount: 0,
        })}
      />,
    );

    expect(screen.getByText('Arma tu oferta comercial')).toBeInTheDocument();
    expect(screen.queryByText('Vencen pronto')).not.toBeInTheDocument();
    expect(screen.queryByText('Planes activos')).not.toBeInTheDocument();
  });

  it('estado saludable: 5 KPIs neutros, sin alertas y empty de atención', () => {
    const { container } = render(<CommercialDashboard summary={buildSummary()} />);

    expect(screen.getByText('Operación')).toBeInTheDocument();
    expect(screen.getByText('Vencen pronto')).toBeInTheDocument();
    expect(screen.getByText('Listos para vender')).toBeInTheDocument();
    expect(screen.getByText('Huecos en reglas')).toBeInTheDocument();
    expect(screen.getByText('Planes activos')).toBeInTheDocument();
    expect(screen.getByText('Ofertas vigentes')).toBeInTheDocument();
    expect(screen.queryByText('Productos activos')).not.toBeInTheDocument();
    expect(screen.queryByText('Ofertas en riesgo')).not.toBeInTheDocument();
    expect(screen.queryByText('Catálogo incompleto')).not.toBeInTheDocument();
    expect(screen.getByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByText('Sin cambios en los últimos 7 días.')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/accent.*primary|primary.*accent/);
  });

  it('lista Cambios recientes con labels en español y navega al tab destino', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialDashboard
        summary={buildSummary({
          recentChanges: [
            {
              occurredAt: '2026-07-22T15:30:00.000Z',
              action: 'promotion_started',
              entityType: 'promotion',
              entityName: 'Promo fibra',
              destinoTab: 'promotions',
            },
            {
              occurredAt: '2026-07-21T10:00:00.000Z',
              action: 'deactivated',
              entityType: 'bundle',
              entityName: 'Combo hogar',
              destinoTab: 'bundles',
            },
          ],
        })}
        onNavigateTab={onNavigateTab}
      />,
    );

    const section = screen.getByLabelText('Cambios recientes');
    expect(within(section).getByText('Promo fibra')).toBeInTheDocument();
    expect(within(section).getByText(/promoción iniciada/)).toBeInTheDocument();
    expect(within(section).getByText(/desactivado/)).toBeInTheDocument();
    expect(within(section).queryByText('promotion_started')).not.toBeInTheDocument();
    expect(within(section).queryByText('deactivated')).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /Crear/i })).not.toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: /Promo fibra/i }));
    expect(onNavigateTab).toHaveBeenCalledWith('promotions');
  });

  it('aplica acentos H10 warning/danger según riesgo y nunca primary', () => {
    render(
      <CommercialDashboard
        summary={buildSummary({
          offersAtRiskCount: 2,
          offersExpiringSoonCount: 1,
          offersNearUseLimitCount: 1,
          catalogIncompleteActiveCount: 3,
          catalogSellableActiveCount: 7,
          rulesGapCount: 4,
          attentionItems: [
            {
              id: 'a1',
              entityType: 'promotion',
              name: 'Promo verano',
              reason: 'expiring_soon',
              destinoTab: 'promotions',
              validTo: '2026-07-28T00:00:00.000Z',
            },
          ],
        })}
        onNavigateTab={jest.fn()}
      />,
    );

    const metrics = screen.getByLabelText('Indicadores comerciales');
    expect(within(metrics).getByRole('button', { name: /Vencen pronto/i })).toHaveClass(
      'border-amber-200',
    );
    expect(within(metrics).getByRole('button', { name: /Listos para vender/i })).toHaveClass(
      'border-rose-200',
    );
    expect(within(metrics).getByRole('button', { name: /Huecos en reglas/i })).toHaveClass(
      'border-rose-200',
    );
    expect(within(metrics).getByRole('button', { name: /Planes activos/i })).toHaveClass(
      'border-gray-200',
    );

    const metricButtons = within(metrics).getAllByRole('button');
    for (const button of metricButtons) {
      expect(button.className).not.toMatch(/border-iwana-primary/);
      expect(button.className).not.toMatch(/bg-iwana-primary-50/);
    }
  });

  it('lista Requiere atención con labels en español y navega al tab destino', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialDashboard
        summary={buildSummary({
          offersAtRiskCount: 1,
          attentionItems: [
            {
              id: 'promo-1',
              entityType: 'promotion',
              name: 'Promo fibra',
              reason: 'near_use_limit',
              destinoTab: 'promotions',
              usesRemaining: 2,
            },
            {
              id: 'plan-1',
              entityType: 'plan',
              name: 'Plan 100',
              reason: 'missing_current_price',
              destinoTab: 'plans',
            },
          ],
        })}
        onNavigateTab={onNavigateTab}
      />,
    );

    const section = screen.getByLabelText('Requiere atención');
    expect(within(section).getByText('Promo fibra')).toBeInTheDocument();
    expect(within(section).getByText(/Cerca del límite de usos/)).toBeInTheDocument();
    expect(within(section).getByText(/Sin precio vigente/)).toBeInTheDocument();
    expect(within(section).queryByText('near_use_limit')).not.toBeInTheDocument();
    expect(within(section).queryByText('missing_current_price')).not.toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: /Promo fibra/i }));
    expect(onNavigateTab).toHaveBeenCalledWith('promotions', { status: 'expiring' });
  });

  it('KPI Vencen pronto navega con status=expiring', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialDashboard
        summary={buildSummary({
          offersAtRiskCount: 2,
          attentionItems: [
            {
              id: 'b1',
              entityType: 'bundle',
              name: 'Combo A',
              reason: 'expiring_soon',
              destinoTab: 'bundles',
            },
          ],
        })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Vencen pronto/i }));
    expect(onNavigateTab).toHaveBeenCalledWith('bundles', { status: 'expiring' });
  });

  it('CTA de primera vez navega a planes', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialDashboard
        summary={buildSummary({
          plansCount: 0,
          productsCount: 0,
          servicesCount: 0,
          activePlansCount: 0,
          activeProductsCount: 0,
          activeServicesCount: 0,
        })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Crear plan' }));
    expect(onNavigateTab).toHaveBeenCalledWith('plans');
  });

  it('no renderiza alertas operativas: viven en la tira sobre los tabs', () => {
    render(
      <CommercialDashboard
        summary={buildSummary({
          offersAtRiskCount: 3,
          rulesGapCount: 2,
          catalogIncompleteActiveCount: 1,
        })}
      />,
    );

    expect(screen.queryByText('Ofertas en riesgo')).not.toBeInTheDocument();
    expect(screen.queryByText('Catálogo incompleto')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Alertas operativas')).not.toBeInTheDocument();
  });
});
