import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isValidSchemaName, runInTenantSchema, SupportTicket } from '@iwana/db';
import { DataSource } from 'typeorm';
import { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { subscriberTicketLinkPredicate } from '../services/subscriber-ticket-link.predicate';
import type { AssuranceTicketReference } from './assurance-ticket-reference-read.port';
import {
  ASSURANCE_SUBSCRIBER_TICKETS_READ_LIMIT,
  AssuranceSubscriberTicketsReadPort,
} from './assurance-subscriber-tickets-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AssuranceSubscriberTicketsReadAdapter extends AssuranceSubscriberTicketsReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CrmSubscriberReadPort) private readonly crmSubscriberReadPort: CrmSubscriberReadPort,
  ) {
    super();
  }

  async listSubscriberTicketRefs(
    tenantId: string,
    schemaName: string,
    subscriberId: string,
  ): Promise<AssuranceTicketReference[]> {
    if (!UUID_PATTERN.test(subscriberId)) return [];
    if (!isValidSchemaName(schemaName)) {
      throw new Error('Schema tenant inválido.');
    }
    // Regla compartida con TicketsService.list (subscriberTicketLinkPredicate).
    const contractIds = await this.crmSubscriberReadPort.listContractIds(
      tenantId,
      schemaName,
      subscriberId,
    );
    const expedienteId = await this.crmSubscriberReadPort.findExpedienteId(
      tenantId,
      schemaName,
      subscriberId,
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = await qr.manager
        .createQueryBuilder(SupportTicket, 'st')
        .select('st.id', 'id')
        .addSelect('st.ticket_number', 'ticket_number')
        .where('st.tenant_id = :tenantId', { tenantId })
        .andWhere(subscriberTicketLinkPredicate(subscriberId, contractIds, expedienteId))
        .orderBy('st.created_at', 'DESC')
        .addOrderBy('st.id', 'DESC')
        .limit(ASSURANCE_SUBSCRIBER_TICKETS_READ_LIMIT)
        .getRawMany<{ id: string; ticket_number: string }>();
      return rows.map((row) => ({ id: row.id, number: row.ticket_number }));
    });
  }
}
