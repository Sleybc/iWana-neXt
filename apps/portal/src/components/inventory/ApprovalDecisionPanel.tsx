'use client';

import { PurchaseRequestStatus } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  getApprovalLevelLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import { QuoteComparisonPanel } from './QuoteComparisonPanel';

interface ApprovalDecisionPanelProps {
  detail: PurchaseRequestDetailRecord;
  exceptionReason: string;
  onExceptionReasonChange: (value: string) => void;
  approvalNotes: string;
  onApprovalNotesChange: (value: string) => void;
  approveError?: string | null;
  canApproveNow: boolean;
  supplierLabels?: Record<string, string>;
}

function isTerminalStatus(status: PurchaseRequestStatus): boolean {
  return [
    PurchaseRequestStatus.APPROVED,
    PurchaseRequestStatus.REJECTED,
    PurchaseRequestStatus.CANCELLED,
    PurchaseRequestStatus.CONVERTED_TO_PO,
  ].includes(status);
}

export function ApprovalDecisionPanel({
  detail,
  exceptionReason,
  onExceptionReasonChange,
  approvalNotes,
  onApprovalNotesChange,
  approveError,
  canApproveNow,
  supplierLabels,
}: ApprovalDecisionPanelProps) {
  const { request, approvalPolicy, quotes, estimatedAmount } = detail;
  const terminal = isTerminalStatus(request.status);

  return (
    <div className="space-y-4">
      <PortalSectionHeader eyebrow="Aprobación" title="Autorizar solicitud" />

      {approveError ? (
        <PortalAlert variant="error" title="No se pudo aprobar" description={approveError} />
      ) : null}

      {terminal ? (
        <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {getPurchaseRequestStatusLabel(request.status)}
          </p>
          {request.approvedByUserId ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">Autorizada.</p>
          ) : null}
          {request.exceptionReason ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Excepción: {request.exceptionReason}
            </p>
          ) : null}
          {request.resolutionReason ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Motivo: {request.resolutionReason}
            </p>
          ) : null}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Monto estimado (con envío)</dt>
              <dd className="mt-1 font-medium tabular-nums text-gray-900 dark:text-white">
                {formatInventoryCurrency(estimatedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Quién debe autorizar</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {getApprovalLevelLabel(approvalPolicy.approvalLevel)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {!terminal && !canApproveNow ? (
        <PortalEmptyState
          title="Aún no puedes aprobar"
          description={
            approvalPolicy.blockingReason ??
            'Completa los requisitos pendientes (por ejemplo, registrar una cotización) y vuelve a esta pestaña.'
          }
        />
      ) : null}

      {!terminal && canApproveNow ? (
        <>
          <dl className="grid gap-3 rounded-2xl border border-gray-200 p-4 text-sm dark:border-dark-border sm:grid-cols-2">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Tipo</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {getPurchaseRequestTypeLabel(request.requestType)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Monto estimado (con envío)</dt>
              <dd className="mt-1 font-medium tabular-nums text-gray-900 dark:text-white">
                {formatInventoryCurrency(estimatedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Quién debe autorizar</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {getApprovalLevelLabel(approvalPolicy.approvalLevel)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Estado de autorización</dt>
              <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                {approvalPolicy.canApprove
                  ? 'Lista para autorizar'
                  : (approvalPolicy.blockingReason ?? 'Pendiente de requisitos')}
              </dd>
            </div>
          </dl>

          {approvalPolicy.requiresException ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-gray-900 dark:text-white">Motivo de excepción</span>
              <textarea
                aria-label="Motivo de excepción"
                className={portalTextareaClassName}
                rows={3}
                placeholder="Explica por qué apruebas fuera de la regla habitual"
                value={exceptionReason}
                onChange={(e) => onExceptionReasonChange(e.target.value)}
              />
            </label>
          ) : null}

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-gray-900 dark:text-white">Notas de aprobación</span>
            <textarea
              aria-label="Notas de aprobación"
              className={portalTextareaClassName}
              rows={2}
              placeholder="Opcional: contexto de la autorización"
              value={approvalNotes}
              onChange={(e) => onApprovalNotesChange(e.target.value)}
            />
          </label>

          <section className="space-y-2">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              Cotizaciones de referencia
            </h3>
            <QuoteComparisonPanel quotes={quotes} {...(supplierLabels ? { supplierLabels } : {})} />
          </section>
        </>
      ) : null}

      {terminal && quotes.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Cotizaciones registradas
          </h3>
          <QuoteComparisonPanel quotes={quotes} {...(supplierLabels ? { supplierLabels } : {})} />
        </section>
      ) : null}
    </div>
  );
}
