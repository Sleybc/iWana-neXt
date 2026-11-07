import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  anonymizeConfiguredTable,
  loadErasureKeys,
  readTenantColumns,
  selectErasureIds,
  selectErasureColumnValues,
  type FieldRule,
  type TenantColumn,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

@Injectable()
export class AssuranceTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

  async resolveScope(scope: TitularErasureScope, qr: QueryRunner): Promise<void> {
    const columns = await readTenantColumns(qr);
    const related = (scope.relatedIds ??= {});
    const parameters: unknown[] = [];
    const predicates: string[] = [];
    for (const [typeColumn, refColumn, type, ids] of [
      ['requester_type', 'requester_ref_id', 'SUBSCRIBER', scope.subscriberIds],
      ['subject_type', 'subject_ref_id', 'SUBSCRIBER', scope.subscriberIds],
      ['subject_type', 'subject_ref_id', 'CONTRACT', related.contractIds ?? []],
      ['subject_type', 'subject_ref_id', 'EXPEDIENTE', scope.expedienteIds],
    ] as const) {
      if (
        ids.length === 0 ||
        !columns.has(`support_tickets.${typeColumn}`) ||
        !columns.has(`support_tickets.${refColumn}`)
      )
        continue;
      parameters.push(ids);
      predicates.push(
        `("${typeColumn}"::text = '${type}' AND "${refColumn}"::text = ANY($${parameters.length}::text[]))`,
      );
    }
    related.ticketIds = await selectErasureIds(
      qr,
      'support_tickets',
      columns,
      predicates,
      parameters,
    );
    const linkIds = await this.childIds(qr, 'ticket_work_order_links', related.ticketIds, columns);
    related.ticketWorkOrderIds = [
      ...new Set([
        ...(await selectErasureColumnValues(
          qr,
          'support_tickets',
          'work_order_id',
          related.ticketIds,
          columns,
        )),
        ...(await selectErasureColumnValues(
          qr,
          'ticket_work_order_links',
          'work_order_id',
          linkIds,
          columns,
        )),
      ]),
    ];
  }

  plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, 'dry-run');
  }
  apply(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, mode);
  }

  private async run(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    const columns = await readTenantColumns(qr);
    const keys = scope.cryptoKeys ?? loadErasureKeys(this.config);
    const ticketIds = scope.relatedIds?.ticketIds ?? [];
    const tables: ReadonlyArray<readonly [string, FieldRule[]]> = [
      [
        'support_tickets',
        [
          { column: 'subject', kind: 'marker' },
          { column: 'description', kind: 'null' },
        ],
      ],
      ['ticket_comments', [{ column: 'body', kind: 'marker' }]],
      ['ticket_timeline_events', [{ column: 'payload', kind: 'empty-json' }]],
      ['ticket_work_order_links', [{ column: 'notes', kind: 'null' }]],
      ['ticket_pqr_records', [{ column: 'notes', kind: 'null' }]],
    ];
    const results: TitularErasureTableResult[] = [];
    for (const [table, rules] of tables) {
      const ids =
        table === 'support_tickets'
          ? ticketIds
          : await this.childIds(qr, table, ticketIds, columns);
      results.push({
        table,
        category: 'OPERACION_CAMPO',
        ...(await anonymizeConfiguredTable(qr, table, ids, rules, columns, keys, mode)),
      });
    }
    return results;
  }

  private childIds(
    qr: QueryRunner,
    table: string,
    ids: string[],
    columns: Map<string, TenantColumn>,
  ): Promise<string[]> {
    return selectErasureIds(
      qr,
      table,
      columns,
      ids.length && columns.has(`${table}.ticket_id`) ? ['"ticket_id" = ANY($1::uuid[])'] : [],
      ids.length && columns.has(`${table}.ticket_id`) ? [ids] : [],
    );
  }
}
