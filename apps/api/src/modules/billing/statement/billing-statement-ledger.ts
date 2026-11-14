import {
  BillingStatementLedgerSchema,
  type BillingAccountStatement,
  type BillingStatementLedger,
  type BillingStatementLedgerRow,
  type BillingStatementLedgerRowKind,
} from '@iwana/shared';

/**
 * Libro cronológico del estado de cuenta (spec MOD05↔MOD14 2026-11-13 D4, D7, R2).
 *
 * Función pura: no consulta la base. Se construye solo con el estado de cuenta consolidado
 * (`statementForSubscriber`), así hereda su filtro de datos bloqueados y sus fórmulas, y el saldo
 * final sin filtro cuadra con él: `closingBalance = totalPending − creditBalance` (riesgo R2).
 *
 * Efecto de cada fila en el saldo (+ cargos − abonos):
 * - `DOCUMENTO` (EMITIDO o IMPORTADO): cargo por el total, en su fecha de emisión.
 * - `CORTESIA`: abono por `courtesyAmount` del documento, ya topado a lo que el pago dejó abierto
 *   (nunca el monto bruto del ajuste). Una fila por documento.
 * - `PAGO` (REGISTRADO): abono por el valor recibido, en su fecha de pago.
 * - `RETENCION` vigente de un pago registrado: abono por su valor, en la fecha del pago.
 * - `DOCUMENTO_ANULADO` y `PAGO_ANULADO`: informativas, efecto 0. Anular un documento revierte
 *   sus aplicaciones y anular un pago revierte las suyas y sus retenciones, así que ni el cargo ni
 *   el abono anulados quedan en la cartera; un cargo y su contra-cargo sumarían lo mismo con una
 *   fila de más.
 * - `SALDO_ANTERIOR`: con `from`, primera fila con el saldo acumulado antes de esa fecha.
 *
 * Identidad: Σ total(cartera) − Σ cortesías topadas − Σ pagos registrados − Σ retenciones vigentes
 * = Σ pendiente − saldo a favor, porque lo aplicado (pagos + retenciones) a cada documento ya es
 * parte de su pagado y lo no aplicado es el saldo a favor.
 */
export interface StatementLedgerOptions {
  from?: string | undefined;
  /** Si se omite, el libro llega hasta hoy o hasta el último movimiento si alguno es posterior. */
  to?: string | undefined;
  /** Hoy en la zona del tenant (AAAA-MM-DD). */
  today: string;
  /** Zona del tenant, para llevar a fecha civil las marcas de tiempo. */
  timezone: string;
}

type Entry = Omit<BillingStatementLedgerRow, 'balance' | 'debit' | 'credit'> & {
  debitCents: number;
  creditCents: number;
  sortKey: string;
};

const KIND_ORDER: Record<BillingStatementLedgerRowKind, number> = {
  SALDO_ANTERIOR: 0,
  DOCUMENTO: 1,
  DOCUMENTO_ANULADO: 2,
  CORTESIA: 3,
  PAGO: 4,
  RETENCION: 5,
  PAGO_ANULADO: 6,
};

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/u;

export function moneyToCents(value: string | null | undefined): number {
  if (value == null || value === '') return 0;
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) throw new RangeError('El monto no tiene un formato monetario válido.');
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] === '-' ? -cents : cents;
}

export function centsToMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

/** Fecha civil en la zona del tenant; una fecha civil se devuelve tal cual. */
export function toCivilDate(value: string, timezone: string): string {
  if (CIVIL_DATE.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('La fecha no es válida.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (key: string) => parts.find((item) => item.type === key)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function receiptNumberOf(payment: object): number | null | undefined {
  // El bloque A añade `receiptNumber` (opcional) a la respuesta del pago; aquí se trata como tal.
  const value = (payment as { receiptNumber?: unknown }).receiptNumber;
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** Fecha civil del último pago registrado aplicado (sin revertir) a cada documento. */
function lastPaidDateByDocument(
  statement: BillingAccountStatement,
  timezone: string,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const payment of statement.payments) {
    if (payment.status !== 'REGISTRADO') continue;
    const paidOn = toCivilDate(payment.paidAt, timezone);
    for (const allocation of payment.allocations ?? []) {
      if (allocation.reversedAt) continue;
      const current = result.get(allocation.documentId);
      if (!current || paidOn > current) result.set(allocation.documentId, paidOn);
    }
  }
  return result;
}

export function buildStatementLedger(
  statement: BillingAccountStatement,
  options: StatementLedgerOptions,
): BillingStatementLedger {
  const { timezone, today } = options;
  const entries: Entry[] = [];
  const lastPaid = lastPaidDateByDocument(statement, timezone);

  const latestCourtesyDate = new Map<string, string>();
  for (const courtesy of statement.courtesies ?? []) {
    if (courtesy.status !== 'ACTIVA' || courtesy.application !== 'AJUSTE_SOBRE_EMITIDO') continue;
    const on = toCivilDate(courtesy.createdAt, timezone);
    const current = latestCourtesyDate.get(courtesy.documentId);
    if (!current || on > current) latestCourtesyDate.set(courtesy.documentId, on);
  }

  for (const document of statement.documents) {
    const reference = document.number ?? document.externalNumber ?? null;
    const issuedOn = document.issueDate
      ? toCivilDate(document.issueDate, timezone)
      : toCivilDate(document.createdAt, timezone);
    const base = {
      reference,
      documentId: document.id,
      paymentId: null,
      sortKey: `${document.createdAt}|${document.id}`,
    };
    if (document.status === 'EMITIDO' || document.status === 'IMPORTADO') {
      const dueDate = document.dueDate ? toCivilDate(document.dueDate, timezone) : null;
      const pendingCents = moneyToCents(document.pendingAmount);
      let late: boolean | undefined;
      if (dueDate) {
        const paidOn = lastPaid.get(document.id);
        late = pendingCents > 0 ? today > dueDate : paidOn !== undefined && paidOn > dueDate;
      }
      entries.push({
        ...base,
        kind: 'DOCUMENTO',
        date: issuedOn,
        dueDate,
        ...(late === undefined ? {} : { late }),
        debitCents: moneyToCents(document.total),
        creditCents: 0,
      });
      const courtesyCents = moneyToCents(document.courtesyAmount);
      if (courtesyCents > 0) {
        entries.push({
          ...base,
          kind: 'CORTESIA',
          date: latestCourtesyDate.get(document.id) ?? issuedOn,
          dueDate: null,
          debitCents: 0,
          creditCents: courtesyCents,
        });
      }
    } else if (document.status === 'ANULADO' && document.issueDate) {
      // Solo un documento que llegó a emitirse; un borrador descartado no es movimiento.
      entries.push({
        ...base,
        kind: 'DOCUMENTO_ANULADO',
        date: issuedOn,
        dueDate: null,
        debitCents: 0,
        creditCents: 0,
      });
    }
  }

  for (const payment of statement.payments) {
    const paidOn = toCivilDate(payment.paidAt, timezone);
    const receiptNumber = receiptNumberOf(payment);
    const base = {
      reference: payment.reference ?? null,
      documentId: null,
      paymentId: payment.id,
      dueDate: null,
      method: payment.method,
      ...(receiptNumber === undefined ? {} : { receiptNumber }),
      sortKey: `${payment.createdAt}|${payment.id}`,
    };
    if (payment.status !== 'REGISTRADO') {
      entries.push({ ...base, kind: 'PAGO_ANULADO', date: paidOn, debitCents: 0, creditCents: 0 });
      continue;
    }
    entries.push({
      ...base,
      kind: 'PAGO',
      date: paidOn,
      debitCents: 0,
      creditCents: moneyToCents(payment.amount),
    });
    if (payment.withholdings) {
      for (const withholding of payment.withholdings) {
        if (withholding.voidedAt) continue;
        entries.push({
          kind: 'RETENCION',
          date: paidOn,
          reference: withholding.taxCode,
          documentId: withholding.documentId,
          paymentId: payment.id,
          dueDate: null,
          debitCents: 0,
          creditCents: moneyToCents(withholding.amount),
          sortKey: `${payment.createdAt}|${payment.id}|${withholding.createdAt}|${withholding.id}`,
        });
      }
    } else if (moneyToCents(payment.withholdingAmount) > 0) {
      entries.push({
        kind: 'RETENCION',
        date: paidOn,
        reference: null,
        documentId: null,
        paymentId: payment.id,
        dueDate: null,
        debitCents: 0,
        creditCents: moneyToCents(payment.withholdingAmount),
        sortKey: `${payment.createdAt}|${payment.id}|`,
      });
    }
  }

  entries.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      left.sortKey.localeCompare(right.sortKey),
  );

  const lastDate = entries.length ? entries[entries.length - 1]!.date : today;
  const to = options.to ?? (lastDate > today ? lastDate : today);
  const from = options.from ?? null;

  let balance = 0;
  const rows: BillingStatementLedgerRow[] = [];
  for (const entry of entries) {
    if (from && entry.date < from) balance += entry.debitCents - entry.creditCents;
  }
  const openingBalance = balance;
  if (from) {
    rows.push({
      kind: 'SALDO_ANTERIOR',
      date: from,
      reference: null,
      debit: '0.00',
      credit: '0.00',
      balance: centsToMoney(openingBalance),
      documentId: null,
      paymentId: null,
      dueDate: null,
    });
  }
  for (const entry of entries) {
    if ((from && entry.date < from) || entry.date > to) continue;
    balance += entry.debitCents - entry.creditCents;
    const { debitCents, creditCents, sortKey: _sortKey, ...row } = entry;
    rows.push({
      ...row,
      debit: centsToMoney(debitCents),
      credit: centsToMoney(creditCents),
      balance: centsToMoney(balance),
    });
  }

  return BillingStatementLedgerSchema.parse({
    subscriberId: statement.subscriberId,
    from,
    to,
    openingBalance: centsToMoney(openingBalance),
    closingBalance: centsToMoney(balance),
    buyerProtected: statement.buyerProtected,
    rows,
  });
}
