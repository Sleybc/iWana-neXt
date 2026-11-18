import { formatDueRelative, formatElapsed } from './format-relative-time';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatElapsed', () => {
  it.each([
    [0, '1 min'],
    [30 * 1000, '1 min'],
    [45 * MINUTE, '45 min'],
    [3 * HOUR, '3 h'],
    [47 * HOUR, '47 h'],
    [2 * DAY, '2 días'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

describe('formatDueRelative', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');

  it('plazo futuro: «Vence en …»', () => {
    expect(formatDueRelative(now + 3 * HOUR, now)).toBe('Vence en 3 h');
  });

  it('plazo pasado: «Vencido hace …»', () => {
    expect(formatDueRelative(now - 2 * DAY, now)).toBe('Vencido hace 2 días');
  });

  it('plazo justo ahora cuenta como por vencer', () => {
    expect(formatDueRelative(now, now)).toBe('Vence en 1 min');
  });
});
