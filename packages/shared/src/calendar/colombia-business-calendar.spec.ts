import {
  addCalendarMonths,
  addColombiaBusinessDays,
  colombiaHolidays,
  isColombiaBusinessDay,
} from './colombia-business-calendar';

describe('C-CAL-1 v1.0 — calendario civil colombiano', () => {
  it('publica los festivos nacionales observados en 2026', () => {
    expect(colombiaHolidays(2026)).toEqual([
      '2026-01-01',
      '2026-01-12',
      '2026-03-23',
      '2026-03-29',
      '2026-04-02',
      '2026-04-03',
      '2026-04-05',
      '2026-05-01',
      '2026-05-18',
      '2026-06-08',
      '2026-06-15',
      '2026-06-29',
      '2026-07-13',
      '2026-07-20',
      '2026-08-07',
      '2026-08-17',
      '2026-10-12',
      '2026-11-02',
      '2026-11-16',
      '2026-12-08',
      '2026-12-25',
    ]);
  });

  it('calcula los festivos nacionales observados en 2027 según Ley 51 y Pascua', () => {
    expect(colombiaHolidays(2027)).toEqual([
      '2027-01-01',
      '2027-01-11',
      '2027-03-21',
      '2027-03-22',
      '2027-03-25',
      '2027-03-26',
      '2027-03-28',
      '2027-05-01',
      '2027-05-10',
      '2027-05-31',
      '2027-06-07',
      '2027-07-05',
      '2027-07-12',
      '2027-07-20',
      '2027-08-07',
      '2027-08-16',
      '2027-10-18',
      '2027-11-01',
      '2027-11-15',
      '2027-12-08',
      '2027-12-25',
    ]);
  });

  it('excluye fines de semana y festivos y cuenta desde el día siguiente', () => {
    expect(isColombiaBusinessDay('2026-04-02')).toBe(false);
    expect(isColombiaBusinessDay('2026-04-06')).toBe(true);
    expect(addColombiaBusinessDays('2026-04-01', 1)).toBe('2026-04-06');
    expect(addColombiaBusinessDays('2026-04-01', 5)).toBe('2026-04-10');
    expect(addColombiaBusinessDays('2026-04-01', 0)).toBe('2026-04-01');
  });

  it('suma meses calendario y ajusta al último día del mes destino', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-10-14', 2)).toBe('2026-12-14');
  });
});
