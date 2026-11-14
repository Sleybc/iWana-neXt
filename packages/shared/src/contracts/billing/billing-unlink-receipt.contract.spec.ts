import { BILLING_ALLOCATION_UNLINK_REASONS, BILLING_ERROR_CODES } from './billing-constants';
import {
  BillingPaymentAllocationResponseSchema,
  BillingPaymentResponseSchema,
  UnlinkAllocationCommandSchema,
} from './billing-payments.contract';

const TENANT = '00000000-0000-4000-8000-000000000001';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';
const PAYMENT = '00000000-0000-4000-8000-000000000020';
const DOCUMENT = '00000000-0000-4000-8000-000000000030';
const ACTOR = '00000000-0000-4000-8000-000000000040';

/**
 * Desasociar y recibo numerado (spec MOD05↔MOD14 2026-11-13 D6, D8; informe de cierre v1.0, P-06
 * y P-09): comando, motivos cerrados, campos opcionales nuevos del pago y de la aplicación, y los
 * códigos de error que la API lanza.
 */
describe('contrato de desasociar y del recibo numerado', () => {
  it('los motivos de desasociación son una lista cerrada y estable', () => {
    expect(BILLING_ALLOCATION_UNLINK_REASONS).toEqual([
      'APLICADO_A_DOCUMENTO_EQUIVOCADO',
      'VALOR_EQUIVOCADO',
      'REASIGNACION',
    ]);
  });

  it('UnlinkAllocationCommandSchema acepta cada motivo y rechaza otros, vacío y campos extra', () => {
    for (const reasonCode of BILLING_ALLOCATION_UNLINK_REASONS) {
      expect(UnlinkAllocationCommandSchema.parse({ reasonCode })).toEqual({ reasonCode });
    }
    for (const bad of [
      {},
      { reasonCode: 'OTRO' },
      { reasonCode: 'reasignacion' },
      { reasonCode: null },
      { reasonCode: 'REASIGNACION', note: 'texto libre' },
      { reasonCode: 'REASIGNACION', amount: '10.00' },
    ]) {
      expect(UnlinkAllocationCommandSchema.safeParse(bad).success).toBe(false);
    }
  });

  const allocation = {
    id: '00000000-0000-4000-8000-000000000050',
    tenantId: TENANT,
    paymentId: PAYMENT,
    documentId: DOCUMENT,
    amount: '40.00',
    createdBy: ACTOR,
    createdAt: '2026-11-13T12:00:00.000Z',
  };

  it('reversalReasonCode de la aplicación es opcional, anulable y del dominio cerrado', () => {
    expect(BillingPaymentAllocationResponseSchema.safeParse(allocation).success).toBe(true);
    for (const reversalReasonCode of [null, ...BILLING_ALLOCATION_UNLINK_REASONS]) {
      expect(
        BillingPaymentAllocationResponseSchema.safeParse({
          ...allocation,
          reversedAt: '2026-11-13T13:00:00.000Z',
          reversedBy: ACTOR,
          reversalReasonCode,
        }).success,
      ).toBe(true);
    }
    expect(
      BillingPaymentAllocationResponseSchema.safeParse({
        ...allocation,
        reversalReasonCode: 'OTRO',
      }).success,
    ).toBe(false);
  });

  const payment = {
    id: PAYMENT,
    tenantId: TENANT,
    subscriberId: SUBSCRIBER,
    method: 'EFECTIVO',
    amount: '100.00',
    paidAt: '2026-11-13',
    idempotencyKey: 'clave',
    status: 'REGISTRADO',
    createdBy: ACTOR,
    createdAt: '2026-11-13T12:00:00.000Z',
  };

  it('receiptNumber, imported y externalId son opcionales y aditivos', () => {
    expect(BillingPaymentResponseSchema.safeParse(payment).success).toBe(true);
    expect(
      BillingPaymentResponseSchema.parse({
        ...payment,
        receiptNumber: 15,
        imported: false,
        externalId: null,
      }),
    ).toMatchObject({ receiptNumber: 15, imported: false, externalId: null });
    expect(
      BillingPaymentResponseSchema.parse({
        ...payment,
        receiptNumber: null,
        imported: true,
        externalId: 'uisp:payment:123',
      }),
    ).toMatchObject({ receiptNumber: null, imported: true, externalId: 'uisp:payment:123' });
  });

  it('receiptNumber es un entero positivo; imported es booleano', () => {
    for (const receiptNumber of [0, -1, 1.5, '15']) {
      expect(BillingPaymentResponseSchema.safeParse({ ...payment, receiptNumber }).success).toBe(
        false,
      );
    }
    expect(BillingPaymentResponseSchema.safeParse({ ...payment, imported: 'si' }).success).toBe(
      false,
    );
    expect(BillingPaymentResponseSchema.safeParse({ ...payment, externalId: 12 }).success).toBe(
      false,
    );
  });

  it('BILLING_ERROR_CODES incluye los códigos de correos, recibo y desasociar que la API lanza', () => {
    for (const code of [
      'BILLING_EMAIL_IMPORTED_NOT_SENDABLE',
      'BILLING_EMAIL_QUEUE_UNAVAILABLE',
      'BILLING_EMAIL_RATE_LIMITED',
      'BILLING_PRIVACY_UNAVAILABLE',
      'BILLING_PAYMENT_NOT_FOUND',
      'BILLING_RECEIPT_UNAVAILABLE',
      'BILLING_RECEIPT_NOT_AVAILABLE',
      'BILLING_DOCUMENT_NOT_ISSUED',
      'BILLING_PAYMENT_VOIDED',
      'BILLING_ALLOCATION_NOT_FOUND',
      'BILLING_ALLOCATION_NOT_UNLINKABLE',
      'BILLING_ALLOCATION_HAS_WITHHOLDING',
    ] as const) {
      expect(BILLING_ERROR_CODES[code]).toBe(code);
    }
    // Clave y valor coinciden en toda la lista.
    for (const [key, value] of Object.entries(BILLING_ERROR_CODES)) expect(value).toBe(key);
  });
});
