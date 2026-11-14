'use client';

import { useCallback, useId, useState, type FormEvent } from 'react';
import {
  GrantCourtesyCommandSchema,
  type BillingCourtesyReason,
  type BillingCourtesyTarget,
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
import { billingApi } from '@/lib/api-client';
import {
  COURTESY_REASONS,
  DOCUMENT_LINE_KINDS,
  courtesyBaseCents,
  courtesyEligibleLines,
  courtesyNeedsLine,
  documentReference,
  formatBillingMoneyExact,
  fromMoneyCents,
  moneyCents,
} from './billing-copy';
import {
  BillingLoadState,
  billingInputClass,
  useBillingLoad,
  useBillingMutation,
} from './billing-ui';

/**
 * «Otorgar cortesía» (spec MOD14 2026-11-12 D4, R4, R5). Carga el detalle del documento para
 * ofrecer sus líneas elegibles y calcular el saldo resultante antes de confirmar.
 */
export function BillingCourtesyDialog({
  documentId,
  onClose,
  onSaved,
}: {
  documentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const load = useCallback(() => billingApi.document(documentId), [documentId]);
  const { data, error, loading, reload } = useBillingLoad(load);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Otorgar cortesía</DialogTitle>
          <DialogDescription>
            La cortesía baja el saldo de la factura sin registrar un pago. Queda en el historial con
            su motivo.
          </DialogDescription>
        </DialogHeader>
        {data ? (
          <CourtesyForm document={data} onClose={onClose} onSaved={onSaved} />
        ) : (
          <BillingLoadState loading={loading} error={error} onRetry={reload} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CourtesyForm({
  document,
  onClose,
  onSaved,
}: {
  document: BillingDocumentResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const lines = courtesyEligibleLines(document);
  const lineOnly = courtesyNeedsLine(document);
  const [target, setTarget] = useState<BillingCourtesyTarget>(
    lines.length || lineOnly ? 'LINEA' : 'VALOR',
  );
  const [lineId, setLineId] = useState(lines[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<BillingCourtesyReason | ''>('');
  const [note, setNote] = useState('');
  const mutation = useBillingMutation();

  const baseCents = courtesyBaseCents(document);
  const line = lines.find((item) => item.id === lineId);
  const courtesyCents =
    target === 'LINEA' ? (line ? moneyCents(line.total) : NaN) : moneyCents(amount.trim());
  const valid = Number.isFinite(courtesyCents) && courtesyCents > 0;
  const exceeds = valid && courtesyCents > baseCents;
  const noteRequired = reason === 'OTRO';

  const command = GrantCourtesyCommandSchema.safeParse({
    target,
    ...(target === 'LINEA' ? { lineId } : { amount: amount.trim().replace(',', '.') }),
    reasonCode: reason || undefined,
    ...(note.trim() ? { note: note.trim() } : {}),
  });
  const canSubmit = command.success && valid && !exceeds && !mutation.busy;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!command.success || !canSubmit) return;
    const input = command.data;
    void mutation.run(input, (key) => billingApi.grantCourtesy(document.id, input, key), onSaved);
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Factura {documentReference(document)} · Saldo actual{' '}
        <span className="font-semibold tabular-nums">
          {formatBillingMoneyExact(fromMoneyCents(baseCents))}
        </span>
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipo de cortesía</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['LINEA', 'Regalar una línea'],
              ['VALOR', 'Por valor'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm has-[:checked]:border-iwana-primary has-[:disabled]:opacity-60 dark:border-dark-border"
            >
              <input
                type="radio"
                name={`${id}-target`}
                value={value}
                className="h-4 w-4 accent-iwana-primary"
                checked={target === value}
                disabled={mutation.busy || (value === 'VALOR' && lineOnly)}
                onChange={() => setTarget(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {lineOnly ? (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Este borrador tiene conceptos con IVA distinto: la cortesía se otorga por línea.
          </p>
        ) : null}
      </fieldset>

      {target === 'LINEA' ? (
        lines.length ? (
          <label className="block space-y-1 text-sm" htmlFor={`${id}-line`}>
            <span>Línea a regalar</span>
            <select
              id={`${id}-line`}
              className={billingInputClass}
              required
              disabled={mutation.busy}
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
            >
              {lines.map((item) => (
                <option key={item.id} value={item.id}>
                  {DOCUMENT_LINE_KINDS[item.kind]} · {item.description} ·{' '}
                  {formatBillingMoneyExact(item.total)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <PortalAlert
            variant="info"
            title="No hay líneas para regalar"
            description="Todas las líneas con valor ya tienen una cortesía."
          />
        )
      ) : (
        <label className="block space-y-1 text-sm" htmlFor={`${id}-amount`}>
          <span>Valor de la cortesía (IVA incluido)</span>
          <input
            id={`${id}-amount`}
            className={billingInputClass}
            inputMode="decimal"
            autoComplete="off"
            required
            placeholder="0"
            disabled={mutation.busy}
            aria-invalid={exceeds ? 'true' : 'false'}
            aria-describedby={`${id}-preview`}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
      )}

      <label className="block space-y-1 text-sm" htmlFor={`${id}-reason`}>
        <span>Motivo</span>
        <select
          id={`${id}-reason`}
          className={billingInputClass}
          required
          disabled={mutation.busy}
          value={reason}
          onChange={(event) => setReason(event.target.value as BillingCourtesyReason | '')}
        >
          <option value="">Selecciona un motivo</option>
          {Object.entries(COURTESY_REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm" htmlFor={`${id}-note`}>
        <span>{noteRequired ? 'Nota (obligatoria con «Otro motivo»)' : 'Nota (opcional)'}</span>
        <textarea
          id={`${id}-note`}
          className={billingInputClass}
          maxLength={500}
          required={noteRequired}
          disabled={mutation.busy}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <dl
        id={`${id}-preview`}
        aria-live="polite"
        className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-gray-50 p-3 text-sm tabular-nums dark:bg-dark-surface-2"
      >
        <dt>Saldo actual</dt>
        <dd className="text-right">{formatBillingMoneyExact(fromMoneyCents(baseCents))}</dd>
        <dt>Cortesía</dt>
        <dd className="text-right">
          {valid ? `−${formatBillingMoneyExact(fromMoneyCents(courtesyCents))}` : '—'}
        </dd>
        <dt className="font-semibold">Saldo resultante</dt>
        <dd className="text-right font-semibold">
          {valid && !exceeds
            ? formatBillingMoneyExact(fromMoneyCents(baseCents - courtesyCents))
            : '—'}
        </dd>
      </dl>
      {exceeds ? (
        <PortalAlert
          variant="warning"
          title="La cortesía supera el saldo de la factura"
          description="Usa un valor menor o igual al saldo actual."
          live="off"
        />
      ) : null}
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
        <Button className="min-h-11" type="submit" loading={mutation.busy} disabled={!canSubmit}>
          Otorgar cortesía
        </Button>
      </div>
    </form>
  );
}
