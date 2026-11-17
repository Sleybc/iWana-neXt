import type { BillingAccountStatement, BillingPaymentWithholdingResponse } from '@iwana/shared';
import { Badge } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
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
export const WITHHOLDING_PANEL_TITLE = 'Detalle de retenciones';
export const WITHHOLDING_PANEL_DESCRIPTION =
  'Retefuente y reteICA que el cliente descontó al pagar, con su certificado.';

export function StatementWithholdingList({
  statement,
  limit,
  framed = true,
}: {
  statement: Pick<BillingAccountStatement, 'payments' | 'documents' | 'buyerProtected'>;
  limit?: number;
  /** En su propio panel (pestaña Pagos) o sin marco dentro de otra tarjeta (resumen). */
  framed?: boolean;
}) {
  const rows = statementWithholdings(statement);
  if (!rows.length) return null;
  const visible = limit === undefined ? rows : rows.slice(0, limit);
  const documents = new Map(statement.documents.map((document) => [document.id, document]));
  const list = (
    <ul aria-label="Retenciones" className="divide-y divide-gray-100 dark:divide-dark-border">
      {visible.map((line) => {
        const document = documents.get(line.documentId);
        const voided = line.voidedAt != null;
        // Sin número: protegido si el titular tiene datos bloqueados; si no, suprimido.
        const certificateProtected = statement.buyerProtected || document?.buyerProtected === true;
        return (
          <li
            key={line.id}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {WITHHOLDING_TAX_CODES[line.taxCode]}
              </p>
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
            <div className="flex shrink-0 items-center gap-3 sm:justify-end">
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
  );

  if (!framed) {
    return (
      <section aria-labelledby="statement-withholdings" className="space-y-2">
        <h3 id="statement-withholdings" className="text-sm font-semibold">
          {WITHHOLDING_PANEL_TITLE}
        </h3>
        {list}
      </section>
    );
  }

  return (
    <PortalPanel
      title={WITHHOLDING_PANEL_TITLE}
      description={WITHHOLDING_PANEL_DESCRIPTION}
      labelled
    >
      {list}
    </PortalPanel>
  );
}
