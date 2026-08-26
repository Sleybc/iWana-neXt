import {
  buildRulesSettingsHref,
  parseRulesSettingsTab,
  resolveCommercialRulesRedirect,
} from './rules-settings-params';

describe('rules-settings-params', () => {
  it('aterriza en Impuestos cuando el tab es inválido o ausente', () => {
    expect(parseRulesSettingsTab(null)).toBe('tax-catalog');
    expect(parseRulesSettingsTab('plans')).toBe('tax-catalog');
    expect(parseRulesSettingsTab('tax-simulator')).toBe('tax-simulator');
  });

  it('omite el query en el aterrizaje de Impuestos', () => {
    expect(buildRulesSettingsHref('tax-catalog')).toBe('/dashboard/settings/rules');
    expect(buildRulesSettingsHref('tax-rules-app')).toBe(
      '/dashboard/settings/rules?tab=tax-rules-app',
    );
  });

  it('redirige deep-links Comercial de reglas a Configuración', () => {
    expect(resolveCommercialRulesRedirect('compatibility')).toBe(
      '/dashboard/settings/rules?tab=compatibility',
    );
    expect(resolveCommercialRulesRedirect('taxation')).toBe('/dashboard/settings/rules');
    expect(resolveCommercialRulesRedirect('taxation/tax-simulator')).toBe(
      '/dashboard/settings/rules?tab=tax-simulator',
    );
    expect(resolveCommercialRulesRedirect('plans')).toBeNull();
  });
});
