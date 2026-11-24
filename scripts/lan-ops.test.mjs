// Artefactos del entorno estable en la LAN (plan docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md,
// fases 1 a 3): firewall DOCKER-USER, CA interna con nameConstraints y unidades systemd.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('..', import.meta.url));
const lan = join(repo, 'scripts/lan');
const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env } });

test('DOCKER-USER rules open 80/443 to the server IP from the LAN and drop the rest', () => {
  const { status, stdout } = run('bash', [join(lan, 'docker-user-firewall.sh'), 'print']);
  assert.equal(status, 0);
  const rules = stdout.trim().split('\n');
  assert.deepEqual(rules, [
    '-N IWANA-LAN',
    '-A IWANA-LAN -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN',
    '-A IWANA-LAN -i eno1 -p tcp -s 10.0.0.0/24 -m conntrack --ctorigdst 10.0.0.254 --ctorigdstport 80 -j RETURN',
    '-A IWANA-LAN -i eno1 -p tcp -s 10.0.0.0/24 -m conntrack --ctorigdst 10.0.0.254 --ctorigdstport 443 -j RETURN',
    '-A IWANA-LAN -i eno1 -j DROP',
    '-I DOCKER-USER 1 -j IWANA-LAN',
  ]);
});

test('DOCKER-USER script rejects malformed CIDR, IP and interface', () => {
  for (const args of [
    ['--allow', '10.0.0.0/33'],
    ['--allow', '0.0.0.0/0; reboot'],
    ['--server-ip', '10.0.0'],
    ['--iface', 'eno1 -j ACCEPT'],
  ]) {
    const { status } = run('bash', [join(lan, 'docker-user-firewall.sh'), 'print', ...args]);
    assert.equal(status, 2, args.join(' '));
  }
});

test('internal CA is name-constrained, encrypted and refuses out-of-scope names', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'iwana-ca-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pass = join(dir, 'pass');
  writeFileSync(pass, 'frase-de-prueba');
  const env = { IWANA_CA_PASSFILE: pass };
  const ca = join(lan, 'issue-internal-ca.sh');

  assert.equal(run('bash', [ca, 'ca', join(dir, 'ca')], env).status, 0);
  assert.match(readFileSync(join(dir, 'ca/root-ca.key'), 'utf8'), /BEGIN ENCRYPTED PRIVATE KEY/);
  const ext = run('openssl', [
    'x509',
    '-in',
    join(dir, 'ca/root-ca.crt'),
    '-noout',
    '-ext',
    'nameConstraints',
  ]);
  assert.match(ext.stdout, /critical[\s\S]*Permitted:\s*IP:10\.0\.0\.254\/255\.255\.255\.255/);
  assert.notEqual(
    run('bash', [ca, 'ca', join(dir, 'ca')], env).status,
    0,
    'no sobrescribe la raíz',
  );

  assert.equal(
    run('bash', [ca, 'server', join(dir, 'ca'), join(dir, 'ok'), 'IP:10.0.0.254'], env).status,
    0,
  );
  assert.ok(existsSync(join(dir, 'ok/fullchain.pem')) && existsSync(join(dir, 'ok/privkey.pem')));

  for (const san of ['IP:10.0.0.99', 'DNS:example.com']) {
    const out = join(dir, san.replace(/\W/g, '_'));
    assert.notEqual(run('bash', [ca, 'server', join(dir, 'ca'), out, san], env).status, 0, san);
    assert.ok(!existsSync(join(out, 'privkey.pem')), `${san} no deja material en el destino`);
  }
});

test('systemd units point to versioned scripts and backups fail closed without config', () => {
  const units = readdirSync(join(lan, 'systemd')).filter((f) => /\.(service|timer)$/.test(f));
  assert.ok(units.length >= 7);
  for (const unit of units.filter((f) => f.endsWith('.service'))) {
    const body = readFileSync(join(lan, 'systemd', unit), 'utf8');
    for (const [, script] of body.matchAll(/^Exec\w+=@REPO@\/(\S+)/gm)) {
      assert.ok(existsSync(join(repo, script)), `${unit} → ${script}`);
    }
    assert.match(body, /EnvironmentFile=\/etc\/iwana\/lan\.conf/, unit);
  }
  for (const unit of units.filter((f) => f.endsWith('.timer'))) {
    assert.ok(units.includes(unit.replace('.timer', '.service')), unit);
  }
  const backup = run('bash', [join(lan, 'backup.sh'), 'db'], {
    IWANA_REPO: '',
    IWANA_ENV_FILE: '',
    IWANA_BACKUP_DIR: '',
  });
  assert.notEqual(backup.status, 0);
  for (const script of readdirSync(lan).filter((f) => f.endsWith('.sh'))) {
    assert.equal(run('bash', ['-n', join(lan, script)]).status, 0, script);
  }
});
