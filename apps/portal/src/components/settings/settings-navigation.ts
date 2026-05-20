export type SettingsTabId = 'general' | 'operations' | 'security' | 'branding';

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
