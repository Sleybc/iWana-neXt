import {
  AssuranceDashboardSeriesQuerySchema,
  AssuranceDashboardSeriesSchema,
} from './assurance-dashboard-series.contract';

function series(asOf: string, days: number) {
  const end = new Date(`${asOf}T00:00:00.000Z`);
  return {
    asOf,
    days,
    series: Array.from({ length: days }, (_, index) => {
      const day = new Date(end);
      day.setUTCDate(end.getUTCDate() - (days - 1 - index));
      return { date: day.toISOString().slice(0, 10), created: index, resolved: 0 };
    }),
  };
}

describe('AssuranceDashboardSeriesQuerySchema', () => {
  it('usa 14 días por defecto', () => {
    expect(AssuranceDashboardSeriesQuerySchema.parse({})).toEqual({ days: 14 });
  });

  it('acepta el texto de la URL dentro de 7–31', () => {
    expect(AssuranceDashboardSeriesQuerySchema.parse({ days: '7' }).days).toBe(7);
    expect(AssuranceDashboardSeriesQuerySchema.parse({ days: '31' }).days).toBe(31);
  });

  it('rechaza fuera de rango, decimales, texto y parámetros de más', () => {
    for (const days of ['6', '32', '14.5', 'abc', '']) {
      expect(AssuranceDashboardSeriesQuerySchema.safeParse({ days }).success).toBe(false);
    }
    expect(
      AssuranceDashboardSeriesQuerySchema.safeParse({ days: '14', from: '2026-01-01' }).success,
    ).toBe(false);
  });
});

describe('AssuranceDashboardSeriesSchema', () => {
  it('acepta 14 días contiguos que terminan en asOf', () => {
    expect(AssuranceDashboardSeriesSchema.parse(series('2026-11-17', 14)).series).toHaveLength(14);
  });

  it('cruza fin de mes y año bisiesto', () => {
    expect(AssuranceDashboardSeriesSchema.safeParse(series('2028-03-02', 7)).success).toBe(true);
  });

  it('rechaza una serie de largo distinto a days', () => {
    const wrong = series('2026-11-17', 14);
    wrong.series = wrong.series.slice(1);
    expect(AssuranceDashboardSeriesSchema.safeParse(wrong).success).toBe(false);
  });

  it('rechaza huecos, desorden o un último día distinto de asOf', () => {
    const gap = series('2026-11-17', 7);
    gap.series[2] = { ...gap.series[2]!, date: '2026-11-01' };
    expect(AssuranceDashboardSeriesSchema.safeParse(gap).success).toBe(false);
    expect(
      AssuranceDashboardSeriesSchema.safeParse({ ...series('2026-11-17', 7), asOf: '2026-11-18' })
        .success,
    ).toBe(false);
  });

  it('rechaza campos de más y conteos negativos', () => {
    expect(
      AssuranceDashboardSeriesSchema.safeParse({ ...series('2026-11-17', 7), ticketIds: [] })
        .success,
    ).toBe(false);
    const negative = series('2026-11-17', 7);
    negative.series[0] = { ...negative.series[0]!, resolved: -1 };
    expect(AssuranceDashboardSeriesSchema.safeParse(negative).success).toBe(false);
  });

  it('rechaza days fuera de 7–31', () => {
    expect(AssuranceDashboardSeriesSchema.safeParse(series('2026-11-17', 6)).success).toBe(false);
    expect(AssuranceDashboardSeriesSchema.safeParse(series('2026-11-17', 32)).success).toBe(false);
  });
});
