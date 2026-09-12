import { PurchaseOrderStatus, PurchaseRequestLineStatus } from '@iwana/shared';
import type {
  CreatePurchaseOrderDto,
  PurchaseOrderBatchOrderInput,
  PurchaseRequestDetailRecord,
  PurchaseRequestLineAwardRecord,
  PurchaseRequestLineRecord,
  SupplierQuoteLineRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';

export interface AwardOrderPreviewLine {
  purchaseRequestLineId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  /**
   * Origen del costo: `override` (capturado por el operador al emitir),
   * `award` (snapshot congelado en la adjudicación — línea de cotización o
   * escotilla §7, adenda Fase 30 §12.5), `quote` (línea de cotización, para
   * awards anteriores al snapshot) o `missing` (sin dato: la orden NO se
   * puede emitir, el operador debe capturar el costo en el drawer).
   */
  unitCostSource: 'quote' | 'override' | 'award' | 'missing';
  /** Moneda de la cotización origen; null cuando no hay cotización vinculada. */
  currency: string | null;
  label: string;
}

export interface AwardOrderPreview {
  partyRefId: string;
  partyLabel: string;
  lines: AwardOrderPreviewLine[];
  subtotal: number;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number.parseFloat(value ?? '0') || 0;
}

function findQuoteLine(
  quotes: SupplierQuoteRecord[],
  award: PurchaseRequestLineAwardRecord,
): SupplierQuoteLineRecord | null {
  if (!award.supplierQuoteId) {
    return null;
  }

  const quote = quotes.find((entry) => entry.id === award.supplierQuoteId);
  if (!quote?.lines?.length) {
    return null;
  }

  return (
    quote.lines.find((line) => line.purchaseRequestLineId === award.purchaseRequestLineId) ?? null
  );
}

function findQuoteCurrency(
  quotes: SupplierQuoteRecord[],
  award: PurchaseRequestLineAwardRecord,
): string | null {
  if (!award.supplierQuoteId) {
    return null;
  }
  const quote = quotes.find((entry) => entry.id === award.supplierQuoteId);
  const currency = quote?.currency?.trim();
  return currency ? currency : null;
}

function resolveLineItemId(line: PurchaseRequestLineRecord | undefined): string | null {
  return line?.inventoryItemId ?? null;
}

/**
 * Líneas con ciclo de orden ya cubierto: el servidor marcó ORDERED (o
 * recepción posterior) y existe una orden viva del proveedor en el detalle.
 * Mismo criterio que `award-matrix.ts` (paridad con `resolveAwardCoverage` y
 * `ORDER_TERMINAL_LINE_STATUSES` del backend): viva = no cancelada. Las
 * órdenes canceladas no consumen adjudicación y la línea se vuelve a ofertar.
 */
const ORDERED_LINE_STATUSES: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.ORDERED,
  PurchaseRequestLineStatus.PARTIALLY_RECEIVED,
  PurchaseRequestLineStatus.RECEIVED,
]);

function hasLiveOrderForParty(detail: PurchaseRequestDetailRecord, partyRefId: string): boolean {
  return detail.orders.some(
    (order) => order.status !== PurchaseOrderStatus.CANCELLED && order.partyRefId === partyRefId,
  );
}

/**
 * Agrupa awards por proveedor y construye el preview / payload batch `orders[]`.
 */
export function buildOrdersFromAwards(
  detail: PurchaseRequestDetailRecord,
  options?: {
    supplierLabels?: Record<string, string>;
    lineLabels?: Record<string, string>;
    unitCostOverrides?: Record<string, number>;
  },
): AwardOrderPreview[] {
  const awards = detail.awards;
  if (awards.length === 0) {
    return [];
  }

  const linesById = new Map(detail.lines.map((line) => [line.id, line]));
  const groups = new Map<string, AwardOrderPreview>();

  for (const award of awards) {
    const requestLine = linesById.get(award.purchaseRequestLineId);
    const itemId = resolveLineItemId(requestLine);
    if (!itemId) {
      continue;
    }

    // Segunda tanda (DEF-AWD-002): lo ya ordenado y cubierto por una orden
    // viva no se re-oferta; re-emitirlo haría que el servidor responda 400
    // ORDER_EXCEEDS_AWARD (tope de `createSingleOrder`). Sin orden viva (p.
    // ej. todo cancelado) la línea se vuelve a ofertar.
    if (
      requestLine &&
      ORDERED_LINE_STATUSES.has(requestLine.lineStatus) &&
      hasLiveOrderForParty(detail, award.awardedPartyRefId)
    ) {
      continue;
    }

    const quoteLine = findQuoteLine(detail.quotes, award);
    const overrideKey = `${award.awardedPartyRefId}:${award.purchaseRequestLineId}`;
    const override = options?.unitCostOverrides?.[overrideKey];
    // Precedencia del costo (spec §6.4, adenda informe §12.5): capturado por
    // el operador al emitir → snapshot congelado del award (cotización o
    // escotilla) → línea de cotización (awards anteriores al snapshot) → sin
    // dato. El caso sin dato conserva `unitCost: 0` SOLO como marcador de
    // visualización (el drawer muestra el campo vacío y exige capturarlo);
    // `previewsToCreateOrderDto` rechaza emitir la orden en ese estado.
    const awardUnitCostRaw = award.unitCost?.trim();
    const awardUnitCost =
      awardUnitCostRaw != null && awardUnitCostRaw !== '' ? toNumeric(awardUnitCostRaw) : null;
    const unitCostSource: AwardOrderPreviewLine['unitCostSource'] =
      override !== undefined
        ? 'override'
        : awardUnitCost != null
          ? 'award'
          : quoteLine
            ? 'quote'
            : 'missing';
    const unitCost =
      override !== undefined
        ? override
        : (awardUnitCost ?? (quoteLine ? toNumeric(quoteLine.unitCost) : 0));

    const existing = groups.get(award.awardedPartyRefId);
    const previewLine: AwardOrderPreviewLine = {
      purchaseRequestLineId: award.purchaseRequestLineId,
      itemId,
      quantity: toNumeric(award.awardedQuantity),
      unitCost,
      unitCostSource,
      currency: findQuoteCurrency(detail.quotes, award),
      label:
        options?.lineLabels?.[award.purchaseRequestLineId] ??
        requestLine?.freeTextDescription?.trim() ??
        'Línea adjudicada',
    };

    if (existing) {
      existing.lines.push(previewLine);
      existing.subtotal += previewLine.quantity * previewLine.unitCost;
      continue;
    }

    groups.set(award.awardedPartyRefId, {
      partyRefId: award.awardedPartyRefId,
      partyLabel: options?.supplierLabels?.[award.awardedPartyRefId] ?? award.awardedPartyRefId,
      lines: [previewLine],
      subtotal: previewLine.quantity * previewLine.unitCost,
    });
  }

  return Array.from(groups.values());
}

/**
 * Guarda de emisión (CA-308): una orden NUNCA se crea con costo cero por
 * falta de dato. Si alguna línea sigue en `missing` o con costo no positivo,
 * lanza un error explícito que nombra la línea; si un proveedor mezcla
 * monedas entre sus líneas, lanza por mezcla de monedas. El drawer bloquea
 * el envío antes (`hasMissingUnitCosts`), esta guarda es la última línea de
 * defensa programática.
 */
export function previewsToCreateOrderDto(
  purchaseRequestId: string,
  previews: AwardOrderPreview[],
  options?: {
    expectedDeliveryDate?: string | null;
    notes?: string | null;
  },
): CreatePurchaseOrderDto {
  for (const preview of previews) {
    for (const line of preview.lines) {
      if (
        line.unitCostSource === 'missing' ||
        !Number.isFinite(line.unitCost) ||
        line.unitCost <= 0
      ) {
        throw new Error(
          `Falta el costo unitario de ${line.label}: indícalo antes de generar la orden de ${preview.partyLabel}.`,
        );
      }
    }
    const currencies = new Set(
      preview.lines
        .map((line) => line.currency?.trim().toUpperCase())
        .filter((currency): currency is string => Boolean(currency)),
    );
    if (currencies.size > 1) {
      throw new Error(
        `Las líneas de ${preview.partyLabel} están en monedas distintas: genera una orden por moneda.`,
      );
    }
  }

  const orders: PurchaseOrderBatchOrderInput[] = previews.map((preview) => ({
    partyRefId: preview.partyRefId,
    expectedDeliveryDate: options?.expectedDeliveryDate ?? null,
    notes: options?.notes ?? null,
    lines: preview.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      purchaseRequestLineId: line.purchaseRequestLineId,
    })),
  }));

  return {
    purchaseRequestId,
    orders,
  };
}

export function canGenerateOrdersFromAwards(detail: PurchaseRequestDetailRecord): boolean {
  return buildOrdersFromAwards(detail).length > 0;
}

export function hasMissingUnitCosts(previews: AwardOrderPreview[]): boolean {
  return previews.some((preview) =>
    preview.lines.some(
      (line) =>
        line.unitCostSource === 'missing' || !Number.isFinite(line.unitCost) || line.unitCost <= 0,
    ),
  );
}
