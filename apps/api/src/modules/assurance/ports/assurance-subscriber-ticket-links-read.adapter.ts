import { InjectDataSource } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { isValidSchemaName, runInTenantSchema } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  AssuranceSubscriberTicketLinksReadPort,
  type AssuranceSubscriberTicketLink,
} from './assurance-subscriber-ticket-links-read.port';

@Injectable()
export class AssuranceSubscriberTicketLinksReadAdapter extends AssuranceSubscriberTicketLinksReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async listSubscriberTicketLinks(
    tenantId: string,
    schemaName: string,
  ): Promise<AssuranceSubscriberTicketLink[]> {
    if (!isValidSchemaName(schemaName)) {
      throw new Error('Schema tenant inválido.');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (queryRunner) => {
      const rows = (await queryRunner.query(
        `SELECT id::text AS ticket_id, requester_ref_id
           FROM support_tickets
          WHERE tenant_id = $1::uuid
            AND requester_type = 'SUBSCRIBER'
          ORDER BY id`,
        [tenantId],
      )) as Array<{ ticket_id: string; requester_ref_id: string | null }>;

      return rows.map(({ ticket_id, requester_ref_id }) => ({
        ticketId: ticket_id,
        requesterRefId: requester_ref_id,
      }));
    });
  }
}
