import PDFDocument from 'pdfkit';
import type { BillingAccountStatement } from '@iwana/shared';
import type { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';
import type { BillingPaymentsService } from '../payments/billing-payments.service';
import type { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { formatLedgerDate, formatLedgerMoney } from './billing-statement-ledger.pdf';
import { BillingStatementLedgerService } from './billing-statement-ledger.service';

const TENANT = '00000000-0000-4000-8000-000000000001';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000010';
const DOCUMENT = '00000000-0000-4000-8000-000000000020';
const ACTOR = '00000000-0000-4000-8000-000000000050';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      getOrThrow: () => ({ tenantId: TENANT, schemaName: 'tenant_test', tenantSlug: 'acme' }),
    },
  };
});

function statement(buyerProtected: boolean): BillingAccountStatement {
  return {
    subscriberId: SUBSCRIBER,
    buyerProtected,
    impersonationHold: false,
    totalInvoiced: '119000.00',
    totalPaid: '0.00',
    totalPending: '119000.00',
    creditBalance: '0.00',
    documents: [
      {
        id: DOCUMENT,
        status: 'EMITIDO',
        number: 'DC-000001',
        externalNumber: null,
        issueDate: '2026-10-01',
        dueDate: '2026-10-15',
        createdAt: '2026-10-01T15:00:00.000Z',
        total: '119000.00',
        courtesyAmount: '0.00',
        pendingAmount: '119000.00',
        buyerSnapshot: { displayName: buyerProtected ? 'Titular protegido' : 'Titular Sintético' },
      },
    ],
    payments: [],
    courtesies: [],
    contractSummaries: [],
  } as unknown as BillingAccountStatement;
}

describe('BillingStatementLedgerService', () => {
  let payments: { statementForSubscriber: jest.Mock };
  let service: BillingStatementLedgerService;

  beforeEach(() => {
    payments = { statementForSubscriber: jest.fn().mockResolvedValue(statement(false)) };
    service = new BillingStatementLedgerService(
      payments as unknown as BillingPaymentsService,
      {
        getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
      } as unknown as SettingsPriorityTenantReadPort,
      {
        getIssuerIdentity: jest.fn().mockResolvedValue({
          legalName: 'Redes ISP S.A.S.',
          nit: '900123456',
          verificationDigit: '7',
        }),
      } as unknown as BillingIssuerReadPort,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('lee el estado de cuenta con el mismo acceso a datos bloqueados y arma el libro', async () => {
    const ledger = await service.ledger(SUBSCRIBER, { from: '2026-09-01' }, ACTOR, {
      canSeeBlocked: true,
      grantedBy: 'CRM_BLOCKED_DATA_READ',
    });
    expect(payments.statementForSubscriber).toHaveBeenCalledWith(SUBSCRIBER, ACTOR, {
      canSeeBlocked: true,
      grantedBy: 'CRM_BLOCKED_DATA_READ',
    });
    expect(ledger.rows.map((row) => row.kind)).toEqual(['SALDO_ANTERIOR', 'DOCUMENTO']);
    expect(ledger.closingBalance).toBe('119000.00');
  });

  it('el PDF lleva el emisor, el titular y el saldo final', async () => {
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    const pdf = await service.ledgerPdf(SUBSCRIBER, {}, ACTOR, { canSeeBlocked: false });
    expect(pdf.content.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.filename).toMatch(/^estado-de-cuenta-\d{4}-\d{2}-\d{2}\.pdf$/u);
    const contents = text.mock.calls.map((args) => String(args[0])).join('\n');
    for (const value of [
      'Redes ISP S.A.S.',
      'NIT: 900123456-7',
      'Titular: Titular Sintético',
      'DC-000001',
      'Vence el 15/10/2026',
      `Saldo final: ${formatLedgerMoney('119000.00')}`,
      'Documento informativo: no es factura electrónica de venta.',
    ])
      expect(contents).toContain(value);
  });

  it('el PDF de un titular protegido no lleva sus datos', async () => {
    payments.statementForSubscriber.mockResolvedValue(statement(true));
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    await service.ledgerPdf(SUBSCRIBER, {}, ACTOR, { canSeeBlocked: false });
    const contents = text.mock.calls.map((args) => String(args[0])).join('\n');
    expect(contents).not.toContain('Titular:');
    expect(contents).not.toContain('Titular protegido');
  });

  it('el PDF pagina un libro largo y marca el pago tardío', async () => {
    const long = statement(false);
    long.documents = Array.from({ length: 80 }, (_, index) => ({
      ...long.documents[0]!,
      id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      issueDate: '2026-01-01',
      dueDate: '2026-01-10',
    }));
    payments.statementForSubscriber.mockResolvedValue(long);
    const addPage = jest.spyOn(PDFDocument.prototype, 'addPage');
    const text = jest.spyOn(PDFDocument.prototype, 'text');
    await service.ledgerPdf(SUBSCRIBER, {}, ACTOR, { canSeeBlocked: false });
    expect(addPage).toHaveBeenCalled();
    expect(text.mock.calls.map((args) => String(args[0]))).toContain(
      'Documento de cobro (pago tardío)',
    );
  });
});

describe('formatos del PDF del libro', () => {
  it('fecha civil y moneda con signo', () => {
    expect(formatLedgerDate('2026-03-05')).toBe('05/03/2026');
    expect(formatLedgerMoney('-1234.5')).toMatch(/^-\$ 1\.234,50$/u);
    expect(formatLedgerMoney('0.00')).toMatch(/^\$ 0,00$/u);
  });
});
