import { BadRequestException } from '@nestjs/common';
import { calculateNitVerificationDigit, parseExpedienteNit } from './nit-verification-digit.util';

describe('nit-verification-digit.util', () => {
  it('calcula el DV por módulo 11', () => {
    expect(calculateNitVerificationDigit('900.123.456')).toBe('8');
  });

  it('parsea y conserva el DV explícito válido del expediente', () => {
    expect(parseExpedienteNit('900.123.456-8')).toEqual({
      nit: '900123456',
      verificationDigit: '8',
    });
  });

  it('falla cerrado si el DV explícito no coincide', () => {
    expect(() => parseExpedienteNit('900.123.456-7')).toThrow(BadRequestException);
  });

  it('permite expediente sin DV explícito y no lo inventa', () => {
    expect(parseExpedienteNit('900.123.456')).toEqual({
      nit: '900123456',
      verificationDigit: null,
    });
  });
});
