import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDevelopmentTarget,
  buildDatabaseUri,
  readExistingPassword,
} from './db/dev-readonly-role.mjs';
import {
  assertDevelopmentTarget as assertRedisDevelopmentTarget,
  buildAclSetUser,
  readExistingPassword as readExistingRedisPassword,
} from './db/dev-redis-readonly-user.mjs';
import { buildClientConfigs, toClaude, toOpencode, validateServer } from './sync-mcp.mjs';
import { toPointer } from './sync-skills.mjs';

test('sync-mcp: package se lanza con pnpm dlx (cmd /c en Claude Code)', () => {
  const server = { clients: ['claude', 'opencode'], package: '@playwright/mcp@0.0.82' };
  assert.deepEqual(toClaude(server), {
    command: 'cmd',
    args: ['/c', 'pnpm', 'dlx', '@playwright/mcp@0.0.82'],
  });
  assert.deepEqual(toOpencode(server), {
    type: 'local',
    command: ['pnpm', 'dlx', '@playwright/mcp@0.0.82'],
    enabled: true,
  });
});

test('sync-mcp: {env:VAR} se traduce a ${VAR} solo para Claude Code', () => {
  const server = {
    clients: ['claude', 'opencode'],
    url: 'https://example.test/mcp',
    headers: { Authorization: 'Bearer {env:TOKEN}' },
  };
  assert.equal(toClaude(server).headers.Authorization, 'Bearer ${TOKEN}');
  assert.equal(toOpencode(server).headers.Authorization, 'Bearer {env:TOKEN}');
  assert.equal(toOpencode(server).type, 'remote');
});

test('sync-mcp: rechaza versiones sin fijar, clientes desconocidos y tipos ambiguos', () => {
  assert.throws(
    () => validateServer('a', { clients: ['claude'], package: 'pkg' }),
    /versión exacta/,
  );
  assert.throws(
    () => validateServer('b', { clients: ['cursor'], package: 'pkg@1.0.0' }),
    /clients/,
  );
  assert.throws(
    () => validateServer('c', { clients: ['claude'], package: 'pkg@1.0.0', url: 'https://x' }),
    /exactamente uno/,
  );
});

test('sync-mcp: cada cliente recibe solo sus servidores, en orden alfabético', () => {
  const { claude, opencode } = buildClientConfigs({
    servers: {
      zeta: { clients: ['opencode'], command: ['zeta'] },
      alfa: { clients: ['claude', 'opencode'], command: ['alfa', '--x'] },
    },
  });
  assert.deepEqual(Object.keys(claude.mcpServers), ['alfa']);
  assert.deepEqual(Object.keys(opencode), ['alfa', 'zeta']);
  assert.deepEqual(claude.mcpServers.alfa, { command: 'alfa', args: ['--x'] });
});

test('sync-skills: el puntero conserva el frontmatter y remite al SKILL.md canónico', () => {
  const pointer = toPointer('demo', '---\nname: demo\ndescription: Hace algo.\n---\n\n# Cuerpo\n');
  assert.match(pointer, /^---\n# GENERADO por scripts\/sync-skills\.mjs/);
  assert.match(pointer, /\nname: demo\ndescription: Hace algo\.\n---\n/);
  assert.match(pointer, /\.agents\/skills\/demo\/SKILL\.md/);
  assert.doesNotMatch(pointer, /# Cuerpo/);
});

test('sync-skills: falla si el name no coincide con el directorio', () => {
  assert.throws(() => toPointer('demo', '---\nname: otra\ndescription: x\n---\n'), /no coincide/);
});

test('dev-readonly-role: la URI apunta al loopback del contenedor y se reutiliza la clave', () => {
  const uri = buildDatabaseUri('clave-de-prueba', 'dbiw');
  assert.equal(uri, 'postgresql://iwana_readonly:clave-de-prueba@127.0.0.1:5432/dbiw');
  assert.equal(readExistingPassword(`# comentario\nDATABASE_URI=${uri}\n`), 'clave-de-prueba');
  assert.equal(readExistingPassword('DATABASE_URI=postgresql://otro:x@h/db'), null);
});

test('dev-readonly-role: se niega fuera del contenedor de desarrollo', () => {
  const dev = { mode: 'docker', container: 'iwana_postgres_dev' };
  assert.doesNotThrow(() => assertDevelopmentTarget(dev, 'development'));
  assert.throws(() => assertDevelopmentTarget(dev, 'production'), /production/);
  assert.throws(() => assertDevelopmentTarget({ ...dev, mode: 'host' }, undefined), /docker/);
  assert.throws(
    () => assertDevelopmentTarget({ ...dev, container: 'iwana_postgres' }, undefined),
    /\*_dev/,
  );
});

test('dev-redis-readonly-user: el ACL solo lee bull:* y nunca concede escritura', () => {
  const acl = buildAclSetUser('clave-de-prueba');
  assert.match(acl, /^ACL SETUSER iwana_readonly reset on >clave-de-prueba /);
  assert.match(acl, / ~bull:\* resetchannels -@all \+@read /);
  assert.doesNotMatch(acl, /\+@(write|all|dangerous|admin)|allkeys|~\*/);
  assert.equal(
    readExistingRedisPassword('# x\nREDIS_USERNAME=iwana_readonly\nREDIS_PWD=abc_1\n'),
    'abc_1',
  );
  assert.equal(readExistingRedisPassword('REDIS_USERNAME=iwana_readonly\n'), null);
});

test('dev-redis-readonly-user: se niega fuera del contenedor de desarrollo', () => {
  assert.doesNotThrow(() => assertRedisDevelopmentTarget('iwana_redis_dev', 'development'));
  assert.throws(() => assertRedisDevelopmentTarget('iwana_redis_dev', 'production'), /production/);
  assert.throws(() => assertRedisDevelopmentTarget('iwana_redis', undefined), /\*_dev/);
});
