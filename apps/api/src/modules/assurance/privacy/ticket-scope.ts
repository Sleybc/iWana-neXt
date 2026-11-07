import type { TenantColumn } from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';

export interface TicketTitularScope {
  subscriberIds: string[];
  contractIds: string[];
  expedienteIds: string[];
}

/** D-BT-2: exige tipo y referencia exactos, sin convertir referencias externas a UUID. */
export function ticketScopePredicates(
  scope: TicketTitularScope,
  columns: Map<string, TenantColumn>,
  parameters: unknown[],
): string[] {
  const predicates: string[] = [];
  for (const [typeColumn, refColumn, type, ids] of [
    ['requester_type', 'requester_ref_id', 'SUBSCRIBER', scope.subscriberIds],
    ['subject_type', 'subject_ref_id', 'SUBSCRIBER', scope.subscriberIds],
    ['subject_type', 'subject_ref_id', 'CONTRACT', scope.contractIds],
    ['subject_type', 'subject_ref_id', 'EXPEDIENTE', scope.expedienteIds],
  ] as const) {
    if (
      !ids.length ||
      !columns.has(`support_tickets.${typeColumn}`) ||
      !columns.has(`support_tickets.${refColumn}`)
    )
      continue;
    parameters.push(ids);
    predicates.push(
      `("${typeColumn}"::text = '${type}' AND "${refColumn}"::text = ANY($${parameters.length}::text[]))`,
    );
  }
  return predicates;
}
