import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { AuditAction, CustomerSegment } from '@iwana/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { ExecutionOrderConsumptionReadPort } from '../../tasks/ports/execution-order-consumption-read.port';
import { InstallationConsumptionValuationReadPort } from '../../inventory/ports/installation-consumption-valuation-read.port';
import { InstalledEquipmentReadPort } from '../../inventory/ports/installed-equipment-read.port';
import { InstallationContractReadPort } from '../ports/installation-contract-read.port';
import {
  buildInstallationBreakdownItems,
  type InstallationBreakdownItem,
} from './billing-installation-breakdown.math';

export type InstallationCaptureOutcome =
  | 'recorded'
  | 'existing'
  | 'notApplicable'
  | 'withoutSubscriber'
  | 'withoutContract';

const SEGMENTS = new Set<string>(Object.values(CustomerSegment));

/**
 * Asocia al contrato el consumo de la OT de instalación cerrada (spec MOD14 2026-11-13, bloque A:
 * R1, R2). Lee la OT, el contrato y la valoración solo por puertos; escribe solo tablas de MOD14.
 * Idempotente por OT: el reintento de un mismo cierre no duplica ni revalora.
 */
@Injectable()
export class BillingInstallationBreakdownService {
  private readonly logger = new Logger(BillingInstallationBreakdownService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly orders: ExecutionOrderConsumptionReadPort,
    private readonly contracts: InstallationContractReadPort,
    private readonly valuations: InstallationConsumptionValuationReadPort,
    private readonly installedEquipment: InstalledEquipmentReadPort,
  ) {}

  async capture(executionOrderId: string): Promise<InstallationCaptureOutcome> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    if (await this.exists(tenantId, schemaName, executionOrderId)) return 'existing';

    const consumption = await this.orders.getClosedInstallationConsumption(executionOrderId);
    if (!consumption) return 'notApplicable';
    if (!consumption.subscriberId) return 'withoutSubscriber';
    const contract = await this.contracts.findByExecutionOrder(
      executionOrderId,
      consumption.subscriberId,
    );
    if (!contract) return 'withoutContract';

    const segment =
      contract.customerSegment && SEGMENTS.has(contract.customerSegment)
        ? contract.customerSegment
        : CustomerSegment.RESIDENTIAL;
    const itemIds = consumption.lines.map((line) => line.itemId);
    const [valuations, installed] = await Promise.all([
      this.valuations.describeItems(itemIds, segment),
      consumption.lines.some((line) => line.serialNumber)
        ? this.installedEquipment.listInstalledAtCustomer(
            executionOrderId,
            consumption.subscriberId,
          )
        : Promise.resolve([]),
    ]);
    const items = buildInstallationBreakdownItems(
      consumption.lines,
      valuations,
      new Set(installed.map((equipment) => equipment.serialNumber)),
    );

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const inserted = (await qr.query(
        `INSERT INTO billing_installation_breakdowns
           (tenant_id, contract_id, subscriber_id, execution_order_id, execution_order_number,
            execution_order_closed_at, price_segment)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, execution_order_id) DO NOTHING
         RETURNING id::text AS id`,
        [
          tenantId,
          contract.contractId,
          consumption.subscriberId,
          consumption.executionOrderId,
          consumption.executionOrderNumber.slice(0, 40),
          consumption.closedAt,
          segment,
        ],
      )) as Array<{ id: string }>;
      const breakdownId = inserted[0]?.id;
      // Un cierre concurrente ya lo registró: el primero gana y su valor queda congelado.
      if (!breakdownId) return 'existing';
      await this.insertItems(qr.manager, tenantId, breakdownId, items);
      await this.audit.logWithin(
        {
          action: AuditAction.CREATE,
          entityType: 'BillingInstallationBreakdown',
          entityId: breakdownId,
          userId: null,
          newValue: {
            contractId: contract.contractId,
            executionOrderId: consumption.executionOrderId,
            priceSegment: segment,
            items: items.length,
            valuedItems: items.filter((item) => item.valueSource !== 'SIN_VALOR').length,
          },
        },
        qr.manager,
      );
      this.logger.log(`Consumo de instalación registrado: ${items.length} ítem(s).`);
      return 'recorded';
    });
  }

  private async exists(
    tenantId: string,
    schemaName: string,
    executionOrderId: string,
  ): Promise<boolean> {
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT 1 FROM billing_installation_breakdowns
          WHERE tenant_id = $1 AND execution_order_id = $2`,
        [tenantId, executionOrderId],
      ),
    )) as unknown[];
    return rows.length > 0;
  }

  private async insertItems(
    manager: EntityManager,
    tenantId: string,
    breakdownId: string,
    items: readonly InstallationBreakdownItem[],
  ): Promise<void> {
    for (const item of items) {
      await manager.query(
        `INSERT INTO billing_installation_breakdown_items
           (tenant_id, breakdown_id, position, inventory_item_id, description, unit_of_measure,
            quantity, serial_numbers, is_loan, commercial_product_id, value_source,
            unit_reference_value, reference_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)`,
        [
          tenantId,
          breakdownId,
          item.position,
          item.inventoryItemId,
          item.description,
          item.unitOfMeasure,
          item.quantity,
          JSON.stringify(item.serialNumbers),
          item.isLoan,
          item.commercialProductId,
          item.valueSource,
          item.unitReferenceValue,
          item.referenceValue,
        ],
      );
    }
  }
}
