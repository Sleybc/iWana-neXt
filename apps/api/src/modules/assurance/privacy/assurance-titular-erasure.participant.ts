import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import { ticketScopePredicates } from './ticket-scope';
import {
  anonymizeConfiguredTable,
  loadErasureKeys,
  normalizeErasureRows,
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
    const predicates = ticketScopePredicates(
      {
        subscriberIds: scope.subscriberIds,
        contractIds: related.contractIds ?? [],
        expedienteIds: scope.expedienteIds,
      },
      columns,
      parameters,
    );
    related.ticketIds = await selectErasureIds(
      qr,
      'support_tickets',
      columns,
      predicates,
      parameters,
    );
    const linkIds = await this.childIds(qr, 'ticket_work_order_links', related.ticketIds, columns);
    // Adjuntos de tickets (spec MOD09 adjuntos §2.4): Soporte publica sus archivos para que el
    // participante de Media los retire después; las filas se borran en `run`.
    related.ticketAttachmentMediaIds = await selectErasureColumnValues(
      qr,
      'ticket_comment_attachments',
      'media_asset_id',
      await this.childIds(qr, 'ticket_comment_attachments', related.ticketIds, columns),
      columns,
    );
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
    // Antes de tocar comentarios: la fila del adjunto (con su nombre, texto libre del titular)
    // se retira; su activo lo retira Media con `relatedIds.ticketAttachmentMediaIds` y el objeto
    // lo borra después del commit la fase 4 del worker `evidence-orphan-detection`.
    const results: TitularErasureTableResult[] = [
      await this.removeAttachments(qr, ticketIds, columns, mode),
    ];
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

  private async removeAttachments(
    qr: QueryRunner,
    ticketIds: string[],
    columns: Map<string, TenantColumn>,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult> {
    const table = 'ticket_comment_attachments';
    const ids = await this.childIds(qr, table, ticketIds, columns);
    const result: TitularErasureTableResult = {
      table,
      category: 'OPERACION_CAMPO',
      selected: ids.length,
      changed: 0,
      residual: 0,
    };
    if (ids.length === 0) return result;
    if (mode === 'apply') {
      const deleted = normalizeErasureRows<{ id: string }>(
        await qr.query(
          // Acotado también al tenant del schema en curso: sin él, nada se borra y el residuo
          // hace fallar la verificación del orquestador (falla cerrado).
          `DELETE FROM "ticket_comment_attachments"
            WHERE "id" = ANY($1::uuid[])
              AND "tenant_id" = (
                SELECT t.id FROM public.tenants t WHERE t.schema_name = current_schema()
              )
            RETURNING "id"`,
          [ids],
        ),
      );
      result.changed = deleted.length;
    } else {
      result.changed = ids.length;
    }
    const residual = (await qr.query(
      `SELECT COUNT(*)::int AS count FROM "ticket_comment_attachments" WHERE "id" = ANY($1::uuid[])`,
      [ids],
    )) as Array<{ count: number }>;
    result.residual = mode === 'apply' ? Number(residual[0]?.count ?? 0) : 0;
    return result;
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
