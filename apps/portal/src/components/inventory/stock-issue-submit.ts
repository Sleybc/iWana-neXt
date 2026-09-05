import { InventoryTrackingMode, StockBalanceCondition, StockIssueType } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  InventoryItemRecord,
  UpdateStockIssueDto,
} from '@/lib/api-client';
import { showDestinationForIssueType } from './stock-issue-form-utils';
import { isSerializedInventoryItem, isSerializedTrackingMode } from './stock-issue-line-utils';

export interface StockIssueSubmitLineInput {
  /** Id de la línea del borrador; alimenta el foco al primer inválido y el error inline. */
  lineId?: string;
  itemId: string;
  productLabel: string;
  requestedQty: string;
  isManual: boolean;
  condition: StockBalanceCondition;
  lotId: string;
  serializedAssetId: string;
  /**
   * Modo de seguimiento hidratado en la línea (S1). Cuando viene, decide la
   * exigencia de serial; `itemsById` queda como respaldo para líneas legacy.
   */
  trackingMode?: InventoryTrackingMode;
}

export interface StockIssueSubmitValidationResult<T> {
  payload: T | null;
  error: string | null;
}

function getLineDuplicateKey(
  line: Pick<StockIssueSubmitLineInput, 'itemId' | 'lotId' | 'serializedAssetId'>,
) {
  if (line.serializedAssetId.trim()) {
    return `serial:${line.serializedAssetId.trim()}`;
  }

  return `item:${line.itemId.trim()}:${line.lotId.trim()}`;
}

function validateHeaderFields(input: {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
}): string | null {
  const sourceLocationId = input.sourceLocationId.trim();
  if (!sourceLocationId) {
    return 'Selecciona la bodega de origen.';
  }

  const showDestination = showDestinationForIssueType(input.type);
  const destinationLocationId = input.destinationLocationId.trim();

  if (showDestination && !destinationLocationId) {
    return 'Selecciona el destino de la salida.';
  }

  if (showDestination && destinationLocationId === sourceLocationId) {
    return 'El destino no puede ser igual al origen.';
  }

  if (input.type === StockIssueType.SALE_DISPATCH) {
    const commercialRefId = input.commercialRefId.trim();
    const originRefId = input.originRefId.trim();
    if (!commercialRefId && !originRefId) {
      return 'Indica una referencia comercial o el origen de la venta.';
    }
  }

  if (input.type === StockIssueType.INTERNAL_CONSUMPTION) {
    if (!input.costCenter.trim()) {
      return 'Indica el centro de costo.';
    }
    if (!input.reason.trim()) {
      return 'Indica el motivo del consumo interno.';
    }
  }

  return null;
}

function isLineSerialized(
  line: StockIssueSubmitLineInput,
  itemsById: Map<string, InventoryItemRecord>,
): boolean {
  // S1: el flag sale de la línea (corrige C3 también en el bloqueo de envío).
  if (line.trackingMode) {
    return isSerializedTrackingMode(line.trackingMode);
  }
  const item = itemsById.get(line.itemId.trim());
  return item ? isSerializedInventoryItem(item) : false;
}

export interface StockIssueDraftLineError {
  /** Índice de la línea en el arreglo validado. */
  lineIndex: number;
  /** Id del control a enfocar (`issue-draft-serial-<lineId>`, `...-qty-...`, `...-item-...`). */
  controlId: string;
  message: string;
}

function controlIdForLine(line: StockIssueSubmitLineInput, index: number, kind: string): string {
  const lineId = line.lineId?.trim() ? line.lineId.trim() : `index-${index}`;
  return `issue-draft-${kind}-${lineId}`;
}

/**
 * Valida las líneas y devuelve **un error por línea inválida** (primera causa por
 * línea, en orden) para pintar el inline por línea y enfocar el primer inválido.
 * El error global del formulario es `errors[0].message` (mismo copy que antes).
 */
export function validateStockIssueDraftLines(
  lines: StockIssueSubmitLineInput[],
  itemsById: Map<string, InventoryItemRecord>,
): StockIssueDraftLineError[] {
  if (lines.length === 0) {
    return [];
  }

  const errors: StockIssueDraftLineError[] = [];
  const seenKeys = new Set<string>();

  lines.forEach((line, index) => {
    const itemId = line.itemId.trim();
    if (!itemId) {
      errors.push({
        lineIndex: index,
        controlId: controlIdForLine(line, index, 'item'),
        message: line.isManual
          ? 'Completa el ítem de las líneas manuales.'
          : 'Cada línea debe tener un ítem seleccionado.',
      });
      return;
    }

    const duplicateKey = getLineDuplicateKey(line);
    if (seenKeys.has(duplicateKey)) {
      errors.push({
        lineIndex: index,
        controlId: controlIdForLine(line, index, 'qty'),
        message: 'Hay líneas duplicadas en el borrador. Ajusta cantidad, lote o serial.',
      });
      return;
    }
    seenKeys.add(duplicateKey);

    const serialized = isLineSerialized(line, itemsById);
    const serializedAssetId = line.serializedAssetId.trim();

    if (serialized && !serializedAssetId) {
      errors.push({
        lineIndex: index,
        controlId: controlIdForLine(line, index, 'serial'),
        message: `Selecciona el serial del activo para ${line.productLabel || 'esta línea'}.`,
      });
      return;
    }

    const requestedQty = Number.parseFloat(line.requestedQty);
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      errors.push({
        lineIndex: index,
        controlId: controlIdForLine(line, index, 'qty'),
        message: 'Cada línea debe tener una cantidad mayor a cero.',
      });
      return;
    }

    if (serializedAssetId && requestedQty !== 1) {
      errors.push({
        lineIndex: index,
        controlId: controlIdForLine(line, index, 'qty'),
        message: 'Las líneas con equipo con serial deben tener cantidad 1.',
      });
    }
  });

  return errors;
}

function mapValidatedLines(
  lines: StockIssueSubmitLineInput[],
  itemsById: Map<string, InventoryItemRecord>,
): { mappedLines: CreateStockIssueDto['lines']; error: string | null } {
  if (lines.length === 0) {
    return { mappedLines: [], error: 'Agrega al menos una línea a la salida.' };
  }

  const seenKeys = new Set<string>();
  const mappedLines: CreateStockIssueDto['lines'] = [];

  for (const line of lines) {
    const itemId = line.itemId.trim();
    if (!itemId) {
      return {
        mappedLines: [],
        error: line.isManual
          ? 'Completa el ítem de las líneas manuales.'
          : 'Cada línea debe tener un ítem seleccionado.',
      };
    }

    const duplicateKey = getLineDuplicateKey(line);
    if (seenKeys.has(duplicateKey)) {
      return {
        mappedLines: [],
        error: 'Hay líneas duplicadas en el borrador. Ajusta cantidad, lote o serial.',
      };
    }
    seenKeys.add(duplicateKey);

    const serialized = isLineSerialized(line, itemsById);
    const serializedAssetId = line.serializedAssetId.trim();
    const lotId = line.lotId.trim();

    if (serialized && !serializedAssetId) {
      return {
        mappedLines: [],
        error: `Selecciona el serial del activo para ${line.productLabel || 'esta línea'}.`,
      };
    }

    const requestedQty = Number.parseFloat(line.requestedQty);
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      return {
        mappedLines: [],
        error: 'Cada línea debe tener una cantidad mayor a cero.',
      };
    }

    if (serializedAssetId && requestedQty !== 1) {
      return {
        mappedLines: [],
        error: 'Las líneas con equipo con serial deben tener cantidad 1.',
      };
    }

    mappedLines.push({
      itemId,
      requestedQty,
      condition: line.condition,
      ...(lotId ? { lotId } : {}),
      ...(serializedAssetId ? { serializedAssetId } : {}),
    });
  }

  return { mappedLines, error: null };
}

export function buildCreateStockIssuePayload(input: {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
  lines: StockIssueSubmitLineInput[];
  itemsById: Map<string, InventoryItemRecord>;
}): StockIssueSubmitValidationResult<CreateStockIssueDto> {
  const headerError = validateHeaderFields(input);
  if (headerError) {
    return { payload: null, error: headerError };
  }

  const sourceLocationId = input.sourceLocationId.trim();
  const showDestination = showDestinationForIssueType(input.type);
  const destinationLocationId = input.destinationLocationId.trim();

  const { mappedLines, error: linesError } = mapValidatedLines(input.lines, input.itemsById);
  if (linesError) {
    return { payload: null, error: linesError };
  }

  return {
    payload: {
      type: input.type,
      sourceLocationId,
      ...(showDestination ? { destinationLocationId } : {}),
      originRefId: input.originRefId.trim() || null,
      commercialRefId: input.commercialRefId.trim() || null,
      costCenter: input.costCenter.trim() || null,
      reason: input.reason.trim() || null,
      lines: mappedLines,
    },
    error: null,
  };
}

export function buildUpdateStockIssuePayload(input: {
  type: StockIssueType;
  sourceLocationId: string;
  destinationLocationId: string;
  commercialRefId: string;
  originRefId: string;
  costCenter: string;
  reason: string;
  lines: StockIssueSubmitLineInput[];
  itemsById: Map<string, InventoryItemRecord>;
}): StockIssueSubmitValidationResult<UpdateStockIssueDto> {
  const headerError = validateHeaderFields(input);
  if (headerError) {
    return { payload: null, error: headerError };
  }

  const sourceLocationId = input.sourceLocationId.trim();
  const showDestination = showDestinationForIssueType(input.type);
  const destinationLocationId = input.destinationLocationId.trim();

  const { mappedLines, error: linesError } = mapValidatedLines(input.lines, input.itemsById);
  if (linesError) {
    return { payload: null, error: linesError };
  }

  return {
    payload: {
      type: input.type,
      sourceLocationId,
      ...(showDestination ? { destinationLocationId } : {}),
      originRefId: input.originRefId.trim() || null,
      commercialRefId: input.commercialRefId.trim() || null,
      costCenter: input.costCenter.trim() || null,
      reason: input.reason.trim() || null,
      lines: mappedLines,
    },
    error: null,
  };
}
