'use client';

import {
  PurchaseRequestFulfillmentStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';

export type PurchaseKpiPreset =
  | 'pendingQuotes'
  | 'pendingApproval'
  | 'readyForPo'
  | 'pendingReceipt'
  | 'urgent'
  | 'overdue';

export interface PurchaseRequestFilters {
  requestType?: PurchaseRequestType;
  status?: PurchaseRequestStatus;
  priority?: PurchaseRequestPriority;
  search?: string;
  kpiPreset?: PurchaseKpiPreset;
}

/** Campos mínimos para razonar sobre el abastecimiento de una solicitud. */
export type PurchaseRequestFulfillmentSource = Pick<
  PurchaseRequestRecord,
  'status' | 'fulfillmentStatus'
>;

/**
 * Estado de abastecimiento efectivo de una solicitud.
 *
 * El API lo emite calculado a partir de las órdenes de compra vivas. Mientras
 * una versión del API todavía no lo envíe, se degrada al único indicio
 * disponible en el listado: el estado administrativo. `CONVERTED_TO_PO` se
 * asume `PENDING_RECEIPT` —que es exactamente el comportamiento previo— y
 * cualquier otro estado se asume `NOT_ORDERED`.
 */
export function resolvePurchaseRequestFulfillmentStatus(
  request: PurchaseRequestFulfillmentSource,
): PurchaseRequestFulfillmentStatus {
  if (request.fulfillmentStatus) {
    return request.fulfillmentStatus;
  }

  return request.status === PurchaseRequestStatus.CONVERTED_TO_PO
    ? PurchaseRequestFulfillmentStatus.PENDING_RECEIPT
    : PurchaseRequestFulfillmentStatus.NOT_ORDERED;
}

const PENDING_RECEIPT_FULFILLMENT_STATUSES: PurchaseRequestFulfillmentStatus[] = [
  PurchaseRequestFulfillmentStatus.PENDING_RECEIPT,
  PurchaseRequestFulfillmentStatus.PARTIALLY_RECEIVED,
];

/** Hay mercancía en tránsito: la solicitud sigue esperando recepción. */
export function isPurchaseRequestPendingReceipt(
  request: PurchaseRequestFulfillmentSource,
): boolean {
  return PENDING_RECEIPT_FULFILLMENT_STATUSES.includes(
    resolvePurchaseRequestFulfillmentStatus(request),
  );
}

/** La mercancía ya entró a bodega: la solicitud está cerrada por recepción. */
export function isPurchaseRequestFullyReceived(request: PurchaseRequestFulfillmentSource): boolean {
  return (
    resolvePurchaseRequestFulfillmentStatus(request) === PurchaseRequestFulfillmentStatus.RECEIVED
  );
}

export function isPurchaseRequestOverdue(request: PurchaseRequestRecord): boolean {
  if (!request.neededByDate) {
    return false;
  }

  return (
    new Date(request.neededByDate) < new Date() &&
    request.status !== PurchaseRequestStatus.CONVERTED_TO_PO &&
    request.status !== PurchaseRequestStatus.CANCELLED &&
    request.status !== PurchaseRequestStatus.REJECTED
  );
}

const PENDING_QUOTE_STATUSES: PurchaseRequestStatus[] = [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING_QUOTES,
];

export function isPendingQuoteStatus(status: PurchaseRequestStatus): boolean {
  return PENDING_QUOTE_STATUSES.includes(status);
}

export function kpiPresetToFilters(preset: PurchaseKpiPreset): PurchaseRequestFilters {
  switch (preset) {
    case 'pendingQuotes':
      // Fase 10: DRAFT + PENDING_QUOTES (KPI «Por cotizar»).
      return { kpiPreset: preset };
    case 'pendingApproval':
      return { kpiPreset: preset, status: PurchaseRequestStatus.PENDING_APPROVAL };
    case 'readyForPo':
      return { kpiPreset: preset, status: PurchaseRequestStatus.APPROVED };
    case 'pendingReceipt':
      // Por recibir se resuelve en servidor (EXISTS órdenes APPROVED/PARTIALLY_RECEIVED).
      // No fijar status=CONVERTED_TO_PO aquí: ese estado incluye solicitudes ya
      // recibidas, que el listado muestra como «Recibida y cerrada».
      return { kpiPreset: preset };
    case 'urgent':
      return { kpiPreset: preset, priority: PurchaseRequestPriority.URGENT };
    case 'overdue':
      return { kpiPreset: preset };
    default:
      return { kpiPreset: preset };
  }
}

/**
 * Primera solicitud candidata para abrir el workbench al activar un KPI operativo.
 *
 * Se elige por abastecimiento, no por estado administrativo: una solicitud
 * `CONVERTED_TO_PO` cuya mercancía ya se recibió no debe abrirse desde el KPI
 * «Por recibir».
 */
export function findFirstRequestForKpiWorkbench(
  preset: PurchaseKpiPreset,
  requests: PurchaseRequestRecord[],
): PurchaseRequestRecord | null {
  if (preset !== 'pendingReceipt') {
    return null;
  }

  return requests.find(isPurchaseRequestPendingReceipt) ?? null;
}

export function resolveActiveKpiPreset(filters: PurchaseRequestFilters): PurchaseKpiPreset | null {
  if (filters.kpiPreset) {
    return filters.kpiPreset;
  }

  if (filters.status && isPendingQuoteStatus(filters.status)) return 'pendingQuotes';
  if (filters.status === PurchaseRequestStatus.PENDING_APPROVAL) return 'pendingApproval';
  if (filters.status === PurchaseRequestStatus.APPROVED) return 'readyForPo';
  // El estado CONVERTED_TO_PO no distingue mercancía en tránsito de mercancía ya
  // recibida: esa distinción vive en fulfillmentStatus, que es un eje por
  // solicitud y no un filtro de listado. Por eso el KPI «Por recibir» exige
  // kpiPreset explícito y se resuelve en servidor.
  if (filters.priority === PurchaseRequestPriority.URGENT) return 'urgent';

  return null;
}

export function filterPurchaseRequests(
  requests: PurchaseRequestRecord[],
  filters: PurchaseRequestFilters,
): PurchaseRequestRecord[] {
  return requests.filter((request) => {
    if (filters.requestType && request.requestType !== filters.requestType) return false;
    if (filters.kpiPreset === 'pendingQuotes' && !isPendingQuoteStatus(request.status)) {
      return false;
    }
    if (
      filters.status &&
      filters.kpiPreset !== 'pendingQuotes' &&
      request.status !== filters.status
    ) {
      return false;
    }
    if (filters.priority && request.priority !== filters.priority) return false;
    if (filters.kpiPreset === 'overdue' && !isPurchaseRequestOverdue(request)) return false;
    if (filters.search) {
      const needle = filters.search.trim().toLowerCase();
      const haystack =
        `${request.requestNumber} ${request.title} ${request.requestingArea ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function hasActivePurchaseFilters(filters: PurchaseRequestFilters): boolean {
  return Boolean(
    filters.requestType ||
    filters.status ||
    filters.priority ||
    filters.search?.trim() ||
    filters.kpiPreset,
  );
}

export const PURCHASE_KPI_LABELS: Record<PurchaseKpiPreset, string> = {
  pendingQuotes: 'Por cotizar',
  pendingApproval: 'Por aprobar',
  readyForPo: 'Listas para orden de compra',
  pendingReceipt: 'Por recibir',
  urgent: 'Urgentes',
  overdue: 'Vencidas',
};
