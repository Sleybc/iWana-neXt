import { AppDataSource, runInTenantSchema } from '../data-source';

/**
 * CLI de reparación de referencias colgantes de idempotencia de subida de
 * evidencia de OT (MOD11 / ADR-068).
 *
 * Problema diagnosticado: la purga de retención (`purge_execution_order_retention_batch`,
 * migración tenant 095) borra intents expirados de
 * `execution_order_evidence_upload_intents` sin importar referencias. Un
 * registro de `execution_order_idempotency_records` de la operación de subida
 * cuyo `resource_ref` apuntaba a ese intent queda colgante: el replay devuelve
 * 409 `EVIDENCE_UPLOAD_IN_PROGRESS` de forma permanente hasta que el registro
 * expire (90 días). No hay producción todavía: los datos colgantes son
 * no-productivos y la decisión aprobada es REPARARLOS con este script, no
 * construir una capa de compatibilidad.
 *
 * Estrategia: marcar el registro colgante como terminal/vencido (tombstone) y
 * limpiar `resource_ref`. Así el siguiente replay recibe `IDEMPOTENCY_EXPIRED`
 * (409) y el cliente puede reintentar con una clave nueva, en lugar de un
 * `EVIDENCE_UPLOAD_IN_PROGRESS` sin salida. No se tocan intents.
 *
 * Flags:
 *   --schema <name>   Schema de tenant a inspeccionar (obligatorio).
 *   --dry-run         Solo conteos, sin escritura (comportamiento por defecto).
 *   --apply           Única vía de escritura.
 *   --help            Muestra el uso y sale sin tocar la base de datos.
 */

type EvidenceReconcileCounts = {
  examined: number;
  dangling: number;
  alreadyTerminal: number;
};

/**
 * Operación de subida de asset de evidencia usada por
 * `ExecutionOrdersService.createEvidenceAssetReceipt`/`finishCommand`
 * (apps/api/src/modules/tasks/services/execution-orders.service.ts) al
 * reservar la clave de idempotencia y al completarla. No existe constante
 * exportada en el código de tasks: se replica el literal real
 * `'execution_order.evidence_asset'` para no inventar criterios.
 */
const EVIDENCE_UPLOAD_OPERATION = 'execution_order.evidence_asset';

/**
 * Estado terminal coherente con `ExecutionOrderReliabilityService.completeIdempotency`,
 * cuyo set terminal es ['COMPLETED', 'FAILED', 'REJECTED']. Se elige REJECTED
 * y no FAILED porque FAILED semánticamente corresponde al intent (`EVIDENCE_UPLOAD_FAILED`);
 * aquí la reserva queda anulada por reparación y el replay debe fallar cerrado
 * con IDEMPOTENCY_EXPIRED, no como fallo de negocio.
 */
const TERMINAL_RESULT_STATUS = 'REJECTED';

const SCHEMA_NAME_PATTERN = /^[a-z0-9_]+$/;

/** Prefijo de log del CLI, consistente con reconcile-visit-request-statuses.ts. */
const LOG_PREFIX = '[RECONCILE-EVIDENCE]';

function printUsage(): void {
  console.log(
    [
      'Uso: node dist/cli/reconcile-evidence-upload-idempotency.js --schema <name> [--dry-run | --apply]',
      '',
      'Repara registros de idempotencia de subida de evidencia (OT) cuyo',
      'resource_ref apunta a un intent ya purgado por retención.',
      '',
      'Flags:',
      '  --schema <name>   Schema de tenant a inspeccionar (obligatorio, regex [a-z0-9_]+).',
      '  --dry-run         Solo imprime conteos, sin escribir (por defecto).',
      '  --apply           Marca los registros colgantes como terminales y limpia resource_ref.',
      '  --help            Muestra esta ayuda y sale.',
      '',
      'Rechazado en NODE_ENV=production.',
    ].join('\n'),
  );
}

function parseArgs(args: string[]): { schemaName: string | undefined; apply: boolean } {
  const apply = args.includes('--apply');
  const dryRun = args.includes('--dry-run');
  if (apply && dryRun) {
    throw new Error('Flags --apply y --dry-run son mutuamente excluyentes.');
  }
  const schemaIndex = args.indexOf('--schema');
  const schemaName = schemaIndex >= 0 ? args[schemaIndex + 1] : undefined;
  return { schemaName, apply };
}

/**
 * SQL de conteos para la operación de subida de evidencia. Un registro se
 * considera colgante cuando tiene resource_ref, no está tombstoned ni
 * expirado, y el intent referenciado ya no existe en el mismo schema
 * (purga de retención). La comparación `i.id::text = r.resource_ref` evita
 * errores de cast si algún resource_ref no fuera un UUID válido.
 */
function buildCountsSql(): string {
  return `
    SELECT
      COUNT(*) FILTER (
        WHERE r.resource_ref IS NOT NULL
          AND r.tombstoned_at IS NULL
          AND r.expires_at > NOW()
      )::int AS examined,
      COUNT(*) FILTER (
        WHERE r.resource_ref IS NOT NULL
          AND r.tombstoned_at IS NULL
          AND r.expires_at > NOW()
          AND NOT EXISTS (
            SELECT 1 FROM execution_order_evidence_upload_intents i
            WHERE i.id::text = r.resource_ref
          )
      )::int AS dangling,
      COUNT(*) FILTER (
        WHERE r.tombstoned_at IS NOT NULL OR r.expires_at <= NOW()
      )::int AS already_terminal
    FROM execution_order_idempotency_records r
    WHERE r.operation = '${EVIDENCE_UPLOAD_OPERATION}'
  `;
}

type EvidenceReconcileCountsRow = {
  examined: number;
  dangling: number;
  already_terminal: number;
};

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCounts(rows: unknown): EvidenceReconcileCounts {
  const first = Array.isArray(rows)
    ? (rows[0] as Partial<EvidenceReconcileCountsRow> | undefined)
    : undefined;
  return {
    examined: toCount(first?.examined),
    dangling: toCount(first?.dangling),
    alreadyTerminal: toCount(first?.already_terminal),
  };
}

/**
 * Marca como terminales/vencidos los registros colgantes de la operación de
 * subida de evidencia. Decisión de marcado coherente con el service de tasks:
 * - `tombstoned_at = NOW()`: `beginIdempotent` falla cerrado con
 *   IDEMPOTENCY_EXPIRED si `tombstonedAt` está seteado o `expiresAt <= now`
 *   (execution-order-reliability.service.ts); el tombstone es la señal
 *   autoritativa de anulación para el replay.
 * - `result_status = 'REJECTED'`: estado terminal del vocabulario de
 *   `completeIdempotency` (['COMPLETED','FAILED','REJECTED']).
 * - `resource_ref = NULL`: la referencia ya no existe; sin ella el registro
 *   queda consistente y el replay no vuelve a buscar el intent.
 * - `expires_at` NO se toca: el tombstone ya bloquea el replay y conservar el
 *   vencimiento original preserva la retención de 90 días (la purga de la
 *   migración 095 recoge el registro en su vencimiento original porque
 *   result_status <> 'PENDING').
 */
function buildApplySql(): string {
  // SELECT COUNT sobre CTE data-modifying: el driver pg devuelve
  // [rows, rowCount] para UPDATE...RETURNING, así que contar filas devueltas
  // sería ambiguo; este patrón (como en reconcile-visit-request-statuses.ts)
  // entrega un resultado determinista de una sola fila.
  return `
    WITH dangling AS (
      SELECT r.id
      FROM execution_order_idempotency_records r
      WHERE r.operation = '${EVIDENCE_UPLOAD_OPERATION}'
        AND r.resource_ref IS NOT NULL
        AND r.tombstoned_at IS NULL
        AND r.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM execution_order_evidence_upload_intents i
          WHERE i.id::text = r.resource_ref
        )
    ),
    updated AS (
      UPDATE execution_order_idempotency_records target
      SET result_status = '${TERMINAL_RESULT_STATUS}',
          tombstoned_at = NOW(),
          resource_ref = NULL
      FROM dangling
      WHERE target.id = dangling.id
      RETURNING 1
    )
    SELECT COUNT(*)::int AS fixed_count
    FROM updated
  `;
}

async function runSchemaReconcile(
  schemaName: string,
  apply: boolean,
): Promise<{ counts: EvidenceReconcileCounts; fixed: number }> {
  // UNA transacción con SET LOCAL search_path (patrón multi-tenant del repo;
  // pgBouncer no persiste search_path entre transacciones).
  return runInTenantSchema(AppDataSource, schemaName, async (qr) => {
    const counts = normalizeCounts(await qr.query(buildCountsSql()));

    let fixed = 0;
    if (apply && counts.dangling > 0) {
      const updated = (await qr.query(buildApplySql())) as Array<{ fixed_count: number }>;
      fixed = toCount(updated[0]?.fixed_count);
    }

    return { counts, fixed };
  });
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // --help no requiere base de datos ni schema: imprime el uso y sale.
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (process.env['NODE_ENV'] === 'production') {
    console.error(
      `${LOG_PREFIX} Rechazado: NODE_ENV=production. ` +
        `Este CLI repara datos no-productivos y no debe ejecutarse en producción.`,
    );
    process.exit(1);
  }

  let schemaName: string | undefined;
  let apply: boolean;
  try {
    ({ schemaName, apply } = parseArgs(rawArgs));
  } catch (error) {
    console.error(`${LOG_PREFIX} ${error instanceof Error ? error.message : String(error)}`);
    printUsage();
    process.exit(1);
  }

  if (!schemaName) {
    console.error(`${LOG_PREFIX} Falta el flag obligatorio --schema <name>.`);
    printUsage();
    process.exit(1);
  }

  // Validación estricta ANTES de cualquier interpolación SQL.
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    console.error(
      `${LOG_PREFIX} Schema name inválido: "${schemaName}". Solo se aceptan [a-z0-9_]+.`,
    );
    process.exit(1);
  }

  let exitCode = 0;
  await AppDataSource.initialize();

  try {
    const mode = apply ? 'apply' : 'dry-run';
    console.log(
      `${LOG_PREFIX} Iniciando saneamiento de evidencia (modo ${mode}) en schema "${schemaName}"`,
    );

    const { counts, fixed } = await runSchemaReconcile(schemaName, apply);

    console.log(
      `${LOG_PREFIX} ${schemaName}: examinados=${counts.examined} colgantes=${counts.dangling} ` +
        `ya_terminales=${counts.alreadyTerminal}`,
    );
    if (apply) {
      console.log(
        `${LOG_PREFIX} ${schemaName}: ${fixed} registro(s) marcado(s) terminal y resource_ref limpiado`,
      );
    } else {
      console.log(
        `${LOG_PREFIX} ${schemaName}: ${counts.dangling} registro(s) se marcarían terminal con --apply`,
      );
    }

    // Salida machine-readable (solo conteos, sin ids/emails/payloads) para archivar.
    const summary: Record<string, number | string | boolean> = {
      schema: schemaName,
      dryRun: !apply,
      examined: counts.examined,
      dangling: counts.dangling,
      alreadyTerminal: counts.alreadyTerminal,
    };
    if (apply) summary['fixed'] = fixed;
    console.log(`${LOG_PREFIX} RESUMEN ${JSON.stringify(summary)}`);

    console.log(`${LOG_PREFIX} Saneamiento completado sin errores (${mode})`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fatal:`, error);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }

  process.exit(exitCode);
}

main();
