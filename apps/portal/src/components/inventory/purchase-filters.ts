'use client';

import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
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
      return { kpiPreset: preset, status: PurchaseRequestStatus.CONVERTED_TO_PO };
    case 'urgent':
      return { kpiPreset: preset, priority: PurchaseRequestPriority.URGENT };
    case 'overdue':
      return { kpiPreset: preset };
    default:
      return { kpiPreset: preset };
  }
}

/** Primera solicitud candidata para abrir el workbench al activar un KPI operativo. */
export function findFirstRequestForKpiWorkbench(
  preset: PurchaseKpiPreset,
  requests: PurchaseRequestRecord[],
): PurchaseRequestRecord | null {
  if (preset !== 'pendingReceipt') {
    return null;
  }

  return (
    requests.find((request) => request.status === PurchaseRequestStatus.CONVERTED_TO_PO) ?? null
  );
}

export function resolveActiveKpiPreset(filters: PurchaseRequestFilters): PurchaseKpiPreset | null {
  if (filters.kpiPreset) {
    return filters.kpiPreset;
  }

  if (filters.status && isPendingQuoteStatus(filters.status)) return 'pendingQuotes';
  if (filters.status === PurchaseRequestStatus.PENDING_APPROVAL) return 'pendingApproval';
  if (filters.status === PurchaseRequestStatus.APPROVED) return 'readyForPo';
  if (filters.status === PurchaseRequestStatus.CONVERTED_TO_PO) return 'pendingReceipt';
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
