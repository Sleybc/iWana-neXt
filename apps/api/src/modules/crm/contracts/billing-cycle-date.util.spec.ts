import { getTenantLocalDate } from './billing-cycle-date.util';

describe('getTenantLocalDate', () => {
  it('usa el día de Bogotá durante las últimas horas del día UTC', () => {
    expect(getTenantLocalDate(new Date('2026-11-15T02:00:00.000Z'), 'America/Bogota')).toBe(
      '2026-11-14',
    );
  });
});
