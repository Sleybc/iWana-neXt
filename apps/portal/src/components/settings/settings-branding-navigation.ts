export const SETTINGS_BRANDING_NAVIGATION = [
  { id: 'identity', label: 'Identidad visual' },
  { id: 'plans', label: 'Planes' },
  { id: 'products', label: 'Productos' },
  { id: 'coverage', label: 'Cobertura' },
] as const;

export type BrandingSettingsTabId = (typeof SETTINGS_BRANDING_NAVIGATION)[number]['id'];
