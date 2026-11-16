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

  it('publica los archivos de los adjuntos y retira sus filas antes de tocar comentarios', async () => {
    const columns = new Map(
      ['ticket_comment_attachments.id', 'ticket_comment_attachments.ticket_id'].map((key) => [
        key,
        {
          table_name: 'ticket_comment_attachments',
          column_name: key.split('.')[1] as string,
          is_nullable: 'NO' as const,
          data_type: 'uuid',
          udt_name: 'uuid',
        },
      ]),
    );
    jest.spyOn(sql, 'readTenantColumns').mockResolvedValue(columns);
    jest.spyOn(sql, 'loadErasureKeys').mockReturnValue({} as never);
    jest
      .spyOn(sql, 'selectErasureIds')
      .mockImplementation(async (_qr, table) =>
        table === 'ticket_comment_attachments' ? ['adjunto'] : ['ticket'],
      );
    const values = jest.spyOn(sql, 'selectErasureColumnValues').mockResolvedValue(['archivo']);
    const order: string[] = [];
    jest.spyOn(sql, 'anonymizeConfiguredTable').mockImplementation(async (_qr, table) => {
      order.push(table);
      return { selected: 1, changed: 1, residual: 0 };
    });
    const query = jest.fn(async (statement: string) => {
      if (statement.startsWith('DELETE')) {
        order.push('DELETE ticket_comment_attachments');
        return [[{ id: 'adjunto' }], 1];
      }
      return [{ count: 0 }];
    });
    const scope = {
      partyId: null,
      subscriberIds: ['subscriber'],
      expedienteIds: [],
      userIds: [],
      relatedIds: { contractIds: [] as string[] },
    } as Parameters<AssuranceTitularErasureParticipant['resolveScope']>[0];
    const participant = new AssuranceTitularErasureParticipant(new ConfigService());
    const qr = { query } as unknown as QueryRunner;

    await participant.resolveScope(scope, qr);
    expect(values).toHaveBeenCalledWith(
      qr,
      'ticket_comment_attachments',
      'media_asset_id',
      ['adjunto'],
      columns,
    );
    expect(scope.relatedIds?.ticketAttachmentMediaIds).toEqual(['archivo']);

    const planned = await participant.plan(scope, qr);
    expect(planned[0]).toEqual({
      table: 'ticket_comment_attachments',
      category: 'OPERACION_CAMPO',
      selected: 1,
      changed: 1,
      residual: 0,
    });
    expect(order).not.toContain('DELETE ticket_comment_attachments');

    const applied = await participant.apply(scope, qr, 'apply');
    expect(applied[0]).toMatchObject({ table: 'ticket_comment_attachments', changed: 1 });
    expect(order.indexOf('DELETE ticket_comment_attachments')).toBeLessThan(
      order.lastIndexOf('ticket_comments'),
    );
    // El borrado se acota al tenant del schema en curso, no solo a los ids.
    const deleteCall = query.mock.calls.find(([statement]) => statement.startsWith('DELETE'));
    expect(deleteCall?.[0]).toMatch(/"tenant_id" = \(\s*SELECT t\.id FROM public\.tenants t/);
    expect(deleteCall?.[0]).toContain('t.schema_name = current_schema()');
  });
});
