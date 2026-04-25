import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { ProspectCase } from './entities/prospect-case.entity';
import { ProspectCaseStatus } from '../enums/prospect-case-status.enum';
import { ScheduleInstallationDto } from './dto/schedule-installation.dto';
import { RescheduleInstallationDto } from './dto/reschedule-installation.dto';
import { ProspectResponseDto } from './dto/prospect-response.dto';
import { ProspectQuotesService } from './quotes.service';

@Injectable()
export class ProspectsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly planCatalogReadPort: PlanCatalogReadPort,
    private readonly auditService: AuditService,
    private readonly quotesService: ProspectQuotesService,
  ) {}

  async scheduleInstallation(
    prospectId: string,
    dto: ScheduleInstallationDto,
  ): Promise<ProspectResponseDto> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    if (!dto.ticketId.trim() || !dto.workOrderId.trim()) {
      throw new BadRequestException('La programacion exige ticket y work order.');
    }

    const plans = await this.planCatalogReadPort.getActivePlans(tenantId, schemaName);
    const plan = plans.find((item) => item.id === dto.planId);
    if (!plan) {
      throw new BadRequestException('El plan seleccionado no esta disponible para el tenant.');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: prospectId } });
      if (!prospect) {
        throw new NotFoundException(`Prospecto ${prospectId} no encontrado.`);
      }

      const oldValue = {
        status: prospect.status,
        ticketId: prospect.ticketId,
        workOrderId: prospect.workOrderId,
      };
      await this.quotesService.createQuoteSnapshot(prospect.id, {
        planId: plan.id,
        name: plan.name,
        technology: plan.technology,
        downloadSpeed: plan.downloadSpeedMbps,
        uploadSpeed: plan.uploadSpeedMbps,
        monthlyPrice: plan.basePrice,
        installationFee: plan.installationFee,
        snapshotAt: new Date().toISOString(),
      });

      prospect.selectedPlanId = dto.planId;
      prospect.ticketId = dto.ticketId.trim();
      prospect.workOrderId = dto.workOrderId.trim();
      prospect.status = ProspectCaseStatus.INSTALLATION_SCHEDULED;

      const saved = await qr.manager.save(ProspectCase, prospect);
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ProspectCase',
        entityId: saved.id,
        oldValue,
        newValue: {
          status: saved.status,
          ticketId: saved.ticketId,
          workOrderId: saved.workOrderId,
        },
      });

      return this.toDto(saved);
    });
  }

  async rescheduleInstallation(
    prospectId: string,
    dto: RescheduleInstallationDto,
  ): Promise<ProspectResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: prospectId } });
      if (!prospect) {
        throw new NotFoundException(`Prospecto ${prospectId} no encontrado.`);
      }

      const oldValue = {
        status: prospect.status,
        lastRescheduleReason: prospect.lastRescheduleReason,
        lastRescheduleNotes: prospect.lastRescheduleNotes,
      };
      prospect.status = ProspectCaseStatus.RESCHEDULED;
      prospect.ticketId = dto.ticketId.trim();
      prospect.workOrderId = dto.workOrderId.trim();
      prospect.lastRescheduleReason = dto.reason.trim();
      prospect.lastRescheduleNotes = dto.notes.trim();

      const saved = await qr.manager.save(ProspectCase, prospect);
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ProspectCase',
        entityId: saved.id,
        oldValue,
        newValue: {
          status: saved.status,
          lastRescheduleReason: saved.lastRescheduleReason,
          lastRescheduleNotes: saved.lastRescheduleNotes,
        },
      });

      return this.toDto(saved);
    });
  }

  async markTechVisitStarted(
    prospectId: string,
    dto: { ticketId: string; workOrderId: string },
  ): Promise<ProspectResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const prospect = await qr.manager.findOne(ProspectCase, { where: { id: prospectId } });
      if (!prospect) {
        throw new NotFoundException(`Prospecto ${prospectId} no encontrado.`);
      }

      prospect.ticketId = dto.ticketId.trim();
      prospect.workOrderId = dto.workOrderId.trim();
      prospect.status = ProspectCaseStatus.TECH_VISIT;
      const saved = await qr.manager.save(ProspectCase, prospect);
      return this.toDto(saved);
    });
  }

  private toDto(entity: ProspectCase): ProspectResponseDto {
    return {
      id: entity.id,
      potentialId: entity.potentialId,
      tenantId: entity.tenantId,
      fullName: entity.fullName,
      address: entity.address,
      selectedPlanId: entity.selectedPlanId,
      status: entity.status,
      ticketId: entity.ticketId,
      workOrderId: entity.workOrderId,
      executionPolicyRef: entity.executionPolicyRef,
      lastRescheduleReason: entity.lastRescheduleReason,
      evidenceMode: entity.evidenceMode,
      conformityEvidenceRef: entity.conformityEvidenceRef,
    };
  }
}
