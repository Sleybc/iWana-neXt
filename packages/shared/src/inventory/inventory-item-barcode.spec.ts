import { InventoryBarcodeType } from '../enums/inventory/inventory-barcode-type.enum';
import {
  computeGtinCheckDigit,
  isValidEan13Barcode,
  isValidUpcaBarcode,
  validateBarcodeValue,
} from './inventory-item-barcode';

describe('inventory-item-barcode', () => {
  describe('computeGtinCheckDigit (módulo 10 GS1)', () => {
    it('calcula el dígito EAN-13 para un payload real (400638133393 → 1)', () => {
      expect(computeGtinCheckDigit('400638133393')).toBe(1);
    });

    it('calcula el dígito UPC-A para un payload real (03600029145 → 2)', () => {
      expect(computeGtinCheckDigit('03600029145')).toBe(2);
    });

    it('retorna null para payloads no numéricos o vacíos', () => {
      expect(computeGtinCheckDigit('')).toBeNull();
      expect(computeGtinCheckDigit('84123456789O')).toBeNull();
    });
  });

  describe('isValidEan13Barcode', () => {
    // Nota: el prompt de la fase citaba 8412345678903 como válido, pero el
    // módulo 10 GS1 estándar da check 5 para el payload 841234567890
    // (impares 8+1+3+5+7+9=33; pares (4+2+4+6+8+0)*3=72; total 105 → check 5).
    // El algoritmo correcto es innegociable (CA-F4-03): esos casos van como
    // inválidos y el válido es 8412345678905.
    it('acepta EAN-13 con dígito de control válido', () => {
      expect(isValidEan13Barcode('4006381333931')).toBe(true);
      expect(isValidEan13Barcode('5901234123457')).toBe(true);
      expect(isValidEan13Barcode('8412345678905')).toBe(true);
    });

    it('rechaza EAN-13 con dígito de control inválido', () => {
      expect(isValidEan13Barcode('8412345678903')).toBe(false);
      expect(isValidEan13Barcode('8412345678904')).toBe(false);
      expect(isValidEan13Barcode('4006381333932')).toBe(false);
    });

    it('rechaza longitudes y caracteres incorrectos', () => {
      expect(isValidEan13Barcode('400638133393')).toBe(false);
      expect(isValidEan13Barcode('40063813339311')).toBe(false);
      expect(isValidEan13Barcode('400638133393A')).toBe(false);
    });
  });

  describe('isValidUpcaBarcode', () => {
    it('acepta UPC-A con dígito de control válido', () => {
      expect(isValidUpcaBarcode('036000291452')).toBe(true);
    });

    it('rechaza UPC-A con dígito de control inválido', () => {
      expect(isValidUpcaBarcode('036000291453')).toBe(false);
      expect(isValidUpcaBarcode('03600029145')).toBe(false);
      expect(isValidUpcaBarcode('0360002914522')).toBe(false);
    });
  });

  describe('validateBarcodeValue', () => {
    it('acepta un EAN-13 válido y rechaza el inválido explicando el motivo', () => {
      expect(validateBarcodeValue(InventoryBarcodeType.EAN13, '4006381333931')).toEqual({
        ok: true,
      });
      expect(validateBarcodeValue(InventoryBarcodeType.EAN13, '8412345678904')).toMatchObject({
        ok: false,
        message: expect.stringContaining('dígito de control'),
      });
      expect(validateBarcodeValue(InventoryBarcodeType.EAN13, '40063813')).toMatchObject({
        ok: false,
        message: expect.stringContaining('13 dígitos'),
      });
    });

    it('acepta un UPCA válido y rechaza el inválido', () => {
      expect(validateBarcodeValue(InventoryBarcodeType.UPCA, '036000291452')).toEqual({ ok: true });
      expect(validateBarcodeValue(InventoryBarcodeType.UPCA, '036000291453')).toMatchObject({
        ok: false,
        message: expect.stringContaining('dígito de control'),
      });
    });

    it('CODE128 solo valida longitud y caracteres ASCII imprimibles', () => {
      expect(validateBarcodeValue(InventoryBarcodeType.CODE128, 'ABC-123/456')).toEqual({
        ok: true,
      });
      expect(validateBarcodeValue(InventoryBarcodeType.CODE128, 'CÓDIGO-CON-ACENTO')).toMatchObject(
        {
          ok: false,
          message: expect.stringContaining('ASCII imprimibles'),
        },
      );
      expect(validateBarcodeValue(InventoryBarcodeType.CODE128, 'X'.repeat(65))).toMatchObject({
        ok: false,
      });
    });

    it('OTHER solo valida longitud y caracteres', () => {
      expect(validateBarcodeValue(InventoryBarcodeType.OTHER, 'INT-000-999')).toEqual({ ok: true });
      expect(validateBarcodeValue(InventoryBarcodeType.OTHER, 'INT\tTAB')).toMatchObject({
        ok: false,
      });
    });
  });
});
