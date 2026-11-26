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
  assert.equal(script.match(/'--pull', 'never'/gu)?.length, 2);
  assert.match(script, /\} finally \{\n {2}stop\(\);/u);
  assert.match(script, /'down', '--remove-orphans'/u);
});
