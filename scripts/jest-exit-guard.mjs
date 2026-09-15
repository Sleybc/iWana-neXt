/**
 * Guarda contra fugas de handles en la suite de apps/api.
 *
 * La suite debe TERMINAR SOLA (sin --forceExit): si un spec deja una conexion
 * abierta (p. ej. una cola BullMQ real contra Redis), jest imprime
 * "Jest did not exit..." y se queda colgado en silencio. Esta guarda convierte
 * ese silencio en un fallo RUIDOSO con codigo de salida 1.
 *
 * Uso:
 *   node scripts/jest-exit-guard.mjs [-- <args de jest>...]
 *
 * Por defecto corre `pnpm exec jest --ci` sobre apps/api (respeta el
 * maxWorkers 50% de jest.config.js, igual que `pnpm test`). Acepta args extra
 * tras `--` (p. ej. `-- --runInBand`).
 *
 * PROHIBIDO pasar --forceExit: taparia la fuga que esta guarda vigila
 * (nota R-14 de apps/api/jest.config.js). La guarda lo rechaza en voz alta.
 *
 * Controles, en orden:
 *   1. Si jest escribe "did not exit" -> fallo inmediato.
 *   2. Si el resumen (Test Suites:/Tests:) aparece y el proceso no sale en
 *      GRACE_MS -> fallo (cuelgue mudo).
 *   3. Si el log contiene ECONNREFUSED (firma de la fuga Redis/BullMQ) -> fallo.
 *   4. Si jest sale con codigo != 0 -> se propaga el fallo.
 *
 * Esta guarda NO vive en CI: cablearla a .github/workflows/ci.yml requiere
 * consulta previa a plat-ops. Se invoca manual o como script
 * `test:exit-guard` de @iwana/api.
 */
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const apiDir = resolve(repoRoot, 'apps/api');

const GRACE_MS = Number(process.env['JEST_EXIT_GUARD_GRACE_MS'] ?? 30_000);
const OVERALL_TIMEOUT_MS = Number(process.env['JEST_EXIT_GUARD_TIMEOUT_MS'] ?? 15 * 60_000);
const MAX_LOG_CHARS = 8_000_000;

function fail(message, logTail) {
  process.stderr.write(`\n[JEST-EXIT-GUARD] FALLO: ${message}\n`);
  if (logTail) {
    process.stderr.write(`[JEST-EXIT-GUARD] --- cola del log de jest ---\n${logTail}\n`);
  }
  process.exitCode = 1;
}

function parseArgs(argv) {
  const dashDash = argv.indexOf('--');
  const jestArgs = ['--ci', ...(dashDash === -1 ? [] : argv.slice(dashDash + 1))];
  if (jestArgs.includes('--forceExit')) {
    fail(
      'se paso --forceExit: esta prohibido (nota R-14 de apps/api/jest.config.js). ' +
        'Taparia la fuga de handles que esta guarda vigila.',
    );
    return null;
  }
  return jestArgs;
}

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // El proceso ya salio por su cuenta; nada que matar.
    }
  }
}

async function main() {
  const jestArgs = parseArgs(process.argv.slice(2));
  if (!jestArgs) return;

  process.stdout.write(
    `[JEST-EXIT-GUARD] Lanzando sobre apps/api: pnpm exec jest ${jestArgs.join(' ')}\n`,
  );

  const child = spawn('pnpm', ['exec', 'jest', ...jestArgs], {
    cwd: apiDir,
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  let truncated = 0;
  let summarySuitesSeen = false;
  let summaryTestsSeen = false;
  let didNotExitSeen = false;
  let settled = false;
  let graceTimer = null;
  let overallTimer = null;

  const append = (chunk) => {
    log += chunk;
    if (log.length > MAX_LOG_CHARS) {
      truncated += log.length - MAX_LOG_CHARS;
      log = log.slice(-MAX_LOG_CHARS);
    }
    if (/Test Suites:/.test(chunk)) summarySuitesSeen = true;
    if (/^Tests:\s+/m.test(chunk)) summaryTestsSeen = true;
    if (/did not exit/i.test(chunk)) didNotExitSeen = true;
    if (didNotExitSeen && !settled) {
      settled = true;
      killTree(child);
      const tail = log.slice(-4000);
      fail(
        'jest informo "did not exit": la suite completo los tests pero dejo ' +
          'handles abiertos (fuga de infraestructura en el arnes). Sin --forceExit ' +
          'para no taparla; hay que aislar el spec que abre la conexion.',
        tail,
      );
    } else if (summarySuitesSeen && summaryTestsSeen && !graceTimer && !settled) {
      graceTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        killTree(child);
        const tail = log.slice(-4000);
        fail(
          `el resumen de jest aparecio pero el proceso no termino solo en ${GRACE_MS} ms: ` +
            'cuelgue mudo por handle abierto (ver R-14 en apps/api/jest.config.js).',
          tail,
        );
      }, GRACE_MS);
      graceTimer.unref?.();
    }
  };

  child.stdout.on('data', (data) => append(String(data)));
  child.stderr.on('data', (data) => append(String(data)));
  child.on('error', (error) => {
    if (settled) return;
    settled = true;
    fail(`no se pudo lanzar jest: ${error.message}`);
  });

  overallTimer = setTimeout(() => {
    if (settled) return;
    settled = true;
    killTree(child);
    fail(
      `jest no termino en ${OVERALL_TIMEOUT_MS} ms (timeout global de la guarda).`,
      log.slice(-4000),
    );
  }, OVERALL_TIMEOUT_MS);
  overallTimer.unref?.();

  const exitCode = await new Promise((resolveExit) => child.on('close', resolveExit));
  clearTimeout(overallTimer);
  if (graceTimer) clearTimeout(graceTimer);
  if (settled) return;

  settled = true;
  const refusedCount = (log.match(/ECONNREFUSED/g) ?? []).length;
  const testsLine = (log.match(/^Tests:.*$/m) ?? ['(resumen no encontrado)'])[0].trim();
  const suitesLine = (log.match(/^Test Suites:.*$/m) ?? [''])[0].trim();

  if (exitCode !== 0) {
    fail(`jest salio con codigo ${exitCode}. ${suitesLine} ${testsLine}`, log.slice(-4000));
    return;
  }
  if (refusedCount > 0) {
    fail(
      `jest termino solo pero el log contiene ${refusedCount} ECONNREFUSED: ` +
        'hay conexiones reales a Redis abiertas desde el arnes (firma de la fuga BullMQ).',
      log.slice(-4000),
    );
    return;
  }
  process.stdout.write(
    `[JEST-EXIT-GUARD] OK: la suite termino sola (exit 0). ${suitesLine} ${testsLine} ` +
      `ECONNREFUSED=0${truncated > 0 ? ` (log truncado, ${truncated} chars descartados)` : ''}\n`,
  );
}

await main();
