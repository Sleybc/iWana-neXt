import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NetworkSetting, ServiceProvisioning, TenantContext, runInTenantSchema } from '@iwana/db';
import type { ServiceProvisioningStatus } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import type { ServiceProvisioningReadPort } from '../../tasks/ports/service-provisioning-read.port';

@Injectable()
export class ServiceProvisioningReadAdapter implements ServiceProvisioningReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getGateStatus(
    executionOrderId: string,
  ): Promise<{ enforced: boolean; status: ServiceProvisioningStatus | null }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [setting, provisioning] = await Promise.all([
        qr.manager.findOne(NetworkSetting, { where: { tenantId } }),
        qr.manager.findOne(ServiceProvisioning, {
          where: { tenantId, executionOrderId },
          order: { updatedAt: 'DESC' },
        }),
      ]);
      return {
        enforced: setting?.enforceProvisioningOnInstallClose ?? false,
        status: (provisioning?.status as ServiceProvisioningStatus | undefined) ?? null,
      };
    });
  }
}
