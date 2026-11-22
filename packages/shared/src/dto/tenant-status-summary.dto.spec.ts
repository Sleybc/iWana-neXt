import {
  TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS,
  TENANT_STATUS_SUMMARY_PERIOD_MONTHS,
  TenantStatusSummaryQuerySchema,
  isTenantStatusSummaryPeriodMonths,
} from './tenant-status-summary.dto';

describe('TenantStatusSummary v1.2 — periodo de la tendencia', () => {
  it('ofrece 6, 12 y 24 meses, 12 por defecto', () => {
    expect(TENANT_STATUS_SUMMARY_PERIOD_MONTHS).toEqual([6, 12, 24]);
    expect(TENANT_STATUS_SUMMARY_DEFAULT_PERIOD_MONTHS).toBe(12);
  });

  it.each([
    ['6', 6],
    ['12', 12],
    ['24', 24],
  ])('months=%s llega como texto y sale como número %d', (raw, expected) => {
    expect(TenantStatusSummaryQuerySchema.parse({ months: raw })).toEqual({ months: expected });
  });

  it('sin months usa 12', () => {
    expect(TenantStatusSummaryQuerySchema.parse({})).toEqual({ months: 12 });
  });

  it.each(['0', '1', '3', '18', '36', '12.0', ' 12', '', 'abc', '12m'])(
    'rechaza months=%p',
    (raw) => {
      expect(TenantStatusSummaryQuerySchema.safeParse({ months: raw }).success).toBe(false);
    },
  );

  it('rechaza parámetros desconocidos y months repetido', () => {
    expect(TenantStatusSummaryQuerySchema.safeParse({ periodo: '12m' }).success).toBe(false);
    expect(TenantStatusSummaryQuerySchema.safeParse({ months: ['6', '12'] }).success).toBe(false);
  });

  it('isTenantStatusSummaryPeriodMonths solo acepta los periodos de la lista', () => {
    expect(isTenantStatusSummaryPeriodMonths(6)).toBe(true);
    expect(isTenantStatusSummaryPeriodMonths(24)).toBe(true);
    expect(isTenantStatusSummaryPeriodMonths(13)).toBe(false);
  });
});
