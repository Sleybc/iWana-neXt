import {
  TenantStatus,
  type TenantStatusSummary,
  type TenantStatusSummaryMonth,
} from '@iwana/shared';

/** 12 meses en 0, de dic-2025 a nov-2026 (mes en curso de las pruebas). */
export function makeMonthlySeries(
  overrides: Record<string, Partial<Omit<TenantStatusSummaryMonth, 'month'>>> = {},
): TenantStatusSummaryMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 11 + index, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month, created: 0, removed: 0, ...overrides[month] };
  });
}

/** Mock tipado de `GET /tenants/summary` (TenantStatusSummary v1.1) para pruebas de UI. */
export function makeTenantStatusSummary(
  byStatus: Partial<TenantStatusSummary['byStatus']> = {},
  overrides: Partial<Omit<TenantStatusSummary, 'byStatus'>> = {},
): TenantStatusSummary {
  const counts = Object.fromEntries(
    Object.values(TenantStatus).map((status) => [status, byStatus[status] ?? 0]),
  ) as TenantStatusSummary['byStatus'];
  const monthly = overrides.monthly ?? makeMonthlySeries();

  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    byStatus: counts,
    updatedLast7Days: 0,
    attention: [],
    generatedAt: '2026-11-21T10:00:00.000Z',
    monthly,
    period: monthly[monthly.length - 1]!,
    oldestProvisioningAt: null,
    ...overrides,
  };
}
