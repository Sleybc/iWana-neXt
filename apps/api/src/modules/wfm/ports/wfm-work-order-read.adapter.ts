import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema, WorkOrder } from '@iwana/db';
import { WfmWorkOrderReadPort, WfmWorkOrderReference } from './wfm-work-order-read.port';

/** Adaptador concreto del puerto de lectura de Work Orders. */
@Injectable()
export class WfmWorkOrderReadAdapter extends WfmWorkOrderReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getById(workOrderId: string): Promise<WfmWorkOrderReference | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const wo = await qr.manager.findOne(WorkOrder, {
        where: { id: workOrderId },
      });
      if (!wo) return null;
      return this._toReference(wo);
    });
  }

  async ensureReference(workOrderId: string): Promise<WfmWorkOrderReference> {
    const ref = await this.getById(workOrderId);
    if (!ref) {
      throw new NotFoundException(`Work Order ${workOrderId} no encontrada`);
    }
    return ref;
  }

  private _toReference(wo: WorkOrder): WfmWorkOrderReference {
    return {
      id: wo.id,
      tenantId: wo.tenantId,
      code: wo.code,
      type: wo.type,
      status: wo.status,
      priority: wo.priority,
      summary: wo.summary,
      assignedUserId: wo.assignedUserId,
    };
  }
}
