import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { PublishInstalacionEstandarV2131000000000 } from './131_publish_instalacion_estandar_v2';

/**
 * Integración 131 contra PostgreSQL real (patrón 092/129): levanta el mínimo
 * de tablas de plantillas (094) + `execution_orders` en un schema efímero con
 * nombre de tenant válido, siembra el estado post-118 (canónica v1 publicada +
 * OT viva bajo v1) y ejecuta el round-trip up → up idempotente → down
 * bloqueado → down ejercitado → up tras down.
 *
 * `IWANA_DB_INTEGRATION_AVAILABLE=true` + `pnpm --filter @iwana/db
 * test:integration`. Sin PostgreSQL alcanzable se omite con banner — nunca en
 * silencio.
 */
const SCHEMA = `tenant_it131_${randomBytes(4).toString('hex')}`;
const TENANT_ID = randomUUID();
const TEMPLATE_ID = randomUUID();
const V1_ID = randomUUID();
const OT_VIVA_V1 = randomUUID();
const OT_ABIERTA_V2 = randomUUID();

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

if (!dbAvailable) {
  console.warn(
    '[131-integration] describe.skip activo — sin PostgreSQL real; no se ejecuta el round-trip con datos.',
  );
}

interface RequirementRow {
  key: string;
  label: string;
  required: boolean;
  kind: string;
  config: unknown;
  sort_order: number;
}

describeWithDb('131 publica INSTALACION_ESTANDAR v2 — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new PublishInstalacionEstandarV2131000000000();

  async function versionRows(): Promise<Array<{ version: number; status: string; label: string }>> {
    return runner.query(
      `SELECT version, status, label FROM execution_order_template_versions
        WHERE tenant_id = $1 ORDER BY version`,
      [TENANT_ID],
    );
  }

  async function requirementRows(versionId: string): Promise<RequirementRow[]> {
    return runner.query(
      `SELECT key, label, required, kind, config, sort_order
         FROM execution_order_template_requirements
        WHERE version_id = $1 ORDER BY sort_order`,
      [versionId],
    );
  }

  async function versionIdOf(version: number): Promise<string> {
    const rows = (await runner.query(
      `SELECT id FROM execution_order_template_versions WHERE tenant_id = $1 AND version = $2`,
      [TENANT_ID, version],
    )) as Array<{ id: string }>;
    if (!rows[0]) throw new Error(`Sin versión ${version} en el schema efímero`);
    return rows[0].id;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TENANT_ID,
          'Integration tenant 131',
          `${SCHEMA}-slug`,
          SCHEMA,
          `${SCHEMA}@invalid.example`,
        ],
      );
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);

    // Mínimo de plantillas (094) suficiente para la 131.
    await runner.query(`
      CREATE TABLE execution_order_templates (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        key VARCHAR(64) NOT NULL,
        label VARCHAR(200) NOT NULL,
        work_type VARCHAR(40) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_template_versions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        template_id UUID NOT NULL REFERENCES execution_order_templates (id),
        template_key VARCHAR(64) NOT NULL,
        version INTEGER NOT NULL,
        label VARCHAR(200) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        reason_catalogs JSONB,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE TABLE execution_order_template_requirements (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        version_id UUID NOT NULL REFERENCES execution_order_template_versions (id) ON DELETE CASCADE,
        key VARCHAR(64) NOT NULL,
        label VARCHAR(200) NOT NULL,
        required BOOLEAN NOT NULL DEFAULT TRUE,
        kind VARCHAR(20) NOT NULL,
        config JSONB,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE TABLE execution_orders (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        template_version_id UUID,
        status VARCHAR(40) NOT NULL
      )
    `);

    // Estado post-118: canónica publicada en v1 con sus 3 requisitos.
    await runner.query(
      `INSERT INTO execution_order_templates (id, tenant_id, key, label, work_type, status)
       VALUES ($1, $2, 'INSTALACION_ESTANDAR', 'Instalación estándar', 'INSTALLATION', 'PUBLISHED')`,
      [TEMPLATE_ID, TENANT_ID],
    );
    await runner.query(
      `INSERT INTO execution_order_template_versions
         (id, tenant_id, template_id, template_key, version, label, status, reason_catalogs, published_at)
       VALUES ($1, $2, $3, 'INSTALACION_ESTANDAR', 1, 'Instalación estándar v1', 'PUBLISHED', '[]', NOW())`,
      [V1_ID, TENANT_ID, TEMPLATE_ID],
    );
    const v1Reqs = [
      [
        'installation-activity',
        'Actividad de instalación',
        true,
        'ACTIVITY',
        '{"activityType":"INSTALLATION"}',
      ],
      ['work-photo', 'Evidencia fotográfica', true, 'EVIDENCE', '{"evidenceType":"PHOTO"}'],
      ['CUSTOMER_SIGNATURE', 'Firma del cliente', true, 'EVIDENCE', '{"evidenceType":"SIGNATURE"}'],
    ] as const;
    for (const [index, [key, label, required, kind, config]] of v1Reqs.entries()) {
      await runner.query(
        `INSERT INTO execution_order_template_requirements
           (id, tenant_id, version_id, key, label, required, kind, config, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [randomUUID(), TENANT_ID, V1_ID, key, label, required, kind, config, index],
      );
    }
    // OT viva bajo v1: no se re-snapshotea, sigue apuntando a la v1.
    await runner.query(
      `INSERT INTO execution_orders (id, tenant_id, template_version_id, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS')`,
      [OT_VIVA_V1, TENANT_ID, V1_ID],
    );
  });

  afterAll(async () => {
    await runner?.release();
    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await cleanup.query(`DELETE FROM public.tenants WHERE id = $1`, [TENANT_ID]);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('up publica la v2 con los 5 requisitos de spec §4.2 y copy B4 literal', async () => {
    await migration.up(runner);

    expect(await versionRows()).toEqual([
      { version: 1, status: 'PUBLISHED', label: 'Instalación estándar v1' },
      { version: 2, status: 'PUBLISHED', label: 'Instalación estándar v2' },
    ]);

    const v2Id = await versionIdOf(2);
    expect(await requirementRows(v2Id)).toEqual([
      {
        key: 'installed-equipment',
        label: 'Equipos instalados en el sitio del cliente',
        required: true,
        kind: 'MATERIAL',
        config: { itemCategory: 'CPE', finalDisposition: 'INSTALLED_AT_CUSTOMER' },
        sort_order: 0,
      },
      {
        key: 'service-test',
        label: 'Prueba de servicio en el sitio',
        required: true,
        kind: 'EVIDENCE',
        config: { evidenceType: 'PHOTO' },
        sort_order: 1,
      },
      {
        key: 'work-photo',
        label: 'Fotos del trabajo realizado',
        required: true,
        kind: 'EVIDENCE',
        config: { evidenceType: 'PHOTO' },
        sort_order: 2,
      },
      {
        key: 'CUSTOMER_SIGNATURE',
        label: 'Acta de conformidad firmada por el cliente',
        required: true,
        kind: 'EVIDENCE',
        config: { evidenceType: 'SIGNATURE' },
        sort_order: 3,
      },
      {
        key: 'installation-activity',
        label: 'Registro de la actividad en bitácora (NO requerido)',
        required: false,
        kind: 'ACTIVITY',
        config: { activityType: 'INSTALLATION' },
        sort_order: 4,
      },
    ]);
  });

  it('up no toca la v1, la plantilla ni la OT viva (sin re-snapshot)', async () => {
    const v1Reqs = await requirementRows(V1_ID);
    expect(v1Reqs).toHaveLength(3);
    expect(v1Reqs.map((row) => row.key)).toEqual([
      'installation-activity',
      'work-photo',
      'CUSTOMER_SIGNATURE',
    ]);

    const orders = (await runner.query(
      `SELECT id, template_version_id, status FROM execution_orders ORDER BY id`,
    )) as Array<{ id: string; template_version_id: string; status: string }>;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toEqual({
      id: OT_VIVA_V1,
      template_version_id: V1_ID,
      status: 'IN_PROGRESS',
    });

    const templates = (await runner.query(
      `SELECT key, status, label FROM execution_order_templates WHERE tenant_id = $1`,
      [TENANT_ID],
    )) as Array<{ key: string; status: string; label: string }>;
    expect(templates).toEqual([
      { key: 'INSTALACION_ESTANDAR', status: 'PUBLISHED', label: 'Instalación estándar' },
    ]);
  });

  it('up es idempotente: el re-run no duplica versión ni requisitos', async () => {
    await migration.up(runner);
    await migration.up(runner);

    expect(await versionRows()).toHaveLength(2);
    const v2Id = await versionIdOf(2);
    expect(await requirementRows(v2Id)).toHaveLength(5);
  });

  it('down falla cerrado cuando hay OT abiertas sobre la v2', async () => {
    const v2Id = await versionIdOf(2);
    await runner.query(
      `INSERT INTO execution_orders (id, tenant_id, template_version_id, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS')`,
      [OT_ABIERTA_V2, TENANT_ID, v2Id],
    );

    await expect(migration.down(runner)).rejects.toThrow(/OT abiertas referencian la v2/);

    // La v2 sigue intacta tras el down bloqueado.
    expect(await versionRows()).toHaveLength(2);
  });

  it('down ejercitado retira solo la v2 y deja la v1 operativa', async () => {
    await runner.query(`UPDATE execution_orders SET status = 'COMPLETED' WHERE id = $1`, [
      OT_ABIERTA_V2,
    ]);

    await migration.down(runner);

    expect(await versionRows()).toEqual([
      { version: 1, status: 'PUBLISHED', label: 'Instalación estándar v1' },
    ]);
    expect(await requirementRows(V1_ID)).toHaveLength(3);

    // Segundo down sin v2: no-op, sin throw incondicional.
    await expect(migration.down(runner)).resolves.toBeUndefined();
  });

  it('up tras down republica la v2 (round-trip completo)', async () => {
    await migration.up(runner);

    expect(await versionRows()).toHaveLength(2);
    const v2Id = await versionIdOf(2);
    expect(await requirementRows(v2Id)).toHaveLength(5);
  });
});
