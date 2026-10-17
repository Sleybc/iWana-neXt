import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  anonymizeConfiguredTable,
  loadErasureKeys,
  readTenantColumns,
  selectErasureIds,
  type FieldRule,
  type TenantColumn,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

const TASK_RULES: FieldRule[] = [
  { column: 'title', kind: 'marker' },
  { column: 'description', kind: 'null' },
  { column: 'recipient_label', kind: 'null' },
];
const TIMELINE_RULES: FieldRule[] = [{ column: 'payload', kind: 'empty-json' }];
const ASSIGNMENT_RULES: FieldRule[] = [{ column: 'reason', kind: 'null' }];

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

function textMembership(
  table: string,
  column: string,
  ids: string[],
  columns: Map<string, TenantColumn>,
  parameters: unknown[],
): string | undefined {
  if (ids.length === 0 || !columns.has(`${table}.${column}`)) return undefined;
  parameters.push(ids);
  return `"${column}"::text = ANY($${parameters.length}::text[])`;
}

@Injectable()
export class OperationalTaskTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

  async resolveScope(scope: TitularErasureScope, qr: QueryRunner): Promise<void> {
    const columns = await readTenantColumns(qr);
    const related = (scope.relatedIds ??= {});
    const sourceIds = [...new Set([...scope.expedienteIds, ...scope.subscriberIds])];
    const parameters: unknown[] = [];
    const predicates: string[] = [];
    const originRef = textMembership(
      'operational_tasks',
      'origin_ref_id',
      sourceIds,
      columns,
      parameters,
    );
    if (originRef && columns.has('operational_tasks.origin_context')) {
      predicates.push(`("origin_context" = 'CRM' AND ${originRef})`);
    }
    const recipientRef = textMembership(
      'operational_tasks',
      'recipient_ref_id',
      sourceIds,
      columns,
      parameters,
    );
    if (recipientRef && columns.has('operational_tasks.recipient_type')) {
      predicates.push(`("recipient_type" IN ('SUBSCRIBER', 'PROSPECT') AND ${recipientRef})`);
    }
    // `schedule_event_id` y `work_order_id` son varchar en `operational_tasks`
    // (referencias entre módulos sin FK); compararlos con `uuid[]` falla (42883).
    const scheduleEvent = textMembership(
      'operational_tasks',
      'schedule_event_id',
      related.scheduleEventIds ?? [],
      columns,
      parameters,
    );
    if (scheduleEvent) predicates.push(scheduleEvent);
    const workOrder = textMembership(
      'operational_tasks',
      'work_order_id',
      related.workOrderIds ?? [],
      columns,
      parameters,
    );
    if (workOrder) predicates.push(workOrder);
    const taskOrigin = textMembership(
      'operational_tasks',
      'id',
      related.taskOriginRefIds ?? [],
      columns,
      parameters,
    );
    if (taskOrigin) predicates.push(taskOrigin);
    related.operationalTaskIds = await selectErasureIds(
      qr,
      'operational_tasks',
      columns,
      predicates,
      parameters,
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
    const taskIds = scope.relatedIds?.operationalTaskIds ?? [];
    const results: TitularErasureTableResult[] = [];
    const taskResult = await anonymizeConfiguredTable(
      qr,
      'operational_tasks',
      taskIds,
      TASK_RULES,
      columns,
      keys,
      mode,
    );
    results.push({ table: 'operational_tasks', category: 'OPERACION_CAMPO', ...taskResult });

    for (const [table, rules] of [
      ['task_timeline_events', TIMELINE_RULES],
      ['task_assignment_history', ASSIGNMENT_RULES],
    ] as const) {
      const parameters: unknown[] = [];
      const predicate = uuidMembership(table, 'task_id', taskIds, columns, parameters);
      const ids = await selectErasureIds(
        qr,
        table,
        columns,
        predicate ? [predicate] : [],
        parameters,
      );
      const result = await anonymizeConfiguredTable(qr, table, ids, rules, columns, keys, mode);
      results.push({ table, category: 'OPERACION_CAMPO', ...result });
    }
    return results;
  }
}
