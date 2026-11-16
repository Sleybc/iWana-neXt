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

test('nginx prod keeps 10M as the vhost body limit and widens only the bounded routes', async () => {
  const config = await readFile(prodConfigPath, 'utf8');
  const tlsBlocks = serverBlocks(config).filter((block) => block.includes('listen 443'));
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
