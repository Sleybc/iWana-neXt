import {
  TenantStatus,
  type TenantStatusSummary,
  type TenantStatusSummaryMonth,
} from '@iwana/shared';

/**
 * 12 meses en 0, de dic-2025 a nov-2026 (mes en curso de las pruebas). Activas al cierre en
 * `null` (sin historia); `makeTenantStatusSummary` fija el mes en curso, que en v1.2 nunca es null.
 */
export function makeMonthlySeries(
  overrides: Record<string, Partial<Omit<TenantStatusSummaryMonth, 'month'>>> = {},
): TenantStatusSummaryMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 11 + index, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, created: 0, removed: 0, activeAtClose: null, ...overrides[month] };
  });
}

/**
 * Mock tipado de `GET /tenants/summary` (TenantStatusSummary v1.2) para pruebas de UI. Como el
 * API, el mes en curso lleva `activeAtClose = byStatus.ACTIVE` salvo que la serie traiga otro
 * valor; un mes sin la clave (payload v1.1) se deja tal cual.
 */
export function makeTenantStatusSummary(
  byStatus: Partial<TenantStatusSummary['byStatus']> = {},
  overrides: Partial<Omit<TenantStatusSummary, 'byStatus'>> = {},
): TenantStatusSummary {
  const counts = Object.fromEntries(
    Object.values(TenantStatus).map((status) => [status, byStatus[status] ?? 0]),
  ) as TenantStatusSummary['byStatus'];
  const series = overrides.monthly ?? makeMonthlySeries();
  const monthly = series.map((month, index) =>
    index === series.length - 1 && month.activeAtClose === null
      ? { ...month, activeAtClose: counts.ACTIVE }
      : month,
  );

  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    byStatus: counts,
    updatedLast7Days: 0,
    attention: [],
    generatedAt: '2026-11-21T10:00:00.000Z',
    oldestProvisioningAt: null,
    ...overrides,
    monthly,
    period: monthly[monthly.length - 1]!,
  };
}
