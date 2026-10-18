import {
  calculateNitVerificationDigit,
  NitFormatError,
  parseExpedienteNit,
} from './nit-verification-digit.util';

describe('NIT verification digit shared contract', () => {
  it.each([
    ['1', '8'],
    ['10', '4'],
    ['900123456', '8'],
    ['123456789012345', '2'],
  ])('calcula el DV del vector %s', (nit, expected) => {
    expect(calculateNitVerificationDigit(nit)).toBe(expected);
  });

  it('acepta NIT-DV con separadores de formato y hasta 15 dígitos', () => {
    expect(parseExpedienteNit('123.456.789.012.345-2')).toEqual({
      nit: '123456789012345',
      verificationDigit: '2',
    });
  });

  it('conserva un NIT sin DV para compatibilidad con expedientes heredados', () => {
    expect(parseExpedienteNit('900.123.456')).toEqual({
      nit: '900123456',
      verificationDigit: null,
    });
    expect(parseExpedienteNit('   ')).toBeNull();
  });

  it.each(['abc', '1234567890123456', '900123456-x', '900123456-7'])(
    'rechaza el NIT inválido %s',
    (value) => {
      expect(() => parseExpedienteNit(value)).toThrow(NitFormatError);
    },
  );

  it('rechaza valores fuera del límite de 15 dígitos', () => {
    expect(() => calculateNitVerificationDigit('1234567890123456')).toThrow(NitFormatError);
  });
});
