import {
  BillingStatementLedgerQuerySchema,
  BillingStatementLedgerSchema,
} from './billing-accounts.contract';
import {
  BILLING_EMAIL_REASON_CODES,
  BillingEmailLogEntrySchema,
  SendStatementEmailCommandSchema,
} from './billing-emails.contract';

const ID = '00000000-0000-4000-8000-000000000001';

describe('contratos del libro y de los correos de facturación (spec 2026-11-13)', () => {
  it('el periodo del libro acepta fechas civiles opcionales con from <= to', () => {
    expect(BillingStatementLedgerQuerySchema.parse({})).toEqual({});
    expect(
      BillingStatementLedgerQuerySchema.parse({ from: '2024-02-29', to: '2024-03-01' }),
    ).toEqual({
      from: '2024-02-29',
      to: '2024-03-01',
    });
    for (const bad of [
      { from: '2025-02-29' },
      { to: '2026-1-01' },
      { from: '2026-05-01', to: '2026-04-30' },
      { from: '2026-05-01', email: 'x@y.co' },
    ])
      expect(BillingStatementLedgerQuerySchema.safeParse(bad).success).toBe(false);
    expect(SendStatementEmailCommandSchema).toBe(BillingStatementLedgerQuerySchema);
  });

  it('el libro admite saldo negativo (a favor) y rechaza tipos de fila desconocidos', () => {
    const ledger = {
      subscriberId: ID,
      from: null,
      to: '2026-11-13',
      openingBalance: '0.00',
      closingBalance: '-50.00',
      buyerProtected: false,
      rows: [
        {
          kind: 'PAGO',
          date: '2026-11-01',
          reference: null,
          debit: '0.00',
          credit: '50.00',
          balance: '-50.00',
          documentId: null,
          paymentId: ID,
          dueDate: null,
          method: 'EFECTIVO',
          receiptNumber: 3,
        },
      ],
    };
    expect(BillingStatementLedgerSchema.parse(ledger)).toEqual(ledger);
    expect(
      BillingStatementLedgerSchema.safeParse({
        ...ledger,
        rows: [{ ...ledger.rows[0], kind: 'NOTA_CREDITO' }],
      }).success,
    ).toBe(false);
    expect(
      BillingStatementLedgerSchema.safeParse({
        ...ledger,
        rows: [{ ...ledger.rows[0], credit: '-1.00' }],
      }).success,
    ).toBe(false);
  });

  it('el registro de correos no tiene campos de texto libre ni motivos abiertos', () => {
    const entry = {
      id: ID,
      subscriberId: ID,
      kind: 'RECIBO',
      documentId: null,
      paymentId: ID,
      periodFrom: null,
      periodTo: null,
      recipientMasked: null,
      subject: 'Recibo de pago N.º 3 · ISP',
      status: 'RECHAZADO',
      reasonCode: 'TITULAR_RESTRINGIDO',
      resend: false,
      requestedBy: ID,
      createdAt: '2026-11-13T15:00:00.000Z',
      processedAt: '2026-11-13T15:00:00.000Z',
    };
    expect(BillingEmailLogEntrySchema.parse(entry)).toEqual(entry);
    expect(BillingEmailLogEntrySchema.safeParse({ ...entry, error: 'SMTP 550' }).success).toBe(
      false,
    );
    expect(BillingEmailLogEntrySchema.safeParse({ ...entry, reasonCode: 'OTRO' }).success).toBe(
      false,
    );
    expect(BILLING_EMAIL_REASON_CODES).toEqual([
      'SIN_CORREO',
      'TITULAR_RESTRINGIDO',
      'FALLO_DE_ENVIO',
    ]);
  });
});
