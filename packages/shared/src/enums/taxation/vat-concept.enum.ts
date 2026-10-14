/** Concepto facturable que determina la regla canónica de IVA aplicable. */
export enum VatConcept {
  INTERNET_ACCESS = 'INTERNET_ACCESS',
  ACTIVATION_INHERENT = 'ACTIVATION_INHERENT', // instalación, conexión, reconexión, puesta en marcha
  EQUIPMENT_SALE = 'EQUIPMENT_SALE',
  EQUIPMENT_LEASE = 'EQUIPMENT_LEASE', // ⚠ ADR-093 V8
  INDEPENDENT_SERVICE = 'INDEPENDENT_SERVICE', // mantenimiento, soporte, IP fija ⚠ V9
  TELEVISION = 'TELEVISION', // ⚠ V9
  TELEPHONY = 'TELEPHONY', // fuera del motor canónico (V10)
}
