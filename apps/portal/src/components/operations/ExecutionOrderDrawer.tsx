'use client';

import { Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from '@iwana/ui';
import type { ExecutionOrderItemAction, ExecutionOrderResult } from '@iwana/shared';
import { ExecutionOrderStatus, InventoryDisposition } from '@iwana/shared';
import type {
  ExecutionOrderActivityRecord,
  ExecutionOrderItemUsageRecord,
  ExecutionOrderRecord,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState } from '@/components/shared/portal-ui';
import { ExecutionOrderCloseStep } from './ExecutionOrderCloseStep';
import { ExecutionOrderFieldWorkStep } from './ExecutionOrderFieldWorkStep';
import { ExecutionOrderInventoryStep } from './ExecutionOrderInventoryStep';

const STATUS_LABELS: Record<ExecutionOrderStatus, string> = {
  CREATED: 'Creada',
  ASSIGNED: 'Asignada',
  EN_ROUTE: 'En ruta',
  IN_PROGRESS: 'En progreso',
  BLOCKED: 'Bloqueada',
  COMPLETED: 'Completada',
  COMPLETED_WITH_OBSERVATIONS: 'Completada con observaciones',
  NOT_EXECUTED: 'No ejecutada',
  CANCELLED: 'Cancelada',
};

interface ExecutionOrderDrawerProps {
  open: boolean;
  order: ExecutionOrderRecord | null;
  activities: ExecutionOrderActivityRecord[];
  itemUsage: ExecutionOrderItemUsageRecord[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
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

export function ExecutionOrderDrawer({
  open,
  order,
  activities,
  itemUsage,
  isLoading,
  isSubmitting,
  error,
  onClose,
  onStart,
  onRegisterFieldWork,
  onRegisterItemUsage,
  onCloseOrder,
}: ExecutionOrderDrawerProps) {
  const requiresCustomerSignature = itemUsage.some(
    (usage) => usage.finalDisposition === InventoryDisposition.INSTALLED_AT_CUSTOMER,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{order?.executionOrderNumber ?? 'OT de ejecución'}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Cargando orden de trabajo...</p>
        ) : !order ? (
          error ? (
            <PortalAlert variant="error" title="No fue posible cargar la OT" description={error} />
          ) : (
            <PortalEmptyState
              title="Sin OT seleccionada"
              description="Abre una orden de trabajo desde Programación u Operaciones."
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{order.executionOrderNumber}</Badge>
              <Badge variant="info">{order.workType}</Badge>
              <Badge variant="warning">{STATUS_LABELS[order.status]}</Badge>
              {order.result ? <Badge variant="success">{order.result}</Badge> : null}
            </div>

            <section className="grid gap-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Cliente y sitio
                </p>
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  {order.customerDisplayLabel}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {[order.serviceAddress, order.sector, order.municipality]
                    .filter(Boolean)
                    .join(' · ') || 'Ubicación no disponible'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  Trabajo comprometido
                </p>
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  {order.workSummary}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {order.workInstructions || 'Sin instrucciones adicionales.'}
                </p>
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-iwana-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={isSubmitting}
                onClick={() => void onStart('Inicio de ejecución en campo')}
              >
                Iniciar ejecución
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-4">
                <ExecutionOrderFieldWorkStep
                  disabled={isSubmitting}
                  onSubmit={onRegisterFieldWork}
                />
                <ExecutionOrderInventoryStep
                  disabled={isSubmitting}
                  onSubmit={onRegisterItemUsage}
                />
                <ExecutionOrderCloseStep
                  disabled={isSubmitting}
                  requiresCustomerSignature={requiresCustomerSignature}
                  onSubmit={onCloseOrder}
                />
              </div>

              <div className="space-y-4">
                <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Bitácora de campo
                  </p>
                  <div className="mt-3 space-y-3">
                    {activities.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Aún no hay actividades registradas.
                      </p>
                    ) : (
                      activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                            {activity.activityType}
                          </p>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">
                            {activity.description}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {activity.createdAt}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Materiales y equipos usados
                  </p>
                  <div className="mt-3 space-y-3">
                    {itemUsage.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Aún no hay consumos registrados.
                      </p>
                    ) : (
                      itemUsage.map((usage) => (
                        <div
                          key={usage.id}
                          className="rounded-xl border border-gray-200 p-3 dark:border-dark-border"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {usage.itemId} · {usage.quantity}
                          </p>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            Custodia: {usage.technicianCustodyId}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {usage.action} · {usage.finalDisposition}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
