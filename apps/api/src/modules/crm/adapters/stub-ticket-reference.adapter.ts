import { Injectable } from '@nestjs/common';
import { TicketReferencePort, type TicketReference } from '../ports/ticket-reference.port';

@Injectable()
export class StubTicketReferenceAdapter extends TicketReferencePort {
  async ensureReference(input: { ticketId: string }): Promise<TicketReference> {
    return { ticketId: input.ticketId, status: 'REGISTERED' };
  }
}
