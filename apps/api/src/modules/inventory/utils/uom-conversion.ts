import { BadRequestException } from '@nestjs/common';
import {
  areInventoryUnitsDimensionallyCompatible,
  buildDimensionalMismatchMessage,
  buildMissingPurchaseFactorMessage,
  convertPurchaseQuantityToBase,
  convertPurchaseUnitCostToBase,
  formatUomEquivalence,
  isInventoryUnitOfMeasureCode,
} from '@iwana/shared';

/**
 * Resolutor único de conversión compra → base (ADR-085 D3 · F5b, Regla 3).
 *
 * Es el ÚNICO punto del backend que convierte cantidades de compra a unidad
 * base antes del ledger. Lo invocan los dos flujos de entrada de mercancía
 * comprada —recepción contra OC (`GoodsReceiptService`) y compra de mostrador
 * (`CounterPurchaseService`, ADR-050)— cada uno exactamente una vez por línea
 * antes de `recordMovementWithManager`. Prohibido convertir en el cliente o
 * en cualquier otro servicio: dos puntos de conversión terminan aplicándola
 * dos veces (CA-F5B-07).
 *
 * Semántica de unidades por flujo (documenta la decisión §4.5 y el modelo):
 * - La línea de recepción / ingreso conserva la cantidad en UNIDAD DE COMPRA
 *   (trazabilidad + documento del proveedor); la orden de compra descuenta su
 *   pendiente también en unidad de compra.
 * - El ledger (`stock_movements` / líneas), los saldos y el costeo reciben
 *   SIEMPRE unidad base y costo por unidad base (Regla 2).
 * - Sin unidad de compra, o con unidad de compra igual a la base, o con
 *   factor ausente SIN unidad de compra: comportamiento idéntico al anterior
 *   (CA-F5B-06, sin conversión).
 * - Con unidad de compra distinta y SIN factor válido: se RECHAZA la
 *   recepción/ingreso con mensaje en español. Un factor ausente nunca se
 *   asume 1 implícito: eso es exactamente el error que corrige esta fase.
 * - Ítems serializados / activo fijo: cada activo es 1 unidad base, así que
 *   la cantidad de seriales exigida es la cantidad BASE convertida (p. ej.
 *   2 cajas × 100 = 200 seriales), no la cantidad de compra.
 */
export interface ReceiptUomConversion {
  /** `true` cuando se aplicó el factor (hay equivalencia que trazar/mostrar). */
  applies: boolean;
  /** Cantidad en unidad base para el ledger y el costeo. */
  baseQuantity: number;
  /** Costo por unidad base para el ledger y el costeo (`null` si no hay costo). */
  baseUnitCost: number | null;
  /** Equivalencia legible («2 cajas = 200 unidades») o `null` si no aplica. */
  equivalence: string | null;
}

export interface ConvertibleInventoryItem {
  unitOfMeasure: string;
  purchaseUnitOfMeasure: string | null;
  purchaseToBaseUomFactor: string | number | null;
}

export function resolveReceiptUomConversion(
  item: ConvertibleInventoryItem,
  purchaseQuantity: number,
  purchaseUnitCost?: number | null,
): ReceiptUomConversion {
  const purchaseCode = item.purchaseUnitOfMeasure;
  const baseCode = item.unitOfMeasure;

  if (!purchaseCode || purchaseCode === baseCode) {
    return {
      applies: false,
      baseQuantity: purchaseQuantity,
      baseUnitCost: purchaseUnitCost ?? null,
      equivalence: null,
    };
  }

  const factor = Number(item.purchaseToBaseUomFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new BadRequestException(buildMissingPurchaseFactorMessage(baseCode, purchaseCode));
  }

  if (
    isInventoryUnitOfMeasureCode(baseCode) &&
    isInventoryUnitOfMeasureCode(purchaseCode) &&
    !areInventoryUnitsDimensionallyCompatible(baseCode, purchaseCode)
  ) {
    throw new BadRequestException(buildDimensionalMismatchMessage(baseCode, purchaseCode));
  }

  const baseQuantity = convertPurchaseQuantityToBase(purchaseQuantity, factor);
  const baseUnitCost =
    purchaseUnitCost === undefined || purchaseUnitCost === null
      ? null
      : convertPurchaseUnitCostToBase(purchaseUnitCost, factor);

  return {
    applies: true,
    baseQuantity,
    baseUnitCost,
    equivalence: formatUomEquivalence(purchaseQuantity, purchaseCode, baseQuantity, baseCode),
  };
}
