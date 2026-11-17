import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { createDashboard, normalizeChunk } from './dev-dashboard.mjs';

// El dashboard vive en su propio módulo; `isErrorLine` se sigue exponiendo desde
// aquí porque es parte del contrato que cubren las pruebas del orquestador.
export { isErrorLine } from './dev-dashboard.mjs';

const rootCwd = process.cwd();
// Archivos Compose del perfil de desarrollo. La publicación de puertos vive en
// el overlay `docker-compose.dev.yml` y está ligada a 127.0.0.1.
export const devComposeFiles = ['docker-compose.yml', 'docker-compose.dev.yml'];
const composeFileArgs = devComposeFiles.flatMap((file) => ['-f', file]);
// Servicios de larga duración del perfil `development`. Se nombran explícitamente
// en lugar de usar `--profile development` porque `adminer` es opt-in (perfil
// propio) y no debe arrancar con `pnpm dev`.
//
// `typesense` estuvo ausente de esta lista pese a declarar `profiles: development`:
// el módulo de búsqueda arrancaba contra un servicio inexistente. `minio-init` no
// va aquí porque es un one-shot: `up --wait` lo trataría como un servicio caído.
export const devInfraServices = ['postgres', 'redis', 'pgbouncer', 'minio', 'typesense', 'nginx'];
// One-shots del arranque, ejecutados con `run --rm` tras `up --wait`. Mismo patrón
// que `scripts/e2e-provision-operational.mjs`. `minio-init` crea el bucket
// `S3_BUCKET`: sin él, el módulo de medios falla con `NoSuchBucket`.
export const devInfraOneShots = ['minio-init'];
// Cota superior del `up --wait`. El healthcheck más lento es el de MinIO; sin
// tope, un servicio que nunca converge cuelga `pnpm dev` de forma indefinida.
export const devInfraWaitTimeoutSeconds = 180;
// Variables sin default que `docker-compose.yml` exige (`${VAR:?}`). Compose
// interpola el documento completo antes de elegir servicios, así que faltar una
// sola aborta el arranque con un error crudo de interpolación. El preflight las
// valida antes para dar un mensaje accionable.
export const requiredDevEnvVars = [
  'DB_BOOTSTRAP_USER',
  'DB_PASSWORD',
  'DB_APP_USER',
  'DB_APP_PASSWORD',
  'DB_MIGRATOR_USER',
  'DB_MIGRATOR_PASSWORD',
  'REDIS_PASSWORD',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'TYPESENSE_API_KEY',
  'PGBOUNCER_IMAGE',
  'MINIO_IMAGE',
  'MINIO_MC_IMAGE',
  'NGINX_IMAGE',
];
// Variables que las migraciones TypeORM exigen en runtime (backfill HMAC SEC-P1).
// Distintas de requiredDevEnvVars: Compose puede levantar infra sin ellas, pero
// `pnpm db:migrate:all` falla a mitad de transacción si faltan.
export const requiredMigrationEnvVars = ['PII_HASH_KEY'];
// Procesos de larga duración que el orquestador lanza y puede reiniciar uno a
// uno desde el dashboard. `pseudoTty` conserva la salida con formato de Nest.
export const devServices = Object.freeze({
  api: { args: ['--filter', '@iwana/api', 'dev'], pseudoTty: true },
  web: { args: ['--filter', '@iwana/web', 'dev'], pseudoTty: false },
  portal: { args: ['--filter', '@iwana/portal', 'dev'], pseudoTty: false },
  worker: { args: ['--filter', '@iwana/worker', 'dev'], pseudoTty: true },
});
// Cota de espera a que un servicio termine antes de relanzarlo.
const restartExitTimeoutMs = 5_000;
const isWindows = process.platform === 'win32';
const hasScriptCommand =
  !isWindows && spawnSync('script', ['-qc', 'true', '/dev/null'], { stdio: 'ignore' }).status === 0;
const windowsCommandCache = new Map();

function resolveCommand(command) {
  if (!isWindows) {
    return command;
  }

  const cached = windowsCommandCache.get(command);
  if (cached) {
    return cached;
  }

  const candidates = spawnSync('where.exe', [command], {
    cwd: rootCwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: process.env,
  });

  if (candidates.status === 0) {
    const paths = candidates.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const preferred =
      paths.find((candidate) => candidate.toLowerCase().endsWith('.exe')) ??
      paths.find((candidate) => candidate.toLowerCase().endsWith('.cmd')) ??
      paths.find((candidate) => candidate.toLowerCase().endsWith('.bat')) ??
      paths[0];

    if (preferred) {
      windowsCommandCache.set(command, preferred);
      return preferred;
    }
  }

  return command;
}

function needsWindowsCommandShell(command) {
  return isWindows && /\.(cmd|bat|ps1)$/i.test(command);
}

function quoteWindowsShellArg(value) {
  const text = String(value);

  if (!/[\s"&()^%!]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '\\"')}"`;
}

function quoteWindowsPowerShellArg(value) {
  const text = String(value);

  if (!/[\s'"&()|<>]/.test(text)) {
    return text;
  }

  return `'${text.replace(/'/g, "''")}'`;
}

function buildSpawnTarget(command, args) {
  if (!needsWindowsCommandShell(command)) {
    return { command, args };
  }

  if (/\.ps1$/i.test(command)) {
    const commandLine = [
      '&',
      quoteWindowsPowerShellArg(command),
      ...args.map(quoteWindowsPowerShellArg),
    ].join(' ');

    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', commandLine],
    };
  }

  const commandLine = [quoteWindowsShellArg(command), ...args.map(quoteWindowsShellArg)].join(' ');
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
  };
}

export function resolvePnpmTarget(args) {
  const npmExecPath = process.env.npm_execpath?.trim();
  if (npmExecPath && /pnpm/i.test(npmExecPath)) {
    if (/\.(?:c?js|mjs)$/i.test(npmExecPath)) {
      return buildSpawnTarget(process.execPath, [npmExecPath, ...args]);
    }

    return buildSpawnTarget(npmExecPath, args);
  }

  const resolvedPnpm = resolveCommand('pnpm');
  if (resolvedPnpm !== 'pnpm') {
    return buildSpawnTarget(resolvedPnpm, args);
  }

  const resolvedCorepack = resolveCommand('corepack');
  if (resolvedCorepack !== 'corepack') {
    return buildSpawnTarget(resolvedCorepack, ['pnpm', ...args]);
  }

  return buildSpawnTarget('pnpm', args);
}

export function resolveSpawnTarget(command, args) {
  if (isWindows && command === 'pnpm') {
    return resolvePnpmTarget(args);
  }

  const resolvedCommand = resolveCommand(command);
  return buildSpawnTarget(resolvedCommand, args);
}

export function parseEnvFile(contents) {
  const values = new Map();

  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line
      .slice(0, separatorIndex)
      .replace(/^export\s+/, '')
      .trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    values.set(key, value);
  }

  return values;
}

function readEnvFile(path) {
  try {
    return parseEnvFile(readFileSync(path, 'utf8'));
  } catch {
    // Ausencia de .env no es un fallo distinto: el preflight reporta las
    // variables faltantes con el mismo mensaje accionable.
    return new Map();
  }
}

// Compose da precedencia al entorno del shell sobre `.env`, y `${VAR:?}` también
// falla con valor vacío: se replica esa semántica exacta.
export function findMissingDevEnvVars(fileValues, shellEnv = {}, names = requiredDevEnvVars) {
  return names.filter((name) => {
    const shellValue = shellEnv[name];

    if (typeof shellValue === 'string' && shellValue.trim() !== '') {
      return false;
    }

    const fileValue = fileValues instanceof Map ? fileValues.get(name) : fileValues?.[name];

    return typeof fileValue !== 'string' || fileValue.trim() === '';
  });
}

export function buildMissingDevEnvMessage(missing, envPath = '.env') {
  const detalle = missing.map((name) => `  - ${name}`).join('\n');

  return [
    `Faltan ${missing.length} variable(s) obligatoria(s) del perfil de desarrollo en ${envPath}:`,
    detalle,
    '',
    `Docker Compose interpola todo ${devComposeFiles[0]} antes de elegir servicios, así que`,
    'cualquiera de estas variables ausente o vacía impide levantar la infraestructura.',
    `Agrégalas a ${envPath} (archivo local, no versionado) tomando el contrato y los`,
    'valores de referencia de .env.example. No copies secretos reales a archivos versionados.',
  ].join('\n');
}

function assertDevEnv() {
  const envPath = join(rootCwd, '.env');
  const missing = findMissingDevEnvVars(readEnvFile(envPath), process.env);

  if (missing.length === 0) {
    return;
  }

  throw new Error(buildMissingDevEnvMessage(missing, '.env'));
}

export function buildMissingMigrationEnvMessage(missing, envPath = '.env') {
  const detalle = missing.map((name) => `  - ${name}`).join('\n');

  return [
    `Faltan ${missing.length} variable(s) obligatoria(s) para migraciones en ${envPath}:`,
    detalle,
    '',
    'Las migraciones de backfill HMAC (SEC-P1) requieren estas claves antes de',
    '`pnpm db:migrate:all`; sin ellas el runner aborta a mitad de transacción.',
    'Genera cada clave con: openssl rand -hex 32',
    'El CLI de TypeORM carga, en orden, .env.development.local → .env.development →',
    '.env y se detiene al completar DB_*; si .env.development ya trae DB_HOST/USER/',
    'PASSWORD, PII_HASH_KEY en solo .env no llega al proceso. Preferí',
    '.env.development.local (o .env.development) según .env.example y',
    'docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md (§6bis).',
    'No copies secretos reales a archivos versionados.',
  ].join('\n');
}

export function assertMigrationEnv(fileValues, shellEnv = process.env) {
  const missing = findMissingDevEnvVars(fileValues, shellEnv, requiredMigrationEnvVars);

  if (missing.length === 0) {
    return;
  }

  throw new Error(buildMissingMigrationEnvMessage(missing, '.env'));
}

/**
 * Une candidatos de entorno con semántica first-wins (igual que `process.loadEnvFile`).
 * Replica el orden de `ensureDatabaseEnvLoaded` en `@iwana/db` data-source.
 */
export function readMigrationEnvFileValues(rootDir = rootCwd) {
  const merged = new Map();

  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    const values = readEnvFile(join(rootDir, candidate));

    for (const [key, value] of values) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    }
  }

  return merged;
}

function assertMigrationEnvFromDisk() {
  const fileValues = readMigrationEnvFileValues();
  assertMigrationEnv(fileValues, process.env);

  // Inyecta en process.env para que el hijo `pnpm db:migrate:all` herede la clave
  // aunque data-source haga early-return tras cargar .env.development.
  for (const name of requiredMigrationEnvVars) {
    const shellValue = process.env[name];

    if (typeof shellValue === 'string' && shellValue.trim() !== '') {
      continue;
    }

    const fileValue = fileValues.get(name);

    if (typeof fileValue === 'string' && fileValue.trim() !== '') {
      process.env[name] = fileValue;
    }
  }
}

function spawnCommand(command, args, options = {}) {
  const target = resolveSpawnTarget(command, args);

  return spawn(target.command, target.args, {
    cwd: rootCwd,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function spawnPipedCommand(command, args, options = {}) {
  const target = resolveSpawnTarget(command, args);

  return spawn(target.command, target.args, {
    cwd: rootCwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: !isWindows,
    ...options,
  });
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildObservedCommand(command, args, options = {}) {
  if (options.pseudoTty && hasScriptCommand) {
    const wrappedCommand = [resolveCommand(command), ...args].map(shellEscape).join(' ');
    return {
      command: 'script',
      args: ['-qfec', wrappedCommand, '/dev/null'],
    };
  }

  return { command, args };
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      reject(new Error(`${label} failed with ${reason}`));
    });
  });
}

/**
 * Ejecuta un paso cuyo fallo no debe tumbar el arranque: lo reporta con `warn` y
 * sigue. Durante el apagado propaga el error, igual que cualquier otro paso.
 */
export async function runOptionalStep(step, { isShuttingDown, warn }) {
  try {
    await step();
    return true;
  } catch (error) {
    if (isShuttingDown()) {
      throw error;
    }
    warn(error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function runStep(label, command, args, options = {}) {
  const { dashboard, section, trackChild, captureFailureOutput = false } = options;
  // Los pasos secuenciales (docker compose, builds, migraciones) también deben
  // ser alcanzables por el apagado: un Ctrl+C durante las migraciones dejaba el
  // hijo huérfano porque solo se registraban los procesos de larga duración.
  const track = typeof trackChild === 'function' ? trackChild : () => () => {};

  if (!dashboard) {
    console.log(`\n[iWana dev] ${label}`);
    const child = spawnCommand(command, args);
    const untrack = track(child);

    try {
      await waitForExit(child, label);
    } finally {
      untrack();
    }

    return;
  }

  dashboard.logSystem(label);
  const closeStep = dashboard.startupStep(label);

  if (section) {
    dashboard.setStatus(section, 'starting');
  }

  const child = spawnPipedCommand(command, args);
  const untrack = track(child);
  let failureOutput = '';
  const maxFailureOutputLength = 8_000;

  function consumeChunk(chunk) {
    dashboard.consumeChunk(section ?? 'system', chunk);

    if (captureFailureOutput) {
      const normalized = normalizeChunk(chunk);
      failureOutput = `${failureOutput}${normalized}`.slice(-maxFailureOutputLength);
    }
  }

  if (child.stdout) {
    child.stdout.on('data', consumeChunk);
  }

  if (child.stderr) {
    child.stderr.on('data', consumeChunk);
  }

  try {
    await waitForExit(child, label);
  } catch (error) {
    const details = failureOutput.trim();
    if (captureFailureOutput && details && error instanceof Error) {
      error.message = `${error.message}\n\nSalida del paso:\n${details}`;
    }
    closeStep(false);
    throw error;
  } finally {
    untrack();
  }

  closeStep(true);
  dashboard.flush(section ?? 'system');

  if (section) {
    dashboard.setStatus(section, 'ready');
  }
}

export async function waitForCompilation(child, dashboard, options = {}) {
  const timeoutMs = options.timeoutMs ?? 90_000;

  return new Promise((resolve, reject) => {
    let done = false;
    let pendingText = '';

    function cleanup() {
      child.stdout?.removeListener('data', onChunk);
      child.stderr?.removeListener('data', onChunk);
      child.removeListener('exit', onExit);
    }

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      dashboard?.log(
        'api',
        `Compilacion no detectada tras ${Math.ceil(timeoutMs / 1000)}s, continuando con healthcheck.`,
      );
      resolve();
    }, timeoutMs);

    function onChunk(chunk) {
      if (done) return;
      pendingText = `${pendingText}${normalizeChunk(chunk)}`;
      const compilationResult = pendingText.match(/\bfound\s+(\d+)\s+errors?\b/i);

      if (!compilationResult) {
        if (pendingText.length > 512) {
          pendingText = pendingText.slice(-512);
        }
        return;
      }

      const errorCount = Number(compilationResult[1]);
      done = true;
      clearTimeout(timer);
      cleanup();

      if (errorCount > 0) {
        reject(
          new Error(`API compilation failed with ${errorCount} errors. Revisa la vista errors.`),
        );
        return;
      }

      if (errorCount === 0) {
        dashboard?.log('api', 'Compilacion completada, iniciando healthcheck.');
        resolve();
      }
    }

    function onExit(code, signal) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(
        new Error(
          `API dev process exited during compilation${signal ? ` signal ${signal}` : ''}${typeof code === 'number' ? ` exit code ${code}` : ''}`.trim(),
        ),
      );
    }

    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.on('exit', onExit);
  });
}

export async function waitForApiHealth(dashboard, apiChild, options = {}) {
  const url = 'http://127.0.0.1:3000/api/v1/health';
  const deadlineMs = options.deadlineMs ?? 90_000;
  const perAttemptTimeoutMs = options.perAttemptTimeoutMs ?? 1500;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const fetchImpl = options.fetchImpl ?? fetch;
  let attempt = 0;
  let lastFailure = 'sin respuesta';

  function buildApiExitError() {
    const signalCode = apiChild.signalCode ? ` signal ${apiChild.signalCode}` : '';
    const exitCode = typeof apiChild.exitCode === 'number' ? ` exit code ${apiChild.exitCode}` : '';
    return new Error(
      `API dev process exited before healthcheck completed.${signalCode}${exitCode}`.trim(),
    );
  }

  await waitForCompilation(apiChild, dashboard, { timeoutMs: deadlineMs });
  const startedAt = Date.now();

  while (Date.now() - startedAt < deadlineMs) {
    attempt += 1;

    if (apiChild.exitCode !== null || apiChild.signalCode) {
      throw buildApiExitError();
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs);

      try {
        const response = await fetchImpl(url, { signal: controller.signal });

        if (response.ok) {
          if (dashboard) {
            dashboard.log('api', `healthcheck OK tras ${attempt} intento(s)`);
          } else {
            console.log(`[iWana dev] API healthy after ${attempt} attempt(s)`);
          }

          return;
        }

        lastFailure = `HTTP ${response.status} ${response.statusText}`.trim();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastFailure =
        error instanceof Error
          ? `${error.name}: ${error.cause instanceof Error ? error.cause.message : error.message}`
          : String(error);
    }

    if (apiChild.exitCode !== null || apiChild.signalCode) {
      throw buildApiExitError();
    }

    if (dashboard && (attempt === 1 || attempt % 5 === 0)) {
      const elapsedSeconds = Math.ceil((Date.now() - startedAt) / 1000);
      dashboard.log(
        'api',
        `Esperando healthcheck OK en ${url} (${elapsedSeconds}s/${Math.ceil(deadlineMs / 1000)}s). Ultimo resultado: ${lastFailure}`,
      );
    }

    await delay(retryDelayMs);
  }

  throw new Error(`API health check timed out at ${url}. Ultimo resultado: ${lastFailure}`);
}

function terminate(child, signal = 'SIGTERM') {
  if (!child || !child.pid) {
    return;
  }

  try {
    if (!isWindows) {
      process.kill(-child.pid, signal);
      return;
    }

    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    try {
      child.kill(signal);
    } catch {
      // No-op: el proceso pudo haber terminado entre el chequeo y la señal.
    }
  }
}

// Registro único de procesos hijos. Distingue los pasos secuenciales (docker
// compose, builds, migraciones), que se desregistran al terminar, de los
// procesos de larga duración. El apagado alcanza a ambos: antes solo alcanzaba
// a los segundos, así que un Ctrl+C durante las migraciones dejaba huérfanos.
export function createProcessRegistry(terminateImpl = terminate) {
  const stepChildren = new Set();
  const managedChildren = [];

  return {
    trackStep(child) {
      stepChildren.add(child);
      return () => {
        stepChildren.delete(child);
      };
    },
    trackManaged(...children) {
      managedChildren.push(...children);
    },
    // Un reinicio sustituye al hijo anterior: sin esto, el apagado seguiría
    // apuntando a un proceso ya muerto y no alcanzaría al nuevo.
    replaceManaged(previousChild, nextChild) {
      const index = managedChildren.indexOf(previousChild);

      if (index >= 0) {
        managedChildren[index] = nextChild;
        return;
      }

      managedChildren.push(nextChild);
    },
    shutdownAll(signal = 'SIGTERM') {
      for (const child of stepChildren) {
        terminateImpl(child, signal);
      }

      for (const child of managedChildren) {
        terminateImpl(child, signal);
      }
    },
  };
}

function spawnObservedProcess(section, command, args, dashboard, options = {}) {
  const observedCommand = buildObservedCommand(command, args, options);

  if (!dashboard) {
    const child = spawnPipedCommand(observedCommand.command, observedCommand.args);
    const prefix = `[${section}] `;

    function writeChunk(chunk) {
      const lines = normalizeChunk(chunk).split('\n');

      for (const line of lines) {
        if (!line) {
          continue;
        }

        process.stdout.write(`${prefix}${line}\n`);
      }
    }

    if (child.stdout) {
      child.stdout.on('data', writeChunk);
    }

    if (child.stderr) {
      child.stderr.on('data', writeChunk);
    }

    return child;
  }

  dashboard.setStatus(section, 'starting');
  const child = spawnPipedCommand(observedCommand.command, observedCommand.args);

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      dashboard.consumeChunk(section, chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      dashboard.consumeChunk(section, chunk);
    });
  }

  child.once('spawn', () => {
    dashboard.setStatus(section, 'running');
  });

  return child;
}

function isChildAlive(child) {
  return Boolean(child) && child.exitCode === null && !child.signalCode;
}

// Supervisa los procesos de larga duración y permite reiniciarlos uno a uno.
//
// Con dashboard, la salida de un servicio no termina la sesión: queda marcado
// como «falló» o «detenido» y se puede relanzar con `r`. Sin dashboard (CI,
// tubería) se conserva el contrato previo: la primera salida resuelve o rechaza
// `ended`, y el orquestador termina.
export function createServiceSupervisor({
  dashboard = null,
  registry,
  isShuttingDown = () => false,
  spawnService = (name) =>
    spawnObservedProcess(name, 'pnpm', devServices[name].args, dashboard, {
      pseudoTty: devServices[name].pseudoTty,
    }),
  terminateImpl = terminate,
  waitForHealth = waitForApiHealth,
  exitTimeoutMs = restartExitTimeoutMs,
}) {
  const current = new Map();
  const intentional = new WeakSet();
  const restarting = new Set();
  let settle;
  const ended = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  // `ended` puede rechazarse antes de que alguien lo espere (la API cae durante
  // su healthcheck inicial): sin este manejador sería un rechazo no controlado.
  ended.catch(() => {});

  function isCurrent(name, child) {
    return current.get(name) === child && !intentional.has(child) && !isShuttingDown();
  }

  function onExit(name, child, code, signal) {
    dashboard?.flush(name);

    if (!isCurrent(name, child)) {
      return;
    }

    const clean = code === 0 || signal === 'SIGINT' || signal === 'SIGTERM';
    dashboard?.setStatus(name, clean ? 'stopped' : 'failed');

    if (dashboard) {
      dashboard.log(
        name,
        clean
          ? `${name} se detuvo. Pulsa r para iniciarlo de nuevo.`
          : `Error: ${name} terminó de forma inesperada (${signal ?? code}). Pulsa r para reiniciarlo.`,
      );
      return;
    }

    if (clean) {
      settle.resolve({ source: name, code: code ?? 0, signal });
      return;
    }

    settle.reject(new Error(`${name} dev process exited unexpectedly with ${signal ?? code}`));
  }

  function onError(name, child, error) {
    if (!isCurrent(name, child)) {
      return;
    }

    dashboard?.setStatus(name, 'failed');

    if (dashboard) {
      dashboard.log(name, `Error al lanzar ${name}: ${error.message}`);
      return;
    }

    settle.reject(error);
  }

  function start(name) {
    const child = spawnService(name);
    const previous = current.get(name);

    current.set(name, child);

    if (previous) {
      registry.replaceManaged(previous, child);
    } else {
      registry.trackManaged(child);
    }

    child.once('error', (error) => onError(name, child, error));
    child.once('exit', (code, signal) => onExit(name, child, code, signal));
    return child;
  }

  async function stopForRestart(child) {
    if (!isChildAlive(child)) {
      return;
    }

    intentional.add(child);

    const exited = new Promise((resolve) => {
      child.once('exit', () => resolve(true));
    });
    const timeout = () => delay(exitTimeoutMs, false, { ref: false });

    terminateImpl(child, 'SIGTERM');

    if (await Promise.race([exited, timeout()])) {
      return;
    }

    terminateImpl(child, 'SIGKILL');
    await Promise.race([exited, timeout()]);
  }

  async function restart(name) {
    if (restarting.has(name) || isShuttingDown()) {
      return;
    }

    restarting.add(name);

    try {
      dashboard?.setStatus(name, 'restarting');
      dashboard?.log(name, `Reiniciando ${name} a petición del dashboard.`);
      await stopForRestart(current.get(name));

      if (isShuttingDown()) {
        return;
      }

      const next = start(name);

      if (name === 'api') {
        await waitForHealth(dashboard, next);
        dashboard?.setStatus('api', 'ready');
      }

      dashboard?.log(name, `${name} reiniciado.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dashboard?.setStatus(name, 'failed');
      dashboard?.log(name, `Error al reiniciar ${name}: ${message}`);
    } finally {
      restarting.delete(name);
    }
  }

  return { ended, restart, start };
}

async function main() {
  // Preflight antes de crear el dashboard: si falta una variable, el mensaje
  // accionable debe verse en la terminal normal y no dentro del buffer alterno.
  assertDevEnv();

  const dashboard = createDashboard();
  const registry = createProcessRegistry();
  const { shutdownAll, trackStep: trackChild } = registry;
  let resolveShutdown;
  const session = {
    shuttingDown: false,
    whenShutdown: new Promise((resolve) => {
      resolveShutdown = resolve;
    }),
  };

  // Punto único de apagado: marca la sesión, detiene los hijos y libera la
  // espera final. Desde aquí, la salida de un hijo ya no es un fallo.
  const requestShutdown = (signal) => {
    session.shuttingDown = true;
    shutdownAll(signal);
    resolveShutdown();
  };

  dashboard?.setQuitHandler(() => {
    if (session.shuttingDown) {
      return;
    }

    requestShutdown('SIGTERM');

    // Fallback: devolver el prompt aunque algun hijo ignore SIGTERM.
    setTimeout(() => {
      shutdownAll('SIGKILL');
      process.exit(0);
    }, 800);
  });

  // Las señales se registran ANTES del primer paso. Cuando se registraban junto
  // al arranque de la API, un Ctrl+C durante la liberación de puertos, el
  // `docker compose up`, los builds o las migraciones dejaba procesos huérfanos.
  process.once('SIGINT', () => requestShutdown('SIGINT'));
  process.once('SIGTERM', () => requestShutdown('SIGTERM'));

  dashboard?.start();

  // `start()` deja la terminal en raw mode, con buffer alterno y stdin resumido.
  // Sin este `finally` global, cualquier fallo previo al arranque de las apps
  // devolvía la terminal inutilizable y además mantenía vivo el event loop, así
  // que el proceso no terminaba pese a `process.exitCode = 1`.
  try {
    await runStartupSequence({ dashboard, registry, trackChild, session });
  } catch (error) {
    // Un paso interrumpido por el propio apagado no es un fallo que reportar.
    if (!session.shuttingDown) {
      throw error;
    }
  } finally {
    shutdownAll('SIGTERM');
    dashboard?.stop();
  }
}

async function runStartupSequence({ dashboard, registry, trackChild, session }) {
  dashboard?.logSystem('Inicializando entorno de desarrollo');
  // Puertos, `up`, `ps`, usuario ACL del MCP, dos builds, migraciones, API y
  // apps, más los one-shots.
  dashboard?.setStartupTotal(9 + devInfraOneShots.length);

  await runStep('Liberando puertos de desarrollo', 'pnpm', ['dev:free-ports'], {
    dashboard,
    trackChild,
    captureFailureOutput: true,
  });

  async function startInfrastructure() {
    // `--wait` bloquea hasta que cada servicio esté running/healthy. Sin él, las
    // migraciones podían arrancar contra una infraestructura a medio levantar:
    // el único `depends_on` que garantizaba algo era el de pgbouncer sobre postgres.
    await runStep(
      'Levantando infraestructura Docker local',
      'docker',
      [
        'compose',
        ...composeFileArgs,
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        String(devInfraWaitTimeoutSeconds),
        ...devInfraServices,
      ],
      { dashboard, section: 'docker', trackChild },
    );

    for (const service of devInfraOneShots) {
      await runStep(
        `Ejecutando inicializador ${service}`,
        'docker',
        ['compose', ...composeFileArgs, 'run', '--rm', service],
        { dashboard, section: 'docker', trackChild },
      );
    }

    await runStep(
      'Estado de la infraestructura Docker',
      'docker',
      ['compose', ...composeFileArgs, 'ps'],
      {
        dashboard,
        section: 'docker',
        trackChild,
      },
    );

    // Redis dev arranca sin aclfile: el usuario `iwana_readonly` del MCP
    // `redis-dev` desaparece cada vez que el contenedor se reinicia o se recrea,
    // y el MCP falla sin que nadie lo note. El script es idempotente y conserva
    // la contraseña. Su fallo solo afecta a Claude Code, no a las apps.
    await runOptionalStep(
      () =>
        runStep(
          'Sincronizando usuario de solo lectura de Redis (MCP redis-dev)',
          'pnpm',
          ['dev:redis-readonly-user'],
          { dashboard, trackChild, captureFailureOutput: true },
        ),
      {
        isShuttingDown: () => session.shuttingDown,
        warn: (message) => {
          const text = `Aviso: el MCP redis-dev no podrá conectar. ${message}`;
          if (dashboard) dashboard.logSystem(text);
          else console.warn(`[iWana dev] ${text}`);
        },
      },
    );
  }

  const buildPackage = (name) =>
    runStep(`Compilando ${name}`, 'pnpm', ['--filter', name, 'build'], { dashboard, trackChild });

  if (dashboard) {
    // La infraestructura y los builds no dependen entre sí, y `@iwana/storage`
    // no depende de `@iwana/shared`: corren a la vez. Las migraciones esperan a
    // todo. El dashboard separa la salida por sección, así que no se mezcla.
    await Promise.all([
      startInfrastructure(),
      buildPackage('@iwana/shared'),
      buildPackage('@iwana/storage'),
    ]);
  } else {
    // Sin dashboard la salida va directa a la terminal: en serie, para que los
    // logs de cada paso no se intercalen.
    await startInfrastructure();
    await buildPackage('@iwana/shared');
    await buildPackage('@iwana/storage');
  }

  assertMigrationEnvFromDisk();

  await runStep('Ejecutando migraciones', 'pnpm', ['db:migrate:all'], { dashboard, trackChild });

  const supervisor = createServiceSupervisor({
    dashboard,
    registry,
    isShuttingDown: () => session.shuttingDown,
  });

  dashboard?.logSystem('Iniciando API en modo watch');
  const closeApiStep = dashboard?.startupStep('Esperando a la API');
  const apiChild = supervisor.start('api');

  dashboard?.setStatus('web', 'waiting_api');
  dashboard?.setStatus('portal', 'waiting_api');
  dashboard?.setStatus('worker', 'waiting_api');
  dashboard?.log('web', 'Pendiente hasta que la API responda healthcheck OK.');
  dashboard?.log('portal', 'Pendiente hasta que la API responda healthcheck OK.');
  dashboard?.log('worker', 'Pendiente hasta que la API responda healthcheck OK.');

  try {
    await waitForApiHealth(dashboard, apiChild);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    closeApiStep?.(false);
    dashboard?.log('api', `Fallo de arranque: ${message}`);
    dashboard?.logSystem(`Fallo de arranque de API: ${message}`);
    terminate(apiChild, 'SIGTERM');
    dashboard?.setStatus('api', 'failed');
    dashboard?.setStatus('web', 'idle');
    dashboard?.setStatus('portal', 'idle');
    dashboard?.setStatus('worker', 'idle');
    throw error;
  }

  closeApiStep?.(true);
  dashboard?.setStatus('api', 'ready');
  dashboard?.logSystem('Iniciando web, portal y worker');

  const closeAppsStep = dashboard?.startupStep('Iniciando web, portal y worker');

  for (const name of ['web', 'portal', 'worker']) {
    supervisor.start(name);
  }

  closeAppsStep?.(true);
  dashboard?.completeStartup();
  dashboard?.setRestartHandler((name) => {
    void supervisor.restart(name);
  });

  // El apagado y el `dashboard.stop()` viven en el `finally` de `main()`, que
  // cubre también los caminos de fallo previos a este punto.
  await Promise.race([supervisor.ended, session.whenShutdown]);
}

const invokedPath = process.argv[1];
const isMainModule = invokedPath ? import.meta.url === pathToFileURL(invokedPath).href : false;

if (isMainModule) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[iWana dev] ${message}`);
    process.exitCode = 1;
  });
}
