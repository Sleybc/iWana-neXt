'use client';

import { Badge, Button, OperationalSidePeek } from '@iwana/ui';
import type { ExecutionOrderItemAction, ExecutionOrderResult } from '@iwana/shared';
import { ExecutionOrderStatus, InventoryDisposition } from '@iwana/shared';
import type {
  ExecutionOrderActivityRecord,
  ExecutionOrderItemUsageRecord,
  ExecutionOrderRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { ExecutionOrderSummary } from './ExecutionOrderSummary';
import { ExecutionOrderCloseStep } from './ExecutionOrderCloseStep';
import { ExecutionOrderFieldWorkStep } from './ExecutionOrderFieldWorkStep';
import { ExecutionOrderInventoryStep } from './ExecutionOrderInventoryStep';

type EvidenceState = 'available' | 'pending' | 'rejected' | 'expired' | 'unavailable' | 'error';

interface ExecutionOrderDrawerProps {
  open: boolean;
  order: ExecutionOrderRecord | null;
  activities: ExecutionOrderActivityRecord[];
  itemUsage: ExecutionOrderItemUsageRecord[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  evidenceState?: EvidenceState;
  followUpState?: 'accepted' | 'pending' | 'rejected' | 'unavailable';
  onClose: () => void;
  onStart: (notes?: string | null) => Promise<void>;
  onRegisterFieldWork: (payload: { activityType: string; description: string }) => Promise<void>;
  onRegisterItemUsage: (payload: {
    itemId: string;
    technicianCustodyId: string;
    quantity: number;
    serialNumber?: string | null;
    action: ExecutionOrderItemAction;
    finalDisposition: InventoryDisposition;
  }) => Promise<void>;
  onCloseOrder: (payload: {
    result: ExecutionOrderResult;
    closeNotes?: string | null;
    customerSignatureRef?: string | null;
  }) => Promise<void>;
}

const TERMINAL_STATUSES = new Set<ExecutionOrderStatus>([
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
]);

function actionAllowed(order: ExecutionOrderRecord, action: string): boolean {
  const candidate = order as ExecutionOrderRecord & { allowedActions?: readonly string[] };
  return candidate.allowedActions?.includes(action) === true;
}

function evidenceCopy(state: EvidenceState): string {
  switch (state) {
    case 'available':
      return 'Evidencia disponible para consulta.';
    case 'pending':
      return 'La evidencia está siendo analizada. No la uses como confirmación todavía.';
    case 'rejected':
      return 'La evidencia fue rechazada; solicita una nueva captura.';
    case 'expired':
      return 'La evidencia ya no está disponible.';
    case 'error':
      return 'No pudimos consultar la evidencia. Intenta de nuevo más tarde.';
    default:
      return 'La evidencia no está disponible para esta orden.';
  }
}

export function ExecutionOrderDrawer({
  open,
  order,
  activities,
  itemUsage,
  isLoading,
  isSubmitting,
  error,
  evidenceState = 'unavailable',
  followUpState = 'unavailable',
  onClose,
  onStart,
  onRegisterFieldWork,
  onRegisterItemUsage,
  onCloseOrder,
}: ExecutionOrderDrawerProps) {
  const terminal = order ? TERMINAL_STATUSES.has(order.status) : false;
  const canStart = order ? actionAllowed(order, 'START') : false;
  const canRegisterActivity = order ? actionAllowed(order, 'REGISTER_ACTIVITY') : false;
  const canRegisterItems = order ? actionAllowed(order, 'REGISTER_ITEM_USAGE') : false;
  const canClose = order ? actionAllowed(order, 'CLOSE') : false;
  const requiresCustomerSignature = itemUsage.some(
    (usage) => usage.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER,
  );

  return (
    <OperationalSidePeek
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={order?.executionOrderNumber ?? 'OT de ejecución'}
      description="Espacio de ejecución de la orden de trabajo"
      size="wide"
      busy={isSubmitting}
    >
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Cargando orden de trabajo">
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
        </div>
      ) : !order ? (
        error ? (
          <PortalAlert variant="error" title="No fue posible cargar la OT" description={error} />
        ) : (
          <PortalEmptyState
            title="Sin OT seleccionada"
            description="Abre una orden de trabajo desde Agenda u Operaciones."
          />
        )
      ) : (
        <div className="space-y-5">
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible completar la operación"
              description={error}
            />
          ) : null}
          <ExecutionOrderSummary order={order} readonly={terminal} canOpen={false} />

          <section
            aria-labelledby="execution-commitment"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="execution-commitment"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Compromiso
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{order.workSummary}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {order.workInstructions || 'Sin instrucciones adicionales.'}
            </p>
            {canStart && !terminal ? (
              <Button
                type="button"
                className="mt-3"
                disabled={isSubmitting}
                loading={isSubmitting}
                onClick={() => void onStart('Inicio de ejecución en campo')}
              >
                Iniciar ejecución
              </Button>
            ) : null}
          </section>

          <section
            aria-labelledby="execution-checklist"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="execution-checklist"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Checklist de instalación
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Revisa los requisitos de la plantilla aplicada antes de cerrar.
            </p>
            <Badge className="mt-3" variant={terminal ? 'success' : 'neutral'}>
              {terminal ? 'Requisitos revisados' : 'Requisitos pendientes de registrar'}
            </Badge>
          </section>

          {!terminal && canRegisterActivity ? (
            <ExecutionOrderFieldWorkStep disabled={isSubmitting} onSubmit={onRegisterFieldWork} />
          ) : (
            <ReadonlyActivityBlock activities={activities} />
          )}
          {!terminal && canRegisterItems ? (
            <ExecutionOrderInventoryStep disabled={isSubmitting} onSubmit={onRegisterItemUsage} />
          ) : (
            <ReadonlyMaterialsBlock itemUsage={itemUsage} />
          )}

          <section
            aria-labelledby="execution-evidence"
            className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
          >
            <h3
              id="execution-evidence"
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              Evidencias y conformidad
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {evidenceCopy(evidenceState)}
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              La captura y firma se gestionan mediante el servicio seguro de evidencias.
            </p>
          </section>

          {!terminal && canClose ? (
            <ExecutionOrderCloseStep
              disabled={isSubmitting}
              requiresCustomerSignature={requiresCustomerSignature}
              onSubmit={onCloseOrder}
            />
          ) : (
            <ReadonlyCloseBlock order={order} followUpState={followUpState} />
          )}
        </div>
      )}
    </OperationalSidePeek>
  );
}

function ReadonlyActivityBlock({ activities }: { activities: ExecutionOrderActivityRecord[] }) {
  return (
    <section
      aria-labelledby="execution-work-readonly"
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
    >
      <h3
        id="execution-work-readonly"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Trabajo realizado
      </h3>
      <div className="mt-3 space-y-2">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Aún no hay actividades registradas.
          </p>
        ) : (
          activities.map((activity) => (
            <article
              key={activity.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
            >
              <p className="text-xs text-gray-500">Actividad registrada</p>
              <p className="text-sm text-gray-900 dark:text-white">{activity.description}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ReadonlyMaterialsBlock({ itemUsage }: { itemUsage: ExecutionOrderItemUsageRecord[] }) {
  return (
    <section
      aria-labelledby="execution-materials-readonly"
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
    >
      <h3
        id="execution-materials-readonly"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Equipos y materiales
      </h3>
      <div className="mt-3 space-y-2">
        {itemUsage.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Aún no hay consumos registrados.
          </p>
        ) : (
          itemUsage.map((usage) => (
            <article
              key={usage.id}
              className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
            >
              <p className="text-sm text-gray-900 dark:text-white">
                Material registrado · {usage.quantity}
              </p>
              <p className="text-xs text-gray-500">
                Destino: material aplicado o devuelto según acta
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ReadonlyCloseBlock({
  order,
  followUpState,
}: {
  order: ExecutionOrderRecord;
  followUpState: string;
}) {
  return (
    <section
      aria-labelledby="execution-close-readonly"
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
    >
      <h3
        id="execution-close-readonly"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Cierre técnico
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {order.closeNotes || 'La OT está cerrada y solo puede consultarse.'}
      </p>
      {followUpState !== 'unavailable' ? (
        <p className="mt-2 text-xs text-gray-500">
          Seguimiento: {followUpState === 'accepted' ? 'solicitado' : 'pendiente de confirmación'}
        </p>
      ) : null}
    </section>
  );
}
