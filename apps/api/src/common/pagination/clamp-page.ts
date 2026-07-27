import { BadRequestException } from '@nestjs/common';

/**
 * Cota uniforme `page * limit <= maxOffset` para todo endpoint de listado que
 * compute offset basado en página. Previene que un `page` arbitrariamente grande
 * degrade PostgreSQL y el pool compartido de pgBouncer (DEF-2).
 *
 * Fuera de rango → 400 con mensaje en español, sin filtrar detalles internos.
 * No cambia el contrato de respuesta: un page válido devuelve lo mismo que hoy.
 *
 * Este helper se integra con ADR-065 en la Ola 1 (paginación unificada).
 */
export const MAX_PAGE_OFFSET = 9_999;

export function clampPage(
  page: number,
  limit: number,
  maxOffset = MAX_PAGE_OFFSET,
): { page: number; limit: number } {
  if (
    !Number.isFinite(page) ||
    !Number.isFinite(limit) ||
    !Number.isInteger(page) ||
    !Number.isInteger(limit)
  ) {
    throw new BadRequestException('Los parámetros de paginación no son válidos');
  }

  if (page < 1) {
    throw new BadRequestException('El número de página debe ser al menos 1');
  }

  if (limit < 1) {
    throw new BadRequestException('El límite de página debe ser al menos 1');
  }

  if (page * limit > maxOffset) {
    throw new BadRequestException('El número de página excede el límite permitido');
  }

  return { page, limit };
}
