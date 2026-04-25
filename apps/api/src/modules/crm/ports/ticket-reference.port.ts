import { Injectable } from '@nestjs/common';

export interface TicketReference {
  ticketId: string;
  status: string;
}

@Injectable()
export abstract class TicketReferencePort {
  abstract ensureReference(input: {
    tenantId: string;
    schemaName: string;
    ticketId: string;
  }): Promise<TicketReference>;
}
