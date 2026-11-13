import { TAX_COLOMBIA_PRESETS } from '../../taxation/tax-colombia-presets';
import {
  BILLING_ERROR_CODES,
  BILLING_WITHHOLDING_AGENT_RUT_RESPONSIBILITIES,
  BILLING_WITHHOLDING_TAX_CODES,
} from './billing-constants';
import { BillingAccountStatementSchema } from './billing-accounts.contract';
import { BillingDocumentResponseSchema } from './billing-documents.contract';
import { RUT_RESPONSIBILITIES } from '../../enums/vat-responsibility.enum';
import {
  BillingPaymentResponseSchema,
  BillingWithholdingOptionsResponseSchema,
  PaymentWithholdingInputSchema,
  RegisterPaymentCommandSchema,
  expectedWithholdingCents,
} from './billing-payments.contract';

const documentId = '30000000-0000-4000-8000-000000000001';

const retefuente = {
  taxCode: 'RETE_FUENTE_SERVICIOS',
  base: '1000000.00',
  rate: '4',
  amount: '40000.00',
  certificateNumber: 'CERT-2026-001',
} as const;

describe('Retenciones en el pago — contrato (spec MOD14 2026-11-13 R6, R7)', () => {
  it('los tipos admitidos son presets de Tributación de retención', () => {
    for (const code of BILLING_WITHHOLDING_TAX_CODES) {
      const preset = TAX_COLOMBIA_PRESETS.find((item) => item.code === code);
      expect(preset).toBeDefined();
      expect(preset?.baseRate).toBeGreaterThan(0);
    }
  });

  it('la marca de agente retenedor usa responsabilidades del catálogo del RUT', () => {
    for (const code of BILLING_WITHHOLDING_AGENT_RUT_RESPONSIBILITIES) {
      expect(RUT_RESPONSIBILITIES).toContain(code);
    }
  });

  it('calcula el valor esperado con redondeo al centavo y tarifas de cuatro decimales', () => {
    expect(expectedWithholdingCents('1000000.00', '4')).toBe(4_000_000);
    expect(expectedWithholdingCents('1000000', 0.414)).toBe(414_000);
    expect(expectedWithholdingCents('123.45', '0.966')).toBe(119);
    expect(expectedWithholdingCents(999_999_999_999.99, 100)).toBe(99_999_999_999_999);
  });

  it('acepta una línea válida, con tarifa editada y redondeo dentro de un peso', () => {
    expect(PaymentWithholdingInputSchema.safeParse(retefuente).success).toBe(true);
    expect(
      PaymentWithholdingInputSchema.safeParse({
        ...retefuente,
        rate: 3.5,
        amount: '35000.90',
        documentId,
      }).success,
    ).toBe(true);
  });

  it('rechaza valor fuera de la tolerancia, superior a la base o sin certificado', () => {
    expect(
      PaymentWithholdingInputSchema.safeParse({ ...retefuente, amount: '40001.01' }).success,
    ).toBe(false);
    expect(
      PaymentWithholdingInputSchema.safeParse({
        ...retefuente,
        base: '100.00',
        rate: '100',
        amount: '100.01',
      }).success,
    ).toBe(false);
    expect(
      PaymentWithholdingInputSchema.safeParse({ ...retefuente, certificateNumber: '   ' }).success,
    ).toBe(false);
    const { certificateNumber: _omit, ...withoutCertificate } = retefuente;
    expect(PaymentWithholdingInputSchema.safeParse(withoutCertificate).success).toBe(false);
  });

  it('rechaza tipos ajenos, tarifas fuera de rango y campos desconocidos', () => {
    for (const invalid of [
      { ...retefuente, taxCode: 'RETE_IVA' },
      { ...retefuente, rate: '0' },
      { ...retefuente, rate: '100.5' },
      { ...retefuente, rate: '4.12345' },
      { ...retefuente, rate: 4.12345 },
      { ...retefuente, extra: true },
    ]) {
      expect(PaymentWithholdingInputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('el comando de pago admite hasta diez retenciones y es opcional', () => {
    const base = {
      subscriberId: documentId,
      method: 'TRANSFERENCIA',
      amount: '1145860.00',
      paidAt: '2026-11-13',
    };
    expect(RegisterPaymentCommandSchema.safeParse(base).success).toBe(true);
    expect(
      RegisterPaymentCommandSchema.safeParse({ ...base, withholdings: [retefuente] }).success,
    ).toBe(true);
    expect(
      RegisterPaymentCommandSchema.safeParse({
        ...base,
        withholdings: Array.from({ length: 11 }, () => retefuente),
      }).success,
    ).toBe(false);
  });

  it('la respuesta del pago serializa retenciones con tarifa de cuatro decimales', () => {
    const payment = {
      id: documentId,
      tenantId: documentId,
      subscriberId: documentId,
      method: 'TRANSFERENCIA',
      amount: '1145860.00',
      paidAt: '2026-11-13',
      idempotencyKey: 'k',
      status: 'REGISTRADO',
      createdBy: documentId,
      createdAt: '2026-11-13T00:00:00.000Z',
      withholdingAmount: '40000.00',
      withholdings: [
        {
          id: documentId,
          paymentId: documentId,
          documentId,
          taxCode: 'RETE_FUENTE_SERVICIOS',
          base: '1000000.00',
          rate: '4.0000',
          amount: '40000.00',
          certificateNumber: null,
          voidedAt: null,
          createdBy: documentId,
          createdAt: '2026-11-13T00:00:00.000Z',
        },
      ],
    };
    expect(BillingPaymentResponseSchema.safeParse(payment).success).toBe(true);
    expect(
      BillingPaymentResponseSchema.safeParse({
        ...payment,
        withholdings: [{ ...payment.withholdings[0], rate: '4' }],
      }).success,
    ).toBe(false);
  });

  it('las opciones de retención declaran elegibilidad y origen de la tarifa', () => {
    expect(
      BillingWithholdingOptionsResponseSchema.safeParse({
        subscriberId: documentId,
        eligible: true,
        eligibility: 'PERSONA_JURIDICA',
        options: [
          {
            taxCode: 'RETE_ICA',
            name: 'ReteICA',
            suggestedRate: '0.4140',
            source: 'TRIBUTACION',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('totalWithholding del estado de cuenta es dinero opcional', () => {
    const statement = {
      subscriberId: documentId,
      buyerProtected: false,
      impersonationHold: false,
      totalInvoiced: '1190000.00',
      totalPaid: '1190000.00',
      totalPending: '0.00',
      creditBalance: '0.00',
      documents: [],
      payments: [],
    };
    expect(BillingAccountStatementSchema.safeParse(statement).success).toBe(true);
    expect(
      BillingAccountStatementSchema.safeParse({ ...statement, totalWithholding: '44140.00' })
        .success,
    ).toBe(true);
    for (const totalWithholding of ['-1.00', '1.234', 44140, null]) {
      expect(
        BillingAccountStatementSchema.safeParse({ ...statement, totalWithholding }).success,
      ).toBe(false);
    }
  });

  it('withholdingAmount del documento y del pago es dinero opcional', () => {
    const shape = BillingDocumentResponseSchema.shape.withholdingAmount;
    expect(shape.safeParse(undefined).success).toBe(true);
    expect(shape.safeParse('40000.00').success).toBe(true);
    for (const value of ['-40000.00', '1.234', 40000, null]) {
      expect(shape.safeParse(value).success).toBe(false);
    }
    const paymentShape = BillingPaymentResponseSchema.shape.withholdingAmount;
    expect(paymentShape.safeParse('0.00').success).toBe(true);
    expect(paymentShape.safeParse(null).success).toBe(false);
  });

  it('los topes del servidor tienen códigos de error propios (H-1)', () => {
    expect(BILLING_ERROR_CODES).toMatchObject({
      BILLING_WITHHOLDING_DUPLICATE: 'BILLING_WITHHOLDING_DUPLICATE',
      BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL: 'BILLING_WITHHOLDING_BASE_EXCEEDS_SUBTOTAL',
      BILLING_WITHHOLDING_RATE_ABOVE_CEILING: 'BILLING_WITHHOLDING_RATE_ABOVE_CEILING',
    });
  });
});
