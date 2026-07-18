'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import {
  PurchaseRfqInvitationStatus,
  PurchaseRfqStatus,
  PurchaseRequestStatus,
} from '@iwana/shared';
import type {
  CreateRfqDto,
  PurchaseRequestLineRecord,
  PurchaseRfqDetailRecord,
  PurchaseRfqInvitationRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  formatInventoryDate,
  getPurchaseRfqInvitationStatusBadgeVariant,
  getPurchaseRfqInvitationStatusLabel,
  getPurchaseRfqStatusLabel,
  PURCHASE_CURRENCY_OPTIONS,
  type PurchaseCurrencyOption,
} from './inventory-labels';
import {
  buildQuoteLinesPayload,
  type QuoteLineUnitCostMap,
  SupplierQuoteLinesEditor,
} from './SupplierQuoteLinesEditor';
import {
  QuoteShippingFields,
  resolveShippingCost,
  type QuoteShippingValue,
} from './QuoteShippingFields';
import { SupplierMultiPicker, type SupplierMultiSelection } from './SupplierMultiPicker';

interface RfqInvitationsPanelProps {
  purchaseRequestId: string;
  requestStatus: PurchaseRequestStatus;
  rfqDetail: PurchaseRfqDetailRecord | null;
  quotes?: SupplierQuoteRecord[];
  requestLines?: PurchaseRequestLineRecord[];
  disabled?: boolean;
  onRefresh: () => Promise<void>;
}

function canInvite(status: PurchaseRfqStatus): boolean {
  return [PurchaseRfqStatus.DRAFT, PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(
    status,
  );
}

function canSend(status: PurchaseRfqStatus): boolean {
  return status === PurchaseRfqStatus.DRAFT;
}

function canClose(status: PurchaseRfqStatus): boolean {
  return [PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(status);
}

function canRegisterQuote(
  rfqStatus: PurchaseRfqStatus | undefined,
  invitationStatus: PurchaseRfqInvitationStatus,
): boolean {
  if (!rfqStatus) {
    return false;
  }
  return (
    [PurchaseRfqStatus.SENT, PurchaseRfqStatus.RECEIVING].includes(rfqStatus) &&
    invitationStatus === PurchaseRfqInvitationStatus.INVITED
  );
}

export function RfqInvitationsPanel({
  purchaseRequestId,
  requestStatus,
  rfqDetail,
  quotes = [],
  requestLines = [],
  disabled = false,
  onRefresh,
}: RfqInvitationsPanelProps) {
  const [selectedSuppliers, setSelectedSuppliers] = useState<SupplierMultiSelection[]>([]);
  const [responseDeadline, setResponseDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [rfqCurrency, setRfqCurrency] = useState<PurchaseCurrencyOption>('COP');
  const [declineReason, setDeclineReason] = useState('');
  const [quoteFormInvitationId, setQuoteFormInvitationId] = useState<string | null>(null);
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteUnitCosts, setQuoteUnitCosts] = useState<QuoteLineUnitCostMap>({});
  const [quoteShipping, setQuoteShipping] = useState<QuoteShippingValue>({
    isFree: false,
    amount: '',
  });
  const [quoteCurrency, setQuoteCurrency] = useState<PurchaseCurrencyOption>('COP');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rfq = rfqDetail?.rfq ?? null;
  const invitations = rfqDetail?.invitations ?? [];
  const rfqStatus = rfq?.status as PurchaseRfqStatus | undefined;

  const canStartRfq = !rfq && requestStatus === PurchaseRequestStatus.DRAFT;
  const panelDisabled = disabled || isBusy;
  const usesQuoteLines = requestLines.length > 0;
  const quoteLinesPayload = buildQuoteLinesPayload(quoteUnitCosts, requestLines);
  const quoteAmountTouched = quoteAmount.trim().length > 0;
  const parsedQuoteAmount = Number.parseFloat(quoteAmount);
  const quoteAmountValid = Number.isFinite(parsedQuoteAmount) && parsedQuoteAmount > 0;
  const resolvedShippingCost = resolveShippingCost(quoteShipping);
  const quoteFormValid =
    (usesQuoteLines ? quoteLinesPayload.length > 0 : quoteAmountValid) &&
    resolvedShippingCost !== null;

  const invitationSummary = useMemo(() => {
    const counts = new Map<PurchaseRfqInvitationStatus, number>();
    for (const invitation of invitations) {
      const status = invitation.status as PurchaseRfqInvitationStatus;
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [invitations]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await onRefresh();
      setSuccess(successMessage);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No fue posible completar la acción.';
      setError(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateRfq() {
    const payload: CreateRfqDto = {
      currency: rfqCurrency,
      ...(responseDeadline.trim() ? { responseDeadline: responseDeadline.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    await runAction(async () => {
      await purchasingApi.createRfq(purchaseRequestId, payload);
      setSelectedSuppliers([]);
    }, 'Solicitud de cotización creada.');
  }

  async function handleInvite() {
    if (!rfq || selectedSuppliers.length === 0) {
      return;
    }

    await runAction(async () => {
      await purchasingApi.inviteSuppliers(rfq.id, {
        partyRefIds: selectedSuppliers.map((entry) => entry.partyRefId),
      });
      setSelectedSuppliers([]);
    }, 'Proveedores invitados.');
  }

  async function handleSend() {
    if (!rfq) {
      return;
    }

    await runAction(async () => {
      await purchasingApi.sendRfq(rfq.id);
    }, 'Solicitud de cotización enviada.');
  }

  async function handleClose() {
    if (!rfq) {
      return;
    }

    await runAction(async () => {
      await purchasingApi.closeRfq(rfq.id);
    }, 'Ronda de cotización cerrada.');
  }

  async function handleDecline(invitation: PurchaseRfqInvitationRecord) {
    if (!rfq) {
      return;
    }

    const trimmedReason = declineReason.trim();
    if (trimmedReason.length < 5) {
      setError('Indica un motivo de declinación de al menos 5 caracteres.');
      return;
    }

    await runAction(async () => {
      await purchasingApi.declineInvitation(rfq.id, invitation.id, {
        declineReason: trimmedReason,
      });
      setDeclineReason('');
    }, 'Declinación registrada.');
  }

  function openQuoteForm(invitation: PurchaseRfqInvitationRecord) {
    setQuoteFormInvitationId(invitation.id);
    setQuoteNumber('');
    setQuoteAmount('');
    setQuoteUnitCosts({});
    setQuoteShipping({ isFree: false, amount: '' });
    setQuoteCurrency((rfq?.currency as PurchaseCurrencyOption) ?? 'COP');
    setError(null);
    setSuccess(null);
  }

  function closeQuoteForm() {
    setQuoteFormInvitationId(null);
    setQuoteNumber('');
    setQuoteAmount('');
    setQuoteUnitCosts({});
    setQuoteShipping({ isFree: false, amount: '' });
  }

  async function handleRegisterInvitationQuote(invitation: PurchaseRfqInvitationRecord) {
    if (quoteNumber.trim().length === 0 || !quoteFormValid || resolvedShippingCost === null) {
      return;
    }

    await runAction(async () => {
      await purchasingApi.addQuote(purchaseRequestId, {
        partyRefId: invitation.partyRefId,
        rfqInvitationId: invitation.id,
        quoteNumber: quoteNumber.trim(),
        currency: quoteCurrency,
        shippingCost: resolvedShippingCost,
        ...(usesQuoteLines ? { lines: quoteLinesPayload } : { amount: parsedQuoteAmount }),
      });
      setQuoteFormInvitationId(null);
      setQuoteNumber('');
      setQuoteAmount('');
      setQuoteUnitCosts({});
      setQuoteShipping({ isFree: false, amount: '' });
    }, 'Cotización registrada.');
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownloadInvitation(invitation: PurchaseRfqInvitationRecord) {
    if (!rfq) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { blob, filename } = await purchasingApi.downloadRfqInvitationPdf(
        rfq.id,
        invitation.id,
      );
      triggerBlobDownload(blob, filename);
    } catch {
      const supplierName = invitation.displayName?.trim() || 'Proveedor invitado';
      setError(`No fue posible descargar el PDF de: ${supplierName}.`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDownloadAllZip() {
    if (!rfq || invitations.length === 0) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { blob, filename } = await purchasingApi.downloadRfqInvitationsZip(rfq.id);
      triggerBlobDownload(blob, filename);
      setSuccess('PDFs personalizados descargados.');
    } catch {
      setError('No fue posible descargar el ZIP de cotizaciones.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PortalSectionHeader
        eyebrow="Invitar proveedores"
        title="Solicitud de cotización"
        description="Invita proveedores, envía la ronda y haz seguimiento de respuestas."
      />

      {error ? <PortalAlert variant="error" title="Cotización" description={error} /> : null}
      {success ? <PortalAlert variant="success" title="Cotización" description={success} /> : null}

      {canStartRfq ? (
        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Crea una ronda formal de cotización antes de registrar respuestas de proveedores.
          </p>
          <Select
            label="Moneda"
            value={rfqCurrency}
            disabled={panelDisabled}
            onChange={(event) => setRfqCurrency(event.target.value as PurchaseCurrencyOption)}
          >
            {PURCHASE_CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-gray-900 dark:text-white">Fecha límite</span>
            <Input
              type="date"
              value={responseDeadline}
              disabled={panelDisabled}
              onChange={(event) => setResponseDeadline(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-gray-900 dark:text-white">Notas internas</span>
            <textarea
              className={`w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white ${interactiveFocusClassName}`}
              rows={2}
              value={notes}
              disabled={panelDisabled}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <Button type="button" disabled={panelDisabled} onClick={() => void handleCreateRfq()}>
            Crear solicitud de cotización
          </Button>
        </div>
      ) : null}

      {rfq ? (
        <div className="space-y-4 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{rfq.rfqNumber}</p>
              <p className="mt-1 text-sm text-iwana-secondary-700">
                {rfqStatus ? getPurchaseRfqStatusLabel(rfqStatus) : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Fecha límite: {formatInventoryDate(rfq.responseDeadline)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={panelDisabled || invitations.length === 0}
                onClick={() => void handleDownloadAllZip()}
              >
                Descargar todos (ZIP)
              </Button>
            </div>
          </div>

          {rfqStatus && canInvite(rfqStatus) ? (
            <SupplierMultiPicker
              label="Invitar proveedores"
              value={selectedSuppliers}
              disabled={panelDisabled}
              onChange={setSelectedSuppliers}
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {rfqStatus && canInvite(rfqStatus) ? (
              <Button
                type="button"
                variant="secondary"
                disabled={panelDisabled || selectedSuppliers.length === 0}
                onClick={() => void handleInvite()}
              >
                Invitar seleccionados
              </Button>
            ) : null}
            {rfqStatus && canSend(rfqStatus) ? (
              <Button type="button" disabled={panelDisabled} onClick={() => void handleSend()}>
                Enviar solicitud
              </Button>
            ) : null}
            {rfqStatus && canClose(rfqStatus) ? (
              <Button
                type="button"
                variant="secondary"
                disabled={panelDisabled}
                onClick={() => void handleClose()}
              >
                Cerrar ronda
              </Button>
            ) : null}
          </div>

          {invitationSummary.size > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs text-iwana-secondary-700">
              {Array.from(invitationSummary.entries()).map(([status, count]) => (
                <span key={status}>
                  {getPurchaseRfqInvitationStatusLabel(status)}: {count}
                </span>
              ))}
            </div>
          ) : null}

          {invitations.length === 0 ? (
            <PortalEmptyState
              title="Sin invitaciones"
              description="Invita al menos un proveedor para generar PDFs personalizados."
            />
          ) : (
            <div className="space-y-3">
              {invitations.some(
                (invitation) =>
                  (invitation.status as PurchaseRfqInvitationStatus) ===
                  PurchaseRfqInvitationStatus.INVITED,
              ) ? (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">
                    Motivo de declinación
                  </span>
                  <textarea
                    aria-label="Motivo de declinación"
                    className={`w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white ${interactiveFocusClassName}`}
                    rows={2}
                    placeholder="Describe por qué se declina al proveedor"
                    value={declineReason}
                    disabled={panelDisabled}
                    onChange={(event) => setDeclineReason(event.target.value)}
                  />
                </label>
              ) : null}
              <div className="space-y-2">
                {invitations.map((invitation) => {
                  const invitationStatus = invitation.status as PurchaseRfqInvitationStatus;
                  const supplierName = invitation.displayName?.trim() || 'Proveedor invitado';
                  const linkedQuote = quotes.find(
                    (quote) => quote.rfqInvitationId === invitation.id,
                  );
                  const showRegisterQuote = canRegisterQuote(rfqStatus, invitationStatus);
                  const quoteFormOpen = quoteFormInvitationId === invitation.id;
                  return (
                    <div
                      key={invitation.id}
                      className="space-y-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm dark:border-dark-border"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {supplierName}
                          </p>
                          <p className="text-xs text-gray-500">
                            Invitado:{' '}
                            {formatInventoryDate(invitation.invitedAt?.slice(0, 10) ?? null)}
                          </p>
                          {linkedQuote ? (
                            <p className="mt-1 text-xs text-iwana-secondary-700">
                              Cotización: {formatInventoryCurrency(linkedQuote.amount)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={getPurchaseRfqInvitationStatusBadgeVariant(invitationStatus)}
                          >
                            {getPurchaseRfqInvitationStatusLabel(invitationStatus)}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={panelDisabled}
                            aria-label={`Descargar PDF de ${supplierName}`}
                            onClick={() => void handleDownloadInvitation(invitation)}
                          >
                            Descargar PDF
                          </Button>
                          {showRegisterQuote ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={panelDisabled}
                              aria-label={`Registrar cotización de ${supplierName}`}
                              onClick={() => openQuoteForm(invitation)}
                            >
                              Registrar cotización
                            </Button>
                          ) : null}
                          {invitationStatus === PurchaseRfqInvitationStatus.INVITED ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={panelDisabled || declineReason.trim().length < 5}
                              onClick={() => void handleDecline(invitation)}
                            >
                              Declinar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {quoteFormOpen ? (
                        <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-dark-border">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Input
                              id={`invite-quote-number-${invitation.id}`}
                              label="Número de cotización"
                              value={quoteNumber}
                              disabled={panelDisabled}
                              onChange={(event) => setQuoteNumber(event.target.value)}
                            />
                            <Select
                              label="Moneda"
                              value={quoteCurrency}
                              disabled={panelDisabled}
                              onChange={(event) =>
                                setQuoteCurrency(event.target.value as PurchaseCurrencyOption)
                              }
                            >
                              {PURCHASE_CURRENCY_OPTIONS.map((currency) => (
                                <option key={currency} value={currency}>
                                  {currency}
                                </option>
                              ))}
                            </Select>
                          </div>
                          {usesQuoteLines ? (
                            <SupplierQuoteLinesEditor
                              requestLines={requestLines}
                              value={quoteUnitCosts}
                              onChange={setQuoteUnitCosts}
                              disabled={panelDisabled}
                            />
                          ) : (
                            <Input
                              id={`invite-quote-amount-${invitation.id}`}
                              label="Monto"
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              value={quoteAmount}
                              disabled={panelDisabled}
                              onChange={(event) => setQuoteAmount(event.target.value)}
                              error={
                                quoteAmountTouched && !quoteAmountValid
                                  ? 'Ingresa un monto válido mayor a cero.'
                                  : undefined
                              }
                            />
                          )}
                          <QuoteShippingFields
                            value={quoteShipping}
                            onChange={setQuoteShipping}
                            disabled={panelDisabled}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                panelDisabled || !quoteFormValid || quoteNumber.trim().length === 0
                              }
                              onClick={() => void handleRegisterInvitationQuote(invitation)}
                            >
                              Guardar cotización
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={panelDisabled}
                              onClick={closeQuoteForm}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : !canStartRfq ? (
        <PortalEmptyState
          title="Cotización sin ronda formal"
          description="Esta solicitud se está cotizando sin una ronda formal. Registra cotizaciones directamente en «Cotizaciones»."
        />
      ) : null}
    </div>
  );
}
