import { clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from './clamp-limit';

describe('clampLimit', () => {
  it('devuelve DEFAULT_LIMIT cuando limit es undefined/null', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(null)).toBe(DEFAULT_LIMIT);
  });

  it('devuelve DEFAULT_LIMIT cuando limit no es finito o es < 1', () => {
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(-5)).toBe(DEFAULT_LIMIT);
  });

  it('respeta un limit válido dentro del tope', () => {
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(50)).toBe(50);
    expect(clampLimit(100)).toBe(100);
  });

  it('capa al MAX_LIMIT por defecto (100) — H-1 / Ley 1581', () => {
    expect(clampLimit(101)).toBe(MAX_LIMIT);
    expect(clampLimit(10_000)).toBe(MAX_LIMIT);
    expect(MAX_LIMIT).toBe(100);
  });

  it('acepta un max personalizado', () => {
    expect(clampLimit(500, 200)).toBe(200);
    expect(clampLimit(50, 200)).toBe(50);
  });

  it('acepta un defaultLimit personalizado', () => {
    expect(clampLimit(undefined, 100, 25)).toBe(25);
    expect(clampLimit(0, 100, 25)).toBe(25);
  });

  it('trunca decimales hacia abajo antes de capar', () => {
    expect(clampLimit(20.9)).toBe(20);
    expect(clampLimit(100.9)).toBe(100);
  });
});
