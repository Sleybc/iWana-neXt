import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { CommercialNode } from '../entities/commercial-node.entity';
import {
  CommercialNodeReadPort,
  type CommercialNodeReference,
  type CommercialNodeSummary,
} from './commercial-node-read.port';

@Injectable()
export class CommercialNodeReadAdapter extends CommercialNodeReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async findReferenceById(id: string): Promise<CommercialNodeReference | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const node = await qr.manager.findOne(CommercialNode, {
        where: { id, tenantId },
        select: ['id', 'isActive', 'deletedAt'],
        withDeleted: true,
      });
      return node ? { id: node.id, isActive: node.isActive, deletedAt: node.deletedAt } : null;
    });
  }

  async findRouterSummaryById(id: string): Promise<CommercialNodeSummary | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const node = await qr.manager.findOne(CommercialNode, {
        where: { id, tenantId },
        select: ['id', 'name', 'isActive'],
      });
      return node ? { name: node.name, isActive: node.isActive } : null;
    });
  }
}
