import { formatRelativeTime } from './format-relative-time';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('formatRelativeTime', () => {
  it.each([
    ['nulo', null],
    ['indefinido', undefined],
    ['texto inválido', 'no-es-fecha'],
    ['Date inválido', new Date('x')],
  ])('devuelve «Reciente» con valor %s', (_label, value) => {
    expect(formatRelativeTime(value, NOW)).toBe('Reciente');
  });

  it('trata una fecha futura como «ahora»', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * MIN), NOW)).toBe('ahora');
  });

  it('devuelve «ahora» por debajo de un minuto', () => {
    expect(formatRelativeTime(ago(59_999), NOW)).toBe('ahora');
  });

  it('usa minutos entre 1 y 59', () => {
    expect(formatRelativeTime(ago(MIN), NOW)).toBe('hace 1 minuto');
    expect(formatRelativeTime(ago(59 * MIN), NOW)).toBe('hace 59 minutos');
  });

  it('pasa a horas en el minuto 60 y se queda en horas hasta 23 h 59', () => {
    expect(formatRelativeTime(ago(60 * MIN), NOW)).toBe('hace 1 hora');
    expect(formatRelativeTime(ago(23 * HOUR + 59 * MIN), NOW)).toBe('hace 23 horas');
  });

  it('pasa a días en la hora 24', () => {
    expect(formatRelativeTime(ago(24 * HOUR), NOW)).toBe('ayer');
    expect(formatRelativeTime(ago(5 * 24 * HOUR), NOW)).toBe('hace 5 días');
  });

  it('acepta cadena ISO', () => {
    expect(formatRelativeTime(ago(3 * HOUR).toISOString(), NOW)).toBe('hace 3 horas');
  });

  it('usa la hora actual cuando no recibe now', () => {
    expect(formatRelativeTime(new Date(Date.now() - 2 * MIN))).toBe('hace 2 minutos');
  });
});
