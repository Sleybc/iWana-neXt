import { PurchaseRequestAwardCoverage, PurchaseRequestLineStatus } from '@iwana/shared';

/**
 * Forma mínima de línea de solicitud que consumen los resolutores de este
 * helper (mismo criterio de entrada mínima que el precedente
 * `purchase-request-fulfillment.ts`): cualquier entidad u objeto con
 * `lineStatus` es admitida por tipado estructural.
 */
export interface PurchaseRequestLineStatusCarrier {
  lineStatus: PurchaseRequestLineStatus;
}

/** Líneas con orden de compra viva (o ya recibida): consumen la adjudicación. */
const ORDERED_GROUP: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.ORDERED,
  PurchaseRequestLineStatus.PARTIALLY_RECEIVED,
  PurchaseRequestLineStatus.RECEIVED,
]);

/** Líneas elegibles que aún no tienen adjudicación. */
const UNAWARDED_GROUP: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.OPEN,
  PurchaseRequestLineStatus.PENDING_QUOTE,
]);

/** Líneas fuera del cálculo: su ciclo terminó por decisión administrativa. */
const EXCLUDED_GROUP: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.CANCELLED,
  PurchaseRequestLineStatus.REJECTED,
]);

/**
 * Eje de cobertura de adjudicación de una solicitud de compra (ADR-087
 * propuesto, D1), derivado de los `lineStatus` de sus líneas. Se calcula y
 * NUNCA se persiste: complementa a `PurchaseRequestStatus` sin ampliarlo
 * (ADR-087 propuesto, D2), siguiendo el patrón del helper de
 * `PurchaseRequestFulfillmentStatus`.
 *
 * Reglas (ÚNICA fuente de verdad del eje; el portal lo consume del contrato
 * congelado `purchase-award-matrix.contract.ts`):
 * 1. Las líneas `CANCELLED` y `REJECTED` se excluyen del cálculo: su ciclo
 *    terminó por decisión administrativa y no cuentan ni como pendientes ni
 *    como cubiertas.
 * 2. Sin líneas elegibles → `NOT_AWARDED`: no hay nada que cubrir.
 * 3. TODAS las elegibles en `ORDERED | PARTIALLY_RECEIVED | RECEIVED` →
 *    `FULLY_ORDERED`: la solicitud está cubierta por órdenes vivas.
 * 4. ALGUNA elegible en ese grupo y queda alguna en
 *    `OPEN | PENDING_QUOTE | AWARDED` → `PARTIALLY_ORDERED`: hay conversión
 *    en curso pero la solicitud aún no está cubierta.
 * 5. Ninguna ordenada pero TODAS `AWARDED` → `FULLY_AWARDED`: adjudicación
 *    completa pendiente de conversión a OC.
 * 6. ALGUNA `AWARDED` y queda alguna `OPEN | PENDING_QUOTE` →
 *    `PARTIALLY_AWARDED`: adjudicación parcial, sin órdenes vivas.
 * 7. Ninguna `AWARDED` (solo `OPEN | PENDING_QUOTE`) → `NOT_AWARDED`.
 */
export function resolveAwardCoverage(
  lines: ReadonlyArray<PurchaseRequestLineStatusCarrier>,
): PurchaseRequestAwardCoverage {
  const eligible = lines.filter((line) => !EXCLUDED_GROUP.has(line.lineStatus));

  if (eligible.length === 0) {
    return PurchaseRequestAwardCoverage.NOT_AWARDED;
  }

  const orderedCount = eligible.filter((line) => ORDERED_GROUP.has(line.lineStatus)).length;

  if (orderedCount > 0) {
    return orderedCount === eligible.length
      ? PurchaseRequestAwardCoverage.FULLY_ORDERED
      : PurchaseRequestAwardCoverage.PARTIALLY_ORDERED;
  }

  const awardedCount = eligible.filter(
    (line) => line.lineStatus === PurchaseRequestLineStatus.AWARDED,
  ).length;

  if (awardedCount === 0) {
    return PurchaseRequestAwardCoverage.NOT_AWARDED;
  }

  return awardedCount === eligible.length
    ? PurchaseRequestAwardCoverage.FULLY_AWARDED
    : PurchaseRequestAwardCoverage.PARTIALLY_AWARDED;
}

/**
 * ¿Puede marcarse la solicitud como `CONVERTED_TO_PO` tras crear orden(es)?
 * (ADR-087 propuesto, D3): true SOLO si toda línea no cancelada ni rechazada
 * está en `ORDERED | PARTIALLY_RECEIVED | RECEIVED`, es decir, toda la
 * solicitud quedó cubierta por órdenes vivas.
 *
 * Reglas:
 * 1. Se excluyen `CANCELLED` y `REJECTED` (mismo criterio que
 *    `resolveAwardCoverage`).
 * 2. Sin líneas elegibles → false: sin líneas vivas no hay conversión que
 *    afirmar (la solicitud degenerada se resuelve por su propio flujo).
 * 3. Basta una elegible en `OPEN | PENDING_QUOTE | AWARDED` → false: la
 *    solicitud PERMANECE en su estado previo (normalmente `APPROVED`); una
 *    orden parcial no debe vararla en `CONVERTED_TO_PO` para siempre.
 */
export function resolvePurchaseRequestConversion(
  lines: ReadonlyArray<PurchaseRequestLineStatusCarrier>,
): boolean {
  const eligible = lines.filter((line) => !EXCLUDED_GROUP.has(line.lineStatus));

  if (eligible.length === 0) {
    return false;
  }

  return eligible.every((line) => ORDERED_GROUP.has(line.lineStatus));
}
