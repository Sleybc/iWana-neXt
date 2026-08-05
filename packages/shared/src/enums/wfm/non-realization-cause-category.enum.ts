/**
 * Categoría de causa de no realización de visita.
 * ADR-077 D1: gobierna el comportamiento posterior (intentos, SLA, destino).
 */
export enum NonRealizationCauseCategory {
  /** Imputable al cliente — consume intento, pausa SLA si hay evidencia */
  CUSTOMER = 'CUSTOMER',
  /** Imputable a la operación — no consume intento, SLA sigue corriendo */
  OPERATIONAL = 'OPERATIONAL',
  /** Fuerza mayor — no consume intento, pausa SLA */
  FORCE_MAJEURE = 'FORCE_MAJEURE',
}
