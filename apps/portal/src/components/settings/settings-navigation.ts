export type SettingsTabId = 'general' | 'operations' | 'security' | 'branding';

const SETTINGS_TAB_IDS: SettingsTabId[] = ['general', 'operations', 'security', 'branding'];

export interface SettingsNavigationItem {
  id: SettingsTabId;
  label: string;
}

export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
  { id: 'general', label: 'General' },
  { id: 'operations', label: 'Operación' },
  { id: 'security', label: 'Seguridad' },
  { id: 'branding', label: 'Marca' },
];

export function resolveSettingsTabId(value: string | string[] | undefined): SettingsTabId {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (candidate && SETTINGS_TAB_IDS.includes(candidate as SettingsTabId)) {
    return candidate as SettingsTabId;
  }

  return 'general';
}
