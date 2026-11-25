/**
 * Vhosts de nginx.prod.conf con un nginx real (spec 2026-11-25 §5, CA-11 en ensayo).
 * Requiere Docker: IWANA_NGINX_INTEGRATION=1 node --test scripts/nginx-surface.integration.test.mjs
 * Todo vive en una red desechable; no publica puertos.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

const enabled = process.env.IWANA_NGINX_INTEGRATION === '1';
const IMAGE = process.env.NGINX_IMAGE ?? 'nginx:1.29-alpine';
const CONF = resolve(process.env.IWANA_NGINX_CONF ?? 'nginx/nginx.prod.conf');
const NET = `iwana_surface_${process.pid}`;
const SUBNET = '172.31.251';
const EDGE = `${SUBNET}.10`;
const ALLOWED = `${SUBNET}.20`;
const OUTSIDER = `${SUBNET}.30`;
const CONSOLE = 'consola.replace_me_production_domain';
// Con la configuración por IP de la LAN, el portal está en otro puerto: IWANA_NGINX_PORTAL_PORT=8443.
const PORTAL_PORT = process.env.IWANA_NGINX_PORTAL_PORT ?? '443';
const PORTAL = PORTAL_PORT === '443' ? 'portal.replace_me_production_domain' : 'portal.lan.example';
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let dir;

const portOf = (host) => (host === PORTAL ? PORTAL_PORT : '443');

/** Estado y cuerpo vistos por un cliente con esa IP. */
function ask(ip, host, path, headers = []) {
  const output = docker(
    'exec',
    `${NET}_${ip.split('.')[3]}`,
    'curl',
    '-sk',
    '--path-as-is',
    '-m',
    '10',
    '--resolve',
    `${host}:${portOf(host)}:${EDGE}`,
    ...headers.flatMap((header) => ['-H', header]),
    '-w',
    '\n%{http_code}',
    `https://${host}:${portOf(host)}${path}`,
  );
  const lines = output.split('\n');
  return { status: Number(lines.pop()), body: lines.join('\n') };
}

before(() => {
  if (!enabled) return;
  dir = mkdtempSync(join(tmpdir(), 'iwana-surface-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=test',
      '-keyout',
      join(dir, 'privkey.pem'),
      '-out',
      join(dir, 'fullchain.pem'),
    ],
    { stdio: 'ignore' },
  );
  execFileSync('chmod', ['a+r', join(dir, 'privkey.pem')]);
  execFileSync('chmod', ['a+rx', dir]);
  writeFileSync(join(dir, 'allow.conf'), `allow 127.0.0.1;\nallow ${ALLOWED};\ndeny all;\n`);
  writeFileSync(
    join(dir, 'stub.conf'),
    [
      [3000, 'api'],
      [3001, 'web'],
      [3002, 'portal'],
      [9000, 'storage'],
    ]
      .map(
        ([port, name]) =>
          `server { listen ${port}; location / { return 200 "${name} surface=$http_x_iwana_surface xff=$http_x_forwarded_for uri=$request_uri"; } }`,
      )
      .join('\n'),
  );
  docker('network', 'create', '--subnet', `${SUBNET}.0/24`, NET);
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    `${NET}_stub`,
    '--network',
    NET,
    '--ip',
    `${SUBNET}.5`,
    ...['api-prod', 'web-prod', 'portal-prod', 'minio'].flatMap((alias) => [
      '--network-alias',
      alias,
    ]),
    '-v',
    `${dir}/stub.conf:/etc/nginx/conf.d/default.conf:ro`,
    IMAGE,
  );
  docker(
    'run',
    '-d',
    '--rm',
    '--name',
    `${NET}_edge`,
    '--network',
    NET,
    '--ip',
    EDGE,
    '-v',
    `${CONF}:/etc/nginx/conf.d/default.conf:ro`,
    '-v',
    `${dir}/allow.conf:/etc/nginx/console/allow.conf:ro`,
    '-v',
    `${dir}:/etc/nginx/tls:ro`,
    IMAGE,
  );
  for (const ip of [ALLOWED, OUTSIDER]) {
    docker(
      'run',
      '-d',
      '--rm',
      '--name',
      `${NET}_${ip.split('.')[3]}`,
      '--network',
      NET,
      '--ip',
      ip,
      IMAGE,
      'sleep',
      '600',
    );
  }
  docker('exec', `${NET}_edge`, 'nginx', '-t');
  for (let n = 0; n < 20; n += 1) {
    try {
      ask(ALLOWED, PORTAL, '/');
      return;
    } catch {
      execFileSync('sleep', ['0.5']);
    }
  }
  throw new Error('nginx de prueba no respondió.');
});

after(() => {
  if (!enabled) return;
  for (const name of ['stub', 'edge', '20', '30']) {
    try {
      docker('rm', '-f', `${NET}_${name}`);
    } catch {
      // ya no existe
    }
  }
  docker('network', 'rm', NET);
  rmSync(dir, { recursive: true });
});

const options = { skip: !enabled && 'requiere IWANA_NGINX_INTEGRATION=1 y Docker' };
const PLATFORM = [
  '/api/v1/auth/platform/login',
  '/api/v1/platform-users/bootstrap',
  '/api/v1/platform-users/bootstrap/status',
  '/api/v1/platform/branding/public',
  '/api/v1/platform-audit-logs',
  '/api/v1/tenants',
  '/api/v1/tenants/',
  '/api/v1/tenants/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  '/api/v1/tenants/mean',
];
const DISGUISED = [
  '/API/v1/auth/platform/login',
  '/api/V1/Auth/Platform/Login',
  '/api//v1//auth/platform/login',
  '/api/v1/auth/%70latform/login',
  '/api/v1/x/%2e%2e/auth/platform/login',
  '/api/v1/x/../auth/platform/login',
  '/api/v1/auth/platform/login/',
  '/api/v1/auth/platform%2flogin',
];

test('consola: fuera de la lista nada responde, con ningún nombre ni disfraz', options, () => {
  for (const host of [CONSOLE, 'desconocido.example', EDGE]) {
    for (const path of [
      '/',
      '/health',
      '/dashboard',
      '/api/v1/auth/refresh',
      '/api/v1/crm/subscribers',
      ...PLATFORM,
      ...DISGUISED,
    ]) {
      const { status, body } = ask(OUTSIDER, host, path, [
        `X-Forwarded-For: ${ALLOWED}`,
        `X-Real-IP: ${ALLOWED}`,
        'X-Iwana-Surface: console',
      ]);
      assert.ok(status === 403 || status === 400, `${host}${path} → ${status}`);
      assert.doesNotMatch(body, /surface=/u);
    }
  }
});

test('consola: una IP autorizada llega, marcada y con su IP real', options, () => {
  for (const path of ['/api/v1/auth/platform/login', '/api/v1/tenants', '/api/v1/auth/refresh']) {
    const { status, body } = ask(ALLOWED, CONSOLE, path, [
      'X-Iwana-Surface: portal',
      'X-Forwarded-For: 8.8.8.8',
    ]);
    assert.equal(status, 200, path);
    assert.match(body, new RegExp(`^api surface=console xff=${ALLOWED} `, 'u'));
  }
  assert.match(ask(ALLOWED, CONSOLE, '/dashboard').body, /^web surface=console /u);
});

test('portal: las superficies de plataforma no existen, ni disfrazadas', options, () => {
  for (const ip of [OUTSIDER, ALLOWED]) {
    for (const path of PLATFORM) {
      assert.equal(ask(ip, PORTAL, path, ['X-Iwana-Surface: console']).status, 404, path);
    }
    for (const path of DISGUISED) {
      const { status, body } = ask(ip, PORTAL, path, ['X-Iwana-Surface: console']);
      // O no existe, o cae en la aplicación del portal, que no reenvía a la API.
      assert.ok(
        status === 404 ||
          status === 400 ||
          (status === 200 && body.startsWith('portal surface=portal ')),
        `${path} → ${status} ${body}`,
      );
    }
  }
});

test('portal: lo suyo llega marcado como portal aunque el cliente falsifique', options, () => {
  for (const path of [
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/api/v1/tenants/me',
    '/api/v1/tenants/me/settings',
    '/api/v1/tenants/public-branding?slug=x',
    '/api/v1/migration/batches',
    '/api/v1/health',
    '/api/v1/assurance/tickets/3f2504e0-4f89-41d3-9a0c-0305e82c3301/comments/with-attachments',
  ]) {
    const { status, body } = ask(OUTSIDER, PORTAL, path, ['X-Iwana-Surface: console']);
    assert.equal(status, 200, path);
    assert.match(body, /^api surface=portal /u, path);
  }
  assert.match(ask(OUTSIDER, PORTAL, '/dashboard').body, /^portal surface=portal /u);
});
