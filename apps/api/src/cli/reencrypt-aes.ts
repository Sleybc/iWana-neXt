/**
 * CLI de recifrado AES-256-GCM (ADR-058 / rotación MFA_ENCRYPTION_KEY).
 *
 * Uso (tras build de @iwana/api):
 *
 *   # Dry-run (default, sin escritura)
 *   pnpm --filter @iwana/api encryption:reencrypt
 *
 *   # Aplicar recifrado
 *   pnpm --filter @iwana/api encryption:reencrypt -- --apply
 *
 *   # Verificar legibilidad solo con clave activa (paso 6 runbook)
 *   pnpm --filter @iwana/api encryption:reencrypt -- --verify-active-only
 *
 *   # Filtrar un schema tenant
 *   pnpm --filter @iwana/api encryption:reencrypt -- --schema=tenant_demo
 *
 * Credenciales DB: resolveMigrationDbCredentials (DB_MIGRATOR_* preferido).
 * Claves: MFA_ENCRYPTION_KEY (+ MFA_ENCRYPTION_KEY_PREVIOUS en ventana de rotación).
 *
 * Logs: solo conteos, schema names, entityType — sin PII.
 */

import { resolve } from 'path';
import { AppDataSource, isValidSchemaName } from '@iwana/db';
import { ConfigService } from '@nestjs/config';
import { isWeakMfaEncryptionKeyHex, parseEncryptionKeyHex } from '../common/crypto/aes-gcm.util';
import { TypeOrmReencryptDbAdapter } from '../common/crypto/reencrypt-aes.db-adapter';
import {
  formatReencryptReport,
  ReencryptMode,
  runReencryptAes,
} from '../common/crypto/reencrypt-aes.orchestrator';
import {
  EncryptedColumnTarget,
  REENCRYPT_INVENTORY_GAPS,
  TENANT_ENCRYPTED_TARGETS,
} from '../common/crypto/reencrypt-aes.targets';
import {
  formatMfaToPiiReport,
  listEligiblePiiTenantSchemas,
  loadMfaToPiiKeys,
  PII_ENCRYPTED_TARGETS,
  runMfaToPii,
} from './reencrypt-aes.pii';

/**
 * Carga `.env*` del workspace sin early-return por DB_* (data-source puede
 * haber salido antes de leer MFA_ENCRYPTION_KEY si DB ya estaba en process.env).
 */
function ensureCliEnvLoaded(): void {
  const loadEnvFile = (
    process as NodeJS.Process & {
      loadEnvFile?: (path?: string) => void;
    }
  ).loadEnvFile;

  if (!loadEnvFile) {
    return;
  }

  // dist/cli → apps/api → repo root
  const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // archivo ausente
    }
  }
}

export type CliFlags = {
  apply: boolean;
  verifyActiveOnly: boolean;
  mfaToPii: boolean;
  verifyPiiOnly: boolean;
  schema?: string | undefined;
  pageSize: number;
  help: boolean;
};

export function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    apply: false,
    verifyActiveOnly: false,
    mfaToPii: false,
    verifyPiiOnly: false,
    pageSize: 200,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--apply' || arg === '--write') {
      flags.apply = true;
      continue;
    }
    if (arg === '--verify-active-only') {
      flags.verifyActiveOnly = true;
      continue;
    }
    if (arg === '--mfa-to-pii') {
      flags.mfaToPii = true;
      continue;
    }
    if (arg === '--verify-pii-only') {
      flags.verifyPiiOnly = true;
      continue;
    }
    if (arg.startsWith('--schema=')) {
      flags.schema = arg.slice('--schema='.length).trim();
      continue;
    }
    if (arg.startsWith('--page-size=')) {
      const n = Number.parseInt(arg.slice('--page-size='.length), 10);
      if (Number.isFinite(n) && n > 0) {
        flags.pageSize = n;
      }
      continue;
    }

    console.error('[REENCRYPT] Flag desconocida; usa --help para ver las opciones.');
    flags.help = true;
  }

  return flags;
}

/** Valida combinaciones del CLI y acota los modos PII a un schema tenant. */
export function validateCliFlags(flags: CliFlags): string | null {
  if (
    (flags.apply && (flags.verifyActiveOnly || flags.verifyPiiOnly)) ||
    (flags.verifyActiveOnly && flags.verifyPiiOnly) ||
    (flags.mfaToPii && (flags.verifyActiveOnly || flags.verifyPiiOnly))
  ) {
    return 'Combinacion de flags incompatible.';
  }

  if (flags.mfaToPii || flags.verifyPiiOnly) {
    const schema = flags.schema?.trim();
    if (!schema) {
      return 'Los modos PII requieren --schema=<tenant>.';
    }
    if (!isValidSchemaName(schema)) {
      return 'Los modos PII solo aceptan un schema tenant.';
    }
  } else if (
    flags.schema !== undefined &&
    flags.schema.trim() !== 'public' &&
    !isValidSchemaName(flags.schema.trim())
  ) {
    return 'El valor de --schema no es válido.';
  }

  return null;
}

/** Omite del ciclo MFA las columnas CRM que K2 migra a la clave PII. */
export function getMfaTenantTargets(): readonly EncryptedColumnTarget[] {
  const piiColumns = new Set(
    PII_ENCRYPTED_TARGETS.map(({ table, column }) => `${table}.${column}`),
  );
  return TENANT_ENCRYPTED_TARGETS.filter(
    ({ table, column }) => !piiColumns.has(`${table}.${column}`),
  );
}

/** Evita que errores del orquestador reflejen schemas explícitos no registrados. */
export function assertRegisteredMfaTenantSchema(
  schema: string,
  activeSchemas: readonly string[],
): void {
  if (!activeSchemas.includes(schema)) {
    throw new Error('Schema tenant no registrado o no ACTIVE.');
  }
}

export function formatStartupLog(mode: ReencryptMode | 'verify-pii-only', schema?: string): string {
  return `[REENCRYPT] Iniciando mode=${mode} schemaFilter=${schema ? 'explicit' : 'all'}`;
}

/** Emite un fallo fatal sin filtrar texto del driver, SQL ni datos de entrada. */
export function logSafeFatalError(_error: unknown): void {
  console.error('[REENCRYPT] Fatal: fallo inesperado; operación abortada.');
}

function printHelp(): void {
  console.log(`CLI encryption:reencrypt — recifrado AES-256-GCM (ADR-058)

Uso:
  pnpm --filter @iwana/api encryption:reencrypt [-- --apply|--verify-active-only] [-- --schema=tenant_x]
  pnpm --filter @iwana/api encryption:reencrypt -- --mfa-to-pii --schema=tenant_x [--apply]
  pnpm --filter @iwana/api encryption:reencrypt -- --verify-pii-only --schema=tenant_x

Flags:
  (ninguna)              Dry-run: cuenta candidatas / previous / errores; no escribe
  --apply | --write      Recifra filas legibles solo con MFA_ENCRYPTION_KEY_PREVIOUS
  --verify-active-only   Intenta descifrar solo con MFA_ENCRYPTION_KEY (sin PREVIOUS)
  --mfa-to-pii           Recifra objetivos de PII legados desde MFA a PII_ENCRYPTION_KEY
  --verify-pii-only      Verifica que los objetivos PII abran con PII_ENCRYPTION_KEY activa
  --schema=<name>        MFA: public o tenant ACTIVE; PII: tenant registrado con namespace, explícito
  --page-size=<n>        Tamaño de página (default 200)
  --help                 Esta ayuda

Env requerida:
  MFA_ENCRYPTION_KEY (64 hex)
  MFA_ENCRYPTION_KEY_PREVIOUS (recomendado en dry-run/apply durante rotación)
  PII_ENCRYPTION_KEY (+ PII_ENCRYPTION_KEY_PREVIOUS opcional para el modo MFA→PII)
  DB_* / DB_MIGRATOR_* (AppDataSource)

Gaps de inventario (no cubiertos):
${REENCRYPT_INVENTORY_GAPS.map((g) => `  - ${g}`).join('\n')}
`);
}

export function resolveMode(flags: CliFlags): ReencryptMode {
  if (flags.verifyActiveOnly) {
    return 'verify-active-only';
  }
  if (flags.apply) {
    return 'apply';
  }
  return 'dry-run';
}

export function loadKeys(): { activeKey: Buffer; previousKey: Buffer | null } {
  const config = new ConfigService();
  const activeHex = config.get<string>('MFA_ENCRYPTION_KEY')?.trim();
  if (!activeHex || !/^[0-9a-fA-F]{64}$/u.test(activeHex) || isWeakMfaEncryptionKeyHex(activeHex)) {
    throw new Error(
      'MFA_ENCRYPTION_KEY ausente, invalida o debil. Sigue el procedimiento seguro de RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md §1.',
    );
  }

  const previousHex = config.get<string>('MFA_ENCRYPTION_KEY_PREVIOUS')?.trim();
  let previousKey: Buffer | null = null;
  if (previousHex) {
    // PREVIOUS puede ser débil a propósito (clave comprometida en rotación SEC-02).
    // Solo se valida formato hex 64; no se usa para cifrar escrituras nuevas.
    if (!/^[0-9a-fA-F]{64}$/u.test(previousHex)) {
      throw new Error(
        'MFA_ENCRYPTION_KEY_PREVIOUS debe ser exactamente 64 caracteres hexadecimales.',
      );
    }
    if (isWeakMfaEncryptionKeyHex(previousHex)) {
      console.log(
        '[REENCRYPT] Aviso: MFA_ENCRYPTION_KEY_PREVIOUS tiene entropia nula (esperable en rotacion desde clave comprometida)',
      );
    }
    previousKey = parseEncryptionKeyHex(previousHex);
  }

  return {
    activeKey: parseEncryptionKeyHex(activeHex),
    previousKey,
  };
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();

  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const validationError = validateCliFlags(flags);
  if (validationError) {
    console.error(`[REENCRYPT] ${validationError}`);
    process.exit(2);
  }

  const config = new ConfigService();
  const { activeKey, previousKey } = loadKeys();
  const piiMode = flags.mfaToPii || flags.verifyPiiOnly;
  const mode = flags.verifyPiiOnly ? 'verify-pii-only' : resolveMode(flags);

  if (!piiMode && mode !== 'verify-active-only' && !previousKey) {
    console.log(
      '[REENCRYPT] Aviso: MFA_ENCRYPTION_KEY_PREVIOUS vacia — solo se detectaran filas ya activas o errores',
    );
  }

  console.log(formatStartupLog(mode, flags.schema));

  await AppDataSource.initialize();
  let exitCode = 0;

  try {
    const db = new TypeOrmReencryptDbAdapter(AppDataSource);
    if (piiMode) {
      const eligibleTenantSchemas = await listEligiblePiiTenantSchemas(
        (query, parameters) => AppDataSource.query(query, parameters),
        flags.schema ?? '',
      );
      const keys = loadMfaToPiiKeys(config, activeKey, previousKey);
      const piiReport = await runMfaToPii(db, {
        mode: mode as 'dry-run' | 'apply' | 'verify-pii-only',
        schemaFilter: flags.schema,
        eligibleTenantSchemas,
        pageSize: flags.pageSize,
        keys,
      });
      console.log(formatMfaToPiiReport(piiReport));
      if (piiReport.hasBlockingIssues) {
        exitCode = 1;
        console.error('[REENCRYPT-PII] FAIL — quedan objetivos sin verificar o recifrar');
      } else if (piiReport.mode === 'dry-run' && piiReport.totals.reencrypted > 0) {
        console.log(
          `[REENCRYPT-PII] Dry-run OK — ${piiReport.totals.reencrypted} fila(s) se recifrarian con --apply`,
        );
      } else {
        console.log('[REENCRYPT-PII] OK');
      }
    } else {
      if (flags.schema && flags.schema !== 'public') {
        assertRegisteredMfaTenantSchema(flags.schema, await db.listActiveTenantSchemas());
      }

      const report = await runReencryptAes(db, {
        mode: resolveMode(flags),
        schemaFilter: flags.schema,
        pageSize: flags.pageSize,
        activeKey,
        previousKey,
        tenantTargets: getMfaTenantTargets(),
      });

      console.log(formatReencryptReport(report));

      if (report.hasBlockingIssues) {
        exitCode = 1;
        console.error('[REENCRYPT] FAIL — quedan errores/pendientes bloqueantes');
      } else if (report.mode === 'dry-run' && report.totals.reencrypted > 0) {
        console.log(
          `[REENCRYPT] Dry-run OK — ${report.totals.reencrypted} fila(s) se recifrarian con --apply`,
        );
      } else {
        console.log('[REENCRYPT] OK');
      }
    }
  } catch (error) {
    logSafeFatalError(error);
    exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }

  process.exit(exitCode);
}

// Solo se autoejecuta como entrypoint (`node dist/cli/reencrypt-aes.js`).
// Sin esta guarda, importar el módulo desde un test lanzaba el recifrado real
// contra la base configurada y terminaba el proceso con `process.exit`.
if (require.main === module) {
  void main();
}
