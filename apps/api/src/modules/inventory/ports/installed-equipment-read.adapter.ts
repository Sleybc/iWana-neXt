import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { DataSource } from 'typeorm';
import {
  InstalledEquipmentReadPort,
  type InstalledEquipmentRef,
} from './installed-equipment-read.port';

interface InstalledEquipmentRow {
  serial_number: string | null;
  mac_address: string | null;
  model: string | null;
}

@Injectable()
export class InstalledEquipmentReadAdapter extends InstalledEquipmentReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getFirstInstalledAtCustomer(
    executionOrderId: string,
    subscriberId: string,
  ): Promise<InstalledEquipmentRef | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = (await qr.query(
        `SELECT asset.serial_number, asset.mac_address, item.model
           FROM asset_loan_assignments assignment
           JOIN serialized_assets asset
             ON asset.id = assignment.serialized_asset_id
            AND asset.tenant_id = assignment.tenant_id
           JOIN inventory_items item
             ON item.id = asset.inventory_item_id
            AND item.tenant_id = asset.tenant_id
          WHERE assignment.tenant_id = $1
            AND assignment.execution_order_ref_id = $2
            AND assignment.subscriber_ref_id = $3
            AND assignment.removed_at IS NULL
            AND asset.current_status = 'INSTALLED_AT_CUSTOMER'
            AND asset.serial_number IS NOT NULL
          ORDER BY assignment.installed_at ASC, assignment.id ASC
          LIMIT 1`,
        [tenantId, executionOrderId, subscriberId],
      )) as InstalledEquipmentRow[];
      const row = rows[0];
      return row?.serial_number
        ? { serialNumber: row.serial_number, macAddress: row.mac_address, model: row.model }
        : null;
    });
  }
}
