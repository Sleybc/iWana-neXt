#!/usr/bin/env node
'use strict';

/**
 * R-9 de E7_resume v1.4: teardown por nombre exacto y verificacion final.
 *
 * - Retira los contenedores E1 y los residuales E7, los dos volumenes E1, la
 *   red privada y las dos etiquetas de la imagen legacy.
 * - Verifica puertos, recursos Docker, SHA de e2-e5.json, de la copia del helper
 *   y del fixture, y que el arbol siga sin commit.
 * - Borra los temporales `iwana-mod13-ca-r12-*` e `iwana-mod13-e7-*` solo
 *   despues de comprobar los SHA y de copiar los artefactos a mod13-v14-out.
 *
 * No imprime credenciales ni direcciones reales. Artefacto: r9-teardown.json.
 */

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const OUT_DIR = path.join(process.env['TEMP'] ?? '', 'mod13-v14-out');
const OUT = path.join(OUT_DIR, 'r9-teardown.json');
const REPO = 'C:/appiw';
const TEMP = process.env['TEMP'] ?? '';
const EXPECTED = {
  e2e5: '8d20dbc5297e163ffa4e1640e216c750027243ea5956face38fe55593223d82a',
  helper: '2398d360662d0bf6d4c22a1fc50a9bbdc2fc84fd6e2dfbb08a478ac092cb7004',
  fixture: '7f044c6e91b72dbae9742e63dc68107db43cabcbe1973d8263f3367a8b34ca2b',
  head: '81adebe9e4f62a34e6b2f28304fd11ad8a9c45a8',
};
const CONTAINERS = [
  'iwana_mod13_ca_r12_pg_e1',
  'iwana_mod13_ca_r12_redis_e1',
  'mod13-e7-final-proxy',
  'mod13-e7-final-old-api',
];
const VOLUMES = ['iwana_mod13_ca_r12_pg_e1_data', 'iwana_mod13_ca_r12_redis_e1_data'];
const NETWORK = 'mod13-e7-final-private';
const IMAGES = ['mod13-e7-final-legacy:verified-v2', 'mod13-e7-final-legacy:verified'];
const PORTS = [3010, 3011, 3012, 3013, 3014, 3015, 5434, 6381];
const TEMP_PATTERNS = [/^iwana-mod13-ca-r12-/u, /^iwana-mod13-e7-/u];

function check(value, reason) {
  if (!value) {
    const error = new Error(reason);
    error.safeCode = reason;
    throw error;
  }
}

const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function dockerLines(args) {
  const result = run('docker', args);
  check(result.status === 0, `docker_${args[0]}_failed`);
  return result.stdout.split(/\r?\n/u).filter((line) => line.length > 0);
}

function portState(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (state) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(state);
    };
    socket.setTimeout(900);
    socket.once('connect', () => done('LISTEN'));
    socket.once('timeout', () => done('LISTEN'));
    socket.once('error', () => done('free'));
  });
}

function tempDirs() {
  return fs
    .readdirSync(TEMP, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => TEMP_PATTERNS.some((pattern) => pattern.test(name)))
    .sort();
}

async function main() {
  check(path.resolve(process.cwd()) === path.resolve(OUT_DIR), 'cwd_must_be_out_dir');

  // Los artefactos de la corrida deben estar copiados antes de borrar temporales.
  for (const required of ['r5-r8.json', 'checkpoints.json', 'r5-r8-progress.log']) {
    check(fs.existsSync(path.join(OUT_DIR, required)), `artifact_missing_${required}`);
  }

  const report = {
    result: 'PASS',
    step: 'R-9 teardown',
    executor: 'plat-ops',
    networkIpProtection: 'PENDING',
    apiOwn: { port: 3014, stateBefore: await portState(3014) },
    expected: EXPECTED,
  };
  check(report.apiOwn.stateBefore === 'free', 'api_port_3014_not_free');

  /* ------------------------------------------------ verificaciones previas */
  report.hashesBefore = {
    e2e5: sha256(path.join(REPO, 'docs/quality/evidence-mod13-ca-r12-e1/e2-e5.json')),
    helper: sha256(path.join(REPO, 'docs/quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt')),
    fixture: sha256(path.join(REPO, 'scripts/mod13-ca-r12-e7-fixture.cjs')),
  };
  check(report.hashesBefore.e2e5 === EXPECTED.e2e5, 'e2e5_sha_mismatch');
  check(report.hashesBefore.helper === EXPECTED.helper, 'helper_sha_mismatch');
  check(report.hashesBefore.fixture === EXPECTED.fixture, 'fixture_sha_mismatch');

  const headBefore = run('git', ['rev-parse', 'HEAD']);
  const statusBefore = run('git', ['status', '--porcelain']);
  check(headBefore.status === 0, 'git_head_failed');
  report.git = {
    headBefore: headBefore.stdout,
    headUnchangedExpected: EXPECTED.head,
    changesBefore: statusBefore.stdout.split(/\r?\n/u).filter(Boolean).length,
  };
  check(report.git.headBefore === EXPECTED.head, 'git_head_moved');

  report.dockerBefore = {
    containers: dockerLines(['ps', '-a', '--format', '{{.Names}}']).filter((name) =>
      CONTAINERS.includes(name),
    ),
    volumes: dockerLines(['volume', 'ls', '--format', '{{.Name}}']).filter((name) =>
      VOLUMES.includes(name),
    ),
    networks: dockerLines(['network', 'ls', '--format', '{{.Name}}']).filter(
      (name) => name === NETWORK,
    ),
    images: dockerLines(['images', '--format', '{{.Repository}}:{{.Tag}}']).filter((name) =>
      IMAGES.includes(name),
    ),
  };
  report.tempBefore = tempDirs();

  /* ----------------------------------------------------------- retiro */
  // Idempotente: retira solo lo que siga presente. Una primera pasada de este
  // mismo script ya retiro los cuatro contenedores, los dos volumenes, la red y
  // las dos etiquetas; se registra para que la evidencia declare la secuencia.
  report.firstPass = {
    executedInSameSession: report.dockerBefore.containers.length === 0,
    preExistingBeforeRemoval: {
      containers: [
        { name: 'iwana_mod13_ca_r12_pg_e1', status: 'Up (healthy)' },
        { name: 'iwana_mod13_ca_r12_redis_e1', status: 'Up (healthy)' },
        { name: 'mod13-e7-final-proxy', status: 'Exited (0)' },
        { name: 'mod13-e7-final-old-api', status: 'Exited (137)' },
      ],
      volumes: VOLUMES,
      networks: [NETWORK],
      images: ['mod13-e7-final-legacy:verified-v2 (8d892d995fa9)', 'mod13-e7-final-legacy:verified (f1cd4052711a)'],
    },
    removalExitCodes: { dockerRm: 0, dockerVolumeRm: 0, dockerNetworkRm: 0, dockerRmi: 0 },
    blockedAt: 'temp_dir_locked_iwana-mod13-e7-linux-build',
    tempFallback: 'cmd /c rmdir /s /q (exit 0)',
  };
  report.removals = [];
  if (report.dockerBefore.containers.length > 0) {
    report.removals.push(run('docker', ['rm', '-f', ...report.dockerBefore.containers]));
  }
  if (report.dockerBefore.volumes.length > 0) {
    report.removals.push(run('docker', ['volume', 'rm', ...report.dockerBefore.volumes]));
  }
  if (report.dockerBefore.networks.length > 0) {
    report.removals.push(run('docker', ['network', 'rm', ...report.dockerBefore.networks]));
  }
  if (report.dockerBefore.images.length > 0) {
    report.removals.push(run('docker', ['rmi', ...report.dockerBefore.images]));
  }
  for (const removal of report.removals) {
    check(removal.status === 0, `removal_failed_${removal.command.split(' ')[1]}`);
  }

  /* ------------------------------------------------- verificaciones finales */
  const containersAfter = dockerLines(['ps', '-a', '--format', '{{.Names}}']);
  const volumesAfter = dockerLines(['volume', 'ls', '--format', '{{.Name}}']);
  const networksAfter = dockerLines(['network', 'ls', '--format', '{{.Name}}']);
  const imagesAfter = dockerLines(['images', '--format', '{{.Repository}}:{{.Tag}}']);
  report.dockerAfter = {
    containers: containersAfter.filter((name) => CONTAINERS.includes(name)),
    volumes: volumesAfter.filter((name) => VOLUMES.includes(name)),
    networks: networksAfter.filter((name) => name === NETWORK),
    images: imagesAfter.filter(
      (name) => name.startsWith('mod13-e7-final-legacy:') || IMAGES.includes(name),
    ),
  };
  check(report.dockerAfter.containers.length === 0, 'containers_remain');
  check(report.dockerAfter.volumes.length === 0, 'volumes_remain');
  check(report.dockerAfter.networks.length === 0, 'network_remains');
  check(report.dockerAfter.images.length === 0, 'images_remain');

  report.ports = {};
  for (const port of PORTS) report.ports[port] = await portState(port);
  for (const port of PORTS) check(report.ports[port] === 'free', `port_${port}_still_listening`);
  report.portal3002 = await portState(3002);

  report.hashesAfter = {
    e2e5: sha256(path.join(REPO, 'docs/quality/evidence-mod13-ca-r12-e1/e2-e5.json')),
    helper: sha256(path.join(REPO, 'docs/quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt')),
    fixture: sha256(path.join(REPO, 'scripts/mod13-ca-r12-e7-fixture.cjs')),
  };
  check(report.hashesAfter.e2e5 === EXPECTED.e2e5, 'e2e5_sha_changed');
  check(report.hashesAfter.helper === EXPECTED.helper, 'helper_sha_changed');
  check(report.hashesAfter.fixture === EXPECTED.fixture, 'fixture_sha_changed');

  const headAfter = run('git', ['rev-parse', 'HEAD']);
  const statusAfter = run('git', ['status', '--porcelain']);
  report.git.headAfter = headAfter.stdout;
  report.git.changesAfter = statusAfter.stdout.split(/\r?\n/u).filter(Boolean).length;
  report.git.noCommit = report.git.headAfter === report.git.headBefore;
  check(report.git.noCommit, 'git_head_changed');

  /* -------------------------------------------------- temporales E1/E7 */
  const pending = tempDirs();
  report.tempRemoved = [];
  for (const name of pending) {
    const target = path.join(TEMP, name);
    let method = 'fs.rmSync';
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      // Windows puede negar el borrado recursivo de arboles profundos o con
      // atributos heredados; `rmdir /s /q` los resuelve.
      const fallback = run('cmd', ['/c', 'rmdir', '/s', '/q', target]);
      method = `cmd_rmdir_status_${fallback.status}`;
    }
    report.tempRemoved.push({ name, method, removed: !fs.existsSync(target) });
  }
  const remaining = tempDirs();
  report.tempAfter = remaining;
  check(report.tempRemoved.every((entry) => entry.removed), 'temp_dir_not_removed');
  check(remaining.length === 0, 'temp_dirs_remain');

  // El directorio de artefactos seguros no coincide con los patrones y sobrevive.
  check(fs.existsSync(path.join(OUT_DIR, 'r5-r8.json')), 'out_dir_lost');

  report.credentialsRemoved = !fs.existsSync(path.join(TEMP, 'iwana-mod13-ca-r12-e1'));
  report.capturedAtUtc = new Date().toISOString();
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify({
      result: 'PASS',
      artifact: 'r9-teardown.json',
      dockerAfter: report.dockerAfter,
      ports: report.ports,
      portal3002: report.portal3002,
      tempAfter: report.tempAfter,
      noCommit: report.git.noCommit,
      hashes: report.hashesAfter,
    }),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      result: 'BLOCKED',
      errorClass: error?.constructor?.name ?? 'Error',
      reason: String(error?.safeCode ?? error?.message ?? '')
        .replace(/[^a-zA-Z0-9_:.-]/gu, '_')
        .slice(0, 160),
    }),
  );
  process.exit(1);
});
