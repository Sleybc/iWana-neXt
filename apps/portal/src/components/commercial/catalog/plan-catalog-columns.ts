import type { PlanCatalogItem } from '@/lib/api-client';

export const PLAN_CATALOG_COLUMN_IDS = [
  'plan',
  'speed',
  'price',
  'installation',
  'status',
  'technology',
  'description',
  'created',
  'updated',
] as const;

export type PlanCatalogColumnId = (typeof PLAN_CATALOG_COLUMN_IDS)[number];
export type PlanCatalogVisibleColumnId = PlanCatalogColumnId | 'actions';
export type PlanCatalogColumnPref = true | false | 'auto';
export type PlanCatalogColumnPrefs = Partial<Record<PlanCatalogColumnId, PlanCatalogColumnPref>>;

export const PLAN_CATALOG_COLUMN_LABELS: Record<PlanCatalogColumnId, string> = {
  plan: 'Plan',
  speed: 'Velocidad',
  price: 'Precio base',
  installation: 'Instalación',
  status: 'Estado',
  technology: 'Tecnología',
  description: 'Descripción',
  created: 'Creado',
  updated: 'Actualizado',
};

export const PLAN_CATALOG_LOCKED_COLUMNS = new Set<PlanCatalogColumnId>(['plan']);

export const PLAN_CATALOG_COLUMNS_STORAGE_KEY = 'iwana.portal.commercial.plan-table-columns';

const CORE_DEFAULT_ON: ReadonlySet<PlanCatalogColumnId> = new Set([
  'plan',
  'speed',
  'price',
  'installation',
  'status',
]);

const AUTO_EXTRAS: ReadonlySet<PlanCatalogColumnId> = new Set(['technology', 'description']);

function isColumnId(value: string): value is PlanCatalogColumnId {
  return (PLAN_CATALOG_COLUMN_IDS as readonly string[]).includes(value);
}

function isPref(value: unknown): value is PlanCatalogColumnPref {
  return value === true || value === false || value === 'auto';
}

function defaultPref(id: PlanCatalogColumnId): PlanCatalogColumnPref {
  if (CORE_DEFAULT_ON.has(id) || id === 'plan') {
    return true;
  }
  if (AUTO_EXTRAS.has(id)) {
    return 'auto';
  }
  return false;
}

export function columnHasData(id: PlanCatalogColumnId, rows: readonly PlanCatalogItem[]): boolean {
  if (id === 'technology') {
    return rows.some((row) => {
      const value = row.technology.trim();
      return value.length > 0 && value.toUpperCase() !== 'N/A';
    });
  }

  if (id === 'description') {
    return rows.some((row) => (row.description ?? '').trim().length > 0);
  }

  return false;
}

export function isColumnVisible(
  id: PlanCatalogColumnId,
  rows: readonly PlanCatalogItem[],
  prefs: PlanCatalogColumnPrefs,
): boolean {
  if (id === 'plan') {
    return true;
  }

  const pref = prefs[id] ?? defaultPref(id);
  if (pref === true) {
    return true;
  }
  if (pref === false) {
    return false;
  }

  return AUTO_EXTRAS.has(id) && columnHasData(id, rows);
}

export function resolveVisibleColumns(
  rows: readonly PlanCatalogItem[],
  prefs: PlanCatalogColumnPrefs,
  canEdit: boolean,
): PlanCatalogVisibleColumnId[] {
  const visible: PlanCatalogVisibleColumnId[] = PLAN_CATALOG_COLUMN_IDS.filter((id) =>
    isColumnVisible(id, rows, prefs),
  );

  if (canEdit) {
    visible.push('actions');
  }

  return visible;
}

export function loadPlanCatalogColumnPrefs(): PlanCatalogColumnPrefs {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(PLAN_CATALOG_COLUMNS_STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const next: PlanCatalogColumnPrefs = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isColumnId(key) && key !== 'plan' && isPref(value)) {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function persistPlanCatalogColumnPrefs(prefs: PlanCatalogColumnPrefs): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(PLAN_CATALOG_COLUMNS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage no accesible
  }
}
