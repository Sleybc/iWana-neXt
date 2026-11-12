'use client';

import { useState, type FormEvent } from 'react';
import {
  AccessPermissionKey,
  AllocateCreditCommandSchema,
  suggestFifoAllocations,
  type BillingAccountStatement,
} from '@iwana/shared';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  PortalAlert,
  PortalEmptyState,
  PortalMetricCard,
  PortalPanel,
} from '@/components/shared/portal-ui';
import { billingApi, type Contract } from '@/lib/api-client';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { BillingContractPolicy } from './BillingContractPolicy';
import { BillingNotStartedNotice } from './BillingNotStartedNotice';
import { BillingDocumentList } from './BillingDocumentsClient';
import { BillingPaymentDialog, pendingDocuments } from './BillingPaymentDialog';
import { BillingPaymentTable } from './BillingPaymentsClient';
import {
  additionalNotice,
  formatBillingMoney,
  IMPERSONATION_HOLD_NOTICE,
  IMPERSONATION_HOLD_TITLE,
  moneyCents,
  PAYMENT_STATES,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
  COURTESY_PENDING_NOTE,
  documentReference,
  statementCourtesyTotal,
} from './billing-copy';
import { StatementCourtesyList } from './StatementCourtesyList';
import { BillingLoadState, billingInputClass, useBillingMutation } from './billing-ui';
import type { SubscriberStatementLoad } from './use-subscriber-statement';

const NOT_STARTED_BADGE = { label: 'Sin cobros emitidos', variant: 'warning' } as const;

export function SubscriberBillingTab({
  subscriberId,
  contracts,
  statement,
}: {
  subscriberId: string;
  contracts: Contract[];
  statement: SubscriberStatementLoad;
}) {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const canManagePolicy = hasPermission(AccessPermissionKey.BILLING_POLICY_MANAGE);
  const { data, loading, error, reload } = statement;
  const [revision, setRevision] = useState(0);
  const [pay, setPay] = useState(false);
  const [credit, setCredit] = useState(false);
  const [contract, setContract] = useState<Contract>();

  function changed() {
    setRevision((value) => value + 1);
    reload();
  }

  // Primer hijo en ambas ramas: el resultado del primer cobro sobrevive a la recarga.
  const notStarted = (
    <BillingNotStartedNotice statement={data} contracts={contracts} onGenerated={changed} />
  );
  if (!data)
    return (
      <div className="space-y-4">
        {notStarted}
        <BillingLoadState loading={loading} error={error} onRetry={reload} />
      </div>
    );

  const courtesyTotal = statementCourtesyTotal(data);
  const canApply =
    moneyCents(data.creditBalance) > 0 && pendingDocuments(data.documents).length > 0;
  return (
    <div className="space-y-4">
      {notStarted}
      {data.buyerProtected ? (
        <PortalAlert variant="info" title={PROTECTED_LABEL} description={PROTECTED_NOTICE} />
      ) : null}
      {data.impersonationHold ? (
        <PortalAlert
          variant="info"
          title={IMPERSONATION_HOLD_TITLE}
          description={IMPERSONATION_HOLD_NOTICE}
        />
      ) : null}
      <div
        className={`grid gap-3 sm:grid-cols-2 ${courtesyTotal ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}
      >
        <PortalMetricCard
          eyebrow="Histórico"
          title="Total facturado"
          value={formatBillingMoney(data.totalInvoiced)}
        />
        <PortalMetricCard
          eyebrow="Histórico"
          title="Total pagado"
          value={formatBillingMoney(data.totalPaid)}
        />
        {courtesyTotal ? (
          <PortalMetricCard
            eyebrow="Histórico"
            title="Cortesías otorgadas"
            value={formatBillingMoney(courtesyTotal)}
            description="No son pagos: bajan el saldo de los documentos."
          />
        ) : null}
        <PortalMetricCard
          eyebrow="Cartera"
          title="Deuda pendiente actual"
          value={formatBillingMoney(data.totalPending)}
          {...(courtesyTotal ? { description: COURTESY_PENDING_NOTE } : {})}
          accent={
            data.documents.some((document) => document.paymentState === 'VENCIDO')
              ? 'warning'
              : 'neutral'
          }
        />
        <PortalMetricCard
          eyebrow="Crédito"
          title="Saldo a favor disponible"
          value={formatBillingMoney(data.creditBalance)}
          description={
            moneyCents(data.creditBalance) > 0 ? (
              <Badge variant="lime">Disponible</Badge>
            ) : undefined
          }
        />
      </div>
      {canRegister ? (
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => setPay(true)}>
            Registrar pago
          </Button>
          <Button
            className="min-h-11"
            variant="secondary"
            disabled={!canApply}
            onClick={() => setCredit(true)}
          >
            Aplicar saldo a favor
          </Button>
        </div>
      ) : null}
      {data.documents
        .filter((document) => document.unbilledAdditionalCount > 0)
        .map((document) => (
          <PortalAlert
            key={document.id}
            variant="info"
            title={additionalNotice(document.unbilledAdditionalCount)}
            description={documentReference(document)}
          />
        ))}
      <StatementCourtesyList statement={data} />
      <BillingDocumentList
        subscriberId={subscriberId}
        revision={revision}
        onDocumentsChanged={changed}
      />
      <PortalPanel title="Pagos recibidos">
        {data.payments.length ? (
          <BillingPaymentTable payments={data.payments} onChanged={changed} />
        ) : (
          <PortalEmptyState
            title="Aún no hay pagos registrados"
            description="Los pagos recibidos aparecerán en esta sección."
          />
        )}
      </PortalPanel>
      {contracts.length ? (
        <PortalPanel title="Facturación por servicio">
          <ul className="divide-y divide-gray-200 dark:divide-dark-border">
            {contracts.map((item) => {
              const summary = data.contractSummaries.find((entry) => entry.contractId === item.id);
              // Sin cobros emitidos no es «al día»: la insignia lo dice en vez del estado (R2).
              const state = summary?.billingNotStarted
                ? NOT_STARTED_BADGE
                : summary?.periodState
                  ? PAYMENT_STATES[summary.periodState]
                  : null;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{item.alias}</p>
                    <p className="text-sm">
                      {item.billingCycleDay
                        ? `Ciclo: día ${item.billingCycleDay}`
                        : 'Sin ciclo de facturación'}
                      {summary ? ` · Pendiente: ${formatBillingMoney(summary.totalPending)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {state ? <Badge variant={state.variant}>{state.label}</Badge> : null}
                    <Button
                      className="min-h-11"
                      variant="secondary"
                      onClick={() => setContract(item)}
                    >
                      Ver política
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </PortalPanel>
      ) : null}
      {pay ? (
        <BillingPaymentDialog
          subscriberId={subscriberId}
          statement={data}
          onClose={() => setPay(false)}
          onSaved={() => {
            setPay(false);
            changed();
          }}
        />
      ) : null}
      {credit ? (
        <ApplyCreditDialog
          statement={data}
          onClose={() => setCredit(false)}
          onSaved={() => {
            setCredit(false);
            changed();
          }}
        />
      ) : null}
      {contract ? (
        <BillingContractPolicy
          contractId={contract.id}
          contractLabel={contract.alias}
          canManage={canManagePolicy}
          onClose={() => setContract(undefined)}
        />
      ) : null}
    </div>
  );
}

function ApplyCreditDialog({
  statement,
  onClose,
  onSaved,
}: {
  statement: BillingAccountStatement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const credits = statement.payments.filter(
    (payment) =>
      payment.status === 'REGISTRADO' && moneyCents(payment.unallocatedAmount ?? '0') > 0,
  );
  const [paymentId, setPaymentId] = useState(credits[0]?.id ?? '');
  const selected = credits.find((payment) => payment.id === paymentId);
  const suggested = selected
    ? suggestFifoAllocations(
        selected.unallocatedAmount ?? '0',
        pendingDocuments(statement.documents).map((document) => ({
          documentId: document.id,
          dueDate: document.dueDate,
          pendingAmount: document.pendingAmount ?? '0',
        })),
      )
    : [];
  const mutation = useBillingMutation();

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = AllocateCreditCommandSchema.safeParse({
      subscriberId: statement.subscriberId,
      allocations: suggested.map((item) => ({ ...item, paymentId })),
    });
    if (!parsed.success) return;
    void mutation.run(
      parsed.data,
      (key) => billingApi.allocateCredit(paymentId, parsed.data, key),
      onSaved,
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar saldo a favor</DialogTitle>
          <DialogDescription>
            El saldo del pago seleccionado se aplicará a los documentos pendientes más antiguos.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block space-y-1 text-sm">
            Pago con saldo a favor
            <select
              className={billingInputClass}
              value={paymentId}
              disabled={mutation.busy}
              onChange={(event) => setPaymentId(event.target.value)}
            >
              {credits.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {formatBillingDate(payment.paidAt)} ·{' '}
                  {formatBillingMoney(payment.unallocatedAmount ?? '0')}
                </option>
              ))}
            </select>
          </label>
          <ul className="space-y-1 text-sm">
            {suggested.map((item) => (
              <li key={item.documentId}>
                {statement.documents.find((document) => document.id === item.documentId)?.number ??
                  'Documento de cobro'}{' '}
                · {formatBillingMoney(item.amount)}
              </li>
            ))}
          </ul>
          {mutation.error ? <PortalAlert variant="error" title={mutation.error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              className="min-h-11"
              type="button"
              variant="secondary"
              disabled={mutation.busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              className="min-h-11"
              type="submit"
              disabled={!suggested.length || mutation.busy}
              loading={mutation.busy}
            >
              Aplicar saldo a favor
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
