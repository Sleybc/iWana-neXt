/** Responsabilidad frente al IVA para el perfil tributario de un suscriptor. */
export enum VatResponsibility {
  RESPONSABLE = 'RESPONSABLE',
  NO_RESPONSABLE = 'NO_RESPONSABLE',
}

/**
 * Responsabilidades del RUT requeridas por el catálogo actual de factura electrónica DIAN.
 * Catálogo provisional hasta el dictamen del contador (pregunta 7).
 */
export const RUT_RESPONSIBILITIES = ['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN'] as const;

export type RutResponsibility = (typeof RUT_RESPONSIBILITIES)[number];
