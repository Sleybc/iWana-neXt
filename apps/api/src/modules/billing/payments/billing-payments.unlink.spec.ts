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

const tenantId = '00000000-0000-4000-8000-000000000001';
const paymentId = '00000000-0000-4000-8000-000000000020';
const allocationId = '00000000-0000-4000-8000-000000000030';
const documentId = '00000000-0000-4000-8000-000000000040';
const periodId = '00000000-0000-4000-8000-000000000050';
const subscriberId = '00000000-0000-4000-8000-000000000010';
const actor = '00000000-0000-4000-8000-000000000002';

const paymentRow = (status = 'REGISTRADO') => ({
  id: paymentId,
  tenant_id: tenantId,
  subscriber_id: subscriberId,
  method: 'TRANSFERENCIA',
  amount: '100.00',
  paid_at: '2026-11-05',
  reference: 'REF',
  note: null,
  idempotency_key: 'key',
  allocations_fingerprint: null,
  status,
  void_reason_code: null,
  void_note: null,
  voided_at: null,
  voided_by: null,
  created_by: actor,
  created_at: new Date('2026-11-05T12:00:00.000Z'),
  allocated_amount: '0.00',
  withholding_amount: '0.00',
  receipt_number: '9',
  imported: false,
  external_id: null,
});

type State = {
  payment: ReturnType<typeof paymentRow> | null;
  allocation: boolean;
  documentStatus: string | null;
  withholding: boolean;
  updated: boolean;
};

describe('BillingPaymentsService.unlinkAllocation (spec MOD05↔MOD14 2026-11-13 D6)', () => {
  let state: State;
  let query: jest.Mock;
  let service: BillingPaymentsService;
  const contracts = {
    findTitularRefs: jest.fn(),
    lockTitularForBillingWrite: jest.fn(),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const eventEmitter = { emitAsync: jest.fn() };

  const body = { reasonCode: 'APLICADO_A_DOCUMENTO_EQUIVOCADO' };
  const unlink = (payload: unknown = body) =>
    service.unlinkAllocation(paymentId, allocationId, payload, actor);

  beforeEach(() => {
    jest.clearAllMocks();
    state = {
      payment: paymentRow(),
      allocation: true,
      documentStatus: 'EMITIDO',
      withholding: false,
      updated: true,
    };
    query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM billing_payments p')) return state.payment ? [state.payment] : [];
      if (sql.includes('FROM billing_payment_allocations a') && sql.includes('a.id = $1'))
        return state.allocation
          ? [{ id: allocationId, document_id: documentId, amount: '40' }]
          : [];
      if (sql.includes('FROM billing_documents WHERE id = $1'))
        return state.documentStatus
          ? [{ id: documentId, status: state.documentStatus, period_id: periodId }]
          : [];
      if (sql.includes('FROM billing_payment_withholdings') && sql.includes('LIMIT 1'))
        return state.withholding ? [{ present: 1 }] : [];
      if (sql.includes('UPDATE billing_payment_allocations'))
        return [state.updated ? [{ id: allocationId }] : [], state.updated ? 1 : 0];
      return [];
    });
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, work) =>
      work({ manager: { query } }),
    );
    contracts.lockTitularForBillingWrite.mockResolvedValue({ exists: true, anonymized: false });
    contracts.findTitularRefs.mockResolvedValue([
      { subscriberId, partyId: null, anonymized: false },
    ]);
    service = new BillingPaymentsService(
      {} as never,
      contracts as unknown as BillingContractReadPort,
      audit as unknown as AuditService,
      eventEmitter as unknown as EventEmitter2,
      { activeMarks: jest.fn().mockResolvedValue({}) } as never,
      { getSnapshot: jest.fn() } as never,
    );
  });

  it('marca la aplicación con motivo, audita sin texto libre y recalcula el periodo', async () => {
    const result = await unlink();
    expect(result).toMatchObject({ id: paymentId, receiptNumber: 9, subscriberProtected: false });
    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE billing_payment_allocations'),
    );
    expect(update?.[1]).toEqual([actor, 'APLICADO_A_DOCUMENTO_EQUIVOCADO', allocationId, tenantId]);
    expect(audit.logWithin).toHaveBeenCalledWith(
      {
        action: AuditAction.UPDATE,
        entityType: 'BillingPaymentAllocation',
        entityId: allocationId,
        userId: actor,
        oldValue: { status: 'VIGENTE', paymentId, documentId },
        newValue: {
          status: 'DESASOCIADA',
          reasonCode: 'APLICADO_A_DOCUMENTO_EQUIVOCADO',
          paymentId,
          documentId,
          amount: '40.00',
        },
      },
      expect.anything(),
    );
    expect(JSON.stringify(audit.logWithin.mock.calls[0]![0])).not.toContain('REF');
    expect(
      query.mock.calls.some(
        ([sql, args]) =>
          String(sql).includes('FROM billing_periods') && (args as unknown[])[0] === periodId,
      ),
    ).toBe(true);
    // Bloqueo del crédito del titular, igual que aplicar saldo.
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `billing-credit:${subscriberId}`,
    ]);
    expect(contracts.lockTitularForBillingWrite).toHaveBeenCalledWith(subscriberId, {
      manager: expect.anything(),
    });
  });

  it.each([{}, { reasonCode: 'OTRO' }, { reasonCode: 'REASIGNACION', note: 'texto libre' }])(
    'rechaza con 422 VALIDATION_ERROR el cuerpo %j',
    async (payload) => {
      await expect(unlink(payload)).rejects.toMatchObject({
        status: 422,
        response: { code: 'VALIDATION_ERROR' },
      });
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    },
  );

  it('responde 404 si el pago no existe', async () => {
    state.payment = null;
    await expect(unlink()).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_PAYMENT_NOT_FOUND' },
    });
  });

  it('responde 409 si el pago está anulado', async () => {
    state.payment = paymentRow('ANULADO');
    await expect(unlink()).rejects.toMatchObject({
      status: 409,
      response: { code: 'BILLING_PAYMENT_VOIDED' },
    });
    expect(contracts.lockTitularForBillingWrite).not.toHaveBeenCalled();
  });

  it.each([
    { exists: true, anonymized: true },
    { exists: false, anonymized: false },
  ])('responde 409 con el titular %j', async (titular) => {
    contracts.lockTitularForBillingWrite.mockResolvedValue(titular);
    await expect(unlink()).rejects.toMatchObject({
      status: 409,
      response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
    });
  });

  it('responde 404 BILLING_ALLOCATION_NOT_FOUND si la aplicación no es vigente ni del pago', async () => {
    state.allocation = false;
    await expect(unlink()).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_ALLOCATION_NOT_FOUND' },
    });
  });

  it.each(['ANULADO', 'IMPORTADO'])('responde 409 con un documento %s (CA-7)', async (status) => {
    state.documentStatus = status;
    await expect(unlink()).rejects.toMatchObject({
      status: 409,
      response: { code: 'BILLING_ALLOCATION_NOT_UNLINKABLE' },
    });
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('responde 422 si hay una retención vigente sobre el documento', async () => {
    state.withholding = true;
    await expect(unlink()).rejects.toMatchObject({
      status: 422,
      response: { code: 'BILLING_ALLOCATION_HAS_WITHHOLDING' },
    });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('UPDATE billing_payment_allocations')),
    ).toBe(false);
  });

  it('responde 404 si otra transacción la revirtió antes del UPDATE', async () => {
    state.updated = false;
    await expect(unlink()).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_ALLOCATION_NOT_FOUND' },
    });
    expect(audit.logWithin).not.toHaveBeenCalled();
  });
});
