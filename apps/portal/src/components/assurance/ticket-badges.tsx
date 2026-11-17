import { Badge } from '@iwana/ui';
import {
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketPriorityVariant,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
} from './assurance-labels';

/**
 * Badges de estado y prioridad del ticket (dictamen ds-owner, spec MOD05 Soporte §5.4).
 * Compartidos con la Mesa de ayuda (`AssuranceTicketsTable`, ola 3).
 */
export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={getAssuranceTicketStatusVariant(status)}>
      {getAssuranceTicketStatusLabel(status)}
    </Badge>
  );
}

export function TicketPriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant={getAssuranceTicketPriorityVariant(priority)}>
      {getAssuranceTicketPriorityLabel(priority)}
    </Badge>
  );
}
