import type { TitularWriteReference } from '../../crm/ports/titular-write-reference';

export function ticketTitularReferences(ticket: {
  requesterType: string;
  requesterRefId?: string | null | undefined;
  subjectType?: string | null | undefined;
  subjectRefId?: string | null | undefined;
}): TitularWriteReference[] {
  const refs: TitularWriteReference[] = [];
  if (ticket.requesterType === 'SUBSCRIBER' && ticket.requesterRefId)
    refs.push({ type: 'SUBSCRIBER', id: ticket.requesterRefId });
  if (
    ticket.subjectRefId &&
    (ticket.subjectType === 'SUBSCRIBER' ||
      ticket.subjectType === 'CONTRACT' ||
      ticket.subjectType === 'EXPEDIENTE')
  )
    refs.push({ type: ticket.subjectType, id: ticket.subjectRefId });
  return refs;
}
