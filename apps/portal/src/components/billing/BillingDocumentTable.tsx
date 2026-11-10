'use client';

import { useCallback, useState } from 'react';
import {
  AccessPermissionKey,
  VoidDocumentCommandSchema,
  type BillingDocumentResponse,
} from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { PortalAlert, PortalSidePeek } from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { downloadBillingDocumentPdf } from './billing-document-pdf';
import {
  additionalNotice,
  BLOCKING_REASONS,
  DOCUMENT_STATES,
  DOCUMENT_VOID_REASONS,
  formatBillingMoney,
  PAYMENT_STATES,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
} from './billing-copy';
import { BillingLoadState, BillingTable, billingError, useBillingLoad } from './billing-ui';

export function BillingDocumentTable({
  documents,
  onChanged,
  selection,
  onSelectionChange,
}: {
  documents: BillingDocumentResponse[];
  onChanged: () => void;
  selection?: ReadonlySet<string>;
  onSelectionChange?: (documentId: string, selected: boolean) => void;
}) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(AccessPermissionKey.BILLING_INVOICES_MANAGE);
  const [detail, setDetail] = useState<string | null>(null);
  const [action, setAction] = useState<{
    kind: 'issue' | 'void';
    document: BillingDocumentResponse;
  }>();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(document: BillingDocumentResponse) {
    if (downloading) return;
    setPdfError(null);
    setDownloading(document.id);
    try {
      await downloadBillingDocumentPdf(document);
    } catch (error) {
      setPdfError(billingError(error));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      {pdfError ? <PortalAlert variant="error" title={pdfError} /> : null}
      <BillingTable
        columns={[
          ...(selection ? ['Selección'] : []),
          'Número',
          'Titular',
          'Periodo cubierto',
          'Fecha de vencimiento',
          'Total',
          'Saldo pendiente',
          'Estado',
          'Estado de pago',
          'Acciones',
        ]}
        rows={documents.map((document) => {
          const status = DOCUMENT_STATES[document.status];
          const payment = document.paymentState ? PAYMENT_STATES[document.paymentState] : null;
          const blocking = document.blockingReason
            ? BLOCKING_REASONS[document.blockingReason]
            : null;
          const canIssue = document.status === 'BORRADOR' && !blocking;
          return {
            id: document.id,
            cells: [
              ...(selection
                ? [
                    <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                      <input
                        aria-label={`Seleccionar documento ${document.number ?? formatBillingDate(document.periodStart)}`}
                        type="checkbox"
                        className="h-5 w-5 accent-iwana-primary"
                        checked={selection.has(document.id)}
                        disabled={
                          !canIssue || (!selection.has(document.id) && selection.size >= 100)
                        }
                        onChange={(event) => onSelectionChange?.(document.id, event.target.checked)}
                      />
                    </label>,
                  ]
                : []),
              document.number ?? 'Sin número',
              document.buyerProtected
                ? PROTECTED_LABEL
                : (document.buyerSnapshot?.displayName ?? 'No disponible'),
              `${formatBillingDate(document.coveredStart)} al ${formatBillingDate(document.periodEnd)}`,
              formatBillingDate(document.dueDate),
              formatBillingMoney(document.total),
              document.pendingAmount == null ? '—' : formatBillingMoney(document.pendingAmount),
              <div className="space-y-1">
                <Badge variant={status.variant}>{status.label}</Badge>
                {blocking ? (
                  <p>
                    <Badge variant="warning">{blocking}</Badge>
                  </p>
                ) : null}
              </div>,
              payment ? <Badge variant={payment.variant}>{payment.label}</Badge> : '—',
              <div className="flex flex-wrap gap-1">
                <Button
                  className="min-h-11"
                  type="button"
                  variant="ghost"
                  onClick={() => setDetail(document.id)}
                >
                  Ver detalle
                </Button>
                {canManage && document.status === 'BORRADOR' ? (
                  <Button
                    className="min-h-11"
                    type="button"
                    variant="secondary"
                    disabled={!canIssue}
                    title={blocking ?? undefined}
                    onClick={() => setAction({ kind: 'issue', document })}
                  >
                    Emitir
                  </Button>
                ) : null}
                {document.status === 'EMITIDO' ? (
                  <>
                    <Button
                      className="min-h-11"
                      type="button"
                      variant="ghost"
                      disabled={downloading !== null}
                      loading={downloading === document.id}
                      onClick={() => void download(document)}
                    >
                      Descargar PDF
                    </Button>
                    {canManage ? (
                      <Button
                        className="min-h-11"
                        type="button"
                        variant="ghost"
                        onClick={() => setAction({ kind: 'void', document })}
                      >
                        Anular documento
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>,
            ],
          };
        })}
      />
      {detail ? <BillingDocumentDetail id={detail} onClose={() => setDetail(null)} /> : null}
      {action ? (
        <BillingConfirmation
          key={`${action.kind}-${action.document.id}`}
          title={
            action.kind === 'issue'
              ? 'Emitir documento de cobro'
              : `Anular documento de cobro ${action.document.number ?? ''}`
          }
          description={
            action.kind === 'issue'
              ? `Se asignará un consecutivo definitivo al documento de ${formatBillingMoney(action.document.total)}.`
              : 'El consecutivo quedará en el historial contable. Cualquier pago aplicado volverá al saldo a favor del suscriptor.'
          }
          confirm={action.kind === 'issue' ? 'Confirmar emisión' : 'Confirmar anulación'}
          {...(action.kind === 'void' ? { reasons: DOCUMENT_VOID_REASONS } : {})}
          onClose={() => setAction(undefined)}
          onConfirm={async (key, reasonCode, note) => {
            if (action.kind === 'issue')
              await billingApi.issue({ documentIds: [action.document.id] }, key);
            else
              await billingApi.voidDocument(
                action.document.id,
                VoidDocumentCommandSchema.parse({ reasonCode, ...(note ? { note } : {}) }),
                key,
              );
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function BillingDocumentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const load = useCallback(() => billingApi.document(id), [id]);
  const { data, error, loading, reload } = useBillingLoad(load);
  const buyer = data?.buyerProtected ? null : data?.buyerSnapshot;
  return (
    <PortalSidePeek open onClose={onClose} title={data?.number ?? 'Documento de cobro'}>
      <BillingLoadState loading={loading} error={error} onRetry={reload} />
      {data ? (
        <div className="space-y-4">
          {data.buyerProtected ? (
            <PortalAlert variant="info" title={PROTECTED_LABEL} description={PROTECTED_NOTICE} />
          ) : null}
          {data.unbilledAdditionalCount > 0 ? (
            <PortalAlert variant="info" title={additionalNotice(data.unbilledAdditionalCount)} />
          ) : null}
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">Adquirente</dt>
              <dd>
                {data.buyerProtected ? PROTECTED_LABEL : (buyer?.displayName ?? 'No disponible')}
              </dd>
            </div>
            {buyer?.documentNumber ? (
              <div>
                <dt className="font-medium">Identificación</dt>
                <dd>{buyer.documentNumber}</dd>
              </div>
            ) : null}
            {buyer?.address ? (
              <div>
                <dt className="font-medium">Dirección</dt>
                <dd>{buyer.address}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">Periodo cubierto</dt>
              <dd>
                {formatBillingDate(data.coveredStart)} al {formatBillingDate(data.periodEnd)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Total</dt>
              <dd>{formatBillingMoney(data.total)}</dd>
            </div>
          </dl>
          {data.lines?.length ? (
            <BillingTable
              columns={['Concepto', 'Total']}
              rows={data.lines.map((line) => ({
                id: line.id,
                cells: [line.description, formatBillingMoney(line.total)],
              }))}
            />
          ) : null}
        </div>
      ) : null}
    </PortalSidePeek>
  );
}
