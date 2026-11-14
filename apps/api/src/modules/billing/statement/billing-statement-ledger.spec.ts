import type { BillingAccountStatement } from '@iwana/shared';
import { appliedCourtesyCents } from '../courtesies/billing-courtesy.sql';
import {
  buildStatementLedger,
  centsToMoney,
  moneyToCents,
  toCivilDate,
} from './billing-statement-ledger';

/**
 * Modelo crudo de la cartera y simulador del estado de cuenta con las mismas fórmulas de
 * `statementForSubscriber` (billing-payments.service.ts): pagado = min(total, aplicaciones
 * vigentes); cortesía = appliedCourtesyCents; pendiente = max(0, total − pagado − cortesía);
 * saldo a favor = max(0, pagos registrados + retenciones vigentes − aplicaciones vigentes).
 * Así la identidad del libro (R2) se prueba contra el cálculo real, no contra un número a mano.
 */
type RawDocument = {
  id: string;
  status: 'BORRADOR' | 'EMITIDO' | 'ANULADO' | 'IMPORTADO';
  total: number;
  issueDate: string | null;
  dueDate: string;
  number?: string | null;
  externalNumber?: string | null;
  courtesyAdjustments?: Array<{ amount: number; createdAt: string; status?: 'ACTIVA' | 'ANULADA' }>;
};
type RawPayment = {
  id: string;
  status: 'REGISTRADO' | 'ANULADO';
  amount: number;
  paidAt: string;
  allocations: Array<{ documentId: string; amount: number; reversed?: boolean }>;
  withholdings?: Array<{ documentId: string; amount: number; voided?: boolean }>;
  receiptNumber?: number;
};

const SUBSCRIBER = '00000000-0000-4000-8000-000000000001';
const TENANT = '00000000-0000-4000-8000-0000000000aa';
const ACTOR = '00000000-0000-4000-8000-0000000000bb';
const TZ = 'America/Bogota';

let sequence = 0;
const uuid = (prefix: number) =>
  `00000000-0000-4000-8000-${String(prefix).padStart(4, '0')}${String(++sequence).padStart(8, '0')}`;

function simulate(documents: RawDocument[], payments: RawPayment[]): BillingAccountStatement {
  const allocatedByDocument = new Map<string, number>();
  let allocatedAll = 0;
  for (const payment of payments)
    for (const allocation of payment.allocations) {
      if (allocation.reversed) continue;
      allocatedAll += allocation.amount;
      allocatedByDocument.set(
        allocation.documentId,
        (allocatedByDocument.get(allocation.documentId) ?? 0) + allocation.amount,
      );
    }
  let totalPending = 0;
  const docs = documents.map((document) => {
    const isIssued = document.status === 'EMITIDO' || document.status === 'IMPORTADO';
    const paid = isIssued ? Math.min(document.total, allocatedByDocument.get(document.id) ?? 0) : 0;
    const adjustment = (document.courtesyAdjustments ?? [])
      .filter((item) => (item.status ?? 'ACTIVA') === 'ACTIVA')
      .reduce((sum, item) => sum + item.amount, 0);
    const courtesy = appliedCourtesyCents({
      status: document.status,
      totalCents: document.total,
      paidCents: paid,
      adjustmentCents: adjustment,
    });
    const pending = isIssued ? Math.max(0, document.total - paid - courtesy) : 0;
    totalPending += pending;
    return {
      id: document.id,
      tenantId: TENANT,
      subscriberId: SUBSCRIBER,
      status: document.status,
      number: document.number ?? null,
      externalNumber: document.externalNumber ?? null,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      createdAt: `${document.issueDate ?? '2026-01-01'}T15:00:00.000Z`,
      total: centsToMoney(document.total),
      paidAmount: centsToMoney(paid),
      courtesyAmount: centsToMoney(courtesy),
      pendingAmount: centsToMoney(pending),
    };
  });
  let registered = 0;
  let registeredWithholding = 0;
  const pays = payments.map((payment) => {
    if (payment.status === 'REGISTRADO') {
      registered += payment.amount;
      for (const line of payment.withholdings ?? [])
        if (!line.voided) registeredWithholding += line.amount;
    }
    return {
      id: payment.id,
      tenantId: TENANT,
      subscriberId: SUBSCRIBER,
      method: 'EFECTIVO',
      amount: centsToMoney(payment.amount),
      paidAt: payment.paidAt,
      reference: null,
      status: payment.status,
      createdBy: ACTOR,
      createdAt: `${payment.paidAt}T16:00:00.000Z`,
      ...(payment.receiptNumber ? { receiptNumber: payment.receiptNumber } : {}),
      allocations: payment.allocations.map((allocation) => ({
        id: uuid(9),
        tenantId: TENANT,
        paymentId: payment.id,
        documentId: allocation.documentId,
        amount: centsToMoney(allocation.amount),
        reversedAt: allocation.reversed ? '2026-05-01T00:00:00.000Z' : null,
        createdBy: ACTOR,
        createdAt: `${payment.paidAt}T16:00:00.000Z`,
      })),
      withholdings: (payment.withholdings ?? []).map((line) => ({
        id: uuid(8),
        paymentId: payment.id,
        documentId: line.documentId,
        taxCode: 'RETEFUENTE',
        base: centsToMoney(line.amount * 25),
        rate: '4.0000',
        amount: centsToMoney(line.amount),
        certificateNumber: null,
        voidedAt: line.voided ? '2026-05-01T00:00:00.000Z' : null,
        createdBy: ACTOR,
        createdAt: `${payment.paidAt}T16:00:00.000Z`,
      })),
    };
  });
  const courtesies = documents.flatMap((document) =>
    (document.courtesyAdjustments ?? []).map((item) => ({
      id: uuid(7),
      documentId: document.id,
      subscriberId: SUBSCRIBER,
      application: 'AJUSTE_SOBRE_EMITIDO',
      status: item.status ?? 'ACTIVA',
      amount: centsToMoney(item.amount),
      createdAt: item.createdAt,
    })),
  );
  return {
    subscriberId: SUBSCRIBER,
    buyerProtected: false,
    impersonationHold: false,
    totalInvoiced: '0.00',
    totalPaid: '0.00',
    totalPending: centsToMoney(totalPending),
    creditBalance: centsToMoney(Math.max(0, registered + registeredWithholding - allocatedAll)),
    documents: docs,
    payments: pays,
    courtesies,
    contractSummaries: [],
  } as unknown as BillingAccountStatement;
}

function expectIdentity(statement: BillingAccountStatement) {
  const ledger = buildStatementLedger(statement, { today: '2026-06-30', timezone: TZ });
  expect(ledger.closingBalance).toBe(
    centsToMoney(moneyToCents(statement.totalPending) - moneyToCents(statement.creditBalance)),
  );
  const last = ledger.rows[ledger.rows.length - 1];
  expect(last?.balance ?? '0.00').toBe(ledger.closingBalance);
  return ledger;
}

describe('buildStatementLedger', () => {
  beforeEach(() => {
    sequence = 0;
  });

  it('cuadra con el estado de cuenta: facturas, pagos, retención y cortesía', () => {
    const d1 = uuid(1);
    const d2 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'EMITIDO',
          total: 100_000,
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          number: 'DC-1',
        },
        {
          id: d2,
          status: 'EMITIDO',
          total: 100_000,
          issueDate: '2026-03-01',
          dueDate: '2026-03-15',
          number: 'DC-2',
          courtesyAdjustments: [{ amount: 20_000, createdAt: '2026-03-05T15:00:00.000Z' }],
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 96_000,
          paidAt: '2026-02-10',
          allocations: [{ documentId: d1, amount: 100_000 }],
          withholdings: [{ documentId: d1, amount: 4_000 }],
          receiptNumber: 7,
        },
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 50_000,
          paidAt: '2026-03-10',
          allocations: [{ documentId: d2, amount: 50_000 }],
        },
      ],
    );
    expect(statement.totalPending).toBe('300.00');
    const ledger = expectIdentity(statement);
    expect(ledger.closingBalance).toBe('300.00');
    expect(ledger.rows.map((row) => row.kind)).toEqual([
      'DOCUMENTO',
      'PAGO',
      'RETENCION',
      'DOCUMENTO',
      'CORTESIA',
      'PAGO',
    ]);
    const payment = ledger.rows[1]!;
    expect(payment).toMatchObject({ credit: '960.00', method: 'EFECTIVO', receiptNumber: 7 });
    expect(ledger.rows[2]).toMatchObject({ credit: '40.00', reference: 'RETEFUENTE' });
    expect(ledger.rows[4]).toMatchObject({ date: '2026-03-05', credit: '200.00' });
    expect(ledger.rows.map((row) => row.balance)).toEqual([
      '1000.00',
      '40.00',
      '0.00',
      '1000.00',
      '800.00',
      '300.00',
    ]);
  });

  it('usa la cortesía topada, no el monto bruto del ajuste', () => {
    const d1 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'EMITIDO',
          total: 100_000,
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          courtesyAdjustments: [{ amount: 80_000, createdAt: '2026-02-20T15:00:00.000Z' }],
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 60_000,
          paidAt: '2026-02-10',
          allocations: [{ documentId: d1, amount: 60_000 }],
        },
      ],
    );
    const ledger = expectIdentity(statement);
    expect(ledger.rows.find((row) => row.kind === 'CORTESIA')?.credit).toBe('400.00');
    expect(ledger.closingBalance).toBe('0.00');
  });

  it('documento anulado que tuvo pagos: fila informativa y el pago queda a favor', () => {
    const d1 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'ANULADO',
          total: 100_000,
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
          number: 'DC-9',
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 100_000,
          paidAt: '2026-02-10',
          allocations: [{ documentId: d1, amount: 100_000, reversed: true }],
        },
      ],
    );
    const ledger = expectIdentity(statement);
    expect(ledger.closingBalance).toBe('-1000.00');
    expect(ledger.rows[0]).toMatchObject({
      kind: 'DOCUMENTO_ANULADO',
      debit: '0.00',
      credit: '0.00',
      reference: 'DC-9',
    });
  });

  it('pago mayor que la deuda: el saldo final es el saldo a favor', () => {
    const d1 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'EMITIDO',
          total: 50_000,
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 80_000,
          paidAt: '2026-02-03',
          allocations: [{ documentId: d1, amount: 50_000 }],
        },
      ],
    );
    expect(statement.creditBalance).toBe('300.00');
    expect(expectIdentity(statement).closingBalance).toBe('-300.00');
  });

  it('incluye el histórico importado con su número externo', () => {
    const d1 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'IMPORTADO',
          total: 70_000,
          issueDate: '2025-12-01',
          dueDate: '2025-12-15',
          externalNumber: 'UISP-45',
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 30_000,
          paidAt: '2025-12-20',
          allocations: [{ documentId: d1, amount: 30_000 }],
        },
      ],
    );
    const ledger = expectIdentity(statement);
    expect(ledger.rows[0]).toMatchObject({
      kind: 'DOCUMENTO',
      reference: 'UISP-45',
      debit: '700.00',
      dueDate: '2025-12-15',
      late: true,
    });
    expect(ledger.closingBalance).toBe('400.00');
  });

  it('pago anulado y borrador no mueven el saldo', () => {
    const d1 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'EMITIDO',
          total: 40_000,
          issueDate: '2026-02-01',
          dueDate: '2026-02-15',
        },
        { id: uuid(1), status: 'BORRADOR', total: 99_000, issueDate: null, dueDate: '2026-03-15' },
      ],
      [
        {
          id: uuid(2),
          status: 'ANULADO',
          amount: 40_000,
          paidAt: '2026-02-05',
          allocations: [{ documentId: d1, amount: 40_000, reversed: true }],
          withholdings: [{ documentId: d1, amount: 1_600, voided: true }],
        },
      ],
    );
    const ledger = expectIdentity(statement);
    expect(ledger.rows.map((row) => row.kind)).toEqual(['DOCUMENTO', 'PAGO_ANULADO']);
    expect(ledger.closingBalance).toBe('400.00');
  });

  it('marca el pago tardío: saldado después del vencimiento o vencido con saldo', () => {
    const late = uuid(1);
    const onTime = uuid(1);
    const open = uuid(1);
    const statement = simulate(
      [
        {
          id: late,
          status: 'EMITIDO',
          total: 10_000,
          issueDate: '2026-01-01',
          dueDate: '2026-01-10',
        },
        {
          id: onTime,
          status: 'EMITIDO',
          total: 10_000,
          issueDate: '2026-02-01',
          dueDate: '2026-02-10',
        },
        {
          id: open,
          status: 'EMITIDO',
          total: 10_000,
          issueDate: '2026-03-01',
          dueDate: '2026-03-10',
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 10_000,
          paidAt: '2026-01-20',
          allocations: [{ documentId: late, amount: 10_000 }],
        },
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 10_000,
          paidAt: '2026-02-05',
          allocations: [{ documentId: onTime, amount: 10_000 }],
        },
      ],
    );
    const ledger = expectIdentity(statement);
    const lateByDocument = Object.fromEntries(
      ledger.rows
        .filter((row) => row.kind === 'DOCUMENTO')
        .map((row) => [row.documentId, row.late]),
    );
    expect(lateByDocument).toEqual({ [late]: true, [onTime]: false, [open]: true });
  });

  it('con filtro abre con «Saldo anterior» y conserva el saldo final', () => {
    const d1 = uuid(1);
    const d2 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'EMITIDO',
          total: 100_000,
          issueDate: '2026-01-01',
          dueDate: '2026-01-15',
        },
        {
          id: d2,
          status: 'EMITIDO',
          total: 100_000,
          issueDate: '2026-04-01',
          dueDate: '2026-04-15',
        },
      ],
      [
        {
          id: uuid(2),
          status: 'REGISTRADO',
          amount: 30_000,
          paidAt: '2026-01-10',
          allocations: [{ documentId: d1, amount: 30_000 }],
        },
      ],
    );
    const full = expectIdentity(statement);
    const filtered = buildStatementLedger(statement, {
      from: '2026-03-01',
      today: '2026-06-30',
      timezone: TZ,
    });
    expect(filtered.from).toBe('2026-03-01');
    expect(filtered.openingBalance).toBe('700.00');
    expect(filtered.rows[0]).toMatchObject({
      kind: 'SALDO_ANTERIOR',
      date: '2026-03-01',
      balance: '700.00',
    });
    expect(filtered.rows.map((row) => row.kind)).toEqual(['SALDO_ANTERIOR', 'DOCUMENTO']);
    expect(filtered.closingBalance).toBe(full.closingBalance);

    const upTo = buildStatementLedger(statement, {
      from: '2026-01-01',
      to: '2026-01-31',
      today: '2026-06-30',
      timezone: TZ,
    });
    expect(upTo.openingBalance).toBe('0.00');
    expect(upTo.closingBalance).toBe('700.00');
    expect(upTo.to).toBe('2026-01-31');
  });

  it('sin `to` llega hasta hoy, o hasta un movimiento posterior para no ocultarlo', () => {
    const d1 = uuid(1);
    const statement = simulate(
      [
        {
          id: d1,
          status: 'EMITIDO',
          total: 10_000,
          issueDate: '2026-07-02',
          dueDate: '2026-07-15',
        },
      ],
      [],
    );
    const ledger = expectIdentity(statement);
    expect(ledger.to).toBe('2026-07-02');
    expect(buildStatementLedger(simulate([], []), { today: '2026-06-30', timezone: TZ }).to).toBe(
      '2026-06-30',
    );
  });

  it('un titular sin movimientos tiene libro vacío en cero', () => {
    const ledger = expectIdentity(simulate([], []));
    expect(ledger.rows).toEqual([]);
    expect(ledger.closingBalance).toBe('0.00');
  });

  it('propaga buyerProtected y la referencia ya redactada del estado de cuenta', () => {
    const statement = {
      ...simulate(
        [],
        [
          {
            id: uuid(2),
            status: 'REGISTRADO',
            amount: 1_000,
            paidAt: '2026-02-01',
            allocations: [],
          },
        ],
      ),
      buyerProtected: true,
    };
    const ledger = buildStatementLedger(statement, { today: '2026-06-30', timezone: TZ });
    expect(ledger.buyerProtected).toBe(true);
    expect(ledger.rows[0]?.reference).toBeNull();
  });
});

describe('utilidades del libro', () => {
  it('convierte montos con signo', () => {
    expect(moneyToCents('-12.5')).toBe(-1250);
    expect(moneyToCents(null)).toBe(0);
    expect(centsToMoney(-1250)).toBe('-12.50');
    expect(centsToMoney(5)).toBe('0.05');
    expect(() => moneyToCents('1,00')).toThrow(RangeError);
  });

  it('lleva marcas de tiempo a la fecha civil del tenant', () => {
    expect(toCivilDate('2026-03-01', TZ)).toBe('2026-03-01');
    expect(toCivilDate('2026-03-01T03:00:00.000Z', TZ)).toBe('2026-02-28');
    expect(() => toCivilDate('no-es-fecha', TZ)).toThrow(RangeError);
  });
});
