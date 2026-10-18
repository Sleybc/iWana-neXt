import { BadRequestException } from '@nestjs/common';
import {
  calculateNitVerificationDigit,
  parseExpedienteNit,
} from './nit-verification-digit.adapter';

describe('nit-verification-digit.adapter', () => {
  it('mapea el error de formato compartido a BadRequestException', () => {
    expect(() => calculateNitVerificationDigit('1234567890123456')).toThrow(BadRequestException);
  });

  it('mapea el rechazo de DV compartido a BadRequestException', () => {
    expect(() => parseExpedienteNit('900.123.456-7')).toThrow(BadRequestException);
  });

  it('conserva el parsing heredado sin DV explícito', () => {
    expect(parseExpedienteNit('900.123.456')).toEqual({
      nit: '900123456',
      verificationDigit: null,
    });
  });
});
