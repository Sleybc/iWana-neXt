import type { BillingAccountStatement } from '@iwana/shared';
import { Badge } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import {
  COURTESY_REASONS,
  COURTESY_STATUSES,
  COURTESY_VOID_REASONS,
  documentReference,
  formatBillingMoney,
} from './billing-copy';

export const COURTESY_PANEL_TITLE = 'Detalle de cortesías';
export const COURTESY_PANEL_DESCRIPTION =
  'Valores que se le regalaron al cliente. Ya están descontados del saldo de cada factura.';

/**
 * Cortesías del estado de cuenta (spec MOD14 2026-11-12 R4): motivo, factura, fecha, valor y
 * estado de cada una, activas y anuladas. Sin cortesías no se muestra nada.
 *
 * `framed` (por defecto) la presenta en su propio panel, como el resto de bloques de la pestaña
 * Facturación; el resumen de la ficha, que ya vive dentro de una tarjeta, la usa sin marco.
 */
export function StatementCourtesyList({
  statement,
  limit,
  framed = true,
}: {
  statement: Pick<BillingAccountStatement, 'courtesies' | 'documents'>;
  /** Cuántas mostrar (las más recientes); sin límite, todas. */
  limit?: number;
  framed?: boolean;
}) {
  const courtesies = statement.courtesies ?? [];
  if (!courtesies.length) return null;
  const visible = limit === undefined ? courtesies : courtesies.slice(0, limit);
  const documents = new Map(statement.documents.map((document) => [document.id, document]));

  const list = (
    <ul aria-label="Cortesías" className="divide-y divide-gray-100 dark:divide-dark-border">
      {visible.map((courtesy) => {
        const status = COURTESY_STATUSES[courtesy.status];
        const document = documents.get(courtesy.documentId);
        const voided = courtesy.status !== 'ACTIVA';
        return (
          <li
            key={courtesy.id}
            className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {COURTESY_REASONS[courtesy.reasonCode]}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <time dateTime={courtesy.createdAt}>{formatBillingDate(courtesy.createdAt)}</time>
                {document ? (
                  <>
                    {' · '}
                    <span className="font-mono tabular-nums">{documentReference(document)}</span>
                  </>
                ) : null}
              </p>
              {courtesy.voidReasonCode ? (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Anulada: {COURTESY_VOID_REASONS[courtesy.voidReasonCode]}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:justify-end">
              <Badge variant={status.variant}>{status.label}</Badge>
              <span
                className={
                  voided
                    ? 'text-sm font-semibold tabular-nums text-gray-500 line-through dark:text-gray-400'
                    : 'text-sm font-semibold tabular-nums text-gray-900 dark:text-white'
                }
              >
                −{formatBillingMoney(courtesy.amount)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );

  if (!framed) {
    return (
      <section aria-labelledby="statement-courtesies" className="space-y-2">
        <h3 id="statement-courtesies" className="text-sm font-semibold">
          {COURTESY_PANEL_TITLE}
        </h3>
        {list}
      </section>
    );
  }

  return (
    <PortalPanel title={COURTESY_PANEL_TITLE} description={COURTESY_PANEL_DESCRIPTION} labelled>
      {list}
    </PortalPanel>
  );
}
