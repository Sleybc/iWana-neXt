import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertValidResolvedSchema,
  buildSidecar,
  buildTenantLookupSql,
  deriveTenantArtifactNames,
  hashDumpOrCleanup,
  openDumpWriteStream,
  parseTenantBackupArgs,
  pickSingleTenant,
  requireTenantArg,
} from './backup-tenant.mjs';

// Datos sinteticos: nunca PII real. El identificador visible es schema_name.
const ROW_A = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo ISP A',
  slug: 'demo-a',
  schema_name: 'tenant_demo_a',
  status: 'ACTIVE',
};
const ROW_B = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Demo ISP B',
  slug: 'demo-b',
  schema_name: 'tenant_demo_b',
  status: 'SUSPENDED',
};

test('parseTenantBackupArgs acepta --tenant=<uuid>', () => {
  const args = parseTenantBackupArgs(['--tenant=11111111-1111-4111-8111-111111111111']);

  assert.equal(args.tenant, '11111111-1111-4111-8111-111111111111');
  assert.equal(args.help, false);
});

test('parseTenantBackupArgs acepta --tenant <slug>', () => {
  const args = parseTenantBackupArgs(['--tenant', 'demo-a']);

  assert.equal(args.tenant, 'demo-a');
});

test('parseTenantBackupArgs rechaza argumentos no reconocidos', () => {
  assert.throws(() => parseTenantBackupArgs(['--tenant', 'demo-a', '--force']), /no reconocido/);
});

test('parseTenantBackupArgs rechaza --tenant sin valor', () => {
  assert.throws(() => parseTenantBackupArgs(['--tenant', '--help']), /--tenant exige un valor/);
});

test('requireTenantArg exige --tenant', () => {
  assert.throws(() => requireTenantArg({ tenant: undefined }), /Falta --tenant/);
  assert.equal(requireTenantArg({ tenant: 'demo-a' }), 'demo-a');
});

test('buildTenantLookupSql pasa el input como variable de psql, nunca concatenado', () => {
  const sql = buildTenantLookupSql();

  assert.match(sql, /:'tenant_arg'/);
  assert.doesNotMatch(sql, /\$\{/);
  assert.doesNotMatch(sql, /\+ *tenant/);
});

test('pickSingleTenant resuelve por uuid cuando la consulta devuelve una fila', () => {
  assert.deepEqual(pickSingleTenant([ROW_A]), ROW_A);
});

test('pickSingleTenant resuelve por slug cuando la consulta devuelve una fila', () => {
  assert.deepEqual(pickSingleTenant([ROW_B]), ROW_B);
});

test('pickSingleTenant falla cerrado ante un slug ambiguo (2 coincidencias)', () => {
  assert.throws(
    () => pickSingleTenant([ROW_A, ROW_B]),
    (error) => {
      assert.match(error.message, /coincide con 2 tenants/);
      assert.match(error.message, /no adivina/);
      return true;
    },
  );
});

test('pickSingleTenant falla cerrado si el tenant no existe', () => {
  assert.throws(() => pickSingleTenant([]), /tenant no encontrado en public\.tenants/);
});

test('assertValidResolvedSchema acepta el contrato tenant_*', () => {
  assert.equal(assertValidResolvedSchema(ROW_A), 'tenant_demo_a');
});

test('assertValidResolvedSchema rechaza un schema del sistema', () => {
  assert.throws(
    () => assertValidResolvedSchema({ ...ROW_A, schema_name: 'public' }),
    /no cumple el contrato/,
  );
});

test('assertValidResolvedSchema rechaza un intento de inyeccion en schema_name', () => {
  assert.throws(
    () => assertValidResolvedSchema({ ...ROW_A, schema_name: 'tenant_x; DROP SCHEMA public' }),
    /no cumple el contrato/,
  );
});

test('assertValidResolvedSchema rechaza mayusculas y prefijos ajenos', () => {
  assert.throws(() => assertValidResolvedSchema({ ...ROW_A, schema_name: 'tenant_Demo' }));
  assert.throws(() => assertValidResolvedSchema({ ...ROW_A, schema_name: 'demo_a' }));
  assert.throws(() => assertValidResolvedSchema({ schema_name: undefined }));
});

test('deriveTenantArtifactNames produce dump y sidecar correlacionados', () => {
  const { dumpName, sidecarName } = deriveTenantArtifactNames(
    'tenant_demo_a',
    '2026-09-12T00-00-00-000Z',
  );

  assert.equal(dumpName, 'tenant_demo_a-2026-09-12T00-00-00-000Z.dump');
  assert.equal(sidecarName, 'tenant_demo_a-2026-09-12T00-00-00-000Z.tenant.json');
});

test('buildSidecar conserva la fila completa y el checksum sin formatear PII a mano', () => {
  const sidecar = buildSidecar({
    row: ROW_A,
    schemaName: 'tenant_demo_a',
    database: 'dbiw_smoke',
    generatedAt: '2026-09-12T00:00:00.000Z',
    dumpSha256: 'a'.repeat(64),
  });
  const doc = JSON.parse(sidecar);

  assert.equal(doc.version, 1);
  assert.equal(doc.schema_name, 'tenant_demo_a');
  assert.equal(doc.source_database, 'dbiw_smoke');
  assert.equal(doc.dump_sha256, 'a'.repeat(64));
  assert.deepEqual(doc.tenant, ROW_A);
});

test('openDumpWriteStream no trunca un dump preexistente (flags wx)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'iwana-backup-tenant-'));
  try {
    const target = join(dir, 'tenant_demo_a-2026.dump');
    writeFileSync(target, 'contenido preexistente');

    const stream = openDumpWriteStream(target);
    const error = await new Promise((resolve) => stream.on('error', resolve));

    assert.equal(error.code, 'EEXIST');
    assert.equal(readFileSync(target, 'utf8'), 'contenido preexistente');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openDumpWriteStream crea el dump cuando el nombre esta libre', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'iwana-backup-tenant-'));
  try {
    const target = join(dir, 'tenant_demo_a-2026.dump');
    const stream = openDumpWriteStream(target);
    await new Promise((resolve, reject) => {
      stream.on('open', resolve);
      stream.on('error', reject);
    });
    stream.end();
    await new Promise((resolve) => stream.on('close', resolve));

    assert.equal(existsSync(target), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hashDumpOrCleanup elimina el dump y falla accionable si el hash falla', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'iwana-backup-tenant-'));
  try {
    const target = join(dir, 'tenant_demo_a-2026.dump');
    writeFileSync(target, 'dump sintetico');

    await assert.rejects(
      hashDumpOrCleanup(target, async () => {
        throw new Error('lectura sintetica fallida');
      }),
      (error) => {
        assert.match(error.message, /no se pudo verificar el dump/);
        assert.match(error.message, /no dejar un artefacto sin sidecar/);
        assert.match(error.message, /db:backup:tenant/);
        return true;
      },
    );
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hashDumpOrCleanup devuelve el sha256 cuando el dump es legible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'iwana-backup-tenant-'));
  try {
    const target = join(dir, 'tenant_demo_a-2026.dump');
    writeFileSync(target, 'dump sintetico');

    const digest = await hashDumpOrCleanup(target);

    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.equal(existsSync(target), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
