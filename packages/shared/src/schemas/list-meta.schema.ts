import { z } from 'zod';
import type { ListMeta } from '../dto/pagination.dto';

/**
 * Esquema Zod del `ListMeta` único de paginación (ADR-065, `dto/pagination.dto.ts`).
 * El tipo anotado obliga a que ambos sigan iguales.
 */
export const ListMetaSchema: z.ZodType<ListMeta> = z
  .object({
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
    totalIsEstimate: z.boolean(),
    page: z.number().int().positive().nullable(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative().nullable(),
    hasMore: z.boolean(),
    mode: z.enum(['page', 'cursor']),
    capabilities: z
      .object({ randomAccess: z.boolean(), sortableFields: z.array(z.string()) })
      .strict(),
    sort: z
      .object({ by: z.string(), dir: z.enum(['asc', 'desc']) })
      .strict()
      .nullable(),
  })
  .strict();
