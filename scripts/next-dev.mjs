// Lanzador de `next dev` con interfaz de escucha controlada (ADR-078 D2 — P0).
//
// `next dev` sin `-H` liga a todas las interfaces. Mientras no exista TLS, eso
// deja las pantallas y el proxy de rewrites (`/api/v1/*` → API) alcanzables en
// claro desde cualquier equipo del segmento de red. Este wrapper fuerza el
// default a 127.0.0.1 y permite abrirlo de forma explicita con BIND_HOST.
//
// Es un wrapper en Node y no una expansion de shell en `package.json` porque
// pnpm ejecuta los scripts con cmd.exe en Windows: `${BIND_HOST:-127.0.0.1}` no
// se expandiria y el flag llegaria literal a Next.
//
// Solo afecta al modo desarrollo. `next build` / `next start` (imagenes de
// produccion) no pasan por aqui.
//
// Uso:  node ../../scripts/next-dev.mjs --port 3001 [--webpack ...]
// Revertir la mitigacion: BIND_HOST=0.0.0.0 (variable, sin editar codigo).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

export const DEFAULT_BIND_HOST = '127.0.0.1';
// Mismo orden de precedencia que usa la API para su configuracion de desarrollo:
// el archivo local no versionado gana sobre la plantilla versionada.
export const bindHostEnvFiles = ['.env.development.local', '.env.development', '.env'];

/** Lee `KEY=value` de un archivo .env sin arrastrar dependencias. */
export function readEnvValue(contents, key) {
  for (const rawLine of String(contents).split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const name = line
      .slice(0, separatorIndex)
      .replace(/^export\s+/u, '')
      .trim();

    if (name !== key) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    return value.trim();
  }

  return '';
}

/**
 * Resuelve la interfaz de escucha: entorno del shell → archivos .env de la raiz
 * → 127.0.0.1. Next no carga los .env de la raiz del monorepo (solo los de su
 * propio directorio), asi que la lectura es explicita.
 */
export function resolveBindHost(env = process.env, root = repoRoot) {
  const fromShell = env['BIND_HOST']?.trim();

  if (fromShell) {
    return fromShell;
  }

  for (const fileName of bindHostEnvFiles) {
    const filePath = join(root, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const value = readEnvValue(readFileSync(filePath, 'utf8'), 'BIND_HOST');

    if (value) {
      return value;
    }
  }

  return DEFAULT_BIND_HOST;
}

function main() {
  const forwardedArgs = process.argv.slice(2);
  const bindHost = resolveBindHost();

  // `next` es dependencia de cada app, no del root: se resuelve desde el cwd de
  // la app y se invoca con el ejecutable de Node para no depender de un shell.
  const requireFromApp = createRequire(join(process.cwd(), 'package.json'));
  const nextBin = requireFromApp.resolve('next/dist/bin/next');

  const child = spawn(process.execPath, [nextBin, 'dev', '-H', bindHost, ...forwardedArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  const forwardSignal = (signal) => {
    if (child.exitCode === null && !child.killed) {
      child.kill(signal);
    }
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('error', (error) => {
    console.error(`[next-dev] no se pudo iniciar next dev: ${error.message}`);
    process.exitCode = 1;
  });

  child.once('exit', (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 0);
  });
}

const invokedPath = process.argv[1];
const isMainModule = invokedPath
  ? resolve(invokedPath) === resolve(fileURLToPath(import.meta.url))
  : false;

if (isMainModule) {
  main();
}
