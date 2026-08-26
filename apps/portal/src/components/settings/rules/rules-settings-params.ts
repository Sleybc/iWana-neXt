import { resolveCommercialRoute } from '@/components/commercial/commercial-tab-params';

export type RulesSettingsTab = 'compatibility' | 'tax-catalog' | 'tax-rules-app' | 'tax-simulator';

export const RULES_SETTINGS_TABS: RulesSettingsTab[] = [
  'compatibility',
  'tax-catalog',
  'tax-rules-app',
  'tax-simulator',
];

export const RULES_SETTINGS_PATH = '/dashboard/settings/rules';

export function isRulesSettingsTab(value: string | null | undefined): value is RulesSettingsTab {
  return RULES_SETTINGS_TABS.includes(value as RulesSettingsTab);
}

export function parseRulesSettingsTab(value: string | null | undefined): RulesSettingsTab {
  if (isRulesSettingsTab(value)) {
    return value;
  }

  return 'tax-catalog';
}

/** Query canónica: el aterrizaje (Impuestos) omite `tab`. */
export function buildRulesSettingsHref(tab: RulesSettingsTab = 'tax-catalog'): string {
  if (tab === 'tax-catalog') {
    return RULES_SETTINGS_PATH;
  }

  return `${RULES_SETTINGS_PATH}?tab=${tab}`;
}

/**
 * Deep-links Comercial `?tab=compatibility` y `?tab=taxation*` → Configuración → Reglas.
 */
export function resolveCommercialRulesRedirect(rawTab: string | null | undefined): string | null {
  if (!rawTab) {
    return null;
  }

  const route = resolveCommercialRoute(rawTab);
  if (route.tab === 'compatibility') {
    return buildRulesSettingsHref('compatibility');
  }

  if (route.tab === 'taxation') {
    return buildRulesSettingsHref(route.taxationSubTab);
  }

  return null;
}
