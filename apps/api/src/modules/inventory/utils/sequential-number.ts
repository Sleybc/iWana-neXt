import type { EntityManager, EntityTarget } from 'typeorm';

/**
 * Generador único de números consecutivos por tenant para MOD12 (dedup D-BE1
 * de `docs/plans/2026-09-01-inventario-dedup-refactors.md`).
 *
 * Patrón consolidado: `MAX(columna)` del tenant → sufijo numérico +1 →
 * `padStart(6)`. Debe invocarse dentro de la transacción del tenant
 * (`SET LOCAL search_path`), igual que el resto de escrituras del módulo.
 *
 * La variante defensiva `MOV-` de `stock-ledger.service.ts` (ORDER BY DESC +
 * LIKE) se conserva local a propósito: semántica de numeración no negociable.
 */
export async function generateSequentialNumber<T extends object>(
  manager: Pick<EntityManager, 'createQueryBuilder'>,
  params: {
    entity: EntityTarget<T>;
    alias: string;
    columnName: string;
    prefix: string;
    tenantId: string;
  },
): Promise<string> {
  const { entity, alias, columnName, prefix, tenantId } = params;
  const result = await manager
    .createQueryBuilder(entity, alias)
    .select(`MAX(${alias}.${columnName})`, 'maxValue')
    .where(`${alias}.tenant_id = :tenantId`, { tenantId })
    .getRawOne<{ maxValue?: string | null }>();

  const latestNumber = result?.maxValue ?? `${prefix}000000`;
  const latestSequence = latestNumber.slice(prefix.length);
  const nextSequence = (Number.parseInt(latestSequence || '0', 10) + 1).toString().padStart(6, '0');
  return `${prefix}${nextSequence}`;
}
