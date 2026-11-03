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
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

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
    // Columnas obligatorias del esquema migrado (persona natural y responsabilidad fiscal).
    await dataSource.query(
      `INSERT INTO ${qualified('subscribers')}
        (id, tenant_id, status, person_type, customer_segment, activated_at, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment, vat_responsibility,
         address, created_by)
       VALUES ($1, $2, $3, $4, $5, now(), 'CC', 'sintetico-cifrado', 'Titular', 'Sintético', 3,
               'STANDARD', 'RESPONSABLE', 'Dirección sintética', $6)`,
      [id, tenantId, status, PersonType.NATURAL, CustomerSegment.RESIDENTIAL, actorId],
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

  // Los UPDATE sobre contracts disparan el trigger de 169, que resuelve `subscribers` sin esquema.
  const inSchema = (sql: string, params?: unknown[]) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(sql, params));

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
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Lifecycle sintético',
        `lifecycle-${tenantId.slice(0, 8)}`,
        schemaName,
        'lifecycle@example.invalid',
      ],
    );
    // El esquema lo crea la cadena de migraciones del tenant (B3): incluye terminated_at (170)
    // y los triggers reales, no un DDL escrito a mano.
    await dataSource.query(`CREATE SCHEMA ${quotedSchema}`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `lifecycle-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
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
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
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
    await inSchema(`UPDATE ${qualified('contracts')} SET updated_at = $2 WHERE id = $1`, [
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

  it('TERMINATE fija terminated_at y conserva un ancla anterior (B1-F, CA-O1-08)', async () => {
    const subscriberId = await insertSubscriber(SubscriberStatus.ACTIVE);
    const fresh = await insertContract(subscriberId, ContractStatus.ACTIVE);
    const anchored = await insertContract(subscriberId, ContractStatus.ACTIVE);
    const previousAnchor = new Date('2020-01-01T00:00:00.000Z');
    await inSchema(`UPDATE ${qualified('contracts')} SET terminated_at = $2 WHERE id = $1`, [
      anchored,
      previousAnchor,
    ]);

    await withTenant(() =>
      lifecycleService.terminate(
        subscriberId,
        { reasonCode: 'SOLICITUD_TITULAR', contractIds: [fresh, anchored] },
        actorId,
      ),
    );

    const rows = (await dataSource.query(
      `SELECT id, status, terminated_at AS "terminatedAt" FROM ${qualified('contracts')}
        WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[fresh, anchored]],
    )) as Array<{ id: string; status: string; terminatedAt: Date | null }>;
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(fresh)).toMatchObject({ status: ContractStatus.TERMINATED });
    expect(byId.get(fresh)?.terminatedAt).toBeInstanceOf(Date);
    expect(byId.get(anchored)).toMatchObject({ status: ContractStatus.TERMINATED });
    expect(byId.get(anchored)?.terminatedAt?.getTime()).toBe(previousAnchor.getTime());
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
    await inSchema(`UPDATE ${qualified('contracts')} SET updated_at = $2 WHERE id = $1`, [
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
    await inSchema(`UPDATE ${qualified('contracts')} SET updated_at = $2 WHERE id = $1`, [
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
