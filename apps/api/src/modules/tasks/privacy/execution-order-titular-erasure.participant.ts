import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  anonymizeConfiguredTable,
  loadErasureKeys,
  readTenantColumns,
  selectErasureColumnValues,
  selectErasureIds,
  type FieldRule,
  type TenantColumn,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

const EXECUTION_ORDER_RULES: FieldRule[] = [
  { column: 'customer_display_label', kind: 'marker' },
  { column: 'work_summary', kind: 'marker' },
  { column: 'service_address', kind: 'null' },
  { column: 'municipality', kind: 'null' },
  { column: 'sector', kind: 'null' },
  { column: 'work_instructions', kind: 'null' },
  { column: 'close_notes', kind: 'null' },
  { column: 'template_label', kind: 'null' },
  { column: 'template_requirements_snapshot', kind: 'empty-json' },
];

const ACTIVITY_RULES: FieldRule[] = [{ column: 'description', kind: 'marker' }];
const EVIDENCE_RULES: FieldRule[] = [
  { column: 'notes', kind: 'null' },
  { column: 'file_name', kind: 'null' },
];
const STATUS_TRANSITION_RULES: FieldRule[] = [{ column: 'reason', kind: 'null' }];

function uuidMembership(
  table: string,
  column: string,
  ids: string[],
  columns: Map<string, TenantColumn>,
  parameters: unknown[],
): string | undefined {
  if (ids.length === 0 || !columns.has(`${table}.${column}`)) return undefined;
  parameters.push(ids);
  return `"${column}" = ANY($${parameters.length}::uuid[])`;
}

@Injectable()
export class ExecutionOrderTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

  async resolveScope(scope: TitularErasureScope, qr: QueryRunner): Promise<void> {
    const columns = await readTenantColumns(qr);
    const related = (scope.relatedIds ??= {});
    const parameters: unknown[] = [];
    const predicates = [
      uuidMembership(
        'execution_orders',
        'visit_request_id',
        related.visitRequestIds ?? [],
        columns,
        parameters,
      ),
      uuidMembership(
        'execution_orders',
        'schedule_event_id',
        related.scheduleEventIds ?? [],
        columns,
        parameters,
      ),
      uuidMembership(
        'execution_orders',
        'id',
        related.executionOrderIds ?? [],
        columns,
        parameters,
      ),
    ].filter((value): value is string => Boolean(value));
    related.executionOrderIds = await selectErasureIds(
      qr,
      'execution_orders',
      columns,
      predicates,
      parameters,
    );
    const evidenceIds = await this.childIds(
      qr,
      'execution_order_evidence',
      related.executionOrderIds,
      columns,
    );
    related.executionEvidenceMediaIds = await selectErasureColumnValues(
      qr,
      'execution_order_evidence',
      'media_asset_id',
      evidenceIds,
      columns,
    );
  }

  async plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]> {
    return this.run(scope, qr, 'dry-run');
  }

  async apply(
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
    const executionOrderIds = scope.relatedIds?.executionOrderIds ?? [];
    const tables = [
      ['execution_orders', executionOrderIds, EXECUTION_ORDER_RULES],
      [
        'execution_order_activities',
        await this.childIds(qr, 'execution_order_activities', executionOrderIds, columns),
        ACTIVITY_RULES,
      ],
      [
        'execution_order_evidence',
        await this.childIds(qr, 'execution_order_evidence', executionOrderIds, columns),
        EVIDENCE_RULES,
      ],
      [
        'execution_order_status_transitions',
        await this.childIds(qr, 'execution_order_status_transitions', executionOrderIds, columns),
        STATUS_TRANSITION_RULES,
      ],
    ] as const;
    const results: TitularErasureTableResult[] = [];
    for (const [table, ids, rules] of tables) {
      const result = await anonymizeConfiguredTable(qr, table, ids, rules, columns, keys, mode);
      results.push({ table, category: 'OPERACION_CAMPO', ...result });
    }
    return results;
  }

  private async childIds(
    qr: QueryRunner,
    table: string,
    executionOrderIds: string[],
    columns: Map<string, TenantColumn>,
  ): Promise<string[]> {
    const parameters: unknown[] = [];
    const predicate = uuidMembership(
      table,
      'execution_order_id',
      executionOrderIds,
      columns,
      parameters,
    );
    return selectErasureIds(qr, table, columns, predicate ? [predicate] : [], parameters);
  }
}
