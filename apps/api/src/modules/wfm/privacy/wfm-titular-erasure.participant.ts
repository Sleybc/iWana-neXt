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

const VISIT_RULES: FieldRule[] = [
  { column: 'title', kind: 'marker' },
  { column: 'description', kind: 'null' },
  { column: 'origin_label', kind: 'null' },
  { column: 'address', kind: 'null' },
  { column: 'municipality', kind: 'null' },
  { column: 'sector', kind: 'null' },
  { column: 'latitude', kind: 'null' },
  { column: 'longitude', kind: 'null' },
  { column: 'cancel_reason', kind: 'null' },
  { column: 'additional_reason', kind: 'null' },
];

const SCHEDULE_RULES: FieldRule[] = [
  { column: 'title', kind: 'marker' },
  { column: 'description', kind: 'null' },
  { column: 'address', kind: 'null' },
  { column: 'municipality', kind: 'null' },
  { column: 'sector', kind: 'null' },
  { column: 'latitude', kind: 'null' },
  { column: 'longitude', kind: 'null' },
  { column: 'failure_reason', kind: 'null' },
  { column: 'review_notes', kind: 'null' },
];

const WORK_ORDER_RULES: FieldRule[] = [
  { column: 'summary', kind: 'marker' },
  { column: 'notes', kind: 'null' },
];

const WORK_ORDER_TASK_RULES: FieldRule[] = [
  { column: 'title', kind: 'marker' },
  { column: 'description', kind: 'null' },
  { column: 'result_notes', kind: 'null' },
];

const RESCHEDULE_RULES: FieldRule[] = [{ column: 'notes', kind: 'null' }];

function uuidMembership(
  column: string,
  ids: string[],
  parameters: unknown[],
  columns: Map<string, TenantColumn>,
  table: string,
): string | undefined {
  if (ids.length === 0 || !columns.has(`${table}.${column}`)) return undefined;
  parameters.push(ids);
  return `"${column}" = ANY($${parameters.length}::uuid[])`;
}

function textMembership(
  column: string,
  ids: string[],
  parameters: unknown[],
  columns: Map<string, TenantColumn>,
  table: string,
): string | undefined {
  if (ids.length === 0 || !columns.has(`${table}.${column}`)) return undefined;
  parameters.push(ids);
  return `"${column}"::text = ANY($${parameters.length}::text[])`;
}

@Injectable()
export class WfmTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}

  async resolveScope(scope: TitularErasureScope, qr: QueryRunner): Promise<void> {
    const columns = await readTenantColumns(qr);
    const related = (scope.relatedIds ??= {});
    const visitPredicates: string[] = [];
    const visitParameters: unknown[] = [];
    const visitExpedientes = uuidMembership(
      'expediente_id',
      scope.expedienteIds,
      visitParameters,
      columns,
      'visit_requests',
    );
    const visitSubscribers = uuidMembership(
      'subscriber_id',
      scope.subscriberIds,
      visitParameters,
      columns,
      'visit_requests',
    );
    if (visitExpedientes) visitPredicates.push(visitExpedientes);
    if (visitSubscribers) visitPredicates.push(visitSubscribers);
    related.visitRequestIds = await selectErasureIds(
      qr,
      'visit_requests',
      columns,
      visitPredicates,
      visitParameters,
    );

    const visitScheduleRefs = await selectErasureColumnValues(
      qr,
      'visit_requests',
      'schedule_event_id',
      related.visitRequestIds,
      columns,
    );
    const scheduleParameters: unknown[] = [];
    const schedulePredicates = [
      uuidMembership(
        'expediente_id',
        scope.expedienteIds,
        scheduleParameters,
        columns,
        'schedule_events',
      ),
      uuidMembership(
        'subscriber_id',
        scope.subscriberIds,
        scheduleParameters,
        columns,
        'schedule_events',
      ),
      uuidMembership('id', visitScheduleRefs, scheduleParameters, columns, 'schedule_events'),
    ].filter((value): value is string => Boolean(value));
    related.scheduleEventIds = await selectErasureIds(
      qr,
      'schedule_events',
      columns,
      schedulePredicates,
      scheduleParameters,
    );

    const visitWorkRefs = await selectErasureColumnValues(
      qr,
      'visit_requests',
      'work_order_id',
      related.visitRequestIds,
      columns,
    );
    const scheduleWorkRefs = await selectErasureColumnValues(
      qr,
      'schedule_events',
      'work_order_id',
      related.scheduleEventIds,
      columns,
    );
    const sourceRefIds = [...new Set([...scope.expedienteIds, ...scope.subscriberIds])];
    const workParameters: unknown[] = [];
    const workPredicates = [
      uuidMembership(
        'id',
        [...new Set([...visitWorkRefs, ...scheduleWorkRefs])],
        workParameters,
        columns,
        'work_orders',
      ),
      uuidMembership(
        'scheduled_event_id',
        related.scheduleEventIds,
        workParameters,
        columns,
        'work_orders',
      ),
    ].filter((value): value is string => Boolean(value));
    const sourceRef = textMembership(
      'source_ref',
      sourceRefIds,
      workParameters,
      columns,
      'work_orders',
    );
    if (sourceRef && columns.has('work_orders.source_context')) {
      workPredicates.push(`("source_context" = 'CRM' AND ${sourceRef})`);
    }
    related.workOrderIds = await selectErasureIds(
      qr,
      'work_orders',
      columns,
      workPredicates,
      workParameters,
    );

    related.executionOrderIds = [
      ...new Set([
        ...(await selectErasureColumnValues(
          qr,
          'visit_requests',
          'execution_order_id',
          related.visitRequestIds,
          columns,
        )),
        ...(await selectErasureColumnValues(
          qr,
          'schedule_events',
          'execution_order_id',
          related.scheduleEventIds,
          columns,
        )),
      ]),
    ];
    related.taskOriginRefIds = [];
    if (
      related.visitRequestIds.length > 0 &&
      columns.has('visit_requests.origin_context') &&
      columns.has('visit_requests.origin_ref')
    ) {
      const rows = (await qr.query(
        `SELECT "origin_ref"::text AS value FROM "visit_requests"
          WHERE "id" = ANY($1::uuid[]) AND "origin_context" = 'TASKS'
            AND "origin_ref" IS NOT NULL FOR UPDATE`,
        [related.visitRequestIds],
      )) as Array<{ value: string }>;
      related.taskOriginRefIds = [...new Set(rows.map((row) => row.value))];
    }
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
    const related = scope.relatedIds ?? {};
    const rows = [
      ['visit_requests', related.visitRequestIds ?? [], VISIT_RULES],
      ['schedule_events', related.scheduleEventIds ?? [], SCHEDULE_RULES],
      ['work_orders', related.workOrderIds ?? [], WORK_ORDER_RULES],
    ] as const;
    const results: TitularErasureTableResult[] = [];
    for (const [table, ids, rules] of rows) {
      const result = await anonymizeConfiguredTable(qr, table, ids, rules, columns, keys, mode);
      results.push({ table, category: 'OPERACION_CAMPO', ...result });
    }
    const workTasks = await selectErasureIds(
      qr,
      'work_order_tasks',
      columns,
      related.workOrderIds?.length ? [`"work_order_id" = ANY($1::uuid[])`] : [],
      related.workOrderIds?.length ? [related.workOrderIds] : [],
    );
    const workTaskResult = await anonymizeConfiguredTable(
      qr,
      'work_order_tasks',
      workTasks,
      WORK_ORDER_TASK_RULES,
      columns,
      keys,
      mode,
    );
    results.push({ table: 'work_order_tasks', category: 'OPERACION_CAMPO', ...workTaskResult });

    const rescheduleLogs = await selectErasureIds(
      qr,
      'schedule_reschedule_logs',
      columns,
      related.scheduleEventIds?.length ? [`"schedule_event_id" = ANY($1::uuid[])`] : [],
      related.scheduleEventIds?.length ? [related.scheduleEventIds] : [],
    );
    const rescheduleResult = await anonymizeConfiguredTable(
      qr,
      'schedule_reschedule_logs',
      rescheduleLogs,
      RESCHEDULE_RULES,
      columns,
      keys,
      mode,
    );
    results.push({
      table: 'schedule_reschedule_logs',
      category: 'OPERACION_CAMPO',
      ...rescheduleResult,
    });
    return results;
  }
}
