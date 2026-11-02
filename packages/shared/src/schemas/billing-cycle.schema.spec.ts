import {
  ActivateContractSchema,
  BillingCycleOptionSchema,
  BillingCycleSchema,
  CutoffAgendaQuerySchema,
} from './billing-cycle.schema';

describe('contratos de ciclo de facturación', () => {
  it('acepta los campos públicos del catálogo y activa con ciclo opcional', () => {
    expect(BillingCycleSchema.parse({ cycleDay: 15, cutoffDay: 30, active: true })).toEqual({
      cycleDay: 15,
      cutoffDay: 30,
      active: true,
    });
    expect(ActivateContractSchema.parse({})).toEqual({});
    expect(ActivateContractSchema.parse({ billingCycleDay: 15 })).toEqual({
      billingCycleDay: 15,
    });
  });

  it('valida la fecha de próximo corte del catálogo y rechaza campos ajenos', () => {
    expect(
      BillingCycleOptionSchema.parse({
        cycleDay: 1,
        cutoffDay: 15,
        active: true,
        nextCutoffDate: '2026-11-15',
      }),
    ).toEqual({
      cycleDay: 1,
      cutoffDay: 15,
      active: true,
      nextCutoffDate: '2026-11-15',
    });
    expect(
      BillingCycleOptionSchema.safeParse({
        cycleDay: 1,
        cutoffDay: 15,
        active: true,
        nextCutoffDate: '2026-11-15T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      BillingCycleOptionSchema.safeParse({
        cycleDay: 1,
        cutoffDay: 15,
        active: true,
        nextCutoffDate: '2026-11-15',
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it('rechaza fechas civiles imposibles y limita la paginación de agenda', () => {
    expect(CutoffAgendaQuerySchema.safeParse({ date: '2027-02-29' }).success).toBe(false);
    expect(CutoffAgendaQuerySchema.safeParse({ date: '0000-02-29' }).success).toBe(false);
    expect(CutoffAgendaQuerySchema.safeParse({ date: '1900-02-29' }).success).toBe(false);
    expect(CutoffAgendaQuerySchema.parse({ date: '2028-02-29' })).toMatchObject({
      date: '2028-02-29',
      page: 1,
      limit: 25,
    });
    expect(CutoffAgendaQuerySchema.parse({ date: '2000-02-29' }).date).toBe('2000-02-29');
    expect(CutoffAgendaQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
