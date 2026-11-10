import {
  LIFECYCLE_REASON_CODES_BY_ACTION,
  SUBSCRIBER_CANCELLATION_REASON_CODES,
  type LifecycleAction,
  type LifecyclePreviewRequest,
} from '@iwana/shared';
import type { Contract } from '@/lib/api-client';

export const LIFECYCLE_REASON_LABELS: Record<string, string> = {
  MORA: 'Mora en el pago',
  SOLICITUD_TITULAR: 'Solicitud del titular',
  USO_INDEBIDO: 'Uso indebido del servicio',
  ORDEN_AUTORIDAD: 'Orden de autoridad',
  FALLA_TECNICA_PROLONGADA: 'Falla técnica prolongada',
  PAGO_REGISTRADO: 'Pago registrado',
  FIN_SUSPENSION_SOLICITADA: 'Fin de la suspensión solicitada',
  CORRECCION_OPERATIVA: 'Corrección operativa',
  LEVANTAMIENTO_ORDEN: 'Levantamiento de orden',
  MORA_PROLONGADA: 'Mora prolongada',
  TRASLADO_SIN_COBERTURA: 'Traslado sin cobertura',
  DUPLICADO: 'Servicio duplicado',
};

export function lifecycleReasonOptions(action: LifecycleAction) {
  const actionKey: keyof typeof LIFECYCLE_REASON_CODES_BY_ACTION =
    action === 'SUSPEND' ? 'suspend' : action === 'REACTIVATE' ? 'reactivate' : 'terminate';
  const codes = LIFECYCLE_REASON_CODES_BY_ACTION[actionKey];
  return codes.map((value) => ({ value, label: LIFECYCLE_REASON_LABELS[value] ?? 'Otro motivo' }));
}

export type LifecycleReasonCode = LifecyclePreviewRequest['reasonCode'];

export function cancellationReasonOptions() {
  return SUBSCRIBER_CANCELLATION_REASON_CODES.map((value) => ({
    value,
    label: LIFECYCLE_REASON_LABELS[value] ?? 'Otro motivo',
  }));
}

export function lifecycleReasonLabel(reasonCode: string | null | undefined): string {
  return reasonCode ? (LIFECYCLE_REASON_LABELS[reasonCode] ?? '—') : '—';
}

export function formatLifecycleDate(value: string | null | undefined): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(date);
}

export function contractServiceName(contract: Contract): string {
  const snapshotName = contract.planSnapshotJson.name;
  const planName = typeof snapshotName === 'string' ? snapshotName : '';
  return contract.alias.trim() || planName || 'Servicio';
}

export function isEligibleLifecycleContract(contract: Contract, action: LifecycleAction): boolean {
  if (action === 'SUSPEND') return contract.status === 'ACTIVE';
  if (action === 'REACTIVATE') return contract.status === 'SUSPENDED';
  return contract.status === 'ACTIVE' || contract.status === 'SUSPENDED';
}

/** Aviso de éxito tras suspender, reactivar o terminar servicios. */
export function lifecycleSuccessMessage(
  action: LifecycleAction,
  affectedCount: number,
): { title: string; description: string } {
  const subject = affectedCount === 1 ? 'servicio' : 'servicios';
  const verb = affectedCount === 1 ? 'suspendió' : 'suspendieron';
  const title =
    action === 'SUSPEND'
      ? 'Servicios suspendidos'
      : action === 'REACTIVATE'
        ? 'Servicios reactivados'
        : affectedCount === 1
          ? 'Servicio terminado'
          : 'Servicios terminados';
  const description =
    action === 'SUSPEND'
      ? `Se ${verb} ${affectedCount} ${subject}.`
      : action === 'REACTIVATE'
        ? affectedCount === 1
          ? 'Se reactivó 1 servicio.'
          : `Se reactivaron ${affectedCount} servicios.`
        : affectedCount === 1
          ? 'Se terminó 1 servicio.'
          : `Se terminaron ${affectedCount} servicios.`;
  return { title, description };
}
