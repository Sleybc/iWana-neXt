import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { REQUIRED_DOCKERIGNORE_RULES, auditDockerContext } from './audit-docker-context.mjs';

function withDockerignore(contents, callback) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'iwana-docker-context-'));

  try {
    writeFileSync(join(fixtureRoot, '.dockerignore'), contents, 'utf8');
    callback(fixtureRoot);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

test('acepta un .dockerignore que protege cada ruta y caché requerida', () => {
  const fixture = `${REQUIRED_DOCKERIGNORE_RULES.map((rule) => rule.pattern).join('\n')}\n!.env.example\n`;

  withDockerignore(fixture, (fixtureRoot) => {
    assert.deepEqual(auditDockerContext(fixtureRoot).findings, []);
  });
});

test('falla cuando falta una exclusión de backup', () => {
  const fixture = `${REQUIRED_DOCKERIGNORE_RULES.filter((rule) => rule.id !== 'backups')
    .map((rule) => rule.pattern)
    .join('\n')}\n`;

  withDockerignore(fixture, (fixtureRoot) => {
    assert.ok(
      auditDockerContext(fixtureRoot).findings.some(
        (finding) => finding.rule === 'missing-backups',
      ),
    );
  });
});

test('falla cuando una excepción reintroduce una traza protegida', () => {
  const fixture = `${REQUIRED_DOCKERIGNORE_RULES.map((rule) => rule.pattern).join('\n')}\n!request.trace\n`;

  withDockerignore(fixture, (fixtureRoot) => {
    assert.ok(
      auditDockerContext(fixtureRoot).findings.some(
        (finding) => finding.rule === 'unsafe-negation',
      ),
    );
  });
});

test('falla cuando una excepción reintroduce un entorno real', () => {
  const fixture = `${REQUIRED_DOCKERIGNORE_RULES.map((rule) => rule.pattern).join('\n')}\n!.env.development\n`;

  withDockerignore(fixture, (fixtureRoot) => {
    assert.ok(
      auditDockerContext(fixtureRoot).findings.some(
        (finding) => finding.rule === 'unsafe-negation',
      ),
    );
  });
});

for (const negation of ['!**/*', '!apps/**', '!**/.env.*']) {
  test(`falla cerrada ante la negación amplia '${negation}'`, () => {
    const fixture = `${REQUIRED_DOCKERIGNORE_RULES.map((rule) => rule.pattern).join('\n')}\n${negation}\n`;

    withDockerignore(fixture, (fixtureRoot) => {
      assert.ok(
        auditDockerContext(fixtureRoot).findings.some(
          (finding) => finding.rule === 'unsafe-negation',
        ),
      );
    });
  });
}
