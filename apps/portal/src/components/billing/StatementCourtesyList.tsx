import type { BillingAccountStatement } from '@iwana/shared';
import { Badge } from '@iwana/ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import {
  COURTESY_REASONS,
  COURTESY_STATUSES,
  COURTESY_VOID_REASONS,
  documentReference,
  formatBillingMoney,
} from './billing-copy';

/**
 * Detalle de cortesías del estado de cuenta (spec MOD14 2026-11-12 R4): fecha, motivo, valor y
 * estado de cada una, activas y anuladas. Sin cortesías no se muestra nada.
 */
export function StatementCourtesyList({
  statement,
  limit,
}: {
  statement: Pick<BillingAccountStatement, 'courtesies' | 'documents'>;
  /** Cuántas mostrar (las más recientes); sin límite, todas. */
  limit?: number;
}) {
  const courtesies = statement.courtesies ?? [];
  if (!courtesies.length) return null;
  const visible = limit === undefined ? courtesies : courtesies.slice(0, limit);
  const documents = new Map(statement.documents.map((document) => [document.id, document]));
  return (
    <section aria-labelledby="statement-courtesies" className="space-y-2">
      <h3 id="statement-courtesies" className="text-sm font-semibold">
        Detalle de cortesías
      </h3>
      <ul className="divide-y divide-gray-200 dark:divide-dark-border">
        {visible.map((courtesy) => {
          const status = COURTESY_STATUSES[courtesy.status];
          const document = documents.get(courtesy.documentId);
          return (
            <li
              key={courtesy.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold">{COURTESY_REASONS[courtesy.reasonCode]}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {formatBillingDate(courtesy.createdAt)}
                  {document ? ` · ${documentReference(document)}` : ''}
                </p>
                {courtesy.voidReasonCode ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {COURTESY_VOID_REASONS[courtesy.voidReasonCode]}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="text-sm font-semibold tabular-nums">
                  −{formatBillingMoney(courtesy.amount)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
