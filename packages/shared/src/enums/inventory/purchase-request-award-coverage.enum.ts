/**
 * Cobertura de adjudicación de una solicitud de compra.
 *
 * Eje DERIVADO: se calcula en servidor y NUNCA se persiste (ADR-087,
 * propuesto, decisión D1). Complementa a `PurchaseRequestStatus` sin
 * ampliarlo (D2): el enum persistido describe el ciclo administrativo de la
 * solicitud y este eje responde «¿cuánto de ella está adjudicado u
 * ordenado?». Se calcula a partir de los `lineStatus` de las líneas no
 * canceladas ni rechazadas, siguiendo el patrón del helper de
 * `PurchaseRequestFulfillmentStatus`.
 */
export enum PurchaseRequestAwardCoverage {
  /** Ninguna línea elegible está adjudicada todavía. */
  NOT_AWARDED = 'NOT_AWARDED',
  /** Algunas líneas están adjudicadas y aún hay líneas sin adjudicar; sin orden viva. */
  PARTIALLY_AWARDED = 'PARTIALLY_AWARDED',
  /** Toda línea elegible está adjudicada y ninguna tiene orden viva. */
  FULLY_AWARDED = 'FULLY_AWARDED',
  /** Hay líneas con orden de compra viva, pero quedan líneas por adjudicar u ordenar. */
  PARTIALLY_ORDERED = 'PARTIALLY_ORDERED',
  /** Toda línea elegible está ordenada (o ya recibida): la solicitud está cubierta. */
  FULLY_ORDERED = 'FULLY_ORDERED',
}
