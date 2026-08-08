import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../db-credentials';

/**
 * INVARIANTE DE PRIVILEGIOS SOBRE EL AUDIT TRAIL (S-6 / SEC-04).
 *
 * ─── Por qué existe este spec ────────────────────────────────────────────────
 *
 * Al verificar el cierre de S-6 se descubrió que lo que realmente impide al rol
 * de aplicación mutar el audit trail **no es el trigger de inmutabilidad, es el
 * GRANT**: la migración 015 (SEC-04) nunca le concedió `UPDATE`, así que la
 * sentencia muere por permiso de tabla ANTES de que el trigger llegue a
 * evaluarse. El trigger endurecido de las migraciones 111 (tenant) y 024
 * (public) —que exige pertenencia a `iwana_migrator` además del GUC— es la
 * SEGUNDA capa, no la primera.
 *
 * El problema es que ese invariante no lo vigilaba nada. Si un rol nuevo
 * —reporting, analytics, un rol de aplicación futuro— recibe `UPDATE`,
 * `DELETE` o `TRUNCATE` sobre una tabla de auditoría, la defensa principal
 * desaparece en silencio y ninguna otra prueba de la suite falla. Este spec
 * convierte esa circunstancia afortunada en una propiedad verificada, y es lo
 * que hace defendible la clasificación de S-6 como Baja: sin él, la
 * clasificación caduca en cuanto alguien toque los GRANT.
 *
 * `TRUNCATE` entra en el conjunto vigilado junto a `UPDATE`/`DELETE` porque no
 * dispara triggers de fila: un rol con TRUNCATE borra el trail entero sin que
 * el guard de la 111/024 tenga ocasión de opinar.
 *
 * ─── Exención de superusuario: declarada, no olvidada ────────────────────────
 *
 * El filtro `NOT rolsuper` excluye a los superusuarios **a propósito**. Un
 * superusuario:
 *   1. tiene todos los privilegios de tabla por definición;
 *   2. es miembro implícito de todo rol, así que `pg_has_role(current_user,
 *      'iwana_migrator', 'MEMBER')` —la condición del guard endurecido de la
 *      111/024— lo deja atravesar la escotilla de mantenimiento; y
 *   3. puede desactivar triggers (`ALTER TABLE ... DISABLE TRIGGER`) o
 *      reescribir la función del guard.
 *
 * El audit trail **no es inmutable frente a un superusuario, y ningún diseño
 * dentro de la base lo hará**. La mitigación de ese escalón vive fuera de
 * PostgreSQL (custodia de credenciales de bootstrap, acceso al host, exportación
 * del trail a almacenamiento externo). Un test que fingiera cubrirlo daría una
 * garantía falsa, que es peor que una garantía ausente porque nadie la revisa.
 *
 * Los roles predefinidos `pg_*` también quedan fuera: no tienen LOGIN y no son
 * un principal por sí mismos. Conceder pertenencia a uno de ellos (p. ej.
 * `pg_write_all_data`) **sí** queda cubierto, porque el privilegio heredado
 * aflora en el rol miembro, que sí se inspecciona.
 *
 * ─── Alcance de la exploración ───────────────────────────────────────────────
 *
 * Se recorre la flota completa, no una muestra: `public.platform_audit_logs`
 * más `<schema>.audit_logs` de **todos** los tenants registrados en
 * `public.tenants`, sea cual sea su estado (ACTIVE, SUSPENDED,
 * MARKED_FOR_DELETION). El invariante es por schema y un solo tenant
 * desalineado basta para romperlo.
 *
 * `public.tenants` —y no el catálogo a secas— es lo que define el trail de
 * registro: un schema con `audit_logs` que no figura en el registro no es
 * alcanzable por la aplicación (que resuelve el schema desde `public.tenants`)
 * y es, en la práctica, un fixture efímero de otra suite de integración. Las
 * suites 075 y 111 crean schemas de usar y tirar y **conceden UPDATE a
 * `iwana_app` a propósito**, para que sea el trigger —y no el GRANT— quien
 * decida en el caso que ellas prueban; incluirlos aquí produciría un rojo sobre
 * un fixture, no sobre un defecto.
 *
 * `pnpm --filter @iwana/db test:integration -- audit-privileges`. Sin DB
 * alcanzable, `test/integration-db-probe.js` deja
 * `IWANA_DB_INTEGRATION_AVAILABLE !== 'true'` y la suite hace `describe.skip`
 * con warning (no verde silencioso).
 */

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

/**
 * Único rol no-superusuario autorizado a mutar auditoría: es el dueño de las
 * tablas (015) y el principal bajo el que corre la redacción retroactiva de PII
 * de la migración 110.
 *
 * Añadir un rol a esta allowlist NO es un ajuste de test: degrada S-6 de Baja a
 * su severidad original y exige decisión escrita del orquestador (AI-EM-ARCH).
 * La respuesta correcta ante un fallo de este spec es, casi siempre, revocar el
 * privilegio en la base.
 */
const MAINTENANCE_ROLE = 'iwana_migrator';
const ALLOWED_MUTATING_ROLES: readonly string[] = [MAINTENANCE_ROLE];

/** Privilegios que permiten alterar o destruir el trail. */
const MUTATING_PRIVILEGES = ['UPDATE', 'DELETE', 'TRUNCATE'] as const;

const APPLY_LEAST_PRIVILEGE = 'scripts/db/apply-least-privilege.sql';

if (!dbAvailable) {
  console.warn(
    '[audit-privileges] describe.skip activo — sin PostgreSQL real; el invariante de privilegios del audit trail NO se valida y la clasificación de S-6 como Baja queda sin respaldo en esta corrida.',
  );
}

interface AuditSurface {
  schemaName: string;
  tableName: string;
}

interface PrivilegeRow {
  rolname: string;
  schema_name: string;
  table_name: string;
  upd: boolean;
  del: boolean;
  trunc: boolean;
}

interface RoleRow {
  rolname: string;
  rolsuper: boolean;
}

/** `schema.tabla`, la forma en que se nombra una superficie en los mensajes. */
function surfaceName(schemaName: string, tableName: string): string {
  return `${schemaName}.${tableName}`;
}

/** Privilegios de mutación efectivamente concedidos en una fila del catálogo. */
function grantedPrivileges(row: PrivilegeRow): string[] {
  const granted: string[] = [];
  if (row.upd) granted.push('UPDATE');
  if (row.del) granted.push('DELETE');
  if (row.trunc) granted.push('TRUNCATE');
  return granted;
}

describeWithDb('Invariante de privilegios sobre el audit trail — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  let surfaces: AuditSurface[] = [];
  let privilegeRows: PrivilegeRow[] = [];
  let inspectedRoles: RoleRow[] = [];
  let excludedRoles: RoleRow[] = [];
  let registeredTenantSchemas: string[] = [];
  let tenantsWithoutAuditTable: string[] = [];

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
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    runner = dataSource.createQueryRunner();
    await runner.connect();

    // Flota completa: todos los tenants del registro, sin filtrar por estado.
    // Un SUSPENDED o un MARKED_FOR_DELETION retiene su trail y su schema, así
    // que un GRANT indebido ahí rompe el invariante igual que en un ACTIVE.
    const tenantRows = (await runner.query(
      `SELECT schema_name FROM public.tenants ORDER BY schema_name`,
    )) as Array<{ schema_name: string }>;
    registeredTenantSchemas = tenantRows.map((row) => row.schema_name);

    // Superficies reales del trail de registro. El parámetro evita interpolar
    // nombres de schema en la sentencia.
    const surfaceRows = (await runner.query(
      `SELECT n.nspname AS schema_name, c.relname AS table_name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND (
                (n.nspname = 'public' AND c.relname = 'platform_audit_logs')
             OR (c.relname = 'audit_logs' AND n.nspname = ANY($1::text[]))
          )
        ORDER BY n.nspname, c.relname`,
      [registeredTenantSchemas],
    )) as Array<{ schema_name: string; table_name: string }>;
    surfaces = surfaceRows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
    }));

    const coveredSchemas = new Set(surfaces.map((surface) => surface.schemaName));
    tenantsWithoutAuditTable = registeredTenantSchemas.filter(
      (schema) => !coveredSchemas.has(schema),
    );

    // Producto (rol no-superusuario × superficie) resuelto por el propio motor:
    // `has_table_privilege` ya contempla grants directos, heredados por
    // pertenencia a otro rol y concedidos a PUBLIC.
    privilegeRows = (await runner.query(
      `SELECT r.rolname,
              n.nspname AS schema_name,
              c.relname AS table_name,
              has_table_privilege(r.oid, c.oid, 'UPDATE')   AS upd,
              has_table_privilege(r.oid, c.oid, 'DELETE')   AS del,
              has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS trunc
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN pg_roles r
        WHERE c.relkind = 'r'
          AND (
                (n.nspname = 'public' AND c.relname = 'platform_audit_logs')
             OR (c.relname = 'audit_logs' AND n.nspname = ANY($1::text[]))
          )
          AND NOT starts_with(r.rolname, 'pg_')
          AND NOT r.rolsuper
        ORDER BY n.nspname, c.relname, r.rolname`,
      [registeredTenantSchemas],
    )) as PrivilegeRow[];

    const roleRows = (await runner.query(
      `SELECT rolname, rolsuper FROM pg_roles ORDER BY rolname`,
    )) as RoleRow[];
    inspectedRoles = roleRows.filter((role) => !role.rolname.startsWith('pg_') && !role.rolsuper);
    excludedRoles = roleRows.filter((role) => role.rolname.startsWith('pg_') || role.rolsuper);
  });

  afterAll(async () => {
    if (runner) {
      await runner.release();
    }
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('la exploración cubre la flota completa y no queda vacía', () => {
    // Sin esta comprobación, un fallo de la consulta de superficies dejaría los
    // dos asertos siguientes recorriendo un conjunto vacío: verdes por vacuidad.
    const scanned = surfaces.map((surface) => surfaceName(surface.schemaName, surface.tableName));
    console.log(
      `[audit-privileges] superficies inspeccionadas (${scanned.length}): ${scanned.join(', ')} | tenants registrados: ${registeredTenantSchemas.length} | roles no-superusuario inspeccionados: ${inspectedRoles.map((role) => role.rolname).join(', ')}`,
    );

    if (!scanned.includes('public.platform_audit_logs')) {
      throw new Error(
        [
          'La exploración no encontró public.platform_audit_logs.',
          '',
          'QUÉ SE ROMPE: los asertos de este spec recorren el conjunto de superficies;',
          'si ese conjunto llega vacío o incompleto, pasan en verde por vacuidad y el',
          'invariante deja de vigilar nada sin que nadie se entere.',
          '',
          'QUÉ HACER: comprobar que la base está migrada (`pnpm db:migrate:all`) antes de',
          'interpretar cualquier resultado de esta suite.',
        ].join('\n'),
      );
    }

    // Todo tenant del registro con schema aprovisionado tiene que estar dentro.
    // Si alguno queda fuera, la exploración se ha estrechado y el invariante
    // pasaría a cubrir una muestra en vez de la flota.
    if (tenantsWithoutAuditTable.length > 0) {
      throw new Error(
        [
          `${tenantsWithoutAuditTable.length} tenant(s) del registro sin tabla de auditoría inspeccionable:`,
          '',
          tenantsWithoutAuditTable.map((schema) => `  - ${schema}.audit_logs (ausente)`).join('\n'),
          '',
          'QUÉ SE ROMPE: el invariante es por schema. Un tenant registrado en',
          '`public.tenants` cuyo `audit_logs` no existe queda fuera de la exploración, así',
          'que este spec pasaría a cubrir una muestra en vez de la flota completa.',
          '',
          'QUÉ HACER: distinguir el caso antes de tocar nada.',
          '  - Tenant a medio aprovisionar: correr `pnpm --filter @iwana/db migration:tenant:run`',
          '    y repetir. La cadena tenant crea `audit_logs`.',
          '  - Fila huérfana de una suite de integración que abortó (r4_r2_4 inserta y borra',
          '    su tenant en afterAll): retirar la fila del registro.',
          '  - Ninguna de las dos: es un tenant de la flota sin trail de auditoría. Escalar',
          '    al orquestador AI-EM-ARCH antes de seguir; no silenciar este aserto.',
        ].join('\n'),
      );
    }

    // Al menos un rol no-superusuario que inspeccionar: si la base no tiene los
    // roles least-privilege (SEC-04 sin aplicar), este spec no prueba nada.
    if (inspectedRoles.length === 0) {
      throw new Error(
        [
          'No hay ningún rol no-superusuario que inspeccionar en esta base.',
          '',
          'SEC-04 no está aplicado: sin `iwana_app` ni `iwana_migrator` el invariante no',
          'tiene sujeto y un verde aquí no significaría nada.',
          `QUÉ HACER: aplicar los roles least-privilege antes de correr la suite: ${APPLY_LEAST_PRIVILEGE}`,
        ].join('\n'),
      );
    }

    // Una superficie por tenant registrado, más la de plataforma.
    expect(scanned.length).toBe(registeredTenantSchemas.length + 1);
  });

  it('ningún rol fuera del de mantenimiento puede mutar el audit trail', () => {
    const offenders = privilegeRows
      .filter((row) => !ALLOWED_MUTATING_ROLES.includes(row.rolname))
      .filter((row) => grantedPrivileges(row).length > 0);

    if (offenders.length > 0) {
      const detail = offenders
        .map(
          (row) =>
            `  - ${row.rolname} -> ${surfaceName(row.schema_name, row.table_name)} [${grantedPrivileges(row).join(', ')}]`,
        )
        .join('\n');
      const revokes = offenders
        .map(
          (row) =>
            `  REVOKE ${MUTATING_PRIVILEGES.join(', ')} ON TABLE ${surfaceName(row.schema_name, row.table_name)} FROM ${row.rolname};`,
        )
        .join('\n');

      throw new Error(
        [
          `INVARIANTE DE PRIVILEGIOS DEL AUDIT TRAIL ROTO — ${offenders.length} concesión(es) de mutación fuera de "${MAINTENANCE_ROLE}":`,
          '',
          detail,
          '',
          'QUÉ SE ROMPE: la defensa principal del anti-repudio (S-6) no es el trigger de',
          'inmutabilidad, es el GRANT. Sin UPDATE/DELETE/TRUNCATE la sentencia del rol muere',
          'por permiso de tabla antes de que el trigger de las migraciones 111/024 se evalúe.',
          'Con el privilegio concedido, ese rol puede alterar o destruir el registro de las',
          'acciones que él mismo ejecuta, y el trail deja de ser evidencia frente a repudio.',
          '',
          'QUÉ HACER: revocar. Es la respuesta correcta salvo excepción justificada:',
          revokes,
          '',
          `Si el privilegio reapareció solo, revisar ${APPLY_LEAST_PRIVILEGE}: concede DML amplio`,
          'sobre ALL TABLES del schema y re-endurece las tablas de auditoría a SELECT/INSERT',
          'inmediatamente después; un schema aprovisionado después de ese re-endurecimiento',
          'hereda el GRANT amplio hasta que el script se vuelve a aplicar.',
          '',
          `LA ALTERNATIVA (añadir el rol a ALLOWED_MUTATING_ROLES en ${'audit-privileges.invariant.integration.spec.ts'})`,
          'degrada S-6 de Baja a su severidad original y requiere decisión escrita del',
          'orquestador AI-EM-ARCH. No es un ajuste de test.',
        ].join('\n'),
      );
    }

    expect(offenders).toEqual([]);
  });

  it(`"${MAINTENANCE_ROLE}" conserva el privilegio de mutación en todas las superficies`, () => {
    const maintenanceRoleExists = inspectedRoles.some((role) => role.rolname === MAINTENANCE_ROLE);
    if (!maintenanceRoleExists) {
      throw new Error(
        [
          `El rol de mantenimiento "${MAINTENANCE_ROLE}" no existe en esta base.`,
          '',
          'SEC-04 no está aplicado, así que el invariante no se puede verificar y la',
          'clasificación de S-6 como Baja no tiene respaldo en este entorno.',
          `Aplicar los roles least-privilege antes de correr esta suite: ${APPLY_LEAST_PRIVILEGE}`,
        ].join('\n'),
      );
    }

    const gaps = surfaces
      .map((surface) => {
        const row = privilegeRows.find(
          (candidate) =>
            candidate.rolname === MAINTENANCE_ROLE &&
            candidate.schema_name === surface.schemaName &&
            candidate.table_name === surface.tableName,
        );
        const granted = row ? grantedPrivileges(row) : [];
        const missing = MUTATING_PRIVILEGES.filter((privilege) => !granted.includes(privilege));
        return { surface: surfaceName(surface.schemaName, surface.tableName), missing };
      })
      .filter((entry) => entry.missing.length > 0);

    if (gaps.length > 0) {
      const detail = gaps
        .map(
          (entry) =>
            `  - ${MAINTENANCE_ROLE} -> ${entry.surface} [falta: ${entry.missing.join(', ')}]`,
        )
        .join('\n');

      throw new Error(
        [
          `INVARIANTE DE PRIVILEGIOS DEL AUDIT TRAIL ROTO — "${MAINTENANCE_ROLE}" perdió privilegio en ${gaps.length} superficie(s):`,
          '',
          detail,
          '',
          'QUÉ SE ROMPE: la redacción retroactiva de PII (migración 110) corre bajo el rol de',
          'mantenimiento; sin estos privilegios deja de ser posible. Y el guard endurecido de',
          'las migraciones 111/024 exige pertenencia a ese mismo rol, así que el mantenimiento',
          'legítimo del trail se queda sin ninguna vía: ni por privilegio de tabla ni por guard.',
          '',
          `QUÉ HACER: re-aplicar ${APPLY_LEAST_PRIVILEGE} sobre la base, que es donde se`,
          'concede. NO conceder el privilegio a mano a otro rol para desatascar la 110: eso',
          'reabre exactamente el hueco que el aserto anterior vigila.',
        ].join('\n'),
      );
    }

    expect(gaps).toEqual([]);
  });

  it('los superusuarios quedan fuera del invariante por diseño, y solo ellos', () => {
    // Contrapartida ejecutable de la exención documentada en la cabecera: lo que
    // el filtro deja fuera tiene que ser exactamente superusuarios y roles
    // predefinidos `pg_*`. Si mañana el filtro se ensancha y empieza a excluir a
    // un rol de aplicación, el invariante se vaciaría en silencio; este aserto
    // lo impide.
    const wronglyExcluded = excludedRoles.filter(
      (role) => !role.rolsuper && !role.rolname.startsWith('pg_'),
    );
    expect(wronglyExcluded).toEqual([]);

    const superusers = excludedRoles.filter((role) => role.rolsuper).map((role) => role.rolname);
    console.log(
      `[audit-privileges] exentos por superusuario (${superusers.length}): ${superusers.join(', ') || '(ninguno)'} — el audit trail NO es inmutable frente a ellos; la mitigación es custodia de credenciales, no un control en la base.`,
    );

    // Ningún rol inspeccionado puede ser superusuario: si lo fuera, el aserto de
    // ofensores lo marcaría siempre y el invariante se volvería inmanejable.
    expect(inspectedRoles.every((role) => !role.rolsuper)).toBe(true);
  });
});
