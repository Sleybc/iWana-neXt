#!/usr/bin/env node
/**
 * Provisiona y ejecuta el E2E operativo contra un entorno local efímero.
 *
 * No contiene credenciales: las toma del entorno y genera las credenciales de
 * usuarios de prueba en memoria. El tenant y sus schemas se eliminan al final
 * cuando E2E_CLEANUP no se desactiva explícitamente.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import process from 'node:process';
import crypto from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Fuente única del piso del vertical R4.1 (tests 4a/4b/4c/4d/4e).
const REQUIRED_OPERATIONAL_E2E_PASSED = 29;

function collectOperationalMarkers(logContents) {
  const markers = new Map();

  for (const line of String(logContents).split(/\r?\n/u)) {
    const match = line.match(/^(E2E_(?:SETUP|CLEANUP|PLAYWRIGHT_[A-Z_]+))=(.*)$/u);
    if (!match) {
      continue;
    }

    const [, name, value] = match;
    const values = markers.get(name) ?? [];
    values.push(value);
    markers.set(name, values);
  }

  return markers;
}

function readSingleMarker(markers, name) {
  const values = markers.get(name);
  if (!values || values.length === 0) {
    throw new Error(`${name} ausente`);
  }
  if (values.length !== 1) {
    throw new Error(`${name} duplicado`);
  }
  return values[0];
}

function readMarkerCount(markers, name) {
  const value = readSingleMarker(markers, name);
  if (!/^(0|[1-9]\d*)$/u.test(value)) {
    throw new Error(`${name} no es un entero no negativo`);
  }

  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    throw new Error(`${name} excede el rango seguro`);
  }
  return count;
}

function verifyOperationalMarkers(logContents) {
  if (!String(logContents).trim()) {
    throw new Error('log ausente o vacío');
  }

  const markers = collectOperationalMarkers(logContents);
  const setup = readSingleMarker(markers, 'E2E_SETUP');
  if (!(setup === 'OK' || setup.startsWith('OK|'))) {
    throw new Error(`E2E_SETUP no está OK (${setup})`);
  }

  if (readSingleMarker(markers, 'E2E_PLAYWRIGHT_EXIT') !== '0') {
    throw new Error('E2E_PLAYWRIGHT_EXIT distinto de 0');
  }
  if (markers.get('E2E_PLAYWRIGHT_COUNTS')?.includes('UNPARSED')) {
    throw new Error('resumen de conteos Playwright no parseado');
  }
  if (readSingleMarker(markers, 'E2E_CLEANUP') !== 'OK') {
    throw new Error('E2E_CLEANUP no está OK');
  }

  const counts = {
    passed: readMarkerCount(markers, 'E2E_PLAYWRIGHT_PASSED'),
    failed: readMarkerCount(markers, 'E2E_PLAYWRIGHT_FAILED'),
    skipped: readMarkerCount(markers, 'E2E_PLAYWRIGHT_SKIPPED'),
    didNotRun: readMarkerCount(markers, 'E2E_PLAYWRIGHT_DID_NOT_RUN'),
    flaky: readMarkerCount(markers, 'E2E_PLAYWRIGHT_FLAKY'),
  };

  if (counts.failed !== 0) {
    throw new Error(`Tests fallidos: ${counts.failed}`);
  }
  if (counts.skipped !== 0) {
    throw new Error(`Tests skipped: ${counts.skipped}`);
  }
  if (counts.didNotRun !== 0) {
    throw new Error(`Tests sin ejecutar: ${counts.didNotRun}`);
  }
  if (counts.flaky !== 0) {
    throw new Error(`Tests flaky/retried: ${counts.flaky}`);
  }
  if (counts.passed < REQUIRED_OPERATIONAL_E2E_PASSED) {
    throw new Error(`Tests passed: ${counts.passed} (mínimo ${REQUIRED_OPERATIONAL_E2E_PASSED})`);
  }

  return counts;
}

function markerFixture(overrides = {}) {
  const counts = {
    passed: REQUIRED_OPERATIONAL_E2E_PASSED,
    failed: 0,
    skipped: 0,
    didNotRun: 0,
    flaky: 0,
    ...overrides,
  };

  return [
    'E2E_SETUP=OK|fixture',
    'E2E_PLAYWRIGHT_EXIT=0',
    `E2E_PLAYWRIGHT_PASSED=${counts.passed}`,
    `E2E_PLAYWRIGHT_FAILED=${counts.failed}`,
    `E2E_PLAYWRIGHT_SKIPPED=${counts.skipped}`,
    `E2E_PLAYWRIGHT_DID_NOT_RUN=${counts.didNotRun}`,
    `E2E_PLAYWRIGHT_FLAKY=${counts.flaky}`,
    'E2E_CLEANUP=OK',
  ].join('\n');
}

function expectMarkerGateFailure(logContents, caseName) {
  try {
    verifyOperationalMarkers(logContents);
  } catch {
    return;
  }
  throw new Error(`Caso ${caseName} debía fallar el gate`);
}

function validateOperationalMarkerLogic() {
  const pass = verifyOperationalMarkers(markerFixture());
  if (pass.passed !== REQUIRED_OPERATIONAL_E2E_PASSED || pass.flaky !== 0) {
    throw new Error('Caso PASS no conservó passed=29 y flaky=0');
  }

  expectMarkerGateFailure(markerFixture({ passed: 28 }), 'passed=28');
  expectMarkerGateFailure(markerFixture({ flaky: 1 }), 'flaky=1');
}

const verifyMarkersArgumentIndex = process.argv.indexOf('--verify-playwright-markers');
if (verifyMarkersArgumentIndex !== -1) {
  const logPath = process.argv[verifyMarkersArgumentIndex + 1];
  if (!logPath) {
    console.error('Falta la ruta del log de marcadores E2E.');
    process.exit(1);
  }

  try {
    const counts = verifyOperationalMarkers(readFileSync(logPath, 'utf8'));
    console.log(
      `✅ Gates E2E R4.1 OK: passed=${counts.passed} failed=${counts.failed} skipped=${counts.skipped} did-not-run=${counts.didNotRun} flaky=${counts.flaky}`,
    );
    process.exit(0);
  } catch (error) {
    console.error(
      `::error title=E2E gate::${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

if (process.argv.includes('--validate-playwright-markers')) {
  try {
    validateOperationalMarkerLogic();
    console.log('✅ Parser E2E validado: 29/0/0/0/0 PASS; 28 y flaky>0 FAIL.');
    process.exit(0);
  } catch (error) {
    console.error(
      `❌ Validación del parser E2E falló: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;

function loadWorkspaceEnv() {
  const loadEnvFile = process.loadEnvFile;

  if (!loadEnvFile) {
    return;
  }

  for (const file of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(file);
    } catch {
      // El entorno del shell conserva prioridad y puede ser suficiente.
    }
  }
}

loadWorkspaceEnv();

function randomRuntimeValue(prefix) {
  return `${prefix}-${crypto.randomBytes(18).toString('hex')}`;
}

function setRuntimeDefault(name, value) {
  if (!process.env[name] || process.env[name].trim() === '') {
    process.env[name] = value;
  }
}

// El runner de CI no tiene .env local. Estos valores son referencias de
// laboratorio no persistentes; las contraseñas se generan en memoria y nunca
// se imprimen ni se escriben en archivos versionados.
setRuntimeDefault('DB_BOOTSTRAP_USER', 'iwana');
setRuntimeDefault('DB_NAME', 'dbiw');
setRuntimeDefault('DB_HOST', 'localhost');
setRuntimeDefault('DB_PORT', '5433');
setRuntimeDefault('DB_USER', 'iwana_app');
setRuntimeDefault('DB_APP_USER', 'iwana_app');
setRuntimeDefault('DB_PASSWORD', randomRuntimeValue('e2e-db-bootstrap'));
setRuntimeDefault('DB_APP_PASSWORD', randomRuntimeValue('e2e-db-app'));
setRuntimeDefault('DB_MIGRATOR_USER', 'iwana_migrator');
setRuntimeDefault('DB_MIGRATOR_PASSWORD', randomRuntimeValue('e2e-db-migrator'));
setRuntimeDefault('REDIS_HOST', 'localhost');
setRuntimeDefault('E2E_DB_PORT', '15433');
setRuntimeDefault('E2E_REDIS_PORT', '16380');
setRuntimeDefault('E2E_MINIO_API_PORT', '19002');
setRuntimeDefault('E2E_MINIO_CONSOLE_PORT', '19003');
setRuntimeDefault('E2E_TYPESENSE_PORT', '18108');
// R4.1 usa puertos y volúmenes propios para no tocar el entorno development.
process.env.DB_PORT = process.env.E2E_DB_PORT;
process.env.REDIS_PORT = process.env.E2E_REDIS_PORT;
setRuntimeDefault('REDIS_DB', '0');
setRuntimeDefault('MINIO_ROOT_USER', `e2e-minio-${suffix.slice(-8)}`);
setRuntimeDefault('MINIO_ROOT_PASSWORD', randomRuntimeValue('e2e-minio'));
setRuntimeDefault('S3_BUCKET', 'iwana-media');
setRuntimeDefault('S3_REGION', 'us-east-1');
setRuntimeDefault('S3_FORCE_PATH_STYLE', 'true');
setRuntimeDefault('TYPESENSE_API_KEY', randomRuntimeValue('e2e-typesense'));
setRuntimeDefault('PGBOUNCER_IMAGE', 'edoburu/pgbouncer:v1.24.1-p1');
setRuntimeDefault('MINIO_IMAGE', 'minio/minio:RELEASE.2025-09-07T16-13-09Z');
setRuntimeDefault('MINIO_MC_IMAGE', 'minio/mc:RELEASE.2025-08-13T08-35-41Z');
setRuntimeDefault('NGINX_IMAGE', 'nginx:1.31.2-alpine');
process.env.MINIO_API_PORT = process.env.E2E_MINIO_API_PORT;
process.env.MINIO_CONSOLE_PORT = process.env.E2E_MINIO_CONSOLE_PORT;
process.env.TYPESENSE_PORT = process.env.E2E_TYPESENSE_PORT;
process.env.S3_ENDPOINT = `http://127.0.0.1:${process.env.MINIO_API_PORT}`;
// API y worker deben usar exactamente la identidad efímera del MinIO levantado.
process.env.S3_ACCESS_KEY_ID = process.env.MINIO_ROOT_USER;
process.env.S3_SECRET_ACCESS_KEY = process.env.MINIO_ROOT_PASSWORD;
process.env.STORAGE_DRIVER = 'minio';

if (
  !process.env.JWT_PRIVATE_KEY ||
  process.env.JWT_PRIVATE_KEY.startsWith('CHANGE_ME_') ||
  !process.env.JWT_PUBLIC_KEY ||
  process.env.JWT_PUBLIC_KEY.startsWith('CHANGE_ME_')
) {
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  process.env.JWT_PRIVATE_KEY = keyPair.privateKey;
  process.env.JWT_PUBLIC_KEY = keyPair.publicKey;
}

// SEC-P1: la API (NODE_ENV≠test) exige PII_HASH_KEY en Joi fail-fast.
// CI debe inyectarla; este default cubre runners locales sin .env.
setRuntimeDefault('PII_HASH_KEY', crypto.randomBytes(32).toString('hex'));
setRuntimeDefault('MFA_ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
setRuntimeDefault('EXECUTION_ORDER_IDEMPOTENCY_SECRET', crypto.randomBytes(24).toString('hex'));

const API_ROOT = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/api\/v1\/?$/u,
  '',
);
const API_PREFIX = `${API_ROOT}/api/v1`;
const composeFiles = ['docker-compose.yml', 'docker-compose.e2e.yml'];
const e2eComposeProject = 'iwana-e2e-r41';
const composeBaseArgs = [
  'compose',
  '-p',
  e2eComposeProject,
  '--profile',
  'development',
  '--profile',
  'e2e',
  ...composeFiles.flatMap((file) => ['-f', file]),
];
const workerContainer = 'iwana_worker_e2e';

// R4.1 corre siempre contra una base efímera recién migrada: el único
// superusuario de plataforma que existe ahí es el que `PlatformBootstrapService`
// crea a partir de PLATFORM_SUPER_ADMIN_*. Las variables E2E_PLATFORM_* son la
// convención de los E2E web contra entornos compartidos, donde ya hay cuentas QA
// sembradas; tomarlas primero aquí devuelve 401 porque esa cuenta nunca se
// provisiona. Se leen como pareja para no mezclar identidades.
const [platformEmail, platformPassword] =
  process.env.PLATFORM_SUPER_ADMIN_EMAIL && process.env.PLATFORM_SUPER_ADMIN_PASSWORD
    ? [process.env.PLATFORM_SUPER_ADMIN_EMAIL, process.env.PLATFORM_SUPER_ADMIN_PASSWORD]
    : [process.env.E2E_PLATFORM_EMAIL, process.env.E2E_PLATFORM_PASSWORD];
const tenantSlug = process.env.E2E_TENANT_SLUG ?? `e2e-r1-r41-${suffix}`;
const otherTenantSlug = process.env.E2E_OTHER_TENANT_SLUG ?? `e2e-tenant-b-${suffix}`;
const tenantAdminEmail = `e2e-admin-${suffix}@example.invalid`;
const otherTenantAdminEmail = `e2e-admin-b-${suffix}@example.invalid`;
const nocEmail = process.env.E2E_NOC_EMAIL ?? `noc@${tenantSlug}.invalid`;
const techEmail = process.env.E2E_TECH_EMAIL ?? `tech@${tenantSlug}.invalid`;
const coordinatorEmail = process.env.E2E_COORDINATOR_RO_EMAIL ?? `coord-ro@${tenantSlug}.invalid`;
const nocPassword = process.env.E2E_NOC_PASSWORD ?? `E2eNoc-${suffix}!`;
const techPassword = process.env.E2E_TECH_PASSWORD ?? `E2eTech-${suffix}!`;
const coordinatorPassword = process.env.E2E_COORDINATOR_RO_PASSWORD ?? `E2eCoord-${suffix}!`;
const cleanupEnabled = process.env.E2E_CLEANUP !== 'false';
const postgresContainer = process.env.E2E_POSTGRES_CONTAINER ?? 'iwana_postgres_e2e';
// `pnpm db:migrate:all` termina en `db:apply-least-privilege`, y ese script hace
// `docker exec` sobre POSTGRES_CONTAINER, cuyo default es el contenedor de
// desarrollo. Sin esta asignación los GRANT de SEC-04 se aplicaban a la base dev
// mientras las migraciones corrían contra la base E2E: `iwana_app` se quedaba sin
// privilegios sobre las tablas creadas por `iwana_migrator` y el bootstrap de la
// API moría con 42501 antes de escuchar en el puerto.
process.env.POSTGRES_CONTAINER = postgresContainer;
const bootstrapUser = process.env.E2E_DB_BOOTSTRAP_USER ?? 'iwana';
const databaseName = process.env.E2E_DB_NAME ?? process.env.DB_NAME ?? 'dbiw';

const tenantSlugs = [tenantSlug, otherTenantSlug];

function assertSlug(slug) {
  if (!/^[a-z][a-z0-9-]{0,54}$/u.test(slug)) {
    throw new Error(`Slug E2E inválido: ${slug}`);
  }
}

tenantSlugs.forEach(assertSlug);

if (!platformEmail || !platformPassword) {
  throw new Error('Faltan E2E_PLATFORM_* o PLATFORM_SUPER_ADMIN_* para el login de plataforma.');
}

async function readJson(response) {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function runCommand(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: options.stdio ?? 'inherit',
    shell: process.platform === 'win32',
    encoding: options.encoding,
  });

  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label}: terminó con código ${result.status ?? 1}.`);
  }

  return result;
}

function dockerCompose(args, options = {}) {
  return runCommand(
    options.label ?? `docker compose ${args.join(' ')}`,
    'docker',
    [...composeBaseArgs, ...args],
    options,
  );
}

function assertDockerAvailable() {
  const result = spawnSync('docker', ['info'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'ignore', 'ignore'],
    shell: process.platform === 'win32',
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      '[BLOQUEO] Docker no está disponible o el daemon no responde. No se ejecuta el E2E: ' +
        'R4.1 requiere MinIO y worker BullMQ reales.',
    );
  }
}

function assertApiPortFree() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      reject(
        new Error(
          `[BLOQUEO] El puerto ${API_ROOT.replace(/^.*:(\d+)$/u, '$1')} ya está en uso. ` +
            'R4.1 requiere arrancar la API E2E limpia. Detener el proceso que lo ocupa ' +
            '(p. ej. `pnpm dev` u otra instancia del API) y reintentar.',
        ),
      );
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(undefined);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(undefined);
    });
    try {
      const url = new URL(API_ROOT);
      socket.connect(Number(url.port) || 80, url.hostname);
    } catch (err) {
      socket.destroy();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function provisionInfrastructure() {
  assertDockerAvailable();
  await assertApiPortFree();

  dockerCompose(['config', '--quiet'], {
    label: 'Validación de Compose E2E',
    stdio: 'ignore',
  });

  // Asegurar inicio limpio: volúmenes E2E persistentes de corridas anteriores
  // pueden contener credenciales MinIO obsoletos que causan AccessDenied en
  // putObject. Solo afecta volúmenes del proyecto E2E (-p iwana-e2e-r41).
  try {
    dockerCompose(['down', '-v', '--remove-orphans'], {
      label: 'Limpieza previa de infraestructura E2E',
      stdio: 'ignore',
    });
  } catch {
    // Best-effort: si no había infraestructura previa, se continúa.
  }

  dockerCompose(['up', '-d', '--wait', 'postgres', 'redis', 'minio', 'typesense'], {
    label: 'Arranque de dependencias E2E',
  });

  dockerCompose(['run', '--rm', 'minio-init'], {
    label: 'Bootstrap del bucket MinIO E2E',
  });

  // El worker se levanta después de migraciones en main(), para que su primer
  // ciclo BullMQ no compita con DDL tenant ni consuma jobs de provisioning a
  // medio aplicar.
}

function startWorker() {
  dockerCompose(['up', '-d', '--build', '--wait', 'worker-e2e'], {
    label: 'Arranque y healthcheck del worker BullMQ E2E',
  });
  dockerCompose(['ps', 'worker-e2e'], {
    label: 'Estado del worker BullMQ E2E',
  });
}

function stopWorker() {
  try {
    dockerCompose(['rm', '--force', '--stop', 'worker-e2e'], {
      label: 'Limpieza del worker BullMQ E2E',
      stdio: 'ignore',
    });
  } catch {
    // El estado de la prueba no se oculta si el contenedor ya terminó.
  }
}

function stopInfrastructure() {
  try {
    dockerCompose(['down', '--remove-orphans'], {
      label: 'Limpieza de infraestructura E2E',
      stdio: 'ignore',
    });
  } catch {
    // No convertir una limpieza best-effort en una segunda causa del fallo.
  }
}

function diagnoseSupervisionFixture(tenantSlugValue, coordinatorId, siteId) {
  const schemaName = `tenant_${tenantSlugValue.replaceAll('-', '_')}`;
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const sql = `
    SELECT json_build_object(
      'userRole', (SELECT role::text FROM "${schemaName}".users WHERE id = ${quote(coordinatorId)}),
      'userStatus', (SELECT status::text FROM "${schemaName}".users WHERE id = ${quote(coordinatorId)}),
      'profilePermissionRows', (
        SELECT COUNT(*)
        FROM "${schemaName}".user_access_profiles uap
        JOIN "${schemaName}".access_profiles p ON p.id = uap.profile_id
        JOIN "${schemaName}".access_profile_permissions pp ON pp.profile_id = p.id
        WHERE uap.user_id = ${quote(coordinatorId)}
          AND uap.is_active = true
          AND p.is_active = true
          AND p.deleted_at IS NULL
          AND p.base_role_constraint = 'NOC'
          AND pp.permission_key = 'operations.execution_orders.supervise'
      ),
      'siteAssignmentRows', (
        SELECT COUNT(*) FROM "${schemaName}".organization_site_assignments
        WHERE site_id = ${quote(siteId)}
          AND user_id = ${quote(coordinatorId)}
          AND assignment_type = 'SUPERVISOR'
          AND is_active = true
      ),
      'siteResponsibilityRows', (
        SELECT COUNT(*) FROM "${schemaName}".organization_site_responsibilities
        WHERE site_id = ${quote(siteId)}
          AND user_id = ${quote(coordinatorId)}
          AND responsibility = 'FIELD_OPERATIONS'
          AND valid_to IS NULL
      )
    )::text;
  `;
  const result = spawnSync(
    'docker',
    ['exec', postgresContainer, 'psql', '-U', bootstrapUser, '-d', databaseName, '-At', '-c', sql],
    { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) {
    throw new Error('No se pudo diagnosticar el fixture de supervisión en PostgreSQL E2E.');
  }
  console.log(`E2E_SUPERVISION_DB=${String(result.stdout).trim()}`);
}

// El arranque de la API es el punto donde más veces se pierde el diagnóstico:
// `nest start --watch` mantiene vivo al padre aunque el proceso Nest hijo muera,
// así que un fallo de bootstrap se veía sólo como un timeout mudo. Guardamos la
// cola del log para adjuntarla al error.
// Con E2E_API_LOG se redirige el log completo de la API a un archivo. La
// redirección es por descriptor, no por stream de Node, y eso es deliberado:
// `runPlaywright` usa `spawnSync`, que bloquea el event loop durante toda la
// suite, así que un `stdout.on('data')` no emite nada mientras corren los tests
// — justo la ventana donde hay que diagnosticar un 500. Escribiendo por fd lo
// vuelca el sistema operativo. El archivo no se versiona y solo se abre si se
// pide.
const API_LOG_TAIL_LIMIT = 8_000;
const apiLogFile = process.env.E2E_API_LOG?.trim();
let apiLogFd = null;
let apiLogTail = '';
let apiProcess = null;

function appendApiLog(chunk) {
  apiLogTail = `${apiLogTail}${chunk}`.slice(-API_LOG_TAIL_LIMIT);
}

function openApiLogFd() {
  if (!apiLogFile) {
    return null;
  }

  try {
    apiLogFd = openSync(apiLogFile, 'a');
  } catch {
    // El diagnóstico es best-effort: no puede tumbar la corrida del E2E.
    apiLogFd = null;
  }

  return apiLogFd;
}

function apiLogDetail() {
  let tail = apiLogTail.trim();

  if (apiLogFile) {
    try {
      tail = readFileSync(apiLogFile, 'utf8').slice(-API_LOG_TAIL_LIMIT).trim();
    } catch {
      // Se conserva la cola en memoria si el archivo no es legible.
    }
  }

  return tail ? `\n--- salida de la API E2E (cola) ---\n${tail}\n---` : '';
}

async function waitForApiHealth(apiProcess) {
  const deadline = Date.now() + 120_000;
  let lastFailure = 'sin respuesta';

  while (Date.now() < deadline) {
    if (apiProcess && apiProcess.exitCode !== null) {
      throw new Error(
        `API E2E terminó antes del healthcheck (código ${apiProcess.exitCode}).${apiLogDetail()}`,
      );
    }

    try {
      const response = await fetch(`${API_PREFIX}/health`);
      if (response.ok) {
        console.log('E2E_API_HEALTH=OK');
        return;
      }
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `API E2E no alcanzó healthcheck en 120 segundos: ${lastFailure}${apiLogDetail()}`,
  );
}

async function startApi() {
  await assertApiPortFree();

  runCommand('Compilación de @iwana/api', 'pnpm', ['--filter', '@iwana/api', 'build']);
  const logFd = openApiLogFd();
  apiProcess = spawn(process.execPath, [join(process.cwd(), 'apps/api/dist/main.js')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLATFORM_SUPER_ADMIN_EMAIL: platformEmail,
      PLATFORM_SUPER_ADMIN_PASSWORD: platformPassword,
    },
    stdio: logFd === null ? ['ignore', 'pipe', 'pipe'] : ['ignore', logFd, logFd],
    shell: false,
  });

  apiLogTail = '';

  if (logFd === null) {
    apiProcess.stdout?.setEncoding('utf8');
    apiProcess.stderr?.setEncoding('utf8');
    apiProcess.stdout?.on('data', appendApiLog);
    apiProcess.stderr?.on('data', appendApiLog);
  } else {
    console.log(`E2E_API_LOG=${apiLogFile}`);
  }

  await waitForApiHealth(apiProcess);
  return apiProcess;
}

function stopProcess(child) {
  if (!child?.pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!child.killed) {
      child.kill('SIGKILL');
    }
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

async function api(path, options = {}, expectedStatuses = [200]) {
  const response = await fetch(`${API_PREFIX}${path}`, options);
  const body = await readJson(response);

  if (!expectedStatuses.includes(response.status)) {
    // No se incluye el body: puede contener PII o secretos temporales.
    throw new Error(`${options.method ?? 'GET'} ${path} respondió HTTP ${response.status}`);
  }

  return body;
}

function authHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function responseData(body) {
  return body.data && typeof body.data === 'object' ? body.data : body;
}

function jsonRequest(token, payload, extra = {}) {
  return {
    method: 'POST',
    headers: {
      ...authHeaders(token, { 'Content-Type': 'application/json', ...extra }),
    },
    body: JSON.stringify(payload),
  };
}

function idempotencyKey() {
  return `e2e-${suffix}-${crypto.randomUUID()}`;
}

async function platformLogin() {
  const bootstrap = await api(
    '/platform-users/bootstrap',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: platformEmail,
        password: platformPassword,
        confirmPassword: platformPassword,
      }),
    },
    [201, 409],
  );
  const bootstrapToken =
    bootstrap.data && typeof bootstrap.data === 'object' ? bootstrap.data.accessToken : undefined;
  if (typeof bootstrapToken === 'string' && bootstrapToken) {
    return bootstrapToken;
  }

  const body = await api(
    '/auth/platform/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: platformEmail, password: platformPassword }),
    },
    [200],
  );

  const token = body.data && typeof body.data === 'object' ? body.data.accessToken : undefined;

  if (typeof token !== 'string' || !token) {
    throw new Error('El login de plataforma no devolvió accessToken.');
  }

  return token;
}

async function createTenant(token, slug, adminEmail) {
  const body = await api(
    '/tenants',
    jsonRequest(token, {
      name: `E2E ${slug}`,
      slug,
      contactEmail: adminEmail,
      adminEmail,
      settings: { timezone: 'America/Bogota', currency: 'COP', language: 'es-CO', country: 'CO' },
    }),
    [201],
  );

  if (!body.data || typeof body.data !== 'object') {
    throw new Error(`La creación del tenant ${slug} no devolvió data.`);
  }

  return body.data;
}

async function waitForActive(token, tenantId, slug) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const body = await api(`/tenants/${tenantId}`, { headers: authHeaders(token) });
    const tenant = body.data && typeof body.data === 'object' ? body.data : {};
    const status = tenant.status;

    if (status === 'ACTIVE') {
      return;
    }

    if (status === 'PROVISIONING_FAILED') {
      throw new Error(`El provisioning del tenant ${slug} terminó en PROVISIONING_FAILED.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`El tenant ${slug} no alcanzó ACTIVE dentro de 90 segundos.`);
}

async function regenerateAdminCredentials(token, tenantId) {
  const body = await api(
    `/tenants/${tenantId}/regenerate-admin-credentials`,
    jsonRequest(token, {}, { 'Idempotency-Key': idempotencyKey() }),
    [200],
  );
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const temporaryPassword = data.temporaryPassword;

  if (typeof temporaryPassword !== 'string' || !temporaryPassword) {
    throw new Error('La emisión de credenciales temporales no devolvió password.');
  }

  return temporaryPassword;
}

async function tenantLogin(email, password, slug) {
  const body = await api(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': slug },
      body: JSON.stringify({ email, password }),
    },
    [200],
  );
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const token = data.accessToken;

  if (typeof token !== 'string' || !token) {
    throw new Error(`El login tenant de ${slug} no devolvió accessToken.`);
  }

  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
  const userId = payload.sub;

  if (typeof userId !== 'string' || !userId) {
    throw new Error(`El JWT del tenant ${slug} no contiene sub.`);
  }

  return { token, userId };
}

async function createUser(token, payload) {
  const body = await api(
    '/users',
    jsonRequest(token, payload, { 'Idempotency-Key': idempotencyKey() }),
    [201],
  );

  if (!body.data || typeof body.data !== 'object') {
    throw new Error('La creación de un usuario E2E no devolvió data.');
  }

  return body.data;
}

async function activateUser(token, userId) {
  await api(
    `/users/${userId}`,
    {
      method: 'PATCH',
      headers: {
        ...authHeaders(token, { 'Content-Type': 'application/json' }),
        'Idempotency-Key': idempotencyKey(),
      },
      body: JSON.stringify({ status: 'ACTIVE' }),
    },
    [200],
  );
}

async function configureBusinessHours(token) {
  const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  const businessHours = weekdays.map((weekday) => ({
    weekday,
    isOpen: true,
    opensAt: '00:00',
    closesAt: '23:59',
  }));

  await api(
    '/organization/business-hours/company',
    {
      method: 'PUT',
      headers: {
        ...authHeaders(token, { 'Content-Type': 'application/json' }),
      },
      body: JSON.stringify({ businessHours }),
    },
    [200, 201],
  );
}

async function provisionCoordinatorSupervisionProfile(token, coordinatorId) {
  const profileBody = await api(
    '/access-control/profiles',
    jsonRequest(token, {
      name: `E2E Supervisor ${suffix}`,
      description: 'Perfil efímero para validar supervisión de OT en E2E.',
      baseRoleConstraint: 'NOC',
      permissionKeys: ['operations.execution_orders.read', 'operations.execution_orders.supervise'],
    }),
    [200, 201],
  );
  const profile = responseData(profileBody);
  const profileId = profile.id;
  if (typeof profileId !== 'string') {
    throw new Error('El fixture operativo no obtuvo profileId de supervisión.');
  }

  await api(
    `/access-control/users/${coordinatorId}/profiles`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileIds: [profileId] }),
    },
    [200, 201],
  );
}

async function provisionOperationalSite(token, supervisorUserId) {
  const siteBody = await api(
    '/organization/sites',
    jsonRequest(token, {
      name: `E2E Tech Base ${suffix}`,
      code: `E2E-OPS-${suffix.toUpperCase()}`,
      siteType: 'TECH_BASE',
      address: 'Direccion E2E de laboratorio',
      municipality: 'Bogota',
      department: 'Cundinamarca',
      country: 'CO',
      latitude: 4.6486259,
      longitude: -74.0651466,
      contactName: 'E2E Operations',
      contactPhone: '+57000000000',
      isPrimary: true,
      isActive: true,
      capabilities: ['TECH_DISPATCH'],
    }),
    [201],
  );
  const site = responseData(siteBody);
  const siteId = site.id;
  if (typeof siteId !== 'string') {
    throw new Error('El fixture operativo no obtuvo organizationSiteId.');
  }

  await api(
    `/organization/sites/${siteId}/assignments`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments: [{ userId: supervisorUserId, assignmentType: 'SUPERVISOR' }],
      }),
    },
    [200],
  );

  await api(
    `/organization/sites/${siteId}/responsibilities`,
    {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responsibilities: [{ userId: supervisorUserId, responsibility: 'FIELD_OPERATIONS' }],
      }),
    },
    [200],
  );

  const detailBody = await api(
    `/organization/sites/${siteId}`,
    { headers: authHeaders(token) },
    [200],
  );
  const detail = responseData(detailBody);
  const hasSupervisorAssignment =
    Array.isArray(detail.assignments) &&
    detail.assignments.some(
      (entry) =>
        entry.userId === supervisorUserId &&
        entry.assignmentType === 'SUPERVISOR' &&
        entry.isActive === true,
    );
  const hasFieldOperationsResponsibility =
    Array.isArray(detail.responsibilities) &&
    detail.responsibilities.some(
      (entry) =>
        entry.userId === supervisorUserId &&
        entry.responsibility === 'FIELD_OPERATIONS' &&
        entry.validTo === null,
    );
  if (!hasSupervisorAssignment || !hasFieldOperationsResponsibility) {
    throw new Error('El fixture operativo no pudo verificar el alcance de supervisión de la sede.');
  }

  const permissionsBody = await api(
    `/access-control/users/${supervisorUserId}/effective-permissions`,
    { headers: authHeaders(token) },
    [200],
  );
  const permissionsData = responseData(permissionsBody);
  const permissionValues = Array.isArray(permissionsData)
    ? permissionsData
    : (permissionsData.effectivePermissions ??
      permissionsData.permissions ??
      permissionsData.data ??
      []);
  const hasSupervisePermission =
    Array.isArray(permissionValues) &&
    permissionValues.some(
      (entry) =>
        (typeof entry === 'string' ? entry : (entry?.permissionKey ?? entry?.key)) ===
        'operations.execution_orders.supervise',
    );
  const hasProfileSupervisePermission =
    Array.isArray(permissionsData.profileSources) &&
    permissionsData.profileSources.some(
      (source) =>
        Array.isArray(source.permissions) &&
        source.permissions.includes('operations.execution_orders.supervise'),
    );
  console.log(
    `E2E_SUPERVISION_FIXTURE=role:${permissionsData.role}|sources:${Array.isArray(permissionsData.profileSources) ? permissionsData.profileSources.length : 0}|profilePermission:${hasProfileSupervisePermission}|assignment:${hasSupervisorAssignment}|responsibility:${hasFieldOperationsResponsibility}|permission:${hasSupervisePermission}`,
  );

  console.log(`E2E_OPERATIONAL_SITE=${siteId}`);
  return siteId;
}

async function assignProfiles(token, userRoles) {
  const profilesBody = await api(
    '/access-control/profiles',
    { headers: authHeaders(token) },
    [200],
  );

  const profiles = responseData(profilesBody);
  const profileByName = new Map();

  for (const profile of profiles) {
    if (profile && typeof profile === 'object' && profile.name) {
      profileByName.set(profile.name, profile.id);
    }
  }

  const profileNameByRole = {
    ADMIN: 'Administrador general',
    NOC: 'Monitoreo operativo',
    TECHNICIAN: 'Técnico de campo',
    SUPPORT: 'Soporte inicial',
    CONTRACTOR: 'Contratista',
    AUDITOR: 'Auditor',
  };

  for (const { userId, role } of userRoles) {
    const profileName = profileNameByRole[role];
    if (!profileName) {
      throw new Error(`No se encontró nombre de perfil para el rol '${role}'.`);
    }

    const profileId = profileByName.get(profileName);
    if (typeof profileId !== 'string') {
      throw new Error(`No se encontró el perfil '${profileName}' en el tenant.`);
    }

    await api(
      `/access-control/users/${userId}/profiles`,
      {
        method: 'PUT',
        headers: {
          ...authHeaders(token, { 'Content-Type': 'application/json' }),
        },
        body: JSON.stringify({ profileIds: [profileId] }),
      },
      [200, 201],
    );
  }
}

async function provisionInventoryFixture(token, technicianId) {
  const categoryBody = await api(
    '/inventory/categories',
    jsonRequest(token, {
      code: `E2E-CPE-${suffix}`,
      codePrefix: 'E2E',
      name: `E2E CPE ${suffix}`,
    }),
    [200, 201],
  );
  const category = responseData(categoryBody);
  const categoryId = category.id;

  if (typeof categoryId !== 'string') {
    throw new Error('El fixture de inventario no obtuvo categoryId.');
  }

  await api(
    '/inventory/categories',
    jsonRequest(token, {
      code: `E2E-WRONG-${suffix}`,
      codePrefix: 'E2',
      name: `E2E categoría alterna ${suffix}`,
    }),
    [200, 201],
  );

  const itemBody = await api(
    '/inventory/items',
    jsonRequest(token, {
      sku: 'ONT-HG8245',
      name: 'E2E ONT',
      brand: 'E2E',
      model: 'HG8245',
      categoryId,
      category: 'CPE',
      trackingMode: 'CONSUMABLE',
      unitOfMeasure: 'unit',
      baseCost: 1,
      minimumStock: 0,
      purchasable: true,
      inventoryControlled: true,
    }),
    [200, 201],
  );
  const item = responseData(itemBody);
  const itemId = item.id;

  if (typeof itemId !== 'string') {
    throw new Error('El fixture de inventario no obtuvo itemId.');
  }

  const locationBody = await api(
    '/inventory/locations',
    jsonRequest(token, {
      code: 'MOV-001',
      name: 'E2E mobile technician',
      type: 'MOBILE_TECHNICIAN',
      responsibleRefId: technicianId,
    }),
    [200, 201],
  );
  const location = responseData(locationBody);
  const locationId = location.id;

  if (typeof locationId !== 'string') {
    throw new Error('El fixture de inventario no obtuvo locationId.');
  }

  await api(
    '/inventory/adjustments',
    jsonRequest(token, {
      itemId,
      locationId,
      quantityDelta: 100,
      reason: 'INITIAL_LOAD',
      notes: 'E2E ephemeral fixture',
      idempotencyKey: idempotencyKey(),
    }),
    [200, 201],
  );
}

async function provisionExecutionTemplate(
  token,
  { idempotencyKey, templateKey, workType, requirements },
) {
  const templatePayload = {
    key: templateKey,
    label: `E2E ${templateKey} - Cierre mínimo`,
    workType,
    requirements: [],
  };

  // 1. Crear plantilla (idempotente vía key única; ON CONFLICT DO NOTHING en DB)
  let templateId;
  try {
    const created = await api(
      '/tasks/execution-order-templates',
      {
        method: 'POST',
        headers: {
          ...authHeaders(token, { 'Content-Type': 'application/json' }),
          'Idempotency-Key': `${idempotencyKey}-template`,
        },
        body: JSON.stringify(templatePayload),
      },
      [200, 201, 409],
    );
    templateId = created.id || (created.data && created.data.id);
    if (templateId) {
      console.log(`E2E_TEMPLATE_CREATED=${templateId}`);
    }
  } catch {
    // Posible conflicto: la plantilla ya existe. Buscarla.
  }

  if (!templateId) {
    // Intentar listar con workType filter
    try {
      const templates = await api(
        `/tasks/execution-order-templates?workType=${encodeURIComponent(workType)}`,
        { headers: authHeaders(token) },
        [200],
      );
      const existing = (templates.data || []).find((t) => t.key === templateKey);
      if (existing) {
        templateId = existing.id;
        console.log(`E2E_TEMPLATE_FOUND=${templateId}`);
      }
    } catch {
      // Seguir sin templateId
    }
  }

  if (!templateId) {
    throw new Error(
      'No se pudo crear ni encontrar la plantilla E2E. Verifique permisos del admin.',
    );
  }

  // 2. Crear versión (idempotente vía key+version)
  const versionPayload = {
    label: `E2E ${templateKey} v1`,
    requirements,
  };

  let versionId;
  try {
    const createdVersion = await api(
      `/tasks/execution-order-templates/${templateId}/versions`,
      {
        method: 'POST',
        headers: {
          ...authHeaders(token, { 'Content-Type': 'application/json' }),
          'Idempotency-Key': `${idempotencyKey}-version`,
        },
        body: JSON.stringify(versionPayload),
      },
      [200, 201],
    );
    versionId = createdVersion.id || (createdVersion.data && createdVersion.data.id);
    console.log(`E2E_VERSION_CREATED=${versionId}`);
  } catch {
    // Posible conflicto: obtener la versión existente
    try {
      const versions = await api(
        `/tasks/execution-order-templates/${templateId}/versions`,
        { headers: authHeaders(token) },
        [200],
      );
      const existingVersion = (versions.data || []).find((v) => v.version === 1);
      if (existingVersion) {
        versionId = existingVersion.id;
        console.log(`E2E_VERSION_REUSED=${versionId}`);
      }
    } catch (err) {
      throw new Error(`No se pudo crear ni encontrar la versión E2E: ${err.message}`);
    }
  }

  if (!versionId) {
    throw new Error('No se obtuvo versionId para la plantilla E2E.');
  }

  // 3. Publicar versión (idempotente)
  const published = await api(
    `/tasks/execution-order-templates/versions/${versionId}/publish`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    },
    [200],
  );
  console.log(`E2E_VERSION_PUBLISHED=${published.id || versionId}`);

  return templateId;
}

// El reporter de marcadores solo publica conteos agregados no secretos. No
// escribe JSON, traces, screenshots ni stdout de cada test a un artefacto.
function createPlaywrightMarkerReporter() {
  const reporterDirectory = mkdtempSync(join(tmpdir(), 'iwana-e2e-marker-reporter-'));
  const reporterPath = join(reporterDirectory, 'reporter.mjs');
  const source = String.raw`
class OperationalMarkerReporter {
  constructor() {
    this.totalTests = 0;
    this.resultsByTest = new Map();
    this.retriedTests = new Set();
  }

  onBegin(_config, suite) {
    this.totalTests = suite.allTests().length;
  }

  onTestEnd(test, result) {
    const testKey = typeof test.id === 'string'
      ? test.id
      : 'title:' + test.titlePath().join('\\u001f');
    this.resultsByTest.set(testKey, result);
    if (Number.isInteger(result.retry) && result.retry > 0) {
      this.retriedTests.add(testKey);
    }
  }

  onEnd() {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const result of this.resultsByTest.values()) {
      if (result.status === 'passed') {
        passed += 1;
      } else if (result.status === 'skipped') {
        skipped += 1;
      } else {
        // timedOut/interrupted también son fallos del gate, no falsos verdes.
        failed += 1;
      }
    }

    const didNotRun = Math.max(0, this.totalTests - this.resultsByTest.size);
    process.stdout.write('E2E_PLAYWRIGHT_PASSED=' + passed + '\n');
    process.stdout.write('E2E_PLAYWRIGHT_FAILED=' + failed + '\n');
    process.stdout.write('E2E_PLAYWRIGHT_SKIPPED=' + skipped + '\n');
    process.stdout.write('E2E_PLAYWRIGHT_DID_NOT_RUN=' + didNotRun + '\n');
    process.stdout.write('E2E_PLAYWRIGHT_FLAKY=' + this.retriedTests.size + '\n');
  }
}

export default OperationalMarkerReporter;
`;

  writeFileSync(reporterPath, source, { encoding: 'utf8', mode: 0o600 });
  return { reporterDirectory, reporterPath };
}

function runPlaywright(env) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const startedAt = Date.now();
  // El config activa el reporter temporal mediante una variable de entorno.
  // Playwright 1.58 no soporta --add-reporter en la CLI.
  const { reporterDirectory, reporterPath } = createPlaywrightMarkerReporter();
  let result;
  try {
    result = spawnSync(
      command,
      [
        'exec',
        'playwright',
        'test',
        'e2e/tests/api/execution-orders-operational.spec.ts',
        '--config',
        'e2e/playwright.api.config.ts',
        '--retries',
        '0',
      ],
      {
        cwd: process.cwd(),
        env: { ...env, E2E_MARKER_REPORTER_PATH: reporterPath },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      },
    );
  } finally {
    rmSync(reporterDirectory, { recursive: true, force: true });
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(`E2E_PLAYWRIGHT=FAILED|${result.error.message}`);
    return 1;
  }

  console.log(`E2E_PLAYWRIGHT_EXIT=${result.status ?? 1}`);
  console.log(`E2E_PLAYWRIGHT_DURATION_MS=${Date.now() - startedAt}`);

  return result.status ?? 1;
}

function cleanupWithDocker() {
  const schemaA = `tenant_${tenantSlug.replaceAll('-', '_')}`;
  const schemaB = `tenant_${otherTenantSlug.replaceAll('-', '_')}`;
  const escapedA = tenantSlug.replaceAll("'", "''");
  const escapedB = otherTenantSlug.replaceAll("'", "''");
  const sql = [
    `DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`,
    `DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`,
    `DELETE FROM public.tenants WHERE slug IN ('${escapedA}', '${escapedB}')`,
  ].join('; ');
  const result = spawnSync(
    'docker',
    [
      'exec',
      postgresContainer,
      'psql',
      '-U',
      bootstrapUser,
      '-d',
      databaseName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `${sql};`,
    ],
    { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (result.status !== 0) {
    console.error('E2E_CLEANUP=FAILED');
    return false;
  }

  console.log('E2E_CLEANUP=OK');
  return true;
}

let testExitCode = 1;
let platformToken = '';
let createdTenants = false;
const runStartedAt = Date.now();

try {
  await provisionInfrastructure();
  runCommand('Compilación de @iwana/shared', 'pnpm', ['--filter', '@iwana/shared', 'build']);
  runCommand('Compilación de @iwana/storage', 'pnpm', ['--filter', '@iwana/storage', 'build']);
  runCommand('Migraciones public y tenant E2E', 'pnpm', ['db:migrate:all']);
  // Compose usa DB_PASSWORD para el superusuario de bootstrap; la API host usa
  // DB_USER como rol de aplicación y debe cambiar al password de iwana_app.
  process.env.DB_PASSWORD = process.env.DB_APP_PASSWORD;
  startWorker();
  apiProcess = await startApi();

  platformToken = await platformLogin();
  const tenant = await createTenant(platformToken, tenantSlug, tenantAdminEmail);
  const otherTenant = await createTenant(platformToken, otherTenantSlug, otherTenantAdminEmail);
  createdTenants = true;

  const tenantId = tenant.id;
  const otherTenantId = otherTenant.id;

  if (typeof tenantId !== 'string' || typeof otherTenantId !== 'string') {
    throw new Error('La creación E2E no devolvió IDs de tenant.');
  }

  await waitForActive(platformToken, tenantId, tenantSlug);
  await waitForActive(platformToken, otherTenantId, otherTenantSlug);

  const tenantAdminPassword = await regenerateAdminCredentials(platformToken, tenantId);
  const otherTenantAdminPassword = await regenerateAdminCredentials(platformToken, otherTenantId);
  const tenantAdmin = await tenantLogin(tenantAdminEmail, tenantAdminPassword, tenantSlug);

  const noc = await createUser(tenantAdmin.token, {
    email: nocEmail,
    role: 'NOC',
    password: nocPassword,
    firstName: 'E2E',
    lastName: 'NOC',
    jobTitle: 'E2E NOC',
  });
  const technician = await createUser(tenantAdmin.token, {
    email: techEmail,
    role: 'TECHNICIAN',
    password: techPassword,
    firstName: 'E2E',
    lastName: 'Technician',
    jobTitle: 'E2E technician',
    isOperationalResource: true,
  });
  const coordinator = await createUser(tenantAdmin.token, {
    email: coordinatorEmail,
    role: 'NOC',
    password: coordinatorPassword,
    firstName: 'E2E',
    lastName: 'Coordinator',
    jobTitle: 'E2E coordinator',
  });

  if (
    typeof noc.id !== 'string' ||
    typeof technician.id !== 'string' ||
    typeof coordinator.id !== 'string'
  ) {
    throw new Error('El provisioning E2E no devolvió IDs de usuarios.');
  }

  await activateUser(tenantAdmin.token, noc.id);
  await activateUser(tenantAdmin.token, technician.id);
  await activateUser(tenantAdmin.token, coordinator.id);
  await assignProfiles(tenantAdmin.token, [
    { userId: noc.id, role: 'NOC' },
    { userId: technician.id, role: 'TECHNICIAN' },
    { userId: coordinator.id, role: 'NOC' },
    { userId: tenantAdmin.userId, role: 'ADMIN' },
  ]);
  await provisionCoordinatorSupervisionProfile(tenantAdmin.token, coordinator.id);
  const operationalSiteId = await provisionOperationalSite(tenantAdmin.token, coordinator.id);
  diagnoseSupervisionFixture(tenantSlug, coordinator.id, operationalSiteId);
  await provisionInventoryFixture(tenantAdmin.token, technician.id);
  await configureBusinessHours(tenantAdmin.token);

  // Provisionar plantilla E2E_HAPPY_PATH necesaria para el gate de cierre.
  // La creación vía API usa tenantAdmin.token porque el admin del tenant
  // sí tiene el permiso operations.execution_order_templates.manage (a
  // diferencia del NOC, que solo tiene operations.execution_orders.*).
  // Si la plantilla ya existe, el upsert en la DB la actualiza; si no,
  // se crea con state PUBLISHED y requisitos mínimos.
  const happyPathTemplateId = await provisionExecutionTemplate(tenantAdmin.token, {
    idempotencyKey: idempotencyKey(),
    templateKey: 'E2E_HAPPY_PATH',
    workType: 'INSTALLATION',
    requirements: [
      {
        key: 'installation-activity',
        label: 'Actividad de instalación',
        required: true,
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      },
      {
        key: 'e2e-test-evidence',
        label: 'Evidencia de trabajo',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      },
      {
        key: 'CUSTOMER_SIGNATURE',
        label: 'Firma del cliente',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'SIGNATURE',
      },
    ],
  });
  await provisionExecutionTemplate(tenantAdmin.token, {
    idempotencyKey: idempotencyKey(),
    templateKey: 'E2E_CONCURRENCY',
    workType: 'SUPPORT',
    requirements: [],
  });
  console.log(`E2E_TEMPLATE=OK|happy_path_template_id=${happyPathTemplateId}`);

  console.log(`E2E_SETUP=OK|tenants=${tenantSlug},${otherTenantSlug}`);

  testExitCode = runPlaywright({
    ...process.env,
    API_BASE_URL: API_ROOT,
    E2E_PLATFORM_EMAIL: platformEmail,
    E2E_PLATFORM_PASSWORD: platformPassword,
    E2E_TENANT_ADMIN_EMAIL: tenantAdminEmail,
    E2E_TENANT_ADMIN_PASSWORD: tenantAdminPassword,
    E2E_TENANT_SLUG: tenantSlug,
    E2E_NOC_EMAIL: nocEmail,
    E2E_NOC_PASSWORD: nocPassword,
    E2E_TECH_EMAIL: techEmail,
    E2E_TECH_PASSWORD: techPassword,
    E2E_COORDINATOR_RO_EMAIL: coordinatorEmail,
    E2E_COORDINATOR_RO_PASSWORD: coordinatorPassword,
    E2E_OPERATIONAL_SITE_ID: operationalSiteId,
    E2E_HAPPY_PATH_TEMPLATE_ID: happyPathTemplateId,
    E2E_OTHER_TENANT_SLUG: otherTenantSlug,
    E2E_OTHER_TENANT_EMAIL: otherTenantAdminEmail,
    E2E_OTHER_TENANT_PASSWORD: otherTenantAdminPassword,
  });
} catch (error) {
  console.error(`E2E_SETUP=FAILED|${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (createdTenants && cleanupEnabled) {
    if (platformToken) {
      for (const slug of tenantSlugs) {
        try {
          const list = await api(`/tenants?search=${encodeURIComponent(slug)}&limit=100`, {
            headers: authHeaders(platformToken),
          });
          const tenants = Array.isArray(list.data) ? list.data : [];
          const match = tenants.find(
            (candidate) => candidate && typeof candidate === 'object' && candidate.slug === slug,
          );
          if (typeof match?.id === 'string') {
            await api(
              `/tenants/${match.id}`,
              { method: 'DELETE', headers: authHeaders(platformToken) },
              [204],
            );
          }
        } catch {
          console.error(`E2E_API_CLEANUP=FAILED|${slug}`);
        }
      }
    }

    cleanupWithDocker();
  } else if (createdTenants && !cleanupEnabled) {
    console.log(`E2E_CLEANUP=DISABLED|slugs=${tenantSlugs.join(',')}`);
  }

  stopProcess(apiProcess);
  stopWorker();
  stopInfrastructure();

  // Marcador de resumen NO secreto: duración total del provisioner. Se publica
  // siempre (finally), incluso en fallo, para el resumen sanitizado del job.
  console.log(`E2E_TOTAL_DURATION_MS=${Date.now() - runStartedAt}`);
}

process.exit(testExitCode);
