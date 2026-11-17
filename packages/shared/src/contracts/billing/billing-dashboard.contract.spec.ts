import {
  BILLING_OVERDUE_BUCKETS,
  BillingDashboardSummaryQuerySchema,
  BillingDashboardSummarySchema,
} from './index';

const months = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
];

function summary() {
  return {
    asOf: '2026-11-17',
    invoicedAmount: '1250000.00',
    collectedAmount: '980000.50',
    overdue: {
      amount: '410000.00',
      documentCount: 6,
      subscriberCount: 4,
      buckets: [
        { bucket: '1_30' as const, amount: '200000.00', documentCount: 3 },
        { bucket: '31_60' as const, amount: '110000.00', documentCount: 2 },
        { bucket: '61_90' as const, amount: '0.00', documentCount: 0 },
        { bucket: '90_plus' as const, amount: '100000.00', documentCount: 1 },
      ],
    },
    series: months.map((month, index) =>
      index === months.length - 1
        ? { month, invoicedAmount: '1250000.00', collectedAmount: '980000.50' }
        : { month, invoicedAmount: '0.00', collectedAmount: '0.00' },
    ),
  };
}

describe('BillingDashboardSummarySchema', () => {
  it('acepta el resumen con doce meses y los cuatro tramos', () => {
    expect(
      BillingDashboardSummarySchema.parse(summary()).overdue.buckets.map((b) => b.bucket),
    ).toEqual([...BILLING_OVERDUE_BUCKETS]);
  });

  it('acepta un tenant sin movimientos (todo en cero)', () => {
    const empty = summary();
    empty.invoicedAmount = '0.00';
    empty.collectedAmount = '0.00';
    empty.overdue = {
      amount: '0.00',
      documentCount: 0,
      subscriberCount: 0,
      buckets: empty.overdue.buckets.map((b) => ({ ...b, amount: '0.00', documentCount: 0 })),
    };
    empty.series = empty.series.map((m) => ({
      ...m,
      invoicedAmount: '0.00',
      collectedAmount: '0.00',
    }));
    expect(BillingDashboardSummarySchema.safeParse(empty).success).toBe(true);
  });

  it('rechaza campos de más (strict), también en los anidados', () => {
    expect(
      BillingDashboardSummarySchema.safeParse({ ...summary(), subscriberId: 'x' }).success,
    ).toBe(false);
    const nested = summary();
    (nested.overdue as Record<string, unknown>).documents = [];
    expect(BillingDashboardSummarySchema.safeParse(nested).success).toBe(false);
  });

  it('rechaza importes numéricos, negativos o con más de dos decimales', () => {
    for (const invoicedAmount of [1250000, '-1.00', '1.005']) {
      expect(
        BillingDashboardSummarySchema.safeParse({ ...summary(), invoicedAmount }).success,
      ).toBe(false);
    }
  });

  it('rechaza tramos que no suman el total vencido', () => {
    const wrong = summary();
    wrong.overdue.amount = '410000.01';
    expect(BillingDashboardSummarySchema.safeParse(wrong).success).toBe(false);
    const count = summary();
    count.overdue.documentCount = 7;
    expect(BillingDashboardSummarySchema.safeParse(count).success).toBe(false);
  });

  it('rechaza tramos faltantes o fuera de orden', () => {
    const missing = summary();
    missing.overdue.buckets = missing.overdue.buckets.slice(0, 3);
    expect(BillingDashboardSummarySchema.safeParse(missing).success).toBe(false);
    const swapped = summary();
    swapped.overdue.buckets = [...swapped.overdue.buckets].reverse();
    expect(BillingDashboardSummarySchema.safeParse(swapped).success).toBe(false);
  });

  it('rechaza más suscriptores que documentos vencidos', () => {
    const wrong = summary();
    wrong.overdue.subscriberCount = 7;
    expect(BillingDashboardSummarySchema.safeParse(wrong).success).toBe(false);
  });

  it('rechaza una serie que no es de doce meses contiguos terminando en asOf', () => {
    const short = summary();
    short.series = short.series.slice(1);
    expect(BillingDashboardSummarySchema.safeParse(short).success).toBe(false);
    const gap = summary();
    gap.series[3] = { ...gap.series[3]!, month: '2026-04' };
    expect(BillingDashboardSummarySchema.safeParse(gap).success).toBe(false);
    expect(
      BillingDashboardSummarySchema.safeParse({ ...summary(), asOf: '2026-12-01' }).success,
    ).toBe(false);
  });

  it('cruza el año en la serie', () => {
    const january = summary();
    january.asOf = '2026-01-05';
    january.series = january.series.map((m, i) => ({
      ...m,
      month:
        i === 0
          ? '2025-02'
          : `${i < 11 ? '2025' : '2026'}-${String(i < 11 ? i + 2 : 1).padStart(2, '0')}`,
    }));
    expect(BillingDashboardSummarySchema.safeParse(january).success).toBe(true);
  });

  it('exige que el mes en curso coincida con el último de la serie', () => {
    expect(
      BillingDashboardSummarySchema.safeParse({ ...summary(), collectedAmount: '1.00' }).success,
    ).toBe(false);
    // Misma cifra con distinta escritura decimal sí coincide.
    const scale = summary();
    scale.series[11] = { ...scale.series[11]!, invoicedAmount: '1250000' };
    expect(BillingDashboardSummarySchema.safeParse(scale).success).toBe(true);
  });

  it('rechaza una fecha civil inexistente', () => {
    expect(
      BillingDashboardSummarySchema.safeParse({ ...summary(), asOf: '2026-11-31' }).success,
    ).toBe(false);
  });
});

describe('BillingDashboardSummaryQuerySchema', () => {
  it('no acepta parámetros', () => {
    expect(BillingDashboardSummaryQuerySchema.safeParse({}).success).toBe(true);
    expect(BillingDashboardSummaryQuerySchema.safeParse({ months: '24' }).success).toBe(false);
  });
});
