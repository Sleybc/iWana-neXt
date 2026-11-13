import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingPaymentsService } from './billing-payments.service';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      getOrThrow: () => ({
        tenantId: '00000000-0000-4000-8000-000000000001',
        schemaName: 'tenant_test',
      }),
    },
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  };
});

const TENANT = '00000000-0000-4000-8000-000000000001';
const PAYMENT = '00000000-0000-4000-8000-000000000020';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';
const DOCUMENT = '00000000-0000-4000-8000-000000000040';
const PERIOD = '00000000-0000-4000-8000-000000000041';
const ACTOR = '00000000-0000-4000-8000-000000000002';
const CERTIFICATE = 'CERT-SINTETICO-01';
const PARTY = '00000000-0000-4000-8000-000000000060';

const paymentRow = {
  id: PAYMENT,
  tenant_id: TENANT,
  subscriber_id: SUBSCRIBER,
  method: 'TRANSFERENCIA',
  amount: '79.00',
  paid_at: '2026-11-13',
  reference: null,
  note: null,
  idempotency_key: 'retencion-1',
  allocations_fingerprint: null as string | null,
  status: 'REGISTRADO',
  void_reason_code: null,
  void_note: null,
  voided_at: null,
  voided_by: null,
  created_by: ACTOR,
  created_at: new Date('2026-11-13T12:00:00.000Z'),
  allocated_amount: '119.00',
  withholding_amount: '40.00',
};

const withholdingRow = {
  id: '00000000-0000-4000-8000-000000000050',
  payment_id: PAYMENT,
  document_id: DOCUMENT,
  tax_code: 'RETE_FUENTE_SERVICIOS',
  base: '1000.00',
  rate: '4.0000',
  amount: '40.00',
  certificate_number: CERTIFICATE,
  voided_at: null,
  created_by: ACTOR,
  created_at: new Date('2026-11-13T12:00:00.000Z'),
};

const withholding = {
  taxCode: 'RETE_FUENTE_SERVICIOS',
  base: '1000.00',
  rate: '4',
  amount: '40.00',
  certificateNumber: CERTIFICATE,
};

const body = (overrides: Record<string, unknown> = {}) => ({
  subscriberId: SUBSCRIBER,
  method: 'TRANSFERENCIA',
  amount: '79.00',
  paidAt: '2026-11-13',
  withholdings: [withholding],
  ...overrides,
});

describe('BillingPaymentsService — retenciones (spec MOD14 2026-11-13 R6–R8)', () => {
  let service: BillingPaymentsService;
  let query: jest.Mock;
  let contracts: { lockTitularForBillingWrite: jest.Mock; findTitularRefs: jest.Mock };
  let audit: { logWithin: jest.Mock };
  let marks: { activeMarks: jest.Mock };
  let rates: { rateCeilings: jest.Mock };
  let existingPayment: typeof paymentRow | null;
  let storedWithholdings: Array<typeof withholdingRow>;
  let documentSubtotal: string;
  let activeOnDocument: Array<{ tax_code: string; total: number; base: string }>;

  const sqlCalls = (needle: string) =>
    query.mock.calls.filter(([sql]) => String(sql).includes(needle));

  beforeEach(() => {
    jest.clearAllMocks();
    existingPayment = null;
    storedWithholdings = [];
    documentSubtotal = '1000.00';
    activeOnDocument = [];
    query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      // H-1 (a, b): documento bloqueado y retenciones vigentes por tipo.
      if (sql.includes('SELECT subtotal::text FROM billing_documents'))
        return [{ subtotal: documentSubtotal }];
      if (sql.includes('GROUP BY tax_code')) return activeOnDocument;
      if (sql.includes('WHERE p.tenant_id = $1 AND p.idempotency_key = $2'))
        return existingPayment ? [existingPayment] : [];
      if (sql.includes('INSERT INTO billing_payments')) return [{ id: PAYMENT }];
      if (sql.includes('INSERT INTO billing_payment_withholdings')) return [];
      if (sql.includes('UPDATE billing_payment_withholdings')) return [[{ amount: '40.00' }], 1];
      if (sql.includes('SELECT id FROM billing_documents')) return [{ id: DOCUMENT }];
      if (sql.includes('AS pending_amount'))
        return [{ id: DOCUMENT, due_date: '2026-11-20', pending_amount: '119.00' }];
      // Capacidad del pago: valor recibido (79) + retenciones vigentes (40).
      if (sql.includes('SELECT amount::text FROM billing_payments')) return [{ amount: '79.00' }];
      if (sql.includes('AS withholding_amount') && !sql.includes('FROM billing_payments p'))
        return [{ withholding_amount: '40.00' }];
      if (sql.includes('FROM billing_payments p')) return [paymentRow];
      if (sql.includes('AS allocated_amount')) return [{ allocated_amount: '0.00' }];
      if (sql.includes('d.status, d.total::text'))
        return [
          {
            id: DOCUMENT,
            subscriber_id: SUBSCRIBER,
            period_id: PERIOD,
            status: 'EMITIDO',
            total: '119.00',
          },
        ];
      if (sql.includes('AS paid_amount')) return [{ paid_amount: '0.00', courtesy_amount: '0.00' }];
      if (sql.includes('FROM billing_payment_withholdings WHERE payment_id'))
        return sql.includes('certificate_number, voided_at')
          ? storedWithholdings
          : storedWithholdings.map((row) => ({ ...row }));
      if (sql.includes('FROM billing_payments p')) return [paymentRow];
      return [];
    });
    mockRunInTenantSchema.mockImplementation(
      async (_dataSource: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ query, manager: { query } }),
    );
    contracts = {
      lockTitularForBillingWrite: jest.fn().mockResolvedValue({
        exists: true,
        partyId: null,
        anonymized: false,
        withholdingAgent: 'AGENTE_RETENEDOR',
      }),
      findTitularRefs: jest
        .fn()
        .mockResolvedValue([{ subscriberId: SUBSCRIBER, partyId: PARTY, anonymized: false }]),
    };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    marks = { activeMarks: jest.fn().mockResolvedValue({}) };
    rates = {
      rateCeilings: jest.fn().mockResolvedValue(
        new Map([
          ['RETE_FUENTE_SERVICIOS', { suggestedRate: '4.0000', ceiling: '6.0000' }],
          ['RETE_ICA', { suggestedRate: '0.4140', ceiling: '2.4140' }],
        ]),
      ),
    };
    service = new BillingPaymentsService(
      {} as never,
      contracts as unknown as BillingContractReadPort,
      audit as unknown as AuditService,
      { emitAsync: jest.fn().mockResolvedValue([]) } as unknown as EventEmitter2,
      marks as never,
      { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) } as never,
      rates as never,
    );
  });

  it.each([null, undefined])(
    'rechaza retenciones de un titular que no es jurídica ni agente retenedor (%p) antes de insertar',
    async (withholdingAgent) => {
      contracts.lockTitularForBillingWrite.mockResolvedValueOnce({
        exists: true,
        partyId: null,
        anonymized: false,
        ...(withholdingAgent === undefined ? {} : { withholdingAgent }),
      });
      await expect(service.registerPayment(body(), 'retencion-1', ACTOR)).rejects.toMatchObject({
        status: 422,
        response: { code: 'BILLING_WITHHOLDING_NOT_ALLOWED' },
      });
      expect(sqlCalls('INSERT INTO billing_payments')).toHaveLength(0);
    },
  );

  it('un pago sin retenciones de persona natural sigue igual', async () => {
    contracts.lockTitularForBillingWrite.mockResolvedValueOnce({
      exists: true,
      partyId: null,
      anonymized: false,
      withholdingAgent: null,
    });
    await service.registerPayment(body({ withholdings: undefined }), 'retencion-1', ACTOR);
    expect(sqlCalls('INSERT INTO billing_payment_withholdings')).toHaveLength(0);
  });

  it('FIFO aplica valor recibido + retenciones e inserta la retención antes de aplicar', async () => {
    const response = await service.registerPayment(body(), 'retencion-1', ACTOR);

    const inserts = query.mock.calls.map(([sql]) => String(sql));
    const withholdingIndex = inserts.findIndex((sql) =>
      sql.includes('INSERT INTO billing_payment_withholdings'),
    );
    const allocationIndex = inserts.findIndex((sql) =>
      sql.includes('INSERT INTO billing_payment_allocations'),
    );
    expect(withholdingIndex).toBeGreaterThan(-1);
    expect(withholdingIndex).toBeLessThan(allocationIndex);
    expect(sqlCalls('INSERT INTO billing_payment_withholdings')[0]?.[1]).toEqual([
      TENANT,
      PAYMENT,
      DOCUMENT,
      SUBSCRIBER,
      'RETE_FUENTE_SERVICIOS',
      '1000.00',
      '4.0000',
      '40.00',
      CERTIFICATE,
      ACTOR,
    ]);
    // 79 recibidos + 40 retenidos saldan los 119 del documento.
    expect(sqlCalls('INSERT INTO billing_payment_allocations')[0]?.[1]).toEqual([
      TENANT,
      PAYMENT,
      DOCUMENT,
      '119.00',
      ACTOR,
    ]);
    expect(response.withholdingAmount).toBe('40.00');
  });

  it('audita la creación con las retenciones y sin el número de certificado', async () => {
    await service.registerPayment(body(), 'retencion-1', ACTOR);
    const entry = audit.logWithin.mock.calls.find(
      ([value]) => value.action === AuditAction.CREATE,
    )?.[0];
    expect(entry.newValue).toMatchObject({
      withholdingAmount: '40.00',
      withholdings: [
        {
          taxCode: 'RETE_FUENTE_SERVICIOS',
          base: '1000.00',
          rate: '4.0000',
          amount: '40.00',
          documentId: DOCUMENT,
        },
      ],
    });
    expect(JSON.stringify(entry)).not.toContain(CERTIFICATE);
  });

  it('rechaza una retención que no cabe en lo aplicado (aplicación manual vacía)', async () => {
    await expect(
      service.registerPayment(body({ allocations: [] }), 'retencion-1', ACTOR),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'BILLING_WITHHOLDING_NOT_ATTRIBUTABLE' },
    });
    expect(sqlCalls('INSERT INTO billing_payment_withholdings')).toHaveLength(0);
  });

  it('rechaza la retención atribuida a un documento que el pago no salda', async () => {
    await expect(
      service.registerPayment(
        body({
          allocations: [{ documentId: DOCUMENT, amount: '119.00' }],
          withholdings: [{ ...withholding, documentId: PERIOD }],
        }),
        'retencion-1',
        ACTOR,
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_WITHHOLDING_NOT_ATTRIBUTABLE' } });
  });

  it('el reintento idéntico devuelve el pago; con otra retención da 409', async () => {
    existingPayment = paymentRow;
    storedWithholdings = [withholdingRow];

    const replay = await service.registerPayment(body(), 'retencion-1', ACTOR);
    expect(replay.id).toBe(PAYMENT);
    expect(sqlCalls('INSERT INTO billing_payments')).toHaveLength(0);

    for (const changed of [
      body({ withholdings: [{ ...withholding, certificateNumber: 'OTRO' }] }),
      body({ withholdings: [] }),
      body({ withholdings: [{ ...withholding, documentId: PERIOD }] }),
      body({ withholdings: [withholding, { ...withholding, taxCode: 'RETE_ICA' }] }),
    ]) {
      await expect(service.registerPayment(changed, 'retencion-1', ACTOR)).rejects.toMatchObject({
        status: 409,
        response: { code: 'IDEMPOTENCY_KEY_REUSED' },
      });
    }
  });

  it('un reintento con documento explícito igual al atribuido es idempotente', async () => {
    existingPayment = paymentRow;
    storedWithholdings = [withholdingRow];
    await expect(
      service.registerPayment(
        body({ withholdings: [{ ...withholding, rate: 4, documentId: DOCUMENT }] }),
        'retencion-1',
        ACTOR,
      ),
    ).resolves.toMatchObject({ id: PAYMENT });
  });

  it('anular el pago anula sus retenciones y lo audita', async () => {
    await service.voidPayment(PAYMENT, { reasonCode: 'ERROR_DE_REGISTRO' }, ACTOR);

    const update = sqlCalls('UPDATE billing_payment_withholdings')[0];
    expect(String(update?.[0])).toContain('voided_at = now()');
    expect(String(update?.[0])).toContain('voided_at IS NULL');
    expect(update?.[1]).toEqual([ACTOR, PAYMENT, TENANT]);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        newValue: expect.objectContaining({
          status: 'ANULADO',
          voidedWithholdingCount: 1,
          voidedWithholdingAmount: '40.00',
        }),
      }),
      expect.anything(),
    );
  });

  it('la respuesta suma las retenciones a la capacidad del pago', async () => {
    storedWithholdings = [withholdingRow];
    const payment = await service.getPayment(PAYMENT);
    expect(payment).toMatchObject({
      amount: '79.00',
      allocatedAmount: '119.00',
      unallocatedAmount: '0.00',
      withholdingAmount: '40.00',
      withholdings: [expect.objectContaining({ rate: '4.0000', certificateNumber: CERTIFICATE })],
    });
  });

  describe('H-1: la retención no puede condonar', () => {
    const condonation = { ...withholding, base: '1000.00', rate: '100', amount: '1000.00' };

    it('(c) tarifa 100 % sin permiso de cortesías: 422 propio y sin insertar el pago', async () => {
      await expect(
        service.registerPayment(body({ withholdings: [condonation] }), 'retencion-1', ACTOR),
      ).rejects.toMatchObject({
        status: 422,
        response: { code: 'BILLING_WITHHOLDING_RATE_ABOVE_CEILING' },
      });
      expect(sqlCalls('INSERT INTO billing_payments')).toHaveLength(0);
      expect(rates.rateCeilings).toHaveBeenCalledWith(['RETE_FUENTE_SERVICIOS']);
    });

    it('(c) dentro de la tolerancia (6 % sobre 4 % sugerido) se admite sin permiso', async () => {
      await expect(
        service.registerPayment(
          body({ withholdings: [{ ...withholding, rate: '6', amount: '60.00' }] }),
          'retencion-1',
          ACTOR,
        ),
      ).resolves.toMatchObject({ id: PAYMENT });
    });

    it('(c) sin tarifa sugerida, cualquier tarifa exige el permiso', async () => {
      rates.rateCeilings.mockResolvedValueOnce(
        new Map([['RETE_FUENTE_SERVICIOS', { suggestedRate: null, ceiling: null }]]),
      );
      await expect(service.registerPayment(body(), 'retencion-1', ACTOR)).rejects.toMatchObject({
        response: { code: 'BILLING_WITHHOLDING_RATE_ABOVE_CEILING' },
      });
    });

    it('(c) con BILLING_COURTESIES_MANAGE se admite por encima del tope y queda auditado', async () => {
      await service.registerPayment(
        body({ withholdings: [{ ...withholding, rate: '7', amount: '70.00' }] }),
        'retencion-1',
        ACTOR,
        { canExceedWithholdingRate: true },
      );
      const entry = audit.logWithin.mock.calls.find(
        ([value]) => value.action === AuditAction.CREATE,
      )?.[0];
      expect(entry.newValue.withholdings[0]).toMatchObject({
        rate: '7.0000',
        rateAboveCeiling: true,
        rateCeiling: '6.0000',
      });
    });

    it('(a) ya hay una retención vigente del mismo tipo sobre el documento: 422', async () => {
      activeOnDocument = [{ tax_code: 'RETE_FUENTE_SERVICIOS', total: 1, base: '1000.00' }];
      await expect(service.registerPayment(body(), 'retencion-1', ACTOR)).rejects.toMatchObject({
        status: 422,
        response: { code: 'BILLING_WITHHOLDING_DUPLICATE' },
      });
      expect(sqlCalls('INSERT INTO billing_payment_withholdings')).toHaveLength(0);
    });

    it('(a) dos líneas del mismo tipo sobre el mismo documento: 422', async () => {
      await expect(
        service.registerPayment(
          body({
            amount: '79.00',
            withholdings: [
              { ...withholding, base: '500.00', amount: '20.00' },
              { ...withholding, base: '500.00', amount: '20.00', certificateNumber: 'OTRO' },
            ],
          }),
          'retencion-1',
          ACTOR,
        ),
      ).rejects.toMatchObject({ response: { code: 'BILLING_WITHHOLDING_DUPLICATE' } });
    });

    it('(a) otro tipo sobre el mismo documento sí se admite', async () => {
      activeOnDocument = [{ tax_code: 'RETE_ICA', total: 1, base: '1000.00' }];
      await expect(service.registerPayment(body(), 'retencion-1', ACTOR)).resolves.toMatchObject({
        id: PAYMENT,
      });
    });

    it('(b) base mayor que el subtotal antes de IVA del documento: 422', async () => {
      documentSubtotal = '999.99';
      await expect(service.registerPayment(body(), 'retencion-1', ACTOR)).rejects.toMatchObject({
        status: 422,
        response: { code: 'BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL' },
      });
    });

    it('bloquea el documento FOR UPDATE antes de validar los topes', async () => {
      await service.registerPayment(body(), 'retencion-1', ACTOR);
      const lock = sqlCalls('SELECT subtotal::text FROM billing_documents')[0];
      expect(String(lock?.[0])).toContain('FOR UPDATE');
      expect(lock?.[1]).toEqual([DOCUMENT, TENANT]);
    });

    it('sin el servicio de topes, un pago con retenciones se rechaza (fail closed)', async () => {
      const bare = new BillingPaymentsService(
        {} as never,
        contracts as unknown as BillingContractReadPort,
        audit as unknown as AuditService,
        { emitAsync: jest.fn() } as unknown as EventEmitter2,
        marks as never,
        { getSnapshot: jest.fn() } as never,
      );
      await expect(bare.registerPayment(body(), 'retencion-1', ACTOR)).rejects.toMatchObject({
        status: 503,
      });
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });
  });

  it('H-4: si aplicar falla, la excepción sale de la misma transacción que insertó las retenciones', async () => {
    let transactions = 0;
    mockRunInTenantSchema.mockImplementation(
      async (_dataSource: unknown, _schema: string, work: (qr: unknown) => unknown) => {
        transactions += 1;
        return work({ query, manager: { query } });
      },
    );
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM billing_payments p')) return [];
      if (sql.includes('SELECT subtotal::text FROM billing_documents'))
        return [{ subtotal: '1000.00' }];
      if (sql.includes('INSERT INTO billing_payments')) return [{ id: PAYMENT }];
      if (sql.includes('SELECT amount::text FROM billing_payments')) return [{ amount: '79.00' }];
      if (sql.includes('AS withholding_amount')) return [{ withholding_amount: '40.00' }];
      if (sql.includes('AS allocated_amount')) return [{ allocated_amount: '0.00' }];
      // El documento ya no está emitido: applyAllocations rechaza después de insertar.
      if (sql.includes('d.status, d.total::text'))
        return [
          {
            id: DOCUMENT,
            subscriber_id: SUBSCRIBER,
            period_id: PERIOD,
            status: 'ANULADO',
            total: '119.00',
          },
        ];
      return [];
    });

    await expect(
      service.registerPayment(
        body({ allocations: [{ documentId: DOCUMENT, amount: '119.00' }] }),
        'retencion-1',
        ACTOR,
      ),
    ).rejects.toMatchObject({ response: { code: 'BILLING_DOCUMENT_NOT_ISSUED' } });
    expect(sqlCalls('INSERT INTO billing_payment_withholdings')).toHaveLength(1);
    expect(sqlCalls('INSERT INTO billing_payment_allocations')).toHaveLength(0);
    // Una sola transacción: el rechazo la revierte entera, retenciones incluidas.
    expect(transactions).toBe(1);
  });

  describe('H-2: texto libre del pago con titular protegido', () => {
    const withFreeText = { ...paymentRow, reference: 'REF-SINTETICA', note: 'Nota sintética' };

    beforeEach(() => {
      storedWithholdings = [withholdingRow];
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM billing_payment_withholdings WHERE payment_id'))
          return storedWithholdings;
        if (sql.includes('FROM billing_payments p')) return [withFreeText];
        return [];
      });
    });

    it('sin marcas: el detalle conserva certificado, referencia y nota', async () => {
      const payment = await service.getPayment(PAYMENT);
      expect(payment).toMatchObject({
        reference: 'REF-SINTETICA',
        note: 'Nota sintética',
        subscriberProtected: false,
        withholdings: [expect.objectContaining({ certificateNumber: CERTIFICATE })],
      });
    });

    it('DATOS_BLOQUEADOS sin permiso: el detalle redacta y no audita acceso', async () => {
      marks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const payment = await service.getPayment(PAYMENT, { actorId: ACTOR, canSeeBlocked: false });
      expect(payment).toMatchObject({
        reference: null,
        note: null,
        subscriberProtected: true,
        withholdings: [expect.objectContaining({ certificateNumber: null, amount: '40.00' })],
      });
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('DATOS_BLOQUEADOS con permiso: muestra y audita RECORD_ACCESS', async () => {
      marks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const payment = await service.getPayment(PAYMENT, {
        actorId: ACTOR,
        canSeeBlocked: true,
        grantedBy: 'PRIVACY_READ',
      });
      expect(payment.withholdings?.[0]?.certificateNumber).toBe(CERTIFICATE);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.RECORD_ACCESS,
          entityType: 'BillingPayment',
          entityId: PAYMENT,
          userId: ACTOR,
          newValue: { privacyMark: 'DATOS_BLOQUEADOS', grantedBy: 'PRIVACY_READ' },
        }),
        expect.anything(),
      );
    });

    it('anonimizado: redacta aunque el lector tenga permiso', async () => {
      contracts.findTitularRefs.mockResolvedValue([
        { subscriberId: SUBSCRIBER, partyId: null, anonymized: true },
      ]);
      const payment = await service.getPayment(PAYMENT, {
        actorId: ACTOR,
        canSeeBlocked: true,
        grantedBy: 'PRIVACY_READ',
      });
      expect(payment).toMatchObject({ reference: null, note: null, subscriberProtected: true });
      expect(payment.withholdings?.[0]?.certificateNumber).toBeNull();
    });

    it('lectura: si no se pueden verificar las marcas responde 503', async () => {
      marks.activeMarks.mockRejectedValue(new Error('privacidad caída'));
      await expect(service.getPayment(PAYMENT)).rejects.toMatchObject({ status: 503 });
    });

    it('lectura: si no se puede auditar el acceso permitido responde 503', async () => {
      marks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      audit.logWithin.mockRejectedValueOnce(new Error('auditoría caída'));
      await expect(
        service.getPayment(PAYMENT, {
          actorId: ACTOR,
          canSeeBlocked: true,
          grantedBy: 'PRIVACY_READ',
        }),
      ).rejects.toMatchObject({ status: 503 });
    });

    it('escritura: anular con titular bloqueado y sin permiso devuelve el pago redactado', async () => {
      marks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE billing_payment_withholdings')) return [[{ amount: '40.00' }], 1];
        if (sql.includes('FROM billing_payment_withholdings WHERE payment_id'))
          return storedWithholdings;
        if (sql.includes('FROM billing_payments p')) return [withFreeText];
        return [];
      });
      const voided = await service.voidPayment(PAYMENT, { reasonCode: 'ERROR_DE_REGISTRO' }, ACTOR);
      expect(voided).toMatchObject({ reference: null, note: null, subscriberProtected: true });
      expect(voided.withholdings?.[0]?.certificateNumber).toBeNull();
    });

    it('escritura: si las marcas fallan después del commit, redacta en lugar de fallar', async () => {
      marks.activeMarks.mockRejectedValue(new Error('privacidad caída'));
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE billing_payment_withholdings')) return [[], 0];
        if (sql.includes('FROM billing_payment_withholdings WHERE payment_id'))
          return storedWithholdings;
        if (sql.includes('FROM billing_payments p')) return [withFreeText];
        return [];
      });
      await expect(
        service.voidPayment(PAYMENT, { reasonCode: 'ERROR_DE_REGISTRO' }, ACTOR),
      ).resolves.toMatchObject({ reference: null, subscriberProtected: true });
    });
  });
});
