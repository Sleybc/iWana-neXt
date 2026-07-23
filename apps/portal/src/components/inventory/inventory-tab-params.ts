export type InventoryTab =
  | 'catalog'
  | 'stock'
  | 'purchasing'
  | 'suppliers'
  | 'locations'
  | 'issues'
  | 'counts'
  | 'assets'
  | 'movements'
  | 'writeoffs';

const INVENTORY_TABS: InventoryTab[] = [
  'catalog',
  'stock',
  'purchasing',
  'suppliers',
  'locations',
  'issues',
  'counts',
  'assets',
  'movements',
  'writeoffs',
];

/** Alias legacy del tab retirado ?tab=summary (Fase H). */
const LEGACY_SUMMARY_BASE = 'summary';

const LOCATION_CREATE_SUFFIX = /crear[-_\s]?bodega/i;

export function resolveInventoryTab(value: string | null | undefined): InventoryTab {
  const baseTab = extractInventoryTabBase(value);

  if (baseTab === LEGACY_SUMMARY_BASE) {
    return 'catalog';
  }

  if (baseTab && INVENTORY_TABS.includes(baseTab as InventoryTab)) {
    return baseTab as InventoryTab;
  }

  return 'catalog';
}

export function extractInventoryTabBase(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const decoded = decodeURIComponent(value.trim());
  const [baseTab] = decoded.split('/');
  return baseTab || null;
}

export function shouldOpenLocationCreateFromUrl(
  tabParam: string | null,
  actionParam: string | null,
): boolean {
  if (resolveInventoryTab(tabParam) !== 'locations') {
    return false;
  }

  if (actionParam === 'create') {
    return true;
  }

  if (!tabParam) {
    return false;
  }

  const decoded = decodeURIComponent(tabParam.trim());
  const suffix = decoded.split('/').slice(1).join('/');
  return LOCATION_CREATE_SUFFIX.test(suffix);
}

export function isInventoryTabParam(value: string | null | undefined): boolean {
  const baseTab = extractInventoryTabBase(value);
  return Boolean(baseTab && INVENTORY_TABS.includes(baseTab as InventoryTab));
}
