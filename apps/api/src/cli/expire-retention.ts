import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource, AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { sanitizeAuditPayload } from '../modules/audit/audit-sanitize.policy';
import { CrmContractStandingReadAdapter } from '../modules/crm/privacy-adapters/crm-contract-standing-read.adapter';
import { BillingStandingReadAdapter } from '../modules/billing/privacy/billing-standing-read.adapter';
import { PqrRetentionReadAdapter } from '../modules/assurance/privacy/pqr-retention-read.adapter';
import { ConservationDutyService } from '../modules/privacy/retention/conservation-duty.service';
import {
  RETENTION_EXPIRY_SYSTEM_ACTOR,
  RetentionExpiryService,
} from '../modules/privacy/retention/retention-expiry.service';
import {
  RetentionAuditPort,
  type RetentionAuditEntry,
} from '../modules/privacy/retention/retention-audit.port';
import {
  createErasureAdapter,
  ensureCliEnvLoaded,
  resolveTenantSchema,
  runRolledBackInTenantSchema,
  runWithCliTenant,
} from './anonymize-titular';

export type ExpireRetentionMode = 'dry-run' | 'apply' | 'verify-only';

export interface ExpireRetentionFlags {
  tenant: string | null;
  mode: ExpireRetentionMode;
  help: boolean;
}

export class ExpireRetentionCliError extends Error {}

/**
 * Códigos de salida del CLI (B4-R2 B-5). `--apply` nunca sale en 0 si el
 * barrido deja objetivos en ATTENTION_REQUIRED o FAILED en el ledger.
 * `--verify-only` conserva 1 cuando el tenant no queda conciliado.
 */
export const EXPIRE_RETENTION_EXIT = {
  OK: 0,
  ERROR: 1,
  ATTENTION_REQUIRED: 2,
} as const;

export interface ExpireRetentionBatchSummary {
  status: 'CONTINUE' | 'COMPLETE' | 'ATTENTION_REQUIRED';
  counts: { failed: number };
}

/** Código de salida de `--apply`: basta un lote con atención o fallos para no salir en 0. */
export function expireRetentionApplyExitCode(
  batches: ReadonlyArray<ExpireRetentionBatchSummary>,
): number {
  const needsAttention = batches.some(
    (batch) => batch.status === 'ATTENTION_REQUIRED' || batch.counts.failed > 0,
  );
  return needsAttention ? EXPIRE_RETENTION_EXIT.ATTENTION_REQUIRED : EXPIRE_RETENTION_EXIT.OK;
}

/**
 * Parsea `expire-retention`. Dry-run por defecto; `--apply` y `--verify-only`
 * son excluyentes. `--tenant <uuid|slug>` siempre obligatorio salvo `--help`.
 */
export function parseExpireRetentionArgs(argv: string[]): ExpireRetentionFlags {
  const flags: ExpireRetentionFlags = { tenant: null, mode: 'dry-run', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--apply') {
      if (flags.mode === 'verify-only') {
        throw new ExpireRetentionCliError('--apply y --verify-only son excluyentes.');
      }
      flags.mode = 'apply';
      continue;
    }
    if (arg === '--verify-only') {
      if (flags.mode === 'apply') {
        throw new ExpireRetentionCliError('--apply y --verify-only son excluyentes.');
      }
      flags.mode = 'verify-only';
      continue;
    }
    if (arg === '--tenant' || arg.startsWith('--tenant=')) {
      if (flags.tenant) throw new ExpireRetentionCliError('--tenant no se puede repetir.');
      const value = arg === '--tenant' ? (argv[index + 1] ?? '') : arg.slice('--tenant='.length);
      if (arg === '--tenant') index += 1;
      if (!value) throw new ExpireRetentionCliError('Debes indicar --tenant <uuid|slug>.');
      flags.tenant = value;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new ExpireRetentionCliError(`Opción desconocida: ${arg}.`);
    }
    throw new ExpireRetentionCliError(`Argumento inesperado: ${arg}.`);
  }
  if (flags.help) return flags;
  if (!flags.tenant) throw new ExpireRetentionCliError('Debes indicar --tenant <uuid|slug>.');
  return flags;
}

/**
 * Auditoría del CLI sobre el mismo `manager`: las filas que deja son las
 * mismas que deja el job, para que ambos produzcan los mismos efectos.
 */
class CliRetentionAuditPort extends RetentionAuditPort {
  async logWithin(entry: RetentionAuditEntry, manager: EntityManager): Promise<void> {
    const logEntry = manager.create(AuditLog, {
      tenantId: TenantContext.getOrThrow().tenantId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: sanitizeAuditPayload(null),
      newValue: sanitizeAuditPayload(entry.newValue),
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
    await manager.save(AuditLog, logEntry);
  }
}

function createExpiryService(): RetentionExpiryService {
  const config = new ConfigService(process.env);
  const standing = new CrmContractStandingReadAdapter();
  const billing = new BillingStandingReadAdapter();
  const pqr = new PqrRetentionReadAdapter();
  const duty = new ConservationDutyService(standing, billing, pqr);
  return new RetentionExpiryService(
    duty,
    standing,
    createErasureAdapter(config),
    new CliRetentionAuditPort(),
    pqr,
  );
}

function printHelp(): void {
  process.stdout.write(
    'Uso: pnpm --filter @iwana/api privacy:expire-retention --tenant <uuid|slug> [--apply | --verify-only]\n' +
      '\n' +
      '  Sin modo: dry-run. Previsualiza elegibles y, aparte, no conciliados con su código.\n' +
      '  --apply: ejecuta el barrido por lotes hasta COMPLETE o ATTENTION_REQUIRED.\n' +
      '  --verify-only: solo lectura, siempre revierte; informa si el tenant quedó conciliado.\n' +
      '  La salida es JSON con conteos, sin datos personales.\n' +
      '  Salida: 0 sin pendientes; 1 error o tenant no conciliado (--verify-only);\n' +
      '  2 si --apply dejó objetivos en ATTENTION_REQUIRED o FAILED.\n',
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parseExpireRetentionArgs(process.argv.slice(2));
  if (flags.help) return printHelp();
  if (!flags.tenant) throw new ExpireRetentionCliError('Debes indicar --tenant <uuid|slug>.');

  await AppDataSource.initialize();
  try {
    const tenant = await resolveTenantSchema(AppDataSource, flags.tenant, {
      anyStatus: flags.mode === 'verify-only',
    });
    const service = createExpiryService();

    if (flags.mode === 'verify-only') {
      const verification = await runRolledBackInTenantSchema(
        AppDataSource,
        tenant.schemaName,
        (queryRunner) =>
          runWithCliTenant(queryRunner, tenant.schemaName, () =>
            service.verifyTenant(queryRunner.manager),
          ),
      );
      process.stdout.write(`${JSON.stringify({ mode: flags.mode, ...verification }, null, 2)}\n`);
      if (!verification.tenantConciliado) process.exitCode = EXPIRE_RETENTION_EXIT.ERROR;
      return;
    }

    if (flags.mode === 'dry-run') {
      const preview = await runRolledBackInTenantSchema(
        AppDataSource,
        tenant.schemaName,
        (queryRunner) =>
          runWithCliTenant(queryRunner, tenant.schemaName, () =>
            service.previewTenant(queryRunner.manager),
          ),
      );
      process.stdout.write(`${JSON.stringify({ mode: flags.mode, ...preview }, null, 2)}\n`);
      return;
    }

    const runId = randomUUID();
    let cursor: {
      phase: 'TITULAR' | 'PROSPECTO' | 'SOLICITUD';
      eligibleOn: string;
      id: string;
    } | null = null;
    const batches: Array<
      ExpireRetentionBatchSummary & { reasonCounts: Record<string, number | undefined> }
    > = [];
    for (let batch = 0; batch < 1000; batch += 1) {
      const result = await runInTenantSchema(AppDataSource, tenant.schemaName, (queryRunner) =>
        runWithCliTenant(queryRunner, tenant.schemaName, () =>
          service.runTenantBatch(queryRunner.manager, {
            actorId: RETENTION_EXPIRY_SYSTEM_ACTOR,
            runId,
            cursor,
          }),
        ),
      );
      batches.push({
        status: result.status,
        counts: result.counts,
        reasonCounts: result.reasonCounts,
      });
      if (result.status !== 'CONTINUE' || !result.nextCursor) {
        process.stdout.write(
          `${JSON.stringify({ mode: flags.mode, runId, final: result.status, batches }, null, 2)}\n`,
        );
        process.exitCode = expireRetentionApplyExitCode(batches);
        return;
      }
      cursor = result.nextCursor;
    }
    throw new ExpireRetentionCliError('El barrido no terminó en 1000 lotes; requiere revisión.');
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message =
      error instanceof ExpireRetentionCliError
        ? error.message
        : 'La operación no se completó. No se exponen detalles sensibles; verifica la conexión y el alcance operativo.';
    process.stderr.write(`[PRIVACY-EXPIRE-RETENTION] ${message}\n`);
    process.exitCode = EXPIRE_RETENTION_EXIT.ERROR;
  });
}
