import { ApiProperty } from '@nestjs/swagger';
import type { ListMeta } from '@iwana/shared';

/**
 * DTO de OpenAPI para ListMeta (ADR-065 Ola 1).
 *
 * Expone todos los campos del contrato ListMeta como propiedades documentadas
 * para que Swagger genere la especificación correcta de cada endpoint de listado.
 * Es el único esquema `ListMetaDto` de la API: sus tipos coinciden con el
 * contrato congelado de red (MOD13), que lo referencia por ese nombre.
 */
export class ListMetaDto implements ListMeta {
  @ApiProperty({
    description:
      'Cursor opaco base64url para la siguiente página (modo cursor). null en modo page.',
    type: String,
    nullable: true,
  })
  nextCursor: string | null;

  @ApiProperty({
    description: 'Total de registros del conjunto filtrado.',
    type: 'integer',
    minimum: 0,
  })
  total: number;

  @ApiProperty({ description: 'true cuando total es una estimación (recursos de alto volumen).' })
  totalIsEstimate: boolean;

  @ApiProperty({
    description: 'Número de página (1-based). null en modo cursor.',
    type: 'integer',
    minimum: 1,
    nullable: true,
  })
  page: number | null;

  @ApiProperty({ description: 'Tamaño de página aplicado.', type: 'integer', minimum: 1 })
  limit: number;

  @ApiProperty({
    description: 'Total de páginas. null en modo cursor.',
    type: 'integer',
    minimum: 0,
    nullable: true,
  })
  totalPages: number | null;

  @ApiProperty({ description: 'true cuando hay más resultados disponibles.' })
  hasMore: boolean;

  @ApiProperty({
    description: "Modo de acceso: 'page' (offset) o 'cursor' (keyset).",
    enum: ['page', 'cursor'],
  })
  mode: 'page' | 'cursor';

  @ApiProperty({
    description: 'Capacidades declaradas por el servidor.',
    allOf: [
      {
        type: 'object',
        properties: {
          randomAccess: { type: 'boolean' },
          sortableFields: { type: 'array', items: { type: 'string' } },
        },
        required: ['randomAccess', 'sortableFields'],
      },
    ],
  })
  capabilities: {
    randomAccess: boolean;
    sortableFields: string[];
  };

  @ApiProperty({
    description: 'Orden efectivamente aplicado; null = orden por defecto del recurso.',
    nullable: true,
    allOf: [
      {
        type: 'object',
        properties: { by: { type: 'string' }, dir: { type: 'string', enum: ['asc', 'desc'] } },
        required: ['by', 'dir'],
      },
    ],
  })
  sort: { by: string; dir: 'asc' | 'desc' } | null;
}
