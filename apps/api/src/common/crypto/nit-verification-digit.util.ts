import { BadRequestException } from '@nestjs/common';

const NIT_WEIGHTS_FROM_RIGHT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calculateNitVerificationDigit(nit: string): string {
  const digits = nit.replace(/\D/gu, '');
  if (digits.length === 0 || digits.length > NIT_WEIGHTS_FROM_RIGHT.length) {
    throw new BadRequestException('El NIT del expediente no tiene un formato válido.');
  }

  const weightedSum = [...digits]
    .reverse()
    .reduce((sum, digit, index) => sum + Number(digit) * NIT_WEIGHTS_FROM_RIGHT[index]!, 0);
  const remainder = weightedSum % 11;
  return String(remainder < 2 ? remainder : 11 - remainder);
}

export interface ParsedNit {
  nit: string;
  verificationDigit: string | null;
}

/** Lee NIT y dígito de verificación cuando el expediente los presenta como `base-DV`. */
export function parseExpedienteNit(value: string | null | undefined): ParsedNit | null {
  if (!value?.trim()) return null;

  const separatorIndex = value.lastIndexOf('-');
  if (separatorIndex < 0) {
    const nit = value.replace(/\D/gu, '');
    if (!nit) throw new BadRequestException('El NIT del expediente no tiene un formato válido.');
    return { nit, verificationDigit: null };
  }

  const rawNit = value.slice(0, separatorIndex).replace(/\D/gu, '');
  const rawDigit = value.slice(separatorIndex + 1).replace(/\D/gu, '');
  if (!rawNit || rawDigit.length !== 1) {
    throw new BadRequestException('El NIT del expediente no tiene un formato válido.');
  }

  const expectedDigit = calculateNitVerificationDigit(rawNit);
  if (rawDigit !== expectedDigit) {
    throw new BadRequestException('El dígito de verificación del NIT del expediente no coincide.');
  }

  return { nit: rawNit, verificationDigit: rawDigit };
}
