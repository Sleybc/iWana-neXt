'use client';

import type { ExecutionOrderAllowedAction } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import {
  START_ALERT_TITLE,
  commitmentContextOf,
  getBlockedCopy,
  getPreStartHelp,
  getStartAlertDescription,
  shouldRenderStartAlert,
} from './execution-order-commitment-copy';
import { canInteract, getExecutionOrderMoment } from './execution-order-moment';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_STATUS_VARIANTS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';

// B0 — bloque «Compromiso»: estado operativo y acción de inicio, con el copy por
// lente de OLA 1 (derivado solo de `allowedActions`) y, en bloqueada, el copy sin
// motivo de UX §5 (adenda A1). Sin decisión de permisos en el cliente.

export interface ExecutionOrderCommitmentSectionProps {
  order: ExecutionOrderDetailResponse;
  isSubmitting: boolean;
  offline: boolean;
  onStart: (notes?: string | null) => Promise<void>;
  /** Solo condiciona la leyenda de bloqueo; el desbloqueo no tiene ruta utilizable. */
  onBlock?: ((payload: { reasonCode: string; note?: string }) => Promise<void>) | undefined;
}

export function ExecutionOrderCommitmentSection({
  order,
  isSubmitting,
  offline,
  onStart,
  onBlock,
}: ExecutionOrderCommitmentSectionProps) {
  const moment = getExecutionOrderMoment(order.status);
  const interactive = canInteract(order, offline);
  const allowed = (action: ExecutionOrderAllowedAction) =>
    order.allowedActions?.includes(action) === true;
  const canStart = allowed('START');
  const context = commitmentContextOf(order);
  const showStartAlert = interactive && shouldRenderStartAlert(context);
  const preStartHelp = moment === 'pre-start' ? getPreStartHelp(context) : null;
  const blockedCopy = moment === 'blocked' ? getBlockedCopy(context) : null;

  return (
    <>
      <section
        aria-labelledby="eo-commitment-heading"
        className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2"
      >
        {/* Cabecera compacta (bloque A): título y estado operativo en una sola fila. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <h3
            id="eo-commitment-heading"
            className="mr-auto text-sm font-semibold text-gray-900 dark:text-white"
          >
            Compromiso
          </h3>
          <div className="flex items-center gap-2">
            <p className="portal-eyebrow-muted">Tipo de trabajo</p>
            <p className="text-sm text-gray-700 dark:text-gray-200">
              {EXECUTION_ORDER_WORK_TYPE_LABELS[order.workType] ?? 'Trabajo operativo'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <p className="portal-eyebrow-muted">Estado</p>
            <Badge variant={EXECUTION_ORDER_STATUS_VARIANTS[order.status]}>
              {EXECUTION_ORDER_STATUS_LABELS[order.status] ?? 'Estado operativo'}
            </Badge>
          </div>
          {order.result && (
            <div className="flex items-center gap-2">
              <p className="portal-eyebrow-muted">Resultado</p>
              <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[order.result]}>
                {EXECUTION_ORDER_RESULT_LABELS[order.result] ?? 'Resultado registrado'}
              </Badge>
            </div>
          )}
        </div>
        {blockedCopy ? (
          <PortalAlert
            variant="info"
            className="mt-4"
            title={blockedCopy.title}
            description={blockedCopy.description}
          />
        ) : null}
        {interactive && canStart ? (
          <>
            <Button
              type="button"
              className="mt-4"
              disabled={isSubmitting}
              loading={isSubmitting}
              onClick={() => void onStart('Inicio de ejecución en campo')}
            >
              Iniciar ejecución
            </Button>
            {preStartHelp ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{preStartHelp}</p>
            ) : null}
          </>
        ) : showStartAlert ? (
          <PortalAlert
            variant="info"
            className="mt-4"
            title={START_ALERT_TITLE}
            description={getStartAlertDescription(order.assignee != null)}
          />
        ) : interactive && preStartHelp ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{preStartHelp}</p>
        ) : null}
        {/* Adenda A1: si UNBLOCK está ofrecido pero no hay catálogo ni ruta, se declara tal cual. */}
        {allowed('UNBLOCK') && !offline && (
          <div className="mt-4 space-y-3">
            <PortalAlert
              variant="warning"
              title="Desbloqueo no disponible"
              description="Esta acción todavía no dispone de una ruta utilizable."
            />
          </div>
        )}
        {interactive && allowed('BLOCK') && onBlock && (
          <div className="mt-4 space-y-3">
            <PortalAlert
              variant="warning"
              title="Bloqueo no disponible"
              description="Esta acción todavía no dispone de una ruta utilizable."
            />
          </div>
        )}
      </section>

      {moment === 'pre-start' && canStart && (
        <PortalAlert
          variant="info"
          title="Inicia la ejecución para habilitar el checklist"
          description="Aquí consultarás los requisitos; el registro queda bloqueado hasta el inicio. Pulsa Iniciar ejecución en Compromiso para comenzar."
        />
      )}
    </>
  );
}
