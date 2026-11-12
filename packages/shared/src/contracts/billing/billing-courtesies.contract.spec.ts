import {
  BILLING_DOCUMENT_LINE_KINDS,
  BillingAccountStatementSchema,
  BillingCourtesyResponseSchema,
  BillingDocumentResponseSchema,
  ContractBillingSummarySchema,
  GrantCourtesyCommandSchema,
  VoidCourtesyCommandSchema,
} from './index';

const uuid = '5e1d47e5-7241-4e63-9684-2b51ecee55ba';

const line = {
  id: uuid,
  documentId: uuid,
  kind: 'PRORRATEO' as const,
  description: 'Prorrateo',
  quantity: '1',
  unitPrice: '3548.39',
  baseAmount: '3548.39',
  taxAmount: '0.00',
  total: '3548.39',
  vatTreatment: 'EXEMPT',
  vatRate: '0.0000',
  position: 0,
};

const document = {
  id: uuid,
  tenantId: uuid,
  periodId: uuid,
  contractId: uuid,
  subscriberId: uuid,
  status: 'EMITIDO' as const,
  dueDate: '2026-11-14',
  periodStart: '2026-10-30',
  periodEnd: '2026-10-31',
  coveredStart: '2026-10-30',
  paymentState: 'PAGADO' as const,
  buyerProtected: false,
  subtotal: '3548.39',
  taxTotal: '0.00',
  total: '3548.39',
  unbilledAdditionalCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const courtesy = {
  id: uuid,
  documentId: uuid,
  subscriberId: uuid,
  application: 'AJUSTE_SOBRE_EMITIDO' as const,
  target: 'LINEA' as const,
  sourceLineId: uuid,
  lineId: null,
  amount: '3548.39',
  reasonCode: 'PRORRATEO_INICIAL' as const,
  note: null,
  status: 'ACTIVA' as const,
  voidReasonCode: null,
  voidNote: null,
  voidedAt: null,
  voidedBy: null,
  createdBy: uuid,
  createdAt: '2026-11-12T00:00:00.000Z',
};

describe('contrato de cortesías (spec MOD14 2026-11-12 D4, R4, R5)', () => {
  it('la línea CORTESIA está en el catálogo de tipos de línea', () => {
    expect(BILLING_DOCUMENT_LINE_KINDS).toContain('CORTESIA');
  });

  it('acepta cortesía por valor y por línea con motivo de catálogo', () => {
    expect(
      GrantCourtesyCommandSchema.parse({
        target: 'VALOR',
        amount: 3548.39,
        reasonCode: 'PRORRATEO_INICIAL',
      }),
    ).toMatchObject({ target: 'VALOR', amount: 3548.39 });
    expect(
      GrantCourtesyCommandSchema.parse({
        target: 'LINEA',
        lineId: uuid,
        reasonCode: 'OTRO',
        note: '  Acuerdo con el cliente  ',
      }),
    ).toMatchObject({ lineId: uuid, note: 'Acuerdo con el cliente' });
  });

  it.each([
    [{ target: 'VALOR', reasonCode: 'PRORRATEO_INICIAL' }],
    [{ target: 'VALOR', amount: '10.00', lineId: uuid, reasonCode: 'PRORRATEO_INICIAL' }],
    [{ target: 'LINEA', reasonCode: 'PRORRATEO_INICIAL' }],
    [{ target: 'LINEA', lineId: uuid, amount: '1.00', reasonCode: 'PRORRATEO_INICIAL' }],
    [{ target: 'VALOR', amount: '10.00', reasonCode: 'OTRO' }],
    [{ target: 'VALOR', amount: '10.00', reasonCode: 'OTRO', note: '   ' }],
    [{ target: 'VALOR', amount: '0', reasonCode: 'PRORRATEO_INICIAL' }],
    [{ target: 'VALOR', amount: '10.001', reasonCode: 'PRORRATEO_INICIAL' }],
    [{ target: 'VALOR', amount: '10.00', reasonCode: 'NO_EXISTE' }],
    [{ target: 'VALOR', amount: '10.00', reasonCode: 'PRORRATEO_INICIAL', note: 'x'.repeat(501) }],
    [{ target: 'VALOR', amount: '10.00', reasonCode: 'PRORRATEO_INICIAL', extra: true }],
  ])('rechaza el comando %j', (body) => {
    expect(GrantCourtesyCommandSchema.safeParse(body).success).toBe(false);
  });

  it('la anulación exige motivo de catálogo', () => {
    expect(VoidCourtesyCommandSchema.safeParse({ reasonCode: 'ERROR_DE_REGISTRO' }).success).toBe(
      true,
    );
    expect(VoidCourtesyCommandSchema.safeParse({}).success).toBe(false);
    expect(VoidCourtesyCommandSchema.safeParse({ reasonCode: 'OTRO' }).success).toBe(false);
  });

  it('solo la línea CORTESIA admite montos negativos', () => {
    const negative = {
      ...line,
      unitPrice: '-3548.39',
      baseAmount: '-3548.39',
      total: '-3548.39',
    };
    expect(
      BillingDocumentResponseSchema.safeParse({
        ...document,
        lines: [{ ...negative, kind: 'CORTESIA' }],
      }).success,
    ).toBe(true);
    expect(
      BillingDocumentResponseSchema.safeParse({ ...document, lines: [negative] }).success,
    ).toBe(false);
  });

  it('una línea CORTESIA nunca tiene montos positivos (≤ 0, como el CHECK de la 203)', () => {
    const lines = (values: Partial<typeof line>) => ({
      ...document,
      lines: [{ ...line, kind: 'CORTESIA', ...values }],
    });
    expect(BillingDocumentResponseSchema.safeParse(lines({})).success).toBe(false);
    expect(
      BillingDocumentResponseSchema.safeParse(
        lines({ unitPrice: '-10.00', baseAmount: '-10.00', taxAmount: '1.90', total: '-8.10' }),
      ).success,
    ).toBe(false);
    expect(
      BillingDocumentResponseSchema.safeParse(
        lines({ unitPrice: '-10.00', baseAmount: '-10.00', taxAmount: '0.00', total: '-10.00' }),
      ).success,
    ).toBe(true);
  });

  it('el documento expone el monto de cortesía y sus cortesías sin tocar paidAmount', () => {
    const parsed = BillingDocumentResponseSchema.parse({
      ...document,
      paidAmount: '0.00',
      courtesyAmount: '3548.39',
      pendingAmount: '0.00',
      courtesies: [courtesy],
    });
    expect(parsed.courtesies?.[0]).toEqual(courtesy);
    expect(BillingCourtesyResponseSchema.safeParse({ ...courtesy, amount: '-1.00' }).success).toBe(
      false,
    );
  });

  it('el estado de cuenta suma cortesías y las lista (campos opcionales compatibles)', () => {
    const base = {
      subscriberId: uuid,
      buyerProtected: false,
      impersonationHold: false,
      totalInvoiced: '3548.39',
      totalPaid: '0.00',
      totalPending: '0.00',
      creditBalance: '0.00',
      documents: [],
      payments: [],
    };
    // Opcionales: un consumidor anterior al bloque D sigue validando.
    expect(BillingAccountStatementSchema.parse(base)).not.toHaveProperty('courtesies');
    expect(
      BillingAccountStatementSchema.parse({
        ...base,
        totalCourtesy: '3548.39',
        courtesies: [courtesy],
      }).courtesies,
    ).toHaveLength(1);
  });

  it('ContractBillingSummarySchema.totalCourtesy es dinero opcional y no negativo', () => {
    const summary = {
      contractId: uuid,
      totalInvoiced: '58548.39',
      totalPaid: '0.00',
      totalPending: '55000.00',
    };
    // Opcional: un consumidor anterior al bloque D sigue validando.
    expect(ContractBillingSummarySchema.parse(summary)).not.toHaveProperty('totalCourtesy');
    expect(
      ContractBillingSummarySchema.parse({ ...summary, totalCourtesy: '3548.39' }).totalCourtesy,
    ).toBe('3548.39');
    expect(
      ContractBillingSummarySchema.safeParse({ ...summary, totalCourtesy: '-1.00' }).success,
    ).toBe(false);
    expect(
      ContractBillingSummarySchema.safeParse({ ...summary, totalCourtesy: 3548.39 }).success,
    ).toBe(false);
  });
});
