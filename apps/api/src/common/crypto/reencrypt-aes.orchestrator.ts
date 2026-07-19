import { decryptAes256Gcm, encryptAes256Gcm, looksLikeEncryptedAesGcm } from './aes-gcm.util';
import {
  EncryptedColumnTarget,
  PUBLIC_ENCRYPTED_TARGETS,
  TENANT_ENCRYPTED_TARGETS,
} from './reencrypt-aes.targets';

export type ReencryptMode = 'dry-run' | 'apply' | 'verify-active-only';

export type ReencryptOptions = {
  mode: ReencryptMode;
  /** Filtro opcional: un solo schema tenant_* (no aplica a public). */
  schemaFilter?: string | undefined;
  pageSize?: number | undefined;
  activeKey: Buffer;
  previousKey: Buffer | null;
  publicTargets?: readonly EncryptedColumnTarget[];
  tenantTargets?: readonly EncryptedColumnTarget[];
};

export type TargetMetrics = {
  schemaName: string;
  entityType: string;
  candidates: number;
  reencrypted: number;
  skippedAlreadyActive: number;
  skippedMissingTable: number;
  decryptErrors: number;
  verifyFailures: number;
};

export type ReencryptReport = {
  mode: ReencryptMode;
  schemasProcessed: string[];
  targets: TargetMetrics[];
  totals: {
    candidates: number;
    reencrypted: number;
    skippedAlreadyActive: number;
    skippedMissingTable: number;
    decryptErrors: number;
    verifyFailures: number;
    /** Filas que aún requieren recifrado (previous) o fallaron verify. */
    pending: number;
  };
  /** true si conviene exit code ≠ 0. */
  hasBlockingIssues: boolean;
};

export type EncryptedCellRow = {
  id: string;
  value: string;
};

/**
 * Puerto DB inyectable (tests con mocks; CLI con TypeORM QueryRunner).
 * Sin PII en contratos — solo IDs y ciphertext opacos.
 */
export interface ReencryptDbPort {
  listActiveTenantSchemas(): Promise<string[]>;
  tableExists(schemaName: string, table: string): Promise<boolean>;
  fetchEncryptedBatch(
    schemaName: string,
    target: EncryptedColumnTarget,
    offset: number,
    limit: number,
  ): Promise<EncryptedCellRow[]>;
  updateEncryptedValue(
    schemaName: string,
    target: EncryptedColumnTarget,
    id: string,
    newCiphertext: string,
  ): Promise<void>;
}

const IDENT_SAFE = /^[a-z][a-z0-9_]*$/;

function assertSqlIdent(name: string, label: string): void {
  if (!IDENT_SAFE.test(name)) {
    throw new Error(`${label} invalido para SQL: ${name}`);
  }
}

function emptyMetrics(schemaName: string, entityType: string): TargetMetrics {
  return {
    schemaName,
    entityType,
    candidates: 0,
    reencrypted: 0,
    skippedAlreadyActive: 0,
    skippedMissingTable: 0,
    decryptErrors: 0,
    verifyFailures: 0,
  };
}

function sumMetrics(targets: TargetMetrics[]): ReencryptReport['totals'] {
  const totals = {
    candidates: 0,
    reencrypted: 0,
    skippedAlreadyActive: 0,
    skippedMissingTable: 0,
    decryptErrors: 0,
    verifyFailures: 0,
    pending: 0,
  };

  for (const t of targets) {
    totals.candidates += t.candidates;
    totals.reencrypted += t.reencrypted;
    totals.skippedAlreadyActive += t.skippedAlreadyActive;
    totals.skippedMissingTable += t.skippedMissingTable;
    totals.decryptErrors += t.decryptErrors;
    totals.verifyFailures += t.verifyFailures;
  }

  return totals;
}

/**
 * Clasifica ciphertext: legible solo con activa, solo con previous, o error.
 */
export function classifyCiphertext(
  value: string,
  activeKey: Buffer,
  previousKey: Buffer | null,
): 'active' | 'previous' | 'error' | 'not_ciphertext' {
  if (!looksLikeEncryptedAesGcm(value)) {
    return 'not_ciphertext';
  }

  try {
    decryptAes256Gcm(value, activeKey, null);
    return 'active';
  } catch {
    if (!previousKey) {
      return 'error';
    }

    try {
      decryptAes256Gcm(value, previousKey, null);
      return 'previous';
    } catch {
      return 'error';
    }
  }
}

async function processTarget(
  db: ReencryptDbPort,
  schemaName: string,
  target: EncryptedColumnTarget,
  options: ReencryptOptions,
): Promise<TargetMetrics> {
  assertSqlIdent(target.table, 'table');
  assertSqlIdent(target.column, 'column');
  assertSqlIdent(target.idColumn, 'idColumn');

  const metrics = emptyMetrics(schemaName, target.entityType);
  const exists = await db.tableExists(schemaName, target.table);
  if (!exists) {
    metrics.skippedMissingTable = 1;
    return metrics;
  }

  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 200;
  let offset = 0;

  for (;;) {
    const batch = await db.fetchEncryptedBatch(schemaName, target, offset, pageSize);
    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      if (!row.value || (target.requireCiphertextShape && !looksLikeEncryptedAesGcm(row.value))) {
        continue;
      }

      metrics.candidates += 1;

      if (options.mode === 'verify-active-only') {
        try {
          decryptAes256Gcm(row.value, options.activeKey, null);
          metrics.skippedAlreadyActive += 1;
        } catch {
          metrics.verifyFailures += 1;
        }
        continue;
      }

      const kind = classifyCiphertext(row.value, options.activeKey, options.previousKey);

      if (kind === 'active') {
        metrics.skippedAlreadyActive += 1;
        continue;
      }

      if (kind === 'error' || kind === 'not_ciphertext') {
        metrics.decryptErrors += 1;
        continue;
      }

      // kind === 'previous' → recifrar con activa
      try {
        const plaintext = decryptAes256Gcm(row.value, options.activeKey, options.previousKey);
        const nextCipher = encryptAes256Gcm(plaintext, options.activeKey);

        if (options.mode === 'apply') {
          await db.updateEncryptedValue(schemaName, target, row.id, nextCipher);
        }

        metrics.reencrypted += 1;
      } catch {
        metrics.decryptErrors += 1;
      }
    }

    if (batch.length < pageSize) {
      break;
    }

    offset += batch.length;
  }

  return metrics;
}

/**
 * Orquestador de recifrado / verificación AES-256-GCM por schema.
 * Dry-run por defecto (mode !== 'apply' no escribe).
 */
export async function runReencryptAes(
  db: ReencryptDbPort,
  options: ReencryptOptions,
): Promise<ReencryptReport> {
  const publicTargets = options.publicTargets ?? PUBLIC_ENCRYPTED_TARGETS;
  const tenantTargets = options.tenantTargets ?? TENANT_ENCRYPTED_TARGETS;
  const schemasProcessed: string[] = [];
  const targets: TargetMetrics[] = [];

  const schemaFilter = options.schemaFilter?.trim();

  // Public: sin filtro, o --schema=public
  if (!schemaFilter || schemaFilter === 'public') {
    schemasProcessed.push('public');
    for (const target of publicTargets) {
      targets.push(await processTarget(db, 'public', target, options));
    }
  }

  // Tenants: sin filtro, o --schema=tenant_*
  if (!schemaFilter || schemaFilter !== 'public') {
    const allSchemas = await db.listActiveTenantSchemas();
    const schemas = schemaFilter ? allSchemas.filter((s) => s === schemaFilter) : allSchemas;

    if (schemaFilter && schemaFilter !== 'public' && schemas.length === 0) {
      throw new Error(
        `Schema tenant no encontrado o no ACTIVE: ${schemaFilter}. Use un schema_name de public.tenants.`,
      );
    }

    for (const schemaName of schemas) {
      schemasProcessed.push(schemaName);
      for (const target of tenantTargets) {
        targets.push(await processTarget(db, schemaName, target, options));
      }
    }
  }

  const totals = sumMetrics(targets);

  if (options.mode === 'verify-active-only') {
    totals.pending = totals.verifyFailures + totals.decryptErrors;
  } else if (options.mode === 'apply') {
    // Tras apply: pendientes = errores de descifrado (no se pudieron recifrar)
    totals.pending = totals.decryptErrors;
  } else {
    // dry-run: pendientes recuperables = previous que se recifrarían + errores
    totals.pending = totals.reencrypted + totals.decryptErrors;
  }

  // apply/verify: exit ≠ 0 si quedan fallos. dry-run: exit ≠ 0 solo ante decrypt_errors
  // (candidatas previous no bloquean dry-run — son el trabajo esperado de --apply).
  const hasBlockingIssues =
    options.mode === 'verify-active-only'
      ? totals.verifyFailures > 0 || totals.decryptErrors > 0
      : options.mode === 'apply'
        ? totals.decryptErrors > 0
        : totals.decryptErrors > 0;

  return {
    mode: options.mode,
    schemasProcessed,
    targets,
    totals: {
      ...totals,
      pending: totals.pending,
    },
    hasBlockingIssues,
  };
}

/** Formatea reporte JSON-safe sin PII (solo conteos / entityType / schema). */
export function formatReencryptReport(report: ReencryptReport): string {
  const lines: string[] = [
    `[REENCRYPT] mode=${report.mode}`,
    `[REENCRYPT] schemas=${report.schemasProcessed.length} [${report.schemasProcessed.join(', ')}]`,
    `[REENCRYPT] totals candidates=${report.totals.candidates} reencrypted=${report.totals.reencrypted} skipped_active=${report.totals.skippedAlreadyActive} decrypt_errors=${report.totals.decryptErrors} verify_failures=${report.totals.verifyFailures} pending=${report.totals.pending} missing_table_targets=${report.totals.skippedMissingTable}`,
  ];

  for (const t of report.targets) {
    if (
      t.candidates === 0 &&
      t.skippedMissingTable === 0 &&
      t.decryptErrors === 0 &&
      t.verifyFailures === 0
    ) {
      continue;
    }

    lines.push(
      `[REENCRYPT] ${t.schemaName}/${t.entityType}: candidates=${t.candidates} reencrypted=${t.reencrypted} skipped_active=${t.skippedAlreadyActive} decrypt_errors=${t.decryptErrors} verify_failures=${t.verifyFailures}${t.skippedMissingTable ? ' table_missing=1' : ''}`,
    );
  }

  lines.push(`[REENCRYPT] blocking=${report.hasBlockingIssues ? 'yes' : 'no'}`);

  return lines.join('\n');
}
