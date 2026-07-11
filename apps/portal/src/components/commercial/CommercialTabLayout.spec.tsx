import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommercialTabLayout } from './CommercialTabLayout';

jest.mock('@/components/settings/PlanCatalogManager', () => ({
  PlanCatalogManager: () => <div data-testid="plans-panel">Planes panel</div>,
}));

jest.mock('@/components/settings/AdditionalProductsManager', () => ({
  AdditionalProductsManager: () => <div data-testid="products-panel">Productos panel</div>,
}));

jest.mock('@/components/settings/AdditionalServicesManager', () => ({
  AdditionalServicesManager: () => <div data-testid="services-panel">Servicios panel</div>,
}));

jest.mock('@/components/commercial/OffersManager', () => ({
  OffersManager: () => <div data-testid="offers-panel">Ofertas panel</div>,
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
  offersSubTab: 'bundles' as const,
  onTabChange: jest.fn(),
  onTaxationSubTabChange: jest.fn(),
  onOffersSubTabChange: jest.fn(),
};

describe('CommercialTabLayout', () => {
  it('renderiza Planes por defecto', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Planes' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('plans-panel')).toBeInTheDocument();
  });

  it('renderiza Ofertas al seleccionar Combos y promociones', () => {
    render(<CommercialTabLayout {...defaultProps} activeTab="offers" />);

    expect(screen.getByRole('tab', { name: 'Combos y promociones' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('offers-panel')).toBeInTheDocument();
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

  it('renderiza Reglas de aplicación al seleccionar el subtab tributario', () => {
    render(
      <CommercialTabLayout {...defaultProps} activeTab="taxation" taxationSubTab="tax-rules-app" />,
    );

    expect(screen.getByRole('tab', { name: 'Reglas de aplicación' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('tax-rules-app-panel')).toBeInTheDocument();
  });

  it('notifica cambio de tab principal', () => {
    const onTabChange = jest.fn();
    render(<CommercialTabLayout {...defaultProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Servicios' }));

    expect(onTabChange).toHaveBeenCalledWith('services');
  });
});
