import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import { purchasingApi } from '@/lib/api-client';

/** IDs de proveedor presentes en el detalle de compra (órdenes, cotizaciones, awards, invitaciones). */
export function collectPurchaseDetailSupplierIds(
  detail: PurchaseRequestDetailRecord | null,
): string[] {
  if (!detail) {
    return [];
  }

  const ids = new Set<string>();

  for (const order of detail.orders) {
    if (order.partyRefId) {
      ids.add(order.partyRefId);
    }
  }
  for (const quote of detail.quotes) {
    if (quote.partyRefId) {
      ids.add(quote.partyRefId);
    }
  }
  for (const award of detail.awards) {
    if (award.awardedPartyRefId) {
      ids.add(award.awardedPartyRefId);
    }
  }
  for (const invitation of detail.rfq?.invitations ?? []) {
    if (invitation.partyRefId) {
      ids.add(invitation.partyRefId);
    }
  }

  return [...ids];
}

/** Labels inmediatos desde invitaciones RFQ (sin round-trip). */
export function seedSupplierLabelsFromDetail(
  detail: PurchaseRequestDetailRecord | null,
): Record<string, string> {
  if (!detail?.rfq?.invitations?.length) {
    return {};
  }

  const labels: Record<string, string> = {};
  for (const invitation of detail.rfq.invitations) {
    const name = invitation.displayName?.trim();
    if (invitation.partyRefId && name) {
      labels[invitation.partyRefId] = name;
    }
  }
  return labels;
}

export async function resolveMissingSupplierLabels(
  partyRefIds: string[],
  existing: Record<string, string>,
): Promise<Record<string, string>> {
  const missing = [...new Set(partyRefIds.filter(Boolean))].filter((id) => !existing[id]?.trim());

  if (missing.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    missing.map(async (partyRefId) => {
      try {
        const summary = await purchasingApi.getProviderSummary(partyRefId);
        return [partyRefId, summary.displayName] as const;
      } catch {
        return [partyRefId, 'Proveedor asignado'] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
