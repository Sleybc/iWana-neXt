import { inventoryApi, mapPickerSearchResponse } from '@/lib/api-client';

/**
 * Captura por código de barras en los flujos con el producto en la mano
 * (MOD12 · F4 · RF-CAT-16, CA-F4-05).
 *
 * Reutiliza el lookup E-4 existente (`GET /inventory/items/search`) pasando el
 * código como `q`: el backend ya resuelve `barcode` en ese `q` (RF-CAT-15), así
 * que no hay buscador nuevo que mantener. La primera coincidencia gana y el
 * llamador muestra su etiqueta para verificación del operador.
 */

export interface BarcodeCaptureHit {
  itemId: string;
  label: string;
  sublabel: string | null;
}

export type BarcodeCaptureResult =
  | { status: 'empty' }
  | { status: 'found'; hit: BarcodeCaptureHit }
  | { status: 'not-found' };

/** Recorta blancos: un lector USB puede anteponer o posponer espacios. */
export function normalizeBarcodeQuery(value: string): string {
  return value.trim();
}

export async function resolveBarcodeToCatalogItem(rawValue: string): Promise<BarcodeCaptureResult> {
  const query = normalizeBarcodeQuery(rawValue);
  if (!query) {
    return { status: 'empty' };
  }

  const response = await inventoryApi.searchItemsForPicker({ q: query });
  const mapped = mapPickerSearchResponse(response);
  const [first] = mapped.items;
  if (!first) {
    return { status: 'not-found' };
  }

  return {
    status: 'found',
    hit: { itemId: first.id, label: first.label, sublabel: first.sublabel ?? null },
  };
}
