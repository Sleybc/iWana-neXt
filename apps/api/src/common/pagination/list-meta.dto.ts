import { ApiProperty } from '@nestjs/swagger';
import type { ListMeta } from '@iwana/shared';

/**
 * DTO de OpenAPI para ListMeta (ADR-065 Ola 1).
 *
 * Expone todos los campos del contrato ListMeta como propiedades documentadas
 * para que Swagger genere la especificación correcta de cada endpoint de listado.
 */
export class ListMetaDto implements ListMeta {
  @ApiProperty({
    description:
      'Cursor opaco base64url para la siguiente página (modo cursor). null en modo page.',
    nullable: true,
    example: null,
  })
  nextCursor: string | null;

  @ApiProperty({ description: 'Total de registros del conjunto filtrado.', example: 142 })
  total: number;

  @ApiProperty({
    description: 'true cuando total es una estimación (recursos de alto volumen).',
    example: false,
  })
  totalIsEstimate: boolean;

  @ApiProperty({
    description: 'Número de página (1-based). null en modo cursor.',
    nullable: true,
    example: 1,
  })
  page: number | null;

  @ApiProperty({ description: 'Tamaño de página aplicado.', example: 20 })
  limit: number;

  @ApiProperty({
    description: 'Total de páginas. null en modo cursor.',
    nullable: true,
    example: 8,
  })
  totalPages: number | null;

  @ApiProperty({ description: 'true cuando hay más resultados disponibles.', example: true })
  hasMore: boolean;

  @ApiProperty({
    description: "Modo de acceso: 'page' (offset) o 'cursor' (keyset).",
    enum: ['page', 'cursor'],
    example: 'page',
  })
  mode: 'page' | 'cursor';

  @ApiProperty({
    description: 'Capacidades declaradas por el servidor.',
    example: { randomAccess: true, sortableFields: ['name', 'createdAt'] },
  })
  capabilities: {
    randomAccess: boolean;
    sortableFields: string[];
  };

  @ApiProperty({
    description: 'Orden efectivamente aplicado; null = orden por defecto del recurso.',
    nullable: true,
    example: { by: 'name', dir: 'asc' },
  })
  sort: { by: string; dir: 'asc' | 'desc' } | null;
}
