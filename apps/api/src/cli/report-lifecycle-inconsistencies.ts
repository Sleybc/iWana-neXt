/** Reporte de inconsistencias históricas de estado para un tenant. Siempre es de solo lectura. */
import { resolve } from 'node:path';
import { AppDataSource, isValidSchemaName, runInTenantSchema } from '@iwana/db';
import type { DataSource, QueryRunner } from 'typeorm';
import { SubscriberStatus } from '@iwana/shared';
import { ContractStatus } from '../modules/crm/enums/contract-status.enum';
import { deriveSubscriberStatusFromContracts } from '../modules/crm/subscribers/subscriber-lifecycle.util';

interface LifecycleStatusCountRow {
  subscriber_id: string;
  subscriber_status: SubscriberStatus;
  activated_at: Date | string | null;
  contract_status: ContractStatus | null;
  contract_count: number;
}

interface SubscriberLifecycleAccumulator {
  subscriberId: string;
  currentStatus: SubscriberStatus;
  activatedAt: Date | string | null;
  contractStatuses: ContractStatus[];
  contractsByStatus: Partial<Record<ContractStatus, number>>;
}

export interface LifecycleInconsistency {
  subscriberId: string;
  currentStatus: SubscriberStatus;
  derivedStatus: SubscriberStatus;
  contractsByStatus: Partial<Record<ContractStatus, number>>;
}

export interface LifecycleInconsistencyReport {
  subscribersScanned: number;
  inconsistenciesFound: number;
  inconsistencies: LifecycleInconsistency[];
}

export interface LifecycleInconsistencyArgs {
  tenant: string | null;
  help: boolean;
}

const LIFECYCLE_STATUS_COUNTS_SQL = `
  SELECT s.id::text AS subscriber_id,
         s.status::text AS subscriber_status,
         s.activated_at,
         c.status::text AS contract_status,
         COUNT(c.id)::int AS contract_count
    FROM subscribers s
    LEFT JOIN contracts c
      ON c.subscriber_id = s.id
     AND c.deleted_at IS NULL
   WHERE s.deleted_at IS NULL
   GROUP BY s.id, s.status, s.activated_at, c.status
   ORDER BY s.id, c.status
`;

/** Lee estado y conteos de contratos del schema tenant y deriva con la función de B1. */
export async function analyzeLifecycleInconsistencies(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<LifecycleInconsistencyReport> {
  const rows = (await queryRunner.query(LIFECYCLE_STATUS_COUNTS_SQL)) as LifecycleStatusCountRow[];
  const subscribers = new Map<string, SubscriberLifecycleAccumulator>();

  for (const row of rows) {
    let subscriber = subscribers.get(row.subscriber_id);
    if (!subscriber) {
      subscriber = {
        subscriberId: row.subscriber_id,
        currentStatus: row.subscriber_status,
        activatedAt: row.activated_at,
        contractStatuses: [],
        contractsByStatus: {},
      };
      subscribers.set(row.subscriber_id, subscriber);
    }

    if (row.contract_status === null || row.contract_count < 1) continue;

    subscriber.contractsByStatus[row.contract_status] = row.contract_count;
    // La regla de B1 consulta presencia por estado; cada fila agrupada aporta uno.
    subscriber.contractStatuses.push(row.contract_status);
  }

  const inconsistencies: LifecycleInconsistency[] = [];
  for (const subscriber of subscribers.values()) {
    const derivedStatus = deriveSubscriberStatusFromContracts(
      subscriber.currentStatus,
      subscriber.activatedAt,
      subscriber.contractStatuses,
    );
    if (derivedStatus === subscriber.currentStatus) continue;

    inconsistencies.push({
      subscriberId: subscriber.subscriberId,
      currentStatus: subscriber.currentStatus,
      derivedStatus,
      contractsByStatus: subscriber.contractsByStatus,
    });
  }

  return {
    subscribersScanned: subscribers.size,
    inconsistenciesFound: inconsistencies.length,
    inconsistencies,
  };
}

export async function reportLifecycleInconsistenciesInTenant(
  dataSource: DataSource,
  schemaName: string,
): Promise<LifecycleInconsistencyReport> {
  if (!isValidSchemaName(schemaName)) {
    throw new Error('Schema tenant inválido.');
  }
  return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
    analyzeLifecycleInconsistencies(queryRunner),
  );
}

export function parseLifecycleInconsistencyArgs(argv: string[]): LifecycleInconsistencyArgs {
  let tenant: string | null = null;
  let tenantSeen = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg.startsWith('--tenant=')) {
      if (tenantSeen) throw new Error('Usa --tenant una sola vez.');
      tenantSeen = true;
      tenant = arg.slice('--tenant='.length).trim();
      if (!tenant) throw new Error('--tenant requiere un id o slug.');
      if (tenant.includes('=')) throw new Error('--tenant acepta un solo id o slug.');
    } else {
      throw new Error(`Argumento desconocido: ${arg.split('=')[0]}`);
    }
  }

  return { tenant, help };
}

function ensureCliEnvLoaded(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (!loadEnvFile) return;
  const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // Los archivos locales pueden faltar en CI o en producción.
    }
  }
}

async function resolveTenantSchema(
  dataSource: DataSource,
  tenantRef: string,
): Promise<{ id: string; schemaName: string }> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    tenantRef,
  );
  const rows = isUuid
    ? await dataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
        [tenantRef],
      )
    : await dataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [tenantRef],
      );
  const tenant = (rows as Array<{ id: string; schema_name: string; status: string }>)[0];
  if (!tenant || tenant.status !== 'ACTIVE' || !isValidSchemaName(tenant.schema_name)) {
    throw new Error('Tenant inexistente, inactivo o con schema inválido.');
  }
  return { id: tenant.id, schemaName: tenant.schema_name };
}

function printHelp(): void {
  process.stdout.write(
    `Reporte de inconsistencias del ciclo de vida (solo lectura)\n\n` +
      `Uso: pnpm --filter @iwana/api exec node dist/cli/report-lifecycle-inconsistencies.js --tenant=<id|slug>\n\n` +
      `--tenant  UUID o slug de un tenant ACTIVE.\n` +
      `El comando siempre simula; no tiene modo de escritura.\n`,
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parseLifecycleInconsistencyArgs(process.argv.slice(2));
  if (flags.help) return printHelp();
  if (!flags.tenant) throw new Error('Debes indicar --tenant=<id|slug>.');

  await AppDataSource.initialize();
  try {
    const tenant = await resolveTenantSchema(AppDataSource, flags.tenant);
    const report = await reportLifecycleInconsistenciesInTenant(AppDataSource, tenant.schemaName);
    process.stdout.write(
      `${JSON.stringify({ tenantId: tenant.id, simulation: true, ...report }, null, 2)}\n`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write(
      '[LIFECYCLE-REPORT] No se pudo generar el reporte. Revisa la configuración del tenant y de la base de datos.\n',
    );
    process.exitCode = 1;
  });
}
