/**
 * Tests de caja negra de los hooks de Claude Code (.claude/hooks/): cada hook recibe el
 * evento por stdin como lo entrega Claude Code y se verifica su código de salida o su
 * decisión. Los hooks que leen el repo o ejecutan scripts corren sobre un directorio
 * temporal (CLAUDE_PROJECT_DIR), nunca sobre el árbol real.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'hooks');

function runHook(name, input, projectDir = process.cwd()) {
  const result = spawnSync(process.execPath, [join(HOOKS, name)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'iwana-hooks-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const edit = (filePath) => ({ tool_input: { file_path: filePath } });

test('guard-paths: bloquea rutas reservadas y deja pasar el resto', () => {
  for (const path of [
    'C:/appiw/.env',
    'C:/appiw/.env.development.local',
    'C:/appiw/secrets/jwt.key',
    'C:/appiw/pnpm-lock.yaml',
    'C:/appiw/.mcp.json',
    'C:/appiw/.claude/skills/postgresql/SKILL.md',
    'C:/appiw/.opencode/agents/sr-qa.md',
    'C:/appiw/tmp/PROMPT-MOD11-X-v1.0.md',
  ]) {
    assert.equal(runHook('guard-paths.mjs', edit(path)).code, 2, path);
  }
  for (const path of [
    'C:/appiw/.env.example',
    'C:/appiw/docs/prompts/PROMPT-MOD11-X-v1.0.md',
    'C:/appiw/apps/api/src/main.ts',
  ]) {
    assert.equal(runHook('guard-paths.mjs', edit(path)).code, 0, path);
  }
});

test('guard-bash: niega ramas, --no-verify, escrituras protegidas y acciones destructivas', () => {
  for (const command of [
    'git checkout -b feature/x',
    'git switch -c x',
    'git worktree add ../x',
    'git branch feature/x',
    'git commit --no-verify -m "x"',
    'echo X=1 >> .env',
    'cp tmp/a .env.development',
    'git push --force origin main',
    'git reset --hard HEAD~1',
    'docker compose down -v',
    'pnpm --filter @iwana/db migration:tenant:revert',
    'pnpm db:restore',
    "cat <<'EOF' > .env.local\nX=1\nEOF",
    "cat > .env <<'EOF'\nX=1\nEOF",
  ]) {
    const { code, stdout } = runHook('guard-bash.mjs', { tool_input: { command } });
    assert.equal(code, 0, command);
    assert.equal(JSON.parse(stdout).hookSpecificOutput.permissionDecision, 'deny', command);
  }
});

test('guard-bash: deja pasar comandos de lectura y trabajo normal', () => {
  for (const command of [
    'git status',
    'git branch --show-current',
    'git log --oneline -5',
    'cat .env',
    'echo x > .env.example',
    'docker compose down',
    'pnpm --filter @iwana/api test',
    "cat >> docs/informes/INFORME-X-v1.0.md <<'EOF'\n| `git checkout -b` | prohibido |\nEOF",
    'git commit -F - <<EOF\nNo usar git reset --hard ni --no-verify.\nEOF\ngit status',
  ]) {
    const { code, stdout } = runHook('guard-bash.mjs', { tool_input: { command } });
    assert.equal(code, 0, command);
    assert.equal(stdout, '', command);
  }
});

test('tenant-migration-gate: exige down() y registro en runner.ts', () => {
  const tenant = 'packages/database/src/migrations/tenant';
  const dir = fixture({
    [`${tenant}/runner.ts`]: [
      "import { AddOk1400000000000 } from './140_add_ok';",
      "import { AddNoDown1410000000000 } from './141_add_no_down';",
      'export const TENANT_MIGRATIONS = [AddOk1400000000000, AddNoDown1410000000000];',
    ].join('\n'),
    [`${tenant}/140_add_ok.ts`]:
      'export class AddOk1400000000000 { async up() {} async down() {} }',
    [`${tenant}/141_add_no_down.ts`]: 'export class AddNoDown1410000000000 { async up() {} }',
    [`${tenant}/142_add_unregistered.ts`]:
      'export class AddUnregistered1420000000000 { async up() {} async down() {} }',
  });
  try {
    const run = (file) => runHook('tenant-migration-gate.mjs', edit(join(dir, tenant, file)), dir);
    assert.equal(run('140_add_ok.ts').code, 0);
    assert.match(run('141_add_no_down.ts').stderr, /down\(\)/);
    assert.match(run('142_add_unregistered.ts').stderr, /runner\.ts/);
    assert.equal(run('142_add_unregistered.ts').code, 2);
    assert.equal(run('runner.ts').code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('format-file: fuera de alcance no hace nada y un fallo de Prettier nunca bloquea', () => {
  const dir = fixture({ 'apps/api/src/x.ts': 'const   x=1' });
  try {
    assert.equal(runHook('format-file.mjs', edit(join(dir, 'README.txt')), dir).code, 0);
    // El fixture no tiene node_modules/prettier: el hook debe tragarse el error.
    assert.equal(runHook('format-file.mjs', edit(join(dir, 'apps/api/src/x.ts')), dir).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-surfaces: regenera al editar una fuente y reporta si el script falla', () => {
  const dir = fixture({
    'scripts/sync-agents.mjs':
      "import { writeFileSync } from 'node:fs'; writeFileSync('synced.flag', 'ok');",
    'scripts/sync-skills.mjs': "console.error('fallo simulado'); process.exit(1);",
  });
  try {
    const agent = runHook('sync-surfaces.mjs', edit(join(dir, '.claude/agents/sr-qa.md')), dir);
    assert.equal(agent.code, 0);
    assert.ok(existsSync(join(dir, 'synced.flag')));

    const skill = runHook(
      'sync-surfaces.mjs',
      edit(join(dir, '.agents/skills/postgresql/SKILL.md')),
      dir,
    );
    assert.equal(skill.code, 2);
    assert.match(skill.stderr, /fallo simulado/);

    assert.equal(runHook('sync-surfaces.mjs', edit(join(dir, 'apps/x.ts')), dir).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doc-audits: corre solo con cambios en docs/ y bloquea si una auditoría falla', () => {
  const dir = fixture({
    'scripts/audit-doc-locations.mjs': '',
    'scripts/audit-adr-citations.mjs': "console.log('cita rota'); process.exit(1);",
    'README.md': 'x',
  });
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');

    assert.equal(runHook('doc-audits.mjs', {}, dir).code, 0, 'sin cambios en docs/');

    writeFileSync(join(dir, 'README.md'), 'y');
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs/INFORME-X-v1.0.md'), 'x');
    const blocked = runHook('doc-audits.mjs', {}, dir);
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /cita rota/);

    assert.equal(runHook('doc-audits.mjs', { stop_hook_active: true }, dir).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function gitFixture(files) {
  const dir = fixture(files);
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
  return dir;
}

test('rejection-reason-coverage: exige un *.integration.spec.ts por motivo de rechazo', () => {
  const contract = 'packages/shared/src/contracts/operations/execution-orders.ts';
  const dir = gitFixture({
    [contract]:
      "export const INVENTORY_CONSUMPTION_REJECTION_REASON_CODES = [\n  'CUSTODY_INSUFFICIENT',\n  'ITEM_INACTIVE',\n] as const;\n",
    'apps/api/src/a.integration.spec.ts': "expect(code).toBe('CUSTODY_INSUFFICIENT');",
  });
  try {
    const run = (file) => runHook('rejection-reason-coverage.mjs', edit(join(dir, file)), dir);
    const blocked = run(contract);
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /ITEM_INACTIVE/);
    assert.doesNotMatch(blocked.stderr, /CUSTODY_INSUFFICIENT/);

    // Una spec nueva sin commitear también cuenta.
    writeFileSync(join(dir, 'apps/api/src/b.integration.spec.ts'), "reason: 'ITEM_INACTIVE'");
    assert.equal(run('apps/api/src/b.integration.spec.ts').code, 0);
    assert.equal(run('apps/api/src/otro.service.ts').code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pii-log-guard: señala logs que interpolan datos personales, no los que usan el id', () => {
  const dir = fixture({
    'apps/api/src/crm/a.service.ts':
      'this.logger.warn(`Suscriptor sin contacto: ${subscriber.email}`);',
    'apps/worker/src/b.processor.ts':
      'this.logger.warn(`No se pudo descifrar email del expediente ${expediente.id}`);',
    'apps/api/src/crm/a.service.spec.ts': 'console.log(`${user.phonePrimary}`);',
    'packages/shared/src/c.ts': 'console.log(`${user.email}`);',
  });
  try {
    const run = (file) => runHook('pii-log-guard.mjs', edit(join(dir, file)), dir);
    const blocked = run('apps/api/src/crm/a.service.ts');
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /1: this\.logger\.warn/);
    assert.equal(run('apps/worker/src/b.processor.ts').code, 0);
    assert.equal(run('apps/api/src/crm/a.service.spec.ts').code, 0, 'las specs quedan fuera');
    assert.equal(run('packages/shared/src/c.ts').code, 0, 'solo apps/api y apps/worker');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('session-context: informa rama, cambios y plan más reciente sin bloquear nunca', () => {
  const dir = gitFixture({
    'docs/plans/2026-10-01-viejo.md': 'x',
    'docs/plans/2026-10-09-nuevo.md': 'x',
    'docs/plans/README.md': 'x',
  });
  try {
    writeFileSync(join(dir, 'pendiente.txt'), 'x');
    const { code, stdout } = runHook('session-context.mjs', {}, dir);
    assert.equal(code, 0);
    assert.match(stdout, /último commit: \w+ base/);
    assert.match(stdout, /Árbol: 1 rutas con cambios sin commitear/);
    assert.match(stdout, /Plan más reciente: docs\/plans\/2026-10-09-nuevo\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const empty = mkdtempSync(join(tmpdir(), 'iwana-hooks-'));
  try {
    assert.equal(
      runHook('session-context.mjs', {}, empty).code,
      0,
      'fuera de un repo tampoco falla',
    );
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
