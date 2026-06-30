import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { ProspectCase } from '../prospects/entities/prospect-case.entity';
import { CustomerActivation } from './entities/customer-activation.entity';
import { ProspectCaseStatus } from '../enums/prospect-case-status.enum';
import { InventoryAssignmentPort } from '../ports/inventory-assignment.port';
import { BillingActivationPort } from '../ports/billing-activation.port';
import { ProvisioningActivationPort } from '../ports/provisioning-activation.port';
import { CloseSuccessDto } from '../prospects/dto/close-success.dto';
import { ProspectResponseDto } from '../prospects/dto/prospect-response.dto';

@Injectable()
export class ActivationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly inventoryAssignmentPort: InventoryAssignmentPort,
    private readonly billingActivationPort: BillingActivationPort,
    private readonly provisioningActivationPort: ProvisioningActivationPort,
  ) {}

  async closeSuccess(prospectId: string, dto: CloseSuccessDto): Promise<ProspectResponseDto> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    if (!dto.checklistCompleted || !dto.conformityEvidenceRef.trim()) {
      throw new BadRequestException('El cierre exitoso requiere checklist y evidencia.');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: prospectId } });
      if (!prospect) {
        throw new NotFoundException(`Prospecto ${prospectId} no encontrado.`);
      }

      if (!prospect.ticketId || !prospect.workOrderId) {
        throw new BadRequestException(
          'No existe trazabilidad operativa suficiente para activar el cliente.',
        );
      }

      const assignment = await this.inventoryAssignmentPort.registerAssignment({
        tenantId,
        schemaName,
        prospectId,
      });

      prospect.checklistCompleted = true;
      prospect.evidenceMode = dto.evidenceMode;
      prospect.conformityEvidenceRef = dto.conformityEvidenceRef.trim();
      prospect.inventoryAssignmentRef = assignment.inventoryAssignmentRef;
      prospect.status = ProspectCaseStatus.ACTIVE_CUSTOMER;
      const savedProspect = await qr.manager.save(ProspectCase, prospect);
      const ticketId = savedProspect.ticketId as string;
      const workOrderId = savedProspect.workOrderId as string;

      const activation = new CustomerActivation();
      activation.tenantId = tenantId;
      activation.prospectId = prospectId;
      activation.ticketId = ticketId;
      activation.workOrderId = workOrderId;
      activation.inventoryAssignmentRef = savedProspect.inventoryAssignmentRef;
      activation.evidenceMode = dto.evidenceMode;
      activation.conformityEvidenceRef = dto.conformityEvidenceRef.trim();
      const savedActivation = await qr.manager.save(CustomerActivation, activation);

      await this.billingActivationPort.activate({
        tenantId,
        schemaName,
        prospectId,
        customerActivationId: savedActivation.id,
      });
      await this.provisioningActivationPort.activate({
        tenantId,
        schemaName,
        prospectId,
        customerActivationId: savedActivation.id,
      });

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'CustomerActivation',
        entityId: savedActivation.id,
        newValue: {
          prospectId,
          evidenceMode: savedActivation.evidenceMode,
          ticketId,
          workOrderId,
        },
      });

      return {
        id: savedProspect.id,
        potentialId: savedProspect.potentialId,
        tenantId: savedProspect.tenantId,
        fullName: savedProspect.fullName,
        address: savedProspect.address,
        selectedPlanId: savedProspect.selectedPlanId,
        status: savedProspect.status,
        ticketId: savedProspect.ticketId,
        workOrderId: savedProspect.workOrderId,
        executionPolicyRef: savedProspect.executionPolicyRef,
        lastRescheduleReason: savedProspect.lastRescheduleReason,
        evidenceMode: savedProspect.evidenceMode,
        conformityEvidenceRef: savedProspect.conformityEvidenceRef,
      };
    });
  }
}
