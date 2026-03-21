'use client';

export type SettingsTabId = 'general' | 'operations' | 'commercial' | 'security' | 'branding';

export interface SettingsNavigationItem {
  id: SettingsTabId;
  label: string;
  // description eliminado — ya no se usa en SettingsTabs
}

export const SETTINGS_NAVIGATION: SettingsNavigationItem[] = [
  { id: 'general', label: 'General' },
  { id: 'operations', label: 'Operación' },
  { id: 'commercial', label: 'Comercial' },
  { id: 'security', label: 'Seguridad' },
  { id: 'branding', label: 'Marca' },
];
