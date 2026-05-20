// Planes y Productos se gestionan en el módulo Comercial.
// Cobertura se gestionará en el módulo NMU (pendiente de creación).
export const SETTINGS_BRANDING_NAVIGATION = [
  { id: 'identity', label: 'Identidad visual' },
] as const;

export type BrandingSettingsTabId = (typeof SETTINGS_BRANDING_NAVIGATION)[number]['id'];
