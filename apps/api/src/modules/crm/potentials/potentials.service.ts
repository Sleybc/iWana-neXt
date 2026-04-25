import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { CoverageReadPort } from '../ports/coverage-read.port';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { AuditService } from '../../audit/audit.service';
import { PotentialLead } from './entities/potential-lead.entity';
import { ProspectCase } from '../prospects/entities/prospect-case.entity';
import { ConsentRecord } from '../reviews/entities/consent-record.entity';
import { ProspectCaseStatus } from '../enums/prospect-case-status.enum';
import { CreatePotentialDto } from './dto/create-potential.dto';
import { PotentialResponseDto } from './dto/potential-response.dto';
import { QualifyPotentialDto } from './dto/qualify-potential.dto';
import { ProspectResponseDto } from '../prospects/dto/prospect-response.dto';

@Injectable()
export class PotentialsService {
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly coverageReadPort: CoverageReadPort,
    private readonly planCatalogReadPort: PlanCatalogReadPort,
    private readonly auditService: AuditService,
  ) {
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
  }

  async create(dto: CreatePotentialDto): Promise<PotentialResponseDto> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(PotentialLead, {
        tenantId,
        fullName: dto.fullName.trim(),
        emailEncrypted: dto.email ? this.encryptValue(dto.email.toLowerCase().trim()) : null,
        phoneEncrypted: dto.phone ? this.encryptValue(dto.phone.trim()) : null,
        source: dto.source.trim(),
        notes: dto.notes?.trim() ?? null,
        qualified: false,
      });
      return qr.manager.save(PotentialLead, entity);
    });

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'PotentialLead',
      entityId: created.id,
      newValue: {
        fullName: created.fullName,
        source: created.source,
        qualified: created.qualified,
      },
    });

    return this.toDto(created);
  }

  async findAll(): Promise<PotentialResponseDto[]> {
    const { schemaName } = TenantContext.getOrThrow();
    const items = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(PotentialLead, { order: { createdAt: 'DESC' } }),
    );
    return items.map((item) => this.toDto(item));
  }

  async qualify(id: string, dto: QualifyPotentialDto): Promise<ProspectResponseDto> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const coverage = await this.coverageReadPort.checkAvailability(
      tenantId,
      schemaName,
      dto.address,
      dto.coordinates,
    );
    const plans = await this.planCatalogReadPort.getActivePlans(tenantId, schemaName);
    const selectedPlan = plans.find((item) => item.id === dto.planId);

    if (!coverage.available || !selectedPlan) {
      throw new BadRequestException(
        'La calificacion requiere cobertura disponible y un plan elegible.',
      );
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const potential = await qr.manager.findOne(PotentialLead, { where: { id } });
      if (!potential) {
        throw new NotFoundException(`Potencial ${id} no encontrado.`);
      }

      potential.qualified = true;
      await qr.manager.save(PotentialLead, potential);

      const prospect = qr.manager.create(ProspectCase, {
        tenantId,
        potentialId: potential.id,
        fullName: potential.fullName,
        address: dto.address.trim(),
        selectedPlanId: dto.planId,
        status: ProspectCaseStatus.PROSPECT,
        ticketId: null,
        workOrderId: null,
        inventoryAssignmentRef: null,
        expansionRequestId: null,
        executionPolicyRef: null,
        checklistCompleted: false,
        evidenceMode: null,
        conformityEvidenceRef: null,
        lastRescheduleReason: null,
        lastRescheduleNotes: null,
        coverageSnapshotJson: {
          available: coverage.available,
          nodes: coverage.nodes,
        },
      });
      const savedProspect = await qr.manager.save(ProspectCase, prospect);

      const consent = qr.manager.create(ConsentRecord, {
        tenantId,
        prospectId: savedProspect.id,
        accepted: dto.consentAccepted,
        channel: dto.consentChannel.trim(),
        ipAddress: null,
        legalTextVersion: dto.legalTextVersion.trim(),
      });
      await qr.manager.save(ConsentRecord, consent);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ProspectCase',
        entityId: savedProspect.id,
        newValue: {
          status: savedProspect.status,
          selectedPlanId: savedProspect.selectedPlanId,
          potentialId: potential.id,
        },
      });

      return this.toProspectDto(savedProspect);
    });
  }

  private toDto(entity: PotentialLead): PotentialResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      fullName: entity.fullName,
      email: entity.emailEncrypted ? this.decryptValue(entity.emailEncrypted) : null,
      phone: entity.phoneEncrypted ? this.decryptValue(entity.phoneEncrypted) : null,
      source: entity.source,
      notes: entity.notes,
      qualified: entity.qualified,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toProspectDto(entity: ProspectCase): ProspectResponseDto {
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

  private encryptValue(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptValue(encrypted: string): string {
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const ciphertext = Buffer.from(parts[2]!, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
