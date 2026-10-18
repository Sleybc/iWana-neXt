import { BadRequestException } from '@nestjs/common';
import {
  calculateNitVerificationDigit as calculateSharedNitVerificationDigit,
  NitFormatError,
  parseExpedienteNit as parseSharedExpedienteNit,
  type ParsedNit,
} from '@iwana/shared';

export type { ParsedNit } from '@iwana/shared';

function mapNitFormatError<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof NitFormatError) throw new BadRequestException(error.message);
    throw error;
  }
}

export function calculateNitVerificationDigit(nit: string): string {
  return mapNitFormatError(() => calculateSharedNitVerificationDigit(nit));
}

export function parseExpedienteNit(value: string | null | undefined): ParsedNit | null {
  return mapNitFormatError(() => parseSharedExpedienteNit(value));
}
