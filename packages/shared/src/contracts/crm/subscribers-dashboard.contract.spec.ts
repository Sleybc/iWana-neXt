import { SubscribersDashboardSummaryQuerySchema, SubscribersDashboardSummarySchema } from './index';

function summary() {
  return {
    asOf: '2026-11-17',
    activations: 9,
    cancellations: 2,
    series: Array.from({ length: 12 }, (_, index) => ({
      month: index === 0 ? '2025-12' : `2026-${String(index).padStart(2, '0')}`,
      activations: index === 11 ? 9 : 0,
      cancellations: index === 11 ? 2 : 0,
    })),
  };
}

describe('SubscribersDashboardSummarySchema', () => {
  it('acepta el resumen con doce meses', () => {
    expect(SubscribersDashboardSummarySchema.parse(summary()).series).toHaveLength(12);
  });

  it('rechaza campos de más (strict)', () => {
    expect(SubscribersDashboardSummarySchema.safeParse({ ...summary(), net: 7 }).success).toBe(
      false,
    );
    const nested = summary();
    (nested.series[0] as Record<string, unknown>).subscriberIds = [];
    expect(SubscribersDashboardSummarySchema.safeParse(nested).success).toBe(false);
  });

  it('rechaza conteos negativos o decimales', () => {
    expect(
      SubscribersDashboardSummarySchema.safeParse({ ...summary(), activations: -1 }).success,
    ).toBe(false);
    expect(
      SubscribersDashboardSummarySchema.safeParse({ ...summary(), cancellations: 1.5 }).success,
    ).toBe(false);
  });

  it('rechaza una serie incompleta o que no termina en el mes de asOf', () => {
    const short = summary();
    short.series = short.series.slice(1);
    expect(SubscribersDashboardSummarySchema.safeParse(short).success).toBe(false);
    expect(
      SubscribersDashboardSummarySchema.safeParse({ ...summary(), asOf: '2026-10-31' }).success,
    ).toBe(false);
  });

  it('exige que el mes en curso coincida con el último de la serie', () => {
    expect(
      SubscribersDashboardSummarySchema.safeParse({ ...summary(), activations: 8 }).success,
    ).toBe(false);
  });
});

describe('SubscribersDashboardSummaryQuerySchema', () => {
  it('no acepta parámetros', () => {
    expect(SubscribersDashboardSummaryQuerySchema.safeParse({}).success).toBe(true);
    expect(SubscribersDashboardSummaryQuerySchema.safeParse({ from: '2026-01' }).success).toBe(
      false,
    );
  });
});
