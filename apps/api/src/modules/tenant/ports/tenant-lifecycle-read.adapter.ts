import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Tenant } from '@iwana/db';
import { TenantStatus } from '@iwana/shared';
import { IsNull, Repository } from 'typeorm';
import {
  TenantLifecycleReadPort,
  type TenantLifecycleSnapshot,
} from './tenant-lifecycle-read.port';

const TENANT_LIFECYCLE_FIELDS = ['id', 'slug', 'schemaName', 'status', 'deletedAt'] as const;

@Injectable()
export class TenantLifecycleReadAdapter extends TenantLifecycleReadPort {
  constructor(@InjectRepository(Tenant) private readonly tenants: Repository<Tenant>) {
    super();
  }

  async listActiveTenantContexts(): Promise<TenantLifecycleSnapshot[]> {
    const tenants = await this.tenants.find({
      where: { status: TenantStatus.ACTIVE, deletedAt: IsNull() },
      select: [...TENANT_LIFECYCLE_FIELDS],
      order: { schemaName: 'ASC' },
    });
    return tenants.map((tenant) => this.toSnapshot(tenant));
  }

  async findTenantLifecycleById(id: string): Promise<TenantLifecycleSnapshot | null> {
    const tenant = await this.tenants.findOne({
      where: { id },
      select: [...TENANT_LIFECYCLE_FIELDS],
    });
    return tenant ? this.toSnapshot(tenant) : null;
  }

  private toSnapshot(tenant: Tenant): TenantLifecycleSnapshot {
    return {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schemaName,
      status: tenant.status,
      deletedAt: tenant.deletedAt,
    };
  }
}
