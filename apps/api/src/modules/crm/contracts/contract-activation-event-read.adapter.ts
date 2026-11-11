import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { DataSource } from 'typeorm';
import {
  ContractActivationEventReadPort,
  type ContractActivationEventRecord,
} from '../../billing/ports/contract-activation-event-read.port';

interface ActivationEventRow {
  id: string;
  tenant_id: string;
  contract_id: string;
  published: boolean;
  billing_start_date: string | null;
  contract_status: string;
}

/**
 * Adaptador CRM del puerto de lectura del outbox de activación (SEC-3). La fecha de inicio de
 * cobro sale de la fila que CRM escribió en la transacción de la activación, no del job.
 */
@Injectable()
export class ContractActivationEventReadAdapter extends ContractActivationEventReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findActivationEvent(eventId: string): Promise<ContractActivationEventRecord | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT e.id::text AS id, e.tenant_id::text AS tenant_id,
                e.contract_id::text AS contract_id, e.published_at IS NOT NULL AS published,
                e.envelope #>> '{payload,billingStartDate}' AS billing_start_date,
                c.status AS contract_status
           FROM contract_activation_events e
           JOIN contracts c ON c.id = e.contract_id AND c.tenant_id = e.tenant_id
          WHERE e.id = $1::uuid AND e.tenant_id = $2`,
        [eventId, tenantId],
      ),
    )) as ActivationEventRow[];
    const row = rows[0];
    if (!row) return null;
    return {
      eventId: row.id,
      tenantId: row.tenant_id,
      contractId: row.contract_id,
      published: row.published === true,
      billingStartDate: row.billing_start_date,
      contractStatus: row.contract_status,
    };
  }
}
