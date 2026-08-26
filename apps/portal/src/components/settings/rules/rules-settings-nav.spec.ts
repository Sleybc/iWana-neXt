import { RULES_SETTINGS_NAV_GROUPS, isRulesSettingsNavId } from './rules-settings-nav';

describe('rules-settings-nav', () => {
  it('expone los cuatro destinos federados', () => {
    const ids = RULES_SETTINGS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
    const labels = RULES_SETTINGS_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.label),
    );

    expect(ids).toEqual(['tax-catalog', 'tax-rules-app', 'compatibility', 'tax-simulator']);
    expect(labels).toEqual(['Impuestos', 'Aplicación de impuestos', 'Reemplazos', 'Simulador']);
    expect(RULES_SETTINGS_NAV_GROUPS.map((group) => group.label)).toEqual(['Reglas']);
  });

  it('reconoce solo ids de la sección', () => {
    expect(isRulesSettingsNavId('tax-simulator')).toBe(true);
    expect(isRulesSettingsNavId('plans')).toBe(false);
  });
});
