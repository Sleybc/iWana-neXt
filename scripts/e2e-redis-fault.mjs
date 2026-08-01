#!/usr/bin/env node
/**
 * e2e-redis-fault.mjs — pausa/reanuda el Redis REAL del stack E2E para las
 * pruebas de fail-closed del rate limiter de OT (QA-33).
 *
 * Subcomandos:
 *   pause   — detiene el contenedor Redis del stack E2E (simula la caída del store)
 *   resume  — arranca el contenedor Redis y espera a que el proceso corra
 *   status  — reporta el estado del contenedor Redis del stack E2E
 *
 * El stack se deriva del compose real del repo (nada se hardcodea fuera de él):
 *   - Archivos: docker-compose.yml + docker-compose.e2e.yml, proyecto
 *     `iwana-e2e-r41`, perfiles development+e2e — la misma invocación que usa
 *     scripts/e2e-provision-operational.mjs.
 *   - Servicio: se localiza en los compose por `image`/`container_name` que
 *     contengan "redis" (services.redis del compose base y del overlay E2E).
 *   - Las variables `${VAR:?}` del compose se cubren con placeholders de
 *     laboratorio solo para interpolar la configuración; no se imprimen y no
 *     son credenciales reales.
 *
 * Overrides por entorno (para otros stacks, p. ej. development):
 *   E2E_REDIS_FAULT_PROJECT, E2E_REDIS_FAULT_COMPOSE_FILES (csv),
 *   E2E_REDIS_FAULT_PROFILES (csv), E2E_REDIS_FAULT_SERVICE.
 *
 * Seguridad: exit != 0 con mensaje claro si Redis no está corriendo o Docker
 * no está disponible; cero credenciales y cero PII en la salida.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const composeFiles = (
  process.env.E2E_REDIS_FAULT_COMPOSE_FILES ?? 'docker-compose.yml,docker-compose.e2e.yml'
)
  .split(',')
  .map((file) => resolve(WORKSPACE_ROOT, file.trim()))
  .filter(Boolean);

const project = process.env.E2E_REDIS_FAULT_PROJECT ?? 'iwana-e2e-r41';
const profiles = (process.env.E2E_REDIS_FAULT_PROFILES ?? 'development,e2e')
  .split(',')
  .map((profile) => profile.trim())
  .filter(Boolean);

const CONTAINER_POLL_STEPS_MS = [200, 400, 800];
const STOP_WAIT_TIMEOUT_MS = 20_000;
const START_WAIT_TIMEOUT_MS = 45_000;

/** Localiza el servicio redis en los compose reales (por image/container_name). */
function findRedisService() {
  let inServices = false;
  let currentService = null;
  for (const file of composeFiles) {
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === 'services:') {
        inServices = true;
        currentService = null;
        continue;
      }
      if (!inServices || line === '' || line.startsWith('#')) continue;
      if (/^[A-Za-z0-9_-]+:\s*$/u.test(line)) {
        currentService = line.slice(0, -1).trim();
        continue;
      }
      if (
        currentService &&
        (line.startsWith('container_name:') || line.startsWith('image:')) &&
        /redis/iu.test(line)
      ) {
        return currentService;
      }
    }
  }
  return null;
}

/** Nombres `${VAR:?}` exigidos por el compose; se cubren solo para interpolar. */
function requiredInterpolationVars() {
  const names = new Set();
  for (const file of composeFiles) {
    if (!existsSync(file)) continue;
    for (const match of readFileSync(file, 'utf8').matchAll(/\$\{([A-Z0-9_]+):\?/gu)) {
      names.add(match[1]);
    }
  }
  return names;
}

function buildEnv() {
  const env = { ...process.env };
  // Placeholders de laboratorio: el comando (stop/start) no usa credenciales;
  // el compose solo las exige para interpolar la configuración.
  for (const name of requiredInterpolationVars()) {
    if (!env[name]) env[name] = 'lab-redis-fault';
  }
  return env;
}

function composeArgs(extraArgs) {
  return [
    'compose',
    '-p',
    project,
    ...profiles.flatMap((profile) => ['--profile', profile]),
    ...composeFiles.flatMap((file) => ['-f', file]),
    ...extraArgs,
  ];
}

function runDocker(args, { captureOutput = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: WORKSPACE_ROOT,
    env: buildEnv(),
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) {
    throw new Error(`Docker no está disponible: ${result.error.message}`);
  }
  return result;
}

function fail(message) {
  console.error(`REDIS_FAULT=ERROR|${message}`);
  process.exit(1);
}

function containerId(service) {
  // `-a` es imprescindible: sin él, docker compose ps omite el contenedor
  // detenido y el script no podría distinguir "detenido" de "no existe".
  const result = runDocker(composeArgs(['ps', '-a', '-q', service]), { captureOutput: true });
  const id = (result.stdout ?? '').trim().split(/\r?\n/u)[0] ?? '';
  return id || null;
}

function containerRunning(id) {
  const result = runDocker(['inspect', '-f', '{{.State.Running}}', id], { captureOutput: true });
  return (result.stdout ?? '').trim() === 'true';
}

function containerName(id) {
  const result = runDocker(['inspect', '-f', '{{.Name}}', id], { captureOutput: true });
  return (result.stdout ?? '').trim().replace(/^\//u, '');
}

function waitForState(service, wantRunning, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    const id = containerId(service);
    if (id) {
      lastState = containerRunning(id);
      if (lastState === wantRunning) return id;
    } else {
      lastState = null;
      if (!wantRunning && lastState === null) return null;
    }
    for (const step of CONTAINER_POLL_STEPS_MS) {
      if (Date.now() >= deadline) break;
      // Espera acotada entre sondas de estado; nunca duerme más allá del deadline.
      const waitMs = Math.min(step, deadline - Date.now());
      if (waitMs <= 0) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  return lastState === wantRunning ? containerId(service) : undefined;
}

function redisContainersHint() {
  const result = spawnSync(
    'docker',
    ['ps', '-a', '--filter', 'name=redis', '--format', '{{.Names}}'],
    {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
    },
  );
  const names = (result.stdout ?? '')
    .trim()
    .split(/\r?\n/u)
    .map((name) => name.trim())
    .filter((name) => name !== '' && /redis/iu.test(name));
  if (names.length === 0) return '';
  return (
    ` Se encontraron contenedores de otros stacks: ${names.join(', ')}. ` +
    'Si usas el stack development: E2E_REDIS_FAULT_PROJECT=appiw ' +
    'E2E_REDIS_FAULT_COMPOSE_FILES=docker-compose.yml,docker-compose.dev.yml ' +
    'E2E_REDIS_FAULT_PROFILES=development node scripts/e2e-redis-fault.mjs <comando>.'
  );
}

function requireService(service) {
  if (!service) {
    fail('No se localizó un servicio redis en los compose configurados.');
  }
  return service;
}

function commandStatus(service) {
  const id = containerId(service);
  if (!id) {
    console.error(
      `REDIS_FAULT_STATUS=MISSING|service=${service}|project=${project}` +
        ` Redis del stack E2E no está corriendo (¿se provisionó la infraestructura?).${redisContainersHint()}`,
    );
    process.exit(1);
  }
  const running = containerRunning(id);
  if (running) {
    console.log(`REDIS_FAULT_STATUS=RUNNING|service=${service}|container=${containerName(id)}`);
    process.exit(0);
  }
  console.error(
    `REDIS_FAULT_STATUS=STOPPED|service=${service}|container=${containerName(id)}` +
      ' Redis del stack E2E está detenido.',
  );
  process.exit(1);
}

function commandPause(service) {
  const id = containerId(service);
  if (!id) {
    fail(
      `El servicio ${service} no tiene contenedor en el proyecto ${project}: ` +
        'el stack E2E no está levantado. Provisiona la infraestructura primero.' +
        redisContainersHint(),
    );
  }
  const stoppedName = containerName(id);
  if (!containerRunning(id)) {
    fail(`Redis del stack E2E (${stoppedName}) ya estaba detenido; no se cambió nada.`);
  }
  const result = runDocker(composeArgs(['stop', '-t', '10', service]));
  if (result.status !== 0) {
    fail(`docker compose stop ${service} terminó con código ${result.status ?? 1}.`);
  }
  if (waitForState(service, false, STOP_WAIT_TIMEOUT_MS) === undefined) {
    fail(`Redis del stack E2E no alcanzó el estado detenido en ${STOP_WAIT_TIMEOUT_MS}ms.`);
  }
  console.log(`REDIS_FAULT=PAUSED|service=${service}|container=${stoppedName}`);
  console.log('Redis del stack E2E detenido: el rate limiter de OT opera en fail-closed.');
}

function commandResume(service) {
  const id = containerId(service);
  if (!id) {
    fail(
      `El servicio ${service} no tiene contenedor en el proyecto ${project}: ` +
        'el stack E2E no está levantado.' +
        redisContainersHint(),
    );
  }
  if (containerRunning(id)) {
    console.log(`REDIS_FAULT=ALREADY_RUNNING|service=${service}|container=${containerName(id)}`);
    return;
  }
  const result = runDocker(composeArgs(['start', service]));
  if (result.status !== 0) {
    fail(`docker compose start ${service} terminó con código ${result.status ?? 1}.`);
  }
  if (waitForState(service, true, START_WAIT_TIMEOUT_MS) === undefined) {
    fail(`Redis del stack E2E no alcanzó el estado en ejecución en ${START_WAIT_TIMEOUT_MS}ms.`);
  }
  console.log(
    `REDIS_FAULT=RESUMED|service=${service}|container=${containerName(containerId(service))}`,
  );
  console.log('Redis del stack E2E en ejecución: el rate limiter de OT vuelve a operar normal.');
}

try {
  const subcommand = process.argv[2];
  if (!['pause', 'resume', 'status'].includes(subcommand)) {
    fail(
      `Subcomando desconocido '${subcommand ?? ''}'. Uso: node scripts/e2e-redis-fault.mjs ` +
        '{pause|resume|status}',
    );
  }

  const service = process.env.E2E_REDIS_FAULT_SERVICE?.trim() || findRedisService();
  requireService(service);

  if (subcommand === 'status') commandStatus(service);
  if (subcommand === 'pause') commandPause(service);
  if (subcommand === 'resume') commandResume(service);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
