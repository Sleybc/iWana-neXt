'use client';

import { useCallback, useState, type FormEvent } from 'react';
import {
  AccessPermissionKey,
  BILLING_PAYMENT_METHODS,
  RegisterPaymentCommandSchema,
  suggestFifoAllocations,
  type BillingAccountStatement,
  type BillingDocumentResponse,
} from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { billingApi, tenantSelfApi } from '@/lib/api-client';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { BillingSubscriberPicker } from './BillingSubscriberPicker';
import {
  documentReference,
  formatBillingMoney,
  fromMoneyCents,
  moneyCents,
  PAYMENT_METHODS,
} from './billing-copy';
import {
  BillingLoadState,
  billingInputClass,
  useBillingLoad,
  useBillingMutation,
} from './billing-ui';

export function pendingDocuments(documents: BillingDocumentResponse[]) {
  return documents
    .filter(
      (document) =>
        // D14 (ADR-110): la deuda IMPORTADO se cobra con pagos normales, igual que lo suma el estado de cuenta.
        (document.status === 'EMITIDO' || document.status === 'IMPORTADO') &&
        moneyCents(document.pendingAmount ?? '0') > 0,
    )
    .sort(
      (left, right) => left.dueDate.localeCompare(right.dueDate) || left.id.localeCompare(right.id),
    );
}

export function BillingPaymentDialog({
  statement,
  subscriberId,
  onClose,
  onSaved,
}: {
  statement?: BillingAccountStatement;
  subscriberId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subscriber, setSubscriber] = useState<{ id: string; label: string } | null>(null);
  const selectedId = subscriberId ?? subscriber?.id;
  const { hasPermission } = usePermissions();
  const canReadDocuments = hasPermission(AccessPermissionKey.BILLING_INVOICES_READ);
  const load = useCallback(async () => {
    if (!selectedId) return null;
    if (statement?.subscriberId === selectedId) return statement;
    return canReadDocuments ? billingApi.statement(selectedId) : null;
  }, [selectedId, statement, canReadDocuments]);
  const account = useBillingLoad(load);
  const settings = useBillingLoad(tenantSelfApi.getSettings);
  const mutation = useBillingMutation();

  const localDate = settings.data
    ? new Intl.DateTimeFormat('sv-SE', {
        timeZone: settings.data.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format()
    : '';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.busy) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Registra el pago y distribúyelo entre los documentos pendientes del suscriptor.
          </DialogDescription>
        </DialogHeader>
        {!subscriberId ? (
          <BillingSubscriberPicker
            selected={subscriber}
            onChange={setSubscriber}
            label="Suscriptor"
            disabled={mutation.busy}
          />
        ) : null}
        <BillingLoadState
          loading={settings.loading}
          error={settings.error}
          onRetry={settings.reload}
        />
        {selectedId ? (
          <>
            <BillingLoadState
              loading={account.loading}
              error={account.error}
              onRetry={account.reload}
            />
            {!canReadDocuments ? (
              <PortalAlert
                variant="info"
                title="Registro sin aplicaciones"
                description="Tu perfil no puede consultar los documentos de cobro. El pago quedará como saldo a favor."
              />
            ) : null}
            {localDate && !account.loading && !account.error ? (
              <PaymentForm
                key={selectedId}
                subscriberId={selectedId}
                documents={account.data?.documents ?? []}
                date={localDate}
                mutation={mutation}
                onSaved={onSaved}
                onClose={onClose}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  subscriberId,
  documents,
  date,
  mutation,
  onSaved,
  onClose,
}: {
  subscriberId: string;
  documents: BillingDocumentResponse[];
  date: string;
  mutation: ReturnType<typeof useBillingMutation>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(date);
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [automatic, setAutomatic] = useState(true);
  const [manual, setManual] = useState<Record<string, string>>({});
  const pending = pendingDocuments(documents);
  const cents = moneyCents(amount);
  const suggestion =
    cents > 0
      ? suggestFifoAllocations(
          fromMoneyCents(cents),
          pending.map((document) => ({
            documentId: document.id,
            dueDate: document.dueDate,
            pendingAmount: document.pendingAmount ?? '0',
          })),
        )
      : [];
  const appliedAmounts = automatic
    ? Object.fromEntries(suggestion.map((item) => [item.documentId, item.amount]))
    : manual;
  const totalApplied = pending.reduce(
    (sum, document) => sum + (moneyCents(appliedAmounts[document.id] ?? '') || 0),
    0,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const amounts = pending.map((document) => ({
      document,
      input: appliedAmounts[document.id] || '0',
    }));
    if (
      amounts.some(
        ({ document, input }) =>
          !Number.isFinite(moneyCents(input)) ||
          moneyCents(input) > moneyCents(document.pendingAmount ?? '0'),
      ) ||
      totalApplied > cents
    ) {
      mutation.setError(
        'Revisa la distribución. Cada aplicación debe respetar el saldo del documento y el total del pago.',
      );
      return;
    }

    const parsed = RegisterPaymentCommandSchema.safeParse({
      subscriberId,
      method,
      paidAt,
      amount: cents > 0 ? fromMoneyCents(cents) : '',
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      allocations: amounts
        .filter(({ input }) => moneyCents(input) > 0)
        .map(({ document, input }) => ({
          documentId: document.id,
          amount: fromMoneyCents(moneyCents(input)),
        })),
    });
    if (!parsed.success) {
      mutation.setError('Revisa el método, el monto y la fecha del pago.');
      return;
    }

    void mutation.run(parsed.data, (key) => billingApi.registerPayment(parsed.data, key), onSaved);
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <fieldset disabled={mutation.busy} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            Método de pago
            <select
              className={billingInputClass}
              value={method}
              required
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="">Selecciona un método</option>
              {BILLING_PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHODS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            Monto del pago (COP)
            <input
              className={billingInputClass}
              inputMode="decimal"
              value={amount}
              required
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Fecha del pago
            <input
              className={billingInputClass}
              type="date"
              required
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            Referencia
            <input
              className={billingInputClass}
              maxLength={80}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
        </div>
        {cents > 0 ? (
          <p className="text-sm">{formatBillingMoney(fromMoneyCents(cents))} COP</p>
        ) : null}
        <label className="block space-y-1 text-sm">
          Notas
          <textarea
            className={billingInputClass}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <h3 className="text-sm font-semibold">Aplicación a documentos</h3>
        {pending.length ? (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={automatic}
                onChange={(event) => {
                  if (!event.target.checked) setManual(appliedAmounts);
                  setAutomatic(event.target.checked);
                }}
              />
              Distribuir automáticamente (los más antiguos primero)
            </label>
            <ul className="max-h-52 space-y-2 overflow-y-auto">
              {pending.map((document) => (
                <li key={document.id}>
                  <label className="grid items-center gap-2 text-sm sm:grid-cols-2">
                    <span>
                      {documentReference(document)} · {formatBillingDate(document.dueDate)} ·{' '}
                      {formatBillingMoney(document.pendingAmount ?? 0)} pendientes
                    </span>
                    <input
                      className={billingInputClass}
                      value={appliedAmounts[document.id] ?? ''}
                      aria-label={`Monto aplicado a ${documentReference(document)}`}
                      inputMode="decimal"
                      readOnly={automatic}
                      onChange={(event) =>
                        setManual((current) => ({ ...current, [document.id]: event.target.value }))
                      }
                    />
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm">
            No hay documentos pendientes disponibles para aplicar este pago.
          </p>
        )}
      </fieldset>
      <p className="text-sm" role="status">
        Total pago: {formatBillingMoney(fromMoneyCents(cents || 0))} · Total aplicado:{' '}
        {formatBillingMoney(fromMoneyCents(totalApplied))} · Remanente a saldo a favor:{' '}
        {formatBillingMoney(fromMoneyCents(Math.max(0, (cents || 0) - totalApplied)))}. Este monto
        quedará como saldo a favor en la cuenta del suscriptor y podrá aplicarse a futuros cobros.
      </p>
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
        <Button className="min-h-11" type="submit" disabled={mutation.busy} loading={mutation.busy}>
          Registrar pago
        </Button>
      </div>
    </form>
  );
}
