import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { SubscriberStatus, PersonType, CustomerSegment } from '@iwana/shared';
import { ContractsService } from '../../contracts/contracts.service';
import { Contract } from '../../contracts/entities/contract.entity';
import { ContractStatus } from '../../enums/contract-status.enum';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import { AuditService } from '../../../audit/audit.service';
import { MediaService } from '../../../media/media.service';
import { SubscriberFiscalCompletenessService } from '../subscriber-fiscal-completeness.service';
import { Subscriber } from '../entities/subscriber.entity';
import { SubscriberLifecycleService } from '../subscriber-lifecycle.service';
import { decryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import { CrmContractImpersonationAdapter } from '../../privacy-adapters/crm-contract-impersonation.adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const tenantId = randomUUID();
const schemaName = `tenant_mod05_lifecycle_${randomUUID().replace(/-/g, '')}`;
const actorId = randomUUID();
const contractIds = [randomUUID(), randomUUID()];
const integrationCryptoKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const integrationMfaKeyHex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

describeWithDb('Ciclo de vida CRM: PostgreSQL real', () => {
  let dataSource: DataSource;
  let lifecycleService: SubscriberLifecycleService;
  let auditFailureAtContract: number | null;
  let contractAuditCount: number;
  const auditService = {
    logWithin: jest.fn(async (entry: { entityType: string }) => {
      if (entry.entityType !== 'Contract') return;
      contractAuditCount += 1;
      if (auditFailureAtContract === contractAuditCount) {
        throw new Error('synthetic transactional audit failure');
      }
    }),
  };
  const assetLoanReadPort = { findOpenContractIds: jest.fn().mockResolvedValue([]) };
  const executionOrderReadPort = { hasOpenWithdrawalOrders: jest.fn().mockResolvedValue(false) };

  const context = () => ({ tenantId, schemaName, tenantSlug: 'lifecycle-fixture' });
  const withTenant = <T>(callback: () => T): T => TenantContext.run(context(), callback);
  const qualified = (table: string) => `"${schemaName}"."${table}"`;

  async function insertSubscriber(status: SubscriberStatus): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${qualified('subscribers')} (id, tenant_id, status, person_type, customer_segment, activated_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [id, tenantId, status, PersonType.NATURAL, CustomerSegment.RESIDENTIAL],
    );
    return id;
  }

  async function insertContract(
    subscriberId: string,
    status: ContractStatus,
    id = randomUUID(),
  ): Promise<string> {
    await dataSource.query(
      `INSERT INTO ${qualified('contracts')}
        (id, tenant_id, subscriber_id, status, billing_cycle_day, plan_id, plan_snapshot_json, alias)
       VALUES ($1, $2, $3, $4, 1, 'fixture-plan', '{}'::jsonb, 'Servicio sint�tico')`,
      [id, tenantId, subscriberId, status],
    );
    return id;
  }

  async function lifecycleCount(): Promise<number> {
    const [row] = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${qualified('crm_lifecycle_changes')}`,
    )) as Array<{ count: number }>;
    return row?.count ?? 0;
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Subscriber, Contract],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    const quotedSchema = `"${schemaName}"`;
    await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);
    // Migración 012: enum tenant y columna obligatoria, sin default.
    await dataSource.query(`
      CREATE TYPE ${qualified('customer_segment_enum')} AS ENUM (
        'RESIDENTIAL', 'SOHO', 'PYME', 'CORPORATE', 'GOVERNMENT', 'WHOLESALE'
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${qualified('subscribers')} (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        status varchar(30) NOT NULL,
        person_type varchar(20) NOT NULL,
        customer_segment ${qualified('customer_segment_enum')} NOT NULL,
        party_id uuid,
        activated_at timestamptz,
        anonymized_at timestamptz,
        anonymized_request_id uuid,
        deleted_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${qualified('contracts')} (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        status varchar(30) NOT NULL,
        quote_id uuid,
        plan_id varchar(120) NOT NULL,
        plan_snapshot_json jsonb NOT NULL,
        alias varchar(120),
        installation_address varchar(255),
        installation_city varchar(120),
        installation_department varchar(120),
        installation_postal_code varchar(20),
        installation_notes text,
        customer_segment varchar(20),
        service_usage varchar(20),
        installation_stratum smallint,
        stratum_evidence_media_id uuid,
        vat_snapshot jsonb,
        additional_product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        additional_service_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        payment_method varchar(30),
        billing_cycle varchar(20),
        fiscal_name varchar(200),
        fiscal_document varchar(30),
        fiscal_document_encrypted varchar(500),
        fiscal_document_hmac varchar(64),
        fiscal_address varchar(255),
        start_date date,
        end_date date,
        created_at timestamptz NOT NULL DEFAULT now(),
        billing_cycle_day smallint,
        status_reason_code varchar(40),
        status_changed_at timestamptz,
        deleted_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${qualified('crm_billing_cycles')} (
        cycle_day smallint PRIMARY KEY,
        cutoff_day smallint NOT NULL,
        active boolean NOT NULL DEFAULT true
      )
    `);
    await dataSource.query(
      `INSERT INTO ${qualified('crm_billing_cycles')} (cycle_day, cutoff_day)
       VALUES (1, 15), (15, 30)`,
    );
    await dataSource.query(`
      CREATE TABLE ${qualified('crm_lifecycle_changes')} (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        entity_type varchar(16) NOT NULL,
        entity_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        from_status varchar(30) NOT NULL,
        to_status varchar(30) NOT NULL,
        reason_code varchar(40) NOT NULL,
        note_encrypted text,
        contract_scope_explicit boolean NOT NULL DEFAULT FALSE,
        source varchar(16) NOT NULL,
        batch_id uuid NOT NULL,
        actor_id uuid,
        changed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    auditFailureAtContract = null;
    contractAuditCount = 0;
    await dataSource.query(
      `TRUNCATE ${qualified('crm_lifecycle_changes')}, ${qualified('contracts')}, ${qualified('subscribers')}`,
    );
    lifecycleService = new SubscriberLifecycleService(
      dataSource,
      auditService as unknown as AuditService,
      assetLoanReadPort as never,
      executionOrderReadPort as never,
      new ConfigService({
        MFA_ENCRYPTION_KEY: integrationMfaKeyHex,
        PII_ENCRYPTION_KEY: integrationCryptoKeyHex,
      }),
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  it('RF-LC-16: bloquea la reactivación cuando el suscriptor está cancelado', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.CANCELLED);
    const contractId = await insertContract(subscriberId, ContractStatus.SUSPENDED);

    const error = await withTenant(() =>
      lifecycleService.transitionContract(
        contractId,
        'REACTIVATE',
        { reasonCode: 'PAGO_REGISTRADO' },
        actorId,
      ),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'SUBSCRIBER_CANCELLED',
    });
    expect(await lifecycleCount()).toBe(0);
  });

  it('avanza version en suspension y reactivacion aunque el reloj previo sea posterior', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const contractId = await insertContract(subscriberId, ContractStatus.ACTIVE);
    const previous = new Date(Date.now() + 60_000);
    await dataSource.query(`UPDATE ${qualified('contracts')} SET updated_at = $2 WHERE id = $1`, [
      contractId,
      previous,
    ]);
    await withTenant(() => lifecycleService.suspend(subscriberId, { reasonCode: 'MORA' }, actorId));
    const [suspended] = (await dataSource.query(
      `SELECT updated_at AS version FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ version: Date }>;
    expect(suspended!.version.getTime()).toBe(previous.getTime() + 1);
    await withTenant(() =>
      lifecycleService.reactivate(subscriberId, { reasonCode: 'PAGO_REGISTRADO' }, actorId),
    );
    const [reactivated] = (await dataSource.query(
      `SELECT updated_at AS version FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ version: Date }>;
    expect(reactivated!.version.getTime()).toBe(previous.getTime() + 2);
  });

  it('RF-LC-17: bloquea la activación nueva con suspensión vigente por mora', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.SUSPENDED);
    const contractId = await insertContract(subscriberId, ContractStatus.DRAFT);
    const [persistedContract] = (await dataSource.query(
      `SELECT updated_at AS "updatedAt" FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ updatedAt: Date }>;
    await dataSource.query(
      `INSERT INTO ${qualified('crm_lifecycle_changes')}
        (tenant_id, entity_type, entity_id, subscriber_id, from_status, to_status,
         reason_code, note_encrypted, source, batch_id, actor_id)
       VALUES ($1, 'SUBSCRIBER', $2, $2, 'ACTIVE', 'SUSPENDED', 'MORA', NULL, 'MANUAL', $3, $4)`,
      [tenantId, subscriberId, randomUUID(), actorId],
    );
    const contractsService = new ContractsService(
      dataSource,
      {} as CommercialCatalogReadPort,
      {} as IInternetVatResolverPort,
      auditService as unknown as AuditService,
      {} as MediaService,
      {
        get: (_key: string, fallback?: unknown) => fallback,
        getOrThrow: () => integrationCryptoKeyHex,
      } as unknown as ConfigService,
      {} as SubscriberFiscalCompletenessService,
      lifecycleService,
    );
    jest.spyOn(contractsService, 'findOne').mockResolvedValue(
      Object.assign(new Contract(), {
        id: contractId,
        tenantId,
        subscriberId,
        status: ContractStatus.DRAFT,
        updatedAt: persistedContract!.updatedAt,
      }),
    );

    const error = await withTenant(() => contractsService.activate(contractId, actorId)).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY',
    });
  });

  it('avanza exactamente 1 ms al borrar borradores al cancelar, aun con versión futura', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const contractId = await insertContract(subscriberId, ContractStatus.DRAFT);
    const previous = new Date(Date.now() + 60_000);
    await dataSource.query(`UPDATE ${qualified('contracts')} SET updated_at = $2 WHERE id = $1`, [
      contractId,
      previous,
    ]);

    const cancelled = await withTenant(() =>
      lifecycleService.cancelSubscriber(
        subscriberId,
        { targetStatus: SubscriberStatus.CANCELLED, reasonCode: 'SOLICITUD_TITULAR' },
        actorId,
      ),
    );

    const [contract] = (await dataSource.query(
      `SELECT updated_at AS version, deleted_at AS "deletedAt" FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ version: Date; deletedAt: Date | null }>;
    expect(cancelled.status).toBe(SubscriberStatus.CANCELLED);
    expect(contract!.deletedAt).toBeInstanceOf(Date);
    expect(contract!.version.getTime()).toBe(previous.getTime() + 1);
    expect(contract!.version.getTime()).toBeGreaterThan(previous.getTime());
  });

  it('avanza exactamente 1 ms al suspender por suplantación y no cambia versión al reintentar', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const partyId = randomUUID();
    const contractId = await insertContract(subscriberId, ContractStatus.ACTIVE);
    const previous = new Date(Date.now() + 60_000);
    await dataSource.query(`UPDATE ${qualified('subscribers')} SET party_id = $2 WHERE id = $1`, [
      subscriberId,
      partyId,
    ]);
    await dataSource.query(`UPDATE ${qualified('contracts')} SET updated_at = $2 WHERE id = $1`, [
      contractId,
      previous,
    ]);
    const events = new EventEmitter2();
    const emit = jest.spyOn(events, 'emitAsync');
    const adapter = new CrmContractImpersonationAdapter(
      dataSource,
      events,
      auditService as unknown as AuditService,
    );
    const input = { partyId, contractIds: [contractId], requestId: randomUUID(), actorId };
    const result = await withTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        adapter.suspendForImpersonation(input, { manager: qr.manager }),
      ),
    );
    const [suspended] = (await dataSource.query(
      `SELECT status, updated_at AS version FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ status: ContractStatus; version: Date }>;
    expect(result.suspendedContractIds).toEqual([contractId]);
    expect(suspended!.status).toBe(ContractStatus.SUSPENDED);
    expect(suspended!.version.getTime()).toBe(previous.getTime() + 1);
    expect(suspended!.version.getTime()).toBeGreaterThan(previous.getTime());
    expect(emit).toHaveBeenCalledWith(
      'crm.contract.suspended',
      expect.objectContaining({ contractId, reason: 'SUPLANTACION' }),
    );

    await withTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        adapter.suspendForImpersonation(input, { manager: qr.manager }),
      ),
    );
    const [retried] = (await dataSource.query(
      `SELECT updated_at AS version FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ version: Date }>;
    expect(retried!.version.getTime()).toBe(suspended!.version.getTime());
    expect(emit).toHaveBeenCalledTimes(1);
    emit.mockRestore();
  });

  it('RF-LC-18: cancela solo si no hay servicios vivos y devuelve sus IDs al bloquear', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const liveContractId = await insertContract(subscriberId, ContractStatus.ACTIVE);

    const error = await withTenant(() =>
      lifecycleService.cancelSubscriber(
        subscriberId,
        { targetStatus: SubscriberStatus.CANCELLED, reasonCode: 'SOLICITUD_TITULAR' },
        actorId,
      ),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'SUBSCRIBER_HAS_LIVE_CONTRACTS',
      contractIds: [liveContractId],
    });
    expect(await lifecycleCount()).toBe(0);
  });

  it('CA-LC-06: la vista previa no altera contratos, suscriptor ni historial', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const contractId = await insertContract(subscriberId, ContractStatus.ACTIVE);
    const beforeHistory = await lifecycleCount();

    const preview = await withTenant(() =>
      lifecycleService.preview(subscriberId, { action: 'SUSPEND', reasonCode: 'MORA' }),
    );

    const [contract] = (await dataSource.query(
      `SELECT status FROM ${qualified('contracts')} WHERE id = $1`,
      [contractId],
    )) as Array<{ status: ContractStatus }>;
    const [subscriber] = (await dataSource.query(
      `SELECT status FROM ${qualified('subscribers')} WHERE id = $1`,
      [subscriberId],
    )) as Array<{ status: SubscriberStatus }>;
    expect(preview.affectedContracts).toEqual([
      { id: contractId, fromStatus: ContractStatus.ACTIVE, toStatus: ContractStatus.SUSPENDED },
    ]);
    expect(contract?.status).toBe(ContractStatus.ACTIVE);
    expect(subscriber?.status).toBe(SubscriberStatus.ACTIVE);
    expect(await lifecycleCount()).toBe(beforeHistory);
    expect(auditService.logWithin).not.toHaveBeenCalled();
  });

  it('CA-LC-01 y CA-LC-07: conserva batch común y revierte el lote si falla a mitad', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    await insertContract(subscriberId, ContractStatus.ACTIVE, contractIds[0]);
    await insertContract(subscriberId, ContractStatus.ACTIVE, contractIds[1]);
    auditFailureAtContract = 2;

    await expect(
      withTenant(() => lifecycleService.suspend(subscriberId, { reasonCode: 'MORA' }, actorId)),
    ).rejects.toThrow('synthetic transactional audit failure');

    const contracts = (await dataSource.query(
      `SELECT id, status FROM ${qualified('contracts')} WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [contractIds],
    )) as Array<{ id: string; status: ContractStatus }>;
    const [subscriber] = (await dataSource.query(
      `SELECT status FROM ${qualified('subscribers')} WHERE id = $1`,
      [subscriberId],
    )) as Array<{ status: SubscriberStatus }>;
    expect(contracts).toEqual(
      [...contractIds].sort().map((id) => ({ id, status: ContractStatus.ACTIVE })),
    );
    expect(subscriber?.status).toBe(SubscriberStatus.ACTIVE);
    expect(await lifecycleCount()).toBe(0);
  });

  it('CA-LC-01: completa un lote con una sola batch_id y estado derivado persistido', async () => {
    auditFailureAtContract = null;
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    await insertContract(subscriberId, ContractStatus.ACTIVE);
    await insertContract(subscriberId, ContractStatus.ACTIVE);

    const result = await withTenant(() =>
      lifecycleService.suspend(subscriberId, { reasonCode: 'MORA' }, actorId),
    );
    const rows = (await dataSource.query(
      `SELECT entity_type, batch_id FROM ${qualified('crm_lifecycle_changes')}
        WHERE subscriber_id = $1`,
      [subscriberId],
    )) as Array<{ entity_type: string; batch_id: string }>;
    const [subscriber] = (await dataSource.query(
      `SELECT status FROM ${qualified('subscribers')} WHERE id = $1`,
      [subscriberId],
    )) as Array<{ status: SubscriberStatus }>;

    expect(rows).toHaveLength(3);
    expect(rows.map(({ batch_id }) => batch_id)).toEqual([
      result.batchId,
      result.batchId,
      result.batchId,
    ]);
    expect(rows.filter(({ entity_type }) => entity_type === 'SUBSCRIBER')).toHaveLength(1);
    expect(subscriber?.status).toBe(SubscriberStatus.SUSPENDED);
  });

  it('Q3: cifra las notas en reposo y solo las descifra al leer historial autorizado', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const contractId = await insertContract(subscriberId, ContractStatus.ACTIVE);
    const privateNote = 'Nota sintética de motivo';

    await withTenant(() =>
      lifecycleService.suspend(
        subscriberId,
        { reasonCode: 'MORA', contractIds: [contractId], note: privateNote },
        actorId,
      ),
    );

    const rows = (await dataSource.query(
      `SELECT note_encrypted, contract_scope_explicit
         FROM ${qualified('crm_lifecycle_changes')}
        WHERE subscriber_id = $1`,
      [subscriberId],
    )) as Array<{ note_encrypted: string | null; contract_scope_explicit: boolean }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.note_encrypted !== privateNote)).toBe(true);
    expect(rows.every((row) => row.contract_scope_explicit)).toBe(true);
    expect(rows[0]?.note_encrypted).toBeTruthy();
    expect(
      decryptAes256Gcm(rows[0]!.note_encrypted!, Buffer.from(integrationCryptoKeyHex, 'hex')),
    ).toBe(privateNote);

    const authorized = await withTenant(() =>
      lifecycleService.listHistory(subscriberId, { canReadNote: true }),
    );
    expect(authorized.data.every((row) => row.note === privateNote)).toBe(true);

    const denied = await withTenant(() =>
      lifecycleService.listHistory(subscriberId, { canReadNote: false }),
    );
    expect(denied.data.every((row) => !('note' in row))).toBe(true);
  });

  it('P2: rechaza reintento sin alcance explícito cuando la clave fijó contractIds', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const selectedContract = await insertContract(subscriberId, ContractStatus.ACTIVE);
    await insertContract(subscriberId, ContractStatus.ACTIVE);
    const idempotencyKey = 'explicit-scope-key';

    await withTenant(() =>
      lifecycleService.suspend(
        subscriberId,
        { reasonCode: 'MORA', contractIds: [selectedContract] },
        actorId,
        idempotencyKey,
      ),
    );
    const historyBeforeRetry = await lifecycleCount();

    const error = await withTenant(() =>
      lifecycleService.suspend(subscriberId, { reasonCode: 'MORA' }, actorId, idempotencyKey),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
    expect(await lifecycleCount()).toBe(historyBeforeRetry);
  });
});
