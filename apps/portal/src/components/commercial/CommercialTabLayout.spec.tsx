import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommercialTabLayout } from './CommercialTabLayout';

jest.mock('@/components/commercial/catalog/PlanCatalogPanel', () => ({
  PlanCatalogPanel: () => <div data-testid="plans-panel">Planes panel</div>,
}));

jest.mock('@/components/commercial/catalog/AdditionalProductsPanel', () => ({
  AdditionalProductsPanel: () => <div data-testid="products-panel">Productos panel</div>,
}));

jest.mock('@/components/commercial/catalog/AdditionalServicesPanel', () => ({
  AdditionalServicesPanel: () => <div data-testid="services-panel">Servicios panel</div>,
}));

jest.mock('@/components/commercial/BundlesManager', () => ({
  BundlesManager: () => <div data-testid="bundles-panel">Combos panel</div>,
}));

jest.mock('@/components/commercial/PromotionsManager', () => ({
  PromotionsManager: () => <div data-testid="promotions-panel">Promociones panel</div>,
}));

jest.mock('@/components/commercial/CompatibilityRulesManager', () => ({
  CompatibilityRulesManager: () => (
    <div data-testid="compatibility-panel">Compatibilidad panel</div>
  ),
}));

jest.mock('@/components/commercial/TaxCatalogManager', () => ({
  TaxCatalogManager: () => <div data-testid="tax-catalog-panel">Catálogo de impuestos panel</div>,
}));

jest.mock('@/components/commercial/TaxApplicationRulesManager', () => ({
  TaxApplicationRulesManager: () => (
    <div data-testid="tax-rules-app-panel">Reglas de aplicación panel</div>
  ),
}));

jest.mock('@/components/commercial/TaxSimulatorPanel', () => ({
  TaxSimulatorPanel: () => <div data-testid="tax-simulator-panel">Simulador tributario panel</div>,
}));

const defaultProps = {
  canEdit: true,
  activeTab: 'plans' as const,
  taxationSubTab: 'tax-catalog' as const,
  onTabChange: jest.fn(),
  onTaxationSubTabChange: jest.fn(),
};

describe('CommercialTabLayout', () => {
  it('no ofrece un tab de resumen', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.queryByRole('tab', { name: 'Resumen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Operación')).not.toBeInTheDocument();
  });

  it('aterriza en Planes con los tres grupos visibles', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Planes' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Ofertas')).toBeInTheDocument();
    expect(screen.getByText('Reglas')).toBeInTheDocument();
  });

  it('renderiza Planes al seleccionar el tab de catálogo', () => {
    render(<CommercialTabLayout {...defaultProps} activeTab="plans" />);

    expect(screen.getByRole('tab', { name: 'Planes' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('plans-panel')).toBeInTheDocument();
  });

  it('renderiza Combos y Promociones bajo el grupo Ofertas', () => {
    const { rerender } = render(<CommercialTabLayout {...defaultProps} activeTab="bundles" />);

    expect(screen.getByRole('tab', { name: 'Combos' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('bundles-panel')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Combos y promociones' })).not.toBeInTheDocument();

    rerender(<CommercialTabLayout {...defaultProps} activeTab="promotions" />);

    expect(screen.getByRole('tab', { name: 'Promociones' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('promotions-panel')).toBeInTheDocument();
  });

  it('no ubica Combos ni Promociones bajo Reglas', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    const rulesGroup = screen.getByRole('group', { name: 'Reglas' });
    expect(rulesGroup).toContainElement(screen.getByRole('tab', { name: 'Compatibilidad' }));
    expect(rulesGroup).toContainElement(screen.getByRole('tab', { name: 'Tributación' }));
    expect(rulesGroup).not.toContainElement(screen.getByRole('tab', { name: 'Combos' }));
    expect(rulesGroup).not.toContainElement(screen.getByRole('tab', { name: 'Promociones' }));
  });

  it('renderiza Tributación al seleccionar el tab principal', () => {
    render(<CommercialTabLayout {...defaultProps} activeTab="taxation" />);

    expect(screen.getByRole('tab', { name: 'Tributación' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('tax-catalog-panel')).toBeInTheDocument();
  });

  it('renderiza Simulador tributario al seleccionar el subtab tributario', () => {
    render(
      <CommercialTabLayout {...defaultProps} activeTab="taxation" taxationSubTab="tax-simulator" />,
    );

    expect(screen.getByRole('tab', { name: 'Simulador tributario' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('tax-simulator-panel')).toBeInTheDocument();
  });

  it('notifica cambio de tab principal', () => {
    const onTabChange = jest.fn();
    render(<CommercialTabLayout {...defaultProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }));

    expect(onTabChange).toHaveBeenCalledWith('services');
  });

  it('notifica cambio a Promociones del grupo Ofertas', () => {
    const onTabChange = jest.fn();
    render(<CommercialTabLayout {...defaultProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Promociones' }));

    expect(onTabChange).toHaveBeenCalledWith('promotions');
  });
});
