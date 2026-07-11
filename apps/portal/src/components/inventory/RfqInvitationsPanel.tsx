'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Input } from '@iwana/ui';
import {
  PurchaseRfqInvitationStatus,
  PurchaseRfqStatus,
  PurchaseRequestStatus,
} from '@iwana/shared';
import type {
  CreateRfqDto,
  PurchaseRfqDetailRecord,
  PurchaseRfqInvitationRecord,
} from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  getPurchaseRfqInvitationStatusBadgeVariant,
  getPurchaseRfqInvitationStatusLabel,
  getPurchaseRfqStatusLabel,
} from './inventory-labels';
import { SupplierMultiPicker, type SupplierMultiSelection } from './SupplierMultiPicker';

interface RfqInvitationsPanelProps {
  purchaseRequestId: string;
  requestStatus: PurchaseRequestStatus;
  rfqDetail: PurchaseRfqDetailRecord | null;
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

export function RfqInvitationsPanel({
  purchaseRequestId,
  requestStatus,
  rfqDetail,
  disabled = false,
  onRefresh,
}: RfqInvitationsPanelProps) {
  const [selectedSuppliers, setSelectedSuppliers] = useState<SupplierMultiSelection[]>([]);
  const [responseDeadline, setResponseDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rfq = rfqDetail?.rfq ?? null;
  const invitations = rfqDetail?.invitations ?? [];
  const rfqStatus = rfq?.status as PurchaseRfqStatus | undefined;

  const canStartRfq = !rfq && requestStatus === PurchaseRequestStatus.DRAFT;
  const panelDisabled = disabled || isBusy;

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
      currency: 'COP',
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

    await runAction(async () => {
      await purchasingApi.declineInvitation(rfq.id, invitation.id, {
        declineReason: 'Proveedor no disponible para esta ronda.',
      });
    }, 'Declinación registrada.');
  }

  async function handleDownloadPdf() {
    if (!rfq) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const { blob, filename } = await purchasingApi.downloadRfqPdf(rfq.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No fue posible descargar el PDF.');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PortalSectionHeader
        eyebrow="Cotización"
        title="Solicitud de cotización (RFQ)"
        description="Invita proveedores, envía la ronda y haz seguimiento de respuestas."
      />

      {error ? <PortalAlert variant="error" title="RFQ" description={error} /> : null}
      {success ? <PortalAlert variant="success" title="RFQ" description={success} /> : null}

      {canStartRfq ? (
        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Crea una ronda formal de cotización antes de registrar respuestas de proveedores.
          </p>
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={panelDisabled}
              onClick={() => void handleDownloadPdf()}
            >
              Descargar PDF
            </Button>
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
              description="Invita al menos un proveedor antes de enviar la solicitud."
            />
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => {
                const invitationStatus = invitation.status as PurchaseRfqInvitationStatus;
                return (
                  <div
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-sm dark:border-dark-border"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Proveedor invitado
                      </p>
                      <p className="text-xs text-gray-500">
                        Invitado: {formatInventoryDate(invitation.invitedAt?.slice(0, 10) ?? null)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getPurchaseRfqInvitationStatusBadgeVariant(invitationStatus)}>
                        {getPurchaseRfqInvitationStatusLabel(invitationStatus)}
                      </Badge>
                      {invitationStatus === PurchaseRfqInvitationStatus.INVITED ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={panelDisabled}
                          onClick={() => void handleDecline(invitation)}
                        >
                          Declinar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : !canStartRfq ? (
        <PortalEmptyState
          title="Sin ronda activa"
          description="No hay una solicitud de cotización activa para esta compra."
        />
      ) : null}
    </div>
  );
}
