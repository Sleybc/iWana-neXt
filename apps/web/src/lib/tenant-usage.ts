import type { TenantUsageItem } from '@iwana/shared';
import type { Tone } from '@iwana/ui';

/**
 * Umbrales de «Uso por empresa» (dirección v1.2 §8; decisión CTO 2026-11-22: el cupo
 * no bloquea altas, solo avisa). Se compara la razón exacta `activos / cupo`.
 */
export const USAGE_WARN_RATIO = 0.9;
export const USAGE_ERROR_RATIO = 1;

export type UsageTone = Extract<Tone, 'primary' | 'warning' | 'error'>;
export type UsageState = 'reached' | 'near' | 'clear';

export interface OverQuota {
  item: TenantUsageItem;
  /** `reached`: activos = cupo; `exceeded`: activos > cupo (o cupo 0 con activos). */
  kind: 'reached' | 'exceeded';
}

export interface TenantUsageSummary {
  /** Mayor uso primero (razón exacta), luego sin cupo, «Sin dato» al final. */
  rows: TenantUsageItem[];
  /** Empresas con activos ≥ cupo, en el orden de `rows`: filas de «Requiere tu atención». */
  overQuota: OverQuota[];
  state: UsageState;
}

/** `null` sin medición, sin cupo o con cupo 0 (nunca se divide por cero). */
export function usageRatio(item: TenantUsageItem): number | null {
  if (item.activeSubscribers === null || !item.maxSubscribers) return null;
  return item.activeSubscribers / item.maxSubscribers;
}

/** Cifra visible, truncada: «100 %» aparece solo al alcanzar el cupo. */
export function usageDisplayPercent(item: TenantUsageItem): number | null {
  const ratio = usageRatio(item);
  return ratio === null ? null : Math.floor(ratio * 100);
}

function isClosedWithSubscribers(item: TenantUsageItem): boolean {
  return item.maxSubscribers === 0 && (item.activeSubscribers ?? 0) > 0;
}

/** `null` = la fila no tiene semáforo (sin dato, sin cupo o cupo 0 sin activos). */
export function usageTone(item: TenantUsageItem): UsageTone | null {
  if (isClosedWithSubscribers(item)) return 'error';
  const ratio = usageRatio(item);
  if (ratio === null) return null;
  if (ratio >= USAGE_ERROR_RATIO) return 'error';
  if (ratio >= USAGE_WARN_RATIO) return 'warning';
  return 'primary';
}

function rank(item: TenantUsageItem): number {
  if (item.activeSubscribers === null) return -2;
  if (isClosedWithSubscribers(item)) return Number.POSITIVE_INFINITY;
  return usageRatio(item) ?? -1;
}

export function summarizeTenantUsage(
  items: readonly TenantUsageItem[] | null | undefined,
): TenantUsageSummary {
  const rows = [...(items ?? [])].sort(
    (a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name, 'es'),
  );
  const overQuota: OverQuota[] = [];
  let near = false;
  for (const item of rows) {
    const tone = usageTone(item);
    if (tone === 'warning') near = true;
    if (tone !== 'error') continue;
    overQuota.push({
      item,
      kind: item.activeSubscribers === item.maxSubscribers ? 'reached' : 'exceeded',
    });
  }
  const state: UsageState = overQuota.length > 0 ? 'reached' : near ? 'near' : 'clear';
  return { rows, overQuota, state };
}
