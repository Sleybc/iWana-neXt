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
import { Ban, Download, Eye, Gift, Mail } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  formatBillingDate,
  formatBillingShortDate,
} from '@/components/crm/subscribers/billing-cycle-ui';
import { PortalAlert, PortalSidePeek } from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { BillingCourtesyDialog } from './BillingCourtesyDialog';
import { BillingEmailLog, BillingEmailSendResult, useBillingEmailSend } from './BillingEmailLog';
import { BillingInstallationBreakdown } from './BillingInstallationBreakdown';
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
  documentIssueDate,
  documentReference,
  documentIssueShortDate,
  documentShortNumber,
  documentStatusBadges,
} from './billing-copy';
import { PortalRowActions, PortalRowIconButton } from '@/components/shared/portal-row-actions';
import { BillingLoadState, BillingTable, billingError, useBillingLoad } from './billing-ui';

const SELECT_COLUMN = 'Seleccionar';

export function BillingDocumentTable({
  documents,
  onChanged,
  selection,
  onSelectionChange,
  subscriberId,
}: {
  documents: BillingDocumentResponse[];
  onChanged: () => void;
  selection?: ReadonlySet<string>;
  onSelectionChange?: (documentId: string, selected: boolean) => void;
  /**
   * Ficha del suscriptor (Facturación → Facturas): habilita «Enviar por correo» y el registro de
   * envíos del detalle (spec MOD05↔MOD14 2026-11-13 D5).
   */
  subscriberId?: string;
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
  const email = useBillingEmailSend();
  // La columna de casillas solo aparece si en la página hay algún borrador que se pueda emitir:
  // en la ficha, con facturas ya emitidas, era una columna de casillas deshabilitadas.
  const showSelection =
    Boolean(selection) &&
    documents.some((document) => document.status === 'BORRADOR' && !document.blockingReason);
  const canSend = Boolean(subscriberId) && canManage;
  // D11: el registro se ve con la lectura de documentos; enviar exige la gestión.
  const canReadEmailLog =
    Boolean(subscriberId) && hasPermission(AccessPermissionKey.BILLING_INVOICES_READ);

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
      <BillingEmailSendResult outcome={email.outcome} />
      <BillingTable
        label="Facturas"
        columns={[
          ...(showSelection ? [SELECT_COLUMN] : []),
          'Número',
          ...(subscriberId ? [] : ['Cliente']),
          'Emisión',
          'Vence',
          'Total',
          'Saldo',
          'Estado',
          'Acciones',
        ]}
        srOnlyColumns={[SELECT_COLUMN]}
        alignEnd={['Total', 'Saldo']}
        rows={documents.map((document) => {
          const shortNumber = documentShortNumber(document);
          const blocking = document.blockingReason
            ? BLOCKING_REASONS[document.blockingReason]
            : null;
          const canIssue = document.status === 'BORRADOR' && !blocking;
          return {
            id: document.id,
            cells: [
              ...(showSelection && selection
                ? [
                    <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                      <input
                        aria-label={`Seleccionar factura ${documentReference(document)}`}
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
              shortNumber && shortNumber === documentReference(document) ? (
                <span className="font-mono">{shortNumber}</span>
              ) : shortNumber ? (
                // Se ve corto («DC-2»); el lector de pantalla y la búsqueda leen el número oficial.
                <span title={documentReference(document)}>
                  <span aria-hidden="true" className="font-mono">
                    {shortNumber}
                  </span>
                  <span className="sr-only">{documentReference(document)}</span>
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Sin número</span>
              ),
              ...(subscriberId
                ? []
                : [
                    document.buyerProtected
                      ? PROTECTED_LABEL
                      : (document.buyerSnapshot?.displayName ?? 'No disponible'),
                  ]),
              documentIssueShortDate(document),
              formatBillingShortDate(document.dueDate),
              <DocumentTotalCell document={document} />,
              document.pendingAmount == null ? '—' : formatBillingMoney(document.pendingAmount),
              <div className="flex flex-wrap items-center gap-1">
                {documentStatusBadges(document).map((badge) => (
                  <Badge key={badge.label} variant={badge.variant}>
                    {badge.label}
                  </Badge>
                ))}
                {blocking ? <Badge variant="warning">{blocking}</Badge> : null}
              </div>,
              <DocumentRowActions
                reference={documentReference(document)}
                onDetail={() => setDetail(document.id)}
                {...(canManage && document.status === 'BORRADOR'
                  ? {
                      issue: {
                        disabledReason: canIssue ? null : blocking,
                        run: () => setAction({ kind: 'issue', document }),
                      },
                    }
                  : {})}
                {...(document.status === 'EMITIDO' || document.status === 'IMPORTADO'
                  ? {
                      download: {
                        busy: downloading === document.id,
                        disabled: downloading !== null,
                        run: () => void download(document),
                      },
                    }
                  : {})}
                {...(canSend && document.status === 'EMITIDO'
                  ? {
                      sendEmail: {
                        busy: email.busy === document.id,
                        disabled: email.busy !== null,
                        run: () =>
                          void email.send(document.id, () =>
                            billingApi.sendDocumentEmail(document.id),
                          ),
                      },
                    }
                  : {})}
                {...(canCourtesy && canReceiveCourtesy(document)
                  ? { courtesy: () => setCourtesyFor(document.id) }
                  : {})}
                {...(canManage && document.status === 'EMITIDO'
                  ? { voidDocument: () => setAction({ kind: 'void', document }) }
                  : {})}
              />,
            ],
          };
        })}
      />
      {detail ? (
        <BillingDocumentDetail
          id={detail}
          canCourtesy={canCourtesy}
          canSend={canSend}
          canReadEmailLog={canReadEmailLog}
          emailRevision={email.sent}
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
              ? 'Emitir factura'
              : `Anular factura ${action.document.number ?? ''}`
          }
          description={
            action.kind === 'issue'
              ? `Se asignará un número consecutivo definitivo a la factura de ${formatBillingMoney(action.document.total)}.`
              : 'El número consecutivo quedará en el historial contable. Cualquier pago aplicado volverá al saldo a favor del cliente.'
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
  canSend,
  canReadEmailLog,
  emailRevision,
  onChanged,
  onClose,
}: {
  id: string;
  canCourtesy: boolean;
  /** Solo en la ficha: envío por correo y registro de envíos del documento. */
  canSend: boolean;
  /** Solo en la ficha y con lectura de documentos: registro de envíos del documento. */
  canReadEmailLog: boolean;
  emailRevision: number;
  onChanged: () => void;
  onClose: () => void;
}) {
  const load = useCallback(() => billingApi.document(id), [id]);
  const { data, error, loading, reload } = useBillingLoad(load);
  const [granting, setGranting] = useState(false);
  const [voiding, setVoiding] = useState<BillingCourtesyResponse>();
  const email = useBillingEmailSend();
  const buyer = data?.buyerProtected ? null : data?.buyerSnapshot;
  function changed() {
    reload();
    onChanged();
  }
  return (
    <PortalSidePeek open onClose={onClose} title={data?.number ?? 'Factura'}>
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
              <dt className="font-medium">Cliente</dt>
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
              <dt className="font-medium">Fecha de emisión</dt>
              <dd>{documentIssueDate(data)}</dd>
            </div>
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
          {canSend && data.status === 'EMITIDO' ? (
            <div className="space-y-2">
              <Button
                className="min-h-11"
                type="button"
                variant="secondary"
                disabled={email.busy !== null}
                loading={email.busy === data.id}
                onClick={() =>
                  void email.send(data.id, () => billingApi.sendDocumentEmail(data.id))
                }
              >
                Enviar por correo
              </Button>
              <BillingEmailSendResult outcome={email.outcome} />
            </div>
          ) : null}
          {data.lines?.length ? (
            <BillingTable
              paginate
              label="Conceptos de la factura"
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
          {data.installationBreakdown ? (
            <BillingInstallationBreakdown breakdown={data.installationBreakdown} />
          ) : null}
          {data.courtesies?.length ? (
            <section aria-labelledby={`courtesies-${data.id}`} className="space-y-2">
              <h3 id={`courtesies-${data.id}`} className="text-sm font-semibold">
                Cortesías
              </h3>
              <BillingTable
                paginate
                label="Cortesías de la factura"
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
          {canReadEmailLog && (data.status === 'EMITIDO' || data.status === 'ANULADO') ? (
            <BillingEmailLog
              subscriberId={data.subscriberId}
              target={{ kind: 'FACTURA', documentId: data.id }}
              revision={emailRevision + email.sent}
            />
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
          description={`El valor de ${formatBillingMoneyExact(voiding.amount)} vuelve al saldo de la factura.`}
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

type RowAction = { busy: boolean; disabled: boolean; run: () => void };

/**
 * Acciones de la fila de una factura (`PortalRowActions`). «Emitir» conserva su texto porque es la
 * acción principal de un borrador; anular lleva el tono de peligro.
 */
function DocumentRowActions({
  reference,
  onDetail,
  issue,
  download,
  sendEmail,
  courtesy,
  voidDocument,
}: {
  reference: string;
  onDetail: () => void;
  issue?: { disabledReason: string | null; run: () => void };
  download?: RowAction;
  sendEmail?: RowAction;
  courtesy?: () => void;
  voidDocument?: () => void;
}) {
  return (
    <PortalRowActions>
      {issue ? (
        <Button
          className="min-h-11"
          type="button"
          variant="secondary"
          size="sm"
          disabled={issue.disabledReason !== null}
          title={issue.disabledReason ?? undefined}
          onClick={issue.run}
        >
          Emitir
        </Button>
      ) : null}
      <PortalRowIconButton
        label={`Ver detalle de la factura ${reference}`}
        hint="Ver detalle"
        onClick={onDetail}
      >
        <Eye className="h-4 w-4" aria-hidden />
      </PortalRowIconButton>
      {download ? (
        <PortalRowIconButton
          label={`Descargar PDF de la factura ${reference}`}
          hint="Descargar PDF"
          disabled={download.disabled}
          busy={download.busy}
          onClick={download.run}
        >
          <Download className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
      {sendEmail ? (
        <PortalRowIconButton
          label={`Enviar por correo la factura ${reference}`}
          hint="Enviar por correo"
          disabled={sendEmail.disabled}
          busy={sendEmail.busy}
          onClick={sendEmail.run}
        >
          <Mail className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
      {courtesy ? (
        <PortalRowIconButton
          label={`Otorgar cortesía en la factura ${reference}`}
          hint="Otorgar cortesía"
          onClick={courtesy}
        >
          <Gift className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
      {voidDocument ? (
        <PortalRowIconButton
          label={`Anular la factura ${reference}`}
          hint="Anular factura"
          tone="danger"
          onClick={voidDocument}
        >
          <Ban className="h-4 w-4" aria-hidden />
        </PortalRowIconButton>
      ) : null}
    </PortalRowActions>
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
