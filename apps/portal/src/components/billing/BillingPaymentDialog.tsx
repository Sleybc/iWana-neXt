'use client';

import { useCallback, useId, useRef, useState, type FormEvent } from 'react';
import {
  AccessPermissionKey,
  BILLING_PAYMENT_METHODS,
  RegisterPaymentCommandSchema,
  suggestFifoAllocations,
  type BillingAccountStatement,
  type BillingDocumentResponse,
  type BillingPaymentResponse,
  type BillingWithholdingOptionsResponse,
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
import { BillingWithholdingFields } from './BillingWithholdingFields';
import {
  documentReference,
  formatBillingMoney,
  formatBillingMoneyExact,
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
import {
  attributeWithholdingDrafts,
  existingWithholdings,
  newWithholdingDraft,
  toWithholdingInput,
  withholdingDocumentErrors,
  withholdingLineErrors,
  withholdingTotalCents,
  type WithholdingDraft,
  type WithholdingErrors,
} from './billing-withholdings';

type WithholdingOptionsLoad = {
  data: BillingWithholdingOptionsResponse | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

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
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const canExceedRate = hasPermission(AccessPermissionKey.BILLING_COURTESIES_MANAGE);
  const load = useCallback(async () => {
    if (!selectedId) return null;
    if (statement?.subscriberId === selectedId) return statement;
    return canReadDocuments ? billingApi.statement(selectedId) : null;
  }, [selectedId, statement, canReadDocuments]);
  const account = useBillingLoad(load);
  // Retenciones (spec MOD14 2026-11-13 R7): solo si el titular puede practicarlas.
  const loadWithholding = useCallback(
    async () => (selectedId && canRegister ? billingApi.withholdingOptions(selectedId) : null),
    [selectedId, canRegister],
  );
  const withholding = useBillingLoad(loadWithholding);
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
                payments={account.data?.payments ?? []}
                canExceedRate={canExceedRate}
                date={localDate}
                withholding={withholding}
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
  payments,
  canExceedRate,
  date,
  withholding,
  mutation,
  onSaved,
  onClose,
}: {
  subscriberId: string;
  documents: BillingDocumentResponse[];
  payments: readonly BillingPaymentResponse[];
  canExceedRate: boolean;
  date: string;
  withholding: WithholdingOptionsLoad;
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
  const receivedHintId = useId();
  const [manual, setManual] = useState<Record<string, string>>({});
  const [withholdings, setWithholdings] = useState<WithholdingDraft[]>([]);
  const [showWithholdingErrors, setShowWithholdingErrors] = useState(false);
  const nextWithholdingKey = useRef(0);
  const pending = pendingDocuments(documents);
  const cents = moneyCents(amount);
  const eligibleOptions = withholding.data?.eligible ? withholding.data : null;
  const activeWithholdings = eligibleOptions ? withholdings : [];
  const withholdingCents = withholdingTotalCents(activeWithholdings);
  // R6: valor recibido + retenciones es lo que se aplica contra el saldo.
  const capacityCents = (cents > 0 ? cents : 0) + withholdingCents;
  const suggestion =
    capacityCents > 0
      ? suggestFifoAllocations(
          fromMoneyCents(capacityCents),
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
  // Saldo exacto (con centavos si los hay) para no dejar un residuo al pagar el total.
  const pendingTotalCents = pending.reduce(
    (sum, document) => sum + (moneyCents(document.pendingAmount ?? '0') || 0),
    0,
  );
  const totalApplied = pending.reduce(
    (sum, document) => sum + (moneyCents(appliedAmounts[document.id] ?? '') || 0),
    0,
  );
  const appliedCents = Object.fromEntries(
    pending.map((document) => [document.id, moneyCents(appliedAmounts[document.id] ?? '') || 0]),
  );
  // Mismo orden que las aplicaciones enviadas: la API atribuye en ese orden.
  const allocationOrder = pending.map((document) => ({
    documentId: document.id,
    amountCents: appliedCents[document.id] ?? 0,
  }));
  const attribution = attributeWithholdingDrafts(activeWithholdings, allocationOrder);
  const documentErrors = withholdingDocumentErrors(
    activeWithholdings,
    attribution.resolved,
    new Map(
      pending
        .map((document) => [document.id, moneyCents(document.subtotal)] as const)
        .filter(([, subtotal]) => Number.isFinite(subtotal)),
    ),
    existingWithholdings(payments),
  );
  const withholdingErrors: Record<string, WithholdingErrors> = Object.fromEntries(
    activeWithholdings.map((line) => {
      const errors: WithholdingErrors = {
        ...documentErrors.get(line.key),
        ...withholdingLineErrors(line),
      };
      if (attribution.invalid.has(line.key))
        errors.documentId = line.documentId
          ? 'La retención supera lo que este pago aplica a ese documento.'
          : 'La retención no cabe entera en ninguno de los documentos que salda este pago. Elige el documento o revisa la distribución.';
      return [line.key, errors];
    }),
  );
  const hasWithholdingErrors = Object.values(withholdingErrors).some(
    (errors) => Object.keys(errors).length > 0,
  );

  function addWithholding() {
    const option = eligibleOptions?.options[0];
    if (!option) return;
    nextWithholdingKey.current += 1;
    // Base prellenada con el saldo que el pago aplica (valor recibido + retenciones); sin valor
    // recibido todavía, con el saldo pendiente.
    // La base de un tipo no supera el subtotal antes de IVA del documento al que se atribuye.
    const saldo = cents > 0 && totalApplied > 0 ? totalApplied : pendingTotalCents;
    const target = pending.find((document) => (appliedCents[document.id] ?? 0) > 0) ?? pending[0];
    const subtotal = target ? moneyCents(target.subtotal) : NaN;
    const base = Number.isFinite(subtotal) ? Math.min(saldo, subtotal) : saldo;
    setWithholdings((current) => [
      ...current,
      newWithholdingDraft(`retencion-${nextWithholdingKey.current}`, option, base),
    ]);
  }

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
      totalApplied > capacityCents
    ) {
      mutation.setError(
        'Revisa la distribución. Cada aplicación debe respetar el saldo del documento y el total del pago.',
      );
      return;
    }
    if (hasWithholdingErrors) {
      setShowWithholdingErrors(true);
      mutation.setError('Revisa las retenciones marcadas antes de registrar el pago.');
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
      ...(activeWithholdings.length
        ? { withholdings: activeWithholdings.map(toWithholdingInput) }
        : {}),
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
          <div className="space-y-1">
            <label className="block space-y-1 text-sm">
              Monto del pago (COP)
              <input
                className={billingInputClass}
                inputMode="decimal"
                value={amount}
                required
                aria-describedby={eligibleOptions ? receivedHintId : undefined}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            {eligibleOptions ? (
              <p id={receivedHintId} className="text-xs text-gray-600 dark:text-gray-400">
                Valor recibido, sin las retenciones.
              </p>
            ) : null}
          </div>
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
        {pendingTotalCents > 0 ? (
          <p className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-iwana-primary/30 bg-iwana-primary/5 dark:border-iwana-primary-300/20 dark:bg-iwana-primary-400/10 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">
            Saldo pendiente: {formatBillingMoneyExact(fromMoneyCents(pendingTotalCents))}
            <Button
              type="button"
              className="min-h-11"
              // Con retenciones, el valor recibido es el saldo menos lo retenido.
              onClick={() =>
                setAmount(fromMoneyCents(Math.max(0, pendingTotalCents - withholdingCents)))
              }
            >
              Pagar el saldo completo
            </Button>
          </p>
        ) : null}
        {cents > 0 ? (
          <p className="text-sm">{formatBillingMoney(fromMoneyCents(cents))} COP</p>
        ) : null}
        {cents > 0 &&
        pendingTotalCents > capacityCents &&
        pendingTotalCents - capacityCents < 100 ? (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            Quedan {formatBillingMoneyExact(fromMoneyCents(pendingTotalCents - capacityCents))} sin
            pagar: un documento quedará con pago parcial.
          </p>
        ) : null}
        {eligibleOptions ? (
          <BillingWithholdingFields
            options={eligibleOptions}
            lines={withholdings}
            documents={pending}
            canExceedRate={canExceedRate}
            errors={withholdingErrors}
            showErrors={showWithholdingErrors}
            onAdd={addWithholding}
            onChange={(key, next) =>
              setWithholdings((current) => current.map((line) => (line.key === key ? next : line)))
            }
            onRemove={(key) =>
              setWithholdings((current) => current.filter((line) => line.key !== key))
            }
          />
        ) : withholding.error ? (
          <PortalAlert
            variant="warning"
            title="No pudimos consultar si el titular practica retenciones"
            description="Puedes registrar el pago sin retenciones o volver a intentarlo."
            action={
              <Button
                type="button"
                className="min-h-11"
                variant="secondary"
                onClick={withholding.reload}
              >
                Reintentar
              </Button>
            }
          />
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
        {activeWithholdings.length ? (
          <>
            Valor recibido: {formatBillingMoneyExact(fromMoneyCents(cents || 0))} + Retenciones:{' '}
            {formatBillingMoneyExact(fromMoneyCents(withholdingCents))} = Total del pago:{' '}
            {formatBillingMoneyExact(fromMoneyCents(capacityCents))} · Total aplicado:{' '}
            {formatBillingMoneyExact(fromMoneyCents(totalApplied))}
          </>
        ) : (
          <>
            Total pago: {formatBillingMoney(fromMoneyCents(cents || 0))} · Total aplicado:{' '}
            {formatBillingMoney(fromMoneyCents(totalApplied))}
          </>
        )}{' '}
        · Remanente a saldo a favor:{' '}
        {formatBillingMoney(fromMoneyCents(Math.max(0, capacityCents - totalApplied)))}. Este monto
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
