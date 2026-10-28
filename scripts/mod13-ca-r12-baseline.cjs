#!/usr/bin/env node
'use strict';

/**
 * Generador determinista E-3/E-4 y evidencia E-2/E-5 para MOD13 CA-R12.
 * Solo acepta la base desechable E-1; no consulta ni conecta a dbiw.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXPECTED = {
  host: '127.0.0.1',
  port: 5434,
  database: 'iwana_it_mod13_ca_r12_e1',
  username: 'mod13_ca_r12',
  connectionFile:
    process.env['MOD13_CA_R12_CONNECTIONS_FILE'] ??
    path.join(process.env['TEMP'] ?? '', 'iwana-mod13-ca-r12-e1', 'connections.json'),
};
const SCHEMAS = {
  e5: 'tenant_mod13_ca_r12_e5',
};
const CLONE_DATABASES = {
  e6: 'iwana_it_mod13_ca_r12_e6',
  e7: 'iwana_it_mod13_ca_r12_e7',
};
const TENANT_ID = '13000000-0000-4000-8000-000000000001';
const ACTOR_ID = '13000000-0000-4000-8000-000000000002';
const FIXED_TIME = '2026-10-27T12:00:00.000Z';
const MIGRATION_165_NAME = 'CreateRouterInterfacesAndIpv4Addresses1650000000000';
const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const OUTPUT = path.resolve('docs/quality/evidence-mod13-ca-r12-e1/e2-e5.json');

function assertSafeIdentifier(name) {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(name)) throw new Error('Schema fixture no permitido.');
}

function uuid(sequence, namespace = 0) {
  const tail = sequence.toString(16).padStart(12, '0');
  const middle = namespace.toString(16).padStart(4, '0');
  return `13000000-0000-4${middle.slice(0, 3)}-8000-${tail}`;
}

function classId(MigrationClass) {
  return new MigrationClass().name ?? MigrationClass.name;
}

function loadTarget() {
  if (!fs.existsSync(EXPECTED.connectionFile)) {
    throw new Error('No se encuentra el archivo local de conexiones E-1.');
  }
  const connectionJson = fs.readFileSync(EXPECTED.connectionFile, 'utf8').replace(/^\uFEFF/u, '');
  const connections = JSON.parse(connectionJson);
  const pg = connections.postgres;
  if (
    pg?.host !== EXPECTED.host ||
    Number(pg?.port) !== EXPECTED.port ||
    pg?.database !== EXPECTED.database ||
    pg?.username !== EXPECTED.username ||
    typeof pg?.password !== 'string' ||
    pg.password.length < 16
  ) {
    throw new Error('El destino no coincide con el PostgreSQL desechable E-1 autorizado.');
  }
  const redis = connections.redis;
  if (
    redis?.host !== EXPECTED.host ||
    Number(redis?.port) !== 6381 ||
    redis?.isolated !== true ||
    redis?.queuePrefix !== 'mod13_ca_r12_e1'
  ) {
    throw new Error('La configuración Redis no coincide con el entorno E-1.');
  }
  process.env['DB_HOST'] = pg.host;
  process.env['DB_PORT'] = String(pg.port);
  process.env['DB_NAME'] = pg.database;
  process.env['DB_USER'] = pg.username;
  process.env['DB_PASSWORD'] = pg.password;
  process.env['DB_MIGRATOR_USER'] = pg.username;
  process.env['DB_MIGRATOR_PASSWORD'] = pg.password;
  delete process.env['IWANA_APPLY_PII_CONTRACT'];
  delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
  return { pg, redis };
}

function buildSites() {
  return Array.from({ length: 3 }, (_, index) => ({
    id: uuid(100 + index),
    tenant_id: TENANT_ID,
    name: `Sede sintética ${String(index + 1).padStart(2, '0')}`,
    code: `SYN-${String(index + 1).padStart(2, '0')}`,
    site_type: 'OFFICE',
    country: 'CO',
    is_primary: index === 0,
    is_active: true,
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
  }));
}

function legacyLanValue(index) {
  if (index < 4) return null;
  if (index < 8) return '';
  if (index < 12) return 'ether1';
  if (index < 16) return 'ether1,ether2';
  return 'uplink principal - verificar';
}

function buildRouters(sites) {
  return Array.from({ length: 20 }, (_, index) => ({
    id: uuid(200 + index),
    tenant_id: TENANT_ID,
    name: `Router sintético ${String(index + 1).padStart(2, '0')}`,
    organization_site_id: sites[index % sites.length].id,
    commercial_node_id: null,
    management_host: `router-${String(index + 1).padStart(2, '0')}.mod13.invalid`,
    lan_interface: legacyLanValue(index),
    supported_control_methods: ['SIMPLE_QUEUE_STATIC_IP'],
    status: 'ACTIVE',
    created_by: ACTOR_ID,
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
  }));
}

function buildNetworks(routers) {
  const specs = [
    { cidr: '10.40.0.0/16', gateway: '10.40.0.1', from: '10.40.2.10', to: '10.40.2.200' },
  ];
  for (let octet = 41; octet <= 88; octet += 1) {
    specs.push({
      cidr: `10.${octet}.0.0/24`,
      gateway: `10.${octet}.0.1`,
      from: `10.${octet}.0.10`,
      to: `10.${octet}.0.49`,
    });
  }
  specs.push({ cidr: '10.89.0.0/30', gateway: '10.89.0.1', from: '10.89.0.2', to: '10.89.0.2' });
  return specs.map((spec, index) => ({
    id: uuid(300 + index),
    tenant_id: TENANT_ID,
    router_id: routers[index % routers.length].id,
    name: `Pool sintético ${String(index + 1).padStart(2, '0')}`,
    cidr: spec.cidr,
    gateway: spec.gateway,
    assignable_from: spec.from,
    assignable_to: spec.to,
    default_control_method: 'SIMPLE_QUEUE_STATIC_IP',
    status: index === 49 ? 'INACTIVE' : 'ACTIVE',
    created_by: ACTOR_ID,
    created_at: FIXED_TIME,
    updated_at: FIXED_TIME,
  }));
}

function buildAssignments(networks, routers) {
  const rows = [];
  const assignmentsPerNetwork = [80, ...Array(48).fill(40), 0];
  for (let networkIndex = 0; networkIndex < networks.length; networkIndex += 1) {
    const amount = assignmentsPerNetwork[networkIndex];
    for (let slot = 0; slot < amount; slot += 1) {
      const globalIndex = rows.length;
      let status;
      if (globalIndex < 700) status = 'RESERVED';
      else if (globalIndex < 1400) status = 'ACTIVE';
      else status = 'RELEASED';
      const address =
        networkIndex === 0
          ? `10.40.2.${String(slot + 10).padStart(1, '0')}`
          : `10.${40 + networkIndex}.0.${slot + 10}`;
      rows.push({
        id: uuid(10000 + globalIndex),
        serviceId: uuid(20000 + globalIndex),
        tenant_id: TENANT_ID,
        ipv4_network_id: networks[networkIndex].id,
        ip: address,
        status,
        released_at: status === 'RELEASED' ? FIXED_TIME : null,
        release_reason: status === 'RELEASED' ? 'SYNTHETIC_FIXTURE' : null,
        router_id: routers[networkIndex % routers.length].id,
      });
    }
  }
  if (rows.length !== 2000)
    throw new Error(`Fixture de asignaciones produjo ${rows.length}, no 2000.`);
  return rows;
}

function buildServices(assignments) {
  const rows = assignments.map((assignment, index) => {
    const status = assignment.status;
    return {
      id: assignment.serviceId,
      tenant_id: TENANT_ID,
      subscriber_id: uuid(30000 + index),
      execution_order_id: uuid(40000 + index),
      execution_order_number: `SYN-${String(index + 1).padStart(6, '0')}`,
      router_id: assignment.router_id,
      ipv4_network_id: assignment.ipv4_network_id,
      control_method: 'SIMPLE_QUEUE_STATIC_IP',
      control_params: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: `synth-${index + 1}` },
      status,
      reserved_by: ['RESERVED', 'ACTIVE'].includes(status) ? ACTOR_ID : null,
      reserved_at: ['RESERVED', 'ACTIVE'].includes(status) ? FIXED_TIME : null,
      activated_at: status === 'ACTIVE' ? FIXED_TIME : null,
      released_by: status === 'RELEASED' ? ACTOR_ID : null,
      released_at: status === 'RELEASED' ? FIXED_TIME : null,
      release_reason: status === 'RELEASED' ? 'SYNTHETIC_FIXTURE' : null,
      created_at: FIXED_TIME,
      updated_at: FIXED_TIME,
    };
  });
  for (let index = 0; index < 100; index += 1) {
    rows.push({
      id: uuid(50000 + index),
      tenant_id: TENANT_ID,
      subscriber_id: uuid(51000 + index),
      execution_order_id: uuid(52000 + index),
      execution_order_number: `SYN-C-${String(index + 1).padStart(4, '0')}`,
      router_id: assignments[0].router_id,
      ipv4_network_id: assignments[0].ipv4_network_id,
      control_method: 'SIMPLE_QUEUE_STATIC_IP',
      control_params: {
        method: 'SIMPLE_QUEUE_STATIC_IP',
        queueName: `synth-certified-${index + 1}`,
      },
      status: 'CERTIFIED',
      reserved_by: ACTOR_ID,
      reserved_at: FIXED_TIME,
      certified_by: ACTOR_ID,
      certified_at: FIXED_TIME,
      certification_evidence_id: uuid(53000 + index),
      created_at: FIXED_TIME,
      updated_at: FIXED_TIME,
    });
  }
  for (let index = 0; index < 100; index += 1) {
    rows.push({
      id: uuid(54000 + index),
      tenant_id: TENANT_ID,
      subscriber_id: uuid(55000 + index),
      execution_order_id: uuid(56000 + index),
      execution_order_number: `SYN-F-${String(index + 1).padStart(4, '0')}`,
      router_id: assignments[0].router_id,
      ipv4_network_id: assignments[0].ipv4_network_id,
      control_method: 'SIMPLE_QUEUE_STATIC_IP',
      control_params: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: `synth-failed-${index + 1}` },
      status: 'FAILED',
      failure_reason: 'SYNTHETIC_FIXTURE',
      created_at: FIXED_TIME,
      updated_at: FIXED_TIME,
    });
  }
  return rows;
}

function buildAuditRows() {
  return Array.from({ length: 50 }, (_, index) => ({
    id: uuid(60000 + index),
    tenant_id: TENANT_ID,
    user_id: ACTOR_ID,
    action: 'MOD13_SYNTHETIC_SEED',
    entity_type: 'network_router',
    entity_id: uuid(200 + (index % 20)),
    old_value: null,
    new_value: { fixture: 'mod13-ca-r12-v1', synthetic: true },
    created_at: FIXED_TIME,
  }));
}

async function insertJson(queryRunner, tableSql, columnsSql, recordSql, rows) {
  const query = `INSERT INTO ${tableSql} (${columnsSql}) SELECT ${recordSql} FROM jsonb_to_recordset($1::jsonb) AS x(${recordSql.replaceAll(', ', ', ')})`;
  return queryRunner.query(query, [JSON.stringify(rows)]);
}

async function seedLegacy(queryRunner) {
  const sites = buildSites();
  const routers = buildRouters(sites);
  const networks = buildNetworks(routers);
  const assignments = buildAssignments(networks, routers);
  const services = buildServices(assignments);
  const auditRows = buildAuditRows();

  await queryRunner.query(
    `INSERT INTO organization_sites (id, tenant_id, name, code, site_type, country, is_primary, is_active, created_at, updated_at)
     SELECT id, tenant_id, name, code, site_type, country, is_primary, is_active, created_at, updated_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, name text, code text, site_type text, country text, is_primary boolean, is_active boolean, created_at timestamptz, updated_at timestamptz)`,
    [JSON.stringify(sites)],
  );
  await queryRunner.query(
    `INSERT INTO network_routers (id, tenant_id, name, organization_site_id, commercial_node_id, management_host, lan_interface, supported_control_methods, status, created_by, created_at, updated_at)
     SELECT id, tenant_id, name, organization_site_id, commercial_node_id, management_host, lan_interface, supported_control_methods, status, created_by, created_at, updated_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, name text, organization_site_id uuid, commercial_node_id uuid, management_host text, lan_interface text, supported_control_methods varchar(40)[], status text, created_by uuid, created_at timestamptz, updated_at timestamptz)`,
    [JSON.stringify(routers)],
  );
  await queryRunner.query(
    `INSERT INTO ipv4_networks (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to, default_control_method, status, created_by, created_at, updated_at)
     SELECT id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to, default_control_method, status, created_by, created_at, updated_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, router_id uuid, name text, cidr cidr, gateway inet, assignable_from inet, assignable_to inet, default_control_method text, status text, created_by uuid, created_at timestamptz, updated_at timestamptz)`,
    [JSON.stringify(networks)],
  );
  await queryRunner.query(
    `INSERT INTO service_provisionings (id, tenant_id, subscriber_id, execution_order_id, execution_order_number, router_id, ipv4_network_id, control_method, control_params, status, reserved_by, reserved_at, certified_by, certified_at, certification_evidence_id, activated_at, released_by, released_at, release_reason, failure_reason, created_at, updated_at)
     SELECT id, tenant_id, subscriber_id, execution_order_id, execution_order_number, router_id, ipv4_network_id, control_method, control_params, status, reserved_by, reserved_at, certified_by, certified_at, certification_evidence_id, activated_at, released_by, released_at, release_reason, failure_reason, created_at, updated_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, subscriber_id uuid, execution_order_id uuid, execution_order_number text, router_id uuid, ipv4_network_id uuid, control_method text, control_params jsonb, status text, reserved_by uuid, reserved_at timestamptz, certified_by uuid, certified_at timestamptz, certification_evidence_id uuid, activated_at timestamptz, released_by uuid, released_at timestamptz, release_reason text, failure_reason text, created_at timestamptz, updated_at timestamptz)`,
    [JSON.stringify(services)],
  );
  await queryRunner.query(
    `INSERT INTO ip_assignments (id, tenant_id, ipv4_network_id, ip, service_provisioning_id, status, released_at, release_reason, created_at, updated_at)
     SELECT id, tenant_id, ipv4_network_id, ip, service_provisioning_id, status, released_at, release_reason, $2::timestamptz, $2::timestamptz
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, ipv4_network_id uuid, ip inet, service_provisioning_id uuid, status text, released_at timestamptz, release_reason text)`,
    [
      JSON.stringify(
        assignments.map(
          ({
            id,
            tenant_id,
            ipv4_network_id,
            ip,
            serviceId,
            status,
            released_at,
            release_reason,
          }) => ({
            id,
            tenant_id,
            ipv4_network_id,
            ip,
            service_provisioning_id: serviceId,
            status,
            released_at,
            release_reason,
          }),
        ),
      ),
      FIXED_TIME,
    ],
  );
  await queryRunner.query(
    `UPDATE service_provisionings service SET ip_assignment_id = assignment.id
       FROM ip_assignments assignment
      WHERE assignment.service_provisioning_id = service.id AND assignment.tenant_id = $1`,
    [TENANT_ID],
  );
  await queryRunner.query(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, old_value, new_value, created_at)
     SELECT id, tenant_id, user_id, action, entity_type, entity_id, old_value, new_value, created_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, tenant_id uuid, user_id uuid, action text, entity_type text, entity_id text, old_value jsonb, new_value jsonb, created_at timestamptz)`,
    [JSON.stringify(auditRows)],
  );

  return {
    sites,
    routers,
    networks,
    assignments,
    services,
    auditRows,
    lanInterfaceDistribution: await stateCounts(queryRunner, 'network_routers', 'lan_interface'),
    assignmentStatusCounts: await groupedStatusCounts(queryRunner, 'ip_assignments'),
    serviceStatusCounts: await groupedStatusCounts(queryRunner, 'service_provisionings'),
  };
}

async function groupedStatusCounts(queryRunner, table) {
  const allowed = new Set(['ip_assignments', 'service_provisionings']);
  if (!allowed.has(table)) throw new Error('Tabla fuera de whitelist.');
  return queryRunner.query(
    `SELECT status, COUNT(*)::int AS count FROM ${table} GROUP BY status ORDER BY status`,
  );
}

async function stateCounts(queryRunner, table, field) {
  if (table !== 'network_routers' || field !== 'lan_interface')
    throw new Error('Conteo fuera de whitelist.');
  const rows = await queryRunner.query(`
    SELECT CASE
      WHEN lan_interface IS NULL THEN 'NULL'
      WHEN lan_interface = '' THEN 'EMPTY'
      WHEN lan_interface = 'ether1' THEN 'SIMPLE'
      WHEN lan_interface LIKE 'ether%,%' THEN 'MULTI_INTERFACE_TEXT'
      ELSE 'FREE_TEXT'
    END AS state, COUNT(*)::int AS count
    FROM network_routers GROUP BY state ORDER BY state
  `);
  return rows;
}

async function referentialIntegrityCounts(queryRunner) {
  const [counts] = await queryRunner.query(`
    SELECT
      (SELECT COUNT(*)::int FROM network_routers r
        LEFT JOIN organization_sites s ON s.tenant_id = r.tenant_id AND s.id = r.organization_site_id
        WHERE r.organization_site_id IS NOT NULL AND s.id IS NULL) AS routers_without_site,
      (SELECT COUNT(*)::int FROM ipv4_networks n
        LEFT JOIN network_routers r ON r.tenant_id = n.tenant_id AND r.id = n.router_id
        WHERE r.id IS NULL) AS pools_without_router,
      (SELECT COUNT(*)::int FROM service_provisionings s
        LEFT JOIN network_routers r ON r.tenant_id = s.tenant_id AND r.id = s.router_id
        LEFT JOIN ipv4_networks n ON n.tenant_id = s.tenant_id AND n.id = s.ipv4_network_id
        WHERE r.id IS NULL OR n.id IS NULL) AS services_without_router_or_pool,
      (SELECT COUNT(*)::int FROM ip_assignments a
        LEFT JOIN service_provisionings s ON s.tenant_id = a.tenant_id AND s.id = a.service_provisioning_id
        LEFT JOIN ipv4_networks n ON n.tenant_id = a.tenant_id AND n.id = a.ipv4_network_id
        WHERE s.id IS NULL OR n.id IS NULL) AS assignments_without_service_or_pool,
      (SELECT COUNT(*)::int FROM ip_assignments a
        JOIN service_provisionings s ON s.id = a.service_provisioning_id
        WHERE s.ip_assignment_id IS DISTINCT FROM a.id) AS assignment_link_mismatches
  `);
  if (Object.values(counts).some((value) => Number(value) !== 0)) {
    throw new Error('Fixture legacy con referencias rotas o vínculos de asignación divergentes.');
  }
  return counts;
}

const LEGACY_TABLES = [
  { table: 'organization_sites', omit: null },
  { table: 'network_routers', omit: 'legacy_lan_interface_id' },
  { table: 'ipv4_networks', omit: 'interface_id' },
  { table: 'service_provisionings', omit: null },
  { table: 'ip_assignments', omit: null },
  { table: 'audit_logs', omit: null },
];

async function snapshotLegacy(queryRunner) {
  const tables = {};
  for (const { table, omit } of LEGACY_TABLES) {
    const relation = await queryRunner.query('SELECT to_regclass($1) IS NOT NULL AS present', [
      table,
    ]);
    if (relation[0]?.present !== true) throw new Error(`Falta tabla legacy requerida: ${table}`);
    const expression = omit ? `to_jsonb(record) - '${omit}'` : 'to_jsonb(record)';
    const [hashRow] = await queryRunner.query(
      `SELECT COALESCE(jsonb_agg(${expression} ORDER BY record.id)::text, '[]') AS payload FROM ${table} record`,
    );
    const [countRow] = await queryRunner.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    tables[table] = {
      count: countRow.count,
      sha256: crypto.createHash('sha256').update(hashRow.payload, 'utf8').digest('hex'),
    };
  }
  return {
    tables,
    assignmentStatusCounts: await groupedStatusCounts(queryRunner, 'ip_assignments'),
    serviceStatusCounts: await groupedStatusCounts(queryRunner, 'service_provisionings'),
    lanInterfaceDistribution: await stateCounts(queryRunner, 'network_routers', 'lan_interface'),
    referentialIntegrityCounts: await referentialIntegrityCounts(queryRunner),
  };
}

async function assertNoNewInterfaces(queryRunner) {
  const rows = await queryRunner.query(`
    SELECT
      (SELECT COUNT(*)::int FROM network_router_interfaces) AS interfaces,
      (SELECT COUNT(*)::int FROM network_router_interface_ipv4_addresses) AS addresses,
      (SELECT COUNT(*)::int FROM network_routers WHERE legacy_lan_interface_id IS NOT NULL) AS router_links,
      (SELECT COUNT(*)::int FROM ipv4_networks WHERE interface_id IS NOT NULL) AS network_links
  `);
  if (Object.values(rows[0]).some((value) => Number(value) !== 0)) {
    throw new Error('El ciclo E-5 no debe contener datos ni asociaciones nuevas antes de down().');
  }
}

function assertSnapshotsEqual(expected, actual, label) {
  for (const { table } of LEGACY_TABLES) {
    if (expected.tables[table].sha256 !== actual.tables[table].sha256) {
      throw new Error(`Huella legacy distinta en ${label}: ${table}`);
    }
    if (expected.tables[table].count !== actual.tables[table].count) {
      throw new Error(`Conteo legacy distinto en ${label}: ${table}`);
    }
  }
  if (
    JSON.stringify(expected.assignmentStatusCounts) !==
    JSON.stringify(actual.assignmentStatusCounts)
  ) {
    throw new Error(`Conteos de estados ip_assignments distintos en ${label}.`);
  }
  if (JSON.stringify(expected.serviceStatusCounts) !== JSON.stringify(actual.serviceStatusCounts)) {
    throw new Error(`Conteos de estados service_provisionings distintos en ${label}.`);
  }
  if (
    JSON.stringify(expected.referentialIntegrityCounts) !==
    JSON.stringify(actual.referentialIntegrityCounts)
  ) {
    throw new Error(`Conteos de integridad referencial distintos en ${label}.`);
  }
}

function setTenantMigrations(tenantMigrations, include165) {
  const index165 = tenantMigrations.findIndex(
    (MigrationClass) => classId(MigrationClass) === MIGRATION_165_NAME,
  );
  if (index165 < 0) throw new Error('El runner no incluye la migración 165 esperada.');
  const selected = include165
    ? tenantMigrations.slice(0, index165 + 1)
    : tenantMigrations.slice(0, index165);
  const target = require('../packages/database/dist/migrations/tenant/runner.js').TENANT_MIGRATIONS;
  target.splice(0, target.length, ...selected);
  return { selected, index165 };
}

async function createTenantSchema(baseDataSource, createTenantDataSource, schemaName) {
  assertSafeIdentifier(schemaName);
  const baseRunner = baseDataSource.createQueryRunner();
  try {
    const exists = await baseRunner.query(
      'SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS present',
      [schemaName],
    );
    if (exists[0]?.present)
      throw new Error(`El schema ${schemaName} ya existe; use --reset de forma explícita.`);
    await baseRunner.query(`CREATE SCHEMA "${schemaName}"`);
  } finally {
    await baseRunner.release();
  }
  const tenantSlug = schemaName.replaceAll('_', '-');
  await baseDataSource.query(
    `INSERT INTO public.tenants (id, name, slug, schema_name, status, settings, contact_email, max_subscribers, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', '{}'::jsonb, $5, 5000, $6, $6)`,
    [
      TENANT_ID,
      'MOD13 CA-R12 tenant sintético',
      tenantSlug,
      schemaName,
      'mod13-ca-r12@example.invalid',
      FIXED_TIME,
    ],
  );
  const dataSource = createTenantDataSource(baseDataSource, schemaName, `mod13-${schemaName}`);
  await dataSource.initialize();
  return dataSource;
}

async function getMigrationNames(queryRunner) {
  return queryRunner.query('SELECT name FROM typeorm_migrations ORDER BY id');
}

async function applyTenantUp(
  baseDataSource,
  tenantMigrations,
  createTenantDataSource,
  applyTenantMigrationsInOrder,
  schema,
  include165,
) {
  const { selected } = setTenantMigrations(tenantMigrations, include165);
  const dataSource = await createTenantSchema(baseDataSource, createTenantDataSource, schema);
  await applyTenantMigrationsInOrder(dataSource, {
    ...process.env,
    IWANA_APPLY_PII_CONTRACT: 'true',
  });
  const runner = dataSource.createQueryRunner();
  try {
    const applied = await getMigrationNames(runner);
    const expectedNames = selected.map(classId);
    const appliedNames = applied.map((row) => row.name);
    if (JSON.stringify(expectedNames) !== JSON.stringify(appliedNames)) {
      const missing = expectedNames.filter((name) => !appliedNames.includes(name));
      const unexpected = appliedNames.filter((name) => !expectedNames.includes(name));
      throw new Error(
        `Migraciones tenant incompletas: applied=${appliedNames.length}; missing=${missing.join(',')}; unexpected=${unexpected.join(',')}`,
      );
    }
    return { dataSource, appliedCount: applied.length, appliedNames };
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
}

async function run165Down(dataSource, tenantMigrations) {
  const migration = new (tenantMigrations.find(
    (MigrationClass) => classId(MigrationClass) === MIGRATION_165_NAME,
  ))();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await assertNoNewInterfaces(runner);
    await runner.startTransaction();
    await migration.down(runner);
    await runner.query('DELETE FROM typeorm_migrations WHERE name = $1', [MIGRATION_165_NAME]);
    await runner.commitTransaction();
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

async function addPostE5LocalAddress(dataSource, schemaLabel) {
  const runner = dataSource.createQueryRunner();
  const activeInterfaceId = uuid(70000, 1);
  const inactiveInterfaceId = uuid(70001, 1);
  const firstRouterId = uuid(200);
  const secondRouterId = uuid(201);
  try {
    await runner.query(
      `INSERT INTO network_router_interfaces (id, tenant_id, router_id, name, kind, status, created_by, created_at, updated_at)
       VALUES
         ($1, $2, $3, 'fixture-active-interface', 'PHYSICAL', 'ACTIVE', $4, $5, $5),
         ($6, $2, $7, 'fixture-inactive-interface', 'PHYSICAL', 'INACTIVE', $4, $5, $5)`,
      [
        activeInterfaceId,
        TENANT_ID,
        firstRouterId,
        ACTOR_ID,
        FIXED_TIME,
        inactiveInterfaceId,
        secondRouterId,
      ],
    );
    await runner.query(
      `INSERT INTO network_router_interface_ipv4_addresses (id, tenant_id, router_id, interface_id, address, created_by, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, '10.40.2.100/32', $5, $6, $6),
         ($7, $2, $8, $9, '10.40.2.101/32', $5, $6, $6)`,
      [
        uuid(71000, 1),
        TENANT_ID,
        firstRouterId,
        activeInterfaceId,
        ACTOR_ID,
        FIXED_TIME,
        uuid(71001, 1),
        secondRouterId,
        inactiveInterfaceId,
      ],
    );
    const [count] = await runner.query(
      'SELECT COUNT(*)::int AS count FROM network_router_interface_ipv4_addresses',
    );
    if (Number(count.count) !== 2)
      throw new Error(`Clon ${schemaLabel} no conservó las dos direcciones locales sintéticas.`);
  } finally {
    await runner.release();
  }
}

async function resetKnownSchemas(baseDataSource, requested) {
  if (!requested) return;
  const row = await baseDataSource.query('SELECT current_database() AS database');
  if (row[0]?.database !== EXPECTED.database)
    throw new Error('Refusing --reset fuera de la base E-1.');
  const runner = baseDataSource.createQueryRunner();
  try {
    for (const schema of Object.values(SCHEMAS)) {
      assertSafeIdentifier(schema);
      await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await runner.query('DELETE FROM public.tenants WHERE schema_name = $1', [SCHEMAS.e5]);
  } finally {
    await runner.release();
  }
}

async function resetTemplateDatabases(DataSource, options, requested) {
  if (!requested) return;
  const admin = new DataSource({
    ...options,
    database: 'postgres',
    name: 'mod13-ca-r12-reset-admin',
    entities: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
  });
  await admin.initialize();
  try {
    for (const database of Object.values(CLONE_DATABASES)) {
      if (!/^iwana_it_mod13_ca_r12_e[67]$/u.test(database))
        throw new Error('Nombre de base clon fuera de whitelist.');
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
      if (exists.length) await admin.query(`DROP DATABASE "${database}"`);
    }
  } finally {
    await admin.destroy();
  }
}

async function createTemplateClones(DataSource, options, createTenantDataSource, expectedSnapshot) {
  const admin = new DataSource({
    ...options,
    database: 'postgres',
    name: 'mod13-ca-r12-template-admin',
    entities: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
  });
  await admin.initialize();
  try {
    for (const database of Object.values(CLONE_DATABASES)) {
      if (!/^iwana_it_mod13_ca_r12_e[67]$/u.test(database))
        throw new Error('Nombre de base clon fuera de whitelist.');
      await admin.query(`CREATE DATABASE "${database}" TEMPLATE "${EXPECTED.database}"`);
    }
  } finally {
    await admin.destroy();
  }

  const evidence = {};
  for (const [clone, database] of Object.entries(CLONE_DATABASES)) {
    const cloneBase = new DataSource({
      ...options,
      database,
      name: `mod13-ca-r12-${clone}-base`,
      entities: [],
      migrations: [],
      migrationsRun: false,
      synchronize: false,
    });
    await cloneBase.initialize();
    const tenantDataSource = createTenantDataSource(
      cloneBase,
      SCHEMAS.e5,
      `mod13-ca-r12-${clone}-tenant`,
    );
    await tenantDataSource.initialize();
    try {
      const runner = tenantDataSource.createQueryRunner();
      try {
        const cloneSnapshot = await snapshotLegacy(runner);
        assertSnapshotsEqual(expectedSnapshot, cloneSnapshot, `${clone} en DB clonada`);
      } finally {
        await runner.release();
      }
      await addPostE5LocalAddress(tenantDataSource, clone);
      evidence[clone] = {
        database,
        schema: SCHEMAS.e5,
        tenantId: TENANT_ID,
        legacyHashesMatchE5: true,
        localInterfaces: 2,
        localAddresses: 2,
        redisPrefix: `mod13_ca_r12_${clone}`,
      };
    } finally {
      await tenantDataSource.destroy();
      await cloneBase.destroy();
    }
  }
  return evidence;
}

async function run() {
  const target = loadTarget();
  const reset = process.argv.includes('--reset');
  const { AppDataSource } = require('../packages/database/dist/data-source.js');
  const { DataSource } = require('../packages/database/node_modules/typeorm');
  const runnerModule = require('../packages/database/dist/migrations/tenant/runner.js');
  const { TENANT_MIGRATIONS, createTenantDataSource, applyTenantMigrationsInOrder } = runnerModule;
  const tenantMigrations = [...TENANT_MIGRATIONS];
  const { pg } = target;
  const dbSource = AppDataSource;
  if (
    dbSource.options.host !== EXPECTED.host ||
    Number(dbSource.options.port) !== EXPECTED.port ||
    dbSource.options.database !== EXPECTED.database ||
    dbSource.options.username !== EXPECTED.username ||
    dbSource.options.password !== pg.password
  ) {
    throw new Error('AppDataSource no coincide con E-1; se cancela antes de mutar.');
  }
  await dbSource.initialize();
  try {
    const [db] = await dbSource.query(
      'SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS server_address, inet_server_port() AS server_port',
    );
    if (
      db.database !== EXPECTED.database ||
      db.username !== EXPECTED.username ||
      !db.server_address ||
      Number(db.server_port) !== 5432
    ) {
      throw new Error('La conexión efectiva no apunta al PostgreSQL aislado esperado.');
    }
    const publicApplied = await dbSource.query(
      'SELECT COUNT(*)::int AS count FROM public.typeorm_migrations',
    );
    const expectedPublicCount = Array.isArray(dbSource.options.migrations)
      ? dbSource.options.migrations.length
      : 0;
    if (Number(publicApplied[0]?.count) !== expectedPublicCount || expectedPublicCount === 0) {
      throw new Error(
        `Bootstrap public incompleto: aplicado=${publicApplied[0]?.count}, esperado=${expectedPublicCount}.`,
      );
    }
    const publicMigrationCount = Number(publicApplied[0].count);
    await resetTemplateDatabases(DataSource, dbSource.options, reset);
    await resetKnownSchemas(dbSource, reset);

    const e5Build = await applyTenantUp(
      dbSource,
      tenantMigrations,
      createTenantDataSource,
      applyTenantMigrationsInOrder,
      SCHEMAS.e5,
      false,
    );
    const e5Runner = e5Build.dataSource.createQueryRunner();
    let seedSummary;
    let checkpoints;
    try {
      seedSummary = await seedLegacy(e5Runner);
      const pre165 = await snapshotLegacy(e5Runner);
      const up1 = await applyTenantUpMigrationOnly(
        e5Runner,
        tenantMigrations,
        e5Build.dataSource,
        applyTenantMigrationsInOrder,
      );
      const afterUp1 = await snapshotLegacy(e5Runner);
      assertSnapshotsEqual(pre165, afterUp1, 'primer up');
      await run165Down(e5Build.dataSource, tenantMigrations);
      const afterDown = await snapshotLegacy(e5Runner);
      assertSnapshotsEqual(pre165, afterDown, 'down permitido');
      const up2 = await applyTenantUpMigrationOnly(
        e5Runner,
        tenantMigrations,
        e5Build.dataSource,
        applyTenantMigrationsInOrder,
      );
      const afterUp2 = await snapshotLegacy(e5Runner);
      assertSnapshotsEqual(pre165, afterUp2, 'segundo up');
      checkpoints = {
        before165: pre165,
        afterFirstUp: afterUp1,
        afterAllowedDown: afterDown,
        afterSecondUp: afterUp2,
      };
      const applied = await getMigrationNames(e5Runner);
      if (
        applied.length !== e5Build.appliedCount + 1 ||
        applied.at(-1)?.name !== MIGRATION_165_NAME
      ) {
        throw new Error('El registro de migraciones no terminó exactamente en 165.');
      }
      await e5Runner.release();
    } catch (error) {
      if (!e5Runner.isReleased) await e5Runner.release();
      throw error;
    }

    await e5Build.dataSource.destroy();
    const templateOptions = { ...dbSource.options, entities: [], migrations: [] };
    await dbSource.destroy();
    const cloneEvidence = await createTemplateClones(
      DataSource,
      templateOptions,
      createTenantDataSource,
      checkpoints.afterSecondUp,
    );

    const report = {
      version: 'mod13-ca-r12-baseline-v1',
      generatedAt: new Date().toISOString(),
      target: {
        host: EXPECTED.host,
        port: EXPECTED.port,
        database: EXPECTED.database,
        username: EXPECTED.username,
      },
      constraints: {
        dbiwAccessed: false,
        pii: false,
        destructiveDownFlag: false,
        syntheticSeedVersion: 1,
      },
      publicMigrationsApplied: publicMigrationCount,
      tenantMigrationCounts: {
        through164: e5Build.appliedCount,
        through165AfterCycle: e5Build.appliedCount + 1,
      },
      schema: SCHEMAS.e5,
      generatedDataCounts: {
        sites: seedSummary.sites.length,
        routers: seedSummary.routers.length,
        networks: seedSummary.networks.length,
        assignments: seedSummary.assignments.length,
        serviceProvisionings: seedSummary.services.length,
        auditRows: seedSummary.auditRows.length,
      },
      networkPrefixCounts: { '/16': 1, '/24': 48, '/30': 1, '/32_pools': 0 },
      lanInterfaceDistribution: seedSummary.lanInterfaceDistribution,
      checkpoints,
      cloneEvidence,
      generatorSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .digest('hex'),
    };
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'w',
    });
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          database: EXPECTED.database,
          publicMigrations: report.publicMigrationsApplied,
          tenantThrough164: e5Build.appliedCount,
          tenantThrough165: e5Build.appliedCount + 1,
          counts: report.generatedDataCounts,
          statusCounts: checkpoints.afterSecondUp,
          cloneDatabases: Object.values(cloneEvidence).map((row) => row.database),
          generatorSha256: report.generatorSha256,
          evidence: OUTPUT,
        },
        null,
        2,
      ),
    );
  } finally {
    if (dbSource.isInitialized) await dbSource.destroy();
  }
}

async function applyTenantUpMigrationOnly(
  queryRunner,
  tenantMigrations,
  dataSource,
  applyTenantMigrationsInOrder,
) {
  setTenantMigrations(tenantMigrations, true);
  await applyTenantMigrationsInOrder(dataSource, {
    ...process.env,
    IWANA_APPLY_PII_CONTRACT: 'true',
  });
  const row = await queryRunner.query(
    'SELECT COUNT(*)::int AS count FROM typeorm_migrations WHERE name = $1',
    [MIGRATION_165_NAME],
  );
  if (Number(row[0]?.count) !== 1)
    throw new Error('La migración 165 no quedó registrada una sola vez.');
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'fallo desconocido';
  console.error(`MOD13 CA-R12 baseline falló: ${message}`);
  process.exitCode = 1;
});
