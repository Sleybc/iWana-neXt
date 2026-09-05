/**
 * Formato declarado del código de barras del artículo (MOD12 · F4 · PRD §11 delta v1.1).
 *
 * Se declara JUNTO al valor: sin el formato no se puede validar el dígito de
 * control (EAN13/UPCA) ni aplicar la regla de longitud/caracteres (CODE128/OTHER).
 */
export enum InventoryBarcodeType {
  EAN13 = 'EAN13',
  UPCA = 'UPCA',
  CODE128 = 'CODE128',
  OTHER = 'OTHER',
}
