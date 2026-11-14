'use client';

import { useState } from 'react';
import {
  AccessPermissionKey,
  UnlinkAllocationCommandSchema,
  type BillingDocumentResponse,
  type BillingPaymentAllocationResponse,
  type BillingPaymentResponse,
} from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { PortalAlert, PortalSidePeek } from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingEmailLog, BillingEmailSendResult, useBillingEmailSend } from './BillingEmailLog';
import { billingPdfFilename, saveBillingPdf } from './billing-document-pdf';
import {
  ALLOCATION_UNLINK_REASONS,
  documentReference,
  formatBillingMoney,
  formatBillingMoneyExact,
  PAYMENT_METHODS,
  paymentReceiptLabel,
  WITHHOLDING_TAX_CODES,
  withholdingAmountOrNull,
} from './billing-copy';
import { BillingTable, billingError } from './billing-ui';

type DocumentRef = Pick<
  BillingDocumentResponse,
  'id' | 'status' | 'number' | 'externalNumber' | 'periodStart'
>;

/**
 * Por qué no se puede desasociar una aplicación vigente (spec MOD05↔MOD14 2026-11-13 R5, P3,
 * CA-7), o null si se puede. La API lo vuelve a verificar y su error se muestra si igual ocurre.
 */
export function unlinkBlockReason(
  payment: Pick<BillingPaymentResponse, 'status' | 'withholdings'>,
  allocation: Pick<BillingPaymentAllocationResponse, 'documentId' | 'reversedAt'>,
  document: Pick<BillingDocumentResponse, 'status'> | undefined,
): string | null {
  if (payment.status !== 'REGISTRADO' || allocation.reversedAt)
    return 'Esta aplicación ya no está vigente.';
  if (document?.status === 'ANULADO') return 'No se puede desasociar: la factura está anulada.';
  if (document?.status === 'IMPORTADO')
    return 'No se puede desasociar: es una factura histórica de UISP.';
  const withholding = (payment.withholdings ?? []).some(
    (line) => line.documentId === allocation.documentId && line.voidedAt == null,
  );
  if (withholding)
    return 'No se puede desasociar: este pago tiene una retención sobre la factura. Para corregirlo, anula el pago.';
  return null;
}

function allocationState(allocation: BillingPaymentAllocationResponse) {
  if (!allocation.reversedAt) return { label: 'Vigente', variant: 'success' as const, note: null };
  if (allocation.reversalReasonCode)
    return {
      label: 'Desasociada',
      variant: 'neutral' as const,
      note: ALLOCATION_UNLINK_REASONS[allocation.reversalReasonCode],
    };
  return {
    label: 'Revertida',
    variant: 'neutral' as const,
    note: 'Al anular el pago o la factura',
  };
}

/** Detalle de un pago de la ficha: facturas cubiertas, retenciones, saldo a favor y recibo. */
export function BillingPaymentDetail({
  payment,
  documents,
  subscriberId,
  onChanged,
  onClose,
}: {
  payment: BillingPaymentResponse;
  /** Documentos del estado de cuenta: dan el número y el estado de cada documento cubierto. */
  documents: readonly DocumentRef[];
  subscriberId: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_REGISTER);
  const canReadPayments = hasPermission(AccessPermissionKey.BILLING_PAYMENTS_READ);
  // El registro de correos exige la lectura de documentos; los recibos, además, la de pagos.
  const canReadEmailLog =
    canReadPayments && hasPermission(AccessPermissionKey.BILLING_INVOICES_READ);
  const [unlinking, setUnlinking] = useState<BillingPaymentAllocationResponse>();
  const [downloading, setDownloading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const email = useBillingEmailSend();
  const native = !payment.imported;
  const receipt = paymentReceiptLabel(payment);
  const withholdingTotal = withholdingAmountOrNull(payment.withholdingAmount);
  const allocations = payment.allocations ?? [];
  const withholdings = payment.withholdings ?? [];
  const documentFor = (id: string) => documents.find((document) => document.id === id);
  const documentLabel = (id: string) => {
    const document = documentFor(id);
    return document ? documentReference(document) : 'Factura';
  };

  async function downloadReceipt() {
    if (downloading) return;
    setDownloading(true);
    setReceiptError(null);
    try {
      const blob = await billingApi.receiptPdf(payment.id);
      saveBillingPdf(
        blob,
        billingPdfFilename(
          payment.receiptNumber ? `recibo-${payment.receiptNumber}` : null,
          'recibo',
        ),
      );
    } catch (cause) {
      setReceiptError(billingError(cause));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PortalSidePeek
      open
      onClose={onClose}
      eyebrow="Pago"
      title={native ? `Recibo ${receipt}` : 'Pago importado'}
    >
      <div className="space-y-4">
        {native ? null : (
          <PortalAlert
            variant="info"
            title="Pago traído de otro sistema"
            description={`Se identifica por su referencia de origen${payment.externalId ? ` (${payment.externalId})` : ''} y no tiene recibo de iWana.`}
          />
        )}
        {payment.status === 'ANULADO' ? (
          <PortalAlert
            variant="warning"
            title="Pago anulado"
            description="Sus aplicaciones y retenciones se revirtieron."
          />
        ) : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Field label="Recibo" value={receipt} />
          <Field label="Fecha de pago" value={formatBillingDate(payment.paidAt)} />
          <Field label="Método" value={PAYMENT_METHODS[payment.method]} />
          <Field label="Referencia" value={payment.reference ?? '—'} />
          <Field label="Monto recibido" value={formatBillingMoneyExact(payment.amount)} />
          {withholdingTotal ? (
            <Field label="Retenciones" value={formatBillingMoneyExact(withholdingTotal)} />
          ) : null}
          <Field
            label="Aplicado a facturas"
            value={
              payment.allocatedAmount == null
                ? '—'
                : formatBillingMoneyExact(payment.allocatedAmount)
            }
          />
          <Field
            label="Saldo a favor"
            value={
              payment.unallocatedAmount == null
                ? '—'
                : formatBillingMoneyExact(payment.unallocatedAmount)
            }
          />
        </dl>
        {native && (canReadPayments || canRegister) ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {canReadPayments ? (
                <Button
                  className="min-h-11"
                  type="button"
                  variant="secondary"
                  loading={downloading}
                  disabled={downloading}
                  onClick={() => void downloadReceipt()}
                >
                  Descargar recibo
                </Button>
              ) : null}
              {canRegister && payment.status === 'REGISTRADO' ? (
                <Button
                  className="min-h-11"
                  type="button"
                  variant="secondary"
                  loading={email.busy !== null}
                  disabled={email.busy !== null}
                  onClick={() =>
                    void email.send(payment.id, () => billingApi.sendReceiptEmail(payment.id))
                  }
                >
                  Enviar recibo
                </Button>
              ) : null}
            </div>
            {receiptError ? <PortalAlert variant="error" title={receiptError} /> : null}
            <BillingEmailSendResult outcome={email.outcome} />
          </div>
        ) : null}
        <section className="space-y-2" aria-label="Facturas cubiertas">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Facturas cubiertas
          </h3>
          {allocations.length ? (
            <BillingTable
              label="Facturas cubiertas por el pago"
              columns={['Factura', 'Valor aplicado', 'Estado', 'Acciones']}
              rows={allocations.map((allocation) => {
                const state = allocationState(allocation);
                const blocked = unlinkBlockReason(
                  payment,
                  allocation,
                  documentFor(allocation.documentId),
                );
                const vigente = !allocation.reversedAt && payment.status === 'REGISTRADO';
                const noteId = `desasociar-${allocation.id}`;
                return {
                  id: allocation.id,
                  cells: [
                    documentLabel(allocation.documentId),
                    formatBillingMoneyExact(allocation.amount),
                    <div className="space-y-0.5">
                      <Badge variant={state.variant}>{state.label}</Badge>
                      {state.note ? (
                        <p className="text-xs text-gray-600 dark:text-gray-400">{state.note}</p>
                      ) : null}
                    </div>,
                    canRegister && vigente ? (
                      <div className="max-w-xs space-y-1">
                        <Button
                          className="min-h-11"
                          type="button"
                          variant="ghost"
                          disabled={blocked !== null}
                          aria-label={`Desasociar de la factura ${documentLabel(allocation.documentId)}`}
                          {...(blocked ? { 'aria-describedby': noteId } : {})}
                          onClick={() => setUnlinking(allocation)}
                        >
                          Desasociar
                        </Button>
                        {blocked ? (
                          <p
                            id={noteId}
                            className="whitespace-normal text-xs text-gray-600 dark:text-gray-400"
                          >
                            {blocked}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      '—'
                    ),
                  ],
                };
              })}
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Este pago no está aplicado a ninguna factura.
            </p>
          )}
        </section>
        {withholdings.length ? (
          <section className="space-y-2" aria-label="Retenciones del pago">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Retenciones</h3>
            <BillingTable
              label="Retenciones del pago"
              columns={['Tipo', 'Factura', 'Valor', 'Estado']}
              rows={withholdings.map((line) => ({
                id: line.id,
                cells: [
                  WITHHOLDING_TAX_CODES[line.taxCode],
                  documentLabel(line.documentId),
                  formatBillingMoneyExact(line.amount),
                  <Badge variant={line.voidedAt ? 'neutral' : 'success'}>
                    {line.voidedAt ? 'Anulada' : 'Vigente'}
                  </Badge>,
                ],
              }))}
            />
          </section>
        ) : null}
        {native && canReadEmailLog ? (
          <BillingEmailLog
            subscriberId={subscriberId}
            target={{ kind: 'RECIBO', paymentId: payment.id }}
            revision={email.sent}
          />
        ) : null}
      </div>
      {unlinking ? (
        <BillingConfirmation
          key={unlinking.id}
          title={`Desasociar de la factura ${documentLabel(unlinking.documentId)}`}
          description={`El valor de ${formatBillingMoney(unlinking.amount)} vuelve al saldo a favor del pago y la factura queda con ese saldo pendiente. Puedes aplicarlo de nuevo con «Aplicar saldo a favor».`}
          confirm="Desasociar"
          reasons={ALLOCATION_UNLINK_REASONS}
          reasonLabel="Motivo"
          withNote={false}
          onClose={() => setUnlinking(undefined)}
          onConfirm={async (_key, reasonCode) => {
            await billingApi.unlinkAllocation(
              payment.id,
              unlinking.id,
              UnlinkAllocationCommandSchema.parse({ reasonCode }),
            );
            onChanged();
          }}
        />
      ) : null}
    </PortalSidePeek>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
