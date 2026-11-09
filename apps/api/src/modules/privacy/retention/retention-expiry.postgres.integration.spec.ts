import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext, resolveMigrationDbCredentials } from '@iwana/db';
import { runInTenantSchema } from '@iwana/db';
import { CrmContractStandingReadAdapter } from '../../crm/privacy-adapters/crm-contract-standing-read.adapter';
import { CrmPersonalDataErasureAdapter } from '../../crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { IBillingStandingReadPort } from '../../privacy/requests/ports/billing-standing-read.port';
import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { IPqrRetentionReadPort } from '../requests/ports/pqr-retention-read.port';
import { IContractStandingReadPort } from '../requests/ports/contract-standing-read.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { AuditService } from '../../audit/audit.service';
import { ConservationDutyService } from './conservation-duty.service';
import { RetentionExpiryService } from './retention-expiry.service';
import { RetentionAuditPort } from './retention-audit.port';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * H-EXP B1/B2 contra PostgreSQL real: motor con adaptadores reales sobre la
 * cadena de migraciones vigente. Canarios sintéticos, sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

jest.setTimeout(900_000);

describeWithDb('RetentionExpiryService en PostgreSQL real (H-EXP B1/B2)', () => {
  const schemaName = `tenant_hexp_b1_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `hexp-b1-${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();
  const partyId = randomUUID();
  const subscriberId = randomUUID();
  const contractId = randomUUID();
  const suppressionId = randomUUID();
  const oldRequestId = randomUUID();
  const transferRequestId = randomUUID();
  const taskId = randomUUID();

  let baseDataSource: DataSource | undefined;
  let service: RetentionExpiryService | undefined;
  let auditWithin: jest.Mock | undefined;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

  async function runBatch(dryRun = false) {
    if (!baseDataSource || !service) throw new Error('Integración no inicializada.');
    const dataSource = baseDataSource;
    const expiry = service;
    return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      inTenant(() =>
        expiry.runTenantBatch(queryRunner.manager, {
          actorId,
          runId: randomUUID(),
          dryRun,
          today: '2026-11-08',
        }),
      ),
    );
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error('Integración H-EXP: DB_NAME debe ser test o iwana_it_*; nunca desarrollo.');
    }
    const credentials = resolveMigrationDbCredentials();
    baseDataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
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
         VALUES ($1, 'H-EXP B1 sintético', $2, $3, 'INACTIVE', 'hexp-b1@invalid.example')`,
        [tenantId, tenantSlug, schemaName],
      );
    } finally {
      await bootstrap.release();
    }
    const tenantDataSource = createTenantDataSource(baseDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    auditWithin = jest.fn(async () => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getDataSourceToken(), useValue: baseDataSource },
        { provide: DataSource, useValue: baseDataSource },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ...process.env,
            PII_HASH_KEY: randomBytes(32).toString('hex'),
          }),
        },
        { provide: AuditService, useValue: { logWithin: auditWithin } },
        CrmContractStandingReadAdapter,
        { provide: IContractStandingReadPort, useExisting: CrmContractStandingReadAdapter },
        BillingStandingReadAdapter,
        { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
        PqrRetentionReadAdapter,
        { provide: IPqrRetentionReadPort, useExisting: PqrRetentionReadAdapter },
        { provide: RetentionAuditPort, useExisting: AuditService },
        CrmTitularErasureParticipant,
        PartyTitularErasureParticipant,
        UserAccountErasureParticipant,
        WfmTitularErasureParticipant,
        ExecutionOrderTitularErasureParticipant,
        OperationalTaskTitularErasureParticipant,
        MediaTitularErasureParticipant,
        BillingTitularErasureParticipant,
        AssuranceTitularErasureParticipant,
        NetworkTitularErasureParticipant,
        SupplierProfileReadAdapter,
        CrmPersonalDataErasureAdapter,
        { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
        ConservationDutyService,
        {
          provide: RetentionExpiryService,
          inject: [
            ConservationDutyService,
            IContractStandingReadPort,
            IPersonalDataErasurePort,
            RetentionAuditPort,
            IPqrRetentionReadPort,
          ],
          useFactory: (...deps: ConstructorParameters<typeof RetentionExpiryService>) =>
            new RetentionExpiryService(...deps),
        },
      ],
    }).compile();
    service = moduleRef.get(RetentionExpiryService);

    // Titular bloqueado con reloj vencido hace 6 años.
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular sintético H-EXP')`,
      [partyId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Nombre sintético', 'Apellido sintético', 3, 'sintetico',
         'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, terminated_at,
          additional_product_ids, additional_service_ids)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, 'TERMINATED',
         now() - interval '6 years', '{}', '{}')`,
      [contractId, tenantId, subscriberId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, party_id,
          identity_verification_method, identity_verified_at, identity_verified_by, legal_basis,
          resolved_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'SUPRIMIR', 'NO_PROCEDENTE', now() - interval '6 years',
         CURRENT_DATE, $2, 'DOCUMENTO_PRESENCIAL', now() - interval '6 years', $3, 'DEBER_LEGAL_CONSERVACION',
         now() - interval '1 year')`,
      [suppressionId, partyId, actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".party_privacy_marks (party_id, mark, event, request_id, actor_id)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', $2, $3)`,
      [partyId, suppressionId, actorId],
    );

    // Solicitud RESUELTA en 2019 con paquete completo.
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at,
          identity_verification_method, identity_verified_at, identity_verified_by,
          requester_name_encrypted, requester_document_type, requester_document_encrypted,
          requester_contact_encrypted, requester_document_hmac, requester_evidence_media_id,
          response_text, resolved_at, resolved_by, transferred_to)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', '2019-01-10', '2019-01-24',
         'DOCUMENTO_PRESENCIAL', '2019-01-11T12:00:00Z', $3,
         'sintetico', 'CC', 'sintetico', 'sintetico', 'sintetico', $2,
         'Texto libre de integración', '2019-06-01T12:00:00Z', $3, NULL)`,
      [oldRequestId, randomUUID(), actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_tasks
         (id, request_id, kind, due_at, done_at, done_by, note)
       VALUES ($1, $2, 'SUSPENDER_COBRO_EXTERNO', '2019-02-01', '2019-02-02', $3, 'Nota libre de integración')`,
      [taskId, oldRequestId, actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
       VALUES ($1, 'EN_TRAMITE', 'RESUELTA', $2, 'Nota libre de integración'),
              ($1, 'EN_TRAMITE', 'RESUELTA', $2, 'RESOLVE')`,
      [oldRequestId, actorId],
    );

    // TRASLADADA con destino libre y cierre en 2019.
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, closed_at,
          requester_name_encrypted, response_text, transferred_to)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'TRASLADADA', '2019-01-10', '2019-01-24',
         '2019-03-10T15:00:00Z', 'sintetico', 'Texto libre de integración', 'Entidad Libre Ficticia')`,
      [transferRequestId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
       VALUES ($1, 'EN_TRAMITE', 'TRASLADADA', $2, 'TRASLADO')`,
      [transferRequestId, actorId],
    );
  }, 180_000);

  afterAll(async () => {
    if (baseDataSource?.isInitialized) {
      const cleanup = baseDataSource;
      try {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      } finally {
        await cleanup.destroy();
      }
      baseDataSource = undefined;
    }
  });

  it('CA-EXP-01: titular vencido se anonimiza, agrega CLOSE y el reintento es no-op', async () => {
    if (!baseDataSource || !service) throw new Error('Integración no inicializada.');
    const dry = await runBatch(true);
    expect(dry.counts.titulares).toBe(1);

    const applied = await runBatch(false);
    expect(applied.counts.titulares).toBe(1);
    expect(auditWithin).toHaveBeenCalled();

    const subscribers = (await baseDataSource.query(
      `SELECT first_name, anonymized_at FROM "${schemaName}".subscribers WHERE id = $1`,
      [subscriberId],
    )) as Array<{ first_name: string | null; anonymized_at: Date | null }>;
    expect(subscribers[0]?.first_name).toBe('ANONIMIZADO');
    expect(subscribers[0]?.anonymized_at).toBeInstanceOf(Date);

    const marks = (await baseDataSource.query(
      `SELECT event FROM "${schemaName}".party_privacy_marks
        WHERE party_id = $1 AND mark = 'DATOS_BLOQUEADOS'
        ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [partyId],
    )) as Array<{ event: string }>;
    expect(marks[0]?.event).toBe('CLOSE');

    const runs = (await baseDataSource.query(
      `SELECT estado, changed_rows FROM "${schemaName}".privacy_retention_expiry_runs
        WHERE tipo = 'TITULAR' AND target_id = $1`,
      [partyId],
    )) as Array<{ estado: string; changed_rows: number }>;
    expect(runs[0]?.estado).toBe('COMPLETE');

    const again = await runBatch(false);
    expect(again.counts.titulares).toBe(0);
    expect(again.counts.failed).toBe(0);
  });

  it('CA-EXP-08/09: solicitud vencida se minimiza y el traslado libre crea tarea', async () => {
    if (!baseDataSource || !service) throw new Error('Integración no inicializada.');
    // Fixtures propios: el lote anterior ya minimizó las solicitudes del bloque 1.
    const oldRequest2 = randomUUID();
    const transferRequest2 = randomUUID();
    const task2 = randomUUID();
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at,
          identity_verification_method, identity_verified_at, identity_verified_by,
          requester_name_encrypted, requester_document_type, requester_document_encrypted,
          requester_contact_encrypted, requester_document_hmac, requester_evidence_media_id,
          response_text, resolved_at, resolved_by, transferred_to)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', '2019-01-10', '2019-01-24',
         'DOCUMENTO_PRESENCIAL', '2019-01-11T12:00:00Z', $3,
         'sintetico', 'CC', 'sintetico', 'sintetico', 'sintetico', $2,
         'Texto libre de integración', '2019-06-01T12:00:00Z', $3, NULL)`,
      [oldRequest2, randomUUID(), actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_tasks
         (id, request_id, kind, due_at, done_at, done_by, note)
       VALUES ($1, $2, 'SUSPENDER_COBRO_EXTERNO', '2019-02-01', '2019-02-02', $3, 'Nota libre de integración')`,
      [task2, oldRequest2, actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
       VALUES ($1, 'EN_TRAMITE', 'RESUELTA', $2, 'Nota libre de integración'),
              ($1, 'EN_TRAMITE', 'RESUELTA', $2, 'RESOLVE')`,
      [oldRequest2, actorId],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, closed_at,
          requester_name_encrypted, response_text, transferred_to)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'TRASLADADA', '2019-01-10', '2019-01-24',
         '2019-03-10T15:00:00Z', 'sintetico', 'Texto libre de integración', 'Entidad Libre Ficticia')`,
      [transferRequest2],
    );
    await baseDataSource.query(
      `INSERT INTO "${schemaName}".data_subject_request_events (request_id, from_status, to_status, actor_id, reason)
       VALUES ($1, 'EN_TRAMITE', 'TRASLADADA', $2, 'TRASLADO')`,
      [transferRequest2, actorId],
    );

    const applied = await runBatch(false);
    expect(applied.counts.solicitudes).toBeGreaterThanOrEqual(2);

    const minimized = (await baseDataSource.query(
      `SELECT requester_name_encrypted, requester_document_hmac, response_text,
              party_id, minimized_at, retention_closed_at
         FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [oldRequest2],
    )) as Array<Record<string, unknown>>;
    expect(minimized[0]).toMatchObject({
      requester_name_encrypted: null,
      requester_document_hmac: null,
      response_text: null,
      party_id: null,
    });
    expect(minimized[0]?.minimized_at).toBeInstanceOf(Date);
    expect(minimized[0]?.retention_closed_at).toBeInstanceOf(Date);

    const notes = (await baseDataSource.query(
      `SELECT note FROM "${schemaName}".data_subject_request_tasks WHERE id = $1`,
      [task2],
    )) as Array<{ note: string | null }>;
    expect(notes[0]?.note).toBeNull();

    const reasons = (await baseDataSource.query(
      `SELECT reason FROM "${schemaName}".data_subject_request_events
        WHERE request_id = $1 ORDER BY occurred_at`,
      [oldRequest2],
    )) as Array<{ reason: string | null }>;
    expect(reasons.map((row) => row.reason)).toContain('RESOLVE');
    expect(reasons.map((row) => row.reason)).not.toContain('Nota libre de integración');

    const transfer = (await baseDataSource.query(
      `SELECT transfer_destination_kind, transferred_to, minimized_at
         FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [transferRequest2],
    )) as Array<{
      transfer_destination_kind: string | null;
      transferred_to: string | null;
      minimized_at: Date | null;
    }>;
    expect(transfer[0]?.transfer_destination_kind).toBe('UNCLASSIFIED');
    expect(transfer[0]?.transferred_to).toBe('Entidad Libre Ficticia');
    expect(transfer[0]?.minimized_at).toBeInstanceOf(Date);

    const tasks = (await baseDataSource.query(
      `SELECT kind, due_at::text AS due_at, done_at FROM "${schemaName}".data_subject_request_tasks
        WHERE request_id = $1 AND kind = 'CLASIFICAR_DESTINO_TRASLADO'`,
      [transferRequest2],
    )) as Array<{ kind: string; due_at: string; done_at: Date | null }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.done_at).toBeNull();
    expect(String(tasks[0]?.due_at) > '2026-11-08').toBe(true);
  });
});
