import type {
  PurchaseRequestAwardCoverage,
  PurchaseRequestLineStatus,
} from '../../enums/inventory';

/**
 * Contrato de API CONGELADO — MOD12 Compras: adjudicación en matriz
 * (productos × cotizaciones) y eje de cobertura derivado. Fase 30, track T0.
 *
 * - Versión: v1.0
 * - Fecha: 2026-09-11
 * - Spec congelada: docs/specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md
 *   (§4 anatomía de la pantalla y §5 contrato de componente son la autoridad
 *   de estos shapes)
 * - Plan de fase: docs/plans/2026-09-11-mod12-compras-adjudicacion-matriz-fase-30.md
 *   (track T0 — primera entrega bloqueante de la fase)
 * - ADR: docs/adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md (propuesto)
 *
 * SOLO TIPOS: este archivo no importa NestJS, React ni Zod (patrón de
 * `stock-issue-picking.ts`). Los schemas Zod de validación viven en el API y
 * se afirman con `satisfies` contra estos shapes (decisión del plan T0).
 * Cantidades e importes viajan como cadena decimal, coherente con las
 * columnas `numeric` de `purchase_request_line_awards` y `supplier_quote_lines`.
 *
 * ESTE CONTRATO QUEDA CONGELADO AL PUBLICARSE: desbloquea los tracks BE-1,
 * BE-2, FE-1, FE-2, FE-3 y QA de la Fase 30. Cualquier cambio exige nueva
 * versión de este archivo y de la spec, y notificación a los tracks afectados
 * (protocolo §3bis, regla 1).
 *
 * El portal NO define tipos paralelos (spec §5.2): `AwardMatrixTable`,
 * `AwardSelectionBar`, `AwardMatrixPanel` y `award-matrix.ts` consumen
 * exclusivamente los shapes de este archivo.
 */

/**
 * Eje de cobertura derivado de la solicitud (ADR-087 propuesto, D1), calculado
 * y nunca persistido. Re-exportado como tipo para que este contrato sea
 * autocontenido; el valor runtime vive en el enum compartido
 * (`PurchaseRequestAwardCoverage`) y sus etiquetas visibles, en
 * `inventory-labels.ts` (spec §9).
 */
export type { PurchaseRequestAwardCoverage };

/**
 * Estado de línea de la solicitud de compra. Re-exportado como tipo por
 * simetría con el eje de cobertura: `RevokeAwardResponse.lineStatusAfter` lo
 * usa. El valor runtime vive en el enum compartido
 * (`PurchaseRequestLineStatus`) y sus etiquetas visibles, en
 * `inventory-labels.ts`.
 */
export type { PurchaseRequestLineStatus };

/**
 * Códigos de error del flujo de adjudicación y revocación. El API los expone
 * en las respuestas 409/422 de los endpoints de adjudicación; la matriz los
 * traduce a mensajes concretos (spec §4.5, §6.5).
 */
export type PurchaseAwardErrorCode =
  /**
   * La cotización referida no pertenece a la solicitud de compra.
   */
  | 'AWARD_QUOTE_MISMATCH'
  /**
   * La cotización pertenece a otro proveedor: no se puede adjudicar en nombre
   * del proveedor indicado.
   */
  | 'AWARD_SUPPLIER_MISMATCH'
  /**
   * La cotización no tiene línea para ese producto: la celda sería
   * `sin-cotizar` y no admite adjudicación.
   */
  | 'AWARD_QUOTE_LINE_MISSING'
  /**
   * El producto ya está adjudicado a otro proveedor y el tipo de solicitud no
   * es PROJECT (único tipo que admite repartir cantidad entre proveedores,
   * spec §6.2 — `validateLineAward` no se toca).
   */
  | 'AWARD_PARTY_CONFLICT'
  /**
   * Existe una línea de orden de compra viva para ese producto y proveedor: la
   * adjudicación no se puede revocar (spec §6.5; el servidor es la autoridad).
   */
  | 'AWARD_ALREADY_ORDERED'
  /**
   * La cantidad que la nueva orden asignaría supera la cantidad adjudicada de
   * la línea (tope de conversión a OC).
   */
  | 'ORDER_EXCEEDS_AWARD'
  /**
   * El costo unitario aportado por el cliente difiere del resuelto en
   * servidor en más de un céntimo. Solo aplica por la escotilla de proveedor
   * sin cotización, único camino donde el cliente aporta el costo (spec §7).
   */
  | 'UNIT_COST_MISMATCH';

/**
 * Estado de una celda de la matriz productos × cotizaciones (spec §4.3,
 * contrato congelado). Las claves son EXACTAS a las de la spec; la interfaz no
 * traduce ni renombra.
 *
 * - `sin-cotizar`: la cotización no cubre el producto; no seleccionable.
 * - `disponible`: cotización cubre el producto y está libre; seleccionable.
 * - `seleccionado`: marcada en el draft actual; deseleccionable.
 * - `adjudicado`: persistida; bloqueada salvo acción «Revocar».
 * - `ordenado`: con orden viva; bloqueo duro, sin revocación (CA-UX-06).
 */
export type AwardMatrixCellState =
  | 'sin-cotizar'
  | 'disponible'
  | 'seleccionado'
  | 'adjudicado'
  | 'ordenado';

/**
 * Proyección de lectura de una línea de cotización que la celda necesita para
 * renderizar (spec §4.2, fila «Celda»). Ausente del registro `lines` de la
 * columna = la cotización no cubre esa línea (celda `sin-cotizar`, spec §6.4);
 * no se añade un flag redundante de cobertura porque la clave del registro ya
 * la codifica.
 */
export interface AwardMatrixQuoteLine {
  /** Costo unitario de la línea de cotización (cadena decimal). */
  unitCost: string;
  /** Importe de línea: unitCost × cantidad solicitada (cadena decimal). */
  lineAmount: string;
}

/**
 * Encabezado de una columna de cotización de la matriz (spec §4.2): proveedor,
 * número de cotización, moneda y total pagadero. El control de selección de
 * columna deriva de aquí los productos que la cotización cubre (claves de
 * `lines`) y su estado en las filas.
 */
export interface AwardMatrixQuoteColumn {
  quoteId: string;
  /** Referencia de party del proveedor que emitó la cotización. */
  supplierPartyRefId: string;
  /** Etiqueta legible del proveedor, resuelta en servidor para la vista. */
  supplierLabel: string;
  /** Número de cotización legible, si la cotización lo tiene. */
  quoteNumber?: string;
  currency: string;
  /** Total pagadero de la cotización (cadena decimal). */
  payableAmount: string;
  /**
   * Detalle por línea indexado por `purchaseRequestLineId`: lo que cada celda
   * de esta columna necesita para renderizar costo unitario e importe. Las
   * líneas que la cotización no cubre simplemente no aparecen.
   */
  lines: Record<string, AwardMatrixQuoteLine>;
}

/**
 * Celda de la matriz: estado de la interacción más el marcado de comparación
 * de precios (spec §4.2/§4.3).
 */
export interface AwardMatrixCell {
  state: AwardMatrixCellState;
  /**
   * Chip «Más barato». Solo las celdas `disponible` o `seleccionado` pueden
   * llevarlo, y solo cuando las cotizaciones comparadas comparten moneda
   * (spec §6.3): sin moneda común no se ordena por precio ni se marca.
   */
  cheapest?: boolean;
}

/**
 * Fila de producto de la matriz (spec §4.2): columna fija izquierda +
 * celdas por cotización + columna derecha de cantidad adjudicada.
 */
export interface AwardMatrixRow {
  purchaseRequestLineId: string;
  itemName: string;
  sku: string;
  /** Cantidad solicitada de la línea (cadena decimal). */
  quantityRequested: string;
  unitOfMeasure: string;
  /**
   * Cantidad adjudicada vigente de la línea (cadena decimal): columna derecha,
   * de solo lectura salvo `requestType === PROJECT` (spec §4.2); replica el
   * `lockQuantity` del panel sustituido.
   */
  awardedQuantity: string;
  /** Proveedor que tiene la adjudicación vigente de la línea, si existe. */
  awardedPartyRefId?: string;
  /**
   * Celdas de la fila indexadas por `quoteId`. Las celdas `sin-cotizar`
   * también aparecen (con su estado) para que el render no tenga que cruzar
   * contra `columns`; los datos de precio de las que sí tienen cotización
   * viven en `AwardMatrixQuoteColumn.lines`.
   */
  cells: Record<string, AwardMatrixCell>;
  /** Cotización ganadora de la línea, si su estado es `adjudicado` u `ordenado`. */
  awardedQuoteId?: string;
}

/**
 * Total por moneda del resumen en vivo de un proveedor (spec §4.4 y §6.3):
 * con monedas mixtas el total se separa por moneda, nunca se suma entre
 * monedas distintas.
 */
export interface AwardSupplierCurrencyTotal {
  currency: string;
  /** Suma de los importes marcados para ese proveedor, en esta moneda (cadena decimal). */
  total: string;
}

/**
 * Resumen en vivo por proveedor de la barra inferior (spec §4.4): una píldora
 * por proveedor con productos marcados y total. `AwardSelectionBar` recibe un
 * arreglo de estos resúmenes; el número de órdenes a generar («Se generarán N
 * órdenes de compra») es el tamaño del arreglo.
 */
export interface AwardSupplierSummary {
  supplierPartyRefId: string;
  supplierLabel: string;
  /** Número de productos marcados para este proveedor. */
  productCount: number;
  /** Totales separados por moneda (spec §6.3); un elemento si hay moneda única. */
  totalsByCurrency: AwardSupplierCurrencyTotal[];
}

/**
 * Línea de adjudicación en el payload de entrada de la creación de awards
 * (`POST` de adjudicaciones en lote, spec §5.3 `toCreateAwardsDto`).
 *
 * Invariante garantizado por `award-matrix.ts`: un `purchaseRequestLineId`
 * aparece como máximo una vez en el arreglo (spec §5.3) — un producto, un
 * proveedor (spec §6.1).
 */
export interface PurchaseRequestLineAwardInput {
  purchaseRequestLineId: string;
  /** Cotización de la que deriva la adjudicación, si la hay. */
  supplierQuoteId?: string;
  /** Proveedor adjudicado. */
  awardedPartyRefId: string;
  /** Cantidad adjudicada (cadena decimal). */
  awardedQuantity: string;
  awardNotes?: string;
  /**
   * Costo unitario aportado por el cliente. SOLO llega por la escotilla de
   * proveedor sin cotización (spec §7): en todos los demás casos lo deriva el
   * servidor desde la línea de cotización, y un valor divergente se rechaza
   * con `UNIT_COST_MISMATCH`.
   */
  unitCost?: string;
}

/**
 * Payload de creación de adjudicaciones en lote.
 */
export interface CreateAwardsRequest {
  awards: PurchaseRequestLineAwardInput[];
}

/**
 * Adjudicación persistida, tal como la devuelve el API al crear (eco de los
 * awards creados). Cantidades e importes como cadena decimal; los campos
 * opcionales nullable distinguen «sin dato» de «omitido en la serialización».
 */
export interface PurchaseRequestLineAwardRecord {
  id: string;
  purchaseRequestLineId: string;
  supplierQuoteId?: string | null;
  awardedPartyRefId: string;
  awardedQuantity: string;
  /** Costo unitario resuelto (derivado en servidor o aportado por la escotilla). */
  unitCost?: string | null;
  /** Moneda del costo resuelto, cuando el servidor la determina. */
  currency?: string | null;
  awardNotes?: string | null;
  createdAt?: string;
}

/**
 * Respuesta de creación de adjudicaciones: eco de los awards persistidos y
 * cobertura derivada resultante para la solicitud (ADR-087 propuesto, D1).
 */
export interface CreateAwardsResponse {
  awards: PurchaseRequestLineAwardRecord[];
  coverage: PurchaseRequestAwardCoverage;
}

/**
 * Parámetros de ruta de la revocación de una adjudicación
 * (`DELETE .../requests/:requestId/awards/:awardId`).
 */
export interface RevokeAwardRequest {
  requestId: string;
  awardId: string;
}

/**
 * Respuesta de revocación: estado de la línea tras eliminar la adjudicación y
 * cobertura derivada resultante. El error esperable del flujo es
 * `AWARD_ALREADY_ORDERED` (spec §6.5).
 */
export interface RevokeAwardResponse {
  awardId: string;
  /** Estado de la línea de la solicitud tras eliminar la adjudicación. */
  lineStatusAfter: PurchaseRequestLineStatus;
  coverage: PurchaseRequestAwardCoverage;
}
