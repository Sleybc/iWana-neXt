import { Logger } from '@nestjs/common';
import { isValidSchemaName, summarizeErrorForLog } from '@iwana/db';

const logger = new Logger('TenantSweep');

/**
 * Empresas que recorre un barrido multiempresa del worker: solo `ACTIVE` y no retiradas.
 *
 * `ACTIVE` es el único estado cuyo schema pasó completo por el runner de migraciones; una
 * empresa retirada (`deleted_at`) puede tener el schema ya purgado. Es la fuente del filtro para
 * los barridos que solo deben tocar empresas vigentes (agenda, evidencias, tombstone, refresh
 * tokens, muestreo de uso y la consulta de flota del aprovisionador). Tres recorridos usan otro
 * filtro a propósito, y cada uno lo explica junto a su consulta: el barrido de medios de
 * contratos, el relay de OT y el re-escaneo de inventario, que también atienden a empresas
 * suspendidas o inactivas.
 */
export const SWEEPABLE_TENANTS_SQL =
  "SELECT id::text AS id, schema_name FROM public.tenants WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name";

export interface SweepTenant {
  id: string;
  schemaName: string;
}

/** Cliente de `pg` (devuelve `{ rows }`) o `DataSource`/`QueryRunner` de TypeORM (devuelve filas). */
export interface TenantQueryExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/**
 * Lista las empresas vigentes, tal cual están en `public.tenants`. No valida el schema: eso lo
 * hace `runTenantSweep` antes de tocarlo, y un schema inválido cuenta como fallo de esa empresa
 * (nunca se omite en silencio ni se interpola).
 */
export async function listSweepableTenants(executor: TenantQueryExecutor): Promise<SweepTenant[]> {
  const result = await executor.query(SWEEPABLE_TENANTS_SQL);
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] } | undefined)?.rows ?? []);
  return (rows as Array<{ id: unknown; schema_name: unknown }>).map((row) => ({
    id: String(row.id),
    schemaName: String(row.schema_name),
  }));
}

/** Código del fallo de una empresa cuyo `schema_name` no pasa `isValidSchemaName`. */
export const TENANT_SCHEMA_INVALID = 'TENANT_SCHEMA_INVALID';

function invalidSchemaError(): Error {
  return Object.assign(new Error(TENANT_SCHEMA_INVALID), { code: TENANT_SCHEMA_INVALID });
}

export interface TenantSweepFailure {
  tenantId: string;
  error: unknown;
}

/** Ids de `public.tenants` (uuid); en pruebas unitarias, cualquier identificador simple. */
const SAFE_TENANT_ID = /^[A-Za-z0-9-]{1,64}$/u;
/** El nombre del barrido es una constante del código; se valida igual antes de persistirlo. */
const SAFE_SWEEP_LABEL = /^[\p{L} ]{1,80}$/u;
/** Tope de empresas nombradas en el motivo: el resto se resume con un conteo. */
const MAX_NAMED_TENANTS = 10;

/**
 * Fallo de un barrido multiempresa que identifica qué empresas fallaron.
 *
 * El mensaje se arma aquí y solo con partes seguras: el id de la empresa (uuid, sin nombre
 * de schema, ADR-114 §7 condición 4) y el resumen de `summarizeErrorForLog` (clase y
 * SQLSTATE, nunca el texto del driver). Por eso `@SanitizeFailedReason` lo conserva tal cual
 * como `failedReason` de BullMQ, y el tablero y Redis muestran la empresa que falló.
 *
 * Extiende `AggregateError`: los errores originales siguen en `errors` para el proceso, pero
 * no se persisten.
 */
export class TenantSweepFailedError extends AggregateError {
  readonly failedTenantIds: readonly string[];

  constructor(sweepLabel: string, failures: readonly TenantSweepFailure[]) {
    const label = SAFE_SWEEP_LABEL.test(sweepLabel) ? sweepLabel : 'barrido multiempresa';
    const named = failures.slice(0, MAX_NAMED_TENANTS).map((failure) => {
      const tenant = SAFE_TENANT_ID.test(failure.tenantId) ? failure.tenantId : 'desconocida';
      return `tenant=${tenant} (${summarizeErrorForLog(failure.error)})`;
    });
    const rest = failures.length - named.length;
    const detail = named.join('; ') + (rest > 0 ? `; y ${rest} más` : '');
    super(
      failures.map((failure) => failure.error),
      `Fallaron ${failures.length} empresa(s) en ${label}: ${detail}`,
    );
    this.name = 'TenantSweepFailedError';
    this.failedTenantIds = failures.map((failure) => failure.tenantId);
  }
}

/**
 * Recorre las empresas en orden, una a la vez, aislando el fallo de cada una: una empresa cuyo
 * schema está incompleto, roto o tiene un nombre inválido no detiene a las demás. Devuelve los
 * resultados de las que terminaron y los fallos; quien llama decide si el job falla
 * (`throwIfTenantSweepFailed`).
 */
export async function runTenantSweep<T>(
  tenants: readonly SweepTenant[],
  perTenant: (tenant: SweepTenant) => Promise<T>,
): Promise<{ results: T[]; failures: TenantSweepFailure[] }> {
  const results: T[] = [];
  const failures: TenantSweepFailure[] = [];
  for (const tenant of tenants) {
    // Un schema inválido es un fallo de esa empresa: no se interpola, las demás siguen y el job
    // termina fallido nombrándola (regla AI-EM-ARCH, 2026-11-22).
    if (!isValidSchemaName(tenant.schemaName)) {
      logger.warn(`[tenant-sweep] Schema inválido: tenant=${tenant.id}`);
      failures.push({ tenantId: tenant.id, error: invalidSchemaError() });
      continue;
    }
    try {
      results.push(await perTenant(tenant));
    } catch (error: unknown) {
      failures.push({ tenantId: tenant.id, error });
    }
  }
  return { results, failures };
}

export function throwIfTenantSweepFailed(
  sweepLabel: string,
  failures: readonly TenantSweepFailure[],
): void {
  if (failures.length > 0) throw new TenantSweepFailedError(sweepLabel, failures);
}

/**
 * Resumen de un error para el log: el de un barrido multiempresa conserva su mensaje (ya saneado,
 * nombra las empresas por id), igual que el `failedReason`; cualquier otro pasa por
 * `summarizeErrorForLog`.
 */
export function describeErrorForLog(error: unknown): string {
  return error instanceof TenantSweepFailedError ? error.message : summarizeErrorForLog(error);
}
