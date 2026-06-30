import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ProspectCase } from '../prospects/entities/prospect-case.entity';
import { CustomerOverviewDto } from './dto/customer-overview.dto';

@Injectable()
export class CustomerOverviewService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getCustomerOverview(customerId: string): Promise<CustomerOverviewDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: customerId } });
      if (!prospect) {
        throw new NotFoundException(`Cliente/Prospecto ${customerId} no encontrado.`);
      }

      return {
        customerId: prospect.id,
        prospectId: prospect.id,
        fullName: prospect.fullName,
        ticketId: prospect.ticketId ?? 'pending-ticket',
        workOrderId: prospect.workOrderId ?? 'pending-work-order',
        inventoryAssignmentRef: prospect.inventoryAssignmentRef,
        expansionRequestId: prospect.expansionRequestId,
        conformityEvidenceRef: prospect.conformityEvidenceRef,
      };
    });
  }
}
