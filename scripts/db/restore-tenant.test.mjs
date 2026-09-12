import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertDestinationAllowed,
  assertDumpMatchesSidecar,
  assertSidecarAvailable,
  buildPgRestoreArgs,
  buildRestoreFailureMessage,
  buildRestoreSummaryLines,
  buildTenantRegisterSql,
  confirmSameDatabaseRestore,
  deriveSidecarPath,
  isValidDatabaseName,
  parseDumpSchemas,
  parseSidecar,
  parseTenantRestoreArgs,
} from './restore-tenant.mjs';

// Datos sinteticos: nunca PII real.
const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Demo ISP A',
  slug: 'demo-a',
  schema_name: 'tenant_demo_a',
  status: 'ACTIVE',
};
const SIDECAR_OK = JSON.stringify({
  version: 1,
  schema_name: 'tenant_demo_a',
  dump_sha256: 'a'.repeat(64),
  tenant: ROW,
});
const TOC_OK = [
  ';',
  '; Archive created at 2026-09-12 00:00:00 UTC',
  ';     dbname: dbiw',
  ';',
  '3; 2615 2200 SCHEMA - tenant_demo_a postgres',
  '215; 1259 16391 TABLE tenant_demo_a users postgres',
].join('\n');

test('parseTenantRestoreArgs exige --file y --into y acepta --force-same-database', () => {
  const args = parseTenantRestoreArgs([
    '--file=/tmp/tenant_demo_a.dump',
    '--into',
    'dbiw_restore_test',
    '--force-same-database',
  ]);

  assert.equal(args.file, '/tmp/tenant_demo_a.dump');
  assert.equal(args.into, 'dbiw_restore_test');
  assert.equal(args.forceSameDatabase, true);
});

test('parseTenantRestoreArgs rechaza argumentos no reconocidos', () => {
  assert.throws(() => parseTenantRestoreArgs(['--from=/tmp/x.dump']), /no reconocido/);
});

test('isValidDatabaseName acepta nombres simples y rechaza el resto', () => {
  assert.equal(isValidDatabaseName('dbiw_restore_test'), true);
  assert.equal(isValidDatabaseName('dbiw-restore'), false);
  assert.equal(isValidDatabaseName('dbiw; DROP DATABASE x'), false);
  assert.equal(isValidDatabaseName('Dbiw'), false);
});

test('deriveSidecarPath quita .dump y anexa .tenant.json', () => {
  assert.equal(
    deriveSidecarPath('/backups/tenant_demo_a-2026-09-12T00-00-00-000Z.dump'),
    '/backups/tenant_demo_a-2026-09-12T00-00-00-000Z.tenant.json',
  );
  assert.equal(deriveSidecarPath('sin-extension'), 'sin-extension.tenant.json');
});

test('assertSidecarAvailable falla con mensaje accionable si falta el sidecar', () => {
  assert.throws(
    () => assertSidecarAvailable('/backups/x.tenant.json', () => false),
    (error) => {
      assert.match(error.message, /falta el sidecar/);
      assert.match(error.message, /db:backup:tenant/);
      assert.match(error.message, /No se toco ninguna base/);
      return true;
    },
  );
  assert.doesNotThrow(() => assertSidecarAvailable('/backups/x.tenant.json', () => true));
});

test('parseSidecar acepta un sidecar valido y expone schema y checksum', () => {
  const sidecar = parseSidecar(SIDECAR_OK);

  assert.equal(sidecar.schemaName, 'tenant_demo_a');
  assert.deepEqual(sidecar.tenant, ROW);
  assert.equal(sidecar.dumpSha256, 'a'.repeat(64));
});

test('parseSidecar rechaza JSON invalido', () => {
  assert.throws(() => parseSidecar('{no-json'), /no es JSON valido/);
});

test('parseSidecar rechaza un schema_name que no cumple el contrato', () => {
  const doc = JSON.stringify({ schema_name: 'public', tenant: { ...ROW, schema_name: 'public' } });

  assert.throws(() => parseSidecar(doc), /no declara un schema_name que cumpla/);
});

test('parseSidecar rechaza sidecar cuyo tenant no coincide con schema_name', () => {
  const doc = JSON.stringify({
    schema_name: 'tenant_demo_a',
    tenant: { ...ROW, schema_name: 'tenant_otro' },
  });

  assert.throws(() => parseSidecar(doc), /no contiene la fila completa/);
});

test('parseSidecar rechaza una fila incompleta aunque el schema valide', () => {
  const doc = JSON.stringify({
    schema_name: 'tenant_demo_a',
    tenant: { schema_name: 'tenant_demo_a' },
  });

  assert.throws(() => parseSidecar(doc), /no contiene la fila completa/);
});

test('parseDumpSchemas extrae el schema del indice y assertDumpMatchesSidecar lo acepta', () => {
  const schemas = parseDumpSchemas(TOC_OK);

  assert.deepEqual(schemas, ['tenant_demo_a']);
  assert.equal(assertDumpMatchesSidecar(schemas, 'tenant_demo_a'), 'tenant_demo_a');
});

test('assertDumpMatchesSidecar falla si el dump no declara ningun schema', () => {
  assert.throws(() => assertDumpMatchesSidecar([], 'tenant_demo_a'), /no declara ningun SCHEMA/);
});

test('assertDumpMatchesSidecar falla si el dump declara varios schemas', () => {
  assert.throws(
    () => assertDumpMatchesSidecar(['tenant_demo_a', 'tenant_demo_b'], 'tenant_demo_a'),
    /exactamente uno/,
  );
});

test('assertDumpMatchesSidecar falla si dump y sidecar son de tenants distintos', () => {
  assert.throws(
    () => assertDumpMatchesSidecar(['tenant_demo_b'], 'tenant_demo_a'),
    /tenants distintos/,
  );
});

test('assertDumpMatchesSidecar falla si el esquema del dump no valida contra el contrato', () => {
  assert.throws(
    () => assertDumpMatchesSidecar(['tenant Demo'], 'tenant_demo_a'),
    /no cumple el contrato/,
  );
});

test('assertDestinationAllowed bloquea el origen sin bandera y lo permite con bandera', () => {
  assert.throws(
    () => assertDestinationAllowed({ into: 'dbiw', origin: 'dbiw', forceSameDatabase: false }),
    /coincide con DB_NAME/,
  );
  assert.doesNotThrow(() =>
    assertDestinationAllowed({ into: 'dbiw', origin: 'dbiw', forceSameDatabase: true }),
  );
  assert.doesNotThrow(() =>
    assertDestinationAllowed({ into: 'dbiw_test', origin: 'dbiw', forceSameDatabase: false }),
  );
});

test('confirmSameDatabaseRestore exige TTY', async () => {
  await assert.rejects(confirmSameDatabaseRestore('tenant_demo_a', { isTty: false }), /sin TTY/);
});

test('confirmSameDatabaseRestore exige el schema exacto', async () => {
  await assert.rejects(
    confirmSameDatabaseRestore('tenant_demo_a', { isTty: true, question: async () => 'otro' }),
    /confirmacion no coincide/,
  );
  await assert.doesNotReject(
    confirmSameDatabaseRestore('tenant_demo_a', {
      isTty: true,
      question: async () => 'tenant_demo_a',
    }),
  );
});

test('buildPgRestoreArgs no contiene modo clean ni reemplazo destructivo', () => {
  const args = buildPgRestoreArgs({ remotePath: '/tmp/x.dump', into: 'dbiw_test', user: 'iwana' });

  assert.ok(args.includes('--exit-on-error'));
  assert.ok(args.includes('--no-owner'));
  assert.ok(args.includes('--no-privileges'));
  assert.equal(args.includes('--clean'), false);
  assert.equal(
    args.some((arg) => /CASCADE/i.test(arg)),
    false,
  );
});

test('buildTenantRegisterSql usa jsonb_populate_record y escapa comillas simples', () => {
  const sql = buildTenantRegisterSql({ ...ROW, name: "O'Hara Telecom" });

  assert.match(sql, /jsonb_populate_record\(NULL::public\.tenants/);
  assert.match(sql, /standard_conforming_strings = on/);
  assert.match(sql, /O''Hara Telecom/);
});

test('el script de restore no ejecuta DROP SCHEMA ni un reemplazo destructivo', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./restore-tenant.mjs', import.meta.url)),
    'utf8',
  );

  assert.doesNotMatch(source, /DROP\s+SCHEMA/i);
  assert.doesNotMatch(source, /--clean/);
  assert.match(source, /--force-same-database/);
  assert.match(source, /CASCADE/);
});

test('parseSidecar rechaza un sidecar sin dump_sha256 (fail-closed)', () => {
  const doc = JSON.stringify({ schema_name: 'tenant_demo_a', tenant: ROW });

  assert.throws(
    () => parseSidecar(doc),
    (error) => {
      assert.match(error.message, /sidecar sin dump_sha256/);
      assert.match(error.message, /artefacto incompleto o de formato no soportado/);
      assert.match(error.message, /db:backup:tenant/);
      return true;
    },
  );
});

test('parseSidecar rechaza un dump_sha256 que no es hex de 64 caracteres', () => {
  const nonHex = JSON.stringify({
    schema_name: 'tenant_demo_a',
    tenant: ROW,
    dump_sha256: 'z'.repeat(64),
  });
  const short = JSON.stringify({
    schema_name: 'tenant_demo_a',
    tenant: ROW,
    dump_sha256: 'a'.repeat(63),
  });

  assert.throws(() => parseSidecar(nonHex), /sidecar sin dump_sha256/);
  assert.throws(() => parseSidecar(short), /sidecar sin dump_sha256/);
});

test('buildRestoreFailureMessage advierte que la base creada por este comando queda huerfana', () => {
  // La rama que un pg_restore real no siempre reproduce de forma determinista
  // (el preflight --list suele detectar la corrupcion antes de crear la
  // base): se fija por separado como funcion pura, sin depender de Postgres.
  const message = buildRestoreFailureMessage({
    code: 1,
    into: 'dbiw_restore_test',
    schemaName: 'tenant_demo_a',
    targetExisted: false,
  });

  assert.match(message, /pg_restore salio con codigo 1/);
  assert.match(message, /"dbiw_restore_test" la creo este mismo comando/);
  assert.match(message, /nunca tuvo datos previos/);
});

test('buildRestoreFailureMessage remite al runbook §6.3 cuando la base ya existia', () => {
  const message = buildRestoreFailureMessage({
    code: 1,
    into: 'dbiw_restore_test',
    schemaName: 'tenant_demo_a',
    targetExisted: true,
  });

  assert.doesNotMatch(message, /la creo este mismo comando/);
  assert.match(message, /Revise el estado de "dbiw_restore_test"/);
  assert.match(message, /el comando aborta si el schema "tenant_demo_a" ya existe/);
});

test('buildRestoreSummaryLines incluye el pendiente operativo de grants (H-1)', () => {
  const lines = buildRestoreSummaryLines({
    schemaName: 'tenant_demo_a',
    database: 'dbiw_restore_test',
    created: true,
    dumpName: 'tenant_demo_a-2026.dump',
    checksum: 'a'.repeat(64),
    tableCount: 2,
    injection: '1 fila en public.tenants',
    durationSeconds: 1.23,
    operator: 'operador-sintetico',
  });
  const summary = lines.join('\n');

  assert.match(
    summary,
    /\[RESTORE-TENANT\] pendiente operativo: re-aplicar grants de runtime \(runbook §6\.3, paso post-restore\) antes de declarar el schema operativo\./,
  );
  assert.match(summary, /base destino: dbiw_restore_test \(creada\)/);
  assert.match(summary, /duracion: 1\.2 s \| operador: operador-sintetico/);
});
