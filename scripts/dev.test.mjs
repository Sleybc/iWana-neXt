import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildMissingDevEnvMessage,
  createProcessRegistry,
  devComposeFiles,
  devInfraOneShots,
  devInfraServices,
  findMissingDevEnvVars,
  parseEnvFile,
  requiredDevEnvVars,
  resolvePnpmTarget,
  waitForApiHealth,
  waitForCompilation,
} from './dev.mjs';

// Lee los servicios que declaran un perfil dado en docker-compose.yml sin
// depender de un parser YAML: el archivo usa indentación de 2 espacios para las
// claves de servicio y listas con guion para `profiles:`.
function composeServicesWithProfile(profile) {
  const source = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf8');
  const services = [];
  let currentService = null;
  let inProfiles = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const serviceMatch = rawLine.match(/^ {2}([a-z][a-z0-9_-]*):\s*$/);

    if (serviceMatch) {
      currentService = serviceMatch[1];
      inProfiles = false;
      continue;
    }

    if (!currentService) {
      continue;
    }

    if (/^ {4}profiles:\s*$/.test(rawLine)) {
      inProfiles = true;
      continue;
    }

    if (inProfiles) {
      const entry = rawLine.match(/^ {6}- (\S+)\s*$/);

      if (entry) {
        if (entry[1] === profile) {
          services.push(currentService);
        }

        continue;
      }

      inProfiles = false;
    }
  }

  return services;
}

function productionDockerfiles() {
  const source = readFileSync(join(process.cwd(), 'docker-compose.prod.yml'), 'utf8');

  return [...source.matchAll(/^\s+dockerfile:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
}

function workflowRunBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `no se encontró ${marker}`);

  const commandStart = source.lastIndexOf('docker build', markerIndex);
  assert.notEqual(commandStart, -1, `no se encontró docker build para ${marker}`);

  const nextStep = source.indexOf('\n      - ', markerIndex);

  return source.slice(commandStart, nextStep === -1 ? source.length : nextStep);
}

function workflowJobBlock(source, jobName) {
  const job = new RegExp(`^  ${escapeRegExp(jobName)}:\\s*$`, 'm').exec(source);
  assert.ok(job?.index !== undefined, `no se encontró el job ${jobName}`);

  const followingJob = /^  [\w-]+:\s*$/gm;
  followingJob.lastIndex = job.index + job[0].length;
  const nextJob = followingJob.exec(source);

  return source.slice(job.index, nextJob?.index);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertWorkflowUsesWorkspaceNodeVersion(workflowPath) {
  const source = readFileSync(join(process.cwd(), workflowPath), 'utf8');
  const setupNodeReferences = [...source.matchAll(/uses:\s*actions\/setup-node@[^\n]*/g)];
  const nodeVersionReferences = [...source.matchAll(/^\s*node-version:\s*(.+?)\s*$/gm)];

  assert.ok(setupNodeReferences.length > 0, `${workflowPath} no configura setup-node`);
  assert.ok(
    nodeVersionReferences.every(
      (match) => match[1] === '${{ steps.node-version.outputs.version }}',
    ),
    `${workflowPath} no puede declarar versiones Node literales o flotantes`,
  );
  assert.doesNotMatch(source, /node:(?:24(?:$|[^.\d])|25(?:$|[^.\d]))/);

  for (const setupNodeReference of setupNodeReferences) {
    const setupIndex = setupNodeReference.index;
    const outputStepIndex = source.lastIndexOf('id: node-version', setupIndex);
    const checkoutIndex = source.lastIndexOf('uses: actions/checkout@', setupIndex);

    assert.ok(
      outputStepIndex > checkoutIndex,
      `${workflowPath} debe extraer useNodeVersion después de checkout y antes de setup-node`,
    );

    const extractionStep = source.slice(outputStepIndex, setupIndex);
    assert.match(
      extractionStep,
      /sed\s+-n\s+['"][^'"]*\^useNodeVersion:[^'"]*['"]\s+pnpm-workspace\.yaml/,
    );
    assert.match(
      extractionStep,
      /\[\[\s+"\$version"\s+=~\s+\^24\\\.\[0-9\]\+\\\.\[0-9\]\+\$\s+\]\]/,
    );
    assert.match(extractionStep, /echo\s+"version=\$version"\s+>>\s+"\$GITHUB_OUTPUT"/);

    const setupBlock = source.slice(setupIndex, source.indexOf('\n      - ', setupIndex));
    assert.match(
      setupBlock,
      /node-version:\s*\$\{\{\s*steps\.node-version\.outputs\.version\s*\}\}/,
      `${workflowPath} debe pasar el output de node-version a setup-node`,
    );
  }

  return source;
}

function withNpmExecPath(npmExecPath, callback) {
  const original = process.env.npm_execpath;
  process.env.npm_execpath = npmExecPath;

  try {
    return callback();
  } finally {
    if (original === undefined) {
      delete process.env.npm_execpath;
    } else {
      process.env.npm_execpath = original;
    }
  }
}

test('resolvePnpmTarget keeps Windows pnpm.cmd launches on the shell path', () => {
  withNpmExecPath('C:\\Users\\SLEYB\\AppData\\Roaming\\npm\\pnpm.cmd', () => {
    const target = resolvePnpmTarget(['dev:free-ports']);

    assert.equal(target.command, process.env.ComSpec ?? 'cmd.exe');
    assert.deepEqual(target.args, [
      '/d',
      '/s',
      '/c',
      'C:\\Users\\SLEYB\\AppData\\Roaming\\npm\\pnpm.cmd dev:free-ports',
    ]);
  });
});

test('resolvePnpmTarget executes pnpm.cjs through the current Node runtime', () => {
  withNpmExecPath('C:\\corepack\\pnpm.cjs', () => {
    const target = resolvePnpmTarget(['dev:free-ports']);

    assert.equal(target.command, process.execPath);
    assert.deepEqual(target.args, ['C:\\corepack\\pnpm.cjs', 'dev:free-ports']);
  });
});

test('waitForCompilation rejects initial compilations with TypeScript errors', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  const result = waitForCompilation(child, null, { timeoutMs: 1000 });
  child.stdout.emit('data', '[7:17:20 a. m.] Found 3 errors. Watching for file changes.');

  await assert.rejects(result, /API compilation failed with 3 errors/);
});

test('waitForCompilation detects compilation errors split across chunks', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  const result = waitForCompilation(child, null, { timeoutMs: 1000 });
  child.stdout.emit('data', '[7:17:20 a. m.] Fo');
  child.stdout.emit('data', 'und 2 errors. Watching for file changes.');

  await assert.rejects(result, /API compilation failed with 2 errors/);
});

test('waitForApiHealth reports the last connection failure after its deadline', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };

  try {
    const result = waitForApiHealth(null, child, {
      deadlineMs: 20,
      perAttemptTimeoutMs: 10,
      retryDelayMs: 1,
    });
    child.stdout.emit('data', 'Found 0 errors. Watching for file changes.');

    await assert.rejects(result, /Ultimo resultado: Error: connect ECONNREFUSED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('devComposeFiles carga el overlay de desarrollo despues del archivo base', () => {
  assert.deepEqual(devComposeFiles, ['docker-compose.yml', 'docker-compose.dev.yml']);
});

test('E7 mantiene Node derivado de useNodeVersion en imágenes y CI', () => {
  const workspace = readFileSync(join(process.cwd(), 'pnpm-workspace.yaml'), 'utf8');
  const workspaceVersion = workspace.match(/^useNodeVersion:\s*(24\.\d+\.\d+)$/m)?.[1];
  const dockerfiles = productionDockerfiles();

  assert.match(workspaceVersion ?? '', /^24\.\d+\.\d+$/);
  assert.deepEqual([...dockerfiles].sort(), [
    'apps/api/Dockerfile',
    'apps/portal/Dockerfile',
    'apps/web/Dockerfile',
    'apps/worker/Dockerfile',
    'packages/database/Dockerfile.migrator',
  ]);

  for (const dockerfile of dockerfiles) {
    const source = readFileSync(join(process.cwd(), dockerfile), 'utf8');
    const nodeFroms = [...source.matchAll(/^FROM\s+node:([^\s]+)(?:\s+AS\s+\S+)?\s*$/gim)];

    assert.match(source, new RegExp(`^ARG NODE_VERSION=${workspaceVersion}$`, 'm'));
    assert.ok(nodeFroms.length > 0, `${dockerfile} debe declarar una base Node`);
    assert.ok(
      nodeFroms.every((match) => /^\$\{NODE_VERSION\}(?:-[\w.-]+)?$/.test(match[1])),
      `${dockerfile} debe derivar cada FROM node de NODE_VERSION`,
    );
    assert.doesNotMatch(source, /node:25(?:$|[^.\d])/);
  }

  const ci = assertWorkflowUsesWorkspaceNodeVersion('.github/workflows/ci.yml');
  assertWorkflowUsesWorkspaceNodeVersion('.github/workflows/e2e-web-admin-smoke.yml');
  const productionImages = workflowJobBlock(ci, 'production-images');
  const productionCheckout = productionImages.indexOf('uses: actions/checkout@');
  const productionNodeVersion = productionImages.indexOf('id: node-version');
  const firstProductionBuild = productionImages.indexOf('docker build');

  assert.ok(
    productionCheckout < productionNodeVersion && productionNodeVersion < firstProductionBuild,
    'production-images debe extraer node-version tras checkout y antes de sus builds',
  );

  for (const dockerfile of dockerfiles) {
    const buildMarker = `--file ${dockerfile}`;
    const buildOccurrences = ci.match(new RegExp(escapeRegExp(buildMarker), 'g')) ?? [];
    const buildBlock = workflowRunBlock(ci, buildMarker);

    assert.equal(buildOccurrences.length, 1, `ci.yml debe construir ${dockerfile} una sola vez`);
    assert.match(
      buildBlock,
      /--build-arg\s+NODE_VERSION=\$\{\{\s*steps\.node-version\.outputs\.version\s*\}\}/,
      `ci.yml debe pasar NODE_VERSION a ${dockerfile}`,
    );
  }
});

test('el arranque cubre todos los servicios del perfil development', () => {
  const declared = composeServicesWithProfile('development').sort();
  const arranged = [...devInfraServices, ...devInfraOneShots].sort();

  assert.ok(declared.length > 0, 'no se detectó ningún servicio con perfil development');
  assert.deepEqual(
    arranged,
    declared,
    'docker-compose.yml y el arranque de pnpm dev declaran servicios distintos',
  );
});

test('el arranque no levanta adminer, que tiene perfil opt-in propio', () => {
  assert.equal(devInfraServices.includes('adminer'), false);
  assert.equal(devInfraOneShots.includes('adminer'), false);
  assert.equal(composeServicesWithProfile('adminer').includes('adminer'), true);
});

test('minio-init se ejecuta como one-shot y no como servicio de up --wait', () => {
  // `up --wait` trata un contenedor que termina como servicio caído: el
  // inicializador del bucket debe correr con `run --rm`, no dentro del `up`.
  assert.ok(devInfraOneShots.includes('minio-init'));
  assert.equal(devInfraServices.includes('minio-init'), false);
});

test('createProcessRegistry apaga tanto los pasos en curso como los procesos gestionados', () => {
  const terminated = [];
  const registry = createProcessRegistry((child, signal) => {
    terminated.push([child.name, signal]);
  });

  const step = { name: 'migraciones' };
  const api = { name: 'api' };
  registry.trackStep(step);
  registry.trackManaged(api);
  registry.shutdownAll('SIGTERM');

  assert.deepEqual(terminated, [
    ['migraciones', 'SIGTERM'],
    ['api', 'SIGTERM'],
  ]);
});

test('createProcessRegistry deja de seguir un paso cuando este termina', () => {
  const terminated = [];
  const registry = createProcessRegistry((child, signal) => {
    terminated.push([child.name, signal]);
  });

  const untrack = registry.trackStep({ name: 'builds' });
  untrack();
  registry.shutdownAll('SIGTERM');

  assert.deepEqual(terminated, []);
});

test('parseEnvFile ignora comentarios y desenvuelve valores entrecomillados', () => {
  const values = parseEnvFile(
    [
      '# comentario',
      '',
      'NGINX_IMAGE=nginx:1.31.2-alpine',
      "DB_APP_USER='iwana_app'",
      'SIN_IGUAL',
    ].join('\n'),
  );

  assert.equal(values.get('NGINX_IMAGE'), 'nginx:1.31.2-alpine');
  assert.equal(values.get('DB_APP_USER'), 'iwana_app');
  assert.equal(values.has('SIN_IGUAL'), false);
});

test('findMissingDevEnvVars trata el valor vacio como ausente, igual que ${VAR:?}', () => {
  const missing = findMissingDevEnvVars(new Map([['NGINX_IMAGE', '   ']]), {}, ['NGINX_IMAGE']);

  assert.deepEqual(missing, ['NGINX_IMAGE']);
});

test('findMissingDevEnvVars da precedencia al entorno del shell sobre .env', () => {
  const missing = findMissingDevEnvVars(new Map(), { NGINX_IMAGE: 'nginx:1.31.2-alpine' }, [
    'NGINX_IMAGE',
  ]);

  assert.deepEqual(missing, []);
});

test('requiredDevEnvVars cubre las variables sin default de docker-compose.yml', () => {
  for (const name of [
    'DB_BOOTSTRAP_USER',
    'DB_PASSWORD',
    'DB_APP_USER',
    'DB_APP_PASSWORD',
    'DB_MIGRATOR_USER',
    'DB_MIGRATOR_PASSWORD',
    'MINIO_ROOT_USER',
    'MINIO_ROOT_PASSWORD',
    'TYPESENSE_API_KEY',
    'PGBOUNCER_IMAGE',
    'MINIO_IMAGE',
    'MINIO_MC_IMAGE',
    'NGINX_IMAGE',
  ]) {
    assert.ok(requiredDevEnvVars.includes(name), `falta ${name} en requiredDevEnvVars`);
  }
});

test('buildMissingDevEnvMessage nombra la variable, el archivo y la referencia', () => {
  const message = buildMissingDevEnvMessage(['DB_BOOTSTRAP_USER'], '.env');

  assert.match(message, /DB_BOOTSTRAP_USER/);
  assert.match(message, /\.env/);
  assert.match(message, /\.env\.example/);
});

test('waitForApiHealth starts its deadline after compilation completes', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;

  const result = waitForApiHealth(null, child, {
    deadlineMs: 25,
    perAttemptTimeoutMs: 10,
    retryDelayMs: 1,
    fetchImpl: async () => ({ ok: true, status: 200, statusText: 'OK' }),
  });

  setTimeout(() => {
    child.stdout.emit('data', 'Found 0 errors. Watching for file changes.');
  }, 20);

  await result;
});
