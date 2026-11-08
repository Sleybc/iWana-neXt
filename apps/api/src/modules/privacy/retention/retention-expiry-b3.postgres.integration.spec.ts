import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError } from 'bullmq';
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
import { RetentionExpiryProcessor } from './retention-expiry.processor';
import { verifyAnonymizedTenant } from '../../../cli/anonymize-titular';
import type { RetentionExpiryCursor } from './retention-expiry.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * H-EXP B3 (sr-qa) contra PostgreSQL real: canarios sintéticos positivos y
 * negativos, reloj congelado en bordes de Bogotá, carreras con dos conexiones,
 * H1/H2 con minimización en curso, H3 de PQR no final y job manipulado.
 * Solo pruebas; sin cambios de producción. Sin PII.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;

jest.setTimeout(900_000);

const CLI_KEYS = {
  hashKey: Buffer.from('26'.repeat(32), 'hex'),
  activeEncryptionKey: Buffer.from('37'.repeat(32), 'hex'),
  previousEncryptionKey: null,
};

describeWithDb('RetentionExpiry B3 — canarios, reloj, carreras y job (sr-qa)', () => {
  const schemaName = `tenant_hexp_b3_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const tenantId = randomUUID();
  const tenantSlug = `hexp-b3-${randomUUID().slice(0, 8)}`;
  const actorId = randomUUID();

  let baseDataSource: DataSource | undefined;
  let secondDataSource: DataSource | undefined;
  let service: RetentionExpiryService | undefined;
  let duty: ConservationDutyService | undefined;
  let auditWithin: jest.Mock | undefined;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

  function runBatch(
    today = '2026-11-08',
    opts: {
      limit?: number;
      cursor?: RetentionExpiryCursor | null;
      runId?: string;
      dryRun?: boolean;
    } = {},
  ) {
    if (!baseDataSource || !service) throw new Error('Integración no inicializada.');
    const dataSource = baseDataSource;
    const expiry = service;
    return runInTenantSchema(dataSource, schemaName, (queryRunner) =>
      inTenant(() =>
        expiry.runTenantBatch(
          queryRunner.manager,
          opts.limit === undefined && opts.cursor === undefined && opts.dryRun === undefined
            ? { actorId, runId: opts.runId ?? randomUUID(), today }
            : {
                actorId,
                runId: opts.runId ?? randomUUID(),
                today,
                ...(opts.limit === undefined ? {} : { limit: opts.limit }),
                ...(opts.cursor === undefined ? {} : { cursor: opts.cursor }),
                ...(opts.dryRun === undefined ? {} : { dryRun: opts.dryRun }),
              },
        ),
      ),
    );
  }

  function dutyOn(
    manager: Parameters<ConservationDutyService['evaluate']>[0],
    partyId: string,
    hmac: string | null,
    now: Date,
  ) {
    if (!duty) throw new Error('Integración no inicializada.');
    return TenantContext.run({ tenantId, schemaName, tenantSlug }, () =>
      duty!.evaluate(manager, partyId, hmac, now),
    );
  }

  async function q(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    if (!baseDataSource) throw new Error('Integración no inicializada.');
    return (await baseDataSource.query(sql, params)) as Array<Record<string, unknown>>;
  }

  /** Titular bloqueado con contrato terminado hace 6 años y sin otros deberes. */
  async function makeTitular(
    suffix: string,
    contract: { status?: string; terminatedAt?: string | null } = {},
  ) {
    const partyId = randomUUID();
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    const requestId = randomUUID();
    const hmac = `sintetico-${suffix}`;
    // El reloj contractual es inmutable (170): el estado y la fecha se fijan
    // en el INSERT, nunca por UPDATE.
    const contractStatus = contract.status ?? 'TERMINATED';
    const contractTerminatedAt: string | null =
      contract.terminatedAt === undefined ? 'DEFAULT_6Y' : contract.terminatedAt;
    await q(
      `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular sintético B3')`,
      [partyId],
    );
    await q(
      `INSERT INTO "${schemaName}".subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Nombre sintético', 'Apellido sintético', 3, 'sintetico',
         'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, terminated_at,
          additional_product_ids, additional_service_ids)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, $4, ${contractTerminatedAt === null ? 'NULL' : contractTerminatedAt === 'DEFAULT_6Y' ? "now() - interval '6 years'" : '$5'},
         '{}', '{}')`,
      contractTerminatedAt !== null && contractTerminatedAt !== 'DEFAULT_6Y'
        ? [contractId, tenantId, subscriberId, contractStatus, contractTerminatedAt]
        : [contractId, tenantId, subscriberId, contractStatus],
    );
    await q(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, party_id,
          identity_verification_method, identity_verified_at, identity_verified_by,
          legal_basis, requester_document_hmac, resolved_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'SUPRIMIR', 'NO_PROCEDENTE', now() - interval '6 years',
         CURRENT_DATE, $2, 'DOCUMENTO_PRESENCIAL', now() - interval '6 years', $3,
         'DEBER_LEGAL_CONSERVACION', $4, now() - interval '1 year')`,
      [requestId, partyId, actorId, hmac],
    );
    await q(
      `INSERT INTO "${schemaName}".party_privacy_marks (party_id, mark, event, request_id, actor_id)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', $2, $3)`,
      [partyId, requestId, actorId],
    );
    return { partyId, subscriberId, contractId, requestId, hmac };
  }

  async function closeMark(partyId: string, requestId: string) {
    await q(
      `INSERT INTO "${schemaName}".party_privacy_marks (party_id, mark, event, request_id, actor_id)
       VALUES ($1, 'DATOS_BLOQUEADOS', 'CLOSE', $2, $3)`,
      [partyId, requestId, actorId],
    );
  }

  async function ledgerFor(tipo: string, targetId: string) {
    return (await q(
      `SELECT estado, changed_rows, reason_code FROM "${schemaName}".privacy_retention_expiry_runs
        WHERE tipo = $1 AND target_id = $2`,
      [tipo, targetId],
    )) as Array<{ estado: string; changed_rows: number; reason_code: string | null }>;
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración H-EXP B3: DB_NAME debe ser test o iwana_it_*; nunca desarrollo.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    const config = {
      type: 'postgres' as const,
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 4, min: 1, connectionTimeoutMillis: 5_000 },
    };
    baseDataSource = new DataSource(config);
    await baseDataSource.initialize();
    secondDataSource = new DataSource(config);
    await secondDataSource.initialize();
    const bootstrap = baseDataSource.createQueryRunner();
    try {
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'H-EXP B3 sintético', $2, $3, 'ACTIVE', 'hexp-b3@invalid.example')`,
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
        { provide: ConfigService, useValue: new ConfigService(process.env) },
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
    duty = moduleRef.get(ConservationDutyService);
  }, 180_000);

  afterAll(async () => {
    for (const ds of [secondDataSource, baseDataSource]) {
      if (ds?.isInitialized) {
        try {
          if (ds === baseDataSource) {
            await ds.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
            await ds.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
          }
        } finally {
          await ds.destroy();
        }
      }
      if (ds === baseDataSource) baseDataSource = undefined;
      else secondDataSource = undefined;
    }
  });

  it('CA-EXP-02: contrato abierto, deber fiscal, PQR de 2 años y recurso pendiente conservan', async () => {
    // Contrato abierto: el titular conserva aunque todo lo demás haya vencido.
    const open = await makeTitular('b3-open', { status: 'ACTIVE', terminatedAt: null });
    // Deber fiscal: documento EMITIDO hace 9 años (plazo fiscal 10 años).
    const fiscal = await makeTitular('b3-fiscal');
    const period = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".billing_periods
         (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
          generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2017-11-01', '2017-11-30', '2017-11-01', '2017-11-01', '2017-11-14', '{}'::jsonb)`,
      [period, tenantId, fiscal.contractId, fiscal.subscriberId],
    );
    await q(
      `INSERT INTO "${schemaName}".billing_documents
         (id, tenant_id, period_id, contract_id, subscriber_id, status, number, issue_date,
          due_date, subtotal, tax_total, total, created_by)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', $6, '2017-11-08', '2017-11-14', 10000, 1900, 11900, $7)`,
      [
        randomUUID(),
        tenantId,
        period,
        fiscal.contractId,
        fiscal.subscriberId,
        `DC-B3-${randomUUID().slice(0, 8)}`,
        actorId,
      ],
    );
    // PQR de 2 años: respuesta definitiva notificada y resuelta (reloj 3 años).
    const pqr = await makeTitular('b3-pqr');
    const ticketPqr = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".support_tickets
         (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
          subject_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, 'PQR', 'Sonda B3', 'EXTERNAL', 'SUBSCRIBER', $4, $5)`,
      [ticketPqr, tenantId, `PQR-${ticketPqr.slice(0, 8)}`, pqr.subscriberId, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".ticket_pqr_records
         (ticket_id, tenant_id, deadline_type, deadline_at, notified_at, resolved_at)
       VALUES ($1, $2, 'FINAL_RESOLUTION', '2024-11-08', '2024-11-08T12:00:00Z', '2024-11-08T12:00:00Z')`,
      [ticketPqr, tenantId],
    );
    // Recurso pendiente: definitiva vencida + registro sin notificar ni resolver.
    const recurso = await makeTitular('b3-recurso');
    const ticketRec = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".support_tickets
         (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
          subject_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, 'PQR', 'Sonda B3 recurso', 'EXTERNAL', 'SUBSCRIBER', $4, $5)`,
      [ticketRec, tenantId, `PQR-${ticketRec.slice(0, 8)}`, recurso.subscriberId, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".ticket_pqr_records
         (ticket_id, tenant_id, deadline_type, deadline_at, notified_at, resolved_at)
       VALUES ($1, $2, 'FINAL_RESOLUTION', '2020-06-01', '2020-06-01T12:00:00Z', '2020-06-01T12:00:00Z'),
              ($1, $2, 'CORRECTION', '2026-11-01', NULL, NULL)`,
      [ticketRec, tenantId],
    );

    const result = await runBatch();
    // Los retenidos no se seleccionan: el lote no los anonimiza, no escribe
    // ledger y conserva datos y marca (fail-closed por no-selección).
    expect(result.counts).toEqual({ titulares: 0, prospectos: 0, solicitudes: 0, failed: 0 });
    expect(result.status).toBe('COMPLETE');
    for (const item of [open, fiscal, pqr, recurso]) {
      const rows = (await q(
        `SELECT first_name, anonymized_at FROM "${schemaName}".subscribers WHERE id = $1`,
        [item.subscriberId],
      )) as Array<{ first_name: string | null; anonymized_at: Date | null }>;
      expect(rows[0]?.first_name).toBe('Nombre sintético');
      expect(rows[0]?.anonymized_at).toBeNull();
      expect(await ledgerFor('TITULAR', item.partyId)).toEqual([]);
      const mark = (await q(
        `SELECT event FROM "${schemaName}".party_privacy_marks
          WHERE party_id = $1 AND mark = 'DATOS_BLOQUEADOS'
          ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [item.partyId],
      )) as Array<{ event: string }>;
      expect(mark[0]?.event).toBe('OPEN');
    }
    // Limpieza de canarios retenidos: cierra las marcas para no re-evaluarlos
    // en los lotes siguientes (nunca fueron elegibles; el cierre es higiene).
    for (const item of [open, fiscal, pqr, recurso]) {
      await closeMark(item.partyId, item.requestId);
    }
  });

  it('CA-EXP-03: el aniversario usa fecha civil de Bogotá en 18:59, 19:00 y 23:59', async () => {
    // Reloj contractual de 5 años anclado al 2021-11-08 civil de Bogotá.
    const item = await makeTitular('b3-reloj', { terminatedAt: '2021-11-08T15:00:00Z' });
    const frozen = [
      '2026-11-07T18:59:00-05:00', // víspera 18:59 Bogotá
      '2026-11-07T19:00:00-05:00', // víspera 19:00 Bogotá (00:00Z del día siguiente en UTC)
      '2026-11-07T23:59:00-05:00', // víspera 23:59 Bogotá (04:59Z del día siguiente en UTC)
      '2026-11-08T18:59:00-05:00', // vencimiento 18:59 Bogotá
      '2026-11-08T19:00:00-05:00', // vencimiento 19:00 Bogotá
      '2026-11-08T23:59:00-05:00', // vencimiento 23:59 Bogotá
    ];
    await runInTenantSchema(baseDataSource!, schemaName, async (queryRunner) => {
      for (const [index, iso] of frozen.entries()) {
        const evaluation = await dutyOn(
          queryRunner.manager,
          item.partyId,
          item.hmac,
          new Date(iso),
        );
        if (index < 3) {
          expect(evaluation.evaluatedOn).toBe('2026-11-07');
          expect(evaluation.contractRetained).toBe(true);
          expect(evaluation.applies).toBe(true);
        } else {
          expect(evaluation.evaluatedOn).toBe('2026-11-08');
          expect(evaluation.contractRetained).toBe(false);
          expect(evaluation.applies).toBe(false);
        }
      }
    });
    // El lote es elegible el día del vencimiento inclusivo, no la víspera.
    const eve = await runBatch('2026-11-07');
    expect(eve.counts.titulares).toBe(0);
    expect(await ledgerFor('TITULAR', item.partyId)).toEqual([]);
    const due = await runBatch('2026-11-08');
    expect(due.counts.titulares).toBe(1);
    expect(due.counts.failed).toBe(0);
    expect(await ledgerFor('TITULAR', item.partyId)).toMatchObject([{ estado: 'COMPLETE' }]);
  });

  it('CA-EXP-04: ampliar el catálogo antes del bloqueo impide borrar; sin categoría falla cerrado', async () => {
    const item = await makeTitular('b3-amplia');
    // Titular vencido bajo 5 años; la ampliación a 10 años llega primero y el
    // lote ya no lo selecciona (conserva sin escribir ledger).
    await q(
      `UPDATE "${schemaName}".retention_policies SET years = 10
        WHERE category = 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR'`,
      [],
    );
    try {
      const result = await runBatch();
      expect(result.counts).toEqual({ titulares: 0, prospectos: 0, solicitudes: 0, failed: 0 });
      const rows = (await q(`SELECT first_name FROM "${schemaName}".subscribers WHERE id = $1`, [
        item.subscriberId,
      ])) as Array<{ first_name: string | null }>;
      expect(rows[0]?.first_name).toBe('Nombre sintético');
      expect(await ledgerFor('TITULAR', item.partyId)).toEqual([]);

      // Sin la categoría el lote no puede evaluar el reloj: falla cerrado con
      // código saneado. El motivo queda en el resumen del lote (failed +
      // reasonCounts + ATTENTION_REQUIRED) y, desde B2-R2, también en una
      // fila durable del ledger con su reason_code; el pendiente sigue
      // visible en verifyTenant como vencido sin procesar.
      await q(
        `DELETE FROM "${schemaName}".retention_policies
          WHERE category = 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR'`,
        [],
      );
      const missing = await runBatch();
      expect(missing.counts.titulares).toBe(1);
      expect(missing.counts.failed).toBe(1);
      expect(missing.reasonCounts).toEqual({ MISSING_POLICY: 1 });
      expect(missing.status).toBe('ATTENTION_REQUIRED');
      expect(await ledgerFor('TITULAR', item.partyId)).toMatchObject([
        { estado: 'ATTENTION_REQUIRED', reason_code: 'MISSING_POLICY' },
      ]);
    } finally {
      // Restaura el seed canónico (146) con INSERT: el trigger 146 solo
      // limita UPDATE, así que reinsertar 5 tras borrar es válido.
      await q(
        `INSERT INTO "${schemaName}".retention_policies
           (category, years, start_event, legal_basis, is_legal_minimum)
         VALUES ('IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR', 5,
           'TERMINACION_ULTIMO_CONTRATO', 'ADR-094 D7, H9', true)
         ON CONFLICT (category) DO UPDATE SET years = 5`,
        [],
      );
      await closeMark(item.partyId, item.requestId);
    }
  });

  it('CA-EXP-05: dos tenants con referencias iguales quedan aislados', async () => {
    const hmac = `sintetico-b3-aislado-${randomUUID().slice(0, 8)}`;
    async function titularIn(schema: string, tenant: string) {
      const partyId = randomUUID();
      const subscriberId = randomUUID();
      const contractId = randomUUID();
      const requestId = randomUUID();
      const ds = baseDataSource!;
      await ds.query(
        `INSERT INTO "${schema}".party (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular sintético B3')`,
        [partyId],
      );
      await ds.query(
        `INSERT INTO "${schema}".subscribers
           (id, tenant_id, party_id, person_type, customer_segment, document_type,
            document_number_encrypted, first_name, last_name, stratum, email_encrypted,
            phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
         VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
           'Nombre sintético', 'Apellido sintético', 3, 'sintetico',
           'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Dirección sintética', $4)`,
        [subscriberId, tenant, partyId, actorId],
      );
      await ds.query(
        `INSERT INTO "${schema}".contracts
           (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, terminated_at,
            additional_product_ids, additional_service_ids)
         VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, 'TERMINATED',
           now() - interval '6 years', '{}', '{}')`,
        [contractId, tenant, subscriberId],
      );
      await ds.query(
        `INSERT INTO "${schema}".data_subject_requests
           (id, requester_kind, kind, "right", status, received_at, due_at, party_id,
            identity_verification_method, identity_verified_at, identity_verified_by,
            legal_basis, requester_document_hmac, resolved_at)
         VALUES ($1, 'TITULAR', 'CONSULTA', 'SUPRIMIR', 'NO_PROCEDENTE', now() - interval '6 years',
           CURRENT_DATE, $2, 'DOCUMENTO_PRESENCIAL', now() - interval '6 years', $3,
           'DEBER_LEGAL_CONSERVACION', $4, now() - interval '1 year')`,
        [requestId, partyId, actorId, hmac],
      );
      await ds.query(
        `INSERT INTO "${schema}".party_privacy_marks (party_id, mark, event, request_id, actor_id)
         VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', $2, $3)`,
        [partyId, requestId, actorId],
      );
      return { partyId, subscriberId, requestId };
    }

    const otherSchema = `tenant_hexp_b3b_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const otherTenant = randomUUID();
    const otherSlug = `hexp-b3b-${randomUUID().slice(0, 8)}`;
    await baseDataSource!.query(`CREATE SCHEMA "${otherSchema}"`);
    await baseDataSource!.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'H-EXP B3 otro', $2, $3, 'ACTIVE', 'hexp-b3b@invalid.example')`,
      [otherTenant, otherSlug, otherSchema],
    );
    try {
      const otherTenantDs = createTenantDataSource(baseDataSource!, otherSchema, otherSlug);
      await otherTenantDs.initialize();
      try {
        await applyTenantMigrationsInOrder(otherTenantDs);
      } finally {
        await otherTenantDs.destroy();
      }
      const inA = await titularIn(schemaName, tenantId);
      const inB = await titularIn(otherSchema, otherTenant);

      const batchA = await runBatch();
      expect(batchA.counts.titulares).toBe(1);
      const keptB = (await baseDataSource!.query(
        `SELECT first_name FROM "${otherSchema}".subscribers WHERE id = $1`,
        [inB.subscriberId],
      )) as Array<{ first_name: string | null }>;
      expect(keptB[0]?.first_name).toBe('Nombre sintético');
      expect(
        await baseDataSource!.query(
          `SELECT COUNT(*)::int AS n FROM "${otherSchema}".privacy_retention_expiry_runs`,
        ),
      ).toEqual([{ n: 0 }]);
      expect(await ledgerFor('TITULAR', inA.partyId)).toMatchObject([{ estado: 'COMPLETE' }]);
    } finally {
      await baseDataSource!.query(`DROP SCHEMA IF EXISTS "${otherSchema}" CASCADE`);
      await baseDataSource!.query('DELETE FROM public.tenants WHERE id = $1', [otherTenant]);
    }
  });

  it('CA-EXP-13: lotes de 100, cursor manipulable y cambio de política no saltan candidatos', async () => {
    const ids: string[] = [];
    for (const resolved of [
      '2019-06-01T12:00:00Z',
      '2019-06-01T12:00:00Z',
      '2019-06-01T12:00:00Z',
      '2021-06-01T12:00:00Z',
    ]) {
      const id = randomUUID();
      ids.push(id);
      await q(
        `INSERT INTO "${schemaName}".data_subject_requests
           (id, requester_kind, kind, "right", status, received_at, due_at,
            identity_verification_method, identity_verified_at, identity_verified_by,
            requester_name_encrypted, response_text, resolved_at, resolved_by)
         VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', '2019-01-10', '2019-01-24',
           'DOCUMENTO_PRESENCIAL', '2019-01-11T12:00:00Z', $2,
           'sintetico', 'Texto sintético', $3, $2)`,
        [id, actorId, resolved],
      );
    }
    const first = await runBatch('2026-11-08', { limit: 2 });
    expect(first.status).toBe('CONTINUE');
    expect(first.counts.solicitudes).toBe(2);
    expect(first.nextCursor?.phase).toBe('SOLICITUD');
    // La política cambia entre lotes: el candidato de 2021 deja de ser elegible.
    await q(
      `UPDATE "${schemaName}".retention_policies SET years = 6 WHERE category = 'SOLICITUDES_TITULAR'`,
      [],
    );
    const resume = await runBatch('2026-11-08', { cursor: first.nextCursor ?? null });
    expect(resume.status).toBe('COMPLETE');
    for (const id of ids.slice(0, 3)) {
      const rows = (await q(
        `SELECT minimized_at FROM "${schemaName}".data_subject_requests WHERE id = $1`,
        [id],
      )) as Array<{ minimized_at: Date | null }>;
      expect(rows[0]?.minimized_at).toBeInstanceOf(Date);
      expect(await ledgerFor('REQUEST', id)).toMatchObject([{ estado: 'COMPLETE' }]);
    }
    const kept = (await q(
      `SELECT minimized_at FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [ids[3]],
    )) as Array<{ minimized_at: Date | null }>;
    expect(kept[0]?.minimized_at).toBeNull();
    expect(await ledgerFor('REQUEST', ids[3] ?? '')).toEqual([]);
    // Sin restauración a 5: el trigger 146 impide bajar el piso (OLD.years).
    // El schema es sintético y efímero; la vencida de CA-EXP-09/15 sigue
    // siendo elegible bajo 6 años (2025-06-01 <= hoy).
  });

  it('H3: un plazo PQR no final sin notificar retiene aunque haya definitiva (fail-closed)', async () => {
    // Todo vencido salvo un CORRECTION sin notificar ni resolver.
    const item = await makeTitular('b3-h3');
    const ticket = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".support_tickets
         (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
          subject_ref_id, created_by_user_id)
       VALUES ($1, $2, $3, 'PQR', 'Sonda B3 H3', 'EXTERNAL', 'SUBSCRIBER', $4, $5)`,
      [ticket, tenantId, `PQR-${ticket.slice(0, 8)}`, item.subscriberId, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".ticket_pqr_records
         (ticket_id, tenant_id, deadline_type, deadline_at, notified_at, resolved_at)
       VALUES ($1, $2, 'FINAL_RESOLUTION', '2020-06-01', '2020-06-01T12:00:00Z', '2020-06-01T12:00:00Z'),
              ($1, $2, 'CORRECTION', '2026-11-01', NULL, NULL)`,
      [ticket, tenantId],
    );
    const held = await runBatch();
    // El deber retiene por no-selección: el lote no anonimiza, no escribe
    // ledger y conserva datos y marca.
    expect(held.counts).toEqual({ titulares: 0, prospectos: 0, solicitudes: 0, failed: 0 });
    expect(await ledgerFor('TITULAR', item.partyId)).toEqual([]);
    const kept = (await q(`SELECT first_name FROM "${schemaName}".subscribers WHERE id = $1`, [
      item.subscriberId,
    ])) as Array<{ first_name: string | null }>;
    expect(kept[0]?.first_name).toBe('Nombre sintético');
    // H3 documentado: sí retiene, y solo libera al notificar/resolver el
    // registro pendiente (fail-closed por diseño, no vencimiento infinito
    // incondicional: la fila CORRECTION notificada deja de retener).
    await q(
      `UPDATE "${schemaName}".ticket_pqr_records SET notified_at = now(), resolved_at = now()
        WHERE ticket_id = $1 AND deadline_type = 'CORRECTION'`,
      [ticket],
    );
    const released = await runBatch();
    expect(released.counts.failed).toBe(0);
    expect(await ledgerFor('TITULAR', item.partyId)).toMatchObject([{ estado: 'COMPLETE' }]);
  });

  it('H1: con minimización en curso, el UPDATE ajeno de reason se rechaza y la minimización termina', async () => {
    const request = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at,
          identity_verification_method, identity_verified_at, identity_verified_by, resolved_at)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
        'DOCUMENTO_PRESENCIAL', now(), $2, now())`,
      [request, actorId],
    );
    const event = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".data_subject_request_events
         (id, request_id, from_status, to_status, reason)
       VALUES ($1, $2, 'EN_TRAMITE', 'RESUELTA', 'Nota libre sintética')`,
      [event, request],
    );
    // Conexión A: minimización en curso sin commit (fila de solicitud bloqueada).
    const connA = baseDataSource!.createQueryRunner();
    await connA.connect();
    await connA.startTransaction();
    try {
      await connA.query(
        `UPDATE "${schemaName}".data_subject_requests SET minimized_at = now() WHERE id = $1`,
        [request],
      );
      // Conexión B: UPDATE ajeno sobre el evento (fila distinta, sin bloqueo).
      await expect(
        secondDataSource!.query(
          `UPDATE "${schemaName}".data_subject_request_events SET reason = NULL WHERE id = $1`,
          [event],
        ),
      ).rejects.toMatchObject({ driverError: { code: '55000' } });
      // La minimización en curso sí puede anular (ve su propio minimized_at).
      await connA.query(
        `UPDATE "${schemaName}".data_subject_request_events SET reason = NULL WHERE id = $1`,
        [event],
      );
      await connA.commitTransaction();
    } finally {
      if (connA.isTransactionActive) await connA.rollbackTransaction();
      await connA.release();
    }
    const rows = (await q(
      `SELECT minimized_at, (SELECT reason FROM "${schemaName}".data_subject_request_events WHERE id = $2) AS reason
         FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [request, event],
    )) as Array<{ minimized_at: Date | null; reason: string | null }>;
    expect(rows[0]?.minimized_at).toBeInstanceOf(Date);
    expect(rows[0]?.reason).toBeNull();
  });

  it('H2: con minimización en curso, el UPDATE ajeno de evidencia se rechaza y no se reintroduce', async () => {
    const first = randomUUID();
    const foreign = randomUUID();
    for (const id of [first, foreign]) {
      await q(
        `INSERT INTO "${schemaName}".data_subject_requests
           (id, requester_kind, kind, "right", status, received_at, due_at,
            identity_verification_method, identity_verified_at, identity_verified_by,
            requester_evidence_media_id, resolved_at)
         VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', now(), CURRENT_DATE,
          'DOCUMENTO_PRESENCIAL', now(), $2, $3, now())`,
        [id, actorId, randomUUID()],
      );
    }
    const connA = baseDataSource!.createQueryRunner();
    await connA.connect();
    await connA.startTransaction();
    try {
      await connA.query(
        `UPDATE "${schemaName}".data_subject_requests
            SET minimized_at = now(), requester_evidence_media_id = NULL WHERE id = $1`,
        [first],
      );
      // Conexión B: anular la evidencia de otra solicitud sin minimizar.
      await expect(
        secondDataSource!.query(
          `UPDATE "${schemaName}".data_subject_requests SET requester_evidence_media_id = NULL WHERE id = $1`,
          [foreign],
        ),
      ).rejects.toMatchObject({ driverError: { code: '55000' } });
      await connA.commitTransaction();
    } finally {
      if (connA.isTransactionActive) await connA.rollbackTransaction();
      await connA.release();
    }
    const done = (await q(
      `SELECT minimized_at, requester_evidence_media_id FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [first],
    )) as Array<{ minimized_at: Date | null; requester_evidence_media_id: string | null }>;
    expect(done[0]?.minimized_at).toBeInstanceOf(Date);
    expect(done[0]?.requester_evidence_media_id).toBeNull();
    // Posterior: reintroducir la evidencia en la fila minimizada se rechaza (R4).
    await expect(
      secondDataSource!.query(
        `UPDATE "${schemaName}".data_subject_requests SET requester_evidence_media_id = $2 WHERE id = $1`,
        [first, randomUUID()],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
  });

  it('Posterior: tras el barrido no se reintroducen datos del titular anonimizado', async () => {
    const item = await makeTitular('b3-posterior');
    const applied = await runBatch();
    expect(applied.counts.failed).toBe(0);
    expect(await ledgerFor('TITULAR', item.partyId)).toMatchObject([{ estado: 'COMPLETE' }]);
    // Cualquier rol con UPDATE que intente reescribir PII es rechazado (178).
    await expect(
      secondDataSource!.query(
        `UPDATE "${schemaName}".subscribers SET first_name = 'Otro' WHERE id = $1`,
        [item.subscriberId],
      ),
    ).rejects.toMatchObject({ driverError: { code: '55000' } });
    const rows = (await q(`SELECT first_name FROM "${schemaName}".subscribers WHERE id = $1`, [
      item.subscriberId,
    ])) as Array<{ first_name: string | null }>;
    expect(rows[0]?.first_name).toBe('ANONIMIZADO');
  });

  it('CA-EXP-06: 20 iteraciones con escritura CRM/PQR/Billing concurrente, sin deadlock', async () => {
    // Sonda ajena para la escritura concurrente (filas distintas, sin contención).
    const dummyParty = randomUUID();
    const dummySubscriber = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Sonda ajena B3')`,
      [dummyParty],
    );
    await q(
      `INSERT INTO "${schemaName}".subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Sonda', 'Ajena', 3, 'sintetico', 'sintetico', 'STANDARD', 'SIMPLIFIED', 'Sonda', $4)`,
      [dummySubscriber, tenantId, dummyParty, actorId],
    );
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const item = await makeTitular(`b3-carrera-${iteration}`);
      if (iteration % 2 === 0) {
        // Deber fiscal anterior: comprometido antes del lote, debe conservarse.
        const period = randomUUID();
        await q(
          `INSERT INTO "${schemaName}".billing_periods
             (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
              generation_date, due_date, effective_policy)
           VALUES ($1, $2, $3, $4, '2020-01-01', '2020-01-31', '2020-01-01', '2020-01-01', '2020-02-14', '{}'::jsonb)`,
          [period, tenantId, item.contractId, item.subscriberId],
        );
        await q(
          `INSERT INTO "${schemaName}".billing_documents
             (id, tenant_id, period_id, contract_id, subscriber_id, status, number, issue_date,
              due_date, subtotal, tax_total, total, created_by)
           VALUES ($1, $2, $3, $4, $5, 'EMITIDO', $6, '2020-01-15', '2020-02-14', 10000, 1900, 11900, $7)`,
          [
            randomUUID(),
            tenantId,
            period,
            item.contractId,
            item.subscriberId,
            `DC-B3C-${iteration}-${randomUUID().slice(0, 4)}`,
            actorId,
          ],
        );
      } else {
        // PQR sin respuesta anterior: debe conservarse.
        const ticket = randomUUID();
        await q(
          `INSERT INTO "${schemaName}".support_tickets
             (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
              subject_ref_id, created_by_user_id)
           VALUES ($1, $2, $3, 'PQR', 'Sonda B3 carrera', 'EXTERNAL', 'SUBSCRIBER', $4, $5)`,
          [ticket, tenantId, `PQR-${ticket.slice(0, 8)}`, item.subscriberId, actorId],
        );
        await q(
          `INSERT INTO "${schemaName}".ticket_pqr_records
             (ticket_id, tenant_id, deadline_type, deadline_at, notified_at, resolved_at)
           VALUES ($1, $2, 'INITIAL_RESPONSE', '2026-11-01', NULL, NULL)`,
          [ticket, tenantId],
        );
      }
      // Escritura concurrente ajena durante el lote (segunda conexión): el
      // lote y el escritor tocan filas distintas; un deadlock (40P01/55P03)
      // fallaría el lote o el escritor en lugar de pasar en silencio.
      const filler = (async () => {
        const seq = randomUUID().slice(0, 8);
        await secondDataSource!.query(
          `UPDATE "${schemaName}".subscribers SET address = $2 WHERE id = $1`,
          [dummySubscriber, `Sonda ${seq}`],
        );
        const ticket = randomUUID();
        await secondDataSource!.query(
          `INSERT INTO "${schemaName}".support_tickets
             (id, tenant_id, ticket_number, type, subject, requester_type, subject_type,
              subject_ref_id, created_by_user_id)
           VALUES ($1, $2, $3, 'PQR', 'Relleno B3', 'EXTERNAL', 'SUBSCRIBER', $4, $5)`,
          [ticket, tenantId, `PQR-${ticket.slice(0, 8)}`, dummySubscriber, actorId],
        );
      })();
      const result = await runBatch();
      await filler;
      // El deber anterior conserva por no-selección; el relleno concurrente no
      // reintroduce PII (solo filas ajenas aditivas) ni traba el lote.
      expect(result.counts).toEqual({ titulares: 0, prospectos: 0, solicitudes: 0, failed: 0 });
      expect(result.status).toBe('COMPLETE');
      const kept = (await q(
        `SELECT first_name, anonymized_at FROM "${schemaName}".subscribers WHERE id = $1`,
        [item.subscriberId],
      )) as Array<{ first_name: string | null; anonymized_at: Date | null }>;
      expect(kept[0]?.first_name).toBe('Nombre sintético');
      expect(kept[0]?.anonymized_at).toBeNull();
      expect(await ledgerFor('TITULAR', item.partyId)).toEqual([]);
    }
    const fillers = (await q(
      `SELECT COUNT(*)::int AS n FROM "${schemaName}".support_tickets WHERE subject = 'Relleno B3'`,
    )) as Array<{ n: number }>;
    expect(fillers[0]?.n).toBe(20);
  });

  it('CA-EXP-12: prospecto de 23 meses, activo o sin descarte se conserva', async () => {
    async function prospect(status: string, changedAt: string | null) {
      const id = randomUUID();
      await q(
        `INSERT INTO "${schemaName}".expediente_records
           (id, tenant_id, full_name, status, status_changed_at, created_by)
         VALUES ($1, $2, 'Prospecto sintético B3', $3, ${changedAt ? '$4' : 'now()'}, $5)`,
        changedAt ? [id, tenantId, status, changedAt, actorId] : [id, tenantId, status, actorId],
      );
      return id;
    }
    const young = await prospect('DESCARTADO', '2024-12-08T12:00:00Z');
    const active = await prospect('CONTACTADO', '2020-01-10T12:00:00Z');
    const withContract = await prospect('DESCARTADO', '2020-01-10T12:00:00Z');
    const contractId = randomUUID();
    const subscriberId = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".subscribers
         (id, tenant_id, expediente_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Sonda', 'Contrato', 3, 'sintetico', 'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Sonda', $4)`,
      [subscriberId, tenantId, withContract, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status,
          additional_product_ids, additional_service_ids)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, 'ACTIVE', '{}', '{}')`,
      [contractId, tenantId, subscriberId],
    );
    const result = await runBatch();
    expect(result.counts.prospectos).toBe(0);
    for (const id of [young, active, withContract]) {
      expect(await ledgerFor('TITULAR', id)).toEqual([]);
      const rows = (await q(
        `SELECT full_name FROM "${schemaName}".expediente_records WHERE id = $1`,
        [id],
      )) as Array<{ full_name: string | null }>;
      expect(rows[0]?.full_name).toBe('Prospecto sintético B3');
    }
  });

  it('CA-EXP-12: prospecto descartado hace 24 meses se anonimiza', async () => {
    const id = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".expediente_records
         (id, tenant_id, full_name, status, status_changed_at, created_by)
        VALUES ($1, $2, 'Prospecto sintético B3', 'DESCARTADO', '2024-11-08T12:00:00Z', $3)`,
      [id, tenantId, actorId],
    );
    const result = await runBatch();
    expect(result.counts.prospectos).toBe(1);
    expect(result.counts.failed).toBe(0);
    expect(result.reasonCounts).toEqual({});
    expect(await ledgerFor('TITULAR', id)).toMatchObject([{ estado: 'COMPLETE' }]);
  });

  it('CA-EXP-07/08: una solicitud activa del titular bloquea su minimización con código saneado', async () => {
    const party = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular con solicitud activa B3')`,
      [party],
    );
    const expired = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, party_id,
          identity_verification_method, identity_verified_at, identity_verified_by,
          requester_name_encrypted, response_text, resolved_at, resolved_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', '2019-01-10', '2019-01-24', $2,
         'DOCUMENTO_PRESENCIAL', '2019-01-11T12:00:00Z', $3,
         'sintetico', 'Texto sintético', '2019-06-01T12:00:00Z', $3)`,
      [expired, party, actorId],
    );
    const live = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at, party_id,
          identity_verification_method, identity_verified_at, identity_verified_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'EN_TRAMITE', now(), CURRENT_DATE, $2,
         'DOCUMENTO_PRESENCIAL', now(), $3)`,
      [live, party, actorId],
    );
    const result = await runBatch();
    expect(result.counts.solicitudes).toBe(1);
    // HOLD no suma a failed por diseño (needsAttention): el código saneado
    // queda en reasonCounts y el estado es ATTENTION_REQUIRED.
    expect(result.counts.failed).toBe(0);
    expect(result.reasonCounts).toEqual({ REQUEST_ACTIVE_HOLD: 1 });
    expect(result.status).toBe('ATTENTION_REQUIRED');
    expect(await ledgerFor('REQUEST', expired)).toMatchObject([{ estado: 'ATTENTION_REQUIRED' }]);
    const kept = (await q(
      `SELECT requester_name_encrypted, minimized_at FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [expired],
    )) as Array<{ requester_name_encrypted: string | null; minimized_at: Date | null }>;
    expect(kept[0]).toMatchObject({ requester_name_encrypted: 'sintetico', minimized_at: null });
  });

  it('CA-EXP-05/07: el job con payload manipulado no produce efectos', async () => {
    if (!baseDataSource || !service) throw new Error('Integración no inicializada.');
    const item = await makeTitular('b3-job');
    const queueStub = { add: jest.fn(async () => undefined) };
    const processor = new RetentionExpiryProcessor(
      baseDataSource,
      queueStub as never,
      service as never,
    );
    const runsBefore = (await q(
      `SELECT COUNT(*)::int AS n FROM "${schemaName}".privacy_retention_expiry_runs`,
    )) as Array<{ n: number }>;
    // Campos de más (schema, slug, titular): Zod estricto lo rechaza.
    await expect(
      processor.process({
        name: 'privacy-retention-expiry-tenant',
        data: { version: 1, tenantId, runId: randomUUID(), schemaName, slug: tenantSlug },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    // Tenant inexistente.
    await expect(
      processor.process({
        name: 'privacy-retention-expiry-tenant',
        data: { version: 1, tenantId: randomUUID(), runId: randomUUID() },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    // Tenant inactivo: apunta a un schema sin provisionar; resolveTenant lo
    // rechaza antes de tocar tablas tenant.
    const inactiveId = randomUUID();
    const inactiveSchema = `tenant_hexp_b3i_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    await baseDataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'H-EXP B3 inactivo', $2, $3, 'INACTIVE', 'hexp-b3i@invalid.example')`,
      [inactiveId, `hexp-b3i-${randomUUID().slice(0, 8)}`, inactiveSchema],
    );
    try {
      await expect(
        processor.process({
          name: 'privacy-retention-expiry-tenant',
          data: { version: 1, tenantId: inactiveId, runId: randomUUID() },
        } as never),
      ).rejects.toBeInstanceOf(UnrecoverableError);
    } finally {
      await baseDataSource.query('DELETE FROM public.tenants WHERE id = $1', [inactiveId]);
    }
    const runsAfter = (await q(
      `SELECT COUNT(*)::int AS n FROM "${schemaName}".privacy_retention_expiry_runs`,
    )) as Array<{ n: number }>;
    expect(runsAfter).toEqual(runsBefore);
    const kept = (await q(`SELECT first_name FROM "${schemaName}".subscribers WHERE id = $1`, [
      item.subscriberId,
    ])) as Array<{ first_name: string | null }>;
    expect(kept[0]?.first_name).toBe('Nombre sintético');
    await closeMark(item.partyId, item.requestId);
  });

  it('CA-EXP-14: dry-run no escribe dominio y el lote CONTINUE se retoma', async () => {
    const item = await makeTitular('b3-dry');
    const runsBefore = (await q(
      `SELECT COUNT(*)::int AS n FROM "${schemaName}".privacy_retention_expiry_runs`,
    )) as Array<{ n: number }>;
    const dry = await runBatch('2026-11-08', { dryRun: true });
    expect(dry.counts.titulares).toBe(1);
    // Dry-run no escribe dominio ni ledger: el conteo de corridas no cambia.
    expect(
      await q(`SELECT COUNT(*)::int AS n FROM "${schemaName}".privacy_retention_expiry_runs`),
    ).toEqual(runsBefore);
    const kept = (await q(`SELECT first_name FROM "${schemaName}".subscribers WHERE id = $1`, [
      item.subscriberId,
    ])) as Array<{ first_name: string | null }>;
    expect(kept[0]?.first_name).toBe('Nombre sintético');
    const applied = await runBatch();
    expect(applied.counts.titulares).toBe(1);
    expect(await ledgerFor('TITULAR', item.partyId)).toMatchObject([{ estado: 'COMPLETE' }]);
    // El hold de CA-EXP-07/08 persiste por diseño (su solicitud viva sigue
    // abierta): el lote global queda ATTENTION_REQUIRED y su ledger no se
    // duplica (unicidad por tipo, objetivo y versión de reglas).
    expect(applied.status).toBe('ATTENTION_REQUIRED');
    expect(applied.reasonCounts).toEqual({ REQUEST_ACTIVE_HOLD: 1 });
  });

  it('CA-EXP-09/15: el verificador H-EXP detecta vencida sin minimizar y tarea vencida', async () => {
    // El CLI antiguo no mira solicitudes: su conteo de hallazgos no cambia al
    // aparecer una vencida sin minimizar (contraste con el verificador H-EXP).
    const legacyBefore = await verifyAnonymizedTenant(baseDataSource!, schemaName, CLI_KEYS);
    const request = randomUUID();
    await q(
      `INSERT INTO "${schemaName}".data_subject_requests
         (id, requester_kind, kind, "right", status, received_at, due_at,
          identity_verification_method, identity_verified_at, identity_verified_by,
          requester_name_encrypted, response_text, resolved_at, resolved_by)
       VALUES ($1, 'TITULAR', 'CONSULTA', 'CONOCER', 'RESUELTA', '2019-01-10', '2019-01-24',
         'DOCUMENTO_PRESENCIAL', '2019-01-11T12:00:00Z', $2,
         'sintetico', 'Texto sintético', '2019-06-01T12:00:00Z', $2)`,
      [request, actorId],
    );
    await q(
      `INSERT INTO "${schemaName}".data_subject_request_tasks (request_id, kind, due_at)
       VALUES ($1, 'CLASIFICAR_DESTINO_TRASLADO', '2026-11-01')`,
      [request],
    );
    // El CLI antiguo no ve solicitudes: cero hallazgos nuevos sobre el mismo
    // schema aunque la vencida siga sin minimizar.
    const legacy = await verifyAnonymizedTenant(baseDataSource!, schemaName, CLI_KEYS);
    expect(legacy.findings).toEqual(legacyBefore.findings);
    // El verificador H-EXP sí las detecta.
    const verification = await runInTenantSchema(baseDataSource!, schemaName, (queryRunner) =>
      inTenant(() => service!.verifyTenant(queryRunner.manager, '2026-11-08')),
    );
    expect(verification.solicitudesVencidasSinMinimizar).toBeGreaterThanOrEqual(1);
    expect(verification.tareasClasificacionVencidas).toBeGreaterThanOrEqual(1);
    expect(verification.tenantConciliado).toBe(false);
    const pending = (await q(
      `SELECT minimized_at FROM "${schemaName}".data_subject_requests WHERE id = $1`,
      [request],
    )) as Array<{ minimized_at: Date | null }>;
    expect(pending[0]?.minimized_at).toBeNull();
  });
});
