import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

const paymentRow = {
  id: '00000000-0000-4000-8000-000000000020',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  subscriber_id: '00000000-0000-4000-8000-000000000010',
  method: 'TRANSFERENCIA',
  amount: '20.00',
  paid_at: '2026-11-05',
  reference: null,
  note: null,
  idempotency_key: 'payment-operation-1',
  status: 'REGISTRADO',
  void_reason_code: null,
  void_note: null,
  voided_at: null,
  voided_by: null,
  created_by: '00000000-0000-4000-8000-000000000002',
  created_at: new Date('2026-11-05T12:00:00.000Z'),
  allocated_amount: '0.00',
};

describe('BillingPaymentsService', () => {
  let service: BillingPaymentsService;
  let mockQuery: jest.Mock;
  let mockCommitted: boolean;
  const dataSource = {} as never;
  const contractReadPort = {
    findTitularRefs: jest.fn(),
    lockTitularForBillingWrite: jest.fn(),
    hasImpersonationSuspension: jest.fn().mockResolvedValue(false),
    findActiveContractIds: jest.fn().mockResolvedValue([]),
  } as unknown as BillingContractReadPort;
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const eventEmitter = { emitAsync: jest.fn() } as unknown as EventEmitter2;
  const privacyMarksReadPort = { activeMarks: jest.fn().mockResolvedValue({}) } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCommitted = false;
    mockQuery = jest.fn();
    mockQuery.mockResolvedValue([]);
    mockRunInTenantSchema.mockImplementation(async (_dataSource, _schemaName, work) => {
      const result = await work({ manager: { query: mockQuery } });
      mockCommitted = true;
      return result;
    });
    (contractReadPort.lockTitularForBillingWrite as jest.Mock).mockResolvedValue({
      exists: true,
      partyId: null,
      anonymized: false,
    });
    (contractReadPort.findTitularRefs as jest.Mock).mockResolvedValue([
      { subscriberId: paymentRow.subscriber_id, partyId: null, anonymized: false },
    ]);
    (eventEmitter.emitAsync as jest.Mock).mockImplementation(async () => {
      expect(mockCommitted).toBe(true);
    });
    service = new BillingPaymentsService(
      dataSource,
      contractReadPort,
      audit,
      eventEmitter,
      privacyMarksReadPort,
      { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) } as never,
    );
  });

  it('rechaza el registro de un titular anonimizado dentro de la transacción antes de insertar', async () => {
    (contractReadPort.lockTitularForBillingWrite as jest.Mock).mockResolvedValueOnce({
      exists: true,
      partyId: null,
      anonymized: true,
    });
    const command = {
      subscriberId: paymentRow.subscriber_id,
      method: 'TRANSFERENCIA',
      amount: '20.00',
      paidAt: '2026-11-05',
    };

    const error = await service
      .registerPayment(command, paymentRow.idempotency_key, paymentRow.created_by)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PRIVACY_TITULAR_ANONYMIZED',
    });
    expect(contractReadPort.lockTitularForBillingWrite).toHaveBeenCalledWith(
      paymentRow.subscriber_id,
      { manager: expect.objectContaining({ query: mockQuery }) },
    );
    expect(mockQuery).not.toHaveBeenCalled();
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('responde 404 cuando la consulta bajo bloqueo informa que el suscriptor no existe', async () => {
    (contractReadPort.lockTitularForBillingWrite as jest.Mock).mockResolvedValueOnce({
      exists: false,
      partyId: null,
      anonymized: false,
    });

    await expect(
      service.registerPayment(
        {
          subscriberId: paymentRow.subscriber_id,
          method: 'TRANSFERENCIA',
          amount: '20.00',
          paidAt: '2026-11-05',
        },
        paymentRow.idempotency_key,
        paymentRow.created_by,
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_SUBSCRIBER_NOT_FOUND' },
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('compara el fingerprint original aunque las aplicaciones vigentes se hayan revertido', async () => {
    const documentId = '00000000-0000-4000-8000-000000000030';
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([{ documentId, amount: '12.50' }]))
      .digest('hex') as string;
    const existing = { ...paymentRow, allocations_fingerprint: fingerprint };
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('p.idempotency_key')) return [existing];
      if (sql.includes('SELECT document_id::text, amount::text')) return [];
      if (sql.includes('WHERE p.tenant_id = $1 AND p.id =')) return [existing];
      if (sql.includes('FROM billing_payment_allocations WHERE payment_id')) return [];
      return [];
    });

    const result = await service.registerPayment(
      {
        subscriberId: paymentRow.subscriber_id,
        method: 'TRANSFERENCIA',
        amount: '20.00',
        paidAt: '2026-11-05',
        allocations: [{ documentId, amount: '12.50' }],
      },
      paymentRow.idempotency_key,
      paymentRow.created_by,
    );

    expect(result.id).toBe(paymentRow.id);
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO billing_payments'),
      expect.anything(),
    );
  });

  it('permite registrar un pago cuando la lectura de bloqueo no marca anonimización', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE p.tenant_id = $1 AND p.id =')) return [paymentRow];
      if (sql.includes('p.idempotency_key')) return [];
      if (sql.includes('INSERT INTO billing_payments')) return [{ id: paymentRow.id }];
      if (sql.includes('FROM billing_documents d')) return [];
      if (sql.includes('FROM billing_payment_allocations')) return [];
      return [];
    });
    const command = {
      subscriberId: paymentRow.subscriber_id,
      method: 'TRANSFERENCIA',
      amount: '20.00',
      paidAt: '2026-11-05',
    };

    const result = await service.registerPayment(
      command,
      paymentRow.idempotency_key,
      paymentRow.created_by,
    );

    expect(result).toMatchObject({ id: paymentRow.id, status: 'REGISTRADO', amount: '20.00' });
    expect(
      mockQuery.mock.calls.some(([sql]) => /UPDATE\s+(contracts|subscribers)/iu.test(String(sql))),
    ).toBe(false);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'BillingPayment', entityId: paymentRow.id }),
      expect.objectContaining({ query: mockQuery }),
    );
  });

  it('calcula los estados de periodo sin escribir estados de CRM', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        contract_id: 'contract-paid',
        due_date: '2026-11-01',
        document_id: 'document-paid',
        total: '50.00',
        paid_amount: '50.00',
      },
      {
        contract_id: 'contract-overdue',
        due_date: '2026-11-01',
        document_id: 'document-partial',
        total: '50.00',
        paid_amount: '10.00',
      },
      {
        contract_id: 'contract-partial',
        due_date: '2026-12-01',
        document_id: 'document-partial-2',
        total: '50.00',
        paid_amount: '10.00',
      },
    ]);

    const result = await service.periodStates(
      ['contract-paid', 'contract-overdue', 'contract-partial', 'contract-empty'],
      '2026-11-15',
    );

    expect(result).toEqual({
      'contract-paid': { state: 'PAGADO', paidAmount: '50.00', totalAmount: '50.00' },
      'contract-overdue': { state: 'VENCIDO', paidAmount: '10.00', totalAmount: '50.00' },
      'contract-partial': { state: 'PARCIAL', paidAmount: '10.00', totalAmount: '50.00' },
      'contract-empty': { state: 'SIN_DOCUMENTO', paidAmount: null, totalAmount: null },
    });
    expect(
      mockQuery.mock.calls.every(
        ([sql]) => !/UPDATE\s+(contracts|subscribers)/iu.test(String(sql)),
      ),
    ).toBe(true);
  });

  it('BR-4.1 (RS-19) evalúa el periodo más reciente por generation_date y no por cutoff_date', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await service.periodStates(['00000000-0000-4000-8000-000000000040'], '2026-11-15');

    const sql = String(mockQuery.mock.calls[0]?.[0]);
    expect(sql).toMatch(/DISTINCT ON \(p\.contract_id\)/u);
    expect(sql).toMatch(/p\.generation_date <= \$3::date/u);
    expect(sql).toMatch(/ORDER BY p\.contract_id, p\.period_start DESC/u);
    expect(sql).not.toMatch(/cutoff_date/u);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual([
      paymentRow.tenant_id,
      ['00000000-0000-4000-8000-000000000040'],
      '2026-11-15',
    ]);
  });

  it('BR-4.10 lee la señal del periodo acotada por tenant_id', async () => {
    const periodId = '00000000-0000-4000-8000-000000000030';
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM billing_periods/u.test(sql))
        return [{ id: periodId, contract_id: 'contract-1', period_start: '2026-11-05' }];
      if (/has_document/u.test(sql)) return [{ has_document: false, all_paid: false }];
      return [];
    });

    await service.recalculateSignals({ query: mockQuery }, paymentRow.tenant_id, [periodId]);

    const read = mockQuery.mock.calls.find(([sql]) =>
      /SELECT paid FROM billing_period_signals/u.test(String(sql)),
    );
    expect(read).toBeDefined();
    expect(String(read?.[0])).toMatch(/tenant_id\s*=\s*\$2/u);
    expect(read?.[1]).toEqual([periodId, paymentRow.tenant_id]);
  });

  it('devuelve estado de cuenta vacío cuando la proyección confirma al titular', async () => {
    const result = await service.statementForSubscriber(
      paymentRow.subscriber_id,
      paymentRow.created_by,
      {
        canSeeBlocked: false,
      },
    );

    expect(result).toMatchObject({
      subscriberId: paymentRow.subscriber_id,
      totalInvoiced: '0.00',
      totalPaid: '0.00',
      totalPending: '0.00',
      creditBalance: '0.00',
      documents: [],
      payments: [],
    });
    expect(contractReadPort.findTitularRefs).toHaveBeenCalledWith([paymentRow.subscriber_id]);
    expect(contractReadPort.lockTitularForBillingWrite).not.toHaveBeenCalled();
  });

  it('BR-9.1 resuelve la alerta de suplantación por el puerto, sin leer contracts en la transacción', async () => {
    (contractReadPort.hasImpersonationSuspension as jest.Mock).mockResolvedValueOnce(true);
    const result = await service.statementForSubscriber(
      paymentRow.subscriber_id,
      paymentRow.created_by,
      { canSeeBlocked: false },
    );

    expect(contractReadPort.hasImpersonationSuspension).toHaveBeenCalledWith(
      paymentRow.subscriber_id,
    );
    expect(result.impersonationHold).toBe(true);
    const crossModuleReads = mockQuery.mock.calls.filter(([sql]) =>
      /FROM\s+contracts/u.test(String(sql)),
    );
    expect(crossModuleReads).toHaveLength(0);
  });

  it('BR-9.1 el contrato suspendido sin marca también sostiene el cobro', async () => {
    (contractReadPort.findTitularRefs as jest.Mock).mockResolvedValueOnce([
      { subscriberId: paymentRow.subscriber_id, partyId: 'party-sin-marca', anonymized: false },
    ]);
    (contractReadPort.hasImpersonationSuspension as jest.Mock).mockResolvedValueOnce(true);
    const result = await service.statementForSubscriber(
      paymentRow.subscriber_id,
      paymentRow.created_by,
      { canSeeBlocked: false },
    );

    expect(result.impersonationHold).toBe(true);
  });
});
