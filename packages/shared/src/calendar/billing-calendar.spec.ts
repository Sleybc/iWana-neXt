import {
  addDays,
  computeBillingPeriod,
  computeDueAndCutoff,
  computeGenerationDate,
  resolveGenerationTarget,
  BILLING_TERMINATED_LOOKBACK_DAYS,
  nextBillingDates,
  prorate,
  roundHalfUpToCents,
  shiftLateDueAndCutoff,
} from './billing-calendar';
import type {
  BillingCutoffMode,
  BillingPeriodTiming,
} from '../contracts/billing/billing-constants';

describe('billing-calendar (ADR-103 D5, PRD §6, CA-FAC-01)', () => {
  describe('Tabla de ejemplos del PRD §6 con valores por defecto (ANTICIPADO, DIA_FIJO_CICLO)', () => {
    const tableCases = [
      {
        cycleDay: 1,
        year: 2026,
        month: 11,
        cutoffDay: 15,
        expectedPeriod: { periodStart: '2026-11-01', periodEnd: '2026-11-30' },
        expectedGen: '2026-11-01',
        expectedDue: '2026-11-14',
        expectedCutoff: '2026-11-15',
      },
      {
        cycleDay: 15,
        year: 2026,
        month: 11,
        cutoffDay: 30,
        expectedPeriod: { periodStart: '2026-11-15', periodEnd: '2026-12-14' },
        expectedGen: '2026-11-15',
        expectedDue: '2026-11-29',
        expectedCutoff: '2026-11-30',
      },
      {
        cycleDay: 15,
        year: 2027,
        month: 2,
        cutoffDay: 30,
        expectedPeriod: { periodStart: '2027-02-15', periodEnd: '2027-03-14' },
        expectedGen: '2027-02-15',
        expectedDue: '2027-02-27',
        expectedCutoff: '2027-02-28', // Febrero no bisiesto
      },
      {
        cycleDay: 15,
        year: 2028,
        month: 2,
        cutoffDay: 30,
        expectedPeriod: { periodStart: '2028-02-15', periodEnd: '2028-03-14' },
        expectedGen: '2028-02-15',
        expectedDue: '2028-02-28',
        expectedCutoff: '2028-02-29', // Febrero bisiesto
      },
      {
        cycleDay: 1,
        year: 2026,
        month: 12,
        cutoffDay: 15,
        expectedPeriod: { periodStart: '2026-12-01', periodEnd: '2026-12-31' },
        expectedGen: '2026-12-01',
        expectedDue: '2026-12-14',
        expectedCutoff: '2026-12-15',
      },
    ];

    it.each(tableCases)(
      'reproduce exactamente el caso ciclo $cycleDay ($year-$month)',
      ({
        cycleDay,
        year,
        month,
        cutoffDay,
        expectedPeriod,
        expectedGen,
        expectedDue,
        expectedCutoff,
      }) => {
        // 1. Periodo
        const period = computeBillingPeriod(cycleDay, year, month);
        expect(period).toEqual(expectedPeriod);

        // 2. Generación (anticipado, leadDays = 0)
        const genDate = computeGenerationDate(period, 'ANTICIPADO', 0);
        expect(genDate).toBe(expectedGen);

        // 3. Vencimiento y Corte
        const { dueDate, cutoffDate } = computeDueAndCutoff(
          period,
          {
            cutoffMode: 'DIA_FIJO_CICLO',
            paymentTermDays: 14,
            graceDays: 0,
            cutoffEnabled: true,
          },
          genDate,
          cutoffDay,
        );
        expect(dueDate).toBe(expectedDue);
        expect(cutoffDate).toBe(expectedCutoff);
      },
    );
  });

  describe('Modo VENCIMIENTO_MAS_GRACIA (PRD §6)', () => {
    it('calcula vencimiento = emisión + plazo (14) y corte = vencimiento + gracia (3)', () => {
      const period = computeBillingPeriod(1, 2026, 11); // 2026-11-01 -> 2026-11-30
      const issueDate = '2026-11-01';
      const { dueDate, cutoffDate } = computeDueAndCutoff(
        period,
        {
          cutoffMode: 'VENCIMIENTO_MAS_GRACIA',
          paymentTermDays: 14,
          graceDays: 3,
          cutoffEnabled: true,
        },
        issueDate,
      );

      expect(dueDate).toBe('2026-11-15');
      expect(cutoffDate).toBe('2026-11-18');
    });

    it('con gracia 0, el corte es el día siguiente al vencimiento (máx(1, 0) = 1)', () => {
      const period = computeBillingPeriod(1, 2026, 11);
      const issueDate = '2026-11-01';
      const { dueDate, cutoffDate } = computeDueAndCutoff(
        period,
        {
          cutoffMode: 'VENCIMIENTO_MAS_GRACIA',
          paymentTermDays: 14,
          graceDays: 0,
          cutoffEnabled: true,
        },
        issueDate,
      );

      expect(dueDate).toBe('2026-11-15');
      expect(cutoffDate).toBe('2026-11-16');
    });

    it('respeta cutoffEnabled = false devolviendo cutoffDate nulo', () => {
      const period = computeBillingPeriod(1, 2026, 11);
      const { dueDate, cutoffDate } = computeDueAndCutoff(
        period,
        {
          cutoffMode: 'VENCIMIENTO_MAS_GRACIA',
          paymentTermDays: 14,
          graceDays: 3,
          cutoffEnabled: false,
        },
        '2026-11-01',
      );

      expect(dueDate).toBe('2026-11-15');
      expect(cutoffDate).toBeNull();
    });
  });

  describe('Cálculo de fecha de generación', () => {
    it('ANTICIPADO con leadDays = 5 genera 5 días antes del inicio del periodo', () => {
      const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };
      const gen = computeGenerationDate(period, 'ANTICIPADO', 5);
      expect(gen).toBe('2026-10-27');
    });

    it('VENCIDO con leadDays = 0 genera el día de inicio del periodo siguiente', () => {
      const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };
      const gen = computeGenerationDate(period, 'VENCIDO', 0);
      expect(gen).toBe('2026-12-01');
    });

    it('VENCIDO con leadDays = 2 genera 2 días antes del inicio del periodo siguiente', () => {
      const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };
      const gen = computeGenerationDate(period, 'VENCIDO', 2);
      expect(gen).toBe('2026-11-29');
    });
  });

  describe('Cambio de año (Diciembre -> Enero) y meses de 30/31 días', () => {
    it('ciclo 15 en diciembre abarca hasta enero del año siguiente', () => {
      const period = computeBillingPeriod(15, 2026, 12);
      expect(period).toEqual({
        periodStart: '2026-12-15',
        periodEnd: '2027-01-14',
      });
    });

    it('ciclo 1 en enero abarca 31 días (2027-01-01 a 2027-01-31)', () => {
      const period = computeBillingPeriod(1, 2027, 1);
      expect(period).toEqual({
        periodStart: '2027-01-01',
        periodEnd: '2027-01-31',
      });
    });

    it('ciclo 1 en abril abarca 30 días (2027-04-01 a 2027-04-30)', () => {
      const period = computeBillingPeriod(1, 2027, 4);
      expect(period).toEqual({
        periodStart: '2027-04-01',
        periodEnd: '2027-04-30',
      });
    });
  });

  describe('Periodo objetivo de generación (RS-11)', () => {
    const testDates = Array.from({ length: 365 }, (_, dayIndex) => addDays('2026-01-01', dayIndex));
    const cases = Array.from({ length: 28 }, (_, index) => index + 1).flatMap((cycleDay) =>
      (['ANTICIPADO', 'VENCIDO'] as const).flatMap((periodTiming) =>
        [0, 5, 15].map((generationLeadDays) => ({
          cycleDay,
          periodTiming,
          generationLeadDays,
        })),
      ),
    );

    it.each(cases)(
      'resuelve ciclo $cycleDay, $periodTiming y anticipación $generationLeadDays para todas las fechas de 2026',
      ({ cycleDay, periodTiming, generationLeadDays }) => {
        for (const localDate of testDates) {
          const policy = { periodTiming, generationLeadDays };
          const target = resolveGenerationTarget(cycleDay, policy, localDate);
          const targetGeneration = computeGenerationDate(target, periodTiming, generationLeadDays);
          expect(targetGeneration <= localDate).toBe(true);

          let nextYear = Number(target.periodStart.slice(0, 4));
          let nextMonth = Number(target.periodStart.slice(5, 7)) + 1;
          if (nextMonth > 12) {
            nextYear += 1;
            nextMonth = 1;
          }
          const nextPeriod = computeBillingPeriod(cycleDay, nextYear, nextMonth);
          const nextGeneration = computeGenerationDate(
            nextPeriod,
            periodTiming,
            generationLeadDays,
          );
          if (nextGeneration <= localDate) {
            throw new Error(
              `El periodo siguiente ya era generable: ciclo=${cycleDay}, ` +
                `timing=${periodTiming}, anticipación=${generationLeadDays}, fecha=${localDate}, ` +
                `objetivo=${target.periodStart}, siguiente=${nextPeriod.periodStart}, ` +
                `generación siguiente=${nextGeneration}.`,
            );
          }

          const daysBack =
            (Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${target.periodStart}T00:00:00Z`)) /
            86_400_000;
          expect(daysBack).toBeLessThanOrEqual(BILLING_TERMINATED_LOOKBACK_DAYS);
        }
      },
    );
  });

  describe('Prorrateo (prorate)', () => {
    it('calcula prorrata con días reales y redondeo a centavos', () => {
      // 50.000 COP por 10 días en un mes de 30 días -> 50000 * 10 / 30 = 16666.67
      const result = prorate('50000', 10, 30, 'DIAS_REALES');
      expect(result).toBe(16666.67);
    });

    it('calcula prorrata con mes de 30 (MES_30)', () => {
      // 60.000 COP por 15 días con mes de 30 -> 60000 * 15 / 30 = 30000.00
      const result = prorate(60000, 15, 31, 'MES_30');
      expect(result).toBe(30000);
    });

    it('retorna 0 si coveredDays es 0', () => {
      expect(prorate(50000, 0, 30)).toBe(0);
    });
  });

  describe('Vista previa de próximas fechas (nextBillingDates)', () => {
    it('omite fechas de generación pasadas y conserva la fecha del día cuando coincide', () => {
      const preview = nextBillingDates({
        cycleDay: 1,
        cutoffDay: 15,
        policy: {
          periodTiming: 'ANTICIPADO',
          generationLeadDays: 0,
          cutoffMode: 'DIA_FIJO_CICLO',
          paymentTermDays: 14,
          graceDays: 0,
          cutoffEnabled: true,
        },
        today: '2026-11-03',
      });

      expect(preview).toHaveLength(3);
      expect(preview[0]).toEqual({
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        generationDate: '2026-12-01',
        dueDate: '2026-12-14',
        cutoffDate: '2026-12-15',
      });
      expect(preview[1]).toEqual({
        periodStart: '2027-01-01',
        periodEnd: '2027-01-31',
        generationDate: '2027-01-01',
        dueDate: '2027-01-14',
        cutoffDate: '2027-01-15',
      });
      expect(preview[2]).toEqual({
        periodStart: '2027-02-01',
        periodEnd: '2027-02-28',
        generationDate: '2027-02-01',
        dueDate: '2027-02-14',
        cutoffDate: '2027-02-15',
      });

      const onGenerationDate = nextBillingDates({
        cycleDay: 1,
        cutoffDay: 15,
        policy: {
          periodTiming: 'ANTICIPADO',
          generationLeadDays: 0,
          cutoffMode: 'DIA_FIJO_CICLO',
          paymentTermDays: 14,
          graceDays: 0,
          cutoffEnabled: true,
        },
        today: '2026-11-01',
      });
      expect(onGenerationDate[0]?.generationDate).toBe('2026-11-01');
    });
  });

  describe('shiftLateDueAndCutoff (spec 2026-11-11 R8, CA-7)', () => {
    it('periodo de octubre generado el 11-nov vence el 25-nov y el corte se corre igual', () => {
      const cycle = computeDueAndCutoff(
        { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
        { cutoffMode: 'DIA_FIJO_CICLO', paymentTermDays: 14, graceDays: 0 },
        '2026-11-11',
        15,
      );
      expect(cycle).toEqual({ dueDate: '2026-10-14', cutoffDate: '2026-10-15' });
      expect(shiftLateDueAndCutoff(cycle, '2026-11-11', 14)).toEqual({
        dueDate: '2026-11-25',
        cutoffDate: '2026-11-26',
      });
    });

    it('no cambia un vencimiento en la fecha de referencia o posterior', () => {
      const onTime = { dueDate: '2026-11-14', cutoffDate: '2026-11-15' };
      expect(shiftLateDueAndCutoff(onTime, '2026-11-14', 14)).toBe(onTime);
      expect(shiftLateDueAndCutoff(onTime, '2026-11-01', 14)).toBe(onTime);
    });

    it('conserva el corte deshabilitado y rechaza plazos inválidos', () => {
      expect(
        shiftLateDueAndCutoff({ dueDate: '2026-10-14', cutoffDate: null }, '2026-11-11', 0),
      ).toEqual({ dueDate: '2026-11-11', cutoffDate: null });
      expect(() =>
        shiftLateDueAndCutoff({ dueDate: '2026-10-14', cutoffDate: null }, '2026-11-11', -1),
      ).toThrow(RangeError);
    });
  });
});
