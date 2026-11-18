import { Injectable } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { QueryRunner } from 'typeorm';
import {
  AssuranceTicketReferenceReadPort,
  type AssuranceTicketReference,
} from './assurance-ticket-reference-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AssuranceTicketReferenceReadAdapter extends AssuranceTicketReferenceReadPort {
  async findTicketReference(
    ticketId: string,
    qr: QueryRunner,
  ): Promise<AssuranceTicketReference | null> {
    if (!UUID_PATTERN.test(ticketId)) return null;
    const { tenantId } = TenantContext.getOrThrow();
    const rows = (await qr.query(
      `SELECT id::text AS id, ticket_number
         FROM support_tickets
        WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [tenantId, ticketId],
    )) as Array<{ id: string; ticket_number: string }>;
    const row = rows[0];
    return row ? { id: row.id, number: row.ticket_number } : null;
  }
}
