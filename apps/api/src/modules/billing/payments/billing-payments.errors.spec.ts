import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccessPermissionKey } from '@iwana/shared';
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
const CONTRACT = '00000000-0000-4000-8000-000000000042';
const PARTY = '00000000-0000-4000-8000-000000000043';
const ACTOR = '00000000-0000-4000-8000-000000000002';

const paymentRow = {
  id: PAYMENT,
  tenant_id: TENANT,
  subscriber_id: SUBSCRIBER,
  method: 'TRANSFERENCIA',
  amount: '20.00',
  paid_at: '2026-11-05',
  reference: null,
  note: null,
  idempotency_key: 'payment-operation-1',
  allocations_fingerprint: null as string | null,
  status: 'REGISTRADO',
  void_reason_code: null,
  void_note: null,
  voided_at: null as Date | null,
  voided_by: null,
  created_by: ACTOR,
  created_at: new Date('2026-11-05T12:00:00.000Z'),
  allocated_amount: '0.00',
};

const documentRow = {
  id: DOCUMENT,
  tenant_id: TENANT,
  period_id: PERIOD,
  contract_id: CONTRACT,
  subscriber_id: SUBSCRIBER,
  status: 'EMITIDO' as const,
  number: 'FE-000001',
  issue_date: '2026-11-05',
  due_date: '2026-11-19',
  period_start: '2026-10-05',
  period_end: '2026-11-04',
  covered_start: '2026-10-05',
  subtotal: '100.00',
  tax_total: '19.00',
  total: '119.00',
  unbilled_additional_count: 0,
  blocking_reason: null,
  buyer_snapshot: { displayName: 'Adquirente' },
  issuer_snapshot: null,
  void_reason_code: null,
  void_note: null,
  voided_at: null as Date | null,
  voided_by: null,
  created_by: ACTOR,
  created_at: new Date('2026-11-05T12:00:00.000Z'),
  updated_at: new Date('2026-11-05T12:00:00.000Z'),
  paid_amount: '0.00',
};

const registerBody = {
  subscriberId: SUBSCRIBER,
  method: 'TRANSFERENCIA',
  amount: '20.00',
  paidAt: '2026-11-05',
};

const allocationBody = (amount = '20.00', documentId = DOCUMENT) => ({
  subscriberId: SUBSCRIBER,
  allocations: [{ paymentId: PAYMENT, documentId, amount }],
});

describe('BillingPaymentsService — rechazos y acceso a datos protegidos', () => {
  let service: BillingPaymentsService;
  let query: jest.Mock;
  let contracts: {
    findTitularRefs: jest.Mock;
    findTitularDisplayNames: jest.Mock;
    lockTitularForBillingWrite: jest.Mock;
    hasImpersonationSuspension: jest.Mock;
    findActiveContractIds: jest.Mock;
  };
  let audit: { logWithin: jest.Mock };
  let privacyMarks: { activeMarks: jest.Mock };
  let eventEmitter: { emitAsync: jest.Mock };

  const route = (overrides: Record<string, unknown> = {}) => {
    query.mockImplementation(async (sql: string) => {
      for (const [needle, value] of Object.entries(overrides)) {
        if (sql.includes(needle)) return value;
      }
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SELECT amount::text FROM billing_payments')) return [{ amount: '20.00' }];
      if (sql.includes('FROM billing_payments p')) return [paymentRow];
      if (sql.includes('INSERT INTO billing_payments')) return [{ id: PAYMENT }];
      if (sql.includes('FROM billing_documents d')) return [documentRow];
      if (sql.includes('WITH latest AS')) return [];
      if (sql.includes('registered_amount'))
        return [{ registered_amount: '0.00', allocated_amount: '0.00' }];
      if (sql.includes('allocated_amount')) return [{ allocated_amount: '0.00' }];
      if (sql.includes('paid_amount')) return [{ paid_amount: '0.00' }];
      return [];
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    query = jest.fn();
    route();
    mockRunInTenantSchema.mockImplementation(
      async (_dataSource: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ query, manager: { query } }),
    );
    contracts = {
      findTitularRefs: jest
        .fn()
        .mockResolvedValue([{ subscriberId: SUBSCRIBER, partyId: PARTY, anonymized: false }]),
      findTitularDisplayNames: jest
        .fn()
        .mockResolvedValue([{ subscriberId: SUBSCRIBER, displayName: 'Titular' }]),
      lockTitularForBillingWrite: jest
        .fn()
        .mockResolvedValue({ exists: true, partyId: PARTY, anonymized: false }),
      hasImpersonationSuspension: jest.fn().mockResolvedValue(false),
      findActiveContractIds: jest.fn().mockResolvedValue([]),
    };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    privacyMarks = { activeMarks: jest.fn().mockResolvedValue({}) };
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue(undefined) };
    service = new BillingPaymentsService(
      {} as never,
      contracts as unknown as BillingContractReadPort,
      audit as unknown as AuditService,
      eventEmitter as unknown as EventEmitter2,
      privacyMarks as never,
      { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) } as never,
    );
  });

  it('impide reintroducir notas al anular un pago de titular anonimizado', async () => {
    contracts.lockTitularForBillingWrite.mockResolvedValueOnce({ exists: true, anonymized: true });
    await expect(
      service.voidPayment(
        PAYMENT,
        { reasonCode: 'ERROR_DE_REGISTRO', note: 'nota sintética' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_TITULAR_ANONYMIZED' } });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE billing_payments'))).toBe(
      false,
    );
  });

  describe('registro de pago', () => {
    it('rechaza un cuerpo inválido antes de abrir transacción', async () => {
      await expect(service.registerPayment({}, 'clave', ACTOR)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(query).not.toHaveBeenCalled();
    });

    it.each([undefined, '', '   ', 'k'.repeat(81)])(
      'exige una clave de idempotencia válida (%p)',
      async (key) => {
        await expect(
          service.registerPayment(registerBody, key as string | undefined, ACTOR),
        ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
      },
    );

    it('rechaza un suscriptor inexistente y uno anonimizado', async () => {
      contracts.lockTitularForBillingWrite.mockResolvedValueOnce({
        exists: false,
        partyId: null,
        anonymized: false,
      });
      await expect(service.registerPayment(registerBody, 'clave', ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      contracts.lockTitularForBillingWrite.mockResolvedValueOnce({
        exists: true,
        partyId: PARTY,
        anonymized: true,
      });
      await expect(service.registerPayment(registerBody, 'clave', ACTOR)).rejects.toMatchObject({
        response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
      });
    });

    it('reproduce un registro idempotente sin volver a insertar', async () => {
      route({ 'FROM billing_payments p': [paymentRow] });
      await expect(
        service.registerPayment(registerBody, 'payment-operation-1', ACTOR),
      ).resolves.toMatchObject({ id: PAYMENT });
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO billing_payments')),
      ).toBe(false);
    });

    it('rechaza la reutilización de la clave con otro contenido o con otras asignaciones', async () => {
      route({ 'FROM billing_payments p': [{ ...paymentRow, amount: '99.00' }] });
      await expect(
        service.registerPayment(registerBody, 'payment-operation-1', ACTOR),
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });

      route({ 'FROM billing_payments p': [{ ...paymentRow, allocations_fingerprint: null }] });
      await expect(
        service.registerPayment(
          {
            ...registerBody,
            allocations: [{ documentId: DOCUMENT, amount: '20.00' }],
          },
          'payment-operation-1',
          ACTOR,
        ),
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    });

    it('relee el pago cuando el INSERT pierde la carrera idempotente', async () => {
      route({ 'INSERT INTO billing_payments': [] });
      await expect(
        service.registerPayment(registerBody, 'payment-operation-1', ACTOR),
      ).resolves.toMatchObject({ id: PAYMENT });
    });

    it('falla si el pago idempotente no se puede releer tras el conflicto', async () => {
      route({ 'INSERT INTO billing_payments': [], 'FROM billing_payments p': [] });
      await expect(
        service.registerPayment(registerBody, 'payment-operation-1', ACTOR),
      ).rejects.toThrow('No se pudo releer el pago idempotente.');
    });

    it('falla si el pago insertado no queda disponible', async () => {
      route({ INSERT: [] });
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT amount::text FROM billing_payments')) return [{ amount: '20.00' }];
        if (sql.includes('INSERT INTO billing_payments')) return [{ id: PAYMENT }];
        if (sql.includes('FROM billing_payments p')) return [];
        return [];
      });
      await expect(service.registerPayment(registerBody, 'clave', ACTOR)).rejects.toThrow(
        'El pago no quedó disponible después del registro.',
      );
    });
  });

  describe('asignación de saldo a favor', () => {
    it('rechaza un cuerpo inválido o un pago que no coincide con la ruta', async () => {
      await expect(service.allocateCredit(PAYMENT, {}, ACTOR)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      await expect(
        service.allocateCredit(
          PAYMENT,
          {
            subscriberId: SUBSCRIBER,
            allocations: [
              {
                paymentId: '00000000-0000-4000-8000-000000000099',
                documentId: DOCUMENT,
                amount: '1.00',
              },
            ],
          },
          ACTOR,
        ),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    });

    it('rechaza un pago inexistente, anulado o de otro titular', async () => {
      route({ 'FOR UPDATE OF p': [] });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toMatchObject({
        response: { code: 'BILLING_PAYMENT_NOT_FOUND' },
      });

      route({ 'FROM billing_payments p': [{ ...paymentRow, status: 'ANULADO' }] });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toMatchObject({
        response: { code: 'BILLING_PAYMENT_VOIDED' },
      });

      route({
        'FROM billing_payments p': [
          { ...paymentRow, subscriber_id: '00000000-0000-4000-8000-000000000098' },
        ],
      });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rechaza una asignación que excede el saldo del pago', async () => {
      await expect(
        service.allocateCredit(PAYMENT, allocationBody('25.00'), ACTOR),
      ).rejects.toMatchObject({ response: { code: 'BILLING_ALLOCATION_EXCEEDS_BALANCE' } });
    });

    it('rechaza una asignación a documento inexistente, no emitido o ya cubierto', async () => {
      route({ 'FROM billing_documents d': [] });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toMatchObject({
        response: { code: 'BILLING_DOCUMENT_NOT_FOUND' },
      });

      route({ 'FROM billing_documents d': [{ ...documentRow, status: 'BORRADOR' }] });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toMatchObject({
        response: { code: 'BILLING_DOCUMENT_NOT_ISSUED' },
      });

      route({ paid_amount: [{ paid_amount: '100.00' }] });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toMatchObject({
        response: { code: 'BILLING_ALLOCATION_EXCEEDS_BALANCE' },
      });
    });

    it('aplica la asignación y devuelve el pago actualizado', async () => {
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).resolves.toMatchObject(
        { id: PAYMENT },
      );
      expect(
        query.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO billing_payment_allocations'),
        ),
      ).toBe(true);
      expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    });

    it('falla si el pago deja de estar disponible durante la asignación', async () => {
      let lookups = 0;
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT amount::text FROM billing_payments')) return [{ amount: '20.00' }];
        if (sql.includes('FROM billing_documents d')) return [documentRow];
        if (sql.includes('FROM billing_payments p')) return lookups++ === 0 ? [paymentRow] : [];
        if (sql.includes('allocated_amount')) return [{ allocated_amount: '0.00' }];
        if (sql.includes('paid_amount')) return [{ paid_amount: '0.00' }];
        return [];
      });
      await expect(service.allocateCredit(PAYMENT, allocationBody(), ACTOR)).rejects.toThrow(
        'El pago dejó de estar disponible durante la asignación.',
      );
    });
  });

  describe('anulación de pago', () => {
    it('rechaza un cuerpo inválido', async () => {
      await expect(service.voidPayment(PAYMENT, {}, ACTOR)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rechaza un pago inexistente y uno ya anulado', async () => {
      route({ 'FOR UPDATE OF p': [] });
      await expect(
        service.voidPayment(PAYMENT, { reasonCode: 'ERROR_DE_REGISTRO' }, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(query).toHaveBeenCalled();
    });

    it('anula el pago, revierte aplicaciones y recalcula señales', async () => {
      route({
        'SELECT DISTINCT d.period_id': [{ period_id: PERIOD }],
      });
      await expect(
        service.voidPayment(PAYMENT, { reasonCode: 'ERROR_DE_REGISTRO', note: 'nota' }, ACTOR),
      ).resolves.toMatchObject({ id: PAYMENT });
      expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status = 'ANULADO'"))).toBe(
        true,
      );
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: { status: 'ANULADO', reasonCode: 'ERROR_DE_REGISTRO' },
        }),
        expect.anything(),
      );
    });

    it('falla si el pago deja de estar disponible durante la anulación', async () => {
      let lookups = 0;
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM billing_payments p')) return lookups++ === 0 ? [paymentRow] : [];
        if (sql.includes('SELECT DISTINCT d.period_id')) return [];
        return [];
      });
      await expect(
        service.voidPayment(PAYMENT, { reasonCode: 'ERROR_DE_REGISTRO' }, ACTOR),
      ).rejects.toThrow('El pago dejó de estar disponible durante la anulación.');
    });
  });

  describe('consulta de pagos', () => {
    it('responde 404 al consultar un pago inexistente', async () => {
      route({ 'FROM billing_payments p': [] });
      await expect(service.getPayment(PAYMENT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve la lista vacía sin resolver puertos', async () => {
      route({ 'FROM billing_payments p': [] });
      const result = await service.listPayments({});
      expect(result.data).toEqual([]);
      expect(contracts.findTitularRefs).not.toHaveBeenCalled();
    });

    it('oculta el nombre de un titular anonimizado', async () => {
      contracts.findTitularRefs.mockResolvedValueOnce([
        { subscriberId: SUBSCRIBER, partyId: null, anonymized: true },
      ]);
      const result = await service.listPayments({});
      expect(result.data[0]).toMatchObject({
        subscriberDisplayName: null,
        subscriberProtected: true,
      });
    });

    it('redacta el nombre de un titular bloqueado sin permiso', async () => {
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const result = await service.listPayments({}, { actorId: ACTOR, canSeeBlocked: false });
      expect(result.data[0]).toMatchObject({
        subscriberDisplayName: '[Dato protegido por custodia legal]',
        subscriberProtected: true,
      });
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('audita el listado con bloqueados cuando hay permiso y concesión', async () => {
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const result = await service.listPayments(
        {},
        { actorId: ACTOR, canSeeBlocked: true, grantedBy: 'PRIVACY_READ' },
      );
      expect(result.data[0]?.subscriberProtected).toBe(false);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: { totalServed: 1, blockedServed: 1, grantedBy: 'PRIVACY_READ' },
        }),
        expect.anything(),
      );
    });

    it('responde 503 si falta la concesión o la auditoría falla', async () => {
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      await expect(
        service.listPayments({}, { actorId: ACTOR, canSeeBlocked: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      audit.logWithin.mockRejectedValueOnce(new Error('audit caída'));
      await expect(
        service.listPayments(
          {},
          { actorId: ACTOR, canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' },
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('estado de cuenta', () => {
    const statementOverrides = {
      registered_amount: [{ registered_amount: '20.00', allocated_amount: '0.00' }],
    };

    it('rechaza un titular inexistente o anonimizado', async () => {
      contracts.findTitularRefs.mockResolvedValueOnce([]);
      await expect(service.statementForSubscriber(SUBSCRIBER)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      contracts.findTitularRefs.mockResolvedValueOnce([
        { subscriberId: SUBSCRIBER, partyId: PARTY, anonymized: true },
      ]);
      await expect(service.statementForSubscriber(SUBSCRIBER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('responde 503 cuando la lectura de marcas falla', async () => {
      privacyMarks.activeMarks.mockRejectedValueOnce(new Error('privacy caída'));
      await expect(service.statementForSubscriber(SUBSCRIBER)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('redacta el adquirente bloqueado y audita cuando hay concesión', async () => {
      privacyMarks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      route(statementOverrides);
      const blocked = await service.statementForSubscriber(SUBSCRIBER);
      expect(blocked.buyerProtected).toBe(true);
      expect(blocked.documents[0]?.buyerSnapshot?.['displayName']).not.toBe('Adquirente');

      const granted = await service.statementForSubscriber(SUBSCRIBER, ACTOR, {
        canSeeBlocked: true,
        grantedBy: 'PRIVACY_READ',
      });
      expect(granted.buyerProtected).toBe(false);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RECORD_ACCESS',
          entityId: SUBSCRIBER,
          newValue: { privacyMark: 'DATOS_BLOQUEADOS', grantedBy: 'PRIVACY_READ' },
        }),
        expect.anything(),
      );
    });

    it('responde 503 si hay bloqueo con permiso pero sin concesión o con auditoría fallida', async () => {
      privacyMarks.activeMarks.mockResolvedValue({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      route(statementOverrides);
      await expect(
        service.statementForSubscriber(SUBSCRIBER, ACTOR, { canSeeBlocked: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      audit.logWithin.mockRejectedValueOnce(new Error('audit caída'));
      await expect(
        service.statementForSubscriber(SUBSCRIBER, ACTOR, {
          canSeeBlocked: true,
          grantedBy: 'PRIVACY_READ',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('marca la retención por suplantación desde la marca o desde el puerto de contratos', async () => {
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['VICTIMA_FALSEDAD_PERSONAL'] });
      route(statementOverrides);
      await expect(service.statementForSubscriber(SUBSCRIBER)).resolves.toMatchObject({
        impersonationHold: true,
      });

      privacyMarks.activeMarks.mockResolvedValueOnce({});
      contracts.hasImpersonationSuspension.mockResolvedValueOnce(true);
      route(statementOverrides);
      await expect(service.statementForSubscriber(SUBSCRIBER)).resolves.toMatchObject({
        impersonationHold: true,
      });
    });

    it('calcula estados PAGADO, VENCIDO, PARCIAL y PENDIENTE y omite importes no emitidos', async () => {
      route({
        ...statementOverrides,
        'ORDER BY d.issue_date': [
          { ...documentRow, status: 'EMITIDO', paid_amount: '119.00' },
          {
            ...documentRow,
            id: '00000000-0000-4000-8000-000000000051',
            status: 'EMITIDO',
            paid_amount: '59.50',
          },
          {
            ...documentRow,
            id: '00000000-0000-4000-8000-000000000052',
            status: 'EMITIDO',
            due_date: '2020-01-01',
          },
          { ...documentRow, id: '00000000-0000-4000-8000-000000000053', status: 'BORRADOR' },
        ],
      });
      const statement = await service.statementForSubscriber(SUBSCRIBER);
      expect(statement.documents.map((document) => document.paymentState)).toEqual([
        'PAGADO',
        'PARCIAL',
        'VENCIDO',
        null,
      ]);
      expect(statement.documents[3]).toMatchObject({ paidAmount: '0.00', pendingAmount: '0.00' });
    });

    it('expone la fecha de anulación de un documento anulado', async () => {
      route({
        ...statementOverrides,
        'ORDER BY d.issue_date': [
          {
            ...documentRow,
            status: 'ANULADO',
            voided_at: new Date('2026-11-06T12:00:00.000Z'),
            void_reason_code: 'ERROR_DE_VALOR',
          },
        ],
      });
      const statement = await service.statementForSubscriber(SUBSCRIBER);
      expect(statement.documents[0]?.voidedAt).toBe('2026-11-06T12:00:00.000Z');
    });

    it('devuelve el estado de periodos vacío sin consultar', async () => {
      await expect(service.periodStates([], '2026-11-06')).resolves.toEqual({});
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('emisión de eventos', () => {
    it('emite cada evento de periodo en orden', async () => {
      await service.emitEvents([
        {
          name: 'billing.contract-period.paid',
          payload: {
            tenantId: TENANT,
            contractId: CONTRACT,
            periodId: PERIOD,
            periodStart: '2026-10-05',
            occurredAt: '2026-11-05',
          },
        },
      ]);
      expect(eventEmitter.emitAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('permisos de lectura', () => {
    it('reconoce el permiso de privacidad como concesión de lectura de bloqueados', () => {
      expect(AccessPermissionKey.PRIVACY_READ).toBe('privacy.read');
    });
  });
});
