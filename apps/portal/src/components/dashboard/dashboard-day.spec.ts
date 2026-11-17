import { dashboardDayKey, dashboardDayRange } from './dashboard-day';

describe('día civil del inicio', () => {
  it('usa la fecha de la empresa aunque en UTC ya sea el día siguiente', () => {
    expect(dashboardDayKey(new Date('2026-11-18T02:00:00Z'), 'America/Bogota')).toBe('2026-11-17');
  });

  it('calcula ambas medianoches aunque el día tenga 23 horas', () => {
    expect(dashboardDayRange('2026-03-08', 'America/New_York')).toEqual({
      from: '2026-03-08T05:00:00.000Z',
      to: '2026-03-09T04:00:00.000Z',
    });
  });
});
