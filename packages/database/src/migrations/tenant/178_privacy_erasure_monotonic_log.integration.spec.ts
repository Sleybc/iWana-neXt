import { randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { buildTenantSchemaAppGrantsSql } from '../../tenant-schema-app-grants';
import { TENANT_MIGRATIONS } from './runner';
import {
  type H1CatalogEntry,
  PRIVACY_H1_MONOTONIC_CATALOG,
  PrivacyErasureMonotonicLog1780000000178,
} from './178_privacy_erasure_monotonic_log';

const enabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describePg = enabled ? describe : describe.skip;
if (enabled && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('La integración 178 requiere una base de pruebas aprobada (test o iwana_it_*).');
}
jest.setTimeout(900_000);

async function expectPrivacyBlock(action: Promise<unknown>): Promise<void> {
  await expect(action).rejects.toMatchObject({
    driverError: { code: '55000', hint: 'PRIVACY_TITULAR_ANONYMIZED' },
  });
}

async function expectLogGuard(action: Promise<unknown>): Promise<void> {
  await expect(action).rejects.toMatchObject({
    driverError: { code: '55000', hint: 'PRIVACY_LOG_APPEND_ONLY' },
  });
}

const SAFE_SEARCH_PATH = 'search_path=pg_catalog, pg_temp';

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Transición que el cuerpo del trigger debe aplicar a una columna del catálogo. */
function transitionPattern(entry: H1CatalogEntry): RegExp {
  const c = escapeRe(entry.column);
  const notNullGuard = entry.notNull ? '' : `NEW\\.${c} IS NOT NULL\\s+AND\\s+`;
  if (entry.kind === 'jsonb' || entry.notNullFallback === 'empty-json') {
    return new RegExp(
      `IF NEW\\.${c} IS DISTINCT FROM OLD\\.${c} THEN\\s+IF ${notNullGuard}NEW\\.${c} <> '\\{\\}'::jsonb\\s+AND NOT \\(OLD\\.${c} @> NEW\\.${c}\\) THEN`,
      'u',
    );
  }
  if (entry.kind === 'legacy-hash') {
    const v = (side: string): string => `\\(to_jsonb\\(${side}\\) ->> '${c}'\\)`;
    return new RegExp(
      `${v('NEW')} IS DISTINCT FROM ${v('OLD')}\\s+AND ${v('NEW')} IS NOT NULL THEN`,
      'u',
    );
  }
  if (entry.kind === 'marker' || entry.notNullFallback === 'marker') {
    const marker = escapeRe(entry.marker ?? 'ANONIMIZADO');
    const guard = entry.notNull ? '' : `NEW\\.${c} IS NOT NULL AND `;
    return new RegExp(
      `NEW\\.${c} IS DISTINCT FROM OLD\\.${c}\\s+AND ${guard}NEW\\.${c} <> '${marker}' THEN`,
      'u',
    );
  }
  return new RegExp(
    `NEW\\.${c} IS DISTINCT FROM OLD\\.${c}\\s+AND NEW\\.${c} IS NOT NULL THEN`,
    'u',
  );
}

/**
 * P2-1 (CA-H1-04 sobre el SQL): devuelve las columnas del catálogo cuya transición
 * no aparece en la rama monótona de su tabla o que faltan en su lista de exclusión.
 */
function monotonicBodyGaps(body: string, catalog: Record<string, H1CatalogEntry[]>): string[] {
  const gaps: string[] = [];
  const branchStart = body.indexOf('-- Rama monótona');
  for (const [table, entries] of Object.entries(catalog)) {
    const start = body.indexOf(`TG_TABLE_NAME = '${table}' THEN`, branchStart);
    if (branchStart < 0 || start < 0) {
      gaps.push(`${table}.*`);
      continue;
    }
    const ends = [
      body.indexOf('ELSIF TG_TABLE_NAME', start + 1),
      body.indexOf('Tabla fuera del alcance', start + 1),
    ].filter((index) => index > 0);
    const segment = body.slice(start, Math.min(...ends));
    const exclusions =
      [...segment.matchAll(/to_jsonb\(NEW\) - ARRAY\[([^\]]*)\]/gu)].pop()?.[1] ?? '';
    for (const entry of entries) {
      if (!transitionPattern(entry).test(segment) || !exclusions.includes(`'${entry.column}'`)) {
        gaps.push(`${table}.${entry.column}`);
      }
    }
  }
  return gaps;
}

describePg('178 — trigger monótono y bitácora append-only (H-1 B1)', () => {
  const schema = `tenant_it178_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const tenantId = randomUUID();
  const migration = new PrivacyErasureMonotonicLog1780000000178();
  let ds: DataSource;
  let qr: QueryRunner;
  let appDs: DataSource;
  let appQr: QueryRunner;
  let appRole = '';

  async function logEntriesFor(rowId: string): Promise<number> {
    const rows: Array<{ total: string }> = await qr.query(
      'SELECT COUNT(*)::text AS total FROM privacy_erasure_mutation_log WHERE row_id = $1',
      [rowId],
    );
    return Number(rows[0]?.total ?? '0');
  }

  async function functionDef(name: string): Promise<string> {
    const rows: Array<{ definition: string }> = await qr.query(
      `SELECT pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = $1 AND n.nspname = $2`,
      [name, schema],
    );
    return rows[0]?.definition ?? '';
  }

  /** Dueño esperado de las funciones de la 178: el migrador si existe, si no el conector. */
  let expectedOwner = '';

  async function functionOwner(name: string): Promise<string> {
    const rows: Array<{ owner: string }> = await qr.query(
      `SELECT pg_get_userbyid(p.proowner) AS owner
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = $1 AND n.nspname = $2`,
      [name, schema],
    );
    return rows[0]?.owner ?? '';
  }

  async function logTriggerTables(): Promise<string[]> {
    const rows: Array<{ table_name: string }> = await qr.query(
      `SELECT c.relname AS table_name
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND t.tgname = 'trg_privacy_erasure_log_mutation' AND n.nspname = $1
        ORDER BY c.relname`,
      [schema],
    );
    return rows.map((row) => row.table_name);
  }

  async function tableExists(name: string): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await qr.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2) AS exists`,
      [schema, name],
    );
    return rows[0]?.exists ?? false;
  }

  async function privilege(priv: string): Promise<boolean> {
    const rows: Array<{ ok: boolean }> = await qr.query(
      `SELECT has_table_privilege('iwana_app', $1, $2) AS ok`,
      [`${schema}.privacy_erasure_mutation_log`, priv],
    );
    return rows[0]?.ok ?? false;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    ds = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      ...credentials,
      database: process.env['DB_NAME'] ?? 'test',
      synchronize: false,
      logging: false,
    });
    await ds.initialize();
    qr = ds.createQueryRunner();
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(
      `INSERT INTO public.tenants (id,name,slug,schema_name,contact_email,status)
       VALUES ($1,'Fixture 178',$2,$2,'k2a@invalid.example','INACTIVE')`,
      [tenantId, schema],
    );
    await qr.query(`SET search_path TO "${schema}", public`);
    const last = TENANT_MIGRATIONS.findIndex((M) => new M().name === migration.name);
    expect(last).toBeGreaterThan(0);
    for (const M of TENANT_MIGRATIONS.slice(0, last)) {
      await new M().up(qr);
    }

    // Rol real de la API (CA-H1-05): conexión propia como DB_APP_USER, con los
    // grants que recibe un tenant aprovisionado, nunca SET ROLE sobre el migrador.
    appRole = process.env['DB_APP_USER']?.trim() ?? '';
    if (!appRole) {
      throw new Error(
        'La integración 178 requiere DB_APP_USER/DB_APP_PASSWORD para probar con iwana_app.',
      );
    }
    await qr.query(buildTenantSchemaAppGrantsSql(schema, appRole, credentials.username));
    const migrator: Array<{ owner: string }> = await qr.query(
      `SELECT COALESCE((SELECT rolname::text FROM pg_roles WHERE rolname = 'iwana_migrator'), current_user::text) AS owner`,
    );
    expectedOwner = migrator[0]?.owner ?? '';
    appDs = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: appRole,
      password: process.env['DB_APP_PASSWORD'] ?? '',
      database: process.env['DB_NAME'] ?? 'test',
      synchronize: false,
      logging: false,
    });
    await appDs.initialize();
    appQr = appDs.createQueryRunner();
    await appQr.query(`SET search_path TO "${schema}", public`);
  });

  afterAll(async () => {
    if (appQr && !appQr.isReleased) await appQr.release();
    if (appDs?.isInitialized) await appDs.destroy();
    if (qr && !qr.isReleased) await qr.release();
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id=$1', [tenantId]);
      await ds.destroy();
    }
  });

  it('CA-H1-07: up → down → up restaura la 169 y conserva la bitácora con sus datos', async () => {
    const actor = randomUUID();
    const subscriber = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,document_type,
        document_number_encrypted,first_name,last_name,stratum,email_encrypted,
        phone_encrypted,vat_treatment,tax_regime,address,created_by)
       VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','H1',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
      [subscriber, tenantId, actor],
    );
    await migration.up(qr);
    expect(await tableExists('privacy_erasure_mutation_log')).toBe(true);
    const monotonic = await functionDef('titular_prevent_anonymized_mutation');
    expect(monotonic).not.toContain('privacy_log_erasure_mutation');
    expect(monotonic).not.toContain('privacy_erasure_mutation_log');
    const writer = await functionDef('privacy_erasure_log_mutation');
    expect(writer).toContain('RETURNS trigger');
    expect(writer).toContain('SECURITY DEFINER');
    expect(writer).toMatch(/SET search_path TO 'pg_catalog'/u);
    expect(writer).toContain('TG_TABLE_SCHEMA');
    expect(await functionOwner('privacy_erasure_log_mutation')).toBe(expectedOwner);
    expect(await logTriggerTables()).toEqual(['contracts', 'expediente_records', 'subscribers']);

    // Reaplicación idempotente del up (IF NOT EXISTS / OR REPLACE).
    await migration.up(qr);

    // Mutación permitida con GUC deja una entrada para conservar en el down.
    const request = randomUUID();
    await qr.query(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [subscriber, request],
    );
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    await qr.query(`UPDATE subscribers SET first_name = 'ANONIMIZADO' WHERE id = $1`, [subscriber]);
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    const before: Array<{ total: string }> = await qr.query(
      'SELECT COUNT(*)::text AS total FROM privacy_erasure_mutation_log',
    );
    expect(Number(before[0]?.total ?? '0')).toBeGreaterThanOrEqual(1);

    await migration.down(qr);
    expect(await tableExists('privacy_erasure_mutation_log')).toBe(true);
    const after: Array<{ total: string }> = await qr.query(
      'SELECT COUNT(*)::text AS total FROM privacy_erasure_mutation_log',
    );
    expect(after[0]?.total).toBe(before[0]?.total);
    const restored = await functionDef('titular_prevent_anonymized_mutation');
    expect(restored).toContain('PRIVACY_TITULAR_ANONYMIZED');
    expect(restored).not.toContain('privacy_log_erasure_mutation');
    expect(await logTriggerTables()).toEqual([]);
    expect(await functionDef('privacy_erasure_log_mutation')).toBe('');
    const kept: Array<{ total: string }> = await qr.query(
      'SELECT COUNT(*)::text AS total FROM subscribers',
    );
    expect(Number(kept[0]?.total ?? '0')).toBeGreaterThanOrEqual(1);

    await migration.up(qr);
    const reinstalled = await functionDef('titular_prevent_anonymized_mutation');
    expect(reinstalled).toContain('PRIVACY_TITULAR_ANONYMIZED');
    expect(reinstalled).not.toContain('privacy_log_erasure_mutation');
    expect(await logTriggerTables()).toEqual(['contracts', 'expediente_records', 'subscribers']);
    const keptLog: Array<{ total: string }> = await qr.query(
      'SELECT COUNT(*)::text AS total FROM privacy_erasure_mutation_log',
    );
    expect(keptLog[0]?.total).toBe(before[0]?.total);
  });

  it('CA-H1-03: DELETE de fila suprimida falla con y sin GUC', async () => {
    const actor = randomUUID();
    const subscriber = randomUUID();
    const expediente = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,document_type,
        document_number_encrypted,first_name,last_name,stratum,email_encrypted,
        phone_encrypted,vat_treatment,tax_regime,address,created_by)
       VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','H1',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
      [subscriber, tenantId, actor],
    );
    await qr.query(
      `INSERT INTO expediente_records (id,tenant_id,status,status_changed_at,full_name,source,
        acquisition_channel,additional_service_ids,created_by)
       VALUES ($1,$2,'OPEN',now(),'Fixture sintético','OTRO','SINTÉTICO','{}',$3)`,
      [expediente, tenantId, actor],
    );
    const request = randomUUID();
    await qr.query(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [subscriber, request],
    );
    await qr.query(
      `UPDATE expediente_records SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [expediente, request],
    );

    await expectPrivacyBlock(qr.query('DELETE FROM subscribers WHERE id = $1', [subscriber]));
    await expectPrivacyBlock(
      qr.query('DELETE FROM expediente_records WHERE id = $1', [expediente]),
    );
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    try {
      await expectPrivacyBlock(qr.query('DELETE FROM subscribers WHERE id = $1', [subscriber]));
      await expectPrivacyBlock(
        qr.query('DELETE FROM expediente_records WHERE id = $1', [expediente]),
      );
    } finally {
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    }

    // Contratos: DELETE del suprimido falla con y sin GUC.
    const contract = randomUUID();
    await qr.query(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,alias,
        additional_product_ids,additional_service_ids)
       VALUES ($1,$2,$3,'fixture-plan','{}','DRAFT','Sintético','{}','{}')`,
      [contract, tenantId, subscriber],
    );
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    await qr.query('UPDATE contracts SET anonymized_at = now() WHERE id = $1', [contract]);
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    await expectPrivacyBlock(qr.query('DELETE FROM contracts WHERE id = $1', [contract]));
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    try {
      await expectPrivacyBlock(qr.query('DELETE FROM contracts WHERE id = $1', [contract]));
    } finally {
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    }
  });

  it('rama monótona: con GUC acepta NULL/marcador/contención y rechaza la reidentificación', async () => {
    const actor = randomUUID();
    const subscriber = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,document_type,
        document_number_encrypted,first_name,last_name,stratum,email_encrypted,
        phone_encrypted,vat_treatment,tax_regime,address,created_by)
       VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','H1',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
      [subscriber, tenantId, actor],
    );
    const request = randomUUID();
    await qr.query(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [subscriber, request],
    );
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    try {
      await qr.query(
        `UPDATE subscribers SET first_name = 'ANONIMIZADO', stratum = NULL WHERE id = $1`,
        [subscriber],
      );
      await expectPrivacyBlock(
        qr.query(`UPDATE subscribers SET first_name = 'Reidentificado' WHERE id = $1`, [
          subscriber,
        ]),
      );
      await expectPrivacyBlock(
        qr.query(`UPDATE subscribers SET stratum = 3 WHERE id = $1`, [subscriber]),
      );
      // Sin GUC, ni siquiera el marcador pasa.
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
      await expectPrivacyBlock(
        qr.query(`UPDATE subscribers SET first_name = 'ANONIMIZADO' WHERE id = $1`, [subscriber]),
      );
    } finally {
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    }

    // Registro de la mutación permitida (prepara CA-H1-06): una sola entrada; los
    // rechazos revierten y no dejan nada.
    const log: Array<{
      table_name: string;
      row_id: string;
      txid: string;
      session_user: string;
      operation: string;
      changed_columns: string[];
      anonymized_request_id: string | null;
    }> = await qr.query(
      `SELECT table_name, row_id::text AS row_id, txid::text AS txid, "session_user",
              operation, changed_columns, anonymized_request_id::text AS anonymized_request_id
         FROM privacy_erasure_mutation_log
        WHERE table_name = 'subscribers' AND row_id = $1 ORDER BY id`,
      [subscriber],
    );
    const connector: Array<{ user: string }> = await qr.query(
      'SELECT session_user::text AS "user"',
    );
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      table_name: 'subscribers',
      row_id: subscriber,
      session_user: connector[0]?.user,
      operation: 'UPDATE',
      anonymized_request_id: request,
    });
    expect(Number(log[0]?.txid)).toBeGreaterThan(0);
    expect(log[0]?.changed_columns).toEqual(expect.arrayContaining(['first_name', 'stratum']));
    expect(log[0]?.changed_columns).not.toContain('last_name');
  });

  it('bitácora de contratos: registra con titular suprimido y no en la primera supresión', async () => {
    const actor = randomUUID();
    const subscriber = randomUUID();
    const contract = randomUUID();
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,document_type,
        document_number_encrypted,first_name,last_name,stratum,email_encrypted,
        phone_encrypted,vat_treatment,tax_regime,address,created_by)
       VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','H1',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
      [subscriber, tenantId, actor],
    );
    await qr.query(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,alias,
        additional_product_ids,additional_service_ids)
       VALUES ($1,$2,$3,'fixture-plan','{}','DRAFT','Sintético','{}','{}')`,
      [contract, tenantId, subscriber],
    );
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    try {
      // Primera supresión: titular aún sin marcar, la fila tampoco → sin entrada.
      await qr.query(`UPDATE contracts SET installation_notes = NULL WHERE id = $1`, [contract]);
      expect(await logEntriesFor(contract)).toBe(0);

      const request = randomUUID();
      await qr.query(
        `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
        [subscriber, request],
      );
      await qr.query(`UPDATE contracts SET alias = 'ANONIMIZADO' WHERE id = $1`, [contract]);
      const rows: Array<{ changed_columns: string[]; anonymized_request_id: string | null }> =
        await qr.query(
          `SELECT changed_columns, anonymized_request_id::text AS anonymized_request_id
             FROM privacy_erasure_mutation_log WHERE table_name = 'contracts' AND row_id = $1`,
          [contract],
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.changed_columns).toEqual(expect.arrayContaining(['alias']));
      expect(rows[0]?.anonymized_request_id).toBe(request);

      // Reidentificación rechazada: revierte y no suma entrada.
      await expectPrivacyBlock(
        qr.query(`UPDATE contracts SET alias = 'Reidentificado' WHERE id = $1`, [contract]),
      );
      expect(await logEntriesFor(contract)).toBe(1);
    } finally {
      await qr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    }
  });

  it('CA-H1-05: iwana_app sin escritura en la bitácora y guardia append-only', async () => {
    expect(await privilege('INSERT')).toBe(false);
    expect(await privilege('UPDATE')).toBe(false);
    expect(await privilege('DELETE')).toBe(false);
    expect(await privilege('TRUNCATE')).toBe(false);
    expect(await privilege('SELECT')).toBe(true);

    const triggers: Array<{ name: string }> = await qr.query(
      `SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal
         AND tgrelid = $1::regclass`,
      [`${schema}.privacy_erasure_mutation_log`],
    );
    expect(triggers.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'trg_privacy_erasure_mutation_log_no_modify',
        'trg_privacy_erasure_mutation_log_writer_only',
      ]),
    );

    const probe: Array<{ id: string }> = await qr.query(
      `SELECT id FROM privacy_erasure_mutation_log ORDER BY id DESC LIMIT 1`,
    );
    if (probe[0]) {
      await expectLogGuard(
        qr.query('UPDATE privacy_erasure_mutation_log SET table_name = $1 WHERE id = $2', [
          'subscribers',
          probe[0].id,
        ]),
      );
      await expectLogGuard(
        qr.query('DELETE FROM privacy_erasure_mutation_log WHERE id = $1', [probe[0].id]),
      );
    }
  });

  it('CA-H1-05 (B1-R2): reaplicar los grants del tenant no devuelve escritura a iwana_app', async () => {
    const credentials = resolveMigrationDbCredentials();
    await qr.query(buildTenantSchemaAppGrantsSql(schema, appRole, credentials.username));

    expect(await privilege('INSERT')).toBe(false);
    expect(await privilege('UPDATE')).toBe(false);
    expect(await privilege('DELETE')).toBe(false);
    expect(await privilege('SELECT')).toBe(true);
    const sequence: Array<{ ok: boolean }> = await qr.query(
      `SELECT has_sequence_privilege('iwana_app', $1, 'USAGE') AS ok`,
      [`${schema}.privacy_erasure_mutation_log_id_seq`],
    );
    expect(sequence[0]?.ok).toBe(false);
  });

  it('CA-H1-05 (B1-R): no existe escritor invocable y iwana_app con el GUC no deja entradas', async () => {
    // 1) Catálogo: ninguna función del schema que escriba en la bitácora es
    //    invocable; las que la nombran son de trigger y sin EXECUTE para la app.
    const writers: Array<{
      name: string;
      is_trigger: boolean;
      app_exec: boolean;
      public_exec: boolean;
    }> = await qr.query(
      `SELECT p.proname AS name,
                p.prorettype = 'trigger'::regtype AS is_trigger,
                has_function_privilege($2, p.oid, 'EXECUTE') AS app_exec,
                CASE WHEN p.proacl IS NULL THEN true ELSE EXISTS (
                  SELECT 1 FROM aclexplode(p.proacl) a
                   WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
                ) END AS public_exec
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = $1
            AND (p.prosrc ILIKE '%privacy_erasure_mutation_log%'
                 OR p.proname LIKE 'privacy\\_log\\_%'
                 OR p.proname LIKE 'privacy\\_erasure\\_%')`,
      [schema, appRole],
    );
    expect(writers.map((row) => row.name).sort()).toEqual([
      'privacy_erasure_log_mutation',
      'privacy_erasure_mutation_log_no_modify',
      'privacy_erasure_mutation_log_writer_only',
    ]);
    for (const row of writers) {
      expect(row).toMatchObject({ is_trigger: true, app_exec: false, public_exec: false });
    }
    expect(await functionDef('privacy_log_erasure_mutation')).toBe('');

    // 2) Llamadas directas del rol real de la API, con el GUC fijado.
    const forgedRow = randomUUID();
    await appQr.query(`SELECT set_config('iwana.titular_erasure', 'on', false)`);
    try {
      await expect(
        appQr.query(
          `SELECT privacy_log_erasure_mutation($1, 'subscribers', $2, 'UPDATE', ARRAY['first_name'], NULL)`,
          [schema, forgedRow],
        ),
      ).rejects.toMatchObject({ driverError: { code: '42883' } });
      await expect(appQr.query('SELECT privacy_erasure_log_mutation()')).rejects.toMatchObject({
        driverError: { code: expect.stringMatching(/^(42501|0A000)$/u) },
      });
      await expect(
        appQr.query(
          `INSERT INTO privacy_erasure_mutation_log (txid, "session_user", table_name, row_id, operation)
           VALUES (1, 'falso', 'subscribers', $1, 'UPDATE')`,
          [forgedRow],
        ),
      ).rejects.toMatchObject({ driverError: { code: '42501' } });

      // 3) Aunque un GRANT amplio posterior (apply-least-privilege) le devuelva
      //    INSERT, la guardia rechaza toda inserción que no venga del trigger.
      await qr.query(
        `GRANT INSERT ON TABLE "${schema}".privacy_erasure_mutation_log TO "${appRole}"`,
      );
      try {
        await expect(
          appQr.query(
            `INSERT INTO privacy_erasure_mutation_log (txid, "session_user", table_name, row_id, operation)
             VALUES (1, 'falso', 'subscribers', $1, 'UPDATE')`,
            [forgedRow],
          ),
        ).rejects.toMatchObject({
          driverError: { code: '55000', hint: 'PRIVACY_LOG_WRITER_ONLY' },
        });
      } finally {
        await qr.query(
          `REVOKE INSERT ON TABLE "${schema}".privacy_erasure_mutation_log FROM "${appRole}"`,
        );
      }
    } finally {
      await appQr.query(`SELECT set_config('iwana.titular_erasure', 'off', false)`);
    }
    expect(await logEntriesFor(forgedRow)).toBe(0);
    expect(await privilege('INSERT')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // B1-R3 (sec-eng P1-1, P2-1, P3-2): search_path del trigger y de la bitácora.
  // ---------------------------------------------------------------------------

  async function functionConfig(name: string): Promise<string[] | null> {
    const rows: Array<{ config: string[] | null }> = await qr.query(
      `SELECT p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = $1 AND n.nspname = $2`,
      [name, schema],
    );
    return rows[0]?.config ?? null;
  }

  async function insertSubscriber(id: string): Promise<void> {
    await qr.query(
      `INSERT INTO subscribers (id,tenant_id,person_type,customer_segment,document_type,
        document_number_encrypted,first_name,last_name,stratum,email_encrypted,
        phone_encrypted,vat_treatment,tax_regime,address,created_by)
       VALUES ($1,$2,'NATURAL','RESIDENTIAL','CC','synthetic','Fixture','H1',3,
        'synthetic','synthetic','STANDARD','SIMPLIFIED','Sintética',$3)`,
      [id, tenantId, randomUUID()],
    );
  }

  async function insertContract(id: string, subscriber: string): Promise<void> {
    await qr.query(
      `INSERT INTO contracts (id,tenant_id,subscriber_id,plan_id,plan_snapshot_json,status,alias,
        additional_product_ids,additional_service_ids)
       VALUES ($1,$2,$3,'fixture-plan','{}','DRAFT','Sintético','{}','{}')`,
      [id, tenantId, subscriber],
    );
  }

  /** Suprime al suscriptor sin GUC (la fila aún no está suprimida). */
  async function suppressSubscriber(id: string): Promise<void> {
    await qr.query(
      `UPDATE subscribers SET anonymized_at = now(), anonymized_request_id = $2 WHERE id = $1`,
      [id, randomUUID()],
    );
  }

  async function sessionGuc(): Promise<string | null> {
    const rows: Array<{ value: string | null }> = await qr.query(
      `SELECT current_setting('iwana.titular_erasure', true) AS value`,
    );
    return rows[0]?.value ?? null;
  }

  /**
   * Conexión propia y fija del rol real de la API: las tablas temporales y el
   * search_path viven por conexión. DISCARD ALL las retira antes de devolverla.
   */
  async function withAppSession(fn: (session: QueryRunner) => Promise<void>): Promise<void> {
    const session = appDs.createQueryRunner();
    await session.connect();
    try {
      await session.query(`SET search_path TO "${schema}", public`);
      await fn(session);
    } finally {
      await session.query('DISCARD ALL').catch(() => undefined);
      await session.release();
    }
  }

  it('P1-1 (a): una tabla temporal `subscribers` de iwana_app no desprotege el contrato', async () => {
    const subscriber = randomUUID();
    const contract = randomUUID();
    await insertSubscriber(subscriber);
    await insertContract(contract, subscriber);
    await suppressSubscriber(subscriber);
    // El contrato no lleva marca propia: solo lo protege la consulta al suscriptor.
    const marked: Array<{ anonymized_at: Date | null }> = await qr.query(
      'SELECT anonymized_at FROM contracts WHERE id = $1',
      [contract],
    );
    expect(marked[0]?.anonymized_at).toBeNull();

    // Control: sin la tabla temporal, el rol de la API ya está bloqueado.
    await expectPrivacyBlock(
      appQr.query(`UPDATE contracts SET installation_notes = 'Dato repuesto' WHERE id = $1`, [
        contract,
      ]),
    );

    await withAppSession(async (session) => {
      await session.query('CREATE TEMP TABLE subscribers (id uuid, anonymized_at timestamptz)');
      await expectPrivacyBlock(
        session.query(`UPDATE contracts SET installation_notes = 'Dato repuesto' WHERE id = $1`, [
          contract,
        ]),
      );
      await expectPrivacyBlock(session.query('DELETE FROM contracts WHERE id = $1', [contract]));
    });

    const rows: Array<{ installation_notes: string | null }> = await qr.query(
      'SELECT installation_notes FROM contracts WHERE id = $1',
      [contract],
    );
    expect(rows).toEqual([{ installation_notes: null }]);
  });

  /**
   * Ataque P1-1 (b): iwana_app crea un operador falso para `text` en `public` y
   * antepone `public` a `pg_catalog`. Si no pudiera crear en `public`, el ataque
   * no existe: se documenta con el 42501 y la prueba termina ahí.
   */
  async function attackWithFakeOperator(
    operator: '=' | '<>',
    body: string,
    guc: 'on' | 'off',
    column: 'first_name' | 'last_name',
    value: string,
  ): Promise<void> {
    const subscriber = randomUUID();
    await insertSubscriber(subscriber);
    await suppressSubscriber(subscriber);
    const fn = `public.h1r3_text_op_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    await withAppSession(async (session) => {
      await session.query('SET search_path TO public, pg_catalog');
      try {
        await session.query(
          `CREATE FUNCTION ${fn}(text, text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $op$${body}$op$`,
        );
      } catch (error) {
        expect(error).toMatchObject({ driverError: { code: '42501' } });
        return;
      }
      try {
        await session.query(
          `CREATE OPERATOR public.${operator} (LEFTARG = text, RIGHTARG = text, FUNCTION = ${fn})`,
        );
        await session.query('BEGIN');
        try {
          await session.query(`SELECT set_config('iwana.titular_erasure', $1, true)`, [guc]);
          await expectPrivacyBlock(
            session.query(`UPDATE "${schema}".subscribers SET ${column} = $2 WHERE id = $1`, [
              subscriber,
              value,
            ]),
          );
        } finally {
          await session.query('ROLLBACK');
        }
      } finally {
        await session.query(`DROP OPERATOR IF EXISTS public.${operator} (text, text)`);
        await session.query(`DROP FUNCTION IF EXISTS ${fn}(text, text)`);
      }
    });

    const rows: Array<{ first_name: string; last_name: string }> = await qr.query(
      'SELECT first_name, last_name FROM subscribers WHERE id = $1',
      [subscriber],
    );
    expect(rows).toEqual([{ first_name: 'Fixture', last_name: 'H1' }]);
  }

  it('P1-1 (b1): un `=` falso en `public` no hace pasar una escritura con el GUC en off', async () => {
    // Igualdad real salvo contra 'on': engaña solo la comprobación del GUC. Sin GUC,
    // ni siquiera el marcador pasa (rama monótona), así que pasarlo prueba el engaño.
    await attackWithFakeOperator(
      '=',
      `SELECT pg_catalog.texteq($1, $2) OR pg_catalog.texteq($2, 'on')`,
      'off',
      'first_name',
      'ANONIMIZADO',
    );
  });

  it('P1-1 (b2): un `<>` falso en `public` no hace pasar un dato por el marcador con el GUC', async () => {
    // `<>` siempre falso: un dato real pasa por «igual al marcador».
    await attackWithFakeOperator('<>', 'SELECT false', 'on', 'last_name', 'Reidentificado');
  });

  it('P1-1: el bloqueo, la bitácora, la 150 y la 170 fijan search_path y no leen tablas sin calificar', async () => {
    for (const name of [
      'titular_prevent_anonymized_mutation',
      'privacy_erasure_log_mutation',
      'privacy_erasure_mutation_log_writer_only',
      'privacy_erasure_mutation_log_no_modify',
      'titular_prevent_anonymization_rewrite',
      'contract_preserve_retention_clock',
    ]) {
      expect({ name, config: await functionConfig(name) }).toEqual({
        name,
        config: [SAFE_SEARCH_PATH],
      });
    }
    const monotonic = await functionDef('titular_prevent_anonymized_mutation');
    expect(monotonic).not.toMatch(/FROM\s+subscribers\b/u);
    expect(monotonic).toContain('FROM %I.subscribers');
  });

  it('P2-1: cada columna del catálogo aparece en el cuerpo del trigger con su transición', async () => {
    const body = await functionDef('titular_prevent_anonymized_mutation');
    expect(monotonicBodyGaps(body, PRIVACY_H1_MONOTONIC_CATALOG)).toEqual([]);

    // Una columna sembrada en el catálogo y ausente del cuerpo hace fallar la paridad.
    const seeded: Record<string, H1CatalogEntry[]> = {
      ...PRIVACY_H1_MONOTONIC_CATALOG,
      subscribers: [
        ...(PRIVACY_H1_MONOTONIC_CATALOG['subscribers'] ?? []),
        { column: 'h1_seeded_outside_body', kind: 'null' },
      ],
    };
    expect(monotonicBodyGaps(body, seeded)).toEqual(['subscribers.h1_seeded_outside_body']);

    // Una transición que no coincide con el cuerpo también falla.
    const drifted: Record<string, H1CatalogEntry[]> = {
      ...PRIVACY_H1_MONOTONIC_CATALOG,
      contracts: (PRIVACY_H1_MONOTONIC_CATALOG['contracts'] ?? []).map((entry) =>
        entry.column === 'alias' ? { ...entry, kind: 'null' } : entry,
      ),
    };
    expect(monotonicBodyGaps(body, drifted)).toEqual(['contracts.alias']);
  });

  it('P3-2: TRUNCATE de la bitácora rechazado, también para su dueño', async () => {
    const triggers: Array<{ name: string }> = await qr.query(
      `SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = $1::regclass`,
      [`${schema}.privacy_erasure_mutation_log`],
    );
    expect(triggers.map((row) => row.name)).toContain(
      'trg_privacy_erasure_mutation_log_no_truncate',
    );

    await qr.startTransaction();
    try {
      await expectLogGuard(qr.query('TRUNCATE privacy_erasure_mutation_log'));
    } finally {
      await qr.rollbackTransaction();
    }
    await expect(appQr.query('TRUNCATE privacy_erasure_mutation_log')).rejects.toMatchObject({
      driverError: { code: '42501' },
    });
  });

  it('relleno: marca los contratos de titulares ya suprimidos sin dejar el GUC fijado; down conserva', async () => {
    const suppressed = randomUUID();
    const alive = randomUUID();
    const suppressedContract = randomUUID();
    const aliveContract = randomUUID();
    await insertSubscriber(suppressed);
    await insertSubscriber(alive);
    await insertContract(suppressedContract, suppressed);
    await insertContract(aliveContract, alive);
    await suppressSubscriber(suppressed);

    await migration.down(qr);
    // down: la 150, la 170 y la 169 vuelven a su estado previo; tabla y guardias se conservan.
    expect(await functionConfig('titular_prevent_anonymization_rewrite')).toBeNull();
    expect(await functionConfig('contract_preserve_retention_clock')).toBeNull();
    expect(await functionConfig('titular_prevent_anonymized_mutation')).toBeNull();
    expect(await tableExists('privacy_erasure_mutation_log')).toBe(true);
    const kept: Array<{ name: string }> = await qr.query(
      `SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = $1::regclass`,
      [`${schema}.privacy_erasure_mutation_log`],
    );
    expect(kept.map((row) => row.name).sort()).toEqual([
      'trg_privacy_erasure_mutation_log_no_modify',
      'trg_privacy_erasure_mutation_log_no_truncate',
      'trg_privacy_erasure_mutation_log_writer_only',
    ]);
    expect(await functionConfig('privacy_erasure_mutation_log_no_modify')).toEqual([
      SAFE_SEARCH_PATH,
    ]);

    // up dentro de una transacción, como el runner: el GUC no queda fijado ni dentro ni fuera.
    const before = await sessionGuc();
    await qr.startTransaction();
    try {
      await migration.up(qr);
      expect(await sessionGuc()).toBe(before);
      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    }
    expect(await sessionGuc()).toBe(before);

    const rows: Array<{ id: string; same: boolean | null; marked: boolean }> = await qr.query(
      `SELECT c.id::text AS id, c.anonymized_at = s.anonymized_at AS same,
              c.anonymized_at IS NOT NULL AS marked
         FROM contracts c JOIN subscribers s ON s.id = c.subscriber_id
        WHERE c.id = ANY($1::uuid[])`,
      [[suppressedContract, aliveContract]],
    );
    expect(rows.find((row) => row.id === suppressedContract)).toMatchObject({
      same: true,
      marked: true,
    });
    expect(rows.find((row) => row.id === aliveContract)).toMatchObject({ marked: false });

    // El relleno no deja el trigger monótono de contratos desactivado.
    const enabled: Array<{ state: string }> = await qr.query(
      `SELECT tgenabled AS state FROM pg_trigger
        WHERE tgname = 'trg_contracts_prevent_anonymized_mutation' AND tgrelid = $1::regclass`,
      [`${schema}.contracts`],
    );
    expect(enabled).toEqual([{ state: 'O' }]);

    // Con la marca propia, el contrato queda protegido aunque falle la consulta al suscriptor.
    await expectPrivacyBlock(
      appQr.query(`UPDATE contracts SET installation_notes = 'Dato repuesto' WHERE id = $1`, [
        suppressedContract,
      ]),
    );
  });
});
