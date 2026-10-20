import { spawn } from 'node:child_process';
import { access, cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const portalRoot = join(repoRoot, 'apps', 'portal');
const standaloneRoot = join(portalRoot, '.next', 'standalone');
const serverPath = join(standaloneRoot, 'apps', 'portal', 'server.js');

function readPort(args) {
  const index = args.indexOf('--port');
  const value = index >= 0 ? args[index + 1] : '3002';
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Puerto E2E inválido: ${value}`);
  }

  return String(port);
}

function run(command, args, options) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: 'inherit',
    });

    const forwardSignal = (signal) => {
      if (child.exitCode === null && !child.killed) {
        child.kill(signal);
      }
    };

    process.once('SIGINT', forwardSignal);
    process.once('SIGTERM', forwardSignal);
    child.once('error', (error) => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);
      resolveExit(signal ? 1 : (code ?? 1));
    });
  });
}

async function copyIfPresent(source, destination) {
  try {
    await access(source);
  } catch {
    return;
  }

  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function main() {
  const port = readPort(process.argv.slice(2));
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    IWANA_DISABLE_CACHE_COMPONENTS: '0',
    NEXT_PUBLIC_PORTAL_API_URL: '',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const [buildCommand, buildArgs] =
    process.platform === 'win32'
      ? [
          process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe',
          ['/d', '/s', '/c', 'pnpm --filter @iwana/portal build'],
        ]
      : ['pnpm', ['--filter', '@iwana/portal', 'build']];

  console.info('[portal-e2e] Generando build standalone de producción…');
  const buildExitCode = await run(buildCommand, buildArgs, {
    cwd: repoRoot,
    env,
  });

  if (buildExitCode !== 0) {
    process.exitCode = buildExitCode;
    return;
  }

  const staticSource = join(portalRoot, '.next', 'static');
  const staticDestination = join(standaloneRoot, 'apps', 'portal', '.next', 'static');
  await copyIfPresent(staticSource, staticDestination);
  await copyIfPresent(join(portalRoot, 'public'), join(standaloneRoot, 'apps', 'portal', 'public'));
  await access(serverPath);

  const standaloneEnv = {
    ...env,
    HOSTNAME: '127.0.0.1',
    PORT: port,
  };

  console.info(`[portal-e2e] Iniciando standalone en http://127.0.0.1:${port}.`);
  const serverExitCode = await run(process.execPath, [serverPath], {
    cwd: join(standaloneRoot, 'apps', 'portal'),
    env: standaloneEnv,
  });
  process.exitCode = serverExitCode;
}

main().catch((error) => {
  console.error(`[portal-e2e] No se pudo iniciar el servidor standalone: ${error.message}`);
  process.exitCode = 1;
});
