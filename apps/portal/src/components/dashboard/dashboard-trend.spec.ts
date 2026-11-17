import {
  AssuranceDashboardSeriesSchema,
  BillingDashboardSummarySchema,
  SubscribersDashboardSummarySchema,
} from '@iwana/shared';
import {
  buildDashboardTrendTabs,
  formatTrendDay,
  formatTrendDayLong,
  formatTrendMonth,
  formatTrendMonthLong,
} from './dashboard-trend';
import {
  billingSummaryFixture,
  casesSeriesFixture,
  subscribersSummaryFixture,
} from './dashboard-series-test-fixtures';

const none = { data: null, updating: false };

describe('dashboard-trend', () => {
  it('las respuestas de prueba cumplen los contratos congelados N1–N3', () => {
    expect(BillingDashboardSummarySchema.safeParse(billingSummaryFixture()).success).toBe(true);
    expect(SubscribersDashboardSummarySchema.safeParse(subscribersSummaryFixture()).success).toBe(
      true,
    );
    expect(AssuranceDashboardSeriesSchema.safeParse(casesSeriesFixture()).success).toBe(true);
  });

  it('formatea meses y días partiendo la clave civil, sin desplazarse por zona horaria', () => {
    // `new Date('2026-01')` en una zona al oeste de UTC caería en diciembre de 2025.
    expect(formatTrendMonth('2026-01')).toMatch(/^ene/);
    expect(formatTrendMonth('2025-12')).toMatch(/^dic/);
    expect(formatTrendMonthLong('2026-11', '2026-11')).toBe('noviembre de 2026 (en curso)');
    expect(formatTrendMonthLong('2026-10', '2026-11')).toBe('octubre de 2026');
    expect(formatTrendDay('2026-11-01')).toBe('1');
    expect(formatTrendDayLong('2026-11-17', '2026-11-17')).toMatch(/17 de noviembre \(hoy\)$/);
    expect(formatTrendDayLong('2026-11-16', '2026-11-17')).toMatch(/^lunes, 16 de noviembre$/);
  });

  it('ofrece solo las pestañas con dato y en el orden de la composición', () => {
    const tabs = buildDashboardTrendTabs({
      trendIds: ['collections', 'subscribers', 'cases'],
      subscribers: { data: subscribersSummaryFixture(), updating: false },
      collections: none,
      cases: { data: casesSeriesFixture(), updating: true },
    });
    expect(tabs.map((tab) => tab.id)).toEqual(['subscribers', 'cases']);
    expect(tabs[1]!.chart.updating).toBe(true);
  });

  it('sin ninguna fuente con dato no hay pestañas (el bloque no se monta)', () => {
    expect(
      buildDashboardTrendTabs({
        trendIds: ['subscribers', 'collections', 'cases'],
        subscribers: none,
        collections: none,
        cases: none,
      }),
    ).toEqual([]);
  });

  it('una fuente autorizada pero ajena al rol no añade pestaña', () => {
    const tabs = buildDashboardTrendTabs({
      trendIds: ['cases'],
      subscribers: { data: subscribersSummaryFixture(), updating: false },
      collections: { data: billingSummaryFixture(), updating: false },
      cases: none,
    });
    expect(tabs).toEqual([]);
  });

  it('Suscriptores: altas en lima de avance y retiros sin lima, con resumen de datos reales', () => {
    const [tab] = buildDashboardTrendTabs({
      trendIds: ['subscribers'],
      subscribers: { data: subscribersSummaryFixture(), updating: false },
      collections: none,
      cases: none,
    });
    if (tab?.id !== 'subscribers') throw new Error('pestaña esperada');
    expect(tab.chart.kind).toBe('grouped-bar');
    expect(tab.chart.series).toEqual([
      { key: 'activations', label: 'Altas', token: 'chart-2', progress: true, mark: 'solid' },
      { key: 'cancellations', label: 'Retiros', token: 'chart-4', mark: 'outline' },
    ]);
    expect(tab.chart.data).toHaveLength(12);
    expect(tab.chart.summary).toBe(
      'Altas y retiros de suscriptores por mes. En noviembre: 61 altas y 23 retiros.',
    );
    expect(tab.chart.xHeader).toBe('Mes');
  });

  it('Recaudo: importes de texto a número solo para graficar; recaudado sin lima', () => {
    const [tab] = buildDashboardTrendTabs({
      trendIds: ['collections'],
      subscribers: none,
      collections: { data: billingSummaryFixture(), updating: false },
      cases: none,
    });
    if (tab?.id !== 'collections') throw new Error('pestaña esperada');
    expect(tab.chart.valueKind).toBe('amount');
    expect(tab.chart.series.map((series) => series.token)).toEqual(['chart-4', 'chart-1']);
    expect(tab.chart.data.at(-1)).toEqual({
      x: '2026-11',
      invoiced: 182_600_000,
      collected: 148_200_000,
    });
    expect(tab.chart.formatValue(148_200_000)).toMatch(/^\$\s148\.200\.000$/);
    expect(tab.chart.formatAxisValue?.(148_200_000)).toMatch(/148,2\s?M/);
    expect(tab.chart.summary).toMatch(
      /^Facturado y recaudado por mes\. En noviembre, mes en curso: /,
    );
  });

  it('Casos: líneas diarias, resueltos discontinuos en lima de avance y resumen de hoy', () => {
    const [tab] = buildDashboardTrendTabs({
      trendIds: ['cases'],
      subscribers: none,
      collections: none,
      cases: { data: casesSeriesFixture(), updating: false },
    });
    if (tab?.id !== 'cases') throw new Error('pestaña esperada');
    expect(tab.chart.kind).toBe('line');
    expect(tab.chart.series[1]).toEqual({
      key: 'resolved',
      label: 'Resueltos',
      token: 'chart-2',
      progress: true,
      mark: 'dashed',
    });
    expect(tab.chart.data).toHaveLength(14);
    expect(tab.chart.summary).toBe(
      'Casos creados y resueltos por día. Hoy: 11 creados y 9 resueltos.',
    );
    expect(tab.subtitle).toBe('Casos creados frente a resueltos · últimos 14 días');
  });

  it('el resumen usa singular con una sola alta o un solo retiro', () => {
    const [tab] = buildDashboardTrendTabs({
      trendIds: ['subscribers'],
      subscribers: {
        data: subscribersSummaryFixture({ activations: 1, cancellations: 1 }),
        updating: false,
      },
      collections: none,
      cases: none,
    });
    expect(tab?.chart.summary).toMatch(/1 alta y 1 retiro\.$/);
  });

  it.each([
    ['hoy', [['cases', 1]]],
    ['7-dias', [['cases', 7]]],
    [
      'mes',
      [
        ['subscribers', 1],
        ['collections', 1],
        ['cases', 14],
      ],
    ],
    [
      '12-meses',
      [
        ['subscribers', 12],
        ['collections', 12],
      ],
    ],
  ] as const)(
    'al seleccionar %s conserva solo las series con la granularidad disponible',
    (period, expected) => {
      const tabs = buildDashboardTrendTabs({
        period,
        trendIds: ['subscribers', 'collections', 'cases'],
        subscribers: { data: subscribersSummaryFixture(), updating: false },
        collections: { data: billingSummaryFixture(), updating: false },
        cases: { data: casesSeriesFixture(), updating: false },
      });
      expect(tabs.map(({ id, chart }) => [id, chart.data.length])).toEqual(expected);
    },
  );

  it('Este mes omite los días del mes anterior presentes en la serie', () => {
    const fixture = casesSeriesFixture();
    const [tab] = buildDashboardTrendTabs({
      period: 'mes',
      trendIds: ['cases'],
      subscribers: none,
      collections: none,
      cases: {
        updating: false,
        data: {
          ...fixture,
          asOf: '2026-11-02',
          series: [
            { date: '2026-10-31', created: 7, resolved: 3 },
            { date: '2026-11-01', created: 4, resolved: 6 },
            { date: '2026-11-02', created: 5, resolved: 4 },
          ],
        },
      },
    });
    expect(tab?.chart.data.map(({ x }) => x)).toEqual(['2026-11-01', '2026-11-02']);
  });
});
