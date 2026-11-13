import type { BillingAccountStatement, BillingPaymentWithholdingResponse } from '@iwana/shared';
import { Badge } from '@iwana/ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import {
  documentReference,
  formatBillingMoney,
  formatWithholdingRate,
  WITHHOLDING_TAX_CODES,
} from './billing-copy';

type WithholdingRow = BillingPaymentWithholdingResponse & { paidAt: string };

/** Retenciones de los pagos del estado de cuenta, más recientes primero. */
export function statementWithholdings(
  statement: Pick<BillingAccountStatement, 'payments'>,
): WithholdingRow[] {
  return statement.payments
    .flatMap((payment) =>
      (payment.withholdings ?? []).map((line) => ({ ...line, paidAt: payment.paidAt })),
    )
    .sort(
      (left, right) =>
        right.paidAt.localeCompare(left.paidAt) || right.createdAt.localeCompare(left.createdAt),
    );
}

/**
 * Detalle de retenciones del estado de cuenta (spec MOD14 2026-11-13 R8): tipo, documento, pago,
 * certificado, base × tarifa y estado; las de un pago anulado aparecen anuladas. Sin retenciones
 * no se muestra nada.
 */
export function StatementWithholdingList({
  statement,
  limit,
}: {
  statement: Pick<BillingAccountStatement, 'payments' | 'documents' | 'buyerProtected'>;
  limit?: number;
}) {
  const rows = statementWithholdings(statement);
  if (!rows.length) return null;
  const visible = limit === undefined ? rows : rows.slice(0, limit);
  const documents = new Map(statement.documents.map((document) => [document.id, document]));
  return (
    <section aria-labelledby="statement-withholdings" className="space-y-2">
      <h3 id="statement-withholdings" className="text-sm font-semibold">
        Detalle de retenciones
      </h3>
      <ul className="divide-y divide-gray-200 dark:divide-dark-border">
        {visible.map((line) => {
          const document = documents.get(line.documentId);
          const voided = line.voidedAt != null;
          // Sin número: protegido si el titular tiene datos bloqueados; si no, suprimido.
          const certificateProtected =
            statement.buyerProtected || document?.buyerProtected === true;
          return (
            <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{WITHHOLDING_TAX_CODES[line.taxCode]}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Pago del {formatBillingDate(line.paidAt)}
                  {document ? ` · ${documentReference(document)}` : ''}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Base {formatBillingMoney(line.base)} × {formatWithholdingRate(line.rate)}
                  {line.certificateNumber
                    ? ` · Certificado ${line.certificateNumber}`
                    : certificateProtected
                      ? ' · Certificado protegido'
                      : ' · Certificado no disponible'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={voided ? 'neutral' : 'success'}>
                  {voided ? 'Anulada' : 'Aplicada'}
                </Badge>
                <span className="text-sm font-semibold tabular-nums">
                  {formatBillingMoney(line.amount)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
