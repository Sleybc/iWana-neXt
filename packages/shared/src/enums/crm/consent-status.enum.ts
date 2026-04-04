/**
 * Estados de consentimiento por expediente.
 * PRD v2.0 §4.7 — operación interna en español.
 */
export enum ConsentStatus {
  PENDIENTE = 'PENDIENTE',
  ACEPTADO = 'ACEPTADO',
  RECHAZADO = 'RECHAZADO',
  REVOCADO = 'REVOCADO',
}
