import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { CustomerSegment } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import {
  InstallationContractReadPort,
  type InstallationContractRef,
} from '../../billing/ports/installation-contract-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

@Injectable()
export class InstallationContractReadAdapter extends InstallationContractReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findByExecutionOrder(
    executionOrderId: string,
    subscriberId: string,
  ): Promise<InstallationContractRef | null> {
    if (!UUID_PATTERN.test(executionOrderId) || !UUID_PATTERN.test(subscriberId)) return null;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT c.id::text AS contract_id, c.customer_segment
           FROM contracts c
           JOIN LATERAL (
             SELECT 1 AS rank, s.signed_at AS at
               FROM contract_signatures s
              WHERE s.tenant_id = c.tenant_id AND s.contract_id = c.id
                AND s.execution_order_id = $2
             UNION ALL
             SELECT 2 AS rank, g.requested_at AS at
               FROM contract_document_generations g
              WHERE g.tenant_id = c.tenant_id AND g.contract_id = c.id
                AND g.execution_order_id = $2
           ) link ON true
          WHERE c.tenant_id = $1 AND c.subscriber_id = $3
          ORDER BY link.rank ASC, link.at DESC, c.id DESC
          LIMIT 1`,
        [tenantId, executionOrderId, subscriberId],
      ),
    )) as Array<{ contract_id: string; customer_segment: CustomerSegment | null }>;
    const row = rows[0];
    return row ? { contractId: row.contract_id, customerSegment: row.customer_segment } : null;
  }
}
