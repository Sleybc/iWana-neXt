import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, ServiceProvisioning, TenantContext } from '@iwana/db';
import { AuditAction, type CommercialActivationStatus } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import type {
  ServiceProvisioningCommercialStatusDetail,
  ServiceProvisioningCommercialStatusPort,
} from '../../crm/ports/service-provisioning-commercial-status.port';

@Injectable()
export class ServiceProvisioningCommercialStatusAdapter implements ServiceProvisioningCommercialStatusPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async record(
    serviceProvisioningId: string,
    status: CommercialActivationStatus,
    detail: ServiceProvisioningCommercialStatusDetail,
  ): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const manager = qr.manager;
      const service = await manager.findOne(ServiceProvisioning, {
        where: { id: serviceProvisioningId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!service) throw new Error('No se encontró el aprovisionamiento activado.');
      if (
        service.commercialActivationStatus === status &&
        service.commercialActivationDetail === detail
      ) {
        return;
      }

      service.commercialActivationStatus = status;
      service.commercialActivationDetail = detail;
      service.version += 1;
      await manager.save(ServiceProvisioning, service);
      await this.auditService.logWithin(
        {
          tenantId,
          schemaName,
          userId: null,
          action: AuditAction.UPDATE,
          entityType: 'ServiceProvisioning',
          entityId: service.id,
          newValue: { action: 'COMMERCIAL_STATUS', status, detail },
        },
        manager,
      );
    });
  }
}
