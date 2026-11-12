import {
  createBillingTenantFixture,
  dropBillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { createHash, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, QueryRunner } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction, BILLING_ERROR_CODES } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingPaymentsService } from './billing-payments.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function canonicalAllocations(
  allocations: Array<{ documentId: string; amount: string | number }> | undefined,
): Array<{ documentId: string; amount: string }> | null {
  if (allocations === undefined) return null;
  return allocations
    .map(({ documentId, amount }) => ({
      documentId,
      amount: typeof amount === 'number' ? amount.toFixed(2) : Number(amount).toFixed(2),
    }))
    .sort(
      (left, right) =>
        left.documentId.localeCompare(right.documentId) || left.amount.localeCompare(right.amount),
    );
}

function fingerprint(
  allocations: Array<{ documentId: string; amount: string | number }> | undefined,
): string | null {
  const canonical = canonicalAllocations(allocations);
  return canonical === null
    ? null
    : createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

describeWithDb('BillingPaymentsService contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: BillingPaymentsService;
  let tenantId: string;
  let schemaName: string;
  let billingFixture: Awaited<ReturnType<typeof createBillingTenantFixture>> | undefined;
  let actorId: string;
  let subscriberId: string;
  let contractId: string;
  let periodId: string;
  let documentId: string;
  let partyId: string;
  let events: EventEmitter2;
  let audit: jest.Mocked<Pick<AuditService, 'logWithin'>>;
  let contractReadPort: jest.Mocked<
    Pick<
      BillingContractReadPort,
      | 'findTitularRefs'
      | 'lockTitularForBillingWrite'
      | 'findTitularDisplayNames'
      | 'hasImpersonationSuspension'
      | 'findActiveContractIds'
    >
  >;
  let activeMarks: Record<string, string[]>;
  const readPrivacyMarks = jest.fn(async (partyIds: string[]) =>
    Object.fromEntries(partyIds.map((id) => [id, activeMarks[id] ?? []])),
  );

  const tenantContext = () => ({ tenantId, schemaName, tenantSlug: 'billing-payments-it' });

  async function insertPayment(input: {
    amount: string;
    key: string;
    fingerprint?: string | null;
    paidAt?: string;
  }): Promise<string> {
    const id = randomUUID();
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `INSERT INTO billing_payments (
           id, tenant_id, subscriber_id, method, amount, paid_at, idempotency_key,
           allocations_fingerprint, created_by
         ) VALUES ($1, $2, $3, 'TRANSFERENCIA', $4, $8, $5, $6, $7)`,
        [
          id,
          tenantId,
          subscriberId,
          input.amount,
          input.key,
          input.fingerprint ?? null,
          actorId,
          input.paidAt ?? '2026-11-05',
        ],
      ),
    );
    return id;
  }

  it('lista pagos en data y meta con paginación exacta', async () => {
    await insertPayment({ amount: '10.00', key: 'br5-list-1' });
    const latestId = await insertPayment({
      amount: '20.00',
      key: 'br5-list-2',
      paidAt: '2026-11-06',
    });

    const result = await TenantContext.run(tenantContext(), () =>
      service.listPayments({ page: 1, limit: 1 }),
    );

    expect(result).toEqual({
      data: [expect.objectContaining({ id: latestId, amount: '20.00' })],
      meta: {
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
        totalIsEstimate: false,
        mode: 'page',
        nextCursor: null,
        hasMore: true,
        capabilities: { randomAccess: true, sortableFields: [] },
        sort: null,
      },
    });
  });

  it('completa 20 listados concurrentes con un pool de 10 y audita cada acceso', async () => {
    const paymentId = await insertPayment({ amount: '20.00', key: 'br7-concurrent-list' });
    // Cada puerto toma una conexión del mismo pool, como sus adaptadores de producción.
    const readThroughPool = <T>(result: T) =>
      runInTenantSchema(dataSource, schemaName, async (qr) => {
        await qr.query('SELECT 1');
        return result;
      });
    contractReadPort.findTitularRefs.mockImplementation(() =>
      readThroughPool([{ subscriberId, partyId, anonymized: false }]),
    );
    contractReadPort.findTitularDisplayNames.mockImplementation(() =>
      readThroughPool([{ subscriberId, displayName: 'Nombre de prueba' }]),
    );
    readPrivacyMarks.mockImplementation(() => readThroughPool({ [partyId]: ['DATOS_BLOQUEADOS'] }));

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        TenantContext.run(tenantContext(), () =>
          service.listPayments({}, { actorId, canSeeBlocked: true, grantedBy: 'PRIVACY_READ' }),
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      expect(result.value.data).toEqual([
        expect.objectContaining({
          id: paymentId,
          subscriberDisplayName: 'Nombre de prueba',
          subscriberProtected: false,
        }),
      ]);
    }
    expect(audit.logWithin).toHaveBeenCalledTimes(20);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LIST_ACCESS,
        userId: actorId,
        newValue: { totalServed: 1, blockedServed: 1, grantedBy: 'PRIVACY_READ' },
      }),
      expect.anything(),
    );
  });

  async function insertDocument(input: { total: string; dueDate?: string }): Promise<string> {
    const id = randomUUID();
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO billing_documents (
           id, tenant_id, period_id, contract_id, subscriber_id, status, issue_date,
           due_date, subtotal, tax_total, total, buyer_snapshot
         ) VALUES ($1, $2, $3, $4, $5, 'EMITIDO', '2026-11-01', $6, $7, 0, $7, $8::jsonb)`,
        [
          id,
          tenantId,
          periodId,
          contractId,
          subscriberId,
          input.dueDate ?? '2026-11-14',
          input.total,
          JSON.stringify({ displayName: 'Nombre de prueba', address: 'Dirección de prueba' }),
        ],
      );
    });
    return id;
  }

  async function countRows(table: string): Promise<number> {
    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(`SELECT COUNT(*)::int AS total FROM ${quoteIdentifier(table)}`),
    )) as Array<{ total: number }>;
    const row = rows[0];
    if (!row) throw new Error(`No se pudo contar la tabla ${table}.`);
    return row.total;
  }

  async function signalState(): Promise<boolean | null> {
    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT paid FROM billing_period_signals WHERE period_id = $1', [periodId]),
    )) as Array<{ paid: boolean }>;
    return rows[0]?.paid ?? null;
  }

  // Fila mínima válida para el esquema migrado (persona natural con datos fiscales).
  async function insertSubscriberRow(qr: QueryRunner): Promise<void> {
    await qr.query(
      `INSERT INTO subscribers
        (id, tenant_id, party_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment,
         vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
               'Titular', 'Sintético', 3, 'STANDARD', 'RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
  }

  async function insertContractRow(qr: QueryRunner, id: string): Promise<void> {
    await qr.query(
      `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_id, plan_snapshot_json)
       VALUES ($1, $2, $3, $4, 'fixture-plan', '{}'::jsonb)`,
      [id, tenantId, subscriberId, 'ACTIVE'],
    );
  }

  async function seedBaseTables(): Promise<void> {
    // El esquema ya viene de la cadena de migraciones del tenant (subscribers, contracts,
    // party_privacy_marks y las tablas de facturación reales). test_privacy_access_audit es un
    // sumidero solo de prueba: registra las auditorías de privacidad que emite el mock de
    // AuditService.logWithin y no existe en la cadena.
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(`
        CREATE TABLE test_privacy_access_audit (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_id uuid NOT NULL,
          actor_id uuid NOT NULL, action text NOT NULL, privacy_mark text NOT NULL
        );
      `);
      await insertContractRow(qr, contractId);
      await insertSubscriberRow(qr);
      await qr.query(
        `INSERT INTO billing_periods (
           id, tenant_id, contract_id, subscriber_id, period_start, due_date, period_end, covered_start, generation_date, effective_policy
         ) VALUES ($1, $2, $3, $4, '2026-11-01', '2026-11-14', '2026-11-30', '2026-11-01', '2026-11-01', '{}'::jsonb)`,
        [periodId, tenantId, contractId, subscriberId],
      );
    });
  }

  beforeAll(async () => {
    tenantId = randomUUID();
    schemaName = `tenant_billing_payments_it_${randomUUID().replace(/-/gu, '')}`;
    actorId = randomUUID();
    subscriberId = randomUUID();
    contractId = randomUUID();
    periodId = randomUUID();
    documentId = randomUUID();
    partyId = randomUUID();
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
    });
    await dataSource.initialize();
    const fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    billingFixture = fixture;
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    await fixture.queryRunner.release();
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `billing-payments-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    await seedBaseTables();

    events = new EventEmitter2();
    audit = {
      logWithin: jest.fn().mockImplementation(async (entry, manager) => {
        if (entry.newValue?.['privacyMark']) {
          await manager.query(
            `INSERT INTO test_privacy_access_audit (entity_id, actor_id, action, privacy_mark)
             VALUES ($1, $2, $3, $4)`,
            [entry.entityId, entry.userId, entry.action, entry.newValue['privacyMark']],
          );
        }
      }),
    } as never;
    contractReadPort = {
      findTitularRefs: jest.fn(),
      lockTitularForBillingWrite: jest.fn(),
      findTitularDisplayNames: jest.fn(),
      hasImpersonationSuspension: jest.fn().mockResolvedValue(false),
      findActiveContractIds: jest.fn().mockResolvedValue([]),
    };
    contractReadPort.findTitularRefs.mockImplementation(async (ids) =>
      ids.includes(subscriberId) ? [{ subscriberId, partyId, anonymized: false }] : [],
    );
    contractReadPort.findTitularDisplayNames.mockImplementation(async (ids) =>
      ids.includes(subscriberId) ? [{ subscriberId, displayName: 'Nombre de prueba' }] : [],
    );
    contractReadPort.hasImpersonationSuspension.mockResolvedValue(false);
    contractReadPort.lockTitularForBillingWrite.mockImplementation(async (id) => ({
      exists: id === subscriberId,
      partyId: id === subscriberId ? partyId : null,
      anonymized: false,
    }));
    activeMarks = {};
    const privacyMarksReadPort = { activeMarks: readPrivacyMarks };
    service = new BillingPaymentsService(
      dataSource,
      contractReadPort as never,
      audit as never,
      events,
      privacyMarksReadPort as never,
      { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) } as never,
    );
  });

  beforeEach(async () => {
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        'TRUNCATE billing_period_signals, billing_payment_allocations, billing_payments, billing_documents, billing_periods RESTART IDENTITY CASCADE',
      );
      await qr.query('DELETE FROM test_privacy_access_audit');
      await qr.query('DELETE FROM party_privacy_marks');
      await qr.query('DELETE FROM subscribers');
      await qr.query('DELETE FROM contracts');
      await insertContractRow(qr, contractId);
      await insertSubscriberRow(qr);
      await qr.query(
        `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start, due_date, period_end, covered_start, generation_date, effective_policy)
         VALUES ($1, $2, $3, $4, '2026-11-01', '2026-11-14', '2026-11-30', '2026-11-01', '2026-11-01', '{}'::jsonb)`,
        [periodId, tenantId, contractId, subscriberId],
      );
    });
    jest.clearAllMocks();
    readPrivacyMarks.mockImplementation(async (partyIds) =>
      Object.fromEntries(partyIds.map((id) => [id, activeMarks[id] ?? []])),
    );
    contractReadPort.findTitularRefs.mockImplementation(async (ids) =>
      ids.includes(subscriberId) ? [{ subscriberId, partyId, anonymized: false }] : [],
    );
    contractReadPort.findTitularDisplayNames.mockImplementation(async (ids) =>
      ids.includes(subscriberId) ? [{ subscriberId, displayName: 'Nombre de prueba' }] : [],
    );
    contractReadPort.lockTitularForBillingWrite.mockImplementation(async (id) => ({
      exists: id === subscriberId,
      partyId: id === subscriberId ? partyId : null,
      anonymized: false,
    }));
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, billingFixture);
  });

  it('registra pago, aplicación y señal en la misma transacción; emite solo tras commit', async () => {
    const issuedDocument = await insertDocument({ total: '100.00' });
    const originalEmitAsync = jest.fn().mockResolvedValue([]);
    events.emitAsync = originalEmitAsync;
    const amount = '100.00';

    const response = await TenantContext.run(tenantContext(), () =>
      service.registerPayment(
        {
          subscriberId,
          method: 'TRANSFERENCIA',
          amount,
          paidAt: '2026-11-05',
          allocations: [{ documentId: issuedDocument, amount }],
        },
        'billing-payment-key-1',
        actorId,
      ),
    );

    expect(response.allocatedAmount).toBe('100.00');
    expect(await countRows('billing_payments')).toBe(1);
    expect(await countRows('billing_payment_allocations')).toBe(1);
    expect(await signalState()).toBe(true);
    expect(originalEmitAsync).toHaveBeenCalledTimes(1);
    expect(originalEmitAsync).toHaveBeenCalledWith(
      'billing.contract-period.paid',
      expect.objectContaining({ tenantId, contractId, periodId }),
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CREATE, entityType: 'BillingPayment' }),
      expect.anything(),
    );
    const paymentRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT status, allocations_fingerprint FROM billing_payments WHERE id = $1', [
        response.id,
      ]),
    )) as Array<{ status: string; allocations_fingerprint: string | null }>;
    expect(paymentRows[0]?.status).toBe('REGISTRADO');
    expect(paymentRows[0]?.allocations_fingerprint).toBe(
      fingerprint([{ documentId: issuedDocument, amount }]),
    );
  });

  it('reintenta con mismo cuerpo tras revertir la aplicación; el cuerpo distinto con clave igual da 409', async () => {
    const issuedDocument = await insertDocument({ total: '100.00' });
    const command = {
      subscriberId,
      method: 'TRANSFERENCIA',
      amount: '100.00',
      paidAt: '2026-11-05',
      allocations: [{ documentId: issuedDocument, amount: '40.00' }],
    };
    const first = await TenantContext.run(tenantContext(), () =>
      service.registerPayment(command, 'billing-payment-key-retry', actorId),
    );
    await TenantContext.run(tenantContext(), () =>
      service.voidPayment(first.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId),
    );

    await expect(
      TenantContext.run(tenantContext(), () =>
        service.registerPayment(command, 'billing-payment-key-retry', actorId),
      ),
    ).resolves.toMatchObject({ id: first.id, status: 'ANULADO' });
    await expect(
      TenantContext.run(tenantContext(), () =>
        service.registerPayment(
          { ...command, allocations: [{ documentId: issuedDocument, amount: '41.00' }] },
          'billing-payment-key-retry',
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED },
    });
    expect(await countRows('billing_payments')).toBe(1);
  });

  it('distingue allocations omitidas y vacías en allocations_fingerprint', async () => {
    const withoutAllocations = await TenantContext.run(tenantContext(), () =>
      service.registerPayment(
        { subscriberId, method: 'TRANSFERENCIA', amount: '20.00', paidAt: '2026-11-05' },
        'billing-payment-no-allocations',
        actorId,
      ),
    );
    const withEmptyAllocations = await TenantContext.run(tenantContext(), () =>
      service.registerPayment(
        {
          subscriberId,
          method: 'TRANSFERENCIA',
          amount: '20.00',
          paidAt: '2026-11-05',
          allocations: [],
        },
        'billing-payment-empty-allocations',
        actorId,
      ),
    );

    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT id, allocations_fingerprint FROM billing_payments WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [[withoutAllocations.id, withEmptyAllocations.id]],
      ),
    )) as Array<{ id: string; allocations_fingerprint: string | null }>;
    expect(rows.find(({ id }) => id === withoutAllocations.id)?.allocations_fingerprint).toBeNull();
    expect(rows.find(({ id }) => id === withEmptyAllocations.id)?.allocations_fingerprint).toBe(
      fingerprint([]),
    );
  });

  it('calcula saldo a favor entre contratos del suscriptor (D-BIL-12) y lo aplica a otro contrato', async () => {
    const firstDocument = await insertDocument({ total: '60.00' });
    const paymentId = await insertPayment({
      amount: '75.00',
      key: 'billing-credit-across-contracts',
    });
    const otherContractId = randomUUID();
    const otherPeriodId = randomUUID();
    const otherDocumentId = randomUUID();
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await insertContractRow(qr, otherContractId);
      await qr.query(
        `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start, due_date, period_end, covered_start, generation_date, effective_policy)
         VALUES ($1, $2, $3, $4, '2026-12-01', '2026-12-14', '2026-12-31', '2026-12-01', '2026-12-01', '{}'::jsonb)`,
        [otherPeriodId, tenantId, otherContractId, subscriberId],
      );
      await qr.query(
        `INSERT INTO billing_documents (
           id, tenant_id, period_id, contract_id, subscriber_id, status, issue_date,
           due_date, subtotal, tax_total, total, buyer_snapshot
         ) VALUES ($1, $2, $3, $4, $5, 'EMITIDO', '2026-12-01', '2026-12-14', 50, 0, 50, NULL)`,
        [otherDocumentId, tenantId, otherPeriodId, otherContractId, subscriberId],
      );
    });

    await TenantContext.run(tenantContext(), () =>
      service.allocateCredit(
        paymentId,
        {
          subscriberId,
          allocations: [{ paymentId, documentId: otherDocumentId, amount: '50.00' }],
        },
        actorId,
      ),
    );
    const statement = await TenantContext.run(tenantContext(), () =>
      service.statementForSubscriber(subscriberId, actorId, { canSeeBlocked: false }),
    );

    expect(statement.creditBalance).toBe('25.00');
    expect(statement.totalInvoiced).toBe('110.00');
    expect(statement.totalPaid).toBe('50.00');
    expect(statement.totalPending).toBe('60.00');
    expect(statement.contractSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contractId, totalInvoiced: '60.00', totalPending: '60.00' }),
        expect.objectContaining({
          contractId: otherContractId,
          totalInvoiced: '50.00',
          totalPaid: '50.00',
          totalPending: '0.00',
        }),
      ]),
    );
    expect(firstDocument).toBeDefined();
  });

  it('responde 404 BILLING_SUBSCRIBER_NOT_FOUND si la validación transaccional dice exists:false', async () => {
    contractReadPort.lockTitularForBillingWrite.mockResolvedValueOnce({
      exists: false,
      partyId: null,
      anonymized: false,
    });
    await expect(
      TenantContext.run(tenantContext(), () =>
        service.registerPayment(
          { subscriberId, method: 'TRANSFERENCIA', amount: '20.00', paidAt: '2026-11-05' },
          'billing-payment-missing-subscriber',
          actorId,
        ),
      ),
    ).rejects.toMatchObject({ status: 404, response: { code: 'BILLING_SUBSCRIBER_NOT_FOUND' } });
    expect(await countRows('billing_payments')).toBe(0);
  });

  it('oculta la snapshot del titular bloqueado y audita antes de revelar con permiso', async () => {
    const issuedDocument = await insertDocument({ total: '45.00' });
    activeMarks[partyId] = ['DATOS_BLOQUEADOS'];

    const hidden = await TenantContext.run(tenantContext(), () =>
      service.statementForSubscriber(subscriberId, actorId, { canSeeBlocked: false }),
    );
    expect(hidden.buyerProtected).toBe(true);
    expect(hidden.documents.find(({ id }) => id === issuedDocument)?.buyerSnapshot).toMatchObject({
      displayName: '[Dato protegido por custodia legal]',
      documentNumber: null,
    });
    expect(hidden.documents.find(({ id }) => id === issuedDocument)?.buyerProtected).toBe(true);
    expect(await countRows('test_privacy_access_audit')).toBe(0);

    const revealed = await TenantContext.run(tenantContext(), () =>
      service.statementForSubscriber(subscriberId, actorId, {
        canSeeBlocked: true,
        grantedBy: 'PRIVACY_READ',
      }),
    );
    expect(revealed.documents.find(({ id }) => id === issuedDocument)?.buyerSnapshot).toMatchObject(
      {
        displayName: 'Nombre de prueba',
      },
    );
    const auditRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        'SELECT actor_id, action, privacy_mark FROM test_privacy_access_audit WHERE entity_id = $1',
        [subscriberId],
      ),
    )) as Array<{ actor_id: string; action: string; privacy_mark: string }>;
    expect(auditRows).toEqual([
      { actor_id: actorId, action: 'RECORD_ACCESS', privacy_mark: 'DATOS_BLOQUEADOS' },
    ]);
  });

  it('serializa aplicaciones concurrentes al mismo documento y no excede saldo ni cambia CRM', async () => {
    const issuedDocument = await insertDocument({ total: '100.00' });
    const paymentA = await insertPayment({ amount: '80.00', key: 'billing-concurrent-a' });
    const paymentB = await insertPayment({ amount: '80.00', key: 'billing-concurrent-b' });
    const contractBefore = (await dataSource.query(
      'SELECT status FROM ' + quoteIdentifier(schemaName) + '.contracts WHERE id = $1',
      [contractId],
    )) as Array<{ status: string }>;
    const subjectBefore = (await dataSource.query(
      'SELECT anonymized_at FROM ' + quoteIdentifier(schemaName) + '.subscribers WHERE id = $1',
      [subscriberId],
    )) as Array<{ anonymized_at: Date | null }>;

    const attempts = await Promise.allSettled(
      [paymentA, paymentB].map((paymentId) =>
        TenantContext.run(tenantContext(), () =>
          service.allocateCredit(
            paymentId,
            {
              subscriberId,
              allocations: [{ paymentId, documentId: issuedDocument, amount: '80.00' }],
            },
            actorId,
          ),
        ),
      ),
    );

    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const allocationRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric(14,2)::text AS "totalAllocated"
           FROM billing_payment_allocations WHERE document_id = $1 AND reversed_at IS NULL`,
        [issuedDocument],
      ),
    )) as Array<{ totalAllocated: string }>;
    expect(allocationRows[0]?.totalAllocated).toBe('80.00');
    expect(await signalState()).toBe(false);
    const contractAfter = (await dataSource.query(
      'SELECT status FROM ' + quoteIdentifier(schemaName) + '.contracts WHERE id = $1',
      [contractId],
    )) as Array<{ status: string }>;
    const subjectAfter = (await dataSource.query(
      'SELECT anonymized_at FROM ' + quoteIdentifier(schemaName) + '.subscribers WHERE id = $1',
      [subscriberId],
    )) as Array<{ anonymized_at: Date | null }>;
    expect(contractAfter).toEqual(contractBefore);
    expect(subjectAfter).toEqual(subjectBefore);
  });
});
