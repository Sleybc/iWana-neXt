/**
 * Lógica pura de la matriz de adjudicación productos × cotizaciones
 * (MOD12 Compras, Fase 30, track FE-1).
 *
 * SIN React ni JSX: solo tipos y funciones puras. Las siete funciones del
 * contrato de componente congelado (spec §5.3) viven aquí:
 *
 *   buildAwardMatrix · toggleCell · assignQuoteColumn · moveAwardToQuote ·
 *   summarizeBySupplier · validateMatrixSelection · toCreateAwardsDto
 *
 * Los tipos de salida (`AwardMatrixRow`, `AwardMatrixQuoteColumn`,
 * `AwardMatrixCell`, `AwardSupplierSummary`, `CreateAwardsRequest`, …) vienen
 * EXCLUSIVAMENTE del contrato congelado
 * `packages/shared/src/contracts/inventory/purchase-award-matrix.contract.ts`;
 * el portal no define tipos paralelos. Los registros de entrada vienen de
 * `@/lib/api-client`.
 *
 * Invariante que este módulo garantiza (spec §5.3): un
 * `purchaseRequestLineId` aparece como máximo una vez en el resultado de
 * `toCreateAwardsDto` — un producto, un proveedor (spec §6.1). La exclusividad
 * se resuelve en el modelo (`selections` es un mapa lineId → quoteId), no en
 * el render.
 *
 * Inmutabilidad: por convención, TODAS las funciones devuelven estados nuevos
 * y nunca mutan sus argumentos (los tipos no usan `readonly` para que las
 * props de `AwardMatrixTable` del spec §5.2 acepten `rows` sin fricción).
 */

import {
  PurchaseOrderStatus,
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type {
  AwardMatrixCell,
  AwardMatrixCellState,
  AwardMatrixQuoteColumn,
  AwardMatrixQuoteLine,
  AwardMatrixRow,
  AwardSupplierSummary,
  CreateAwardsRequest,
  PurchaseRequestLineAwardInput,
} from '@iwana/shared';
import type {
  InventoryItemRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestLineAwardRecord,
  PurchaseRequestLineRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';
import { getSupplierDisplayLabel } from './inventory-labels';
import { decimalStringToCents, formatCentsAsDecimal2, parseDecimalCents } from './decimal-cents';

/**
 * Adjudicación persistida que bloquea una fila de la matriz. Datos de lógica
 * (no de render): el render vive en `AwardMatrixRow`; esto permite a
 * `moveAwardToQuote` saber QUÉ award revocar y a la barra saber qué filas
 * siguen pendientes.
 */
export interface AwardMatrixRowLock {
  /** Id del award vigente (el que el panel revoca en el flujo de re-adjudicación). */
  awardId: string;
  /** true = orden viva (bloqueo duro, CA-UX-06); false = solo «Revocar». */
  ordered: boolean;
  awardedPartyRefId: string;
  /** Cotización ganadora, cuando el award proviene de una cotización de la matriz. */
  awardedQuoteId?: string;
  /** Cantidad total adjudicada (suma de awards, decimal 2). */
  awardedQuantity: string;
  /**
   * La línea está repartida entre varios awards (solo posible en PROJECT):
   * `moveAwardToQuote` NO aplica porque no es decidible cuál award revocar.
   */
  splitAcrossAwards: boolean;
}

/**
 * Estado completo de la matriz. `selections` es el draft (lineId → quoteId,
 * SOLO filas libres); `locks` son las adjudicaciones persistidas.
 */
export interface AwardMatrixState {
  rows: AwardMatrixRow[];
  columns: AwardMatrixQuoteColumn[];
  /** Selección de draft: purchaseRequestLineId → supplierQuoteId. Máximo una por línea. */
  selections: Record<string, string>;
  /** Override de cantidad (cadena cruda del input) para solicitudes PROJECT. */
  quantityByLine: Record<string, string>;
  /**
   * Awards persistidos marcados para revocar en el siguiente submit
   * (lineId → awardId), producidos por `moveAwardToQuote`: el flujo de
   * re-adjudicación es revocar + readjudicar (spec §6.5).
   */
  pendingRevokes: Record<string, string>;
  locks: Record<string, AwardMatrixRowLock>;
  /** Las cotizaciones NO comparten moneda: sin chip «Más barato» ni orden por precio (§6.3). */
  currencyMixed: boolean;
  requestType: PurchaseRequestType;
  /** Panel editable: solicitud APPROVED y no deshabilitado (paridad con AwardLinesPanel). */
  canEdit: boolean;
}

export interface AwardMatrixBuildOptions {
  /** Etiquetas legibles de proveedor (partyRefId → label), como en el panel actual. */
  supplierLabels?: Record<string, string>;
  /** Deshabilita la edición (props `disabled` del panel). */
  disabled?: boolean;
}

export type AwardMatrixValidationCode = 'EMPTY_SELECTION' | 'INVALID_QUANTITY' | 'CURRENCY_MIXED';

export interface AwardMatrixValidationIssue {
  code: AwardMatrixValidationCode;
  message: string;
}

export interface AwardMatrixValidationResult {
  /**
   * true = la selección es adjudicable (CTA habilitada). Los avisos
   * (`CURRENCY_MIXED`) NO la bloquean: adjudicar en monedas mixtas es una
   * operación válida, solo desactiva la comparación de precios (§6.3).
   */
  ok: boolean;
  issues: AwardMatrixValidationIssue[];
}

/**
 * Estados de línea con orden viva según el API (mismo grupo de
 * `resolveAwardCoverage` en `purchase-request-award-coverage.ts`).
 */
const ORDERED_LINE_STATUSES: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.ORDERED,
  PurchaseRequestLineStatus.PARTIALLY_RECEIVED,
  PurchaseRequestLineStatus.RECEIVED,
]);

/**
 * Líneas fuera de la matriz: su ciclo terminó por decisión administrativa.
 * Mismo criterio de exclusión que `resolveAwardCoverage` (ADR-087): no cuentan
 * como pendientes ni como cubiertas, y no son seleccionables.
 */
const EXCLUDED_LINE_STATUSES: ReadonlySet<PurchaseRequestLineStatus> = new Set([
  PurchaseRequestLineStatus.CANCELLED,
  PurchaseRequestLineStatus.REJECTED,
]);

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDecimal2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Regla vigente de `AwardLinesPanel` preservada ÍNTEGRA (spec §6.3): sin
 * moneda común no se ordena por precio ni se marca «Más barato» — comparar
 * USD contra COP por su valor numérico induce una recomendación falsa.
 */
function quotesShareCurrency(quotes: SupplierQuoteRecord[]): boolean {
  return new Set(quotes.map((quote) => quote.currency)).size <= 1;
}

function buildQuoteColumn(
  quote: SupplierQuoteRecord,
  supplierLabels?: Record<string, string>,
): AwardMatrixQuoteColumn {
  const lines: Record<string, AwardMatrixQuoteLine> = {};
  for (const quoteLine of quote.lines ?? []) {
    lines[quoteLine.purchaseRequestLineId] = {
      unitCost: quoteLine.unitCost,
      lineAmount: quoteLine.lineAmount,
    };
  }

  return {
    quoteId: quote.id,
    supplierPartyRefId: quote.partyRefId,
    supplierLabel: getSupplierDisplayLabel(quote.partyRefId, supplierLabels),
    ...(quote.quoteNumber ? { quoteNumber: quote.quoteNumber } : {}),
    currency: quote.currency,
    // Neto a pagar; el fallback a `amount` cubre cotizaciones legacy sin la
    // columna de Fase 25 (mismo criterio del registro del api-client).
    payableAmount: quote.payableAmount ?? quote.amount,
    lines,
  };
}

/**
 * Award «primario» de una línea: el primero cuya cotización es columna de la
 * matriz; si ninguno coincide (escotilla sin cotización), el primero.
 */
function pickPrimaryAward(
  lineAwards: PurchaseRequestLineAwardRecord[],
  columnIds: ReadonlySet<string>,
): PurchaseRequestLineAwardRecord | undefined {
  return (
    lineAwards.find(
      (award) => award.supplierQuoteId != null && columnIds.has(award.supplierQuoteId),
    ) ?? lineAwards[0]
  );
}

/**
 * «Orden viva» para una línea con adjudicación: el `lineStatus` está en el
 * grupo ordenado del API Y existe una orden NO cancelada del proveedor en
 * `detail.orders`. Las órdenes del detalle no exponen sus líneas
 * (`PurchaseOrderRecord`), así que el cruce (línea, proveedor) se hace con el
 * proveedor del award; el servidor sigue siendo la autoridad y responde
 * `AWARD_ALREADY_ORDERED` si el cliente se equivoca (spec §6.5).
 */
function hasLiveOrder(
  detail: PurchaseRequestDetailRecord,
  awardedPartyRefId: string | undefined,
): boolean {
  return detail.orders.some(
    (order) =>
      order.status !== PurchaseOrderStatus.CANCELLED &&
      (awardedPartyRefId == null || order.partyRefId === awardedPartyRefId),
  );
}

function buildRowLock(
  line: PurchaseRequestLineRecord,
  lineAwards: PurchaseRequestLineAwardRecord[],
  detail: PurchaseRequestDetailRecord,
  columnIds: ReadonlySet<string>,
): AwardMatrixRowLock | undefined {
  // Suma EXACTA en céntimos: la acumulación flotante de cantidades introducía
  // drift binario que el epsilon de la comparación solo compensaba a medias.
  const requestedCents = decimalStringToCents(line.quantityRequested);
  const awardedCents = lineAwards.reduce(
    (sum, award) => sum + decimalStringToCents(award.awardedQuantity),
    0,
  );

  // Paridad con `isLineFullyAwarded` del panel actual: con records se compara
  // suma adjudicada contra solicitada en céntimos (exacta, sin epsilon); sin
  // records (no debería ocurrir), el `lineStatus` manda.
  const fullyAwarded =
    lineAwards.length > 0
      ? awardedCents >= requestedCents
      : line.lineStatus === PurchaseRequestLineStatus.AWARDED;

  if (!fullyAwarded) {
    return undefined;
  }

  const primary = pickPrimaryAward(lineAwards, columnIds);
  const awardedQuoteId =
    primary?.supplierQuoteId != null && columnIds.has(primary.supplierQuoteId)
      ? primary.supplierQuoteId
      : undefined;
  const ordered =
    ORDERED_LINE_STATUSES.has(line.lineStatus) && hasLiveOrder(detail, primary?.awardedPartyRefId);

  return {
    awardId: primary?.id ?? '',
    ordered,
    awardedPartyRefId: primary?.awardedPartyRefId ?? '',
    ...(awardedQuoteId !== undefined ? { awardedQuoteId } : {}),
    awardedQuantity: formatCentsAsDecimal2(awardedCents),
    splitAcrossAwards: lineAwards.length > 1,
  };
}

function computeCells(input: {
  lineId: string;
  columns: AwardMatrixQuoteColumn[];
  // Uniones explícitas (no opcionales) por exactOptionalPropertyTypes: los
  // ausentes se pasan como undefined.
  lock: AwardMatrixRowLock | undefined;
  selectedQuoteId: string | undefined;
  currencyMixed: boolean;
}): Record<string, AwardMatrixCell> {
  const { lineId, columns, lock, selectedQuoteId, currencyMixed } = input;
  const cells: Record<string, AwardMatrixCell> = {};

  // Fila tomada: TODAS sus celdas comparten estado de bloqueo; la columna
  // ganadora se indica en `AwardMatrixRow.awardedQuoteId`. Inmutable ante
  // cualquier acción de selección (spec §4.3).
  if (lock) {
    const state: AwardMatrixCellState = lock.ordered ? 'ordenado' : 'adjudicado';
    for (const column of columns) {
      cells[column.quoteId] = { state };
    }
    return cells;
  }

  // Pase único por columna: celdas cubiertas/no cubiertas y, de paso, la más
  // barata entre las cubiertas (comparación en céntimos exactos; un costo no
  // decimal no compite).
  let coveredCount = 0;
  let cheapestQuoteId: string | undefined;
  let cheapestCents = Number.POSITIVE_INFINITY;

  for (const column of columns) {
    const quoteLine = column.lines[lineId];
    // Sin línea de cotización = sin-cotizar, NUNCA costo cero (spec §6.4).
    if (!quoteLine) {
      cells[column.quoteId] = { state: 'sin-cotizar' };
      continue;
    }
    coveredCount += 1;
    cells[column.quoteId] = {
      state: selectedQuoteId === column.quoteId ? 'seleccionado' : 'disponible',
    };
    const costCents = parseDecimalCents(quoteLine.unitCost);
    if (costCents !== null && costCents < cheapestCents) {
      cheapestCents = costCents;
      cheapestQuoteId = column.quoteId;
    }
  }

  // Chip «Más barato»: solo con moneda compartida, solo entre celdas cubiertas,
  // solo con más de una opción y solo sobre celdas disponibles/seleccionadas
  // (contrato: `cheapest` no procede en estados de bloqueo).
  if (!currencyMixed && coveredCount > 1 && cheapestQuoteId !== undefined) {
    const cell = cells[cheapestQuoteId];
    if (cell) {
      cells[cheapestQuoteId] = { ...cell, cheapest: true };
    }
  }

  return cells;
}

function buildRows(
  detail: PurchaseRequestDetailRecord,
  items: InventoryItemRecord[],
  state: {
    columns: AwardMatrixQuoteColumn[];
    locks: Record<string, AwardMatrixRowLock>;
    selections: Record<string, string>;
    quantityByLine: Record<string, string>;
    currencyMixed: boolean;
  },
): AwardMatrixRow[] {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const rows: AwardMatrixRow[] = [];

  // Solo líneas adjudicables: con producto de catálogo (paridad con el panel
  // actual) y sin ciclo administrativo terminado (CANCELLED/REJECTED quedan
  // fuera de la matriz: no seleccionables, no pendientes — ADR-087).
  for (const line of detail.lines) {
    if (!line.inventoryItemId || EXCLUDED_LINE_STATUSES.has(line.lineStatus)) {
      continue;
    }

    const item = itemsById.get(line.inventoryItemId);
    const lock = state.locks[line.id];
    const effectiveQuantity =
      lock != null
        ? lock.awardedQuantity
        : (state.quantityByLine[line.id] ?? line.quantityRequested);

    rows.push({
      purchaseRequestLineId: line.id,
      itemName: item?.name ?? line.freeTextDescription?.trim() ?? '',
      sku: item?.sku ?? '',
      quantityRequested: line.quantityRequested,
      unitOfMeasure: line.unitOfMeasure,
      awardedQuantity: effectiveQuantity,
      ...(lock ? { awardedPartyRefId: lock.awardedPartyRefId } : {}),
      cells: computeCells({
        lineId: line.id,
        columns: state.columns,
        lock,
        selectedQuoteId: state.selections[line.id],
        currencyMixed: state.currencyMixed,
      }),
      ...(lock?.awardedQuoteId !== undefined ? { awardedQuoteId: lock.awardedQuoteId } : {}),
    });
  }

  return rows;
}

/**
 * Construye el estado completo desde el detalle de la solicitud. Draft vacío:
 * `selections` y `quantityByLine` parten sin marcas; lo persistido queda en
 * `locks` y se refleja en las celdas como `adjudicado`/`ordenado`.
 */
export function buildAwardMatrix(
  detail: PurchaseRequestDetailRecord,
  items: InventoryItemRecord[],
  options?: AwardMatrixBuildOptions,
): AwardMatrixState {
  const columns = detail.quotes.map((quote) => buildQuoteColumn(quote, options?.supplierLabels));
  const columnIds = new Set(columns.map((column) => column.quoteId));
  const locks: Record<string, AwardMatrixRowLock> = {};

  const awardsByLineId = new Map<string, PurchaseRequestLineAwardRecord[]>();
  for (const award of detail.awards) {
    const bucket = awardsByLineId.get(award.purchaseRequestLineId) ?? [];
    bucket.push(award);
    awardsByLineId.set(award.purchaseRequestLineId, bucket);
  }

  for (const line of detail.lines) {
    if (!line.inventoryItemId || EXCLUDED_LINE_STATUSES.has(line.lineStatus)) {
      continue;
    }
    const lock = buildRowLock(line, awardsByLineId.get(line.id) ?? [], detail, columnIds);
    if (lock) {
      locks[line.id] = lock;
    }
  }

  const base = {
    columns,
    locks,
    selections: {} as Record<string, string>,
    quantityByLine: {} as Record<string, string>,
    currencyMixed: !quotesShareCurrency(detail.quotes),
  };

  return {
    rows: buildRows(detail, items, base),
    columns,
    selections: base.selections,
    quantityByLine: base.quantityByLine,
    pendingRevokes: {},
    locks,
    currencyMixed: base.currencyMixed,
    requestType: detail.request.requestType,
    canEdit: !options?.disabled && detail.request.status === PurchaseRequestStatus.APPROVED,
  };
}

/**
 * Reconstruye las filas tras una mutación: las celdas derivan de
 * locks + selections y la cantidad efectiva de quantityByLine. Los datos
 * fijos de cada fila (nombre, sku, solicitada, unidad) nunca cambian y se
 * conservan del estado anterior.
 */
function finalizeState(
  state: AwardMatrixState,
  patch: Partial<
    Pick<AwardMatrixState, 'selections' | 'quantityByLine' | 'pendingRevokes' | 'locks'>
  >,
): AwardMatrixState {
  const selections = patch.selections ?? state.selections;
  const quantityByLine = patch.quantityByLine ?? state.quantityByLine;
  const pendingRevokes = patch.pendingRevokes ?? state.pendingRevokes;
  const locks = patch.locks ?? state.locks;

  const rows = state.rows.map((row) => {
    const lock = locks[row.purchaseRequestLineId];
    const effectiveQuantity =
      lock != null
        ? lock.awardedQuantity
        : (quantityByLine[row.purchaseRequestLineId] ?? row.quantityRequested);

    const nextRow: AwardMatrixRow = {
      ...row,
      awardedQuantity: effectiveQuantity,
      cells: computeCells({
        lineId: row.purchaseRequestLineId,
        columns: state.columns,
        lock,
        selectedQuoteId: selections[row.purchaseRequestLineId],
        currencyMixed: state.currencyMixed,
      }),
    };
    if (lock) {
      nextRow.awardedPartyRefId = lock.awardedPartyRefId;
      if (lock.awardedQuoteId !== undefined) {
        nextRow.awardedQuoteId = lock.awardedQuoteId;
      } else {
        delete nextRow.awardedQuoteId;
      }
    } else {
      // Sin lock vigente las claves de adjudicación NO se heredan del estado
      // anterior: `moveAwardToQuote` desbloquea la fila y el spread base
      // conservaría el proveedor/cotización de la adjudicación revocada.
      delete nextRow.awardedPartyRefId;
      delete nextRow.awardedQuoteId;
    }
    return nextRow;
  });

  return { ...state, rows, selections, quantityByLine, pendingRevokes, locks };
}

/**
 * Marca/desmarca la celda (línea, cotización). Si la línea ya está marcada en
 * OTRA cotización la MUEVE, nunca duplica (spec §6.1, CA-UX-02). Toggle sobre
 * la celda ya seleccionada deselecciona. Las filas `adjudicado`/`ordenado` son
 * inmutables (CA-UX-06) y las celdas `sin-cotizar` no seleccionables.
 * Con `pendingRevokes` activo para la línea, deseleccionar cancela el
 * movimiento pendiente (se conserva el award persistido).
 */
export function toggleCell(
  state: AwardMatrixState,
  lineId: string,
  quoteId: string,
): AwardMatrixState {
  const row = state.rows.find((entry) => entry.purchaseRequestLineId === lineId);
  if (!state.canEdit || !row || state.locks[lineId] !== undefined) {
    return state;
  }

  const column = state.columns.find((entry) => entry.quoteId === quoteId);
  if (!column || !column.lines[lineId]) {
    return state;
  }

  const selections = { ...state.selections };
  if (selections[lineId] === quoteId) {
    delete selections[lineId];
    const pendingRevokes = { ...state.pendingRevokes };
    delete pendingRevokes[lineId];
    return finalizeState(state, { selections, pendingRevokes });
  }

  selections[lineId] = quoteId;
  return finalizeState(state, { selections });
}

/**
 * Adjudica en bloque los productos LIBRES que la columna cubre (CA-UX-03):
 * nunca roba filas `adjudicado`/`ordenado`, ni filas ya marcadas (en esta u
 * otra columna).
 *
 * Segunda invocación: si la columna tiene marcas vigentes, las DESELECCIONA
 * (semántica de checkbox: el segundo clic desmarca lo que marcó; las líneas
 * que el usuario movió después a otra columna no se tocan).
 */
export function assignQuoteColumn(state: AwardMatrixState, quoteId: string): AwardMatrixState {
  if (!state.canEdit) {
    return state;
  }

  const column = state.columns.find((entry) => entry.quoteId === quoteId);
  if (!column) {
    return state;
  }

  const selections = { ...state.selections };
  const pendingRevokes = { ...state.pendingRevokes };
  let changed = false;

  for (const row of state.rows) {
    const lineId = row.purchaseRequestLineId;
    if (state.locks[lineId] !== undefined) {
      continue;
    }
    if (selections[lineId] === quoteId) {
      delete selections[lineId];
      delete pendingRevokes[lineId];
      changed = true;
      continue;
    }
    if (selections[lineId] !== undefined || !column.lines[lineId]) {
      continue;
    }
    selections[lineId] = quoteId;
    changed = true;
  }

  return changed ? finalizeState(state, { selections, pendingRevokes }) : state;
}

/**
 * Mueve una adjudicación PERSISTIDA a otra cotización: desbloquea la fila,
 * marca la nueva celda y deja el award en `pendingRevokes` para que el
 * siguiente submit ejecute revocar + readjudicar conservando el par
 * award → línea (spec §6.5).
 *
 * NO aplica (devuelve el estado sin cambios) cuando:
 * - la fila está `ordenado` (bloqueo duro, CA-UX-06);
 * - la línea no tiene adjudicación persistida (usar `toggleCell`);
 * - la línea está repartida entre varios awards (PROJECT: no es decidible
 *   cuál revocar; el reparto se gestiona editando cantidades/escotilla);
 * - no hay `awardId` que revocar o el destino no cubre la línea
 *   (`sin-cotizar` — el servidor respondería `AWARD_QUOTE_LINE_MISSING`).
 */
export function moveAwardToQuote(
  state: AwardMatrixState,
  lineId: string,
  quoteId: string,
): AwardMatrixState {
  if (!state.canEdit) {
    return state;
  }

  const lock = state.locks[lineId];
  if (!lock || lock.ordered || lock.splitAcrossAwards || !lock.awardId) {
    return state;
  }
  if (lock.awardedQuoteId === quoteId) {
    return state;
  }

  const column = state.columns.find((entry) => entry.quoteId === quoteId);
  if (!column || !column.lines[lineId]) {
    return state;
  }

  const locks = { ...state.locks };
  delete locks[lineId];
  const selections = { ...state.selections, [lineId]: quoteId };
  const pendingRevokes = { ...state.pendingRevokes, [lineId]: lock.awardId };

  return finalizeState(state, { locks, selections, pendingRevokes });
}

/**
 * Override de cantidad para solicitudes PROJECT (columna derecha editable,
 * réplica del `lockQuantity` del panel). Fuera de PROJECT, sobre filas
 * bloqueadas o con panel deshabilitado es no-op: la cantidad queda igual a la
 * solicitada (spec §6.2). Guarda la cadena CRUDA del input; la validación de
 * negocio vive en `validateMatrixSelection`.
 */
export function setLineQuantity(
  state: AwardMatrixState,
  lineId: string,
  value: string,
): AwardMatrixState {
  if (!state.canEdit || state.requestType !== PurchaseRequestType.PROJECT) {
    return state;
  }
  if (
    state.locks[lineId] !== undefined ||
    !state.rows.some((row) => row.purchaseRequestLineId === lineId)
  ) {
    return state;
  }

  return finalizeState(state, {
    quantityByLine: { ...state.quantityByLine, [lineId]: value },
  });
}

/**
 * Resumen en vivo por proveedor (barra inferior, spec §4.4): productos
 * marcados y total POR MONEDA de los importes marcados — nunca se suman
 * monedas distintas (§6.3, CA-UX-04). El número de resúmenes es el número de
 * órdenes que se generarán.
 */
export function summarizeBySupplier(state: AwardMatrixState): AwardSupplierSummary[] {
  // `totals` acumula en CÉNTIMOS enteros por moneda: sumar importes con
  // `parseFloat` y redondear al final introducía drift binario (0.1 + 0.2 ≠ 0.3).
  const columnByQuoteId = new Map(state.columns.map((column) => [column.quoteId, column]));
  const summaries = new Map<
    string,
    { label: string; productCount: number; totals: Map<string, number> }
  >();

  for (const row of state.rows) {
    const quoteId = state.selections[row.purchaseRequestLineId];
    if (!quoteId) {
      continue;
    }
    const column = columnByQuoteId.get(quoteId);
    const quoteLine = column?.lines[row.purchaseRequestLineId];
    if (!column || !quoteLine) {
      continue;
    }

    let summary = summaries.get(column.supplierPartyRefId);
    if (!summary) {
      summary = { label: column.supplierLabel, productCount: 0, totals: new Map<string, number>() };
      summaries.set(column.supplierPartyRefId, summary);
    }

    summary.productCount += 1;
    summary.totals.set(
      column.currency,
      (summary.totals.get(column.currency) ?? 0) + decimalStringToCents(quoteLine.lineAmount),
    );
  }

  return Array.from(summaries.entries()).map(([supplierPartyRefId, summary]) => ({
    supplierPartyRefId,
    supplierLabel: summary.label,
    productCount: summary.productCount,
    totalsByCurrency: Array.from(summary.totals.entries()).map(([currency, totalCents]) => ({
      currency,
      total: formatCentsAsDecimal2(totalCents),
    })),
  }));
}

/**
 * Mensaje de la barra cuando hay filas libres sin marcar (spec §4.4). Vive
 * aquí (y no en la barra) para que `validateMatrixSelection` y el aviso de
 * CTA compartan exactamente el mismo texto.
 */
export const AWARD_EMPTY_SELECTION_MESSAGE =
  'Selecciona al menos un producto en la matriz para adjudicar.';

const AWARD_ALL_ORDERED_MESSAGE =
  'Todos los productos ya están adjudicados y tienen una orden de compra en curso.';

const AWARD_ALL_AWARDED_MESSAGE =
  'Todos los productos están adjudicados: revoca una adjudicación para cambiarla.';

/**
 * Aviso de la barra con cero selecciones (spec §4.4, CA-UX-07). Con filas
 * libres pide marcar al menos una; con TODAS bloqueadas, la instrucción
 * «selecciona…» sería imposible de ejecutar, así que el aviso explica el
 * bloqueo: duro (orden viva: nada por hacer en esta etapa) o blando
 * (adjudicado: se puede revocar para readjudicar).
 */
export function getAwardEmptySelectionNotice(state: AwardMatrixState): string {
  const hasFreeRows = state.rows.some(
    (row) => state.locks[row.purchaseRequestLineId] === undefined,
  );
  if (hasFreeRows) {
    return AWARD_EMPTY_SELECTION_MESSAGE;
  }
  const hasOrderedLock = Object.values(state.locks).some((lock) => lock.ordered);
  return hasOrderedLock ? AWARD_ALL_ORDERED_MESSAGE : AWARD_ALL_AWARDED_MESSAGE;
}

/**
 * Valida la selección para habilitar CTAs y explicar su deshabilitación
 * (spec §4.4, CA-UX-07). `CURRENCY_MIXED` es un AVISO: no bloquea la
 * adjudicación, solo desactiva la comparación de precios (§6.3).
 */
export function validateMatrixSelection(state: AwardMatrixState): AwardMatrixValidationResult {
  const issues: AwardMatrixValidationIssue[] = [];

  if (Object.keys(state.selections).length === 0) {
    issues.push({
      code: 'EMPTY_SELECTION',
      message: getAwardEmptySelectionNotice(state),
    });
  }

  if (state.requestType === PurchaseRequestType.PROJECT) {
    for (const row of state.rows) {
      if (state.selections[row.purchaseRequestLineId] === undefined) {
        continue;
      }
      const quantity = parseQuantity(
        state.quantityByLine[row.purchaseRequestLineId] ?? row.quantityRequested,
      );
      const requested = parseQuantity(row.quantityRequested);
      if (quantity <= 0 || quantity > requested + 1e-9) {
        issues.push({
          code: 'INVALID_QUANTITY',
          message: `La cantidad de ${row.itemName || 'la línea'} debe ser mayor que cero y no superar la solicitada (${row.quantityRequested}).`,
        });
      }
    }
  }

  if (state.currencyMixed) {
    issues.push({
      code: 'CURRENCY_MIXED',
      message:
        'Las cotizaciones están en monedas distintas: la comparación de precios está desactivada.',
    });
  }

  return {
    ok: !issues.some((issue) => issue.code !== 'CURRENCY_MIXED'),
    issues,
  };
}

/**
 * Payload de creación de adjudicaciones en lote. Un award por línea
 * seleccionada, con el costo derivado en SERVIDOR desde la línea de cotización
 * — este método NUNCA emite `unitCost` (solo la escotilla de proveedor sin
 * cotización lo aporta, y esas entradas las compone el panel, spec §7).
 *
 * INVARIANTE (spec §5.3): un `purchaseRequestLineId` aparece como máximo una
 * vez — `selections` es un mapa con claves únicas y las filas se recorren una
 * sola vez.
 */
export function toCreateAwardsDto(state: AwardMatrixState): CreateAwardsRequest {
  const awards: PurchaseRequestLineAwardInput[] = [];
  const columnByQuoteId = new Map(state.columns.map((column) => [column.quoteId, column]));

  for (const row of state.rows) {
    const quoteId = state.selections[row.purchaseRequestLineId];
    if (!quoteId) {
      continue;
    }
    const column = columnByQuoteId.get(quoteId);
    const quoteLine = column?.lines[row.purchaseRequestLineId];
    if (!column || !quoteLine) {
      // Selección inválida (no debería poder construirse: todas las rutas de
      // selección exigen cobertura). La escotilla sin cotización no pasa por
      // aquí: la compone el panel (spec §7).
      continue;
    }

    const rawQuantity =
      state.requestType === PurchaseRequestType.PROJECT
        ? (state.quantityByLine[row.purchaseRequestLineId] ?? row.quantityRequested)
        : row.quantityRequested;

    awards.push({
      purchaseRequestLineId: row.purchaseRequestLineId,
      supplierQuoteId: quoteId,
      awardedPartyRefId: column.supplierPartyRefId,
      awardedQuantity: formatDecimal2(parseQuantity(rawQuantity)),
    });
  }

  return { awards };
}

/** El panel puede editar la matriz (solicitud aprobada, no deshabilitado). */
export function isAwardMatrixEditable(state: AwardMatrixState): boolean {
  return state.canEdit;
}

/**
 * Id del control de columna de una cotización para el foco gestionado al
 * entrar desde «Adjudicar productos de esta cotización» (`QuoteComparisonPanel`,
 * patrón `line-focus.ts`). Vive aquí (módulo puro) para que la tabla y el
 * panel compartan el mismo identificador sin importar el componente.
 */
export function getAwardColumnControlId(quoteId: string): string {
  return `award-column-${quoteId}`;
}

/** Detección de monedas mixtas para el alert informativo (spec §4.5, §6.3). */
export function isCurrencyMixed(state: AwardMatrixState): boolean {
  return state.currencyMixed;
}

/**
 * Conteos para la barra «3 de 4 productos adjudicados · 1 pendiente»
 * (spec §4.4): cuentan las persistidas (adjudicado/ordenado) más las marcadas
 * en el draft; el resto es pendiente.
 */
export function getAwardMatrixProgress(state: AwardMatrixState): {
  totalCount: number;
  awardedCount: number;
  pendingCount: number;
} {
  const totalCount = state.rows.length;
  const awardedCount = state.rows.filter(
    (row) =>
      state.locks[row.purchaseRequestLineId] !== undefined ||
      state.selections[row.purchaseRequestLineId] !== undefined,
  ).length;

  return { totalCount, awardedCount, pendingCount: totalCount - awardedCount };
}
