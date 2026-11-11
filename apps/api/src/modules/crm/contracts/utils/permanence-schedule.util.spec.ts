import { ContractPermanenceSchema, PERMANENCE_MAX_MONTHS } from '@iwana/shared';
import {
  NO_PERMANENCE,
  computePermanenceEndDate,
  computePermanenceSchedule,
  shiftPermanenceEndDate,
} from './permanence-schedule.util';

describe('permanence-schedule.util (bloque H, CA-13)', () => {
  describe('computePermanenceSchedule', () => {
    it('prorratea por meses restantes: 12 meses de 120.000', () => {
      const rows = computePermanenceSchedule(120_000, 12);
      expect(rows).toHaveLength(12);
      expect(rows[0]).toEqual({ month: 1, amount: 120_000 });
      expect(rows[1]).toEqual({ month: 2, amount: 110_000 });
      expect(rows[11]).toEqual({ month: 12, amount: 10_000 });
    });

    it('redondea a centavos y nunca crece ni supera el monto', () => {
      for (let months = 1; months <= PERMANENCE_MAX_MONTHS; months += 1) {
        for (const amount of [0.01, 1, 99_999.99, 100_000, 33_333.33, 7]) {
          const rows = computePermanenceSchedule(amount, months);
          expect(rows.map((row) => row.month)).toEqual(
            Array.from({ length: months }, (_, i) => i + 1),
          );
          rows.forEach((row, index) => {
            expect(row.amount).toBeLessThanOrEqual(amount);
            expect(Number(row.amount.toFixed(2))).toBe(row.amount);
            if (index > 0) expect(row.amount).toBeLessThanOrEqual(rows[index - 1]!.amount);
          });
          expect(rows[0]!.amount).toBe(amount);
        }
      }
    });

    it('un solo mes devuelve el monto completo', () => {
      expect(computePermanenceSchedule(50_000, 1)).toEqual([{ month: 1, amount: 50_000 }]);
    });

    it('cumple ContractPermanenceSchema con fechas fijadas', () => {
      const schedule = computePermanenceSchedule(85_000.5, 7);
      const parsed = ContractPermanenceSchema.safeParse({
        accepted: true,
        months: 7,
        connectionFee: 100_000,
        discountedOrDeferredAmount: 85_000.5,
        startDate: '2026-11-11',
        endDate: computePermanenceEndDate('2026-11-11', 7),
        schedule,
      });
      expect(parsed.success).toBe(true);
    });

    it.each([0, 13, 1.5, -1, Number.NaN])('rechaza %p meses', (months) => {
      expect(() => computePermanenceSchedule(1000, months)).toThrow(RangeError);
    });

    it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])('rechaza el monto %p', (amount) => {
      expect(() => computePermanenceSchedule(amount, 3)).toThrow(RangeError);
    });
  });

  describe('computePermanenceEndDate', () => {
    it('suma N meses en fecha civil', () => {
      expect(computePermanenceEndDate('2026-11-11', 12)).toBe('2027-11-11');
      expect(computePermanenceEndDate('2026-11-11', 1)).toBe('2026-12-11');
    });

    it('lleva al último día cuando el día no existe', () => {
      expect(computePermanenceEndDate('2026-01-31', 1)).toBe('2026-02-28');
      expect(computePermanenceEndDate('2027-08-31', 6)).toBe('2028-02-29');
    });

    it('rechaza fechas y meses inválidos', () => {
      expect(() => computePermanenceEndDate('2026-02-30', 3)).toThrow(RangeError);
      expect(() => computePermanenceEndDate('11/11/2026', 3)).toThrow(RangeError);
      expect(() => computePermanenceEndDate('2026-11-11', 13)).toThrow(RangeError);
    });
  });

  describe('shiftPermanenceEndDate', () => {
    it('corre el fin los días de suspensión voluntaria', () => {
      expect(shiftPermanenceEndDate('2027-11-11', 30)).toBe('2027-12-11');
      expect(shiftPermanenceEndDate('2027-12-20', 15)).toBe('2028-01-04');
    });

    it('cero días no cambia la fecha', () => {
      expect(shiftPermanenceEndDate('2027-11-11', 0)).toBe('2027-11-11');
    });

    it.each([-1, 2.5])('rechaza %p días', (days) => {
      expect(() => shiftPermanenceEndDate('2027-11-11', days)).toThrow(RangeError);
    });
  });

  it('la opción sin permanencia cumple el esquema', () => {
    expect(ContractPermanenceSchema.safeParse(NO_PERMANENCE).success).toBe(true);
  });
});
