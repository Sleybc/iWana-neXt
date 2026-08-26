import { COMMERCIAL_NAV_GROUPS, resolveCommercialNavId } from './commercial-nav';

describe('commercial-nav', () => {
  it('expone cinco destinos planos en catálogo y ofertas', () => {
    const ids = COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));

    expect(COMMERCIAL_NAV_GROUPS.map((group) => group.label)).toEqual(['Catálogo', 'Ofertas']);
    expect(ids).toEqual(['plans', 'products', 'services', 'bundles', 'promotions']);
  });

  it('resuelve el id del rail desde el tab de catálogo', () => {
    expect(resolveCommercialNavId('plans', 'tax-catalog')).toBe('plans');
    expect(resolveCommercialNavId('taxation', 'tax-simulator')).toBe('plans');
  });

  it('usa labels canónicos sin el grupo Reglas', () => {
    const labels = COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toContain('Planes');
    expect(labels).toContain('Combos');
    expect(labels).not.toContain('Reemplazos');
    expect(labels).not.toContain('Impuestos');
    expect(labels).not.toContain('Simulador');
  });

  it('asigna un icono temático a cada destino', () => {
    const items = COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items);

    expect(items).toHaveLength(5);
    expect(items.every((item) => item.icon)).toBe(true);
  });
});
