#!/usr/bin/env node
'use strict';

/**
 * Aplica la única OT sintética de E7_match en un clon E7_final desechable.
 * Replica los literales y la lista de columnas del helper histórico de E7_match:
 * no asigna started_at, created_at ni updated_at; las tres quedan en su default.
 * Este script no contiene datos personales ni credenciales y no toca Redis.
 */

const fs = require('node:fs');
const path = require('node:path');

const TARGET = Object.freeze({
  host: '127.0.0.1',
  port: 5434,
  sourceDatabase: 'iwana_it_mod13_ca_r12_e1',
  database: 'iwana_it_mod13_ca_r12_e7_final',
  username: 'mod13_ca_r12',
  schema: 'tenant_mod13_ca_r12_e5',
});

const FIXTURE = Object.freeze({
  number: 'MOD13-E7-MATCH-SYNTH-001',
  originContext: 'MOD13_SYNTHETIC_FIXTURE',
  workType: 'INSTALLATION',
  status: 'IN_PROGRESS',
  isAnnulled: false,
  customerDisplayLabel: 'Fixture sintético MOD13',
  workSummary: 'Fixture sintético para conciliación E7_match',
  expectedCandidates: 800,
});

const CONNECTION_FILE =
  process.env['MOD13_CA_R12_CONNECTIONS_FILE'] ??
  path.join(process.env['TEMP'] ?? '', 'iwana-mod13-ca-r12-e1', 'connections.json');

function loadConnectionOptions() {
  if (!fs.existsSync(CONNECTION_FILE)) {
    throw new Error('No se encuentra el archivo local de conexiones E-1.');
  }

  const raw = fs.readFileSync(CONNECTION_FILE, 'utf8').replace(/^\uFEFF/u, '');
  const connections = JSON.parse(raw);
  const postgres = connections.postgres;

  if (
    postgres?.host !== TARGET.host ||
    Number(postgres?.port) !== TARGET.port ||
    postgres?.database !== TARGET.sourceDatabase ||
    postgres?.username !== TARGET.username ||
    typeof postgres?.password !== 'string' ||
    postgres.password.length < 16
  ) {
    throw new Error('La conexión no coincide con el PostgreSQL E-1 autorizado.');
  }

  return {
    type: 'postgres',
    host: postgres.host,
    port: Number(postgres.port),
    username: postgres.username,
    password: postgres.password,
    database: TARGET.database,
    entities: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
    logging: false,
    connectTimeoutMS: 5000,
    applicationName: 'mod13-ca-r12-e7-fixture',
  };
}

function resolveTenant(rows) {
  if (rows.length !== 1 || rows[0].schema_name !== TARGET.schema) {
    throw new Error('El contexto de tenant no coincide con el tenant sintético de E5.');
  }
  return rows[0].id;
}

function isExpectedFixture(row, candidateId, tenantId) {
  return (
    row.id === candidateId &&
    row.tenant_id === tenantId &&
    row.execution_order_number === FIXTURE.number &&
    row.origin_context === FIXTURE.originContext &&
    row.origin_ref_id === null &&
    row.schedule_event_id === null &&
    row.planned_window_start_at === null &&
    row.planned_window_end_at === null &&
    row.work_type === FIXTURE.workType &&
    row.work_summary === FIXTURE.workSummary &&
    row.customer_display_label === FIXTURE.customerDisplayLabel &&
    row.status === FIXTURE.status &&
    row.is_annulled === FIXTURE.isAnnulled &&
    row.result === null &&
    row.closed_at === null &&
    row.started_at === null
  );
}

async function run() {
  if (process.argv.includes('--help')) {
    process.stdout.write(
      'Uso: node scripts/mod13-ca-r12-e7-fixture.cjs\n' +
        'Aplica o valida la fixture solo en iwana_it_mod13_ca_r12_e7_final.\n',
    );
    return;
  }
  if (process.argv.length > 2) throw new Error('Argumento no reconocido.');

  const { DataSource } = require('../packages/database/node_modules/typeorm');
  const dataSource = new DataSource(loadConnectionOptions());
  await dataSource.initialize();

  const queryRunner = dataSource.createQueryRunner();
  let transactionStarted = false;

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');
    transactionStarted = true;

    const identity = await queryRunner.query('SELECT current_database() AS database');
    if (identity[0]?.database !== TARGET.database) {
      throw new Error('La conexión no está en el clon E7_final autorizado.');
    }

    await queryRunner.query(`SET LOCAL search_path TO "${TARGET.schema}", pg_catalog`);
    await queryRunner.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `mod13-e7-fixture:${FIXTURE.number}`,
    ]);

    const tenants = await queryRunner.query(
      `SELECT id::text AS id, schema_name
         FROM public.tenants
        WHERE status = 'ACTIVE'
          AND deleted_at IS NULL
        ORDER BY schema_name`,
    );
    const tenantId = resolveTenant(tenants);

    const candidates = await queryRunner.query(
      `SELECT execution_order_id
         FROM service_provisionings
        WHERE tenant_id = $1
          AND status IN ('RESERVED', 'CERTIFIED')
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
      [tenantId],
    );
    const candidate = candidates[0];
    if (!candidate) throw new Error('No hay candidato sintético para E7.');

    const candidateCounts = await queryRunner.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(DISTINCT execution_order_id)::int AS unique_ids
         FROM service_provisionings
        WHERE tenant_id = $1
          AND status IN ('RESERVED', 'CERTIFIED')`,
      [tenantId],
    );
    if (
      candidateCounts[0]?.total !== FIXTURE.expectedCandidates ||
      candidateCounts[0]?.unique_ids !== FIXTURE.expectedCandidates
    ) {
      throw new Error('El baseline no contiene 800 candidatos únicos para E7.');
    }

    const candidateId = candidate.execution_order_id;
    const existing = await queryRunner.query(
      `SELECT id, tenant_id, execution_order_number, origin_context, origin_ref_id,
              schedule_event_id, planned_window_start_at, planned_window_end_at,
              work_type::text AS work_type, work_summary, customer_display_label,
              status::text AS status, is_annulled, result::text AS result,
              closed_at, started_at
         FROM execution_orders
        WHERE tenant_id = $1
          AND (id = $2 OR execution_order_number = $3)
        FOR UPDATE`,
      [tenantId, candidateId, FIXTURE.number],
    );

    const tenantOrderCounts = await queryRunner.query(
      `SELECT COUNT(*)::int AS total
         FROM execution_orders
        WHERE tenant_id = $1`,
      [tenantId],
    );
    const totalOrders = tenantOrderCounts[0]?.total ?? 0;

    if (existing.length === 1 && isExpectedFixture(existing[0], candidateId, tenantId)) {
      if (totalOrders !== 1) {
        throw new Error('Hay órdenes adicionales en el tenant sintético; no se modifica.');
      }
      await queryRunner.commitTransaction();
      transactionStarted = false;
      process.stdout.write(
        'Fixture ya presente: 1 orden IN_PROGRESS; 800 candidatos, 799 sin snapshot.\n',
      );
      return;
    }

    if (existing.length !== 0 || totalOrders !== 0) {
      throw new Error('El tenant no está limpio o la fila existente no coincide; no se modifica.');
    }

    await queryRunner.query(
      `INSERT INTO execution_orders (
         id, tenant_id, execution_order_number, schedule_event_id,
         origin_context, origin_ref_id, customer_display_label, work_type,
         work_summary, planned_window_start_at, planned_window_end_at,
         status, is_annulled
       ) VALUES (
         $1, $2, $3, NULL,
         $4, NULL, $5, $6,
         $7, NULL, NULL,
         $8, $9
       )`,
      [
        candidateId,
        tenantId,
        FIXTURE.number,
        FIXTURE.originContext,
        FIXTURE.customerDisplayLabel,
        FIXTURE.workType,
        FIXTURE.workSummary,
        FIXTURE.status,
        FIXTURE.isAnnulled,
      ],
    );

    const verification = await queryRunner.query(
      `SELECT COUNT(*) FILTER (WHERE eo.id IS NOT NULL)::int AS snapshots,
              COUNT(*) FILTER (WHERE eo.id IS NULL)::int AS without_snapshot,
              COUNT(*) FILTER (
                WHERE eo.id IS NOT NULL
                  AND eo.status = 'IN_PROGRESS'
                  AND eo.work_type = 'INSTALLATION'
                  AND eo.is_annulled = false
                  AND eo.started_at IS NULL
              )::int AS expected_snapshot
         FROM (
           SELECT DISTINCT tenant_id, execution_order_id
             FROM service_provisionings
            WHERE status IN ('RESERVED', 'CERTIFIED')
         ) candidate
         LEFT JOIN execution_orders eo
           ON eo.tenant_id = candidate.tenant_id
          AND eo.id = candidate.execution_order_id
        WHERE candidate.tenant_id = $1`,
      [tenantId],
    );
    const counts = verification[0];
    const finalOrderCount = await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM execution_orders WHERE tenant_id = $1`,
      [tenantId],
    );

    if (
      counts?.snapshots !== 1 ||
      counts?.without_snapshot !== FIXTURE.expectedCandidates - 1 ||
      counts?.expected_snapshot !== 1 ||
      finalOrderCount[0]?.total !== 1
    ) {
      throw new Error('La verificación posterior no coincide; se revierte la transacción.');
    }

    await queryRunner.commitTransaction();
    transactionStarted = false;
    process.stdout.write(
      'Fixture aplicada: 1 orden IN_PROGRESS; 800 candidatos, 799 sin snapshot.\n',
    );
  } catch (error) {
    if (transactionStarted) await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

run().catch((error) => {
  process.stderr.write(`Fixture E7 detenida: ${error.message}\n`);
  process.exitCode = 1;
});
