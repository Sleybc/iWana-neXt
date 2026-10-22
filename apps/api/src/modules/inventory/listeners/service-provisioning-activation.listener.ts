import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ServiceProvisioningActivatedEvent } from '../../network/events/service-provisioning-activated.event';
import { NetworkActivationListenerError } from '../../network/events/network-activation-listener.error';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class ServiceProvisioningInventoryActivationListener {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @OnEvent('network.service-provisioning.activated', { suppressErrors: false })
  async handle(event: ServiceProvisioningActivatedEvent): Promise<void> {
    try {
      const context = TenantContext.getOrThrow();
      if (context.tenantId !== event.tenantId || context.schemaName !== event.schemaName) {
        throw new Error('El evento de activación no coincide con el contexto tenant.');
      }
      if (!event.contractId || !event.cpeSerialNumber) return;

      await runInTenantSchema(this.dataSource, event.schemaName, async (qr) => {
        await qr.query(
          `UPDATE serialized_assets
              SET contract_ref_id = $1, updated_at = NOW()
            WHERE tenant_id = $2
              AND serial_number = $3
              AND subscriber_ref_id = $4`,
          [event.contractId, event.tenantId, event.cpeSerialNumber, event.subscriberId],
        );
        await qr.query(
          `UPDATE asset_loan_assignments assignment
              SET contract_ref_id = $1, updated_at = NOW()
             FROM serialized_assets asset
            WHERE assignment.tenant_id = $2
              AND assignment.serialized_asset_id = asset.id
              AND asset.tenant_id = $2
              AND asset.serial_number = $3
              AND assignment.subscriber_ref_id = $4
              AND assignment.removed_at IS NULL`,
          [event.contractId, event.tenantId, event.cpeSerialNumber, event.subscriberId],
        );
      });
    } catch (error) {
      if (error instanceof NetworkActivationListenerError) throw error;
      throw new NetworkActivationListenerError('INVENTORY_LISTENER_FAILED', { cause: error });
    }
  }
}
