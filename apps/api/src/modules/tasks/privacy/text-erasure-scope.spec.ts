import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import * as sql from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type { TitularErasureScope } from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from './execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from './operational-task-titular-erasure.participant';

describe('B3 — alcance operativo y texto libre', () => {
  const config = new ConfigService();
  const qr = { query: jest.fn().mockResolvedValue([]) } as unknown as QueryRunner;
  let scope: TitularErasureScope;
  const columns = new Map<string, sql.TenantColumn>();

  beforeEach(() => {
    scope = {
      partyId: null,
      subscriberIds: ['subscriber'],
      expedienteIds: ['expediente'],
      userIds: [],
      relatedIds: Object.assign(
        { contractIds: ['contract'] },
        { ticketIds: ['ticket'], ticketWorkOrderIds: ['work'] },
      ),
      cryptoKeys: {
        hashKey: Buffer.alloc(32, 1),
        activeEncryptionKey: Buffer.alloc(32, 2),
        previousEncryptionKey: null,
      },
    };
    columns.clear();
    for (const [table, names] of Object.entries({
      execution_orders: ['id', 'subscriber_id'],
      visit_requests: ['id', 'contract_id', 'ticket_id'],
      schedule_events: ['id', 'contract_id', 'ticket_id'],
      work_orders: ['id', 'source_context', 'source_ref'],
      operational_tasks: ['id', 'ticket_id'],
    })) {
      for (const column of names)
        columns.set(`${table}.${column}`, {
          table_name: table,
          column_name: column,
          is_nullable: 'YES',
          data_type: 'text',
          udt_name: 'text',
        });
    }
    jest.spyOn(sql, 'readTenantColumns').mockResolvedValue(columns);
    jest.spyOn(sql, 'selectErasureIds').mockResolvedValue([]);
    jest.spyOn(sql, 'selectErasureColumnValues').mockResolvedValue([]);
    jest
      .spyOn(sql, 'anonymizeConfiguredTable')
      .mockResolvedValue({ selected: 0, changed: 0, residual: 0 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('A-1 alcanza la OT directa por subscriber_id como texto', async () => {
    await new ExecutionOrderTitularErasureParticipant(config).resolveScope(scope, qr);
    expect(sql.selectErasureIds).toHaveBeenCalledWith(
      qr,
      'execution_orders',
      columns,
      expect.arrayContaining(['"subscriber_id"::text = ANY($1::text[])']),
      [['subscriber']],
    );
  });

  it.each(['visit_requests', 'schedule_events'])(
    'A-2 alcanza %s por contrato y ticket',
    async (table) => {
      await new WfmTitularErasureParticipant(config).resolveScope(scope, qr);
      expect(sql.selectErasureIds).toHaveBeenCalledWith(
        qr,
        table,
        columns,
        expect.arrayContaining([
          expect.stringContaining('"contract_id"'),
          expect.stringContaining('"ticket_id"'),
        ]),
        expect.arrayContaining([['contract'], ['ticket']]),
      );
    },
  );

  it('A-3 alcanza la OT por id publicado y por origen ASSURANCE', async () => {
    await new WfmTitularErasureParticipant(config).resolveScope(scope, qr);
    expect(sql.selectErasureIds).toHaveBeenCalledWith(
      qr,
      'work_orders',
      columns,
      expect.arrayContaining([
        expect.stringContaining('ASSURANCE'),
        expect.stringContaining('"id"'),
      ]),
      expect.arrayContaining([['work'], ['ticket']]),
    );
  });

  it('A-4 alcanza tareas por ticket_id', async () => {
    await new OperationalTaskTitularErasureParticipant(config).resolveScope(scope, qr);
    expect(sql.selectErasureIds).toHaveBeenCalledWith(
      qr,
      'operational_tasks',
      columns,
      expect.arrayContaining([expect.stringContaining('"ticket_id"::text')]),
      [['ticket']],
    );
  });

  it('R-12 marca el motivo de reversión sin borrar el asiento', async () => {
    await new ExecutionOrderTitularErasureParticipant(config).apply(scope, qr, 'apply');
    expect(sql.anonymizeConfiguredTable).toHaveBeenCalledWith(
      qr,
      'execution_order_item_usage_reversals',
      [],
      [{ column: 'reason', kind: 'marker' }],
      columns,
      scope.cryptoKeys,
      'apply',
    );
  });

  it('R-13 marca reason y anula notes conservando fechas', async () => {
    await new WfmTitularErasureParticipant(config).apply(scope, qr, 'apply');
    expect(sql.anonymizeConfiguredTable).toHaveBeenCalledWith(
      qr,
      'schedule_reschedule_logs',
      [],
      expect.arrayContaining([
        { column: 'reason', kind: 'marker' },
        { column: 'notes', kind: 'null' },
      ]),
      columns,
      scope.cryptoKeys,
      'apply',
    );
  });
});
