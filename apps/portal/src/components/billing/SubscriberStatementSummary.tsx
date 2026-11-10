'use client';

import { ChevronRight } from 'lucide-react';
import type { BillingAccountStatement } from '@iwana/shared';
import { Badge, cn } from '@iwana/ui';
import {
  PortalAlert,
  PortalMetricCard,
  PortalPanel,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { pendingDocuments } from './BillingPaymentDialog';
import {
  formatBillingMoney,
  IMPERSONATION_HOLD_NOTICE,
  IMPERSONATION_HOLD_TITLE,
  PAYMENT_STATES,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
} from './billing-copy';
import { BillingLoadState } from './billing-ui';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

const VISIBLE_DOCUMENTS = 3;

/** Estado de cuenta en la Vista general de la ficha (spec 2026-11-09 §3). */
export function SubscriberStatementSummary({
  statement,
  onOpenBilling,
}: {
  statement: SubscriberStatementLoad;
  onOpenBilling: () => void;
}) {
  const { data, loading, error, reload } = statement;
  return (
    <PortalPanel
      as="section"
      labelled
      title="Estado de cuenta"
      actions={<OpenBillingLink label="Ver facturación" onClick={onOpenBilling} />}
      contentClassName="space-y-4"
    >
      {data ? (
        <StatementBody statement={data} onOpenBilling={onOpenBilling} />
      ) : (
        <BillingLoadState loading={loading} error={error} onRetry={reload} />
      )}
    </PortalPanel>
  );
}

function StatementBody({
  statement,
  onOpenBilling,
}: {
  statement: BillingAccountStatement;
  onOpenBilling: () => void;
}) {
  const pending = pendingDocuments(statement.documents);
  const overdue = PAYMENT_STATES.VENCIDO;
  const hasOverdue = statement.documents.some((document) => document.paymentState === 'VENCIDO');
  return (
    <>
      {statement.buyerProtected ? (
        <PortalAlert variant="info" title={PROTECTED_LABEL} description={PROTECTED_NOTICE} />
      ) : null}
      {statement.impersonationHold ? (
        <PortalAlert
          variant="info"
          title={IMPERSONATION_HOLD_TITLE}
          description={IMPERSONATION_HOLD_NOTICE}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <PortalMetricCard
          eyebrow="Cartera"
          title="Deuda pendiente"
          value={formatBillingMoney(statement.totalPending)}
          accent={hasOverdue ? 'warning' : 'neutral'}
          description={
            hasOverdue ? (
              <Badge variant={overdue.variant}>Tiene documentos vencidos</Badge>
            ) : undefined
          }
        />
        <PortalMetricCard
          eyebrow="Crédito"
          title="Saldo a favor"
          value={formatBillingMoney(statement.creditBalance)}
        />
      </div>
      {pending.length ? (
        <ul className="divide-y divide-gray-200 dark:divide-dark-border">
          {pending.slice(0, VISIBLE_DOCUMENTS).map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-semibold">{document.number ?? 'Documento sin número'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Periodo {formatBillingDate(document.periodStart)} –{' '}
                  {formatBillingDate(document.periodEnd)} · Vence{' '}
                  {formatBillingDate(document.dueDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {document.paymentState === 'VENCIDO' ? (
                  <Badge variant={overdue.variant}>{overdue.label}</Badge>
                ) : null}
                <span className="text-sm font-semibold tabular-nums">
                  {formatBillingMoney(document.pendingAmount ?? '0')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No hay documentos de cobro pendientes
        </p>
      )}
      {pending.length > VISIBLE_DOCUMENTS ? (
        <OpenBillingLink
          label={`Ver los ${pending.length} documentos pendientes`}
          onClick={onOpenBilling}
        />
      ) : null}
    </>
  );
}

function OpenBillingLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(portalInlineTextLinkClassName, 'gap-1')}>
      {label}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </button>
  );
}
