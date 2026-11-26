/**
 * El ensayo de CA-11 corre en el mismo equipo que otros despliegues: no puede publicar en la LAN,
 * dejar datos ni descargar imágenes. Comprobación estática; el ensayo real lo lanza ensayo-ca11.mjs.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compose = await readFile(new URL('./docker-compose.ca11.yml', import.meta.url), 'utf8');
const script = await readFile(new URL('./ensayo-ca11.mjs', import.meta.url), 'utf8');

test('ensayo CA-11: solo publica en 127.0.0.1 y no crea volúmenes', () => {
  const ports = [...compose.matchAll(/^\s+- '([^']*:\d+)'$/gmu)].map(([, port]) => port);
  assert.deepEqual(ports, ['127.0.0.1::443']);
  assert.doesNotMatch(compose, /^volumes:/mu);
  for (const path of ['/var/lib/postgresql', '/data']) {
    assert.match(compose, new RegExp(`tmpfs:\\n\\s+- ${path}\\n`, 'u'));
  }
  assert.match(compose, /^name: iwana-ca11$/mu);
  assert.doesNotMatch(compose, /container_name: (?!iwana_ca11_)/u);
});

test('ensayo CA-11: no descarga imágenes y siempre desmonta', () => {
  // Por sección: las dos del ensayo local no se compensan con la del modo remoto.
  const start = script.indexOf('// ── Modo remoto');
  const end = script.indexOf('// ── Preparación');
  const pulls = (text) => text.match(/'--pull',\s+'never'/gu)?.length ?? 0;
  assert.equal(pulls(script.slice(0, start) + script.slice(end)), 2);
  assert.equal(pulls(script.slice(start, end)), 1);
  assert.match(script, /\} finally \{\n {2}if \(REMOTE\) \{[\s\S]{0,200}?\} else stop\(\);/u);
  assert.match(script, /'down', '--remove-orphans'/u);
});

test('ensayo CA-11 remoto: no arranca, para ni recrea servicios del entorno real', () => {
  const remote = script.slice(
    script.indexOf('// ── Modo remoto'),
    script.indexOf('// ── Preparación'),
  );
  // Con el entorno solo se usa `compose run --rm --no-deps` (cuenta sintética).
  assert.deepEqual(
    [...remote.matchAll(/remoteCompose\(([^)]*)\)/gu)].map(([, list]) => list),
    ['...list'],
  );
  assert.match(remote, /const list = \[\n\s+'run',\n\s+'--rm',\n\s+'--no-deps',/u);
  assert.doesNotMatch(remote, /'(up|down|restart|stop|build|kill)'/u);
  // Los clientes no publican puertos ni montan volúmenes, y se borran al terminar.
  assert.doesNotMatch(remote, /'(-p|--publish|-v|--volume)',\n\s+`?\$\{?[^\n]*\n\s+image/u);
  assert.match(remote, /'--read-only',\n\s+'--cap-drop',\n\s+'ALL',/u);
  assert.match(script, /if \(REMOTE\) \{\n\s+try \{\n\s+remoteStop\(\);/u);
});

test('cuenta sintética: solo correos .invalid, rol mínimo y credencial solo en archivo', async () => {
  const account = await readFile(new URL('./cuenta-sintetica.cjs', import.meta.url), 'utf8');
  assert.match(
    account,
    /EMAIL_PATTERN = \/\^ca11-\[a-z0-9-\]\{4,40\}@\[a-z0-9.-\]\+\\\.invalid\$\/u/u,
  );
  assert.match(account, /role: PlatformRole\.IWANA_SUPPORT/u);
  assert.match(account, /O_EXCL \| constants\.O_NOFOLLOW,\n\s+0o600/u);
  assert.doesNotMatch(account, /(console\.log|stdout\.write)\([^)]*password/u);
  assert.match(account, /if \(user\.role !== PlatformRole\.IWANA_SUPPORT\)/u);
  // El barrido solo alcanza cuentas IWANA_SUPPORT con alta de este origen y sin baja.
  assert.match(
    account,
    /\[PlatformRole\.IWANA_SUPPORT, AuditAction\.CREATE, ORIGIN, AuditAction\.DELETE\]/u,
  );
  assert.match(account, /delete\(\{ id, role: PlatformRole\.IWANA_SUPPORT \}\)/u);
});
