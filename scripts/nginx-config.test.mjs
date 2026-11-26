import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const configPath = fileURLToPath(new URL('../nginx/nginx.dev.conf', import.meta.url));

test('nginx dev preserves the API global prefix', async () => {
  const config = await readFile(configPath, 'utf8');
  const apiLocation = config.match(/location \/api\/ \{([\s\S]*?)\n    \}/)?.[1] ?? '';

  assert.match(apiLocation, /proxy_pass http:\/\/api;/);
  assert.doesNotMatch(apiLocation, /proxy_pass http:\/\/api\//);
});

test('nginx dev health proxies to the real Nest health endpoint', async () => {
  const config = await readFile(configPath, 'utf8');
  const healthLocation = config.match(/location \/health \{([\s\S]*?)\n    \}/)?.[1] ?? '';

  assert.match(healthLocation, /proxy_pass http:\/\/api\/api\/v1\/health;/);
});

// ── Límites de cuerpo de producción ──────────────────────────────────────────
// Cada vhost conserva 10M; solo dos rutas acotadas lo amplían: la subida de lotes UISP (ADR-110,
// 210M) y el comentario de ticket con adjuntos (MOD09, spec 2026-11-16 §2.5, 110M).
const prodConfigPath = fileURLToPath(new URL('../nginx/nginx.prod.conf', import.meta.url));
const TICKET_ATTACHMENTS_LOCATION =
  '"^/api/v1/assurance/tickets/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/comments/with-attachments$"';

function serverBlocks(config) {
  return config.split(/\nserver \{/).slice(1);
}

function locationBody(block, header) {
  const start = block.indexOf(`location ${header} {`);
  if (start === -1) return null;
  const end = block.indexOf('\n    }', start);
  return block.slice(start, end);
}

test('nginx redirects IP access to HTTPS and routes the default host to web and API', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const blocks = serverBlocks(config);
  const http = blocks.find((block) => block.includes('listen 80 default_server;'));
  const https = blocks.find((block) => block.includes('listen 443 ssl default_server;'));

  assert.match(http ?? '', /return 301 https:\/\/\$host\$request_uri;/);
  assert.ok(https, 'falta el sitio HTTPS predeterminado');
  assert.match(locationBody(https, '/') ?? '', /proxy_pass http:\/\/web;/);
  assert.match(locationBody(https, '/api/') ?? '', /proxy_pass http:\/\/api;/);
});

test('nginx prod keeps 10M as the vhost body limit and widens only the bounded routes', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const tlsBlocks = serverBlocks(config).filter(
    (block) => block.includes('listen 443') && !block.includes('server_name archivos.'),
  );
  assert.equal(tlsBlocks.length, 2);

  for (const block of tlsBlocks) {
    const limits = [...block.matchAll(/^( *)client_max_body_size (\S+);/gm)].map(
      ([, indent, size]) => ({
        level: indent.length === 4 ? 'server' : 'location',
        size,
      }),
    );
    assert.deepEqual(limits, [
      { level: 'server', size: '10M' },
      { level: 'location', size: '210M' },
      { level: 'location', size: '110M' },
    ]);

    const migration = locationBody(block, '= /api/v1/migration/batches');
    assert.match(migration ?? '', /client_max_body_size 210M;/);

    const attachments = locationBody(block, `~ ${TICKET_ATTACHMENTS_LOCATION}`);
    assert.ok(attachments, 'falta la location de adjuntos de ticket');
    assert.match(attachments, /client_max_body_size 110M;/);
    assert.match(attachments, /proxy_request_buffering off;/);
    assert.match(attachments, /proxy_pass http:\/\/api;/);
    assert.match(attachments, /proxy_set_header X-Forwarded-For \$remote_addr;/);
    assert.match(attachments, /proxy_read_timeout 600s;/);
  }
});

test('nginx prod ticket attachments location only matches a UUID ticket path', () => {
  const pattern = new RegExp(TICKET_ATTACHMENTS_LOCATION.slice(1, -1));
  const ticketId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  assert.match(`/api/v1/assurance/tickets/${ticketId}/comments/with-attachments`, pattern);
  for (const path of [
    `/api/v1/assurance/tickets/${ticketId}/comments`,
    `/api/v1/assurance/tickets/${ticketId}/comments/attachments`,
    `/api/v1/assurance/tickets/${ticketId}/comments/with-attachments/extra`,
    `/api/v1/assurance/tickets/${ticketId}/../x/comments/with-attachments`,
    '/api/v1/assurance/tickets/not-a-uuid/comments/with-attachments',
    `/api/v1/assurance/tickets/${ticketId}x/comments/with-attachments`,
    `/api/v1/media/tickets/${ticketId}/comments/with-attachments`,
    `/x/api/v1/assurance/tickets/${ticketId}/comments/with-attachments`,
  ]) {
    assert.doesNotMatch(path, pattern, path);
  }
});

test('nginx prod storage vhost only serves signed reads of the media bucket (D2 MOD09)', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const blocks = serverBlocks(config).filter((block) => block.includes('server_name archivos.'));
  assert.equal(blocks.length, 1);
  const [block] = blocks;

  assert.match(block, /listen 443 ssl;/);
  assert.deepEqual(
    [...block.matchAll(/client_max_body_size (\S+);/g)].map(([, size]) => size),
    ['1k'],
  );
  const bucket = locationBody(block, '/iwana-media/');
  assert.ok(bucket, 'falta la location del bucket');
  assert.match(bucket, /limit_except GET HEAD \{\s*deny all;\s*\}/);
  assert.match(bucket, /proxy_pass http:\/\/storage;/);
  // La firma SigV4 incluye el host: se reenvía el que firmó la API.
  assert.match(bucket, /proxy_set_header Host \$host;/);
  assert.match(locationBody(block, '/') ?? '', /return 404;/);
  assert.match(config, /upstream storage \{\s*zone storage 64k;\s*server minio:9000 resolve;/);
  // El resto de vhosts nunca llega a MinIO.
  for (const other of serverBlocks(config).filter(
    (item) => !item.includes('server_name archivos.'),
  )) {
    assert.doesNotMatch(other, /proxy_pass http:\/\/storage/);
  }
});

// ── Healthchecks de las imágenes propias (H1, plan 2026-11-24 §0.1) ─────────
// Las imágenes de api, web, portal y worker son node:*-slim sin wget ni curl: un
// probe con esas herramientas deja el servicio `unhealthy` y bloquea a nginx.
const prodComposePath = fileURLToPath(new URL('../docker-compose.prod.yml', import.meta.url));

function composeServiceBlock(compose, name) {
  const start = compose.indexOf(`\n  ${name}:\n`);
  if (start === -1) return null;
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test('compose prod healthchecks of own images do not call wget or curl', async () => {
  const compose = await readFile(prodComposePath, 'utf8');
  for (const name of ['api-prod', 'web-prod', 'portal-prod', 'worker-prod']) {
    const block = composeServiceBlock(compose, name);
    assert.ok(block, `falta el servicio ${name}`);
    assert.match(block, /image: \$\{IMAGE_REPOSITORY:-iwana\}\//, name);
    const healthcheck = block.match(/\n {4}healthcheck:\n([\s\S]*?)\n {4}[a-z_]+:/)?.[1] ?? '';
    assert.match(healthcheck, /test:/, `${name} sin healthcheck`);
    assert.doesNotMatch(healthcheck, /\b(wget|curl)\b/, name);
  }
});

test('nginx prod container healthcheck probes /health through the proxy', async () => {
  const compose = await readFile(prodComposePath, 'utf8');
  const block = composeServiceBlock(compose, 'nginx-prod') ?? '';
  assert.match(block, /https:\/\/127\.0\.0\.1\/health/);
});

test('pgbouncer stays out of the production profile (plan 2026-11-24 §0.5)', async () => {
  const compose = await readFile(prodComposePath, 'utf8');
  const block = composeServiceBlock(compose, 'pgbouncer') ?? '';
  assert.match(block, /profiles: !override\n\s+- development\n/);
  assert.doesNotMatch(block, /- production/);
});

test('platform admin bootstrap only runs on demand and never under `production` (ADR-116)', async () => {
  const compose = await readFile(prodComposePath, 'utf8');
  const block = composeServiceBlock(compose, 'platform-admin-bootstrap') ?? '';
  assert.match(block, /profiles:\n\s+- bootstrap\n/);
  assert.doesNotMatch(block, /- production/);
  assert.match(block, /--output=\/bootstrap\/platform-admin\.txt/);
  assert.match(block, /read_only: true/);
  assert.match(block, /restart: 'no'/);
});

test('nginx re-resolves every upstream when a container is recreated', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  assert.match(config, /resolver 127\.0\.0\.11 valid=5s ipv6=off;/);
  const upstreams = [...config.matchAll(/upstream (\w+) \{([^}]*)\}/g)];
  assert.equal(upstreams.length, 4);
  for (const [, name, body] of upstreams) {
    assert.match(body, new RegExp(`zone ${name} 64k;\\s*server \\S+ resolve;`), name);
  }
});

// ── Red de la consola (spec 2026-11-25 §5) ──────────────────────────────────
test('nginx prod marks the surface on every proxied location and restricts the console', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const blocks = serverBlocks(config);
  const consoleBlock = blocks.find((block) => block.includes('listen 443 ssl default_server;'));
  const portalBlock = blocks.find((block) => block.includes('server_name portal.'));
  for (const [block, surface] of [
    [consoleBlock, 'console'],
    [portalBlock, 'portal'],
  ]) {
    const proxied = [...block.matchAll(/proxy_pass http:/g)].length;
    const marked = [...block.matchAll(/proxy_set_header X-Iwana-Surface (\w+);/g)].map(
      ([, s]) => s,
    );
    assert.deepEqual(marked, Array(proxied).fill(surface));
  }
  // El portal niega plataforma sin distinguir mayúsculas (en ejecución: nginx-surface.integration).
  const denied = [...portalBlock.matchAll(/location ~\* (\S+) \{\s*return 404;\s*\}/g)].map(
    ([, pattern]) => new RegExp(pattern, 'i'),
  );
  const isDenied = (path) => denied.some((pattern) => pattern.test(path));
  for (const path of [
    '/api/v1/auth/platform/login',
    '/API/v1/Platform-Users/bootstrap',
    '/api/v1/platform/branding/public',
    '/api/v1/platform-audit-logs',
    '/api/v1/tenants',
    '/api/v1/tenants/mean',
  ]) {
    assert.ok(isDenied(path), path);
  }
  for (const path of [
    '/api/v1/tenants/me',
    '/api/v1/tenants/me/settings',
    '/api/v1/tenants/public-branding',
    '/api/v1/auth/login',
  ]) {
    assert.ok(!isDenied(path), path);
  }

  // Cierra aunque la lista llegue vacía o sin `deny all`; `allow` y `satisfy` solo en la lista.
  assert.match(consoleBlock, /include \/etc\/nginx\/console\/allow\.conf;\n +deny all;/);
  assert.equal([...consoleBlock.matchAll(/\n +deny /g)].length, 1);
  assert.doesNotMatch(consoleBlock, /\n +(allow|satisfy) /);

  // Origen propio del vhost, que la API compara con Origin: lo escribe nginx en cada proxy.
  for (const block of [consoleBlock, portalBlock]) {
    assert.equal(
      [...block.matchAll(/proxy_set_header X-Iwana-Origin \$scheme:\/\/\$http_host;/g)].length,
      [...block.matchAll(/proxy_pass http:/g)].length,
    );
  }

  const allow = await readFile(
    fileURLToPath(new URL('../nginx/console-allow.conf', import.meta.url)),
    'utf8',
  );
  assert.deepEqual(
    allow.split('\n').filter((line) => line && !line.startsWith('#')),
    ['allow 127.0.0.1;', 'deny all;'],
  );
  const compose = await readFile(prodComposePath, 'utf8');
  // Bind largo: si la ruta no existe, Docker falla en vez de crear una carpeta.
  assert.match(
    composeServiceBlock(compose, 'nginx-prod'),
    /- type: bind\n +source: \$\{PROXY_CONSOLE_ALLOW:-\.\/nginx\/console-allow\.conf\}\n +target: \/etc\/nginx\/console\/allow\.conf\n +read_only: true\n +bind:\n +create_host_path: false/,
  );
});

test('nginx prod overwrites the client IP on every location that reaches the API', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const locations = config.split(/\n {4}location /).slice(1);
  const toApi = locations.filter((location) => /proxy_pass http:\/\/api[;/]/.test(location));
  assert.equal(toApi.length, 10);
  for (const location of toApi) {
    assert.match(location, /proxy_set_header X-Forwarded-For \$remote_addr;/, location);
    assert.match(location, /proxy_set_header X-Real-IP \$remote_addr;/, location);
  }
});

test('compose prod: only nginx shares a network with the API (spec 2026-11-25 §5.3)', async () => {
  const compose = await readFile(prodComposePath, 'utf8');
  const networks = (name) =>
    [
      ...(
        /\n {4}networks:\n((?: {6}- [\w-]+\n?)+)/.exec(composeServiceBlock(compose, name))?.[1] ??
        ''
      ).matchAll(/- ([\w-]+)/g),
    ].map(([, network]) => network);
  const api = networks('api-prod');
  assert.deepEqual(api, ['api-edge', 'data']);
  for (const app of ['web-prod', 'portal-prod']) {
    assert.deepEqual(
      networks(app).filter((network) => api.includes(network)),
      [],
      app,
    );
  }
  assert.ok(networks('nginx-prod').includes('api-edge'));
});

test('the production template uses the same names as the nginx vhosts', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const origins = ['consola', 'portal', 'archivos'].map((name) => {
    const host = config.match(new RegExp(`server_name (${name}\\.[^ ;]+)`))?.[1];
    assert.ok(host, name);
    return `https://${host}`;
  });
  const template = await readFile(
    fileURLToPath(new URL('../.env.production.example', import.meta.url)),
    'utf8',
  );
  const value = (key) => template.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1];
  const [consola, portal, archivos] = origins;
  assert.equal(value('NEXT_PUBLIC_WEB_API_URL'), `${consola}/api/v1`);
  assert.equal(value('NEXT_PUBLIC_PORTAL_API_URL'), `${portal}/api/v1`);
  assert.equal(value('CORS_ORIGIN'), `${consola},${portal}`);
  assert.equal(value('FRONTEND_URL'), consola);
  assert.equal(value('PORTAL_URL'), portal);
  assert.equal(value('S3_PUBLIC_ENDPOINT'), archivos);
  // El vhost sin nombre propio no debe volver a la plantilla.
  assert.doesNotMatch(template, /https:\/\/REPLACE_ME_PRODUCTION_DOMAIN/);
  const compose = await readFile(prodComposePath, 'utf8');
  assert.match(
    composeServiceBlock(compose, 'api-prod'),
    /PORTAL_URL: \$\{PORTAL_URL:\?PORTAL_URL is required\}/,
  );
});

test('production images disable the Next proxy to the API', async () => {
  for (const app of ['web', 'portal']) {
    const read = (file) =>
      readFile(fileURLToPath(new URL(`../apps/${app}/${file}`, import.meta.url)), 'utf8');
    const dockerfile = await read('Dockerfile');
    assert.ok(
      dockerfile.indexOf('ENV IWANA_DISABLE_API_REWRITE=1') <
        dockerfile.indexOf(`RUN pnpm --filter @iwana/${app} build`) &&
        dockerfile.includes('ENV IWANA_DISABLE_API_REWRITE=1'),
      app,
    );
    assert.match(await read('next.config.ts'), /IWANA_DISABLE_API_REWRITE === '1'\) return \[\];/);
  }
});
