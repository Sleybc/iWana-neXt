'use client';

import { PurchaseOrderStatus, PurchaseRequestStatus, PurchaseRfqStatus } from '@iwana/shared';
import type { PurchaseRequestDetailRecord } from '@/lib/api-client';

export type PurchaseWorkbenchTab =
  | 'summary'
  | 'lines'
  | 'cotizar'
  | 'approval'
  | 'awards'
  | 'orders'
  | 'receipts';

export type PurchaseWorkbenchPhase = 'prepare' | 'decide' | 'fulfill';

export type CotizarPrimarySection = 'invitations' | 'comparison' | 'manual';

export interface PurchaseNextAction {
  message: string;
  suggestedTab: PurchaseWorkbenchTab;
  /** Banner informativo de cierre; sin CTA de navegación. */
  terminal?: boolean;
}

export const PURCHASE_WORKBENCH_PHASE_ORDER: PurchaseWorkbenchPhase[] = [
  'prepare',
  'decide',
  'fulfill',
];

export const PURCHASE_WORKBENCH_PHASE_LABELS: Record<PurchaseWorkbenchPhase, string> = {
  prepare: 'Preparar',
  decide: 'Decidir',
  fulfill: 'Abastecer',
};

export const PURCHASE_WORKBENCH_PHASE_TABS: Record<PurchaseWorkbenchPhase, PurchaseWorkbenchTab[]> =
  {
    prepare: ['summary', 'lines'],
    decide: ['cotizar', 'approval', 'awards'],
    fulfill: ['orders', 'receipts'],
  };

export function getPurchaseWorkbenchPhase(tab: PurchaseWorkbenchTab): PurchaseWorkbenchPhase {
  for (const phase of PURCHASE_WORKBENCH_PHASE_ORDER) {
    if (PURCHASE_WORKBENCH_PHASE_TABS[phase].includes(tab)) {
      return phase;
    }
  }
  return 'prepare';
}

export function isPurchaseWorkbenchTabInPhase(
  tab: PurchaseWorkbenchTab,
  phase: PurchaseWorkbenchPhase,
): boolean {
  return PURCHASE_WORKBENCH_PHASE_TABS[phase].includes(tab);
}

export function getSuggestedPurchaseWorkbenchPhase(
  detail: PurchaseRequestDetailRecord | null,
): PurchaseWorkbenchPhase {
  const nextAction = getPurchaseNextAction(detail);
  if (!nextAction) {
    return 'prepare';
  }
  return getPurchaseWorkbenchPhase(nextAction.suggestedTab);
}

/** Fases visitables: hasta la sugerida, más fases con contenido histórico. */
export function canVisitPurchaseWorkbenchPhase(
  phase: PurchaseWorkbenchPhase,
  detail: PurchaseRequestDetailRecord | null,
): boolean {
  const suggested = getSuggestedPurchaseWorkbenchPhase(detail);
  const suggestedIndex = PURCHASE_WORKBENCH_PHASE_ORDER.indexOf(suggested);
  const phaseIndex = PURCHASE_WORKBENCH_PHASE_ORDER.indexOf(phase);
  if (phaseIndex <= suggestedIndex) {
    return true;
  }
  if (phase === 'decide') {
    return Boolean(
      detail &&
      (detail.quotes.length > 0 ||
        detail.rfq != null ||
        detail.awards.length > 0 ||
        detail.request.status === PurchaseRequestStatus.PENDING_APPROVAL ||
        detail.request.status === PurchaseRequestStatus.APPROVED ||
        detail.request.status === PurchaseRequestStatus.CONVERTED_TO_PO),
    );
  }
  if (phase === 'fulfill') {
    return Boolean(
      detail &&
      (detail.orders.length > 0 ||
        detail.request.status === PurchaseRequestStatus.APPROVED ||
        detail.request.status === PurchaseRequestStatus.CONVERTED_TO_PO),
    );
  }
  return true;
}

export function resolveTabForPurchaseWorkbenchPhase(
  phase: PurchaseWorkbenchPhase,
  detail: PurchaseRequestDetailRecord | null,
  currentTab?: PurchaseWorkbenchTab,
): PurchaseWorkbenchTab {
  const tabs = PURCHASE_WORKBENCH_PHASE_TABS[phase];
  if (currentTab && tabs.includes(currentTab)) {
    return currentTab;
  }
  const suggestedTab = getPurchaseNextAction(detail)?.suggestedTab;
  if (suggestedTab && tabs.includes(suggestedTab)) {
    return suggestedTab;
  }
  return tabs[0] ?? 'summary';
}

/** Matriz D3 — bloque primario expandido en Cotizar. */
export function getCotizarPrimarySection(input: {
  hasActiveRfq: boolean;
  quotesCount: number;
  canAddQuote: boolean;
}): CotizarPrimarySection {
  if (input.hasActiveRfq) {
    return 'invitations';
  }
  if (input.quotesCount > 0) {
    return 'comparison';
  }
  if (input.canAddQuote) {
    return 'manual';
  }
  return 'invitations';
}

/** Etiqueta del CTA de siguiente acción cuando el usuario está en otra pestaña. */
export function getPurchaseNextActionCtaLabel(action: PurchaseNextAction): string {
  switch (action.suggestedTab) {
    case 'cotizar':
      return 'Ir a cotizar';
    case 'approval':
      return 'Ir a aprobación';
    case 'awards':
      return 'Ir a adjudicación';
    case 'orders':
      return 'Ir a órdenes';
    case 'receipts':
      return 'Ir a recepciones';
    case 'lines':
      return 'Ir a líneas';
    default:
      return 'Continuar';
  }
}

export const PURCHASE_WORKBENCH_TAB_LABELS: Record<PurchaseWorkbenchTab, string> = {
  summary: 'Resumen',
  lines: 'Líneas',
  cotizar: 'Cotizar',
  approval: 'Aprobación',
  awards: 'Adjudicación',
  orders: 'Órdenes',
  receipts: 'Recepciones',
};

/** Remapea tabs legacy (`rfq`/`quotes`) al valor fusionado `cotizar`. */
export function normalizePurchaseWorkbenchTab(tab: string): PurchaseWorkbenchTab {
  if (tab === 'rfq' || tab === 'quotes') {
    return 'cotizar';
  }

  if (tab in PURCHASE_WORKBENCH_TAB_LABELS) {
    return tab as PurchaseWorkbenchTab;
  }

  return 'summary';
}

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
      message: 'Esta solicitud fue rechazada. No hay más pasos en esta solicitud.',
      suggestedTab: 'summary',
      terminal: true,
    };
  }

  if (request.status === PurchaseRequestStatus.CANCELLED) {
    return {
      message: 'Esta solicitud fue cancelada. No hay más pasos en esta solicitud.',
      suggestedTab: 'summary',
      terminal: true,
    };
  }

  if (rfq?.rfq) {
    if (rfq.rfq.status === PurchaseRfqStatus.DRAFT) {
      return {
        message: 'Invita proveedores y envía la solicitud de cotización.',
        suggestedTab: 'cotizar',
      };
    }

    if (
      rfq.rfq.status === PurchaseRfqStatus.SENT ||
      rfq.rfq.status === PurchaseRfqStatus.RECEIVING
    ) {
      return {
        message: 'Haz seguimiento de invitaciones y respuestas de proveedores.',
        suggestedTab: 'cotizar',
      };
    }
  }

  if (request.status === PurchaseRequestStatus.DRAFT) {
    return {
      message: 'Puedes abrir una ronda de cotización o registrar una cotización sin ronda formal.',
      suggestedTab: 'cotizar',
    };
  }

  if (request.status === PurchaseRequestStatus.PENDING_QUOTES) {
    return {
      message: 'Registra al menos una cotización para poder seguir.',
      suggestedTab: 'cotizar',
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
        message: 'Registra la recepción para actualizar el inventario.',
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
