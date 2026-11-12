'use client';

import { useCallback, useState } from 'react';
import {
  AccessPermissionKey,
  VoidCourtesyCommandSchema,
  VoidDocumentCommandSchema,
  type BillingCourtesyResponse,
  type BillingDocumentResponse,
} from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { PortalAlert, PortalSidePeek } from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingCourtesyDialog } from './BillingCourtesyDialog';
import { downloadBillingDocumentPdf } from './billing-document-pdf';
import {
  additionalNotice,
  BLOCKING_REASONS,
  canReceiveCourtesy,
  documentCourtesyAmount,
  COURTESY_APPLICATIONS,
  COURTESY_REASONS,
  COURTESY_STATUSES,
  COURTESY_VOID_REASONS,
  DOCUMENT_LINE_KINDS,
  documentLineVat,
  DOCUMENT_STATES,
  DOCUMENT_VOID_REASONS,
  formatBillingMoney,
  formatBillingMoneyExact,
  PAYMENT_STATES,
  PROTECTED_LABEL,
  PROTECTED_NOTICE,
  documentCoveredRange,
  documentReference,
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
  const canCourtesy = hasPermission(AccessPermissionKey.BILLING_COURTESIES_MANAGE);
  const [detail, setDetail] = useState<string | null>(null);
  const [courtesyFor, setCourtesyFor] = useState<string | null>(null);
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
                        aria-label={`Seleccionar documento ${documentReference(document)}`}
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
              document.number ?? document.externalNumber ?? 'Sin número',
              document.buyerProtected
                ? PROTECTED_LABEL
                : (document.buyerSnapshot?.displayName ?? 'No disponible'),
              documentCoveredRange(document),
              formatBillingDate(document.dueDate),
              <DocumentTotalCell document={document} />,
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
                {canCourtesy && canReceiveCourtesy(document) ? (
                  <Button
                    className="min-h-11"
                    type="button"
                    variant="ghost"
                    aria-label={`Otorgar cortesía en el documento ${documentReference(document)}`}
                    onClick={() => setCourtesyFor(document.id)}
                  >
                    Otorgar cortesía
                  </Button>
                ) : null}
                {document.status === 'EMITIDO' || document.status === 'IMPORTADO' ? (
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
                ) : null}
                {document.status === 'EMITIDO' ? (
                  <>
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
      {detail ? (
        <BillingDocumentDetail
          id={detail}
          canCourtesy={canCourtesy}
          onChanged={onChanged}
          onClose={() => setDetail(null)}
        />
      ) : null}
      {courtesyFor ? (
        <BillingCourtesyDialog
          documentId={courtesyFor}
          onClose={() => setCourtesyFor(null)}
          onSaved={() => {
            setCourtesyFor(null);
            onChanged();
          }}
        />
      ) : null}
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

function BillingDocumentDetail({
  id,
  canCourtesy,
  onChanged,
  onClose,
}: {
  id: string;
  canCourtesy: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const load = useCallback(() => billingApi.document(id), [id]);
  const { data, error, loading, reload } = useBillingLoad(load);
  const [granting, setGranting] = useState(false);
  const [voiding, setVoiding] = useState<BillingCourtesyResponse>();
  const buyer = data?.buyerProtected ? null : data?.buyerSnapshot;
  function changed() {
    reload();
    onChanged();
  }
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
              <dd>{documentCoveredRange(data)}</dd>
            </div>
            <div>
              <dt className="font-medium">Total</dt>
              <dd className="tabular-nums">{formatBillingMoney(data.total)}</dd>
            </div>
            {data.courtesyAmount && Number(data.courtesyAmount) > 0 ? (
              <div>
                <dt className="font-medium">Cortesías aplicadas</dt>
                <dd className="tabular-nums">−{formatBillingMoneyExact(data.courtesyAmount)}</dd>
              </div>
            ) : null}
            {data.pendingAmount != null ? (
              <div>
                <dt className="font-medium">Saldo pendiente</dt>
                <dd className="tabular-nums">{formatBillingMoneyExact(data.pendingAmount)}</dd>
              </div>
            ) : null}
          </dl>
          {canCourtesy && canReceiveCourtesy(data) ? (
            <Button
              className="min-h-11"
              type="button"
              variant="secondary"
              onClick={() => setGranting(true)}
            >
              Otorgar cortesía
            </Button>
          ) : null}
          {data.lines?.length ? (
            <BillingTable
              columns={['Tipo', 'Concepto', 'IVA', 'Total']}
              rows={data.lines.map((line) => ({
                id: line.id,
                cells: [
                  DOCUMENT_LINE_KINDS[line.kind],
                  line.description,
                  documentLineVat(line),
                  formatBillingMoneyExact(line.total),
                ],
              }))}
            />
          ) : null}
          {data.courtesies?.length ? (
            <section aria-labelledby={`courtesies-${data.id}`} className="space-y-2">
              <h3 id={`courtesies-${data.id}`} className="text-sm font-semibold">
                Cortesías
              </h3>
              <BillingTable
                columns={['Fecha', 'Motivo', 'Valor', 'Estado', 'Acciones']}
                rows={data.courtesies.map((courtesy) => {
                  const status = COURTESY_STATUSES[courtesy.status];
                  return {
                    id: courtesy.id,
                    cells: [
                      formatBillingDate(courtesy.createdAt),
                      <div className="space-y-0.5">
                        <p>{COURTESY_REASONS[courtesy.reasonCode]}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {COURTESY_APPLICATIONS[courtesy.application]}
                        </p>
                        {courtesy.note ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {courtesy.note}
                          </p>
                        ) : null}
                      </div>,
                      `−${formatBillingMoneyExact(courtesy.amount)}`,
                      <div className="space-y-0.5">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {courtesy.voidReasonCode ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {COURTESY_VOID_REASONS[courtesy.voidReasonCode]}
                          </p>
                        ) : null}
                      </div>,
                      canCourtesy && courtesyVoidable(courtesy, data) ? (
                        <Button
                          className="min-h-11"
                          type="button"
                          variant="ghost"
                          onClick={() => setVoiding(courtesy)}
                        >
                          Anular cortesía
                        </Button>
                      ) : (
                        '—'
                      ),
                    ],
                  };
                })}
              />
            </section>
          ) : null}
        </div>
      ) : null}
      {granting && data ? (
        <BillingCourtesyDialog
          documentId={data.id}
          onClose={() => setGranting(false)}
          onSaved={() => {
            setGranting(false);
            changed();
          }}
        />
      ) : null}
      {voiding ? (
        <BillingConfirmation
          key={voiding.id}
          title="Anular cortesía"
          description={`El valor de ${formatBillingMoneyExact(voiding.amount)} vuelve al saldo del documento.`}
          confirm="Confirmar anulación"
          reasons={COURTESY_VOID_REASONS}
          onClose={() => setVoiding(undefined)}
          onConfirm={async (key, reasonCode, note) => {
            await billingApi.voidCourtesy(
              voiding.id,
              VoidCourtesyCommandSchema.parse({
                reasonCode,
                ...(note.trim() ? { note: note.trim() } : {}),
              }),
              key,
            );
            changed();
          }}
        />
      ) : null}
    </PortalSidePeek>
  );
}

/** La línea de cortesía de un borrador ya emitido no se anula (R5); el ajuste sí. */
function courtesyVoidable(
  courtesy: BillingCourtesyResponse,
  document: BillingDocumentResponse,
): boolean {
  if (courtesy.status !== 'ACTIVA' || document.status === 'ANULADO') return false;
  return courtesy.application === 'AJUSTE_SOBRE_EMITIDO' || document.status === 'BORRADOR';
}

/** Total del documento y, si la tiene, la cortesía activa que ya bajó su saldo. */
export function DocumentTotalCell({
  document,
}: {
  document: { total: string; courtesyAmount?: string | undefined };
}) {
  const courtesy = documentCourtesyAmount(document);
  if (!courtesy) return <>{formatBillingMoney(document.total)}</>;
  return (
    <div className="space-y-0.5">
      <p>{formatBillingMoney(document.total)}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Cortesía −{formatBillingMoney(courtesy)}
      </p>
    </div>
  );
}
