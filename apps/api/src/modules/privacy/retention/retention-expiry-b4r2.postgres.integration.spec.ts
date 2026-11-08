import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext, resolveMigrationDbCredentials, runInTenantSchema } from '@iwana/db';
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
import { IBillingStandingReadPort } from '../requests/ports/billing-standing-read.port';
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
 * H-EXP B4-R2 contra PostgreSQL real: M-1 (el contrato abierto prevalece sobre
 * la incidencia de conciliación), M-2 (reloj completo de PQR_SOPORTES para
 * prospectos), B-1 (CONTRACT_UNRECONCILED y FISCAL_UNRECONCILED en el ledger),
 * B-3 (solicitud terminal sin cierre) y B-5 (dry-run separa no conciliados).
 * Schema efímero propio para no alterar los conteos globales de B3. Sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

jest.setTimeout(300_000);

const TODAY = '2026-11-08';

describeWithDb('RetentionExpiry B4-R2 — M-1, M-2, B-1, B-3 y B-5 en PostgreSQL real', () => {
  const schemaName = `tenant_hexp_b4r2_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `hexp-b4r2-${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();
  const s = `"${schemaName}"`;

  let dataSource: DataSource | undefined;
  let service: RetentionExpiryService | undefined;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

  function ready(): { ds: DataSource; expiry: RetentionExpiryService } {
    if (!dataSource || !service) throw new Error('Integración no inicializada.');
    return { ds: dataSource, expiry: service };
  }

  function runBatch() {
    const { ds, expiry } = ready();
    return runInTenantSchema(ds, schemaName, (queryRunner) =>
      inTenant(() =>
        expiry.runTenantBatch(queryRunner.manager, {
          actorId,
          runId: randomUUID(),
          today: TODAY,
        }),
      ),
    );
  }

  function preview() {
    const { ds, expiry } = ready();
    return runInTenantSchema(ds, schemaName, (queryRunner) =>
      inTenant(() => expiry.previewTenant(queryRunner.manager, TODAY)),
    );
  }

  async function q(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    return (await ready().ds.query(sql, params)) as Array<Record<string, unknown>>;
  }

  async function ledgerFor(tipo: string, targetId: string) {
    return (await q(
      `SELECT estado, changed_rows, reason_code FROM ${s}.privacy_retention_expiry_runs
        WHERE tipo = $1 AND target_id = $2`,
      [tipo, targetId],
    )) as Array<{ estado: string; changed_rows: number; reason_code: string | null }>;
  }

  async function firstName(subscriberId: string): Promise<string | null> {
    const rows = (await q(`SELECT first_name FROM ${s}.subscribers WHERE id = $1`, [
      subscriberId,
    ])) as Array<{ first_name: string | null }>;
    return rows[0]?.first_name ?? null;
  }

  async function lastMarkEvent(partyId: string): Promise<string | null> {
    const rows = (await q(
      `SELECT event FROM ${s}.party_privacy_marks
        WHERE party_id = $1 AND mark = 'DATOS_BLOQUEADOS'
        ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [partyId],
    )) as Array<{ event: string }>;
    return rows[0]?.event ?? null;
  }

  /** Titular bloqueado, solicitud NO_PROCEDENTE resuelta hace un año y suscriptor sin contratos. */
  async function makeBlockedTitular() {
    const partyId = randomUUID();
    const subscriberId = randomUUID();
    const requestId = randomUUID();
    await q(
      `INSERT INTO ${s}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular sintético B4-R2')`,
      [partyId],
    );
    await q(
      `INSERT INTO ${s}.subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Nombre sintético', 'Apellido sintético', 3, 'sintetico',
         'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
    await q(
      `INSERT INTO ${s}.data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, party_id,
          identity_verification_method, identity_verified_at, identity_verified_by,
          legal_basis, requester_document_hmac, resolved_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'SUPRIMIR', 'NO_PROCEDENTE', now() - interval '1 year',
         CURRENT_DATE, $2, 'DOCUMENTO_PRESENCIAL', now() - interval '1 year', $3,
         'DEBER_LEGAL_CONSERVACION', NULL, now() - interval '1 year')`,
      [requestId, partyId, actorId],
    );
    await q(
      `INSERT INTO ${s}.party_privacy_marks (party_id, mark, event, request_id, actor_id)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', $2, $3)`,
      [partyId, requestId, actorId],
    );
    return { partyId, subscriberId, requestId };
  }

  async function insertContract(
    subscriberId: string,
    kind: 'OPEN' | 'TERMINATED_6Y' | 'TERMINATED_NO_DATE',
  ): Promise<string> {
    const id = randomUUID();
    await q(
      `INSERT INTO ${s}.contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, terminated_at,
          additional_product_ids, additional_service_ids)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, $4,
         ${kind === 'TERMINATED_6Y' ? "now() - interval '6 years'" : 'NULL'}, '{}', '{}')`,
      [id, tenantId, subscriberId, kind === 'TERMINATED_6Y' ? 'TERMINATED' : 'ACTIVE'],
    );
    if (kind === 'TERMINATED_NO_DATE') {
      // Dato heredado: la 170 veta un terminal sin fecha; solo surge por
      // actualización antigua. Trigger suspendido solo en este schema efímero.
      await q(`ALTER TABLE ${s}.contracts DISABLE TRIGGER USER`);
      try {
        await q(`UPDATE ${s}.contracts SET status = 'TERMINATED' WHERE id = $1`, [id]);
      } finally {
        await q(`ALTER TABLE ${s}.contracts ENABLE TRIGGER USER`);
      }
    }
    return id;
  }

  async function insertFiscalDocumentWithoutDate(
    contractId: string,
    subscriberId: string,
  ): Promise<void> {
    const periodId = randomUUID();
    await q(
      `INSERT INTO ${s}.billing_periods
         (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
          generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2020-01-01', '2020-01-01', '2020-01-01', '2020-01-01',
         '2020-01-01', '{}'::jsonb)`,
      [periodId, tenantId, contractId, subscriberId],
    );
    await q(
      `INSERT INTO ${s}.billing_documents
         (id, tenant_id, period_id, contract_id, subscriber_id, status, issue_date, due_date,
          subtotal, tax_total, total)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', NULL, CURRENT_DATE, 10, 0, 10)`,
      [randomUUID(), tenantId, periodId, contractId, subscriberId],
    );
  }

  async function insertDiscardedProspect(discardedAt: string): Promise<string> {
    const id = randomUUID();
    await q(
      `INSERT INTO ${s}.expediente_records
         (id, tenant_id, full_name, status, status_changed_at, created_by)
       VALUES ($1, $2, 'Prospecto sintético B4-R2', 'DESCARTADO', $3, $4)`,
      [id, tenantId, discardedAt, actorId],
    );
    return id;
  }

  async function insertAnsweredProspectPqr(expedienteId: string, answeredAt: string) {
    const ticket = randomUUID();
    await q(
      `INSERT INTO ${s}.support_tickets
         (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
          subject_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, 'PQR', 'Sonda B4-R2', 'EXTERNAL', 'EXPEDIENTE', $4, $5)`,
      [ticket, tenantId, `PQR-${ticket.slice(0, 8)}`, expedienteId, actorId],
    );
    await q(
      `INSERT INTO ${s}.ticket_pqr_records
         (ticket_id, tenant_id, deadline_type, deadline_at, notified_at, resolved_at)
       VALUES ($1, $2, 'FINAL_RESOLUTION', $3::timestamptz, $3::timestamptz, $3::timestamptz)`,
      [ticket, tenantId, answeredAt],
    );
  }

  async function prospectName(expedienteId: string): Promise<string | null> {
    const rows = (await q(`SELECT full_name FROM ${s}.expediente_records WHERE id = $1`, [
      expedienteId,
    ])) as Array<{ full_name: string | null }>;
    return rows[0]?.full_name ?? null;
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración H-EXP B4-R2: DB_NAME debe ser test o iwana_it_*; nunca desarrollo.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${s}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'H-EXP B4-R2 sintético', $2, $3, 'ACTIVE', 'hexp-b4r2@invalid.example')`,
      [tenantId, tenantSlug, schemaName],
    );
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: new ConfigService(process.env) },
        { provide: AuditService, useValue: { logWithin: jest.fn(async () => undefined) } },
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
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (!/^tenant_hexp_b4r2_[a-f0-9]{12}$/u.test(schemaName)) {
      throw new Error('Schema de limpieza inválido.');
    }
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('B-1: terminado sin fecha deja fila ATTENTION_REQUIRED CONTRACT_UNRECONCILED y no toca datos', async () => {
    const item = await makeBlockedTitular();
    await insertContract(item.subscriberId, 'TERMINATED_NO_DATE');
    const result = await runBatch();
    expect(result.status).toBe('ATTENTION_REQUIRED');
    expect(await ledgerFor('TITULAR', item.partyId)).toEqual([
      { estado: 'ATTENTION_REQUIRED', changed_rows: 0, reason_code: 'CONTRACT_UNRECONCILED' },
    ]);
    expect(await firstName(item.subscriberId)).toBe('Nombre sintético');
    expect(await lastMarkEvent(item.partyId)).toBe('OPEN');
  });

  it('B-1: documento fiscal sin fecha deja fila ATTENTION_REQUIRED FISCAL_UNRECONCILED y no toca datos', async () => {
    const item = await makeBlockedTitular();
    const contractId = await insertContract(item.subscriberId, 'TERMINATED_6Y');
    await insertFiscalDocumentWithoutDate(contractId, item.subscriberId);
    const result = await runBatch();
    expect(result.status).toBe('ATTENTION_REQUIRED');
    expect(await ledgerFor('TITULAR', item.partyId)).toEqual([
      { estado: 'ATTENTION_REQUIRED', changed_rows: 0, reason_code: 'FISCAL_UNRECONCILED' },
    ]);
    expect(await firstName(item.subscriberId)).toBe('Nombre sintético');
    expect(await lastMarkEvent(item.partyId)).toBe('OPEN');
  });

  it('M-1: contrato abierto y otro terminado sin fecha conserva por el abierto, sin incidencia', async () => {
    const item = await makeBlockedTitular();
    await insertContract(item.subscriberId, 'OPEN');
    await insertContract(item.subscriberId, 'TERMINATED_NO_DATE');
    await runBatch();
    expect(await ledgerFor('TITULAR', item.partyId)).toEqual([]);
    expect(await firstName(item.subscriberId)).toBe('Nombre sintético');
    const dry = await preview();
    expect(dry.eligible.titulares.map((row) => row.partyId)).not.toContain(item.partyId);
    expect(dry.unreconciled.titulares.map((row) => row.partyId)).not.toContain(item.partyId);
  });

  it('M-2: prospecto descartado con PQR respondida hace 6 meses se conserva (PQR_SOPORTES)', async () => {
    const expediente = await insertDiscardedProspect('2023-01-10T12:00:00Z');
    await insertAnsweredProspectPqr(expediente, '2026-05-08T12:00:00Z');
    await runBatch();
    expect(await ledgerFor('TITULAR', expediente)).toEqual([]);
    expect(await prospectName(expediente)).toBe('Prospecto sintético B4-R2');
  });

  it('M-2: prospecto descartado con PQR respondida hace más de 3 años se anonimiza', async () => {
    const expediente = await insertDiscardedProspect('2023-01-10T12:00:00Z');
    await insertAnsweredProspectPqr(expediente, '2023-06-01T12:00:00Z');
    await runBatch();
    expect(await ledgerFor('TITULAR', expediente)).toMatchObject([{ estado: 'COMPLETE' }]);
    expect(await prospectName(expediente)).not.toBe('Prospecto sintético B4-R2');
  });

  it('B-3: solicitud DESISTIDA sin fecha de cierre deja fila ATTENTION_REQUIRED MISSING_REQUEST_CLOSURE', async () => {
    const requestId = randomUUID();
    await q(
      `INSERT INTO ${s}.data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'DESISTIDA', '2018-01-10T12:00:00Z',
         '2018-02-10')`,
      [requestId],
    );
    const result = await runBatch();
    expect(result.status).toBe('ATTENTION_REQUIRED');
    expect(await ledgerFor('REQUEST', requestId)).toEqual([
      { estado: 'ATTENTION_REQUIRED', changed_rows: 0, reason_code: 'MISSING_REQUEST_CLOSURE' },
    ]);
    const rows = (await q(`SELECT minimized_at FROM ${s}.data_subject_requests WHERE id = $1`, [
      requestId,
    ])) as Array<{ minimized_at: Date | null }>;
    expect(rows[0]?.minimized_at).toBeNull();
    const dry = await preview();
    expect(dry.eligible.solicitudes.map((row) => row.requestId)).not.toContain(requestId);
    expect(dry.unreconciled.solicitudes).toContainEqual({
      requestId,
      reasonCode: 'MISSING_REQUEST_CLOSURE',
    });
  });

  it('B-5: el dry-run separa titulares no conciliados de los elegibles con su código', async () => {
    const contractCase = await makeBlockedTitular();
    await insertContract(contractCase.subscriberId, 'TERMINATED_NO_DATE');
    const fiscalCase = await makeBlockedTitular();
    const contractId = await insertContract(fiscalCase.subscriberId, 'TERMINATED_6Y');
    await insertFiscalDocumentWithoutDate(contractId, fiscalCase.subscriberId);
    const eligibleCase = await makeBlockedTitular();
    await insertContract(eligibleCase.subscriberId, 'TERMINATED_6Y');
    const dry = await preview();
    const eligibleParties = dry.eligible.titulares.map((row) => row.partyId);
    expect(eligibleParties).toContain(eligibleCase.partyId);
    expect(eligibleParties).not.toContain(contractCase.partyId);
    expect(eligibleParties).not.toContain(fiscalCase.partyId);
    expect(dry.unreconciled.titulares).toContainEqual({
      partyId: contractCase.partyId,
      requestId: contractCase.requestId,
      reasonCode: 'CONTRACT_UNRECONCILED',
    });
    expect(dry.unreconciled.titulares).toContainEqual({
      partyId: fiscalCase.partyId,
      requestId: fiscalCase.requestId,
      reasonCode: 'FISCAL_UNRECONCILED',
    });
  });
});
