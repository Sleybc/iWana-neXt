import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryRunner } from 'typeorm';
import {
  anonymizeConfiguredTable,
  loadErasureKeys,
  readTenantColumns,
  selectErasureIds,
  type FieldRule,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';

@Injectable()
export class NetworkTitularErasureParticipant implements TitularErasureParticipant {
  constructor(private readonly config: ConfigService) {}
  plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]> {
    return this.apply(scope, qr, 'dry-run');
  }
  async apply(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    const columns = await readTenantColumns(qr);
    const parameters: unknown[] = [];
    const predicates: string[] = [];
    for (const [column, ids] of [
      ['subscriber_id', scope.subscriberIds],
      ['expediente_id', scope.expedienteIds],
      ['contract_id', scope.relatedIds?.contractIds ?? []],
    ] as const) {
      if (!ids.length || !columns.has(`service_provisionings.${column}`)) continue;
      parameters.push(ids);
      predicates.push(`"${column}"::text = ANY($${parameters.length}::text[])`);
    }
    const ids = await selectErasureIds(
      qr,
      'service_provisionings',
      columns,
      predicates,
      parameters,
    );
    const rules: FieldRule[] = [{ column: 'regularization_reason', kind: 'marker' }];
    const result = await anonymizeConfiguredTable(
      qr,
      'service_provisionings',
      ids,
      rules,
      columns,
      scope.cryptoKeys ?? loadErasureKeys(this.config),
      mode,
    );
    return [{ table: 'service_provisionings', category: 'OPERACION_CAMPO', ...result }];
  }
}
