import { assertTitularWritable } from '../../crm/subscribers/guards/assert-titular-writable';
import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { OperationalTaskTitularErasureParticipant } from './operational-task-titular-erasure.participant';
import type { TitularErasureScope } from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from './execution-order-titular-erasure.participant';
import type { ErasureKeys } from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';

const integrationEnabled = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const safeDatabaseName = /^iwana_it_g7_[a-z0-9_]+$/u;
const supportedDatabaseName = databaseName === 'test' || safeDatabaseName.test(databaseName);
const describeWithDb = integrationEnabled && supportedDatabaseName ? describe : describe.skip;

if (integrationEnabled && !supportedDatabaseName) {
  console.warn(
    `[B3] Integración omitida: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

describeWithDb('B3 — supresión CRM sobre migraciones tenant reales', () => {
  const schemaName = `tenant_it_g7_b3_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `privacy-g7-${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();
  const keys: ErasureKeys = {
    hashKey: Buffer.alloc(32, 1),
    activeEncryptionKey: Buffer.alloc(32, 2),
    previousEncryptionKey: null,
  };
  let baseDataSource: DataSource | undefined;
  let tenantDataSource: DataSource | undefined;
  let queryRunner: QueryRunner | undefined;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
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
    await baseDataSource.initialize();

    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'B3 synthetic fixture', $2, $3, 'INACTIVE', 'b1c@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }

    tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource, {
      ...process.env,
      IWANA_APPLY_PII_CONTRACT: 'true',
    });
    queryRunner = tenantDataSource.createQueryRunner();
    await queryRunner.connect();
    const [migrationCountRow] = (await queryRunner.query(
      'SELECT COUNT(*)::int AS count FROM typeorm_migrations',
    )) as Array<{ count: number }>;
    const appliedMigrationCount = migrationCountRow?.count ?? 0;
    console.info(
      `[B3] Tenant migrations applied: ${appliedMigrationCount}/${TENANT_MIGRATIONS.length}.`,
    );
    expect(appliedMigrationCount).toBe(TENANT_MIGRATIONS.length);
  });

  afterAll(async () => {
    try {
      if (queryRunner && !queryRunner.isReleased) await queryRunner.release();
    } finally {
      if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
      if (baseDataSource?.isInitialized) {
        const cleanup = baseDataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
        } finally {
          await cleanup.release();
          await baseDataSource.destroy();
        }
      }
    }
  });

  beforeEach(async () => {
    if (!queryRunner) throw new Error('Conexión de prueba ausente.');
    await queryRunner.startTransaction();
    await queryRunner.query("SELECT set_config('iwana.titular_erasure', 'on', true)");
  });
  afterEach(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
  });

  it('R-13 conserva el asiento y las cuatro fechas y sustituye el motivo', async () => {
    const qr = queryRunner!;
    const eventId = randomUUID();
    await qr.query(
      `INSERT INTO schedule_reschedule_logs
      (tenant_id, schedule_event_id, from_start_at, from_end_at, to_start_at, to_end_at, reason, notes, changed_by)
      VALUES ($1, $2, '2026-01-01T08:00Z', '2026-01-01T09:00Z', '2026-01-02T08:00Z', '2026-01-02T09:00Z', 'Sonda de motivo', 'Sonda de nota', $3)`,
      [tenantId, eventId, actorId],
    );
    const [before] = await qr.query('SELECT * FROM schedule_reschedule_logs');
    await new WfmTitularErasureParticipant(new ConfigService()).apply(
      {
        partyId: null,
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        cryptoKeys: keys,
        relatedIds: { scheduleEventIds: [eventId] },
      },
      qr,
      'apply',
    );
    const [after] = await qr.query('SELECT * FROM schedule_reschedule_logs');
    expect(after).toEqual({ ...before, reason: 'ANONIMIZADO', notes: null });
  });

  it('R-12 conserva el reverso y marca su motivo NOT NULL', async () => {
    const qr = queryRunner!;
    const orderId = randomUUID();
    await qr.query(
      `INSERT INTO execution_order_item_usage_reversals
      (tenant_id, execution_order_id, item_usage_id, reversal_request_id, reason, requested_by)
      VALUES ($1, $2, $3, $4, 'Sonda de reverso', $5)`,
      [tenantId, orderId, randomUUID(), randomUUID(), actorId],
    );
    const [before] = await qr.query('SELECT * FROM execution_order_item_usage_reversals');
    await new ExecutionOrderTitularErasureParticipant(new ConfigService()).apply(
      {
        partyId: null,
        subscriberIds: [],
        expedienteIds: [],
        userIds: [],
        cryptoKeys: keys,
        relatedIds: { executionOrderIds: [orderId] },
      },
      qr,
      'apply',
    );
    const [after] = await qr.query('SELECT * FROM execution_order_item_usage_reversals');
    expect(after).toEqual({ ...before, reason: 'ANONIMIZADO' });
  });
  function scope(): TitularErasureScope {
    return {
      partyId: null,
      subscriberIds: [randomUUID()],
      expedienteIds: [randomUUID()],
      userIds: [],
      cryptoKeys: keys,
      relatedIds: { contractIds: [randomUUID()] },
    };
  }

  it.each(['same', 'other', 'none'])(
    'D-BT-8 proveedor=%s se limita al Party consultado',
    async (kind) => {
      const qr = queryRunner!;
      const partyId = randomUUID();
      if (kind !== 'none')
        await qr.query(
          `INSERT INTO supplier_profiles (tenant_id, party_ref_id, party_role_id, supplier_code) VALUES ($1, $2, $3, 'SYNTHETIC')`,
          [tenantId, kind === 'same' ? partyId : randomUUID(), randomUUID()],
        );
      expect(await new SupplierProfileReadAdapter().hasSupplierProfile(partyId, qr)).toBe(
        kind === 'same',
      );
    },
  );

  it('R-3 a R-6 exige tipos exactos y conserva las referencias, fechas y SLA', async () => {
    const qr = queryRunner!;
    const current = scope();
    const cases = [
      ['SUBSCRIBER', current.subscriberIds[0], null, null, true],
      ['EXTERNAL', null, 'SUBSCRIBER', current.subscriberIds[0], true],
      ['EXTERNAL', null, 'CONTRACT', current.relatedIds!.contractIds![0], true],
      ['EXTERNAL', null, 'EXPEDIENTE', current.expedienteIds[0], true],
      ['EXTERNAL', current.subscriberIds[0], 'SERVICE', current.relatedIds!.contractIds![0], false],
      ['SUBSCRIBER', 'not-a-uuid', 'DEVICE', current.subscriberIds[0], false],
      ['SUBSCRIBER', randomUUID(), null, null, false],
    ] as const;
    const selected: string[] = [];
    for (let i = 0; i < cases.length; i++) {
      const [requester, requesterRef, subject, subjectRef, matches] = cases[i]!;
      const [row] = await qr.query(
        `INSERT INTO support_tickets (tenant_id, ticket_number, type, subject, description, requester_type, requester_ref_id, subject_type, subject_ref_id, created_by_user_id) VALUES ($1, $2, 'CUSTOMER_INCIDENT', 'Sonda asunto', 'Sonda descripción', $3, $4, $5, $6, $7) RETURNING id::text`,
        [tenantId, `T-${i}`, requester, requesterRef, subject, subjectRef, actorId],
      );
      if (matches) selected.push(row.id);
    }
    const ticketId = selected[0];
    const workId = randomUUID();
    await qr.query('UPDATE support_tickets SET work_order_id=$1 WHERE id=$2', [workId, ticketId]);
    const linkWorkId = randomUUID();
    await qr.query(
      `INSERT INTO ticket_comments (ticket_id, tenant_id, body, author_user_id) VALUES ($1, $2, 'Sonda comentario', $3)`,
      [ticketId, tenantId, actorId],
    );
    await qr.query(
      `INSERT INTO ticket_timeline_events (ticket_id, tenant_id, event_type, payload) VALUES ($1, $2, 'CREATED', '{"notes":"Sonda"}')`,
      [ticketId, tenantId],
    );
    await qr.query(
      `INSERT INTO ticket_work_order_links (ticket_id, tenant_id, work_order_id, requested_at, requested_by_user_id, notes) VALUES ($1, $2, $3, now(), $4, 'Sonda')`,
      [ticketId, tenantId, linkWorkId, actorId],
    );
    await qr.query(
      `INSERT INTO ticket_pqr_records (ticket_id, tenant_id, deadline_type, deadline_at, notes) VALUES ($1, $2, 'INITIAL_RESPONSE', now(), 'Sonda')`,
      [ticketId, tenantId],
    );
    const before = await qr.query('SELECT * FROM support_tickets ORDER BY id');
    const participant = new AssuranceTitularErasureParticipant(new ConfigService());
    await participant.resolveScope(current, qr);
    expect(current.relatedIds!.ticketIds!.sort()).toEqual(selected.sort());
    expect(current.relatedIds!.ticketWorkOrderIds!.sort()).toEqual([workId, linkWorkId].sort());
    const dry = await participant.plan(current, qr);
    expect(dry.reduce((n, row) => n + row.changed, 0)).toBe(0);
    expect(await qr.query('SELECT * FROM support_tickets ORDER BY id')).toEqual(before);
    const result = await participant.apply(current, qr, 'apply');
    expect(result.every((row) => row.residual === 0)).toBe(true);
    const after = await qr.query('SELECT * FROM support_tickets ORDER BY id');
    for (let i = 0; i < before.length; i++) {
      const row = before[i];
      expect(after[i]).toEqual(
        selected.includes(row.id)
          ? { ...row, subject: 'ANONIMIZADO', description: null, updated_at: after[i].updated_at }
          : row,
      );
    }
    expect((await qr.query('SELECT body FROM ticket_comments'))[0].body).toBe('ANONIMIZADO');
    expect((await qr.query('SELECT payload FROM ticket_timeline_events'))[0].payload).toEqual({});
    expect((await qr.query('SELECT notes FROM ticket_work_order_links'))[0].notes).toBeNull();
    expect((await qr.query('SELECT notes FROM ticket_pqr_records'))[0].notes).toBeNull();
    expect(
      (await participant.apply(current, qr, 'apply')).every(
        (row) => row.changed === 0 && row.residual === 0,
      ),
    ).toBe(true);
  });

  it('A-2/A-3/A-4 siguen contrato, ticket y sus OT sin confundir varchar con UUID', async () => {
    const qr = queryRunner!;
    const current = scope();
    const ticketId = randomUUID();
    const workId = randomUUID();
    current.relatedIds!.ticketIds = [ticketId];
    current.relatedIds!.ticketWorkOrderIds = [workId];
    await qr.query(
      `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title, contract_id, requested_by_user_id) VALUES ($1, 'PENDING', 'MANUAL', 'INSTALLATION', 'NORMAL', 'Sonda visita contrato', $2, $3)`,
      [tenantId, current.relatedIds!.contractIds![0], actorId],
    );
    await qr.query(
      `INSERT INTO visit_requests (tenant_id, status, origin_context, work_type, priority, title, ticket_id, requested_by_user_id) VALUES ($1, 'PENDING', 'MANUAL', 'INSTALLATION', 'NORMAL', 'Sonda visita ticket', $2, $3)`,
      [tenantId, ticketId, actorId],
    );
    await qr.query(
      `INSERT INTO schedule_events (tenant_id, type, title, scheduled_start_at, scheduled_end_at, assigned_user_id, contract_id, created_by) VALUES ($1, 'INSTALLATION', 'Sonda contrato', now(), now() + interval '1 hour', $2, $3, $2)`,
      [tenantId, actorId, current.relatedIds!.contractIds![0]],
    );
    await qr.query(
      `INSERT INTO schedule_events (tenant_id, type, title, scheduled_start_at, scheduled_end_at, assigned_user_id, ticket_id, created_by) VALUES ($1, 'INSTALLATION', 'Sonda ticket', now(), now() + interval '1 hour', $2, $3, $2)`,
      [tenantId, actorId, ticketId],
    );
    await qr.query(
      `INSERT INTO work_orders (id, tenant_id, code, type, source_context, source_ref, summary, created_by, assigned_user_id) VALUES ($1, $2, 'W1', 'INSTALLATION', 'MANUAL', null, 'Sonda vínculo', $3, $3), ($4, $2, 'W2', 'INSTALLATION', 'ASSURANCE', $5, 'Sonda origen', $3, $3)`,
      [workId, tenantId, actorId, randomUUID(), ticketId],
    );
    await qr.query(
      `INSERT INTO operational_tasks (tenant_id, task_number, type, title, origin_context, ticket_id, responsible_type, responsible_ref_id, recipient_type, execution_mode) VALUES ($1, 'TASK1', (SELECT enumlabel::task_type FROM pg_enum WHERE enumtypid='task_type'::regtype ORDER BY enumsortorder LIMIT 1), 'Sonda tarea', 'ASSURANCE', $2, (SELECT enumlabel::task_responsible_type FROM pg_enum WHERE enumtypid='task_responsible_type'::regtype ORDER BY enumsortorder LIMIT 1), $3, (SELECT enumlabel::task_recipient_type FROM pg_enum WHERE enumtypid='task_recipient_type'::regtype ORDER BY enumsortorder LIMIT 1), (SELECT enumlabel::task_execution_mode FROM pg_enum WHERE enumtypid='task_execution_mode'::regtype ORDER BY enumsortorder LIMIT 1))`,
      [tenantId, ticketId, actorId],
    );
    const wfm = new WfmTitularErasureParticipant(new ConfigService());
    await wfm.resolveScope(current, qr);
    expect(current.relatedIds!.visitRequestIds).toHaveLength(2);
    expect(current.relatedIds!.scheduleEventIds).toHaveLength(2);
    expect(current.relatedIds!.workOrderIds).toHaveLength(2);
    const tasks = new OperationalTaskTitularErasureParticipant(new ConfigService());
    await tasks.resolveScope(current, qr);
    expect(current.relatedIds!.operationalTaskIds).toHaveLength(1);
    expect((await wfm.apply(current, qr, 'apply')).every((row) => row.residual === 0)).toBe(true);
    expect((await tasks.apply(current, qr, 'apply')).every((row) => row.residual === 0)).toBe(true);
  });

  it('A-1 alcanza la OT directa por suscriptor sin visita ni agenda', async () => {
    const qr = queryRunner!;
    const current = scope();
    await qr.query(
      `INSERT INTO execution_orders (tenant_id, execution_order_number, origin_context, customer_display_label, work_type, work_summary, subscriber_id) VALUES ($1, 'E1', 'CRM', 'Sonda titular', 'INSTALLATION', 'Sonda resumen', $2)`,
      [tenantId, current.subscriberIds[0]],
    );
    const participant = new ExecutionOrderTitularErasureParticipant(new ConfigService());
    await participant.resolveScope(current, qr);
    expect(current.relatedIds!.executionOrderIds).toHaveLength(1);
    expect((await participant.apply(current, qr, 'apply')).every((row) => row.residual === 0)).toBe(
      true,
    );
  });

  it('R-2 marca el motivo con ck_sp_regularized activo y conserva la regularización', async () => {
    const qr = queryRunner!;
    const current = scope();
    const routerId = randomUUID();
    const networkId = randomUUID();
    await qr.query(
      `INSERT INTO network_routers (id, tenant_id, name, management_host, supported_control_methods, created_by) VALUES ($1, $2, 'Sonda router', '192.0.2.1', ARRAY['PCQ_ADDRESS_LIST'], $3)`,
      [routerId, tenantId, actorId],
    );
    await qr.query(
      `INSERT INTO ipv4_networks (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to, default_control_method, created_by) VALUES ($1, $2, $3, 'Sonda red', '192.0.2.0/24', '192.0.2.1', '192.0.2.2', '192.0.2.254', 'PCQ_ADDRESS_LIST', $4)`,
      [networkId, tenantId, routerId, actorId],
    );
    await qr.query(
      `INSERT INTO service_provisionings (tenant_id, subscriber_id, execution_order_id, execution_order_number, router_id, ipv4_network_id, control_method, control_params, status, origin, regularization_reason, regularized_by, regularized_at) VALUES ($1, $2, $3, 'E1', $4, $5, 'PCQ_ADDRESS_LIST', '{}', 'ACTIVE', 'REGULARIZED', 'Sonda motivo', $6, now())`,
      [tenantId, current.subscriberIds[0], randomUUID(), routerId, networkId, actorId],
    );
    const [before] = await qr.query('SELECT * FROM service_provisionings');
    const networkParticipant = new NetworkTitularErasureParticipant(new ConfigService());
    expect((await networkParticipant.plan(current, qr))[0]).toMatchObject({
      selected: 1,
      changed: 0,
      residual: 1,
    });
    expect(
      (await qr.query('SELECT regularization_reason FROM service_provisionings'))[0]
        .regularization_reason,
    ).toBe('Sonda motivo');
    const result = await networkParticipant.apply(current, qr, 'apply');
    expect(result[0]).toMatchObject({ category: 'OPERACION_CAMPO', changed: 1, residual: 0 });
    const [after] = await qr.query('SELECT * FROM service_provisionings');
    expect(after).toEqual({
      ...before,
      regularization_reason: 'ANONIMIZADO',
      updated_at: after.updated_at,
    });
  });

  it.each(['SUBSCRIBER', 'EXPEDIENTE', 'CONTRACT'] as const)(
    'D-BT-7 rechaza %s anonimizado mediante lectura CRM con bloqueo',
    async (type) => {
      const qr = queryRunner!;
      const subscriberId = randomUUID();
      const expedienteId = randomUUID();
      const contractId = randomUUID();
      await qr.query(
        `INSERT INTO expediente_records (id, tenant_id, full_name, created_by) VALUES ($1, $2, 'Sonda expediente', $3)`,
        [expedienteId, tenantId, actorId],
      );
      await qr.query(
        `INSERT INTO subscribers (id, tenant_id, expediente_id, person_type, customer_segment, document_type, document_number_encrypted, first_name, last_name, stratum, email_encrypted, phone_encrypted, vat_treatment, tax_regime, address, created_by) VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'synthetic-encrypted', 'Fixture', 'B3', 3, 'synthetic-email', 'synthetic-phone', 'STANDARD', 'SIMPLIFIED', 'Sonda dirección', $4)`,
        [subscriberId, tenantId, expedienteId, actorId],
      );
      await qr.query(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, alias, service_usage) VALUES ($1, $2, $3, 'fixture-plan', '{}', 'DRAFT', 'Sonda contrato', 'NON_RESIDENTIAL')`,
        [contractId, tenantId, subscriberId],
      );
      const id =
        type === 'CONTRACT' ? contractId : type === 'SUBSCRIBER' ? subscriberId : expedienteId;
      await expect(assertTitularWritable([{ type, id }], qr)).resolves.toBeUndefined();
      if (type === 'EXPEDIENTE')
        await qr.query(
          'UPDATE expediente_records SET anonymized_at=now(), anonymized_request_id=$1 WHERE id=$2',
          [randomUUID(), expedienteId],
        );
      else
        await qr.query(
          'UPDATE subscribers SET anonymized_at=now(), anonymized_request_id=$1 WHERE id=$2',
          [randomUUID(), subscriberId],
        );
      await expect(assertTitularWritable([{ type, id }], qr)).rejects.toMatchObject({
        status: 409,
        response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
      });
    },
  );
  it('el alcance vacío no toca filas y permite resolver las claves desde ConfigService', async () => {
    const qr = queryRunner!;
    const config = new ConfigService({
      PII_HASH_KEY: keys.hashKey.toString('hex'),
      PII_ENCRYPTION_KEY: keys.activeEncryptionKey.toString('hex'),
      MFA_ENCRYPTION_KEY: keys.activeEncryptionKey.toString('hex'),
    });
    const empty = { partyId: null, subscriberIds: [], expedienteIds: [], userIds: [] };
    const assurance = new AssuranceTitularErasureParticipant(config);
    await assurance.resolveScope(empty, qr);
    expect(
      (await assurance.plan(empty, qr)).every(
        (row) => row.selected === 0 && row.changed === 0 && row.residual === 0,
      ),
    ).toBe(true);
    expect((await new NetworkTitularErasureParticipant(config).plan(empty, qr))[0]).toMatchObject({
      selected: 0,
      changed: 0,
      residual: 0,
    });
  });
});
