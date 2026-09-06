import { BadRequestException } from '@nestjs/common';

/**
 * Utilidades puras del grupo de seriales (MOD12 S2.1 · B2).
 *
 * Sin dependencias de Nest salvo `BadRequestException`, sin acceso a datos:
 * la normalización singular→arreglo y la regla cantidad-entera-`===`-tamaño
 * viven aquí para que el borde zod (`dto/index.ts`) y el servicio usen la
 * misma aritmética sin duplicarla.
 */

export interface SerialGroupInput {
  serializedAssetIds?: string[] | undefined;
  serializedAssetId?: string | null | undefined;
}

/**
 * Normaliza el grupo de seriales de una línea: el arreglo manda; el singular
 * de transición (S1) equivale a un arreglo de un elemento; sin seriales no
 * hay grupo (`undefined`, no arreglo vacío: un grupo vacío es línea no
 * serializada y usa la cantidad solicitada).
 */
export function normalizeSerialGroup(input: SerialGroupInput): string[] | undefined {
  if (input.serializedAssetIds !== undefined) {
    return input.serializedAssetIds;
  }

  if (input.serializedAssetId) {
    return [input.serializedAssetId];
  }

  return undefined;
}

/**
 * Coherencia cantidad ↔ grupo (CA-S2.1-BE04): para ítems serializados la
 * cantidad solicitada debe ser un número entero exactamente igual al tamaño
 * del grupo. `itemLabel` es el SKU legible (nunca PII: es dato de catálogo).
 */
export function assertSerialGroupQty(
  requestedQty: string | number,
  groupSize: number,
  itemLabel: string,
): void {
  const quantity = typeof requestedQty === 'number' ? requestedQty : Number(requestedQty);

  if (!Number.isInteger(quantity)) {
    throw new BadRequestException(
      `La cantidad solicitada del ítem ${itemLabel} debe ser un número entero igual al número de seriales seleccionados.`,
    );
  }

  if (quantity !== groupSize) {
    throw new BadRequestException(
      `La cantidad solicitada del ítem ${itemLabel} debe coincidir con el número de ` +
        `seriales seleccionados (${groupSize} seriales, cantidad ${quantity}).`,
    );
  }
}
