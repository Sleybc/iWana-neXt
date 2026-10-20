import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateQuarantine } from './check-e2e-quarantine.mjs';

function createFixture({ specs = {}, rows = [], maxQuarantines = 0 } = {}) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'iwana-e2e-quarantine-'));
  const testsDir = path.join(rootDir, 'e2e', 'tests');
  mkdirSync(testsDir, { recursive: true });
  for (const [filePath, content] of Object.entries(specs)) {
    const absolutePath = path.join(testsDir, filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
  writeFileSync(
    path.join(rootDir, 'e2e', 'QUARANTINE.md'),
    [
      '# Cuarentena de pruebas E2E',
      '',
      '| ID | Spec | Test | Categoría | Motivo | Dueño | Fecha límite |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map((row) => `| ${row.join(' | ')} |`),
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(rootDir, 'e2e', 'quarantine-cap.json'),
    `${JSON.stringify({ maxQuarantines }, null, 2)}\n`,
  );
  return rootDir;
}

function row(id, { spec = 'e2e/tests/portal-example.spec.ts', dueDate = '2026-11-19' } = {}) {
  return [id, spec, 'scenario name', 'flaky', 'root cause documented', 'qa-owner', dueDate];
}

async function withFixture(options, run) {
  const rootDir = createFixture(options);
  try {
    return await run(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('acepta el manifiesto vacío cuando no hay tests cuarentenados y el tope es cero', async () => {
  await withFixture({}, async (rootDir) => {
    const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
    assert.deepEqual(result, { errors: [], quarantineCount: 0, markerCount: 0 });
  });
});

test('acepta un marcador con fila completa, spec coincidente y dentro del tope', async () => {
  await withFixture(
    {
      specs: { 'portal-example.spec.ts': "test.fixme(true, 'QUARANTINE: QA-001');" },
      rows: [row('QA-001')],
      maxQuarantines: 1,
    },
    async (rootDir) => {
      const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
      assert.deepEqual(result, { errors: [], quarantineCount: 1, markerCount: 1 });
    },
  );
});

test('falla si hay un test.fixme de cuarentena sin fila en el manifiesto', async () => {
  await withFixture(
    {
      specs: { 'portal-example.spec.ts': "test.fixme(true, 'QUARANTINE: QA-001');" },
      maxQuarantines: 1,
    },
    async (rootDir) => {
      const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
      assert.match(result.errors.join('\n'), /QA-001 no tiene fila/);
    },
  );
});

test('falla si una fila del manifiesto no tiene un test.fixme correspondiente', async () => {
  await withFixture({ rows: [row('QA-001')], maxQuarantines: 1 }, async (rootDir) => {
    const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
    assert.match(result.errors.join('\n'), /fila QA-001 no tiene un test\.fixme/);
  });
});

test('falla si una cuarentena está vencida', async () => {
  await withFixture(
    {
      specs: { 'portal-example.spec.ts': "test.fixme(true, 'QUARANTINE: QA-001');" },
      rows: [row('QA-001', { dueDate: '2026-10-19' })],
      maxQuarantines: 1,
    },
    async (rootDir) => {
      const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
      assert.match(result.errors.join('\n'), /QA-001: venció el 2026-10-19/);
    },
  );
});

test('falla si la fecha límite supera 30 días', async () => {
  await withFixture(
    {
      specs: { 'portal-example.spec.ts': "test.fixme(true, 'QUARANTINE: QA-001');" },
      rows: [row('QA-001', { dueDate: '2026-11-20' })],
      maxQuarantines: 1,
    },
    async (rootDir) => {
      const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
      assert.match(result.errors.join('\n'), /QA-001: la fecha límite supera el máximo de 30 días/);
    },
  );
});

test('falla si el número de filas supera el tope versionado', async () => {
  await withFixture(
    {
      specs: {
        'portal-example.spec.ts': [
          "test.fixme(true, 'QUARANTINE: QA-001');",
          "test.fixme(true, 'QUARANTINE: QA-002');",
        ].join('\n'),
      },
      rows: [row('QA-001'), row('QA-002')],
      maxQuarantines: 1,
    },
    async (rootDir) => {
      const result = await validateQuarantine({ rootDir, today: new Date('2026-10-20T12:00:00Z') });
      assert.match(result.errors.join('\n'), /Hay 2 cuarentenas .* tope versionado es 1/);
    },
  );
});
