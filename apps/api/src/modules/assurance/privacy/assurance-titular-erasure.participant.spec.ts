import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import * as sql from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import { AssuranceTitularErasureParticipant } from './assurance-titular-erasure.participant';

describe('B3 — alcance de tickets', () => {
  afterEach(() => jest.restoreAllMocks());
  it('exige tipo y referencia textual y publica tickets y sus dos vínculos a OT', async () => {
    const columns = new Map(
      [
        'id',
        'requester_type',
        'requester_ref_id',
        'subject_type',
        'subject_ref_id',
        'work_order_id',
      ].map((column) => [
        `support_tickets.${column}`,
        {
          table_name: 'support_tickets',
          column_name: column,
          is_nullable: 'YES' as const,
          data_type: 'text',
          udt_name: 'text',
        },
      ]),
    );
    jest.spyOn(sql, 'readTenantColumns').mockResolvedValue(columns);
    const select = jest.spyOn(sql, 'selectErasureIds').mockResolvedValue(['ticket']);
    jest.spyOn(sql, 'selectErasureColumnValues').mockResolvedValue(['work']);
    const scope = {
      partyId: null,
      subscriberIds: ['subscriber'],
      expedienteIds: ['expediente'],
      userIds: [],
      relatedIds: {
        contractIds: ['contract'],
        ticketIds: [] as string[],
        ticketWorkOrderIds: [] as string[],
      },
    };
    await new AssuranceTitularErasureParticipant(new ConfigService()).resolveScope(
      scope,
      {} as QueryRunner,
    );
    const predicates = select.mock.calls[0]?.[3].join(' OR ');
    expect(predicates).toContain("requester_type\"::text = 'SUBSCRIBER'");
    expect(predicates).toContain("subject_type\"::text = 'CONTRACT'");
    expect(predicates).toContain("subject_type\"::text = 'EXPEDIENTE'");
    expect(predicates).toContain('::text[])');
    expect(scope.relatedIds.ticketIds).toEqual(['ticket']);
    expect(scope.relatedIds.ticketWorkOrderIds).toEqual(['work']);
  });
});
