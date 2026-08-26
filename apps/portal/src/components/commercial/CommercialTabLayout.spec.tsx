import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommercialTabLayout } from './CommercialTabLayout';

/**
 * next/dynamic Jest-safe: resuelve el import mockeado de forma asincrona controlada
 * para que findByTestId vea el panel sin warnings flaky de act.
 */
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) =>
    function DynamicTestStub(props: Record<string, unknown>) {
      const [Comp, setComp] = React.useState<React.ComponentType<Record<string, unknown>> | null>(
        null,
      );

      React.useEffect(() => {
        let cancelled = false;
        void loader().then((Resolved) => {
          if (cancelled) {
            return;
          }
          // act evita warnings de actualización asíncrona en Jest
          void import('@testing-library/react').then(({ act }) => {
            act(() => {
              if (!cancelled) {
                setComp(() => Resolved);
              }
            });
          });
        });
        return () => {
          cancelled = true;
        };
      }, []);

      if (!Comp) {
        return <div data-testid="commercial-tab-loading" />;
      }

      return <Comp {...props} />;
    },
}));

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
  CompatibilityRulesManager: () => <div data-testid="compatibility-panel">Reemplazos panel</div>,
}));

jest.mock('@/components/commercial/TaxCatalogManager', () => ({
  TaxCatalogManager: () => <div data-testid="tax-catalog-panel">Impuestos panel</div>,
}));

jest.mock('@/components/commercial/TaxApplicationRulesManager', () => ({
  TaxApplicationRulesManager: () => (
    <div data-testid="tax-rules-app-panel">Aplicación de impuestos panel</div>
  ),
}));

jest.mock('@/components/commercial/TaxSimulatorPanel', () => ({
  TaxSimulatorPanel: () => <div data-testid="tax-simulator-panel">Simulador panel</div>,
}));

const defaultProps = {
  canEdit: true,
  activeTab: 'plans' as const,
  taxationSubTab: 'tax-catalog' as const,
  onTabChange: jest.fn(),
  onTaxationSubTabChange: jest.fn(),
};

function mockMatchMediaLg(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('1024') ? matches : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

describe('CommercialTabLayout', () => {
  beforeEach(() => {
    mockMatchMediaLg(true);
    defaultProps.onTabChange.mockReset();
    defaultProps.onTaxationSubTabChange.mockReset();
  });

  it('no ofrece un destino de resumen', async () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.queryByRole('button', { name: 'Resumen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Operación')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('plans-panel')).toBeInTheDocument());
  });

  it('aterriza en Planes con catálogo y ofertas', async () => {
    render(<CommercialTabLayout {...defaultProps} />);

    const nav = screen.getByRole('navigation', { name: 'Secciones comerciales' });
    expect(nav).toHaveClass('lg:sticky');

    expect(screen.getByRole('button', { name: 'Planes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Ofertas')).toBeInTheDocument();
    expect(screen.queryByText('Reglas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Productos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reemplazos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Impuestos' })).not.toBeInTheDocument();
    const panel = await screen.findByTestId('plans-panel');
    expect(nav.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renderiza Combos y Promociones bajo el grupo Ofertas', async () => {
    const { rerender } = render(<CommercialTabLayout {...defaultProps} activeTab="bundles" />);

    expect(screen.getByRole('button', { name: 'Combos' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByTestId('bundles-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Combos y promociones' })).not.toBeInTheDocument();

    rerender(<CommercialTabLayout {...defaultProps} activeTab="promotions" />);

    expect(screen.getByRole('button', { name: 'Promociones' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByTestId('promotions-panel')).toBeInTheDocument();
  });

  it('no muestra el grupo Reglas en Comercial', () => {
    render(<CommercialTabLayout {...defaultProps} />);

    expect(screen.queryByRole('list', { name: 'Reglas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reemplazos' })).not.toBeInTheDocument();
  });

  it('sigue mostrando Combos y Promociones bajo Ofertas', async () => {
    render(<CommercialTabLayout {...defaultProps} activeTab="bundles" />);

    expect(screen.getByRole('button', { name: 'Combos' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByTestId('bundles-panel')).toBeInTheDocument();
  });

  it('notifica cambio de tab principal', () => {
    const onTabChange = jest.fn();
    render(<CommercialTabLayout {...defaultProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Servicios' }));

    expect(onTabChange).toHaveBeenCalledWith('services');
  });

  it('notifica cambio a Promociones del grupo Ofertas', () => {
    const onTabChange = jest.fn();
    render(<CommercialTabLayout {...defaultProps} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Promociones' }));

    expect(onTabChange).toHaveBeenCalledWith('promotions');
  });
});
