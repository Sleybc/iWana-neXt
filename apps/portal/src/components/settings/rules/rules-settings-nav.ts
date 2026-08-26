import { FlaskConical, Receipt, Replace, Scale } from 'lucide-react';
import type { PortalModuleSubnavGroup } from '@/components/shared/portal-ui';
import type { RulesSettingsTab } from './rules-settings-params';

export const RULES_SETTINGS_NAV_GROUPS: PortalModuleSubnavGroup[] = [
  {
    id: 'rules',
    label: 'Reglas',
    items: [
      { id: 'tax-catalog', label: 'Impuestos', icon: Receipt },
      { id: 'tax-rules-app', label: 'Aplicación de impuestos', icon: Scale },
      { id: 'compatibility', label: 'Reemplazos', icon: Replace },
      { id: 'tax-simulator', label: 'Simulador', icon: FlaskConical },
    ],
  },
];

export function isRulesSettingsNavId(id: string): id is RulesSettingsTab {
  return (
    id === 'compatibility' ||
    id === 'tax-catalog' ||
    id === 'tax-rules-app' ||
    id === 'tax-simulator'
  );
}
