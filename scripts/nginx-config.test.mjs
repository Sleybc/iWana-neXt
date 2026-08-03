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
