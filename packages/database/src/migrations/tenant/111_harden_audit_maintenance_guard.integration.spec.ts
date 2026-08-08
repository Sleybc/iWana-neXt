import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials, type DbCredentials } from '../../db-credentials';
import { EnforceAuditImmutability0750000000000 } from './075_enforce_audit_immutability';
import { HardenAuditMaintenanceGuard1110000000000 } from './111_harden_audit_maintenance_guard';

/**
 * S-6 (SEC-P1): la escotilla `iwana.audit_maintenance = 'on'` deja de depender
 * solo del GUC y exige además pertenencia al rol `iwana_migrator`.
 *
 * El defecto: un GUC personalizado de dos partes puede fijarlo cualquier rol
 * conectado con `SET LOCAL` (no es restringible por permisos), así que
 * `iwana_app` —el principal cuyas acciones audita el trail— podía mutar
 * `audit_logs` con total impunidad. Esta suite lo verifica contra PostgreSQL
 * real: la aplicación NO puede evadir, el mantenimiento SÍ (redacción de PII),
 * y sin el GUC nadie puede.
 *
 * `pnpm --filter @iwana/db test:integration`. Sin DB alcanzable,
 * `test/integration-db-probe.js` deja `IWANA_DB_INTEGRATION_AVAILABLE !== 'true'`
 * y esta suite hace `describe.skip` con warning (no verde silencioso).
 *
 * Mecanismo de conexión: se conecta con las credenciales de migración
 * (`resolveMigrationDbCredentials`). Para ejercitar «como iwana_app» se abre una
 * conexión dedicada con `DB_APP_USER`/`DB_APP_PASSWORD` cuando están en el
 * entorno; si no, se usa `SET ROLE` sobre la conexión principal (requiere que el
 * conector sea miembro de ese rol o superuser — en dev el conector es `iwana` o
 * `iwana_migrator`). El caso de mantenimiento usa la conexión principal cuando
 * ya conecta como `iwana_migrator`; en caso contrario `SET ROLE`. Cada caso
 * nombra el mecanismo que pudo ejercitar.
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const suffix = randomBytes(8).toString('hex');
const SCHEMA = `it_111_audit_guard_${suffix}`;

/** SQLSTATE de `USING ERRCODE = 'insufficient_privilege'` en 075/014/111. */
const INSUFFICIENT_PRIVILEGE = '42501';
const APP_ROLE = 'iwana_app';
const MIGRATOR_ROLE = 'iwana_migrator';
const MAINTENANCE_GUC = 'iwana.audit_maintenance';

if (!dbAvailable) {
  console.warn(
    '[111-integration] describe.skip activo — sin PostgreSQL real; la escotilla de mantenimiento del audit trail no se valida.',
  );
}

interface UpdateOutcome {
  rejected: boolean;
  sqlState?: string | undefined;
}

function sqlStateOf(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Credenciales de la conexión dedicada del rol de aplicación, si existen en el env. */
function appRoleCredentials(): DbCredentials | null {
  const user = process.env['DB_APP_USER']?.trim();
  return user ? { username: user, password: process.env['DB_APP_PASSWORD'] ?? '' } : null;
}

describeWithDb('111 harden audit maintenance guard — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let appDataSource: DataSource | null = null;
  let appRunner: QueryRunner | null = null;

  let connectionRole = '';
  let canSetRoleApp = false;
  let canSetRoleMigrator = false;

  const tenantId = randomUUID();
  const rowId = randomUUID();

  /**
   * Ejecuta `UPDATE audit_logs SET new_value = ...` en `active` dentro de una
   * transacción, fijando el GUC con `SET LOCAL` si `withGuc` es true.
   * Devuelve el resultado: rechazado (con SQLSTATE) o aplicado.
   */
  async function attemptUpdate(active: QueryRunner, withGuc: boolean): Promise<UpdateOutcome> {
    await active.startTransaction();
    try {
      if (withGuc) {
        await active.query(`SET LOCAL ${MAINTENANCE_GUC} = 'on'`);
      }
      await active.query(`UPDATE audit_logs SET new_value = $1::jsonb WHERE id = $2`, [
        JSON.stringify({ fullName: '[REDACTADO]' }),
        rowId,
      ]);
      await active.commitTransaction();
      return { rejected: false };
    } catch (error) {
      if (active.isTransactionActive) {
        await active.rollbackTransaction();
      }
      return { rejected: true, sqlState: sqlStateOf(error) };
    }
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
      extra: { max: 4, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);

    // DDL mínimo: columnas que toca el UPDATE sintético de la redacción.
    await runner.query(`
      CREATE TABLE audit_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        user_agent VARCHAR(512),
        request_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_audit_logs PRIMARY KEY (id)
      )
    `);

    // Estado realista: la 075 instala función+trigger; la 111 endurece la
    // función compartida. El fixture pasa por ambos up().
    await new EnforceAuditImmutability0750000000000().up(runner);
    await new HardenAuditMaintenanceGuard1110000000000().up(runner);

    // El chequeo de privilegios de tabla precede a los triggers BEFORE: sin este
    // GRANT el UPDATE de la aplicación fallaría por permiso de tabla, no por el
    // trigger, y el caso no probaría nada. Conceder a ambos roles para que sea el
    // trigger quien decida.
    await runner.query(`
      DO $grants$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${APP_ROLE}', current_schema());
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.audit_logs TO ${APP_ROLE}', current_schema());
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${MIGRATOR_ROLE}') THEN
          EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${MIGRATOR_ROLE}', current_schema());
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.audit_logs TO ${MIGRATOR_ROLE}', current_schema());
        END IF;
      END
      $grants$
    `);

    // Fixture sintético — sin PII real; valores ya redactados o placeholders.
    await runner.query(
      `INSERT INTO audit_logs
         (id, tenant_id, action, entity_type, entity_id, old_value, new_value)
       VALUES
         ($1, $2, 'UPDATE', 'subscriber', 'synthetic-entity-001',
          $3::jsonb, $4::jsonb)`,
      [
        rowId,
        tenantId,
        JSON.stringify({ fullName: '[REDACTADO]' }),
        JSON.stringify({ fullName: 'valor-sintetico-pre-redaccion' }),
      ],
    );

    // Capacidades del conector: qué rol es y a cuáles puede hacer SET ROLE.
    const capabilities = (await runner.query(
      `SELECT
         to_regrole($1) IS NOT NULL AS app_exists,
         to_regrole($2) IS NOT NULL AS migrator_exists,
         CASE WHEN to_regrole($1) IS NOT NULL THEN pg_has_role(current_user, $1, 'MEMBER') ELSE false END AS can_set_app,
         CASE WHEN to_regrole($2) IS NOT NULL THEN pg_has_role(current_user, $2, 'MEMBER') ELSE false END AS can_set_migrator,
         current_user::text AS current_user`,
      [APP_ROLE, MIGRATOR_ROLE],
    )) as Array<{
      app_exists: boolean;
      migrator_exists: boolean;
      can_set_app: boolean;
      can_set_migrator: boolean;
      current_user: string;
    }>;

    connectionRole = capabilities[0]?.current_user ?? '';
    canSetRoleApp = capabilities[0]?.can_set_app ?? false;
    canSetRoleMigrator = capabilities[0]?.can_set_migrator ?? false;

    // Conexión dedicada del rol de aplicación cuando hay credenciales en el env;
    // si no, el caso de aplicación cae a SET ROLE.
    const appCredentials = appRoleCredentials();
    if (appCredentials && appCredentials.username !== connectionRole) {
      appDataSource = new DataSource({
        type: 'postgres',
        host: process.env['DB_HOST'] ?? 'localhost',
        port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
        username: appCredentials.username,
        password: appCredentials.password,
        database: process.env['DB_NAME'] ?? 'iwana',
        entities: [],
        migrations: [],
        synchronize: false,
        logging: false,
        extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
      });
      await appDataSource.initialize();
      appRunner = appDataSource.createQueryRunner();
      await appRunner.connect();
      await appRunner.query(`SET search_path TO "${SCHEMA}"`);
    }
  });

  afterAll(async () => {
    if (appRunner) {
      await appRunner.release();
    }
    if (appDataSource?.isInitialized) {
      await appDataSource.destroy();
    }
    if (runner) {
      await runner.release();
    }

    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('el rol de aplicación no puede mutar fijando el GUC de mantenimiento', async () => {
    let outcome: UpdateOutcome;
    if (appRunner) {
      // Conexión dedicada con las credenciales del rol de aplicación.
      outcome = await attemptUpdate(appRunner, true);
    } else if (canSetRoleApp) {
      // Sin credenciales de app: SET ROLE sobre la conexión de migración.
      await runner.query(`SET ROLE ${APP_ROLE}`);
      try {
        outcome = await attemptUpdate(runner, true);
      } finally {
        await runner.query(`RESET ROLE`);
      }
    } else {
      throw new Error(
        `Sin credenciales de ${APP_ROLE} ni SET ROLE disponible (conector: ${connectionRole}): el caso de aplicación no se puede ejercitar en este entorno.`,
      );
    }

    expect(outcome).toMatchObject({ rejected: true, sqlState: INSUFFICIENT_PRIVILEGE });

    const rows = (await runner.query(
      `SELECT new_value->>'fullName' AS name FROM audit_logs WHERE id = $1`,
      [rowId],
    )) as Array<{ name: string }>;
    expect(rows[0]?.name).toBe('valor-sintetico-pre-redaccion');
  });

  it('el rol de mantenimiento puede mutar con el GUC (redacción de PII sigue posible)', async () => {
    let outcome: UpdateOutcome;
    if (connectionRole === MIGRATOR_ROLE) {
      // El conector ya es iwana_migrator: sin SET ROLE.
      outcome = await attemptUpdate(runner, true);
    } else if (canSetRoleMigrator) {
      await runner.query(`SET ROLE ${MIGRATOR_ROLE}`);
      try {
        outcome = await attemptUpdate(runner, true);
      } finally {
        await runner.query(`RESET ROLE`);
      }
    } else {
      throw new Error(
        `Sin credenciales de ${MIGRATOR_ROLE} ni SET ROLE disponible (conector: ${connectionRole}): el caso de mantenimiento no se puede ejercitar en este entorno.`,
      );
    }

    expect(outcome.rejected).toBe(false);

    const rows = (await runner.query(
      `SELECT new_value->>'fullName' AS name FROM audit_logs WHERE id = $1`,
      [rowId],
    )) as Array<{ name: string }>;
    expect(rows[0]?.name).toBe('[REDACTADO]');
  });

  it('sin el GUC, el rol de mantenimiento tampoco puede mutar', async () => {
    let outcome: UpdateOutcome;
    if (connectionRole === MIGRATOR_ROLE) {
      outcome = await attemptUpdate(runner, false);
    } else if (canSetRoleMigrator) {
      await runner.query(`SET ROLE ${MIGRATOR_ROLE}`);
      try {
        outcome = await attemptUpdate(runner, false);
      } finally {
        await runner.query(`RESET ROLE`);
      }
    } else {
      throw new Error(
        `Sin credenciales de ${MIGRATOR_ROLE} ni SET ROLE disponible (conector: ${connectionRole}): el caso de mantenimiento no se puede ejercitar en este entorno.`,
      );
    }

    expect(outcome).toMatchObject({ rejected: true, sqlState: INSUFFICIENT_PRIVILEGE });
  });
});
