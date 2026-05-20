import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const rootCwd = process.cwd();
const isWindows = process.platform === 'win32';
const composeArgs = ['compose', '--env-file', '.env', '-f', 'docker-compose.yml'];
const developmentLocalEnvPath = '.env.development.local';

function resolveCommand(command) {
  return isWindows ? `${command}.cmd` : command;
}

function spawnCommand(command, args, options = {}) {
  return spawn(resolveCommand(command), args, {
    cwd: rootCwd,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
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

async function runStep(label, command, args) {
  console.log(`\n[iWana dev] ${label}`);
  const child = spawnCommand(command, args);
  await waitForExit(child, label);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return new Map();
  }

  const entries = new Map();
  const fileContent = readFileSync(filePath, 'utf8');

  for (const rawLine of fileContent.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    entries.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  return entries;
}

function escapePemForEnv(pem) {
  return pem.trimEnd().replace(/\n/g, '\\n');
}

function ensureDevelopmentLocalEnv() {
  const localEnv = parseEnvFile(developmentLocalEnvPath);

  if (localEnv.has('JWT_PRIVATE_KEY') && localEnv.has('JWT_PUBLIC_KEY')) {
    return;
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  appendFileSync(
    developmentLocalEnvPath,
    `\n# Generado automaticamente por pnpm run dev. No versionar.\nJWT_PRIVATE_KEY=${escapePemForEnv(privateKey)}\nJWT_PUBLIC_KEY=${escapePemForEnv(publicKey)}\n`,
    'utf8',
  );

  console.log('[iWana dev] JWT local generado en .env.development.local');
}

async function waitForApiHealth() {
  const url = 'http://127.0.0.1:3000/api/v1/health';
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        console.log(`[iWana dev] API healthy after ${attempt} attempt(s)`);
        return;
      }
    } catch {
      // La API puede seguir compilando; reintentamos hasta que quede lista.
    }

    await delay(1000);
  }

  throw new Error('API health check timed out at http://127.0.0.1:3000/api/v1/health');
}

function terminate(child, signal = 'SIGTERM') {
  if (!child || child.killed) {
    return;
  }

  try {
    child.kill(signal);
  } catch {
    // No-op: el proceso pudo haber terminado entre el chequeo y la señal.
  }
}

async function main() {
  ensureDevelopmentLocalEnv();

  await runStep('Liberando puertos de desarrollo', 'pnpm', ['dev:free-ports']);

  await runStep('Levantando infraestructura Docker local', 'docker', [
    ...composeArgs,
    'up',
    '-d',
    '--wait',
    'postgres',
    'redis',
    'pgbouncer',
    'minio',
    'typesense',
    'nginx',
    'adminer',
  ]);

  await runStep('Inicializando bucket MinIO local', 'docker', [
    ...composeArgs,
    'run',
    '--rm',
    'minio-init',
  ]);

  await runStep('Compilando @iwana/shared', 'pnpm', ['--filter', '@iwana/shared', 'build']);
  await runStep('Ejecutando migraciones', 'pnpm', ['db:migrate:all']);

  console.log('\n[iWana dev] Iniciando API en modo watch');
  const apiChild = spawnCommand('pnpm', ['--filter', '@iwana/api', 'dev']);

  const shutdown = (signal) => {
    terminate(apiChild, signal);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await waitForApiHealth();
  } catch (error) {
    terminate(apiChild, 'SIGTERM');
    throw error;
  }

  console.log('\n[iWana dev] Iniciando frontends y worker');
  const turboChild = spawnCommand('pnpm', [
    'exec',
    'turbo',
    'run',
    'dev',
    '--filter=@iwana/web',
    '--filter=@iwana/portal',
    '--filter=@iwana/worker',
  ]);

  const apiExitPromise = new Promise((resolve, reject) => {
    apiChild.once('error', reject);
    apiChild.once('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve({ source: 'api', code: code ?? 0, signal });
        return;
      }

      reject(new Error(`API dev process exited unexpectedly with ${signal ?? code}`));
    });
  });

  const turboExitPromise = new Promise((resolve, reject) => {
    turboChild.once('error', reject);
    turboChild.once('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve({ source: 'turbo', code: code ?? 0, signal });
        return;
      }

      reject(new Error(`Turbo dev process exited unexpectedly with ${signal ?? code}`));
    });
  });

  try {
    await Promise.race([apiExitPromise, turboExitPromise]);
  } finally {
    terminate(turboChild, 'SIGTERM');
    terminate(apiChild, 'SIGTERM');
  }
}

main().catch((error) => {
  console.error(`\n[iWana dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
