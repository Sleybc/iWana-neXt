import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction, BILLING_ERROR_CODES } from '@iwana/shared';
import {
  createBillingTenantFixture,
  dropBillingTenantFixture,
} from '../../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { BillingPaymentWithholdings2060000000206 } from '../../../../../../packages/database/src/migrations/tenant/206_billing_payment_withholdings';
import { BillingContractReadAdapter } from '../../crm/contracts/billing-contract-read.adapter';
import { BillingTitularErasureParticipant } from '../privacy/billing-titular-erasure.participant';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingWithholdingOptionsService } from './billing-withholding-options.service';
import { BillingDocumentsService } from '../documents/billing-documents.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = dataSourceOptions.database;
const safeDatabaseName =
  typeof databaseName === 'string' && /^(test|iwana_it_[a-z0-9_]+)$/u.test(databaseName);
const describeWithDb = dbAvailable && safeDatabaseName ? describe : describe.skip;

const CERT_FUENTE = 'CERT-RF-SINTETICO-001';
const CERT_ICA = 'CERT-ICA-SINTETICO-001';

/**
 * Spec MOD14 2026-11-13 bloque C (R6–R8, CA-4, CA-5) contra PostgreSQL real: tabla de la 206,
 * elegibilidad leída por el adaptador real de CRM (solo O-23, decisión D3) y conservación del
 * número de certificado en la supresión (decisión D5).
 */
describeWithDb('Retenciones en el pago contra PostgreSQL real', () => {
  let dataSource: DataSource;
  let fixture: Awaited<ReturnType<typeof createBillingTenantFixture>> | undefined;
  let tenantId: string;
  let schemaName: string;
  let service: BillingPaymentsService;
  let documents: BillingDocumentsService;
  let audit: { logWithin: jest.Mock };
  const actorId = randomUUID();
  const subscriberId = randomUUID();
  const contractId = randomUUID();
  /** Periodo del último documento insertado: un documento vivo por periodo (índice único). */
  let periodId: string;

  let periodSequence = 0;
  const tenantContext = () => ({ tenantId, schemaName, tenantSlug: 'billing-withholdings-it' });
  const inTenant = <T>(work: () => Promise<T>) => TenantContext.run(tenantContext(), work);
  const sql = <T>(text: string, params: unknown[] = []) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(text, params)) as Promise<T>;

  /**
   * Decisión D3 (spec MOD14 2026-11-13): solo O-23 en el RUT habilita las retenciones, sea
   * persona natural o jurídica. `JURIDICA_O23` es la empresa agente retenedora; `JURIDICA` trae
   * solo O-47 y `JURIDICA_O13` gran contribuyente sin O-23: ninguna de las dos puede retener.
   */
  async function insertSubscriber(
    kind: 'JURIDICA' | 'JURIDICA_O13' | 'JURIDICA_O23' | 'NATURAL' | 'NATURAL_O23',
  ): Promise<void> {
    if (kind.startsWith('JURIDICA')) {
      const rut =
        kind === 'JURIDICA_O23' ? ['O-23', 'O-47'] : kind === 'JURIDICA_O13' ? ['O-13'] : ['O-47'];
      // La jurídica activa exige representante legal (157).
      const representativeId = randomUUID();
      await sql(
        `INSERT INTO party (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, 'Representante sintético')`,
        [representativeId, `RL-${representativeId.slice(0, 8)}`],
      );
      await sql(
        `INSERT INTO subscribers
          (id, tenant_id, status, person_type, customer_segment, nit, nit_verification_digit,
           business_name, vat_treatment, vat_responsibility, rut_responsibilities, address,
           legal_representative_party_id, created_by)
         VALUES ($1, $2, 'ACTIVE', 'JURIDICA', 'PYME', '900123456', '8', 'Empresa Sintética',
                 'STANDARD', 'RESPONSABLE', $5::text[], 'Dirección sintética', $3, $4)`,
        [subscriberId, tenantId, representativeId, actorId, rut],
      );
      return;
    }
    await sql(
      `INSERT INTO subscribers
        (id, tenant_id, status, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, vat_treatment,
         vat_responsibility, rut_responsibilities, address, created_by)
       VALUES ($1, $2, 'ACTIVE', 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico-cifrado',
               'Titular', 'Sintético', 3, 'STANDARD', 'RESPONSABLE', $3::text[],
               'Dirección sintética', $4)`,
      [subscriberId, tenantId, kind === 'NATURAL_O23' ? ['O-23'] : [], actorId],
    );
  }

  async function insertDocument(input: {
    subtotal: string;
    tax: string;
    total: string;
    dueDate?: string;
  }): Promise<string> {
    const id = randomUUID();
    periodId = randomUUID();
    await sql(
      `INSERT INTO billing_periods (id, tenant_id, contract_id, subscriber_id, period_start,
         due_date, period_end, covered_start, generation_date, effective_policy)
       VALUES ($1, $2, $3, $4, $5::date, $6::date, $5::date + 29, $5::date, $5::date, '{}'::jsonb)`,
      [
        periodId,
        tenantId,
        contractId,
        subscriberId,
        `2026-${String(++periodSequence).padStart(2, '0')}-01`,
        input.dueDate ?? '2026-11-20',
      ],
    );
    await sql(
      `INSERT INTO billing_documents (
         id, tenant_id, period_id, contract_id, subscriber_id, status, issue_date,
         due_date, subtotal, tax_total, total, buyer_snapshot
       ) VALUES ($1, $2, $3, $4, $5, 'EMITIDO', '2026-11-01', $6, $7, $8, $9, $10::jsonb)`,
      [
        id,
        tenantId,
        periodId,
        contractId,
        subscriberId,
        input.dueDate ?? '2026-11-20',
        input.subtotal,
        input.tax,
        input.total,
        JSON.stringify({ displayName: 'Empresa Sintética', address: 'Dirección sintética' }),
      ],
    );
    return id;
  }

  const ca4Withholdings = [
    {
      taxCode: 'RETE_FUENTE_SERVICIOS',
      base: '1000000.00',
      rate: '4',
      amount: '40000.00',
      certificateNumber: CERT_FUENTE,
    },
    {
      taxCode: 'RETE_ICA',
      base: '1000000.00',
      rate: '0.414',
      amount: '4140.00',
      certificateNumber: CERT_ICA,
    },
  ];

  const ca4Command = () => ({
    subscriberId,
    method: 'TRANSFERENCIA',
    // 1.190.000 del documento − 40.000 de retefuente − 4.140 de reteICA.
    amount: '1145860.00',
    paidAt: '2026-11-13',
    withholdings: ca4Withholdings,
  });

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
    });
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing173');
    schemaName = fixture.schemaName;
    tenantId = fixture.tenantId;
    await fixture.queryRunner.release();
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `billing-withholdings-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
    const adapter = new BillingContractReadAdapter(
      dataSource,
      new ConfigService({}),
      settings as never,
    );
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    const marks = { activeMarks: jest.fn().mockResolvedValue({}) };
    // Topes reales (H-1 c): sin definición activa en Tributación, presets del sistema + 2 puntos.
    const rates = new BillingWithholdingOptionsService(
      adapter,
      { findActiveByCode: jest.fn().mockResolvedValue(null) } as never,
      new ConfigService({}),
    );
    service = new BillingPaymentsService(
      dataSource,
      adapter,
      audit as never,
      new EventEmitter2(),
      marks as never,
      settings as never,
      rates,
    );
    documents = new BillingDocumentsService(
      dataSource,
      audit as never,
      adapter,
      {} as never,
      new ConfigService({}),
      {} as never,
      settings as never,
      marks as never,
      service,
    );
  });

  beforeEach(async () => {
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `TRUNCATE billing_payment_withholdings, billing_period_signals, billing_payment_allocations,
                  billing_payments, billing_documents, billing_periods RESTART IDENTITY CASCADE`,
      );
      await qr.query('DELETE FROM subscribers');
      await qr.query('DELETE FROM contracts');
      await qr.query(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, status, plan_id, plan_snapshot_json)
         VALUES ($1, $2, $3, 'ACTIVE', 'fixture-plan', '{}'::jsonb)`,
        [contractId, tenantId, subscriberId],
      );
    });
    periodSequence = 0;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dropBillingTenantFixture(dataSource, fixture);
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('CA-4: empresa paga neto de retefuente 4 % y reteICA; el documento queda saldado', async () => {
    await insertSubscriber('JURIDICA_O23');
    const documentId = await insertDocument({
      subtotal: '1000000.00',
      tax: '190000.00',
      total: '1190000.00',
    });

    const payment = await inTenant(() =>
      service.registerPayment(ca4Command(), 'ca4-retenciones', actorId),
    );

    expect(payment).toMatchObject({
      amount: '1145860.00',
      allocatedAmount: '1190000.00',
      unallocatedAmount: '0.00',
      withholdingAmount: '44140.00',
    });
    expect(payment.withholdings).toEqual([
      expect.objectContaining({
        documentId,
        taxCode: 'RETE_FUENTE_SERVICIOS',
        base: '1000000.00',
        rate: '4.0000',
        amount: '40000.00',
        certificateNumber: CERT_FUENTE,
        voidedAt: null,
      }),
      expect.objectContaining({
        documentId,
        taxCode: 'RETE_ICA',
        rate: '0.4140',
        amount: '4140.00',
        certificateNumber: CERT_ICA,
      }),
    ]);

    const statement = await inTenant(() => service.statementForSubscriber(subscriberId, actorId));
    expect(statement).toMatchObject({
      totalInvoiced: '1190000.00',
      totalPaid: '1190000.00',
      totalPending: '0.00',
      totalWithholding: '44140.00',
      creditBalance: '0.00',
    });
    expect(statement.documents[0]).toMatchObject({
      id: documentId,
      paymentState: 'PAGADO',
      paidAmount: '1190000.00',
      pendingAmount: '0.00',
      withholdingAmount: '44140.00',
    });
    const [signal] = await sql<Array<{ paid: boolean }>>(
      'SELECT paid FROM billing_period_signals WHERE period_id = $1',
      [periodId],
    );
    expect(signal?.paid).toBe(true);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        entityType: 'BillingPayment',
        newValue: expect.objectContaining({ withholdingAmount: '44140.00' }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(audit.logWithin.mock.calls.map(([entry]) => entry))).not.toContain(
      CERT_FUENTE,
    );
  });

  it('CA-5: anular el pago anula sus retenciones y reabre el saldo', async () => {
    await insertSubscriber('JURIDICA_O23');
    const documentId = await insertDocument({
      subtotal: '1000000.00',
      tax: '190000.00',
      total: '1190000.00',
    });
    const payment = await inTenant(() =>
      service.registerPayment(ca4Command(), 'ca5-retenciones', actorId),
    );

    const voided = await inTenant(() =>
      service.voidPayment(payment.id, { reasonCode: 'PAGO_RECHAZADO' }, actorId),
    );

    expect(voided).toMatchObject({ status: 'ANULADO', withholdingAmount: '0.00' });
    expect(voided.withholdings).toHaveLength(2);
    expect(voided.withholdings?.every((line) => line.voidedAt !== null)).toBe(true);
    const rows = await sql<Array<{ voided_by: string | null }>>(
      'SELECT voided_by::text FROM billing_payment_withholdings WHERE payment_id = $1',
      [payment.id],
    );
    expect(rows.map((row) => row.voided_by)).toEqual([actorId, actorId]);

    const statement = await inTenant(() => service.statementForSubscriber(subscriberId, actorId));
    expect(statement).toMatchObject({
      totalPaid: '0.00',
      totalPending: '1190000.00',
      totalWithholding: '0.00',
      creditBalance: '0.00',
    });
    expect(statement.documents[0]).toMatchObject({
      id: documentId,
      pendingAmount: '1190000.00',
      withholdingAmount: '0.00',
    });
    const [signal] = await sql<Array<{ paid: boolean }>>(
      'SELECT paid FROM billing_period_signals WHERE period_id = $1',
      [periodId],
    );
    expect(signal?.paid).toBe(false);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        newValue: expect.objectContaining({
          status: 'ANULADO',
          voidedWithholdingCount: 2,
          voidedWithholdingAmount: '44140.00',
        }),
      }),
      expect.anything(),
    );
  });

  it('aplicación manual: atribuye al documento indicado y no deja aplicar más que recibido + retenciones', async () => {
    await insertSubscriber('JURIDICA_O23');
    const older = await insertDocument({
      subtotal: '100.00',
      tax: '0.00',
      total: '100.00',
      dueDate: '2026-11-10',
    });
    const newer = await insertDocument({ subtotal: '1000.00', tax: '190.00', total: '1190.00' });
    const command = {
      subscriberId,
      method: 'CONSIGNACION',
      amount: '1250.00',
      paidAt: '2026-11-13',
      allocations: [
        { documentId: older, amount: '100.00' },
        { documentId: newer, amount: '1190.00' },
      ],
      withholdings: [
        {
          taxCode: 'RETE_FUENTE_SERVICIOS',
          base: '1000.00',
          rate: 4,
          amount: '40.00',
          certificateNumber: CERT_FUENTE,
          documentId: newer,
        },
      ],
    };

    await expect(
      inTenant(() =>
        service.registerPayment(
          {
            ...command,
            allocations: [
              ...command.allocations.slice(0, 1),
              { documentId: newer, amount: '1190.01' },
            ],
          },
          'manual-excede',
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: BILLING_ERROR_CODES.BILLING_ALLOCATION_EXCEEDS_BALANCE },
    });
    expect(
      await sql<Array<{ total: number }>>(
        'SELECT COUNT(*)::int AS total FROM billing_payment_withholdings',
      ),
    ).toEqual([{ total: 0 }]);

    const payment = await inTenant(() => service.registerPayment(command, 'manual-ok', actorId));
    expect(payment.allocatedAmount).toBe('1290.00');
    expect(payment.withholdings?.[0]?.documentId).toBe(newer);
    const statement = await inTenant(() => service.statementForSubscriber(subscriberId, actorId));
    const byId = new Map(statement.documents.map((doc) => [doc.id, doc]));
    expect(byId.get(older)).toMatchObject({ pendingAmount: '0.00', withholdingAmount: '0.00' });
    expect(byId.get(newer)).toMatchObject({ pendingAmount: '0.00', withholdingAmount: '40.00' });
  });

  it('la retención que sobra queda como saldo a favor y la aplicación manual posterior la usa', async () => {
    await insertSubscriber('JURIDICA_O23');
    const first = await insertDocument({ subtotal: '100.00', tax: '0.00', total: '100.00' });
    const payment = await inTenant(() =>
      service.registerPayment(
        {
          subscriberId,
          method: 'TRANSFERENCIA',
          amount: '100.00',
          paidAt: '2026-11-13',
          allocations: [{ documentId: first, amount: '100.00' }],
          withholdings: [
            {
              taxCode: 'RETE_FUENTE_SERVICIOS',
              base: '100.00',
              rate: '4',
              amount: '4.00',
              certificateNumber: CERT_FUENTE,
            },
          ],
        },
        'saldo-a-favor',
        actorId,
      ),
    );
    expect(payment.unallocatedAmount).toBe('4.00');
    expect(
      (await inTenant(() => service.statementForSubscriber(subscriberId, actorId))).creditBalance,
    ).toBe('4.00');

    const second = await insertDocument({ subtotal: '50.00', tax: '0.00', total: '50.00' });
    const allocate = (amount: string) =>
      inTenant(() =>
        service.allocateCredit(
          payment.id,
          { subscriberId, allocations: [{ paymentId: payment.id, documentId: second, amount }] },
          actorId,
        ),
      );
    await expect(allocate('4.01')).rejects.toMatchObject({
      response: { code: BILLING_ERROR_CODES.BILLING_ALLOCATION_EXCEEDS_BALANCE },
    });
    await expect(allocate('4.00')).resolves.toMatchObject({ unallocatedAmount: '0.00' });
  });

  it.each(['JURIDICA', 'JURIDICA_O13'] as const)(
    'R7 (decisión D3): persona jurídica sin O-23 (%s) no registra retenciones (adaptador real)',
    async (kind) => {
      await insertSubscriber(kind);
      await insertDocument({ subtotal: '1000000.00', tax: '190000.00', total: '1190000.00' });
      await expect(
        inTenant(() => service.registerPayment(ca4Command(), `juridica-${kind}`, actorId)),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: BILLING_ERROR_CODES.BILLING_WITHHOLDING_NOT_ALLOWED },
      });
      expect(
        await sql<Array<{ total: number }>>('SELECT COUNT(*)::int AS total FROM billing_payments'),
      ).toEqual([{ total: 0 }]);
    },
  );

  it('R7: persona natural sin O-23 no registra retenciones; con O-23 sí (adaptador real)', async () => {
    await insertSubscriber('NATURAL');
    await insertDocument({ subtotal: '1000000.00', tax: '190000.00', total: '1190000.00' });
    await expect(
      inTenant(() => service.registerPayment(ca4Command(), 'natural', actorId)),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: BILLING_ERROR_CODES.BILLING_WITHHOLDING_NOT_ALLOWED },
    });
    expect(
      await sql<Array<{ total: number }>>('SELECT COUNT(*)::int AS total FROM billing_payments'),
    ).toEqual([{ total: 0 }]);

    await sql("UPDATE subscribers SET rut_responsibilities = ARRAY['O-13']::text[] WHERE id = $1", [
      subscriberId,
    ]);
    await expect(
      inTenant(() => service.registerPayment(ca4Command(), 'natural-o13', actorId)),
    ).rejects.toMatchObject({
      response: { code: BILLING_ERROR_CODES.BILLING_WITHHOLDING_NOT_ALLOWED },
    });

    await sql("UPDATE subscribers SET rut_responsibilities = ARRAY['O-23']::text[] WHERE id = $1", [
      subscriberId,
    ]);
    await expect(
      inTenant(() => service.registerPayment(ca4Command(), 'agente-retenedor', actorId)),
    ).resolves.toMatchObject({ withholdingAmount: '44140.00', allocatedAmount: '1190000.00' });
  });

  it('idempotencia: el mismo cuerpo devuelve el pago; otro certificado con la misma clave da 409', async () => {
    await insertSubscriber('JURIDICA_O23');
    await insertDocument({ subtotal: '1000000.00', tax: '190000.00', total: '1190000.00' });
    const first = await inTenant(() =>
      service.registerPayment(ca4Command(), 'idempotente', actorId),
    );
    const replay = await inTenant(() =>
      service.registerPayment(ca4Command(), 'idempotente', actorId),
    );
    expect(replay.id).toBe(first.id);
    await expect(
      inTenant(() =>
        service.registerPayment(
          {
            ...ca4Command(),
            withholdings: [
              ca4Withholdings[0]!,
              { ...ca4Withholdings[1]!, certificateNumber: 'OTRO' },
            ],
          },
          'idempotente',
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: BILLING_ERROR_CODES.IDEMPOTENCY_KEY_REUSED },
    });
    expect(
      await sql<Array<{ total: number }>>(
        'SELECT COUNT(*)::int AS total FROM billing_payment_withholdings',
      ),
    ).toEqual([{ total: 2 }]);
  });

  it('la supresión del titular conserva el número de certificado y los montos (decisión D5)', async () => {
    await insertSubscriber('JURIDICA_O23');
    await insertDocument({ subtotal: '1000000.00', tax: '190000.00', total: '1190000.00' });
    await inTenant(() => service.registerPayment(ca4Command(), 'supresion', actorId));
    const participant = new BillingTitularErasureParticipant();
    const scope = { partyId: null, subscriberIds: [subscriberId], expedienteIds: [], userIds: [] };

    const result = await inTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) => participant.apply(scope, qr, 'apply')),
    );

    // Soporte contable y tributario del ISP: el participante no la toca; las lecturas la ocultan.
    expect(result.map((row) => row.table)).not.toContain('billing_payment_withholdings');
    expect(
      await sql<Array<{ certificate_number: string | null; amount: string }>>(
        'SELECT certificate_number, amount::text FROM billing_payment_withholdings ORDER BY billing_payment_withholdings.amount ASC',
      ),
    ).toEqual([
      { certificate_number: ca4Withholdings[1]!.certificateNumber, amount: '4140.00' },
      { certificate_number: ca4Withholdings[0]!.certificateNumber, amount: '40000.00' },
    ]);
  });

  it('migración 206: down() bloquea con retenciones y up()/down() son simétricos', async () => {
    await insertSubscriber('JURIDICA_O23');
    await insertDocument({ subtotal: '1000000.00', tax: '190000.00', total: '1190000.00' });
    await inTenant(() => service.registerPayment(ca4Command(), 'migracion', actorId));
    const migration = new BillingPaymentWithholdings2060000000206();
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction();
      await qr.query(`SET LOCAL search_path TO "${schemaName}", public`);
      await expect(migration.down(qr)).rejects.toThrow(
        /Rollback de BillingPaymentWithholdings bloqueado/u,
      );
      await qr.query('DELETE FROM billing_payment_withholdings');
      await migration.down(qr);
      // M6: down() repetido, ya sin tabla, no falla.
      await expect(migration.down(qr)).resolves.toBeUndefined();
      const [afterDown] = (await qr.query(
        `SELECT to_regclass('billing_payment_withholdings') IS NULL AS dropped`,
      )) as Array<{ dropped: boolean }>;
      expect(afterDown?.dropped).toBe(true);
      await migration.up(qr);
      const [afterUp] = (await qr.query(
        `SELECT COUNT(*)::int AS indexes FROM pg_indexes
          WHERE schemaname = $1 AND tablename = 'billing_payment_withholdings'`,
        [schemaName],
      )) as Array<{ indexes: number }>;
      expect(afterUp?.indexes).toBe(4);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });

  describe('H-1: una retención no condona', () => {
    it('intento de saldar con tarifa 100 %: 422 propio, sin pago ni retención y saldo intacto', async () => {
      await insertSubscriber('JURIDICA_O23');
      const documentId = await insertDocument({
        subtotal: '1000000.00',
        tax: '190000.00',
        total: '1190000.00',
      });
      // 190.000 recibidos + «retención» de 1.000.000 al 100 % saldarían el documento.
      const condonation = {
        subscriberId,
        method: 'TRANSFERENCIA',
        amount: '190000.00',
        paidAt: '2026-11-13',
        withholdings: [
          {
            taxCode: 'RETE_FUENTE_SERVICIOS',
            base: '1000000.00',
            rate: '100',
            amount: '1000000.00',
            certificateNumber: CERT_FUENTE,
          },
        ],
      };

      await expect(
        inTenant(() => service.registerPayment(condonation, 'h1-condonacion', actorId)),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: BILLING_ERROR_CODES.BILLING_WITHHOLDING_RATE_ABOVE_CEILING },
      });
      expect(
        await sql<Array<{ payments: number; withholdings: number }>>(
          `SELECT (SELECT COUNT(*)::int FROM billing_payments) AS payments,
                  (SELECT COUNT(*)::int FROM billing_payment_withholdings) AS withholdings`,
        ),
      ).toEqual([{ payments: 0, withholdings: 0 }]);
      const statement = await inTenant(() => service.statementForSubscriber(subscriberId, actorId));
      expect(statement.documents[0]).toMatchObject({
        id: documentId,
        pendingAmount: '1190000.00',
      });

      // Con BILLING_COURTESIES_MANAGE la tarifa pasa el tope, pero la base sigue topada (b).
      await expect(
        inTenant(() =>
          service.registerPayment(
            {
              ...condonation,
              withholdings: [
                {
                  ...condonation.withholdings[0]!,
                  base: '1190000.00',
                  amount: '1190000.00',
                },
              ],
            },
            'h1-base-con-iva',
            actorId,
            { canExceedWithholdingRate: true },
          ),
        ),
      ).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL },
      });
    });

    it('(a) una sola retención vigente por documento y tipo, también entre pagos', async () => {
      await insertSubscriber('JURIDICA_O23');
      const documentId = await insertDocument({
        subtotal: '1000000.00',
        tax: '190000.00',
        total: '1190000.00',
      });
      const partial = (key: string, certificateNumber: string) =>
        inTenant(() =>
          service.registerPayment(
            {
              subscriberId,
              method: 'TRANSFERENCIA',
              amount: '100000.00',
              paidAt: '2026-11-13',
              allocations: [{ documentId, amount: '120000.00' }],
              withholdings: [
                {
                  taxCode: 'RETE_FUENTE_SERVICIOS',
                  base: '500000.00',
                  rate: '4',
                  amount: '20000.00',
                  certificateNumber,
                },
              ],
            },
            key,
            actorId,
          ),
        );
      const first = await partial('h1a-primero', 'CERT-A');
      await expect(partial('h1a-segundo', 'CERT-B')).rejects.toMatchObject({
        status: 422,
        response: { code: BILLING_ERROR_CODES.BILLING_WITHHOLDING_DUPLICATE },
      });

      // Anulado el primer pago, su retención deja de estar vigente y el tipo queda libre.
      await inTenant(() =>
        service.voidPayment(first.id, { reasonCode: 'ERROR_DE_REGISTRO' }, actorId),
      );
      await expect(partial('h1a-tercero', 'CERT-C')).resolves.toMatchObject({
        withholdingAmount: '20000.00',
      });
      const [index] = await sql<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'uq_billing_payment_withholdings_document_tax_active'`,
        [schemaName],
      );
      expect(index?.indexdef).toMatch(/UNIQUE INDEX .*WHERE \(voided_at IS NULL\)/u);
    });
  });

  it('H-3: anular el documento anula sus retenciones; emitir otro no las reaplica', async () => {
    await insertSubscriber('JURIDICA_O23');
    const voidedDocument = await insertDocument({
      subtotal: '1000000.00',
      tax: '190000.00',
      total: '1190000.00',
    });
    const payment = await inTenant(() =>
      service.registerPayment(ca4Command(), 'h3-anula-documento', actorId),
    );
    expect(payment).toMatchObject({ withholdingAmount: '44140.00', unallocatedAmount: '0.00' });
    audit.logWithin.mockClear();

    await inTenant(() => documents.void(voidedDocument, 'ERROR_DE_VALOR', undefined, actorId));

    const rows = await sql<Array<{ voided_by: string | null }>>(
      'SELECT voided_by::text FROM billing_payment_withholdings WHERE payment_id = $1',
      [payment.id],
    );
    expect(rows.map((row) => row.voided_by)).toEqual([actorId, actorId]);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'BillingDocument',
        entityId: voidedDocument,
        newValue: expect.objectContaining({
          status: 'ANULADO',
          voidedWithholdingCount: 2,
          voidedWithholdingAmount: '44140.00',
        }),
      }),
      expect.anything(),
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'BillingPayment',
        entityId: payment.id,
        newValue: expect.objectContaining({
          action: 'WITHHOLDINGS_VOIDED_WITH_DOCUMENT',
          documentId: voidedDocument,
          voidedWithholdingCount: 2,
        }),
      }),
      expect.anything(),
    );

    // Saldo a favor: solo el valor recibido; las retenciones anuladas ya no cuentan.
    const afterVoid = await inTenant(() => service.getPayment(payment.id));
    expect(afterVoid).toMatchObject({
      withholdingAmount: '0.00',
      allocatedAmount: '0.00',
      unallocatedAmount: '1145860.00',
    });

    // Se emite el documento de reemplazo y se aplica el saldo a favor como en la emisión.
    const replacement = await insertDocument({
      subtotal: '1000000.00',
      tax: '190000.00',
      total: '1190000.00',
    });
    await inTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        service.applyCreditWithin(qr.manager, tenantId, replacement, subscriberId, actorId),
      ),
    );

    const statement = await inTenant(() => service.statementForSubscriber(subscriberId, actorId));
    const byId = new Map(statement.documents.map((doc) => [doc.id, doc]));
    expect(byId.get(replacement)).toMatchObject({
      paidAmount: '1145860.00',
      pendingAmount: '44140.00',
      withholdingAmount: '0.00',
    });
    expect(statement).toMatchObject({ totalWithholding: '0.00', creditBalance: '0.00' });
  });

  it('H-4: las retenciones no se confirman sin sus aplicaciones', async () => {
    await insertSubscriber('JURIDICA_O23');
    const documentId = await insertDocument({
      subtotal: '1000000.00',
      tax: '190000.00',
      total: '1190000.00',
    });
    await sql(`UPDATE billing_documents SET status = 'BORRADOR' WHERE id = $1`, [documentId]);

    await expect(
      inTenant(() =>
        service.registerPayment(
          { ...ca4Command(), allocations: [{ documentId, amount: '1190000.00' }] },
          'h4-sin-aplicacion',
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_ISSUED },
    });
    expect(
      await sql<Array<{ payments: number; withholdings: number; allocations: number }>>(
        `SELECT (SELECT COUNT(*)::int FROM billing_payments) AS payments,
                (SELECT COUNT(*)::int FROM billing_payment_withholdings) AS withholdings,
                (SELECT COUNT(*)::int FROM billing_payment_allocations) AS allocations`,
      ),
    ).toEqual([{ payments: 0, withholdings: 0, allocations: 0 }]);
  });
});
