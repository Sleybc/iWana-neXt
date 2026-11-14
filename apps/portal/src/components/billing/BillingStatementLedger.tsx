'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AccessPermissionKey,
  type BillingDocumentResponse,
  type BillingStatementLedger as Ledger,
  type BillingStatementLedgerRow,
} from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFilterChip,
  PortalPanel,
  portalFilterChipGroupClassName,
} from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingEmailLog, BillingEmailSendResult, useBillingEmailSend } from './BillingEmailLog';
import { saveBillingPdf } from './billing-document-pdf';
import {
  formatBillingMoneyExact,
  formatLedgerBalance,
  LEDGER_ROW_KINDS,
  moneyCents,
  PAYMENT_METHODS,
  WITHHOLDING_TAX_CODES,
} from './billing-copy';
import {
  BillingLoadState,
  BillingTable,
  billingError,
  billingInputClass,
  useBillingLoad,
  useBillingUrl,
} from './billing-ui';
import {
  LEDGER_PERIODS,
  ledgerPeriodId,
  ledgerPeriodQuery,
  type LedgerPeriodId,
} from './ledger-period';

type DocumentRef = Pick<BillingDocumentResponse, 'id' | 'pendingAmount'>;

/** Referencia visible: el código de un impuesto retenido se traduce; nunca un enum crudo. */
function ledgerReference(row: BillingStatementLedgerRow): string {
  if (!row.reference) return '—';
  if (row.kind === 'RETENCION' && Object.hasOwn(WITHHOLDING_TAX_CODES, row.reference))
    return WITHHOLDING_TAX_CODES[row.reference as keyof typeof WITHHOLDING_TAX_CODES];
  return row.reference;
}

/** «Vencido» si el documento aún tiene saldo; «Pagó tarde» si se saldó después del vencimiento. */
export function lateLabel(
  row: Pick<BillingStatementLedgerRow, 'late' | 'documentId'>,
  documents: readonly DocumentRef[],
): 'Vencido' | 'Pagó tarde' | null {
  if (!row.late) return null;
  const pending = documents.find((document) => document.id === row.documentId)?.pendingAmount;
  return pending != null && moneyCents(pending) > 0 ? 'Vencido' : 'Pagó tarde';
}

/** Con filtro, el libro abre con «Saldo anterior»; si la API no la trae, se arma con el saldo inicial. */
export function ledgerRows(ledger: Ledger): BillingStatementLedgerRow[] {
  if (!ledger.from || ledger.rows.some((row) => row.kind === 'SALDO_ANTERIOR')) return ledger.rows;
  return [
    {
      kind: 'SALDO_ANTERIOR',
      date: ledger.from,
      reference: null,
      debit: '0.00',
      credit: '0.00',
      balance: ledger.openingBalance,
      documentId: null,
      paymentId: null,
      dueDate: null,
    },
    ...ledger.rows,
  ];
}

function ConceptCell({
  row,
  documents,
}: {
  row: BillingStatementLedgerRow;
  documents: readonly DocumentRef[];
}) {
  const late = lateLabel(row, documents);
  const details = [
    row.method ? PAYMENT_METHODS[row.method] : null,
    row.receiptNumber ? `Recibo N.º ${row.receiptNumber}` : null,
    row.kind === 'DOCUMENTO' && row.dueDate ? `Vence el ${formatBillingDate(row.dueDate)}` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-0.5">
      <p className="font-medium">{LEDGER_ROW_KINDS[row.kind]}</p>
      {details.length ? (
        <p className="text-xs text-gray-600 dark:text-gray-400">{details.join(' · ')}</p>
      ) : null}
      {late ? <Badge variant={late === 'Vencido' ? 'warning' : 'info'}>{late}</Badge> : null}
    </div>
  );
}

/** Estado de cuenta como libro cronológico con saldo corrido (spec MOD05↔MOD14 2026-11-13 D4). */
export function BillingStatementLedger({
  subscriberId,
  documents,
  revision = 0,
  today = new Date(),
}: {
  subscriberId: string;
  /** Documentos del estado de cuenta: distinguen «Vencido» de «Pagó tarde». */
  documents: readonly DocumentRef[];
  /** Cambia cuando la ficha registra un pago, desasocia o emite: recarga sin perder el filtro. */
  revision?: number;
  /** Fecha de referencia de los periodos móviles (inyectable en pruebas). */
  today?: Date;
}) {
  const { hasPermission } = usePermissions();
  const canSend = hasPermission(AccessPermissionKey.BILLING_INVOICES_MANAGE);
  const id = useId();
  // El filtro vive en la URL junto a `tab` y `sub` (R1): sobrevive al cambio de subpestaña y a la
  // recarga. El estado local lo refleja para responder sin esperar a la navegación.
  const { params, update } = useBillingUrl();
  const urlPeriod = ledgerPeriodId(params.get('periodo'));
  const urlFrom = urlPeriod === 'rango' ? (params.get('desde') ?? '') : '';
  const urlTo = urlPeriod === 'rango' ? (params.get('hasta') ?? '') : '';
  const [period, setPeriod] = useState<LedgerPeriodId>(urlPeriod);
  const [range, setRange] = useState({ from: urlFrom, to: urlTo });
  useEffect(() => setPeriod(urlPeriod), [urlPeriod]);
  useEffect(() => setRange({ from: urlFrom, to: urlTo }), [urlFrom, urlTo]);

  function selectPeriod(next: LedgerPeriodId) {
    setPeriod(next);
    if (next !== 'rango') setRange({ from: '', to: '' });
    update({
      periodo: next === 'todo' ? '' : next,
      ...(next === 'rango' ? {} : { desde: '', hasta: '' }),
    });
  }

  function changeRange(key: 'from' | 'to', value: string) {
    setRange((current) => ({ ...current, [key]: value }));
    update({ [key === 'from' ? 'desde' : 'hasta']: value });
  }
  const todayKey = today.toDateString();
  const result = useMemo(
    () => ledgerPeriodQuery(period, new Date(todayKey), range),
    [period, range, todayKey],
  );
  const queryKey = result.ok ? JSON.stringify(result.query) : '';
  // El aviso de error solo aparece cuando ya se escribió alguna fecha (no al elegir «Rango»).
  const rangeError = !result.ok && (range.from || range.to) ? result.error : null;
  const rangeDescription = rangeError
    ? `${id}-range-error`
    : result.ok
      ? undefined
      : `${id}-range-hint`;
  const load = useCallback(async () => {
    if (!queryKey) return null;
    return billingApi.statementLedger(subscriberId, JSON.parse(queryKey));
  }, [subscriberId, queryKey]);
  const { data, loading, error, reload } = useBillingLoad(load, revision);
  const email = useBillingEmailSend();
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function downloadPdf() {
    if (!result.ok || downloading) return;
    setDownloading(true);
    setPdfError(null);
    try {
      saveBillingPdf(
        await billingApi.statementLedgerPdf(subscriberId, result.query),
        'estado-de-cuenta.pdf',
      );
    } catch (cause) {
      setPdfError(billingError(cause));
    } finally {
      setDownloading(false);
    }
  }

  const rows = data ? ledgerRows(data) : [];
  return (
    <PortalPanel title="Estado de cuenta" contentClassName="space-y-4" busy={loading && !!queryKey}>
      <div className="space-y-3">
        <div
          role="group"
          aria-label="Periodo del estado de cuenta"
          className={portalFilterChipGroupClassName}
        >
          {LEDGER_PERIODS.map((option) => (
            <PortalFilterChip
              key={option.id}
              active={period === option.id}
              onClick={() => selectPeriod(option.id)}
            >
              {option.label}
            </PortalFilterChip>
          ))}
        </div>
        {period === 'rango' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm" htmlFor={`${id}-from`}>
              <span>Desde</span>
              <input
                id={`${id}-from`}
                type="date"
                className={billingInputClass}
                value={range.from}
                max={range.to || undefined}
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeDescription}
                onChange={(event) => changeRange('from', event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm" htmlFor={`${id}-to`}>
              <span>Hasta</span>
              <input
                id={`${id}-to`}
                type="date"
                className={billingInputClass}
                value={range.to}
                min={range.from || undefined}
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeDescription}
                onChange={(event) => changeRange('to', event.target.value)}
              />
            </label>
          </div>
        ) : null}
        {period === 'rango' && !rangeError && !result.ok ? (
          <p id={`${id}-range-hint`} className="text-sm text-gray-600 dark:text-gray-300">
            {result.error}
          </p>
        ) : null}
        {rangeError ? (
          <p
            id={`${id}-range-error`}
            role="alert"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {rangeError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          type="button"
          variant="secondary"
          disabled={!result.ok || downloading}
          loading={downloading}
          onClick={() => void downloadPdf()}
        >
          Descargar PDF
        </Button>
        {canSend ? (
          <Button
            className="min-h-11"
            type="button"
            variant="secondary"
            disabled={!result.ok || email.busy !== null}
            loading={email.busy !== null}
            onClick={() => {
              if (result.ok)
                void email.send('estado', () =>
                  billingApi.sendStatementEmail(subscriberId, result.query),
                );
            }}
          >
            Enviar al cliente
          </Button>
        ) : null}
      </div>
      {pdfError ? <PortalAlert variant="error" title={pdfError} /> : null}
      <BillingEmailSendResult outcome={email.outcome} />
      {queryKey ? <BillingLoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {data.from
              ? `Del ${formatBillingDate(data.from)} al ${formatBillingDate(data.to)}`
              : `Todo el historial hasta el ${formatBillingDate(data.to)}`}
          </p>
          {rows.length ? (
            <BillingTable
              label="Movimientos del estado de cuenta"
              columns={['Fecha', 'Concepto', 'Referencia', 'Cargo', 'Abono', 'Saldo']}
              rows={rows.map((row, index) => ({
                id: `${row.kind}-${row.documentId ?? row.paymentId ?? 'saldo'}-${index}`,
                cells: [
                  formatBillingDate(row.date),
                  <ConceptCell row={row} documents={documents} />,
                  ledgerReference(row),
                  moneyCents(row.debit) > 0 ? formatBillingMoneyExact(row.debit) : '—',
                  moneyCents(row.credit) > 0 ? formatBillingMoneyExact(row.credit) : '—',
                  formatLedgerBalance(row.balance),
                ],
              }))}
            />
          ) : (
            <PortalEmptyState
              title="No hay movimientos en este periodo"
              description="Elige un periodo más amplio para ver documentos y pagos."
            />
          )}
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Saldo final:{' '}
            <span className="tabular-nums">{formatLedgerBalance(data.closingBalance)}</span>
          </p>
        </>
      ) : null}
      <BillingEmailLog
        subscriberId={subscriberId}
        target={{ kind: 'ESTADO_CUENTA' }}
        revision={email.sent}
      />
    </PortalPanel>
  );
}
