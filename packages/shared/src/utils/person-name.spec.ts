/**
 * Tests de `formatFullName`, `getInitials` y `getTenantInitials`.
 * Tabla de verdad: docs/specs/2026-09-04-contrato-avatar.md v1.0 §4.
 */
import { describe, expect, it } from '@jest/globals';
import { formatFullName, getInitials, getTenantInitials } from './person-name';

describe('formatFullName', () => {
  it('une nombre y apellido con un espacio', () => {
    expect(formatFullName('Ada', 'Lovelace')).toBe('Ada Lovelace');
  });

  it('omite partes ausentes sin dejar huecos', () => {
    expect(formatFullName('Ada', null)).toBe('Ada');
    expect(formatFullName(null, 'Lovelace')).toBe('Lovelace');
    expect(formatFullName(undefined, undefined)).toBe('');
    expect(formatFullName('', '')).toBe('');
  });

  it('cae a cadena vacía, nunca a email (contrato §5)', () => {
    expect(formatFullName(null, null)).toBe('');
  });
});

describe('getInitials (tabla de verdad del contrato §4)', () => {
  it.each([
    ['Ana Gómez', 'AG'],
    ['Madonna', 'MA'],
    ['María del Carmen Ruiz', 'MR'],
    ['José', 'JO'],
    ['A', 'A'],
    ['ana gÓmez', 'AG'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(getInitials(input)).toBe(expected);
  });

  it('cadena vacía o solo blancos → "" (icono)', () => {
    expect(getInitials('')).toBe('');
    expect(getInitials('   ')).toBe('');
  });

  it('nombre ausente (null/undefined) → "" (icono)', () => {
    expect(getInitials(null)).toBe('');
    expect(getInitials(undefined)).toBe('');
  });

  it('una palabra toma sus 2 primeros grafemas, no la segunda palabra', () => {
    expect(getInitials('Li')).toBe('LI');
    expect(getInitials('Ø')).toBe('Ø');
  });

  it('dígitos y signos se conservan tal cual', () => {
    expect(getInitials('3M corporation')).toBe('3C');
  });

  it('fuera del BMP: no rompe pares sustitutos (nunca UTF-16)', () => {
    const result = getInitials('😀 Pérez');

    expect(result).toBe('😀P');
    // Sin sustituto roto: todo sustituto alto va seguido de uno bajo.
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(Array.from(result)).toHaveLength(2);
  });

  it('apellido ausente con nombre de una palabra no inventa letra', () => {
    expect(getInitials('Madonna')).toBe('MA');
  });
});

describe('getTenantInitials (identidad de tenant, fuera de Avatar)', () => {
  it('usa primera+segunda palabra', () => {
    expect(getTenantInitials('Acme Corp', '?')).toBe('AC');
  });

  it('una palabra toma sus 2 primeros grafemas', () => {
    expect(getTenantInitials('Iwana', '?')).toBe('IW');
  });

  it('conserva el repliegue de cada superficie', () => {
    expect(getTenantInitials('', '?')).toBe('?');
    expect(getTenantInitials('   ', 'iW')).toBe('iW');
  });
});
