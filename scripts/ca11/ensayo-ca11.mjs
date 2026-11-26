#!/usr/bin/env node
/**
 * Ensayo de CA-11 (spec 2026-11-25-sesion-absoluta-y-freno-contrasenas §5 y §6) con nginx de
 * producción, la API real, PostgreSQL y Redis desechables.
 *
 *   node scripts/ca11/ensayo-ca11.mjs [--modo=dominios|lan] [--sin-construir] [--informe=<ruta.md>]
 *
 * - `dominios`: nginx/nginx.prod.conf con el dominio sintético `ca11.test`.
 * - `lan`: la salida de scripts/lan/render-nginx-ip-ports.sh (portal 8443, archivos 9443).
 * - Construye `iwana-ca11/api:ensayo` e `iwana-ca11/migrator:ensayo` desde el árbol actual salvo
 *   `--sin-construir`. nginx usa `CA11_NGINX_IMAGE` (por defecto la imagen de producción) y nunca
 *   descarga nada (`--pull never`).
 * - Los secretos se generan en memoria y llegan a Compose por el entorno; no se escriben. La
 *   credencial del alta inicial vive en una carpeta temporal 0700 que se borra al terminar.
 * - Siempre ejecuta `down` y comprueba que no quedan contenedores, redes ni volúmenes.
 *
 * Termina con código 0 solo si todos los casos dan lo esperado.
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { nextTotpCode } from '../lib/platform-session.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const COMPOSE = join(ROOT, 'scripts/ca11/docker-compose.ca11.yml');
const PROJECT = 'iwana-ca11';
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/u, '').split('=');
    return [key, value.join('=') || true];
  }),
);
const MODE = args.get('modo') ?? 'dominios';
if (!['dominios', 'lan'].includes(MODE)) throw new Error('--modo debe ser dominios o lan.');

const DOMAIN = 'ca11.test';
const EDGE_V4 = '172.31.248.10';
const EDGE_V6 = 'fd00:ca11::10';
const IPS = { autorizado: '172.31.248.20', autorizado2: '172.31.248.21', externo: '172.31.248.30' };
const FORGED_IP = '203.0.113.77';
const PORTAL_PORT = MODE === 'lan' ? 8443 : 443;
const FILES_PORT = MODE === 'lan' ? 9443 : 443;
const VHOST = {
  consola: { host: `consola.${DOMAIN}`, port: 443 },
  portal: { host: `portal.${DOMAIN}`, port: PORTAL_PORT },
  archivos: { host: `archivos.${DOMAIN}`, port: FILES_PORT },
  desconocido: { host: 'desconocido.example', port: 443 },
  ip: { host: EDGE_V4, port: 443 },
};
const origin = ({ host, port }) => `https://${host}${port === 443 ? '' : `:${port}`}`;
const CONSOLE_ORIGIN = origin(VHOST.consola);
const PORTAL_ORIGIN = origin(VHOST.portal);

const hex = (bytes) => randomBytes(bytes).toString('hex');
const keys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const workdir = mkdtempSync(join(tmpdir(), 'iwana-ca11-'));
const env = {
  ...process.env,
  CA11_WORKDIR: workdir,
  CA11_API_IMAGE: process.env.CA11_API_IMAGE ?? 'iwana-ca11/api:ensayo',
  CA11_MIGRATOR_IMAGE: process.env.CA11_MIGRATOR_IMAGE ?? 'iwana-ca11/migrator:ensayo',
  CA11_NGINX_IMAGE: process.env.CA11_NGINX_IMAGE ?? 'nginx:1.31.2-alpine',
  CA11_POSTGRES_IMAGE: process.env.CA11_POSTGRES_IMAGE ?? 'postgres:18.3-alpine',
  CA11_REDIS_IMAGE: process.env.CA11_REDIS_IMAGE ?? 'redis:8.6-alpine',
  CA11_DB_PASSWORD: hex(24),
  CA11_REDIS_PASSWORD: hex(24),
  CA11_JWT_PRIVATE_KEY: keys.privateKey,
  CA11_JWT_PUBLIC_KEY: keys.publicKey,
  CA11_IDEMPOTENCY_SECRET: hex(32),
  CA11_QUEUE_KEY: randomBytes(32).toString('base64'),
  CA11_MFA_KEY: hex(32),
  CA11_PII_HASH_KEY: hex(32),
  CA11_PII_KEY: hex(32),
  CA11_S3_SECRET: hex(24),
  CA11_TYPESENSE_KEY: hex(24),
  CA11_CORS_ORIGIN: `${CONSOLE_ORIGIN},${PORTAL_ORIGIN}`,
  CA11_FRONTEND_URL: CONSOLE_ORIGIN,
  CA11_PORTAL_URL: PORTAL_ORIGIN,
  CA11_S3_PUBLIC_ENDPOINT: origin(VHOST.archivos),
};

const run = (command, list, options = {}) =>
  execFileSync(command, list, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
const compose = (...list) => run('docker', ['compose', '-p', PROJECT, '-f', COMPOSE, ...list]);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ── Preparación ──────────────────────────────────────────────────────────────

function prepare() {
  chmodSync(workdir, 0o755);
  mkdirSync(join(workdir, 'tls'));
  mkdirSync(join(workdir, 'bootstrap'), { mode: 0o700 });
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=ensayo-ca11',
    '-keyout',
    join(workdir, 'tls/privkey.pem'),
    '-out',
    join(workdir, 'tls/fullchain.pem'),
  ]);
  chmodSync(join(workdir, 'tls/privkey.pem'), 0o644);
  writeFileSync(
    join(workdir, 'allow.conf'),
    `allow 127.0.0.1;\nallow ${IPS.autorizado};\nallow ${IPS.autorizado2};\ndeny all;\n`,
  );
  writeFileSync(
    join(workdir, 'stub.conf'),
    [
      [3001, 'web'],
      [3002, 'portal'],
      [9000, 'archivos'],
    ]
      .map(([port, name]) => `server { listen ${port}; location / { return 200 "stub-${name}"; } }`)
      .join('\n'),
  );
  const source =
    MODE === 'lan'
      ? run('bash', [join(ROOT, 'scripts/lan/render-nginx-ip-ports.sh')])
      : readFileSync(join(ROOT, 'nginx/nginx.prod.conf'), 'utf8');
  writeFileSync(
    join(workdir, 'nginx.conf'),
    source.replaceAll('REPLACE_ME_PRODUCTION_DOMAIN', DOMAIN),
  );
}

function build() {
  if (args.has('sin-construir')) return;
  console.log('Construyendo imágenes del árbol actual…');
  run('docker', ['build', '-q', '-f', 'apps/api/Dockerfile', '-t', env.CA11_API_IMAGE, '.']);
  run('docker', [
    'build',
    '-q',
    '-f',
    'packages/database/Dockerfile.migrator',
    '-t',
    env.CA11_MIGRATOR_IMAGE,
    '.',
  ]);
}

async function start() {
  compose('up', '-d', '--pull', 'never', '--wait', 'postgres', 'redis');
  compose('--profile', 'migrar', 'run', '--rm', 'migrator');
  run('bash', [join(ROOT, 'scripts/db/apply-least-privilege.sh')], {
    env: {
      ...env,
      POSTGRES_CONTAINER: 'iwana_ca11_postgres',
      DB_BOOTSTRAP_USER: 'ca11_bootstrap',
      DB_NAME: 'ca11',
      DB_PASSWORD: env.CA11_DB_PASSWORD,
      DB_APP_PASSWORD: env.CA11_DB_PASSWORD,
      DB_MIGRATOR_PASSWORD: env.CA11_DB_PASSWORD,
      DB_PURGER_PASSWORD: env.CA11_DB_PASSWORD,
    },
  });
  compose('up', '-d', '--pull', 'never');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const state = run('docker', ['inspect', '-f', '{{.State.Status}}', 'iwana_ca11_edge']).trim();
    if (state === 'running') {
      run('docker', ['exec', 'iwana_ca11_edge', 'nginx', '-t']);
      return;
    }
    await sleep(1000);
  }
  throw new Error('nginx del ensayo no arrancó.');
}

function stop() {
  try {
    compose('--profile', 'bootstrap', '--profile', 'migrar', 'down', '--remove-orphans', '-t', '2');
  } catch (error) {
    console.error(`down falló: ${error.stderr ?? error.message}`);
  }
  rmSync(workdir, { recursive: true, force: true });
  const label = `label=com.docker.compose.project=${PROJECT}`;
  const left = ['ps -aq', 'network ls -q', 'volume ls -q']
    .map((command) => run('docker', [...command.split(' '), '--filter', label]).trim())
    .filter(Boolean);
  if (left.length > 0) throw new Error('Quedaron recursos del ensayo en Docker.');
  console.log('Ensayo desmontado: sin contenedores, redes ni volúmenes de iwana-ca11.');
}

// ── Peticiones ───────────────────────────────────────────────────────────────

/**
 * Petición con curl desde un contenedor cliente. `vhost` pone Host y SNI; `url` la sustituye
 * entera (API directa, IPv6). Devuelve estado, cabeceras, cuerpo y quién respondió.
 */
function request(client, spec) {
  const { method = 'GET', path = '/', headers = [], body, scheme = 'https' } = spec;
  const target = spec.vhost ? VHOST[spec.vhost] : null;
  const port = scheme === 'http' ? 80 : target?.port;
  const url = spec.url ?? `${scheme}://${target.host}:${port}${path}`;
  const list = ['-sk', '--path-as-is', '-m', '8', '-i', '-X', method];
  if (!spec.http2) list.push('--http1.1');
  if (spec.http10) list.push('-0');
  if (target && !spec.url && target.host !== EDGE_V4) {
    list.push('--resolve', `${target.host}:${port}:${EDGE_V4}`);
  }
  if (spec.resolveTo) list.push('--resolve', spec.resolveTo);
  if (spec.requestTarget) list.push('--request-target', spec.requestTarget);
  if (spec.ipv6) list.push('-6', '-g');
  for (const header of headers) list.push('-H', header);
  if (body !== undefined) {
    list.push('-H', 'content-type: application/json', '--data-binary', JSON.stringify(body));
  }
  list.push('-w', '\n__CA11__%{http_code}', url);
  const command =
    client === 'host'
      ? ['curl', list]
      : ['docker', ['exec', `iwana_ca11_${client}`, 'curl', ...list]];
  let output;
  let exit = 0;
  try {
    output = run(...command);
  } catch (error) {
    output = error.stdout ?? '';
    exit = error.status ?? -1;
  }
  const at = output.lastIndexOf('\n__CA11__');
  const status = at >= 0 ? Number(output.slice(at + 9)) : 0;
  const raw = at >= 0 ? output.slice(0, at) : '';
  const split = raw.indexOf('\r\n\r\n');
  const head = split >= 0 ? raw.slice(0, split) : raw;
  const text = split >= 0 ? raw.slice(split + 4) : '';
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no es JSON
  }
  let source;
  if (status === 0) source = `sin conexión (curl ${exit})`;
  else if (text.startsWith('stub-')) source = `app ${text.slice(5)}`;
  else if (json && typeof json === 'object') source = 'API';
  else source = 'nginx';
  return { status, head, text, json, source };
}

const cookieOf = (head, predicate) =>
  head
    .split('\r\n')
    .filter((line) => /^set-cookie:/iu.test(line))
    .map((line) => line.slice(line.indexOf(':') + 1).trim())
    .find(predicate)
    ?.split(';')[0];

/** Nombres de las cookies de plataforma: ninguna respuesta fuera de la consola puede fijarlas. */
const PLATFORM_COOKIES = [];

// ── Primer acceso del administrador (por la consola, desde la IP autorizada) ──

async function openPlatformSession() {
  const email = 'admin@ensayo.ca11.test';
  compose(
    '--profile',
    'bootstrap',
    'run',
    '--rm',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    'bootstrap',
    `--email=${email}`,
  );
  const file = readFileSync(join(workdir, 'bootstrap/admin.txt'), 'utf8');
  const password = /^contrasena=(.+)$/mu.exec(file)?.[1];
  if (!password) throw new Error('La CLI de alta no dejó la credencial.');

  const viaConsole = (spec) => request('autorizado', { vhost: 'consola', ...spec });
  const login = (body) => viaConsole({ method: 'POST', path: '/api/v1/auth/platform/login', body });
  const step = (name, response, expected) => {
    if (response.status !== expected) {
      // Sin el cuerpo: puede llevar tokens o el secreto TOTP.
      throw new Error(`${name}: HTTP ${response.status} ${response.json?.code ?? ''}`);
    }
    return response;
  };

  const first = step('primer ingreso', login({ email, password }), 200);
  if (!first.json?.data?.passwordResetRequired)
    throw new Error('El primer ingreso no exige cambio.');
  const newPassword = `Ca11-${hex(8)}-Zz9!`;
  step(
    'cambio de contraseña',
    viaConsole({
      method: 'POST',
      path: '/api/v1/auth/change-password',
      headers: [`authorization: Bearer ${first.json.data.accessToken}`],
      body: { currentPassword: password, newPassword },
    }),
    200,
  );
  const enrol = step('ingreso sin MFA', login({ email, password: newPassword }), 200);
  const setupToken = enrol.json?.data?.accessToken;
  if (!enrol.json?.data?.mfaSetupRequired) throw new Error('No se pidió inscribir MFA.');
  const setup = step(
    'inscripción MFA',
    viaConsole({
      method: 'POST',
      path: '/api/v1/auth/platform/mfa/setup',
      headers: [`authorization: Bearer ${setupToken}`],
      body: {},
    }),
    200,
  );
  const secret = new URL(setup.json.data.otpauthUri).searchParams.get('secret');
  const verify = viaConsole({
    method: 'POST',
    path: '/api/v1/auth/platform/mfa/verify',
    headers: [`authorization: Bearer ${setupToken}`],
    body: { totpCode: await nextTotpCode(secret) },
  });
  if (verify.status >= 300) throw new Error(`Confirmación MFA: HTTP ${verify.status}`);
  const full = step(
    'ingreso completo',
    login({ email, password: newPassword, totpCode: await nextTotpCode(secret) }),
    200,
  );
  const refreshCookie = cookieOf(full.head, (cookie) => /path=\/api\/v1\/auth/iu.test(cookie));
  const accessCookie = cookieOf(full.head, (cookie) => /path=\/(;|$)/iu.test(cookie));
  const accessToken = full.json?.data?.accessToken;
  if (!refreshCookie || !accessCookie || !accessToken) {
    throw new Error('El ingreso completo no dejó cookies y token de plataforma.');
  }
  PLATFORM_COOKIES.push(refreshCookie.split('=')[0], accessCookie.split('=')[0]);
  return { email, password: newPassword, refreshCookie, accessCookie, accessToken };
}

// ── Matriz ───────────────────────────────────────────────────────────────────

const NGINX_403 = { status: [403], source: 'nginx', label: '403 nginx' };
const NGINX_404 = { status: [404], source: 'nginx', label: '404 nginx' };
const NGINX_301 = { status: [301], source: 'nginx', label: '301 nginx (solo redirige)' };
const CLOSED = { status: [0], source: 'sin conexión', label: 'sin conexión' };
const api = (status, note = '') => ({
  status: [status],
  source: 'API',
  label: `${status} API${note ? ` (${note})` : ''}`,
});

function cases(session) {
  const login = { email: session.email, password: session.password };
  const bearer = `authorization: Bearer ${session.accessToken}`;
  const refreshCookie = `cookie: ${session.refreshCookie}`;
  const accessCookie = `cookie: ${session.accessCookie}`;
  const forged = ['x-iwana-surface: console', `x-iwana-origin: ${CONSOLE_ORIGIN}`];
  const xff = [`x-forwarded-for: ${IPS.autorizado}`, `x-real-ip: ${IPS.autorizado}`];
  const platformLogin = { method: 'POST', path: '/api/v1/auth/platform/login', body: login };
  const refresh = { method: 'POST', path: '/api/v1/auth/refresh' };
  const otherPassword = `Ca11-${hex(8)}-Yy8!`;
  const bootstrapBody = {
    email: 'otro@ensayo.ca11.test',
    password: otherPassword,
    confirmPassword: otherPassword,
  };
  const direct = (path) => `http://api-prod:3000${path}`;
  const X = 'externo';
  const apiIp = run('docker', [
    'inspect',
    '-f',
    `{{(index .NetworkSettings.Networks "${PROJECT}_edge").IPAddress}}`,
    'iwana_ca11_api',
  ]).trim();
  const published = run('docker', ['port', 'iwana_ca11_edge', '443/tcp']).trim().split('\n')[0];
  const hostPort = published.split(':').pop();

  return [
    [
      'Login',
      'L1',
      X,
      'consola',
      'login de plataforma con la contraseña correcta',
      platformLogin,
      NGINX_403,
    ],
    [
      'Login',
      'L2',
      X,
      'portal',
      'login de plataforma con la contraseña correcta',
      platformLogin,
      NGINX_404,
    ],
    ['Login', 'L3', X, 'archivos', 'login de plataforma', platformLogin, NGINX_404],
    ['Login', 'L4', X, 'desconocido', 'login de plataforma', platformLogin, NGINX_403],
    ['Login', 'L5', X, 'ip', 'login de plataforma', platformLogin, NGINX_403],
    [
      'Login',
      'L6',
      X,
      'consola',
      'login de plataforma por http',
      { ...platformLogin, scheme: 'http' },
      NGINX_301,
    ],
    [
      'Login',
      'L7',
      X,
      'portal',
      'login de plataforma por HTTP/2',
      { ...platformLogin, http2: true },
      NGINX_404,
    ],

    [
      'Refresh',
      'R1',
      X,
      'portal',
      'refresh con la cookie de plataforma, sin audiencia',
      { ...refresh, headers: [refreshCookie] },
      api(401, 'cookie ignorada'),
    ],
    [
      'Refresh',
      'R2',
      X,
      'portal',
      'refresh con cookie y `X-Session-Audience: platform`',
      { ...refresh, headers: [refreshCookie, 'x-session-audience: platform'] },
      api(401, 'cookie ignorada'),
    ],
    [
      'Refresh',
      'R3',
      X,
      'portal',
      'refresh con cookie y `X-Tenant-Slug` de un tenant inexistente',
      { ...refresh, headers: [refreshCookie, 'x-tenant-slug: ensayo'] },
      { status: [401, 404], source: 'API', label: '401/404 API (cookie ignorada; C1 lo confirma)' },
    ],
    [
      'Refresh',
      'R4',
      X,
      'consola',
      'refresh con cookie y audiencia',
      { ...refresh, headers: [refreshCookie, 'x-session-audience: platform'] },
      NGINX_403,
    ],
    [
      'Refresh',
      'R5',
      X,
      'portal',
      'logout con las cookies de plataforma y `X-Requested-With`',
      {
        method: 'POST',
        path: '/api/v1/auth/logout',
        headers: [
          `cookie: ${session.refreshCookie}; ${session.accessCookie}`,
          'x-requested-with: XMLHttpRequest',
        ],
      },
      api(401, 'no revoca'),
    ],
    [
      'Refresh',
      'R6',
      X,
      'portal',
      'logout con las cookies de plataforma, sin `X-Requested-With`',
      {
        method: 'POST',
        path: '/api/v1/auth/logout',
        headers: [`cookie: ${session.refreshCookie}; ${session.accessCookie}`],
      },
      api(403, 'CSRF'),
    ],

    [
      'Bearer',
      'B1',
      X,
      'portal',
      '`/auth/me` con Bearer de plataforma',
      { path: '/api/v1/auth/me', headers: [bearer] },
      api(401),
    ],
    [
      'Bearer',
      'B2',
      X,
      'portal',
      '`/auth/me` con la cookie de acceso de plataforma',
      { path: '/api/v1/auth/me', headers: [accessCookie] },
      api(401),
    ],
    [
      'Bearer',
      'B3',
      X,
      'consola',
      '`/auth/me` con Bearer de plataforma',
      { path: '/api/v1/auth/me', headers: [bearer] },
      NGINX_403,
    ],
    [
      'Bearer',
      'B4',
      X,
      'portal',
      '`/platform-users` con Bearer de plataforma',
      { path: '/api/v1/platform-users', headers: [bearer] },
      NGINX_404,
    ],
    [
      'Bearer',
      'B5',
      X,
      'portal',
      '`/tenants` con Bearer de plataforma',
      { path: '/api/v1/tenants', headers: [bearer] },
      NGINX_404,
    ],

    [
      'Mayúsculas',
      'M1',
      X,
      'portal',
      '`/API/V1/AUTH/PLATFORM/LOGIN`',
      { ...platformLogin, path: '/API/V1/AUTH/PLATFORM/LOGIN' },
      NGINX_404,
    ],
    [
      'Mayúsculas',
      'M2',
      X,
      'portal',
      '`/api/v1/Platform-Users/bootstrap/status`',
      { path: '/api/v1/Platform-Users/bootstrap/status' },
      NGINX_404,
    ],
    [
      'Mayúsculas',
      'M3',
      X,
      'portal',
      '`/api/v1/TENANTS`',
      { path: '/api/v1/TENANTS', headers: [bearer] },
      NGINX_404,
    ],
    [
      'Mayúsculas',
      'M4',
      X,
      'portal',
      '`/Api/V1/Platform/branding/public`',
      { path: '/Api/V1/Platform/branding/public' },
      NGINX_404,
    ],
    [
      'Mayúsculas',
      'M5',
      X,
      'consola',
      '`/API/V1/AUTH/PLATFORM/LOGIN`',
      { ...platformLogin, path: '/API/V1/AUTH/PLATFORM/LOGIN' },
      NGINX_403,
    ],

    [
      '`//`',
      'D1',
      X,
      'portal',
      '`/api//v1//auth/platform/login`',
      { ...platformLogin, path: '/api//v1//auth/platform/login' },
      NGINX_404,
    ],
    [
      '`//`',
      'D2',
      X,
      'portal',
      '`//api/v1/tenants`',
      { path: '//api/v1/tenants', headers: [bearer] },
      NGINX_404,
    ],
    [
      '`//`',
      'D3',
      X,
      'portal',
      '`/api/v1//platform-users//bootstrap/status`',
      { path: '/api/v1//platform-users//bootstrap/status' },
      NGINX_404,
    ],

    [
      '`%2e`',
      'E1',
      X,
      'portal',
      '`/api/v1/x/%2e%2e/auth/platform/login`',
      { ...platformLogin, path: '/api/v1/x/%2e%2e/auth/platform/login' },
      NGINX_404,
    ],
    [
      '`%2e`',
      'E2',
      X,
      'portal',
      '`/api/v1/%2e/tenants`',
      { path: '/api/v1/%2e/tenants', headers: [bearer] },
      NGINX_404,
    ],
    [
      '`%2e`',
      'E3',
      X,
      'portal',
      '`/api/v1/auth/%70latform/login`',
      { ...platformLogin, path: '/api/v1/auth/%70latform/login' },
      NGINX_404,
    ],
    [
      '`%2e`',
      'E4',
      X,
      'portal',
      '`/api/v1/auth/platform%2flogin`',
      { ...platformLogin, path: '/api/v1/auth/platform%2flogin' },
      NGINX_404,
    ],
    [
      '`%2e`',
      'E5',
      X,
      'portal',
      '`/api/v1/tenants/me/%2e%2e/%2e%2e/platform-users`',
      { path: '/api/v1/tenants/me/%2e%2e/%2e%2e/platform-users', headers: [bearer] },
      NGINX_404,
    ],
    [
      '`%2e`',
      'E6',
      X,
      'portal',
      '`/api/v1/x/../auth/platform/login` (sin normalizar)',
      { ...platformLogin, path: '/api/v1/x/../auth/platform/login' },
      NGINX_404,
    ],

    [
      'Barra final',
      'T1',
      X,
      'portal',
      '`/api/v1/auth/platform/login/`',
      { ...platformLogin, path: '/api/v1/auth/platform/login/' },
      NGINX_404,
    ],
    [
      'Barra final',
      'T2',
      X,
      'portal',
      '`/api/v1/tenants/`',
      { path: '/api/v1/tenants/', headers: [bearer] },
      NGINX_404,
    ],
    [
      'Barra final',
      'T3',
      X,
      'portal',
      '`/api/v1/platform-users/bootstrap/status/`',
      { path: '/api/v1/platform-users/bootstrap/status/' },
      NGINX_404,
    ],

    [
      'XFF falso',
      'F1',
      X,
      'consola',
      '`/` con `X-Forwarded-For` y `X-Real-IP` de la IP autorizada',
      { path: '/', headers: xff },
      NGINX_403,
    ],
    [
      'XFF falso',
      'F2',
      X,
      'consola',
      'login de plataforma con XFF de la IP autorizada',
      { ...platformLogin, headers: xff },
      NGINX_403,
    ],
    [
      'XFF falso',
      'F3',
      X,
      'portal',
      'login de plataforma con XFF de la IP autorizada',
      { ...platformLogin, headers: xff },
      NGINX_404,
    ],
    [
      'XFF falso',
      'F4',
      'autorizado2',
      'consola',
      `contraseña errónea con \`X-Forwarded-For: ${FORGED_IP}\``,
      {
        ...platformLogin,
        body: { ...login, password: 'Erronea-123!' },
        headers: [`x-forwarded-for: ${FORGED_IP}`, `x-real-ip: ${FORGED_IP}`],
      },
      api(401),
    ],
    [
      'XFF falso',
      'F5',
      'base',
      null,
      'IP auditada del intento F4',
      { check: auditedIp },
      { label: `${IPS.autorizado2} (no ${FORGED_IP})`, value: IPS.autorizado2 },
    ],

    [
      'IPv6',
      'V1',
      X,
      null,
      `https://[${EDGE_V6}] con Host de la consola`,
      {
        url: `https://[${EDGE_V6}]:443/api/v1/auth/platform/login`,
        method: 'POST',
        body: login,
        ipv6: true,
        headers: [`host: ${VHOST.consola.host}`],
      },
      CLOSED,
    ],
    [
      'IPv6',
      'V2',
      X,
      null,
      `https://[${EDGE_V6}]:${PORTAL_PORT} con Host del portal`,
      {
        url: `https://[${EDGE_V6}]:${PORTAL_PORT}/api/v1/tenants`,
        ipv6: true,
        headers: [`host: ${VHOST.portal.host}`],
      },
      CLOSED,
    ],
    [
      'IPv6',
      'V3',
      X,
      null,
      `http://[${EDGE_V6}]:80`,
      { url: `http://[${EDGE_V6}]:80/`, ipv6: true },
      CLOSED,
    ],

    ['Host desconocido', 'H1', X, 'desconocido', '`/`', { path: '/' }, NGINX_403],
    [
      'Host desconocido',
      'H2',
      X,
      'desconocido',
      'login del portal',
      { method: 'POST', path: '/api/v1/auth/login', body: login },
      NGINX_403,
    ],
    [
      'Host desconocido',
      'H3',
      X,
      'desconocido',
      '`/api/v1/tenants` con Bearer',
      { path: '/api/v1/tenants', headers: [bearer] },
      NGINX_403,
    ],
    [
      'Host desconocido',
      'H4',
      X,
      'portal',
      'SNI del portal y `Host` de la consola',
      { ...platformLogin, headers: [`host: ${VHOST.consola.host}`] },
      // Por nombres decide el Host (consola, con su lista). Por IP, 8443 es siempre el portal.
      MODE === 'lan'
        ? { status: [404], source: 'nginx', label: '404 nginx (8443 solo sirve el portal)' }
        : NGINX_403,
    ],
    [
      'Host desconocido',
      'H5',
      X,
      'ip',
      'HTTP/1.0 sin `Host`',
      {
        path: '/api/v1/auth/platform/login',
        method: 'POST',
        body: login,
        http10: true,
        headers: ['host:'],
      },
      NGINX_403,
    ],

    ['IP directa', 'I1', X, 'ip', '`https://<IP de nginx>/`', { path: '/' }, NGINX_403],
    [
      'IP directa',
      'I2',
      X,
      'ip',
      '`https://<IP de nginx>/api/v1/tenants` con Bearer',
      { path: '/api/v1/tenants', headers: [bearer] },
      NGINX_403,
    ],
    [
      'IP directa',
      'I3',
      X,
      'ip',
      '`http://<IP de nginx>/`',
      { path: '/', scheme: 'http' },
      NGINX_301,
    ],
    [
      'IP directa',
      'I4',
      X,
      null,
      '`http://api-prod:3000` (API sin nginx)',
      { url: direct('/api/v1/auth/platform/login'), method: 'POST', body: login },
      CLOSED,
    ],
    [
      'IP directa',
      'I5',
      X,
      null,
      '`http://<IP de la API>:3000`',
      { url: `http://${apiIp}:3000/api/v1/auth/platform/login`, method: 'POST', body: login },
      CLOSED,
    ],
    [
      'IP directa',
      'I6',
      'host',
      null,
      `puerto publicado \`${published}\` (nginx ve la pasarela)`,
      {
        url: `https://${VHOST.consola.host}:${hostPort}/api/v1/auth/platform/login`,
        resolveTo: `${VHOST.consola.host}:${hostPort}:127.0.0.1`,
        method: 'POST',
        body: login,
      },
      NGINX_403,
    ],

    [
      'Alta inicial',
      'A1',
      X,
      'consola',
      '`POST /platform-users/bootstrap`',
      { method: 'POST', path: '/api/v1/platform-users/bootstrap', body: login },
      NGINX_403,
    ],
    [
      'Alta inicial',
      'A2',
      X,
      'portal',
      '`POST /platform-users/bootstrap`',
      { method: 'POST', path: '/api/v1/platform-users/bootstrap', body: login },
      NGINX_404,
    ],
    [
      'Alta inicial',
      'A3',
      X,
      'portal',
      '`GET /platform-users/bootstrap/status`',
      { path: '/api/v1/platform-users/bootstrap/status' },
      NGINX_404,
    ],
    [
      'Alta inicial',
      'A4',
      X,
      'desconocido',
      '`POST /platform-users/bootstrap`',
      { method: 'POST', path: '/api/v1/platform-users/bootstrap', body: login },
      NGINX_403,
    ],
    [
      'Alta inicial',
      'A5',
      'interno',
      null,
      'API directa sin cabecera de origen',
      { url: direct('/api/v1/platform-users/bootstrap/status') },
      api(404),
    ],
    [
      'Alta inicial',
      'A6',
      'interno',
      null,
      'API directa con `X-Iwana-Surface: console` y cuerpo válido',
      {
        url: direct('/api/v1/platform-users/bootstrap'),
        method: 'POST',
        body: bootstrapBody,
        headers: ['x-iwana-surface: console'],
      },
      api(404, 'no existe en producción'),
    ],

    [
      'Cabecera falsificada',
      'S1',
      X,
      'portal',
      'login de plataforma con `X-Iwana-Surface: console` y `X-Iwana-Origin`',
      { ...platformLogin, headers: forged },
      NGINX_404,
    ],
    [
      'Cabecera falsificada',
      'S2',
      X,
      'portal',
      'refresh con cookie, audiencia y cabeceras de consola',
      { ...refresh, headers: [refreshCookie, 'x-session-audience: platform', ...forged] },
      api(401, 'nginx sobrescribe'),
    ],
    [
      'Cabecera falsificada',
      'S3',
      X,
      'portal',
      '`/auth/me` con Bearer y cabeceras de consola',
      { path: '/api/v1/auth/me', headers: [bearer, ...forged] },
      api(401, 'nginx sobrescribe'),
    ],
    [
      'Cabecera falsificada',
      'S4',
      X,
      'portal',
      '`Origin` de la consola en el portal',
      {
        method: 'POST',
        path: '/api/v1/auth/login',
        body: login,
        headers: [`origin: ${CONSOLE_ORIGIN}`],
      },
      api(403),
    ],
    [
      'Cabecera falsificada',
      'S5',
      X,
      'portal',
      '`Origin` ajeno',
      {
        method: 'POST',
        path: '/api/v1/auth/login',
        body: login,
        headers: ['origin: https://ajeno.example'],
      },
      api(403),
    ],
    [
      'Cabecera falsificada',
      'S6',
      'interno',
      null,
      'API directa: login de plataforma sin cabecera',
      { url: direct('/api/v1/auth/platform/login'), method: 'POST', body: login },
      api(404),
    ],
    [
      'Cabecera falsificada',
      'S7',
      'interno',
      null,
      'API directa: login con `X-Iwana-Surface: portal`',
      {
        url: direct('/api/v1/auth/platform/login'),
        method: 'POST',
        body: login,
        headers: ['x-iwana-surface: portal'],
      },
      api(404),
    ],
    [
      'Cabecera falsificada',
      'S8',
      'interno',
      null,
      'API directa: Bearer de plataforma sin cabecera',
      { url: direct('/api/v1/auth/me'), headers: [bearer] },
      api(401),
    ],
    [
      'Cabecera falsificada',
      'S9',
      'interno',
      null,
      'API directa: refresh con cookie y audiencia, sin cabecera',
      {
        url: direct('/api/v1/auth/refresh'),
        method: 'POST',
        headers: [refreshCookie, 'x-session-audience: platform'],
      },
      api(401),
    ],

    [
      'Defensa API',
      'P1',
      'interno',
      null,
      'API directa con `X-Iwana-Surface: portal`: `/API/V1/AUTH/PLATFORM/LOGIN`',
      {
        url: direct('/API/V1/AUTH/PLATFORM/LOGIN'),
        method: 'POST',
        body: login,
        headers: ['x-iwana-surface: portal'],
      },
      api(404),
    ],
    [
      'Defensa API',
      'P2',
      'interno',
      null,
      'API directa, portal: `/api//v1//auth/platform/login`',
      {
        url: direct('/api//v1//auth/platform/login'),
        method: 'POST',
        body: login,
        headers: ['x-iwana-surface: portal'],
      },
      api(404),
    ],
    [
      'Defensa API',
      'P3',
      'interno',
      null,
      'API directa, portal: `/api/v1/auth/platform%2flogin`',
      {
        url: direct('/api/v1/auth/platform%2flogin'),
        method: 'POST',
        body: login,
        headers: ['x-iwana-surface: portal'],
      },
      api(404),
    ],
    [
      'Defensa API',
      'P4',
      'interno',
      null,
      'API directa, portal: `/api/v1/auth/platform/login/`',
      {
        url: direct('/api/v1/auth/platform/login/'),
        method: 'POST',
        body: login,
        headers: ['x-iwana-surface: portal'],
      },
      api(404),
    ],
    [
      'Defensa API',
      'P5',
      'interno',
      null,
      'API directa, portal: `/api/v1/x/%2e%2e/tenants` con Bearer',
      { url: direct('/api/v1/x/%2e%2e/tenants'), headers: [bearer, 'x-iwana-surface: portal'] },
      api(404),
    ],
    [
      'Defensa API',
      'P6',
      'interno',
      null,
      'API directa, portal: `/api/v1/Tenants` con Bearer',
      { url: direct('/api/v1/Tenants'), headers: [bearer, 'x-iwana-surface: portal'] },
      api(404),
    ],
    [
      'Defensa API',
      'P7',
      'app',
      null,
      'desde la red de web y portal: API con `X-Iwana-Surface: console`',
      {
        url: direct('/api/v1/auth/platform/login'),
        method: 'POST',
        body: login,
        headers: ['x-iwana-surface: console'],
      },
      CLOSED,
    ],
    [
      'Otros vectores',
      'Q1',
      X,
      'portal',
      'URL absoluta de la consola en la línea de petición, por la conexión del portal',
      { ...platformLogin, requestTarget: `${CONSOLE_ORIGIN}/api/v1/auth/platform/login` },
      MODE === 'lan'
        ? { status: [404], source: 'nginx', label: '404 nginx (8443 solo sirve el portal)' }
        : NGINX_403,
    ],
    [
      'Otros vectores',
      'Q2',
      X,
      'portal',
      'HTTP/2: SNI del portal y `:authority` de la consola',
      { ...platformLogin, http2: true, headers: [`host: ${VHOST.consola.host}`] },
      MODE === 'lan'
        ? { status: [404], source: 'nginx', label: '404 nginx (8443 solo sirve el portal)' }
        : NGINX_403,
    ],
    [
      'Otros vectores',
      'Q3',
      X,
      'portal',
      '`Origin` del portal en mayúsculas',
      {
        method: 'POST',
        path: '/api/v1/auth/login',
        body: login,
        headers: [`origin: ${PORTAL_ORIGIN.toUpperCase()}`],
      },
      api(403),
    ],
    [
      'Otros vectores',
      'Q4',
      X,
      'portal',
      '`Origin: null`',
      { method: 'POST', path: '/api/v1/auth/login', body: login, headers: ['origin: null'] },
      api(403),
    ],
    [
      'Otros vectores',
      'Q5',
      X,
      'portal',
      MODE === 'lan' ? '`Origin` del portal sin su puerto' : '`Origin` del portal con `:443`',
      {
        method: 'POST',
        path: '/api/v1/auth/login',
        body: login,
        headers: [
          `origin: ${MODE === 'lan' ? `https://${VHOST.portal.host}` : `${PORTAL_ORIGIN}:443`}`,
        ],
      },
      api(403),
    ],
    [
      'Otros vectores',
      'Q6',
      X,
      'archivos',
      'refresh con cookie y audiencia',
      { ...refresh, headers: [refreshCookie, 'x-session-audience: platform'] },
      NGINX_404,
    ],
    [
      'Otros vectores',
      'Q7',
      X,
      'archivos',
      '`/auth/me` con Bearer de plataforma',
      { path: '/api/v1/auth/me', headers: [bearer] },
      NGINX_404,
    ],
    [
      'Otros vectores',
      'Q8',
      X,
      'archivos',
      '`POST /platform-users/bootstrap`',
      { method: 'POST', path: '/api/v1/platform-users/bootstrap', body: bootstrapBody },
      NGINX_404,
    ],
    [
      'Control',
      'C1',
      'autorizado2',
      'consola',
      'refresh con la misma cookie tras todos los intentos',
      { ...refresh, headers: [refreshCookie, 'x-session-audience: platform'] },
      api(200, 'la cookie no se consumió'),
    ],
    [
      'Control',
      'C2',
      'autorizado2',
      'consola',
      '`/auth/me` con Bearer de plataforma',
      { path: '/api/v1/auth/me', headers: [bearer] },
      api(200),
    ],
    [
      'Control',
      'C3',
      'autorizado2',
      'consola',
      'login de plataforma con `Origin` propio',
      { ...platformLogin, headers: [`origin: ${CONSOLE_ORIGIN}`] },
      api(200, 'pide el código'),
    ],
    [
      'Control',
      'C4',
      X,
      'portal',
      'login del portal (su superficie llega)',
      { method: 'POST', path: '/api/v1/auth/login', body: login },
      api(400, 'falta el tenant'),
    ],
    [
      'Control',
      'C5',
      X,
      'portal',
      '`/dashboard`',
      { path: '/dashboard' },
      { status: [200], source: 'app portal', label: '200 app portal' },
    ],
    [
      'Control',
      'C6',
      'autorizado2',
      'consola',
      '`/dashboard`',
      { path: '/dashboard' },
      { status: [200], source: 'app web', label: '200 app web' },
    ],
    [
      'Control',
      'C8',
      'autorizado2',
      'consola',
      'login de plataforma por HTTP/2 con `Origin` propio',
      { ...platformLogin, http2: true, headers: [`origin: ${CONSOLE_ORIGIN}`] },
      api(200, 'pide el código'),
    ],
    [
      'Control',
      'C7',
      'base',
      null,
      'access log de nginx',
      { check: accessLog },
      { label: 'IP real de cada cliente; la pasarela solo en I6', value: 'ok' },
    ],
  ].map(([group, id, client, vhost, what, spec, expected]) => ({
    group,
    id,
    client,
    vhost,
    what,
    spec,
    expected,
  }));
}

function auditedIp() {
  const value = run('docker', [
    'exec',
    'iwana_ca11_postgres',
    'psql',
    '-U',
    'ca11_bootstrap',
    '-d',
    'ca11',
    '-tAc',
    `select (select ip_address from public.platform_audit_logs where action = 'LOGIN_FAILED' order by created_at desc limit 1) || ' ' || (select count(*) from public.platform_audit_logs where ip_address = '${FORGED_IP}')`,
  ]).trim();
  const [ip, forged] = value.split(' ');
  return {
    obtained: `${ip}; filas con ${FORGED_IP}: ${forged}`,
    value: forged === '0' ? ip : 'falla',
  };
}

function accessLog() {
  const gateway = run('docker', [
    'network',
    'inspect',
    '-f',
    '{{range .IPAM.Config}}{{.Gateway}} {{end}}',
    `${PROJECT}_front`,
  ])
    .trim()
    .split(' ')
    .find((ip) => ip.includes('.'));
  const lines = run('docker', ['logs', 'iwana_ca11_edge'], { stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n')
    .filter((line) => /^\S+ - /u.test(line));
  const count = (ip) => lines.filter((line) => line.startsWith(`${ip} `)).length;
  const fromGateway = count(gateway);
  const ok = count(IPS.externo) > 0 && count(IPS.autorizado2) > 0 && fromGateway <= 1;
  return {
    obtained: `externo ${count(IPS.externo)}, autorizado2 ${count(IPS.autorizado2)}, pasarela ${fromGateway}`,
    value: ok ? 'ok' : 'falla',
  };
}

function evaluate(item) {
  if (item.spec.check) {
    const { obtained, value } = item.spec.check();
    return { obtained, pass: value === item.expected.value };
  }
  return judge(item, request(item.client, { vhost: item.vhost, ...item.spec }));
}

function judge(item, response) {
  const location = response.status === 301 ? /^location: (.*)$/imu.exec(response.head)?.[1] : null;
  const obtained = `${response.status === 0 ? '' : `${response.status} `}${response.source}${
    location
      ? ` → ${location
          .trim()
          .replace(/:\d+\//u, '/')
          .replace(/\/api\/.*/u, '/…')}`
      : ''
  }${response.json?.data?.mfaRequired ? ' (pide el código)' : ''}`;
  // Fuera de la consola, ni cookies ni tokens de plataforma, sea cual sea el estado.
  const leaked =
    ['externo', 'interno', 'app'].includes(item.client) &&
    (PLATFORM_COOKIES.some((name) =>
      new RegExp(`^set-cookie: ${name}=[^;]`, 'imu').test(response.head),
    ) ||
      Boolean(response.json?.data?.accessToken));
  const pass =
    !leaked &&
    item.expected.status.includes(response.status) &&
    response.source.startsWith(item.expected.source);
  return { obtained: leaked ? `${obtained} + FUGA de sesión` : obtained, pass };
}

function table(results) {
  const rows = results.map(
    (r) =>
      `| ${r.id} | ${r.group} | ${r.client}${r.vhost ? ` → ${r.vhost}` : ''} | ${r.what} | ${r.expected.label} | ${r.obtained} | ${r.pass ? 'sí' : '**NO**'} |`,
  );
  return [
    `Ensayo CA-11 · modo ${MODE} · ${new Date().toISOString()}`,
    '',
    '| # | Grupo | Cliente → vhost | Petición | Esperado | Obtenido | Pasa |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Resultado: ${results.filter((r) => r.pass).length}/${results.length} casos en lo esperado.`,
  ].join('\n');
}

// ── Principal ────────────────────────────────────────────────────────────────

// Ctrl+C o SIGTERM también desmontan: sin esto quedarían contenedores y la carpeta temporal.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    try {
      stop();
    } finally {
      process.exit(130);
    }
  });
}

let failed = true;
try {
  build();
  prepare();
  console.log(`Arrancando el ensayo (modo ${MODE})…`);
  await start();
  const session = await openPlatformSession();
  console.log('Sesión de plataforma abierta desde la IP autorizada. Recorriendo la matriz…');
  const results = cases(session).map((item) => ({ ...item, ...evaluate(item) }));
  const report = table(results);
  console.log(`\n${report}\n`);
  if (typeof args.get('informe') === 'string') writeFileSync(args.get('informe'), `${report}\n`);
  failed = results.some((r) => !r.pass);
} catch (error) {
  console.error(`El ensayo no terminó: ${error.message}`);
  for (const name of ['migrator', 'api', 'edge']) {
    try {
      console.error(
        `── ${name} ──\n${run('sh', ['-c', `docker logs --tail 80 iwana_ca11_${name} 2>&1`])}`,
      );
    } catch {
      // ese contenedor no llegó a existir
    }
  }
} finally {
  stop();
}
process.exitCode = failed ? 1 : 0;
