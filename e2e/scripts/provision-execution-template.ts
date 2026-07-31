/**
 * Provision script — Inserta la plantilla de ejecución mínima necesaria
 * para que el E2E `execution-orders-operational.spec.ts` pueda congelar el
 * snapshot durante `createFromSchedulingWithManager` y el cierre (gate
 * CLOSURE_GATE_SNAPSHOT_MISSING) no rechace la OT.
 *
 * Este script reemplaza la creación de plantilla vía API que fallaba porque
 * ningún token disponible en la suite pasa simultáneamente `@Roles(UserRole.ADMIN,
 * UserRole.NOC)` (RolesGuard) y `@Permissions(…TEMPLATES_MANAGE)` (PermissionsGuard):
 *
 *   - `nocToken`  → falla PermissionsGuard  (NOC no tiene `…templates.manage`)
 *   - `platformToken` → falla RolesGuard      (SYSTEM_ADMIN no es ADMIN ni NOC)
 *
 * Idempotente: usa INSERT … ON CONFLICT DO NOTHING. Puede ejecutarse antes
 * de cada suite sin efectos colaterales.
 *
 * Ejecución:
 *   npx tsx e2e/scripts/provision-execution-template.ts
 *
 * O desde la raíz del monorepo:
 *   node --require tsx/cjs e2e/scripts/provision-execution-template.ts
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from 'node:process';

// ── Carga de variables de entorno ──────────────────────────────────────
// Replicamos la precedencia de load-env.ts: .env.development.local > .env.development > .env
const loadEnvFile = (
  globalThis.process as typeof globalThis.process & {
    loadEnvFile?: (path?: string) => void;
  }
).loadEnvFile;

if (loadEnvFile) {
  const workspaceRoot = findWorkspaceRoot();
  if (workspaceRoot) {
    for (const candidate of ['.env.development.local', '.env.development', '.env']) {
      const filePath = resolve(workspaceRoot, candidate);
      try {
        if (loadEnvFile) loadEnvFile(filePath);
      } catch {
        // Archivo ausente o ilegible: continuar
      }
    }
  }
}

function findWorkspaceRoot(): string | null {
  let current = process.cwd();
  for (;;) {
    try {
      const content = readFileSync(resolve(current, 'pnpm-workspace.yaml'), 'utf-8');
      if (content) return current;
    } catch {
      // No hay pnpm-workspace.yaml en este nivel
    }
    const parent = resolve(current, '..');
    if (parent === current) return null;
    current = parent;
  }
}

// ── Constantes ─────────────────────────────────────────────────────────
const TEMPLATE_KEY = 'E2E_HAPPY_PATH';

interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

function getDbConfig(overridePort?: number): DbConfig {
  const host = env['DB_HOST'] || 'localhost';
  const port = overridePort ?? parseInt(env['DB_PORT'] || '5432', 10);
  const database = env['DB_NAME'] || 'iwana';

  // Preferir credenciales de migrador si existen; si no, DB_USER/DB_PASSWORD
  const migratorUser = (env['DB_MIGRATOR_USER'] || '').trim();
  const user = migratorUser || env['DB_USER'] || 'iwana';
  const password =
    (migratorUser ? env['DB_MIGRATOR_PASSWORD'] : undefined) ?? env['DB_PASSWORD'] ?? '';

  return { host, port, database, user, password };
}

// ── SQL ─────────────────────────────────────────────────────────────────
const SQL_FIND_TENANT = `
  SELECT id, schema_name
  FROM public.tenants
  WHERE slug = $1
  LIMIT 1
`;

const SQL_UPSERT_TEMPLATE = `
  INSERT INTO {schema}.execution_order_templates
    (id, tenant_id, key, label, work_type, status, created_at, updated_at)
  VALUES
    (gen_random_uuid(), $1, $2, $3, $4, 'PUBLISHED', NOW(), NOW())
  ON CONFLICT (tenant_id, key) DO UPDATE
    SET label      = EXCLUDED.label,
        work_type  = EXCLUDED.work_type,
        status     = 'PUBLISHED',
        updated_at = NOW()
  RETURNING id
`;

const SQL_UPSERT_VERSION = `
  INSERT INTO {schema}.execution_order_template_versions
    (id, tenant_id, template_id, template_key, version, label, status,
     reason_catalogs, published_at, created_at)
  VALUES
    (gen_random_uuid(), $1, $2, $3, 1, $4, 'PUBLISHED',
     '[]'::jsonb, NOW(), NOW())
  ON CONFLICT (tenant_id, template_key, version) DO UPDATE
    SET label        = EXCLUDED.label,
        status       = 'PUBLISHED',
        published_at = NOW()
  RETURNING id
`;

const SQL_DELETE_OLD_REQUIREMENTS = `
  DELETE FROM {schema}.execution_order_template_requirements
  WHERE tenant_id = $1 AND version_id = $2
`;

interface RequirementDef {
  key: string;
  label: string;
  required: boolean;
  kind: string;
  config: Record<string, unknown>;
}

const REQUIREMENTS: RequirementDef[] = [
  {
    key: 'installation-activity',
    label: 'Actividad de instalación',
    required: true,
    kind: 'ACTIVITY',
    config: { activityType: 'INSTALLATION' },
  },
  {
    key: 'e2e-test-evidence',
    label: 'Evidencia de trabajo',
    required: true,
    kind: 'EVIDENCE',
    config: { evidenceType: 'PHOTO' },
  },
  {
    key: 'CUSTOMER_SIGNATURE',
    label: 'Firma del cliente',
    required: true,
    kind: 'EVIDENCE',
    config: { evidenceType: 'SIGNATURE' },
  },
];

const SQL_INSERT_REQUIREMENT = `
  INSERT INTO {schema}.execution_order_template_requirements
    (id, tenant_id, version_id, key, label, required, kind, config, sort_order, created_at)
  VALUES
    (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
`;

// ── Main ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  // Parámetros posicionales para mayor fiabilidad en entornos efímeros:
  //   npx tsx provision-script.ts <tenantSlug> [dbPort]
  const tenantSlug = process.argv[2] || env['E2E_TENANT_SLUG'] || 'isp-demo';
  const dbConfig = getDbConfig(process.argv[3] ? parseInt(process.argv[3], 10) : undefined);

  // Resolver pg desde el monorepo usando createRequire (evita el problema
  // de paths absolutos en Windows con dynamic import()).
  const workspaceRoot = findWorkspaceRoot() ?? process.cwd();

  let pg: typeof import('pg');
  try {
    // Intentar desde CWD primero
    pg = createRequire(resolve(workspaceRoot, 'index.js'))('pg');
  } catch {
    // Fallback: cargar desde el paquete database
    pg = createRequire(resolve(workspaceRoot, 'packages', 'database', 'index.js'))('pg');
  }

  const pool = new pg.Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  const client = await pool.connect();

  try {
    // 0. Diagnosticar conexión
    const testConn = await client.query(
      'SELECT current_database() as db, inet_server_addr() as host, inet_server_port() as port',
    );
    console.log(
      `🔍 Conectado a: ${testConn.rows[0].db} @ ${testConn.rows[0].host}:${testConn.rows[0].port}`,
    );

    // 1. Buscar tenant
    const tenantResult = await client.query<{ id: string; schema_name: string }>(SQL_FIND_TENANT, [
      tenantSlug,
    ]);
    if (tenantResult.rows.length === 0) {
      const allTenants = await client.query(
        'SELECT slug, schema_name FROM public.tenants ORDER BY slug LIMIT 20',
      );
      console.error(
        `❌ Tenant '${tenantSlug}' no encontrado en public.tenants. ` +
          `Tenants disponibles: ${allTenants.rows.map((r: any) => `${r.slug}(${r.schema_name})`).join(', ') || 'NINGUNO'}`,
      );
      process.exit(1);
    }

    const tenantId = tenantResult.rows[0].id;
    const schemaName = tenantResult.rows[0].schema_name;
    console.log(`✅ Tenant encontrado: id=${tenantId} schema=${schemaName}`);

    // Helper: reemplaza {schema} en SQL
    const forSchema = (sql: string) => sql.replace(/\{schema\}/g, schemaName);

    // 2. Upsert template
    const templateResult = await client.query<{ id: string }>(forSchema(SQL_UPSERT_TEMPLATE), [
      tenantId,
      TEMPLATE_KEY,
      'E2E Happy Path - Cierre mínimo',
      'INSTALLATION',
    ]);
    const templateId = templateResult.rows[0].id;
    console.log(`✅ Plantilla creada/actualizada: id=${templateId} key=${TEMPLATE_KEY}`);

    // 3. Upsert version
    const versionResult = await client.query<{ id: string }>(forSchema(SQL_UPSERT_VERSION), [
      tenantId,
      templateId,
      TEMPLATE_KEY,
      'E2E Happy Path v1',
    ]);
    const versionId = versionResult.rows[0].id;
    console.log(`✅ Versión creada/actualizada: id=${versionId} version=1 status=PUBLISHED`);

    // 4. Reemplazar requirements (delete + insert para idempotencia con cambios)
    await client.query(forSchema(SQL_DELETE_OLD_REQUIREMENTS), [tenantId, versionId]);

    for (let i = 0; i < REQUIREMENTS.length; i++) {
      const req = REQUIREMENTS[i];
      await client.query(forSchema(SQL_INSERT_REQUIREMENT), [
        tenantId,
        versionId,
        req.key,
        req.label,
        req.required,
        req.kind,
        JSON.stringify(req.config),
        i,
      ]);
    }
    console.log(`✅ ${REQUIREMENTS.length} requisitos insertados`);

    console.log(`\n🎉 Plantilla provisionada correctamente para el tenant '${tenantSlug}'.`);
    console.log(`   El E2E de órdenes de ejecución usará esta plantilla automáticamente.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Error provisionando plantilla:', err);
  process.exit(1);
});
