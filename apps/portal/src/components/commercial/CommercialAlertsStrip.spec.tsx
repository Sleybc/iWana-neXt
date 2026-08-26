import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CommercialDashboardSummary } from '@/lib/api-client';
import { CommercialAlertsStrip } from './CommercialAlertsStrip';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
}));

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
  beforeEach(() => {
    pushMock.mockReset();
  });
  it('muestra skeleton mientras carga, sin depender del summary', () => {
    render(<CommercialAlertsStrip summary={null} isLoading />);

    expect(screen.getByRole('region', { name: 'Cargando alertas operativas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cargando alertas operativas' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('muestra un único bloque de skeleton durante la carga', () => {
    render(<CommercialAlertsStrip summary={null} isLoading />);

    const region = screen.getByRole('region', { name: 'Cargando alertas operativas' });

    // Un solo placeholder (decisión PROD-UX), no una lista de esqueletos.
    expect(region.querySelectorAll('.animate-pulse')).toHaveLength(1);
    expect(region.children).toHaveLength(1);

    // Sin controles mientras carga.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
    expect(screen.getByText('Reglas incompletas')).toBeInTheDocument();
  });

  it('no anuncia las alertas de la tira como regiones live', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('no introduce regiones live al revelar las alertas ocultas', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CommercialAlertsStrip
        summary={buildSummary({
          offersAtRiskCount: 1,
          catalogIncompleteActiveCount: 1,
          rulesGapCount: 1,
        })}
      />,
    );

    // Sin handler de navegación el único botón es el expander.
    await user.click(screen.getByRole('button'));

    // Estado revelado activo: el contenedor de alertas ocultas está en el DOM.
    expect(container.querySelector('div[tabindex="-1"]')).toBeInTheDocument();

    // Ninguna alerta revelada es región live (role=alert/status ni aria-live).
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-live]')).not.toBeInTheDocument();
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

  it('Revisar reglas aterriza en Aplicación de impuestos', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialAlertsStrip
        summary={buildSummary({ rulesGapCount: 8, taxRulesCoverageGapCount: 8 })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Revisar reglas' }));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/settings/rules?tab=tax-rules-app');
    expect(onNavigateTab).not.toHaveBeenCalled();
  });

  it('omite las acciones cuando no hay handler ni destino federado', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ offersAtRiskCount: 1 })} />);

    expect(screen.queryByRole('button', { name: 'Ver ofertas' })).not.toBeInTheDocument();
  });

  it('con varias alertas muestra solo la más severa y ofrece ver el resto', () => {
    render(
      <CommercialAlertsStrip
        summary={buildSummary({
          offersAtRiskCount: 1,
          catalogIncompleteActiveCount: 1,
          rulesGapCount: 1,
        })}
      />,
    );

    // La primera alerta `error` (Catálogo incompleto) queda visible; el resto se oculta.
    expect(screen.getByText('Catálogo incompleto')).toBeInTheDocument();
    expect(screen.queryByText('Ofertas en riesgo')).not.toBeInTheDocument();
    expect(screen.queryByText('Reglas incompletas')).not.toBeInTheDocument();

    const expander = screen.getByRole('button', { name: 'Ver 2 alertas más' });
    expect(expander).toHaveAttribute('aria-expanded', 'false');
  });

  it('expande el resto de alertas con sus CTAs y retira el botón (sin colapso)', async () => {
    const user = userEvent.setup();
    const onNavigateTab = jest.fn();

    render(
      <CommercialAlertsStrip
        summary={buildSummary({
          offersAtRiskCount: 1,
          catalogIncompleteActiveCount: 1,
          rulesGapCount: 1,
        })}
        onNavigateTab={onNavigateTab}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver 2 alertas más' }));

    expect(screen.getByText('Ofertas en riesgo')).toBeInTheDocument();
    expect(screen.getByText('Reglas incompletas')).toBeInTheDocument();

    // El botón desaparece al expandir: el resto queda visible (decisión PROD-UX).
    expect(screen.queryByRole('button', { name: /alertas más|Ocultar/ })).not.toBeInTheDocument();

    // El foco se mueve al contenido revelado (disclosure sin pérdida de posición de teclado).
    expect(screen.getByText('Ofertas en riesgo').closest('div[tabindex="-1"]')).toHaveFocus();

    // Las alertas secundarias conservan su CTA de navegación.
    await user.click(screen.getByRole('button', { name: 'Ver ofertas' }));
    expect(onNavigateTab).toHaveBeenCalledWith('bundles', { status: 'expiring' });
  });

  it('expande con teclado y mueve el foco al contenedor revelado', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CommercialAlertsStrip
        summary={buildSummary({ offersAtRiskCount: 1, catalogIncompleteActiveCount: 1 })}
      />,
    );

    // Sin handler de navegación el único botón es el expander: alcanzable por Tab.
    const expander = screen.getByRole('button');
    await user.tab();
    expect(expander).toHaveFocus();

    await user.keyboard('{Enter}');

    // El contenedor revelado (único div[tabindex="-1"]) recibe el foco.
    expect(container.querySelector('div[tabindex="-1"]')).toHaveFocus();

    // El botón desaparece al expandir (sin colapso, decisión PROD-UX).
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('prioriza por dominio: huecos en reglas sobre ofertas en riesgo', () => {
    render(
      <CommercialAlertsStrip summary={buildSummary({ offersAtRiskCount: 1, rulesGapCount: 1 })} />,
    );

    expect(screen.getByText('Reglas incompletas')).toBeInTheDocument();
    expect(screen.queryByText('Ofertas en riesgo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver 1 alerta más' })).toBeInTheDocument();
  });

  it('usa singular en el botón cuando queda una sola alerta oculta', () => {
    render(
      <CommercialAlertsStrip
        summary={buildSummary({ catalogIncompleteActiveCount: 1, rulesGapCount: 1 })}
      />,
    );

    expect(screen.getByText('Catálogo incompleto')).toBeInTheDocument();
    expect(screen.queryByText('Reglas incompletas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver 1 alerta más' })).toBeInTheDocument();
  });

  it('no muestra botón de expandir con una sola alerta', () => {
    render(<CommercialAlertsStrip summary={buildSummary({ rulesGapCount: 2 })} />);

    expect(screen.getByText('Reglas incompletas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /alertas? más/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ocultar alertas' })).not.toBeInTheDocument();
  });
});
