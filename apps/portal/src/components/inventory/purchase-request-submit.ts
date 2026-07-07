import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import type { CreatePurchaseRequestDto, CreatePurchaseRequestLineDto } from '@/lib/api-client';

export interface PurchaseSubmitLineInput {
  sourceKind: PurchaseRequestLineSourceKind;
  inventoryItemId: string;
  productLabel: string;
  freeTextDescription: string;
  quantityRequested: string;
  unitOfMeasure: string;
  suggestedPartyRefId: string;
  notes: string;
}

export interface PurchaseSubmitValidationResult {
  payload: CreatePurchaseRequestDto | null;
  error: string | null;
}

function mapLine(line: PurchaseSubmitLineInput): CreatePurchaseRequestLineDto | null {
  const quantity = Number.parseFloat(line.quantityRequested);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const unitOfMeasure = line.unitOfMeasure.trim();
  if (!unitOfMeasure) {
    return null;
  }

  const suggestedPartyRefId = line.suggestedPartyRefId.trim() || null;
  const notes = line.notes.trim() || null;

  if (line.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT) {
    const description = (line.freeTextDescription || line.productLabel).trim();
    if (!description) {
      return null;
    }

    return {
      sourceKind: line.sourceKind,
      inventoryItemId: null,
      freeTextDescription: description,
      quantityRequested: quantity,
      unitOfMeasure,
      suggestedPartyRefId,
      notes,
    };
  }

  const inventoryItemId = line.inventoryItemId.trim();
  if (!inventoryItemId) {
    return null;
  }

  return {
    sourceKind: line.sourceKind,
    inventoryItemId,
    freeTextDescription: null,
    quantityRequested: quantity,
    unitOfMeasure,
    suggestedPartyRefId,
    notes,
  };
}

export function buildCreatePurchaseRequestPayload(input: {
  title: string;
  requestType: PurchaseRequestType;
  priority: PurchaseRequestPriority;
  requestingArea: string;
  justification: string;
  neededByDate: string;
  lines: PurchaseSubmitLineInput[];
}): PurchaseSubmitValidationResult {
  const title = input.title.trim();
  const requestingArea = input.requestingArea.trim();
  const justification = input.justification.trim();

  if (!title) {
    return { payload: null, error: 'Indica un titulo para la solicitud.' };
  }

  if (!requestingArea) {
    return { payload: null, error: 'Indica el area solicitante.' };
  }

  if (justification.length < 10) {
    return {
      payload: null,
      error: 'La justificacion debe tener al menos 10 caracteres.',
    };
  }

  if (input.lines.length === 0) {
    return { payload: null, error: 'Agrega al menos una linea a la solicitud.' };
  }

  const mappedLines: CreatePurchaseRequestLineDto[] = [];

  for (const line of input.lines) {
    const mapped = mapLine(line);
    if (!mapped) {
      if (line.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT) {
        return {
          payload: null,
          error: 'Completa la descripcion de las lineas manuales.',
        };
      }

      return {
        payload: null,
        error: 'Cada linea debe tener un producto seleccionado y una cantidad mayor a cero.',
      };
    }

    mappedLines.push(mapped);
  }

  return {
    payload: {
      title,
      requestType: input.requestType,
      priority: input.priority,
      requestingArea,
      justification,
      neededByDate: input.neededByDate || null,
      lines: mappedLines,
    },
    error: null,
  };
}
