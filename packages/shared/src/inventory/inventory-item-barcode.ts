import { InventoryBarcodeType } from '../enums/inventory/inventory-barcode-type.enum';

/**
 * Validación del código de barras del artículo (MOD12 · F4 · PRD §11, reglas 3 y 4).
 *
 * - EAN13 y UPCA: dígito de control módulo 10 GS1, autoritativo en backend.
 * - CODE128 y OTHER: solo longitud y caracteres.
 * El cliente puede replicar estas funciones para respuesta inmediata, pero la
 * barrera es el schema Zod del backend (`refineInventoryItemMaster`).
 */

export const INVENTORY_BARCODE_MAX_LENGTH = 64;

/** El módulo 10 GS1 opera sobre dígitos numéricos exclusivamente. */
const GTIN_DIGITS_PATTERN = /^\d+$/;

/** CODE128 (modo B) codifica ASCII imprimible; OTHER sigue la misma regla de captura. */
const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]+$/;

/**
 * Dígito de control módulo 10 GS1 (GTIN): sobre el payload SIN check, de derecha
 * a izquierda, pesos alternos 3 y 1 empezando por 3. Válido para EAN-13 (12
 * dígitos de payload) y UPC-A (11): ambos comparten el mismo algoritmo.
 * Retorna null si el payload no es numérico o está vacío.
 */
export function computeGtinCheckDigit(payload: string): number | null {
  if (!payload || !GTIN_DIGITS_PATTERN.test(payload)) {
    return null;
  }

  let sum = 0;
  for (let index = 0; index < payload.length; index += 1) {
    const digit = Number(payload[payload.length - 1 - index]);
    sum += digit * (index % 2 === 0 ? 3 : 1);
  }

  return (10 - (sum % 10)) % 10;
}

/** EAN-13: exactamente 13 dígitos con dígito de control módulo 10 GS1 válido. */
export function isValidEan13Barcode(value: string): boolean {
  if (!GTIN_DIGITS_PATTERN.test(value) || value.length !== 13) {
    return false;
  }

  const expected = computeGtinCheckDigit(value.slice(0, 12));
  return expected !== null && expected === Number(value[12]);
}

/** UPC-A: exactamente 12 dígitos con dígito de control módulo 10 GS1 válido. */
export function isValidUpcaBarcode(value: string): boolean {
  if (!GTIN_DIGITS_PATTERN.test(value) || value.length !== 12) {
    return false;
  }

  const expected = computeGtinCheckDigit(value.slice(0, 11));
  return expected !== null && expected === Number(value[11]);
}

export type BarcodeValidationFailure = {
  ok: false;
  /** Mensaje en español que explica el motivo del rechazo (CA-F4-03). */
  message: string;
};

export type BarcodeValidationResult = { ok: true } | BarcodeValidationFailure;

function lengthAndCharsetFailure(barcodeType: InventoryBarcodeType): BarcodeValidationFailure {
  if (barcodeType === InventoryBarcodeType.CODE128) {
    return {
      ok: false,
      message:
        'El código CODE128 debe tener entre 1 y 64 caracteres ASCII imprimibles (sin acentos ni símbolos no imprimibles).',
    };
  }

  return {
    ok: false,
    message:
      'El código de barras debe tener entre 1 y 64 caracteres ASCII imprimibles (sin acentos ni símbolos no imprimibles).',
  };
}

/**
 * Valida un valor de código de barras según su formato declarado.
 * Asume el valor ya recortado y no vacío (la regla "van juntos" y el
 * recorte viven en el schema Zod del módulo inventory).
 */
export function validateBarcodeValue(
  barcodeType: InventoryBarcodeType,
  value: string,
): BarcodeValidationResult {
  if (value.length > INVENTORY_BARCODE_MAX_LENGTH) {
    return lengthAndCharsetFailure(barcodeType);
  }

  switch (barcodeType) {
    case InventoryBarcodeType.EAN13: {
      if (!GTIN_DIGITS_PATTERN.test(value) || value.length !== 13) {
        return {
          ok: false,
          message:
            'Un código EAN13 debe tener exactamente 13 dígitos numéricos. Revisa que el número esté completo.',
        };
      }

      if (!isValidEan13Barcode(value)) {
        return {
          ok: false,
          message:
            'El dígito de control del código EAN13 no es válido: revisa que el número esté completo y sin errores de tecleo.',
        };
      }

      return { ok: true };
    }
    case InventoryBarcodeType.UPCA: {
      if (!GTIN_DIGITS_PATTERN.test(value) || value.length !== 12) {
        return {
          ok: false,
          message:
            'Un código UPCA debe tener exactamente 12 dígitos numéricos. Revisa que el número esté completo.',
        };
      }

      if (!isValidUpcaBarcode(value)) {
        return {
          ok: false,
          message:
            'El dígito de control del código UPCA no es válido: revisa que el número esté completo y sin errores de tecleo.',
        };
      }

      return { ok: true };
    }
    case InventoryBarcodeType.CODE128: {
      if (!PRINTABLE_ASCII_PATTERN.test(value)) {
        return {
          ok: false,
          message:
            'El código CODE128 debe tener entre 1 y 64 caracteres ASCII imprimibles (sin acentos ni símbolos no imprimibles).',
        };
      }

      return { ok: true };
    }
    case InventoryBarcodeType.OTHER: {
      if (!PRINTABLE_ASCII_PATTERN.test(value)) {
        return lengthAndCharsetFailure(barcodeType);
      }

      return { ok: true };
    }
  }
}
