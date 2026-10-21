import { describe, expect, it } from '@jest/globals';
import { E164_PHONE_PATTERN, getCountryPhonePrefix, toDialablePhone } from './profile-phone';

describe('toDialablePhone', () => {
  it('conserva el patrón E.164 público para consumidores actuales', () => {
    expect(E164_PHONE_PATTERN.test('+573001234567')).toBe(true);
  });

  it('usa Colombia cuando el tenant no informa país', () => {
    expect(getCountryPhonePrefix()).toBe('+57');
  });

  it('usa el prefijo colombiano si el país del tenant no está soportado', () => {
    expect(getCountryPhonePrefix('ZZ')).toBe('+57');
  });

  it('antepone el prefijo del tenant a un número local colombiano', () => {
    expect(toDialablePhone('3001234567', getCountryPhonePrefix('CO'))).toBe('+573001234567');
  });

  it('conserva un número que ya empieza con +', () => {
    expect(toDialablePhone('+573001234567', '+57')).toBe('+573001234567');
  });

  it('normaliza espacios y guiones', () => {
    expect(toDialablePhone('300 123-4567', '+57')).toBe('+573001234567');
  });

  it('normaliza puntos y paréntesis', () => {
    expect(toDialablePhone('(300) 123.4567', '+57')).toBe('+573001234567');
  });

  it('usa el prefijo entregado para otros países', () => {
    expect(toDialablePhone('5551234567', '+1')).toBe('+15551234567');
  });

  it.each(['1234', '300123456A', '', '   ', null, undefined])(
    'devuelve null cuando el valor no forma un E.164 marcable (%s)',
    (raw) => {
      expect(toDialablePhone(raw, '+57')).toBeNull();
    },
  );
});
