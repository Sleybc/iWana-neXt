import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertDestinationAllowed,
  assertDumpMatchesSidecar,
  assertRollbackInPlacePreconditions,
  assertSidecarAvailable,
  buildPgRestoreArgs,
  buildRestoreFailureMessage,
  buildRestoreSummaryLines,
  buildRollbackRegistryLookupSql,
  buildTenantRegisterSql,
  confirmSameDatabaseRestore,
  deriveSidecarPath,
  isValidDatabaseName,
  main,
  parseDumpSchemas,
  parseRollbackRegistryRow,
  parseSidecar,
  parseTenantRestoreArgs,
  USAGE,
} from './restore-tenant.mjs';

const normalizeWhitespace = (source) => source.replace(/\s+/g, ' ').trim();

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

// --- Modo --rollback-in-place (SPEC v1.1 §3.2). Datos sinteticos: nunca PII. ---

const ROLLBACK_ROW = { ...ROW, status: 'SUSPENDED' };
const SIDECAR_SUSPENDED = parseSidecar(
  JSON.stringify({ ...JSON.parse(SIDECAR_OK), tenant: ROLLBACK_ROW }),
);

test('parseTenantRestoreArgs acepta --rollback-in-place y por defecto viene apagado', () => {
  const withFlag = parseTenantRestoreArgs([
    '--file=/tmp/tenant_demo_a.dump',
    '--into=dbiw',
    '--force-same-database',
    '--rollback-in-place',
  ]);
  assert.equal(withFlag.rollbackInPlace, true);

  const withoutFlag = parseTenantRestoreArgs(['--file=/tmp/x.dump', '--into=dbiw_test']);
  assert.equal(withoutFlag.rollbackInPlace, false);
});

test('USAGE documenta --rollback-in-place y sus precondiciones', () => {
  assert.match(USAGE, /--rollback-in-place/);
  assert.match(USAGE, /SUSPENDED/);
  assert.match(USAGE, /nunca\n?\s*modifica public\.tenants/);
});

test('buildRollbackRegistryLookupSql parametriza el schema (sin interpolacion)', () => {
  const sql = buildRollbackRegistryLookupSql();

  assert.match(sql, /public\.tenants/);
  assert.match(sql, /:'schema'/);
  assert.doesNotMatch(sql, /tenant_demo_a/);
});

test('parseRollbackRegistryRow devuelve null si no hay fila (registro ausente)', () => {
  assert.equal(parseRollbackRegistryRow([]), null);
});

test('parseRollbackRegistryRow rechaza ambiguedad (2+ filas) sin adivinar', () => {
  assert.throws(() => parseRollbackRegistryRow([ROLLBACK_ROW, ROLLBACK_ROW]), /ambiguo/);
});

test('parseRollbackRegistryRow rechaza una fila incompleta', () => {
  assert.throws(
    () => parseRollbackRegistryRow([{ id: ROLLBACK_ROW.id, slug: 'demo-a' }]),
    /incompleta/,
  );
});

test('parseRollbackRegistryRow expone id, slug, schema_name y status', () => {
  assert.deepEqual(parseRollbackRegistryRow([ROLLBACK_ROW]), {
    id: ROLLBACK_ROW.id,
    slug: ROLLBACK_ROW.slug,
    schema_name: ROLLBACK_ROW.schema_name,
    status: ROLLBACK_ROW.status,
  });
});

test('assertRollbackInPlacePreconditions acepta el camino feliz', () => {
  const result = assertRollbackInPlacePreconditions({
    schemaExists: false,
    registryRow: ROLLBACK_ROW,
    sidecar: SIDECAR_SUSPENDED,
  });

  assert.deepEqual(result, ROLLBACK_ROW);
  assert.ok(!(result instanceof Promise), 'el gate es sincrono y puro: no toca la base');
});

test('assertRollbackInPlacePreconditions rechaza si el schema sigue presente', () => {
  assert.throws(
    () =>
      assertRollbackInPlacePreconditions({
        schemaExists: true,
        registryRow: ROLLBACK_ROW,
        sidecar: SIDECAR_SUSPENDED,
      }),
    (error) => {
      assert.match(error.message, /aun existe/);
      assert.match(error.message, /No se escribio nada/);
      return true;
    },
  );
});

test('assertRollbackInPlacePreconditions rechaza si la fila esta ausente', () => {
  assert.throws(
    () =>
      assertRollbackInPlacePreconditions({
        schemaExists: false,
        registryRow: null,
        sidecar: SIDECAR_SUSPENDED,
      }),
    (error) => {
      assert.match(error.message, /no hay fila en public\.tenants/);
      assert.match(error.message, /No se escribio nada/);
      return true;
    },
  );
});

for (const field of ['id', 'slug', 'schema_name']) {
  test(`assertRollbackInPlacePreconditions rechaza si difiere ${field}`, () => {
    const other =
      field === 'id'
        ? '22222222-2222-4222-8222-222222222222'
        : field === 'slug'
          ? 'demo-otro'
          : 'tenant_demo_otro';
    assert.throws(
      () =>
        assertRollbackInPlacePreconditions({
          schemaExists: false,
          registryRow: { ...ROLLBACK_ROW, [field]: other },
          sidecar: SIDECAR_SUSPENDED,
        }),
      (error) => {
        assert.match(error.message, new RegExp(field));
        assert.match(error.message, /no coincide exactamente/);
        assert.match(error.message, /se modifico public\.tenants/);
        return true;
      },
    );
  });
}

test('assertRollbackInPlacePreconditions rechaza si el tenant no esta SUSPENDED', () => {
  assert.throws(
    () =>
      assertRollbackInPlacePreconditions({
        schemaExists: false,
        registryRow: { ...ROLLBACK_ROW, status: 'ACTIVE' },
        sidecar: SIDECAR_SUSPENDED,
      }),
    (error) => {
      assert.match(error.message, /no SUSPENDED/);
      assert.match(error.message, /No se escribio nada/);
      return true;
    },
  );
});

test('el gate --rollback-in-place se evalua en main antes de cualquier escritura', () => {
  const src = normalizeWhitespace(main.toString());
  const gateCall = 'assertRollbackInPlacePreconditions({ schemaExists: targetSchemaExists';
  const writes = [
    'createDatabase(args.into)',
    'runPgRestore(effectiveDumpPath, args.into)',
    'injectTenantRow(args.into, sidecar)',
  ];
  const gatePrecedesWrites = (source) => {
    const gate = source.indexOf(gateCall);
    return (
      gate !== -1 &&
      writes.every((write) => {
        const at = source.indexOf(write);
        return at !== -1 && gate < at;
      })
    );
  };

  assert.ok(gatePrecedesWrites(src), 'el gate precede a todas las escrituras');

  const gateMovedAfterFirstWrite = src
    .replace(gateCall, '')
    .replace('createDatabase(args.into)', `createDatabase(args.into) ${gateCall}`);
  assert.equal(
    gatePrecedesWrites(gateMovedAfterFirstWrite),
    false,
    'el control negativo no satisface el orden exigido',
  );
});

test('main omite assertNoRegistryConflicts e injectTenantRow en modo rollback', () => {
  const src = normalizeWhitespace(main.toString());
  const guard = src.indexOf('if (!args.rollbackInPlace)');
  const conflicts = src.indexOf('assertNoRegistryConflicts(args.into, sidecar)');

  assert.ok(guard !== -1 && conflicts !== -1 && conflicts > guard);

  const injectAt = src.indexOf('injectTenantRow(args.into, sidecar)');
  const rollbackInjection = src.indexOf("if (args.rollbackInPlace) { injection = 'conservada");
  assert.ok(rollbackInjection !== -1 && injectAt > rollbackInjection);
});

test('el script nunca modifica public.tenants ni elimina schemas', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./restore-tenant.mjs', import.meta.url)),
    'utf8',
  );

  assert.doesNotMatch(source, /DROP\s+SCHEMA/i);
  assert.doesNotMatch(source, /UPDATE\s+public\.tenants/i);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+public\.tenants/i);
});
