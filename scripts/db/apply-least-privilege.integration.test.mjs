import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const bootstrap = readFileSync(
  new URL('../../docker/postgres/init/01-create-roles.sh', import.meta.url),
  'utf8',
);
const remediator = fileURLToPath(new URL('./apply-least-privilege.mjs', import.meta.url));
const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: 'utf8', timeout: 30_000, ...options });

describe('GSEC-N1 de R7 en PostgreSQL 18', () => {
  let container;

  function psql(sql) {
    const result = run('docker', [
      'exec',
      container,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atc',
      sql,
    ]);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }

  function applyBootstrap(app, migrator) {
    return run(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        `POSTGRES_PASSWORD=${randomUUID()}`,
        '-e',
        'POSTGRES_USER=postgres',
        '-e',
        'POSTGRES_DB=postgres',
        '-e',
        `DB_APP_USER=${app}`,
        '-e',
        `DB_MIGRATOR_USER=${migrator}`,
        container,
        'bash',
        '-s',
      ],
      { input: bootstrap },
    );
  }

  function applyRemediator(app, migrator) {
    const password = randomUUID();
    return run(process.execPath, [remediator], {
      env: {
        ...process.env,
        LEAST_PRIVILEGE_MODE: 'docker',
        POSTGRES_CONTAINER: container,
        DB_BOOTSTRAP_USER: 'postgres',
        DB_BOOTSTRAP_PASSWORD: password,
        DB_NAME: 'postgres',
        DB_APP_DDL: 'off',
        DB_APP_USER: app,
        DB_APP_PASSWORD: password,
        DB_MIGRATOR_USER: migrator,
        DB_MIGRATOR_PASSWORD: password,
        DB_PURGER_PASSWORD: password,
      },
    });
  }

  before(async () => {
    const name = `iwana-r7-role-guard-${randomUUID()}`;
    const result = run('docker', [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--network',
      'none',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      'postgres:18.3-alpine',
    ]);
    assert.equal(result.status, 0, result.stderr);
    container = name;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const ready = run('docker', [
        'exec',
        container,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
      ]);
      if (ready.status === 0) break;
      assert.ok(attempt < 49, 'PostgreSQL desechable no arrancó');
      await setTimeout(200);
    }
    psql('CREATE ROLE r7_bridge NOLOGIN;');
    assert.equal(applyBootstrap('iwana_app', 'iwana_migrator').status, 0);
    assert.equal(applyBootstrap('r7_app', 'r7_migrator').status, 0);
  });

  after(() => {
    if (container) assert.equal(run('docker', ['stop', container]).status, 0);
  });

  for (const [entry, apply] of [
    ['bootstrap', applyBootstrap],
    ['remediación', applyRemediator],
  ]) {
    it(`${entry} acepta roles separados`, () => {
      const result = apply('r7_app', 'r7_migrator');
      assert.equal(result.status, 0, result.stderr);
    });

    for (const [app, migrator] of [
      ['r7_overlap', 'r7_overlap'],
      ['iwana_purger', 'r7_migrator'],
      ['r7_app', 'iwana_purger'],
      ['iwana_migrator', 'r7_migrator'],
      ['r7_app', 'iwana_app'],
    ]) {
      it(`${entry} rechaza roles superpuestos ${app} y ${migrator} antes del DDL`, () => {
        const result = apply(app, migrator);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /GSEC-N1.*requieren roles distintos/);
        assert.doesNotMatch(result.stdout, /^(?:CREATE ROLE|GRANT|REVOKE)$/m);
      });
    }

    for (const { member, target, mode } of [
      { member: 'iwana_app', target: 'iwana_migrator', mode: 'directa' },
      { member: 'r7_app', target: 'r7_migrator', mode: 'transitiva' },
      { member: 'r7_app', target: 'iwana_migrator', mode: 'transitiva' },
      { member: 'iwana_purger', target: 'iwana_migrator', mode: 'SET' },
      { member: 'iwana_purger', target: 'iwana_migrator', mode: 'heredada' },
    ]) {
      it(`${entry} rechaza membresía ${mode} de ${member} a ${target}`, () => {
        const intermediary = mode !== 'directa';
        const withAccess = {
          directa: 'WITH INHERIT FALSE, SET FALSE',
          transitiva: 'WITH INHERIT FALSE, SET FALSE',
          SET: 'WITH INHERIT FALSE, SET TRUE',
          heredada: 'WITH INHERIT TRUE',
        }[mode];
        if (intermediary) psql(`GRANT ${target} TO r7_bridge ${withAccess};`);
        const grantedRole = intermediary ? 'r7_bridge' : target;
        try {
          psql(`GRANT ${grantedRole} TO ${member} ${withAccess};`);
          assert.equal(psql(`SELECT pg_has_role('${member}', '${target}', 'MEMBER');`), 't');
          const usage = psql(`SELECT pg_has_role('${member}', '${target}', 'USAGE');`);
          assert.equal(usage, mode === 'heredada' ? 't' : 'f');
          const canSet = psql(`SELECT pg_has_role('${member}', '${target}', 'SET');`);
          assert.equal(canSet, mode === 'heredada' || mode === 'SET' ? 't' : 'f');
          const result = apply('r7_app', 'r7_migrator');
          assert.notEqual(result.status, 0, 'El control aceptó una membresía prohibida');
          assert.match(result.stderr, /GSEC-N1/);
          assert.match(result.stderr, new RegExp(`${member}.*${target}`));
          if (mode === 'heredada') assert.match(result.stderr, /\(USAGE\)/);
        } finally {
          psql(`REVOKE ${grantedRole} FROM ${member};`);
          if (intermediary) psql(`REVOKE ${target} FROM r7_bridge;`);
        }
      });
    }

    it(`${entry} rechaza que el purger pueda asumir pg_read_all_data`, () => {
      psql('GRANT pg_read_all_data TO iwana_purger WITH INHERIT FALSE, SET TRUE;');
      try {
        assert.equal(psql("SELECT pg_has_role('iwana_purger', 'pg_read_all_data', 'SET');"), 't');
        assert.equal(psql("SELECT pg_has_role('iwana_purger', 'pg_read_all_data', 'USAGE');"), 'f');
        const result = apply('r7_app', 'r7_migrator');
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /GSEC-N1.*iwana_purger.*pg_read_all_data/);
      } finally {
        psql('REVOKE pg_read_all_data FROM iwana_purger;');
      }
    });

    it(`${entry} revierte los grants si la guarda falla`, () => {
      psql(`
        REVOKE CREATE ON DATABASE postgres FROM iwana_migrator;
        GRANT iwana_migrator TO iwana_app WITH INHERIT FALSE, SET FALSE;
      `);
      try {
        const result = apply('iwana_app', 'iwana_migrator');
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /GSEC-N1.*iwana_app.*iwana_migrator/);
        assert.equal(
          psql("SELECT has_database_privilege('iwana_migrator', 'postgres', 'CREATE');"),
          'f',
        );
      } finally {
        psql(`
          REVOKE iwana_migrator FROM iwana_app;
          GRANT CREATE ON DATABASE postgres TO iwana_migrator;
        `);
      }
    });
  }
});
