import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommercialTabLayout } from './CommercialTabLayout';

jest.mock('@iwana/ui', () => ({
  cn: (...classes: Array<string | boolean | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('lucide-react', () => ({
  ReceiptText: () => <span data-testid="icon-receipt" />,
}));

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

describe('CommercialTabLayout', () => {
  it('renderiza Planes por defecto', () => {
    render(<CommercialTabLayout canEdit />);

    expect(screen.getByRole('tab', { name: 'Planes' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('plans-panel')).toBeInTheDocument();
  });

  it('renderiza Ofertas al seleccionar Combos y promociones', () => {
    render(<CommercialTabLayout canEdit />);

    fireEvent.click(screen.getByRole('tab', { name: 'Combos y promociones' }));

    expect(screen.getByRole('tab', { name: 'Combos y promociones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('offers-panel')).toBeInTheDocument();
  });

  it('renderiza Catálogo de impuestos al seleccionar el tab', () => {
    render(<CommercialTabLayout canEdit />);

    fireEvent.click(screen.getByRole('tab', { name: 'Catálogo de impuestos' }));

    expect(screen.getByRole('tab', { name: 'Catálogo de impuestos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('tax-catalog-panel')).toBeInTheDocument();
  });

  it('renderiza Simulador tributario al seleccionar el tab', () => {
    render(<CommercialTabLayout canEdit />);

    fireEvent.click(screen.getByRole('tab', { name: 'Simulador tributario' }));

    expect(screen.getByRole('tab', { name: 'Simulador tributario' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('tax-simulator-panel')).toBeInTheDocument();
  });
});
