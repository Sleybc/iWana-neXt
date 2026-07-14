import { render, screen } from '@testing-library/react';
import { CommercialDashboard } from './CommercialDashboard';

const summaryFixture = {
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
};

describe('CommercialDashboard', () => {
  it('muestra skeleton mientras carga', () => {
    const { container } = render(<CommercialDashboard summary={null} isLoading />);

    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renderiza KPIs cuando hay summary', () => {
    render(<CommercialDashboard summary={summaryFixture} />);

    expect(screen.getByText('Resumen comercial')).toBeInTheDocument();
    expect(screen.getByText('Planes activos')).toBeInTheDocument();
    expect(screen.getByText('Promociones vigentes')).toBeInTheDocument();
  });

  it('muestra empty state cuando no hay summary', () => {
    render(<CommercialDashboard summary={null} />);

    expect(screen.getByText('Indicadores no disponibles')).toBeInTheDocument();
  });
});
