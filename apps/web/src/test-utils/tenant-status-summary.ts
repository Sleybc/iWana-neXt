import { TenantStatus, type TenantStatusSummary } from '@iwana/shared';

/** Mock tipado de `GET /tenants/summary` (TenantStatusSummary v1.0) para pruebas de UI. */
export function makeTenantStatusSummary(
  byStatus: Partial<TenantStatusSummary['byStatus']> = {},
  overrides: Partial<Omit<TenantStatusSummary, 'byStatus'>> = {},
): TenantStatusSummary {
  const counts = Object.fromEntries(
    Object.values(TenantStatus).map((status) => [status, byStatus[status] ?? 0]),
  ) as TenantStatusSummary['byStatus'];

  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    byStatus: counts,
    updatedLast7Days: 0,
    attention: [],
    generatedAt: '2026-11-21T10:00:00.000Z',
    ...overrides,
  };
}
