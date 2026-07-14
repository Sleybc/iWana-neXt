'use client';

import { PurchaseOrderStatus, PurchaseRequestStatus, PurchaseRfqStatus } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';

export type PurchaseWorkbenchTab =
  | 'summary'
  | 'lines'
  | 'rfq'
  | 'quotes'
  | 'approval'
  | 'awards'
  | 'orders'
  | 'receipts';

export interface PurchaseNextAction {
  message: string;
  suggestedTab: PurchaseWorkbenchTab;
  /** Banner informativo de cierre; sin CTA de navegación. */
  terminal?: boolean;
}

export const PURCHASE_WORKBENCH_TAB_LABELS: Record<PurchaseWorkbenchTab, string> = {
  summary: 'Resumen',
  lines: 'Líneas',
  rfq: 'Cotización',
  quotes: 'Cotizaciones',
  approval: 'Aprobación',
  awards: 'Adjudicación',
  orders: 'Órdenes',
  receipts: 'Recepciones',
};

function hasPendingAwardableLines(detail: PurchaseRequestDetailRecord): boolean {
  const awardedLineIds = new Set(detail.awards.map((award) => award.purchaseRequestLineId));
  return detail.lines.some((line) => Boolean(line.inventoryItemId) && !awardedLineIds.has(line.id));
}

export function getPurchaseNextAction(
  detail: PurchaseRequestDetailRecord | null,
): PurchaseNextAction | null {
  if (!detail?.request) {
    return null;
  }

  const { request, approvalPolicy, orders, rfq } = detail;

  if (request.status === PurchaseRequestStatus.REJECTED) {
    return {
      message: 'Esta solicitud fue rechazada. No hay más pasos en el flujo.',
      suggestedTab: 'summary',
      terminal: true,
    };
  }

  if (request.status === PurchaseRequestStatus.CANCELLED) {
    return {
      message: 'Esta solicitud fue cancelada. No hay más pasos en el flujo.',
      suggestedTab: 'summary',
      terminal: true,
    };
  }

  if (rfq?.rfq) {
    if (rfq.rfq.status === PurchaseRfqStatus.DRAFT) {
      return {
        message: 'Invita proveedores y envía la solicitud de cotización.',
        suggestedTab: 'rfq',
      };
    }

    if (
      rfq.rfq.status === PurchaseRfqStatus.SENT ||
      rfq.rfq.status === PurchaseRfqStatus.RECEIVING
    ) {
      return {
        message: 'Haz seguimiento de invitaciones y respuestas de proveedores.',
        suggestedTab: 'rfq',
      };
    }
  }

  if (request.status === PurchaseRequestStatus.DRAFT) {
    return {
      message: 'Puedes abrir una ronda de cotización o continuar con captura manual.',
      suggestedTab: 'rfq',
    };
  }

  if (request.status === PurchaseRequestStatus.PENDING_QUOTES) {
    return {
      message: 'Registrar al menos una cotización para continuar el flujo.',
      suggestedTab: 'quotes',
    };
  }

  if (request.status === PurchaseRequestStatus.PENDING_APPROVAL) {
    if (approvalPolicy.requiresException) {
      return {
        message: 'Completa el motivo de excepción y aprueba la solicitud.',
        suggestedTab: 'approval',
      };
    }

    if (approvalPolicy.canApprove) {
      return {
        message: 'Aprueba la solicitud para habilitar la orden de compra.',
        suggestedTab: 'approval',
      };
    }

    return {
      message:
        approvalPolicy.blockingReason ?? 'Revisa los requisitos pendientes antes de aprobar.',
      suggestedTab: 'approval',
    };
  }

  if (request.status === PurchaseRequestStatus.APPROVED) {
    if (hasPendingAwardableLines(detail)) {
      return {
        message: 'Adjudica las líneas aprobadas antes de generar la orden.',
        suggestedTab: 'awards',
      };
    }

    return {
      message: 'Genera la orden de compra para iniciar el abastecimiento.',
      suggestedTab: 'orders',
    };
  }

  if (request.status === PurchaseRequestStatus.CONVERTED_TO_PO) {
    const pendingReceipt = orders.some(
      (order) =>
        order.status === PurchaseOrderStatus.APPROVED ||
        order.status === PurchaseOrderStatus.PARTIALLY_RECEIVED,
    );

    if (pendingReceipt) {
      return {
        message: 'Registra la recepción de mercancía para impactar inventario.',
        suggestedTab: 'receipts',
      };
    }

    return {
      message: 'La mercancía ya fue recibida. El flujo de esta solicitud está cerrado.',
      suggestedTab: 'receipts',
      terminal: true,
    };
  }

  return null;
}
