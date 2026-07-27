import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction, type ListResponse } from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { CoverageReadPort } from '../ports/coverage-read.port';
import { PlanCatalogReadPort } from '../ports/plan-catalog-read.port';
import { AuditService } from '../../audit/audit.service';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
} from '../../../common/crypto/aes-gcm.util';
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
  private readonly encryptionKeyPrevious: Buffer | null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly coverageReadPort: CoverageReadPort,
    private readonly planCatalogReadPort: PlanCatalogReadPort,
    private readonly auditService: AuditService,
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.encryptionKey = keys.activeKey;
    this.encryptionKeyPrevious = keys.previousKey;
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
      // GSEC-04: sin fullName (PII) en audit manual
      newValue: {
        source: created.source,
        qualified: created.qualified,
      },
    });

    return this.toDto(created);
  }

  async findAll(
    filters: {
      page?: number;
      limit?: number;
    } = {},
  ): Promise<ListResponse<PotentialResponseDto>> {
    const { schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    const { items, total } = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [rows, count] = await qr.manager
        .createQueryBuilder(PotentialLead, 'p')
        .orderBy('p.createdAt', 'DESC')
        .addOrderBy('p.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      return { items: rows, total: count };
    });

    return {
      data: items.map((item) => this.toDto(item)),
      meta: buildPageMeta({
        total,
        page,
        limit,
        randomAccess: true,
        sortableFields: [],
      }),
    };
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
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }

  private decryptValue(encrypted: string): string {
    return decryptAes256Gcm(encrypted, this.encryptionKey, this.encryptionKeyPrevious);
  }
}
