import { StockBalanceCondition } from '@iwana/shared';
import type { StockBalanceRecord } from '@/lib/api-client';

/**
 * Dos semánticas de disponibilidad, y no son intercambiables:
 *
 * 1. **Por tupla exacta** — `getBalanceForItemAtLocation`: suma solo los saldos de
 *    `(ítem, ubicación, lote, condición)`. Replica la validación del backend en
 *    `StockBalanceService.getAvailabilityWithManager`, así que es la única válida para
 *    decidir si una línea concreta ya con lote elegido cabe en el despacho. Con
 *    `lotId: null` significa literalmente "el saldo sin lote", no "todo el ítem".
 *
 * 2. **Total del ítem en la ubicación** — `buildTotalAvailableQuantityByItemAtLocation`:
 *    suma todos los lotes más el saldo sin lote para la misma condición. Es una vista
 *    de resumen (sugerencias y columna "Disponible" del catálogo), donde el operador
 *    todavía no eligió lote y solo necesita saber si hay material en esa bodega.
 *
 * Usar la semántica 1 como resumen fue el defecto que se corrigió: toda la mercancía que
 * entra por compra nace con lote (la recepción crea siempre un `StockLot`), así que el
 * filtro por lote nulo devolvía 0 y el ítem desaparecía del selector pese a existir.
 */
export interface StockIssueBalanceLookupOptions {
  condition?: StockBalanceCondition;
  lotId?: string | null;
}

export interface StockIssueTotalBalanceLookupOptions {
  condition?: StockBalanceCondition;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Disponible canónico de un saldo: existencia menos lo reservado (misma fórmula que
 * `buildStockOverviewRows`). El backend rechaza salidas y traslados por encima del
 * disponible, así que la UI nunca debe ofrecer material ya comprometido.
 */
export function getAvailableQtyFromBalance(
  balance: Pick<StockBalanceRecord, 'quantityOnHand' | 'quantityReserved'>,
): number {
  return toNumber(balance.quantityOnHand) - toNumber(balance.quantityReserved);
}

/**
 * Disponible de la tupla exacta `(ítem, ubicación, lote, condición)` (semántica 1).
 * Para el resumen del ítem completo usa `buildTotalAvailableQuantityByItemAtLocation`.
 *
 * S1/D3: `condition` es opcional y **omitirla incluye todas las condiciones**
 * (NEW, REFURBISHED, DAMAGED son despachables). El default implícito a NEW se
 * eliminó porque ocultaba existencias reales.
 */
export function getBalanceForItemAtLocation(
  balances: StockBalanceRecord[],
  itemId: string,
  locationId: string,
  options: StockIssueBalanceLookupOptions = {},
): number {
  if (!itemId.trim() || !locationId.trim()) {
    return 0;
  }

  const condition = options.condition ?? null;
  const lotId = options.lotId ?? null;

  return balances
    .filter(
      (balance) =>
        balance.itemId === itemId &&
        balance.locationId === locationId &&
        (condition == null || balance.condition === condition) &&
        (balance.lotId ?? null) === lotId,
    )
    .reduce((total, balance) => total + getAvailableQtyFromBalance(balance), 0);
}

/**
 * Total disponible por ítem en una ubicación: suma **todos los lotes más el saldo sin
 * lote** de las condiciones pedidas (semántica 2 del bloque de arriba). Sin `condition`
 * suma **todas** (S1/D3: el filtro implícito a NEW ocultaba existencias reales). Es la
 * vista de resumen; no sirve para validar una línea que ya tiene lote elegido.
 */
export function buildTotalAvailableQuantityByItemAtLocation(
  balances: StockBalanceRecord[],
  locationId: string,
  options: StockIssueTotalBalanceLookupOptions = {},
): Map<string, number> {
  if (!locationId.trim()) {
    return new Map();
  }

  const condition = options.condition ?? null;
  const quantities = new Map<string, number>();

  for (const balance of balances) {
    if (balance.locationId !== locationId) {
      continue;
    }

    if (condition != null && balance.condition !== condition) {
      continue;
    }

    const current = quantities.get(balance.itemId) ?? 0;
    quantities.set(balance.itemId, current + getAvailableQtyFromBalance(balance));
  }

  return quantities;
}

export function isRequestedQtyExceedingAvailable(
  requestedQty: string | number,
  availableQty: number,
): boolean {
  const requested =
    typeof requestedQty === 'number' ? requestedQty : Number.parseFloat(requestedQty);
  if (!Number.isFinite(requested) || requested <= 0) {
    return false;
  }

  return requested > availableQty;
}
