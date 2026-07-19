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
import { AppDataSource } from '@iwana/db';
import { isWeakMfaEncryptionKeyHex, parseEncryptionKeyHex } from '../common/crypto/aes-gcm.util';
import { TypeOrmReencryptDbAdapter } from '../common/crypto/reencrypt-aes.db-adapter';
import {
  formatReencryptReport,
  ReencryptMode,
  runReencryptAes,
} from '../common/crypto/reencrypt-aes.orchestrator';
import { REENCRYPT_INVENTORY_GAPS } from '../common/crypto/reencrypt-aes.targets';

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

type CliFlags = {
  apply: boolean;
  verifyActiveOnly: boolean;
  schema?: string | undefined;
  pageSize: number;
  help: boolean;
};

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    apply: false,
    verifyActiveOnly: false,
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

    console.error(`[REENCRYPT] Flag desconocida: ${arg}`);
    flags.help = true;
  }

  return flags;
}

function printHelp(): void {
  console.log(`CLI encryption:reencrypt — recifrado AES-256-GCM (ADR-058)

Uso:
  pnpm --filter @iwana/api encryption:reencrypt [-- --apply|--verify-active-only] [-- --schema=tenant_x]

Flags:
  (ninguna)              Dry-run: cuenta candidatas / previous / errores; no escribe
  --apply | --write      Recifra filas legibles solo con MFA_ENCRYPTION_KEY_PREVIOUS
  --verify-active-only   Intenta descifrar solo con MFA_ENCRYPTION_KEY (sin PREVIOUS)
  --schema=<name>        Solo public o un tenant_* ACTIVE
  --page-size=<n>        Tamaño de página (default 200)
  --help                 Esta ayuda

Env requerida:
  MFA_ENCRYPTION_KEY (64 hex)
  MFA_ENCRYPTION_KEY_PREVIOUS (recomendado en dry-run/apply durante rotación)
  DB_* / DB_MIGRATOR_* (AppDataSource)

Gaps de inventario (no cubiertos):
${REENCRYPT_INVENTORY_GAPS.map((g) => `  - ${g}`).join('\n')}
`);
}

function resolveMode(flags: CliFlags): ReencryptMode {
  if (flags.verifyActiveOnly) {
    return 'verify-active-only';
  }
  if (flags.apply) {
    return 'apply';
  }
  return 'dry-run';
}

function loadKeys(): { activeKey: Buffer; previousKey: Buffer | null } {
  const activeHex = process.env['MFA_ENCRYPTION_KEY']?.trim();
  if (!activeHex || activeHex.length !== 64 || isWeakMfaEncryptionKeyHex(activeHex)) {
    throw new Error(
      'MFA_ENCRYPTION_KEY ausente, invalida o debil. Genera con: openssl rand -hex 32',
    );
  }

  const previousHex = process.env['MFA_ENCRYPTION_KEY_PREVIOUS']?.trim();
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

  if (flags.apply && flags.verifyActiveOnly) {
    console.error('[REENCRYPT] No combine --apply con --verify-active-only');
    process.exit(2);
  }

  const mode = resolveMode(flags);
  const { activeKey, previousKey } = loadKeys();

  if (mode !== 'verify-active-only' && !previousKey) {
    console.log(
      '[REENCRYPT] Aviso: MFA_ENCRYPTION_KEY_PREVIOUS vacia — solo se detectaran filas ya activas o errores',
    );
  }

  console.log(`[REENCRYPT] Iniciando mode=${mode} schemaFilter=${flags.schema ?? '(all)'}`);

  await AppDataSource.initialize();
  let exitCode = 0;

  try {
    const db = new TypeOrmReencryptDbAdapter(AppDataSource);
    const report = await runReencryptAes(db, {
      mode,
      schemaFilter: flags.schema,
      pageSize: flags.pageSize,
      activeKey,
      previousKey,
    });

    console.log(formatReencryptReport(report));

    if (report.hasBlockingIssues) {
      exitCode = 1;
      console.error('[REENCRYPT] FAIL — quedan errores/pendientes bloqueantes');
    } else if (mode === 'dry-run' && report.totals.reencrypted > 0) {
      console.log(
        `[REENCRYPT] Dry-run OK — ${report.totals.reencrypted} fila(s) se recifrarian con --apply`,
      );
    } else {
      console.log('[REENCRYPT] OK');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error desconocido';
    console.error(`[REENCRYPT] Fatal: ${message}`);
    exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }

  process.exit(exitCode);
}

void main();
