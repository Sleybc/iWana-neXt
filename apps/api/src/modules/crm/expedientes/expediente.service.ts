import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource, In, Like } from 'typeorm';
import { AuditLog, PlatformUser, runInTenantSchema, TenantContext, User } from '@iwana/db';
import {
  AcquisitionChannel,
  AuditAction,
  ConsentStatus,
  ConsentType,
  ConsentChannel,
  ExpedienteStatus,
  TechnicalViabilityResult,
} from '@iwana/shared';

const DOCUMENT_TYPE_OPTIONS = ['CC', 'CE', 'TI', 'NIT', 'PASAPORTE', 'PEP', 'PPT', 'OTRO'];
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { StatusChange } from './entities/status-change.entity';
import { ContactAttempt } from './entities/contact-attempt.entity';
import { ConsentRecord } from './entities/consent-record-v2.entity';
import { CoverageCheck } from './entities/coverage-check.entity';
import { AuditService } from '../../audit/audit.service';
import { CompletenessCalculator } from './completeness-calculator.service';
import { CreateExpedienteDto } from './dto/create-expediente.dto';
import { UpdateSectionDto, ExpedienteSection } from './dto/update-section.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { CreateContactAttemptDto } from './dto/create-contact-attempt.dto';
import { CreateConsentDto, CONSENT_LEGAL_VERSION } from './dto/create-consent.dto';
import { CreateCoverageCheckDto } from './dto/create-coverage-check.dto';

export interface ExpedienteTimelineActor {
  userId: string | null;
  name: string | null;
}

export interface ExpedienteActivityItem {
  id: string;
  type: 'CREATED' | 'SECTION_UPDATED' | 'STATUS_CHANGED' | 'CONTACT_ATTEMPT';
  occurredAt: Date;
  actor: ExpedienteTimelineActor;
  sectionLabel: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
}

export interface ExpedienteOperationalMetadata {
  createdBy: ExpedienteTimelineActor;
  lastEditedBy: ExpedienteTimelineActor;
  lastActivityAt: Date | null;
}

function hasActorIdentity(actor: ExpedienteTimelineActor | null | undefined): boolean {
  return Boolean(actor?.name?.trim() || actor?.userId);
}

function hasActorName(actor: ExpedienteTimelineActor | null | undefined): boolean {
  return Boolean(actor?.name?.trim());
}

const SECTION_LABELS: Record<string, string> = {
  identification: 'Identificación',
  contact: 'Contacto',
  location: 'Ubicación',
  commercial_interest: 'Interés comercial',
  technical_feasibility: 'Viabilidad técnica',
  legal_consent: 'Consentimiento y validación',
  billing: 'Facturación',
  installation: 'Instalación',
};

/**
 * Servicio para gestionar el Expediente Único Progresivo
 * PRD v2.0 §4.1
 */
@Injectable()
export class ExpedienteService {
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly completenessCalculator: CompletenessCalculator,
  ) {
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
  }

  /**
   * Crear expediente con datos mínimos (nombre + canal de adquisición)
   * CA-01
   */
  async create(dto: CreateExpedienteDto, actorUserId: string): Promise<ExpedienteRecord> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const now = new Date();

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(ExpedienteRecord, {
        tenantId,
        fullName: dto.fullName.trim(),
        acquisitionChannel: dto.acquisitionChannel ?? AcquisitionChannel.OTRO,
        sourceDetail: this.normalizeOptionalText(dto.sourceDetail),
        source:
          this.normalizeOptionalText(dto.sourceDetail) ??
          dto.source?.trim() ??
          dto.acquisitionChannel ??
          AcquisitionChannel.OTRO,
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        previousStatus: null,
        assignedTo: null,
        dataConsentRevoked: false,
        statusChangedAt: now,
        completenessCommercial: 0,
        completenessLegal: 0,
        completenessTechnical: 0,
        completenessOperational: 0,
        checklistCompleted: false,
        createdBy: actorUserId,
      });
      return qr.manager.save(ExpedienteRecord, entity);
    });

    await this.syncCompleteness(created.id, schemaName);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'ExpedienteRecord',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        fullName: created.fullName,
        acquisitionChannel: created.acquisitionChannel,
        sourceDetail: created.sourceDetail,
        status: created.status,
      },
    });

    return this.findById(created.id);
  }

  /**
   * Listar expedientes con filtros opcionales
   */
  async findAll(filters: {
    status?: ExpedienteStatus | undefined;
    municipality?: string | undefined;
    search?: string | undefined;
    assignedTo?: string | undefined;
    documentNumber?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<{ data: ExpedienteRecord[]; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const status = filters.status;
    const municipality = filters.municipality;
    const search = filters.search;
    const assignedTo = filters.assignedTo;
    const documentNumber = filters.documentNumber?.trim();

    const [data, total] = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager.createQueryBuilder(ExpedienteRecord, 'expediente');

      if (status) query.andWhere('expediente.status = :status', { status });
      if (municipality) query.andWhere('expediente.municipality = :municipality', { municipality });
      if (search) query.andWhere('expediente.fullName LIKE :search', { search: `%${search}%` });
      if (assignedTo) query.andWhere('expediente.assignedTo = :assignedTo', { assignedTo });

      query.orderBy('expediente.createdAt', 'DESC');

      if (!documentNumber) {
        query.skip((page - 1) * limit).take(limit);

        const [items, count] = await query.getManyAndCount();
        return [items, count] as const;
      }

      // Cuando hay búsqueda exacta por documento (campo cifrado), se filtra en memoria
      // antes de paginar para evitar perder coincidencias por el recorte inicial.
      const items = await query.getMany();
      const filteredItems = items.filter((item) => {
        if (!item.documentNumberEncrypted) {
          return false;
        }

        try {
          return this.decryptValue(item.documentNumberEncrypted) === documentNumber;
        } catch {
          return false;
        }
      });

      const start = (page - 1) * limit;
      const pagedItems = filteredItems.slice(start, start + limit);

      return [pagedItems, filteredItems.length] as const;
    });

    const hydratedData = await Promise.all(
      data.map(async (item) => {
        const completeness = await this.completenessCalculator.calculate(item.id);
        Object.assign(item, {
          completenessCommercial: completeness.commercial,
          completenessLegal: completeness.legal,
          completenessTechnical: completeness.technical,
          completenessOperational: completeness.operational,
        });
        item.documentNumberEncrypted = null;
        item.phonePrimaryEncrypted = null;
        item.phoneSecondaryEncrypted = null;
        item.emailPrimaryEncrypted = null;
        item.altContactPhoneEncrypted = null;
        item.siteContactPhoneEncrypted = null;
        return item;
      }),
    );

    return { data: hydratedData, total };
  }

  async getPipelineSummary(): Promise<{ data: Record<string, number>; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();

    const rows = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager.createQueryBuilder(ExpedienteRecord, 'expediente');

      return query
        .select('expediente.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('expediente.status')
        .getRawMany<{ status: string; count: string }>();
    });

    const summary: Record<string, number> = {};
    for (const status of Object.values(ExpedienteStatus) as string[]) {
      summary[status] = 0;
    }

    let total = 0;
    for (const row of rows) {
      const count = Number(row.count ?? 0);
      summary[row.status] = count;
      total += count;
    }

    return { data: summary, total };
  }

  /**
   * Obtener expediente por ID con relaciones
   */
  async findById(id: string): Promise<ExpedienteRecord> {
    const { schemaName } = TenantContext.getOrThrow();

    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, {
        where: { id },
        relations: ['contactAttempts', 'consents', 'coverageChecks', 'statusChanges'],
      }),
    );

    if (!entity) {
      throw new NotFoundException(`Expediente ${id} no encontrado`);
    }

    if (entity.documentNumberEncrypted) {
      (entity as ExpedienteRecord & { documentNumber?: string }).documentNumber = this.decryptValue(
        entity.documentNumberEncrypted,
      );

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ExpedienteRecord',
        entityId: id,
        userId: null,
        newValue: { piiaAccess: 'documentNumber', section: 'identification' },
      });
    }

    if (entity.phonePrimaryEncrypted) {
      (entity as ExpedienteRecord & { phonePrimary?: string }).phonePrimary = this.decryptValue(
        entity.phonePrimaryEncrypted,
      );
    }

    if (entity.emailPrimaryEncrypted) {
      (entity as ExpedienteRecord & { emailPrimary?: string }).emailPrimary = this.decryptValue(
        entity.emailPrimaryEncrypted,
      );
    }

    if (entity.altContactPhoneEncrypted) {
      (entity as ExpedienteRecord & { altContactPhone?: string }).altContactPhone =
        this.decryptValue(entity.altContactPhoneEncrypted);
    }

    return entity;
  }

  /**
   * Actualizar una sección específica del expediente
   * CA-02 - Solo esa sección se modifica, completitud se recalcula
   */
  async updateSection(
    id: string,
    dto: UpdateSectionDto,
    actorUserId: string,
  ): Promise<ExpedienteRecord> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    const updateData = this.buildSectionUpdate(dto.section, dto.data);

    if (dto.section === ExpedienteSection.TECHNICAL_FEASIBILITY) {
      const projected = { ...entity, ...updateData } as ExpedienteRecord;
      this.validateTechnicalFeasibilityConsistency(projected);
    }

    Object.assign(entity, updateData);

    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(ExpedienteRecord, entity),
    );

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: { section: dto.section, data: this.sanitizeAuditData(dto.section, dto.data) },
    });

    await this.syncCompleteness(id, schemaName);

    return this.findById(updated.id);
  }

  /**
   * Transición de estado del pipeline
   */
  async transitionStatus(
    id: string,
    dto: TransitionStatusDto,
    actorUserId: string,
  ): Promise<ExpedienteRecord> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    const fromStatus = entity.status;
    const toStatus = dto.targetStatus;
    const actorName = await this.resolveActorName(schemaName, actorUserId);

    if (fromStatus === toStatus) {
      return entity;
    }

    const now = new Date();
    entity.previousStatus = fromStatus;
    entity.status = toStatus;
    entity.statusChangedAt = now;

    if (toStatus === ExpedienteStatus.DESCARTADO && dto.reason) {
      entity.discardReason = dto.reason;
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.save(ExpedienteRecord, entity);

      const statusChange = qr.manager.create(StatusChange, {
        tenantId,
        expedienteId: id,
        fromStatus,
        toStatus,
        changedAt: now,
        changedBy: actorUserId,
        actorName,
        reason: dto.reason ?? null,
      });
      await qr.manager.save(StatusChange, statusChange);
    });

    await this.syncCompleteness(id, schemaName);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: { fromStatus, toStatus, reason: dto.reason },
    });

    return this.findById(id);
  }

  /**
   * Reactivar expediente descartado
   * CA-11
   */
  async reactivate(id: string, actorUserId: string): Promise<ExpedienteRecord> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    if (entity.status !== ExpedienteStatus.DESCARTADO) {
      throw new BadRequestException('Solo expedientes descartados pueden reactivarse');
    }

    const previousStatus = entity.previousStatus || ExpedienteStatus.NUEVO_POTENCIAL;
    const actorName = await this.resolveActorName(schemaName, actorUserId);
    entity.status = previousStatus;
    entity.previousStatus = ExpedienteStatus.DESCARTADO;
    entity.statusChangedAt = new Date();
    entity.discardReason = null;

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.save(ExpedienteRecord, entity);

      const statusChange = qr.manager.create(StatusChange, {
        tenantId,
        expedienteId: id,
        fromStatus: ExpedienteStatus.DESCARTADO,
        toStatus: previousStatus,
        changedAt: new Date(),
        changedBy: actorUserId,
        actorName,
        reason: 'Reactivación de expediente',
      });
      await qr.manager.save(StatusChange, statusChange);
    });

    await this.syncCompleteness(id, schemaName);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: { action: 'reactivate', previousStatus },
    });

    return this.findById(id);
  }

  async createContactAttempt(
    expedienteId: string,
    dto: CreateContactAttemptDto,
    actorUserId: string,
  ): Promise<ContactAttempt> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const expediente = await this.findById(expedienteId);
    const actorName = await this.resolveActorName(schemaName, actorUserId);
    const persistenceActorId = this.resolvePersistenceActorId(actorUserId, expediente.createdBy);

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(ContactAttempt, {
        tenantId,
        expedienteId,
        attemptedAt: new Date(),
        channel: dto.channel,
        result: dto.result,
        durationMinutes: dto.durationMinutes ?? null,
        notes: dto.notes ? this.sanitizePlainText(dto.notes) : null,
        advisorId: persistenceActorId,
        actorName,
      });

      return qr.manager.save(ContactAttempt, entity);
    });

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'ContactAttempt',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        expedienteId,
        channel: created.channel,
        result: created.result,
      },
    });

    return created;
  }

  async listContactAttempts(
    expedienteId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: ContactAttempt[]; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    const [data, total] = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager.createQueryBuilder(ContactAttempt, 'attempt');

      query
        .where('attempt.expedienteId = :expedienteId', { expedienteId })
        .orderBy('attempt.attemptedAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      return query.getManyAndCount();
    });

    return { data, total };
  }

  async createConsent(
    expedienteId: string,
    dto: CreateConsentDto,
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<ConsentRecord> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await this.findById(expedienteId);
    const normalizedConsentType = this.normalizeConsentType(dto.consentType);
    const normalizedConsentStatus = this.normalizeConsentStatus(dto.status);

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (normalizedConsentStatus === ConsentStatus.ACEPTADO) {
        const existingAccepted = await qr.manager.findOne(ConsentRecord, {
          where: {
            expedienteId,
            consentType: normalizedConsentType,
            status: ConsentStatus.ACEPTADO,
          },
        });

        if (existingAccepted) {
          throw new BadRequestException({
            code: 'CONSENT_ALREADY_ACCEPTED',
            message: 'Ya existe un consentimiento aceptado para este tipo.',
          });
        }
      }

      const entity = qr.manager.create(ConsentRecord, {
        tenantId,
        expedienteId,
        legacyProspectId: expedienteId,
        consentType: normalizedConsentType,
        status: normalizedConsentStatus,
        legacyAccepted: normalizedConsentStatus === ConsentStatus.ACEPTADO,
        channel: dto.channel,
        obtainedAt: new Date(),
        ipAddress,
        legalTextVersion: dto.legalTextVersion?.trim() || CONSENT_LEGAL_VERSION,
        evidenceRef: dto.evidenceRef?.trim() ?? null,
        revokedAt: null,
        revokedReason: null,
        revokedBy: null,
      });

      return qr.manager.save(ConsentRecord, entity);
    });

    await this.syncCompleteness(expedienteId, schemaName);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'ConsentRecord',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        expedienteId,
        consentType: created.consentType,
        status: created.status,
      },
    });

    return created;
  }

  async listConsents(expedienteId: string): Promise<ConsentRecord[]> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(ConsentRecord, {
        where: { expedienteId },
        order: { obtainedAt: 'DESC' },
      }),
    );
  }

  async revokeConsent(
    expedienteId: string,
    consentId: string,
    reason: string,
    actorUserId: string,
  ): Promise<ConsentRecord> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ConsentRecord, {
        where: { id: consentId, expedienteId },
      });

      if (!entity) {
        throw new NotFoundException(`Consentimiento ${consentId} no encontrado`);
      }

      entity.status = ConsentStatus.RECHAZADO;
      entity.legacyAccepted = false;
      entity.revokedAt = new Date();
      entity.revokedReason = this.sanitizePlainText(reason);
      entity.revokedBy = actorUserId;

      if (entity.consentType === ConsentType.TRATAMIENTO_DATOS) {
        await qr.manager.update(
          ExpedienteRecord,
          { id: expedienteId },
          { dataConsentRevoked: true },
        );
      }

      return qr.manager.save(ConsentRecord, entity);
    });

    await this.syncCompleteness(expedienteId, schemaName);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ConsentRecord',
      entityId: consentId,
      userId: actorUserId,
      newValue: {
        expedienteId,
        status: ConsentStatus.RECHAZADO,
        reason: this.sanitizePlainText(reason),
      },
    });

    return updated;
  }

  async createCoverageCheck(
    expedienteId: string,
    dto: CreateCoverageCheckDto,
    actorUserId: string,
  ): Promise<CoverageCheck> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const expediente = await this.findById(expedienteId);
    const persistenceActorId = this.resolvePersistenceActorId(actorUserId, expediente.createdBy);

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(CoverageCheck, {
        tenantId,
        expedienteId,
        checkedAt: new Date(),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        addressUsed: dto.addressUsed.trim(),
        result: dto.result,
        technologyAvailable: dto.technologyAvailable?.trim() ?? null,
        distanceM: dto.distanceM ?? null,
        snapshotJson: dto.snapshotJson ?? {},
        checkedBy: persistenceActorId,
      });

      const saved = await qr.manager.save(CoverageCheck, entity);

      await qr.manager.update(
        ExpedienteRecord,
        { id: expedienteId },
        {
          coverageResult: dto.result,
          availableTechnology: dto.technologyAvailable?.trim() ?? expediente.availableTechnology,
          estimatedDistanceM: dto.distanceM ?? expediente.estimatedDistanceM,
          feasibility: dto.result,
        },
      );

      return saved;
    });

    await this.syncCompleteness(expedienteId, schemaName);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'CoverageCheck',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        expedienteId,
        result: created.result,
        technologyAvailable: created.technologyAvailable,
      },
    });

    return created;
  }

  async listCoverageChecks(expedienteId: string): Promise<CoverageCheck[]> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(CoverageCheck, {
        where: { expedienteId },
        order: { checkedAt: 'DESC' },
      }),
    );
  }

  async getTimelineSummary(id: string): Promise<{
    changes: Array<{
      id: string;
      fromStatus: string;
      toStatus: string;
      changedAt: Date;
      reason: string | null;
      actor: ExpedienteTimelineActor;
    }>;
    activities: ExpedienteActivityItem[];
    metadata: ExpedienteOperationalMetadata;
  }> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const auditLogs = await qr.manager.find(AuditLog, {
        where: { entityType: 'ExpedienteRecord', entityId: id },
        order: { createdAt: 'DESC' },
      });

      const actorIds = new Set<string>();

      if (entity.createdBy) {
        actorIds.add(entity.createdBy);
      }

      for (const change of entity.statusChanges ?? []) {
        if (change.changedBy) {
          actorIds.add(change.changedBy);
        }
      }

      for (const attempt of entity.contactAttempts ?? []) {
        if (attempt.advisorId) {
          actorIds.add(attempt.advisorId);
        }
      }

      for (const log of auditLogs) {
        if (log.userId) {
          actorIds.add(log.userId);
        }
      }

      const users = actorIds.size
        ? await qr.manager.find(User, { where: { id: In(Array.from(actorIds)) } })
        : [];

      // Para actores no encontrados en el schema tenant (p.ej. SYSTEM_ADMIN es PlatformUser),
      // buscar en la tabla publica de usuarios de plataforma.
      const foundTenantIds = new Set(users.map((u) => u.id));
      const unmatchedIds = Array.from(actorIds).filter((id) => !foundTenantIds.has(id));
      const platformUsers = unmatchedIds.length
        ? await qr.manager.find(PlatformUser, { where: { id: In(unmatchedIds) } })
        : [];

      const actorMap = new Map<string, ExpedienteTimelineActor>();
      for (const user of users) {
        actorMap.set(user.id, { userId: user.id, name: this.formatActorName(user) });
      }
      for (const pu of platformUsers) {
        actorMap.set(pu.id, { userId: pu.id, name: this.formatActorName(pu) });
      }

      const getActor = (userId: string | null | undefined): ExpedienteTimelineActor => {
        if (!userId) {
          return { userId: null, name: null };
        }

        return actorMap.get(userId) ?? { userId, name: null };
      };

      const changes = [...(entity.statusChanges ?? [])]
        .sort((left, right) => right.changedAt.getTime() - left.changedAt.getTime())
        .map((change) => ({
          id: change.id,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          changedAt: change.changedAt,
          reason: change.reason,
          actor: change.actorName
            ? { userId: change.changedBy, name: change.actorName }
            : getActor(change.changedBy),
        }));

      const statusActivities: ExpedienteActivityItem[] = changes.map((change) => ({
        id: `status:${change.id}`,
        type: 'STATUS_CHANGED',
        occurredAt: change.changedAt,
        actor: change.actor,
        sectionLabel: null,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        reason: change.reason,
      }));

      const auditActivities: ExpedienteActivityItem[] = [];
      const contactAttemptActivities: ExpedienteActivityItem[] = [...(entity.contactAttempts ?? [])]
        .sort((left, right) => right.attemptedAt.getTime() - left.attemptedAt.getTime())
        .map((attempt) => ({
          id: `contact:${attempt.id}`,
          type: 'CONTACT_ATTEMPT',
          occurredAt: attempt.attemptedAt,
          actor: attempt.actorName
            ? { userId: attempt.advisorId, name: attempt.actorName }
            : getActor(attempt.advisorId),
          sectionLabel: 'Intento de contacto',
          fromStatus: null,
          toStatus: null,
          reason: attempt.notes,
        }));

      for (const log of auditLogs) {
        const newValue = log.newValue ?? null;
        const section =
          typeof newValue?.['section'] === 'string' ? String(newValue['section']) : null;

        if (log.action === AuditAction.CREATE) {
          auditActivities.push({
            id: `audit:${log.id}`,
            type: 'CREATED',
            occurredAt: log.createdAt,
            actor: getActor(log.userId),
            sectionLabel: null,
            fromStatus: null,
            toStatus: null,
            reason: null,
          });
          continue;
        }

        if (log.action === AuditAction.UPDATE && section) {
          auditActivities.push({
            id: `audit:${log.id}`,
            type: 'SECTION_UPDATED',
            occurredAt: log.createdAt,
            actor: getActor(log.userId),
            sectionLabel: SECTION_LABELS[section] ?? section,
            fromStatus: null,
            toStatus: null,
            reason: null,
          });
        }
      }

      const activities = [
        ...statusActivities,
        ...auditActivities,
        ...contactAttemptActivities,
      ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());

      const createAuditActor = auditActivities
        .filter((activity) => activity.type === 'CREATED')
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
        .find(
          (activity) => hasActorName(activity.actor) || hasActorIdentity(activity.actor),
        )?.actor;

      const firstKnownActor = [...auditActivities]
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
        .find(
          (activity) => hasActorName(activity.actor) || hasActorIdentity(activity.actor),
        )?.actor;

      const createdByFromEntity = getActor(entity.createdBy);
      const createdBy = hasActorName(createdByFromEntity)
        ? createdByFromEntity
        : (createAuditActor ?? firstKnownActor ?? createdByFromEntity);

      const lastEditedBy =
        activities.find(
          (activity) => hasActorName(activity.actor) || hasActorIdentity(activity.actor),
        )?.actor ?? createdBy;
      const lastActivityAt = activities[0]?.occurredAt ?? entity.updatedAt;

      return {
        changes,
        activities,
        metadata: {
          createdBy,
          lastEditedBy,
          lastActivityAt,
        },
      };
    });
  }

  /**
   * Construir actualización según sección
   */
  private buildSectionUpdate(
    section: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    switch (section) {
      case ExpedienteSection.IDENTIFICATION:
        return this.buildIdentificationSectionUpdate(data);

      case ExpedienteSection.CONTACT:
        if (data.phonePrimary)
          result.phonePrimaryEncrypted = this.encryptValue(String(data.phonePrimary));
        if (data.phoneSecondary)
          result.phoneSecondaryEncrypted = this.encryptValue(String(data.phoneSecondary));
        if (data.emailPrimary)
          result.emailPrimaryEncrypted = this.encryptValue(String(data.emailPrimary));
        if (data.emailSecondary) result.emailSecondary = String(data.emailSecondary);
        if ('altContactName' in data) {
          const altContactName = String(data.altContactName ?? '').trim();
          result.altContactName = altContactName ? altContactName : null;
        }
        if ('altContactPhone' in data) {
          const altContactPhone = String(data.altContactPhone ?? '').trim();
          result.altContactPhoneEncrypted = altContactPhone
            ? this.encryptValue(altContactPhone)
            : null;
        }
        if (data.contactPreference) result.contactPreference = String(data.contactPreference);
        if (data.bestContactTime) result.bestContactTime = String(data.bestContactTime);
        break;

      case ExpedienteSection.LOCATION:
        if (data.address) result.address = String(data.address);
        if (data.municipality) result.municipality = String(data.municipality);
        if (data.department) result.department = String(data.department);
        if ('stratum' in data) {
          const parsedStratum = this.parseOptionalNumber(data.stratum, 'stratum');
          result.stratum = parsedStratum;
        }
        if (data.neighborhood) result.neighborhood = String(data.neighborhood);
        if ('latitude' in data) {
          const parsedLatitude = this.parseOptionalNumber(data.latitude, 'latitude', {
            normalizeDecimalComma: true,
          });
          result.latitude = parsedLatitude;
        }
        if ('longitude' in data) {
          const parsedLongitude = this.parseOptionalNumber(data.longitude, 'longitude', {
            normalizeDecimalComma: true,
          });
          result.longitude = parsedLongitude;
        }
        if (data.coordinatesSource) result.coordinatesSource = String(data.coordinatesSource);
        if (data.coordinatesConfidence)
          result.coordinatesConfidence = String(data.coordinatesConfidence);
        if (data.accessReferences) result.accessReferences = String(data.accessReferences);
        if (data.zoneType) result.zoneType = String(data.zoneType);
        break;

      case ExpedienteSection.COMMERCIAL_INTEREST:
        if ('acquisitionChannel' in data && data.acquisitionChannel) {
          const acquisitionChannel = String(data.acquisitionChannel);
          result.acquisitionChannel = acquisitionChannel;
          result.source = acquisitionChannel;
        }
        if ('sourceDetail' in data) {
          const sourceDetail = this.normalizeOptionalText(data.sourceDetail);
          result.sourceDetail = sourceDetail;
          if (sourceDetail) {
            result.source = sourceDetail;
          }
        }
        if (data.source) {
          const source = String(data.source);
          result.source = source;
          if (!('sourceDetail' in data)) {
            result.sourceDetail = source;
          }
        }
        if (data.interestedPlanId) result.interestedPlanId = String(data.interestedPlanId);
        if (data.campaign) result.campaign = String(data.campaign);
        if (data.casePriority) result.casePriority = String(data.casePriority);
        if (data.estimatedBudget) result.estimatedBudget = Number(data.estimatedBudget);
        if (data.commercialNotes) result.commercialNotes = String(data.commercialNotes);
        break;

      case ExpedienteSection.TECHNICAL_FEASIBILITY:
        if ('coverageResult' in data)
          result.coverageResult = this.normalizeOptionalEnum(data.coverageResult);
        if ('availableTechnology' in data)
          result.availableTechnology = this.normalizeOptionalEnum(data.availableTechnology);
        if ('estimatedDistanceM' in data)
          result.estimatedDistanceM = this.parseOptionalNumber(
            data.estimatedDistanceM,
            'estimatedDistanceM',
          );
        if ('feasibility' in data)
          result.feasibility = this.normalizeOptionalEnum(data.feasibility);
        if ('candidateTechnologies' in data)
          result.candidateTechnologies = this.parseStringArray(data.candidateTechnologies);
        if ('technicalConfidence' in data)
          result.technicalConfidence = this.normalizeOptionalEnum(data.technicalConfidence);
        if ('evaluationSource' in data)
          result.evaluationSource = this.normalizeOptionalEnum(data.evaluationSource);
        if ('technicalObservations' in data)
          result.technicalObservations = this.normalizeOptionalText(data.technicalObservations);
        if ('estimatedEquipment' in data)
          result.estimatedEquipment = this.normalizeOptionalText(data.estimatedEquipment);
        break;

      case ExpedienteSection.LEGAL_CONSENT:
        if (data.identityVerified) result.identityVerified = String(data.identityVerified);
        if (data.legalComplianceStatus)
          result.legalComplianceStatus = String(data.legalComplianceStatus);
        break;

      case ExpedienteSection.BILLING:
        if (data.paymentMethod) result.paymentMethod = String(data.paymentMethod);
        if (data.billingCycle) result.billingCycle = String(data.billingCycle);
        if (data.fiscalName) result.fiscalName = String(data.fiscalName);
        if (data.fiscalDocument) result.fiscalDocument = String(data.fiscalDocument);
        if (data.fiscalAddress) result.fiscalAddress = String(data.fiscalAddress);
        if (data.rutReference) result.rutReference = String(data.rutReference);
        break;

      case ExpedienteSection.INSTALLATION:
        if (data.installationAddress) result.installationAddress = String(data.installationAddress);
        if (data.availabilityWindow) result.availabilityWindow = String(data.availabilityWindow);
        if (data.siteContactName) result.siteContactName = String(data.siteContactName);
        if (data.siteContactPhone)
          result.siteContactPhoneEncrypted = this.encryptValue(String(data.siteContactPhone));
        if (data.specialAccessNotes) result.specialAccessNotes = String(data.specialAccessNotes);
        if (data.requiredMaterials) result.requiredMaterials = String(data.requiredMaterials);
        break;
    }

    return result;
  }

  private parseOptionalNumber(
    value: unknown,
    fieldName: string,
    options?: { normalizeDecimalComma?: boolean },
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return null;
      }

      const normalizedValue = options?.normalizeDecimalComma
        ? trimmedValue.replace(',', '.')
        : trimmedValue;
      const parsed = Number(normalizedValue);
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException({
          code: 'INVALID_NUMERIC_VALUE',
          message: `El campo ${fieldName} debe ser numérico válido.`,
          field: fieldName,
        });
      }
      return parsed;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException({
          code: 'INVALID_NUMERIC_VALUE',
          message: `El campo ${fieldName} debe ser numérico válido.`,
          field: fieldName,
        });
      }
      return value;
    }

    throw new BadRequestException({
      code: 'INVALID_NUMERIC_VALUE',
      message: `El campo ${fieldName} debe ser numérico válido.`,
      field: fieldName,
    });
  }

  private buildIdentificationSectionUpdate(data: Record<string, unknown>): Record<string, unknown> {
    const personType = this.requireAllowedValue(
      data.personType,
      ['PERSONA_NATURAL', 'PERSONA_JURIDICA'],
      'Tipo de persona',
    );
    const documentType = this.requireAllowedValue(
      data.documentType,
      DOCUMENT_TYPE_OPTIONS,
      'Tipo de documento',
    );
    const documentNumber = this.requireNonEmptyText(data.documentNumber, 'Numero de documento');

    if (personType === 'PERSONA_NATURAL') {
      const firstName = this.requireNonEmptyText(data.firstName, 'Nombres');
      const lastName = this.requireNonEmptyText(data.lastName, 'Apellidos');
      return {
        personType,
        firstName: this.sanitizePlainText(String(firstName)),
        lastName: this.sanitizePlainText(String(lastName)),
        companyName: null,
        primaryContactName: null,
        primaryContactRole: null,
        documentType,
        documentNumberEncrypted: this.encryptValue(String(documentNumber)),
        fullName: `${firstName} ${lastName}`.trim(),
      };
    }

    const companyName = this.requireNonEmptyText(data.companyName, 'Razon social');
    const primaryContactName = this.requireNonEmptyText(
      data.primaryContactName,
      'Contacto principal',
    );
    const primaryContactRole = this.requireNonEmptyText(
      data.primaryContactRole,
      'Cargo del contacto',
    );
    return {
      personType,
      firstName: null,
      lastName: null,
      companyName: this.sanitizePlainText(String(companyName)),
      primaryContactName: this.sanitizePlainText(String(primaryContactName)),
      primaryContactRole: this.sanitizePlainText(String(primaryContactRole)),
      documentType,
      documentNumberEncrypted: this.encryptValue(String(documentNumber)),
      fullName: String(companyName),
    };
  }

  private requireAllowedValue(value: unknown, allowedValues: string[], fieldName: string): string {
    const stringValue = String(value ?? '');
    if (!allowedValues.includes(stringValue)) {
      throw new BadRequestException(`${fieldName} no es un valor permitido`);
    }
    return stringValue;
  }

  private requireNonEmptyText(value: unknown, fieldName: string): string {
    const stringValue = String(value ?? '').trim();
    if (!stringValue) {
      throw new BadRequestException(`${fieldName} es requerido`);
    }
    return this.sanitizePlainText(stringValue);
  }

  private sanitizeAuditData(
    section: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    if (section === ExpedienteSection.IDENTIFICATION) {
      const sanitized = { ...data };
      if (sanitized.documentNumber) {
        sanitized.documentNumber = '[REDACTED]';
      }
      return sanitized;
    }
    return data;
  }

  private sanitizePlainText(value: string): string {
    return value.replace(/<[^>]*>/g, '').trim();
  }

  private normalizeConsentType(value: CreateConsentDto['consentType']): ConsentType {
    if (value === 'DATA_TREATMENT') {
      return ConsentType.TRATAMIENTO_DATOS;
    }

    if (value === 'COMMERCIAL_CONTACT') {
      return ConsentType.CONTACTO_COMERCIAL;
    }

    if (value === 'OPERATIONAL_CONTACT') {
      return ConsentType.CONTACTO_OPERATIVO;
    }

    return value;
  }

  private parseStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const parsed = value.map((item) => String(item ?? '').trim()).filter(Boolean);

    return parsed.length > 0 ? parsed : null;
  }

  private normalizeOptionalEnum(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalText(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? this.sanitizePlainText(normalized) : null;
  }

  private validateTechnicalFeasibilityConsistency(expediente: ExpedienteRecord): void {
    const feasibility = expediente.feasibility;
    if (!feasibility) {
      return;
    }

    const hasCandidateTechnologies = (expediente.candidateTechnologies?.length ?? 0) > 0;
    const hasRecommendedTechnology = Boolean(expediente.availableTechnology);
    const hasConfidence = Boolean(expediente.technicalConfidence);
    const hasEvaluationSource = Boolean(expediente.evaluationSource);
    const hasObservations = Boolean(expediente.technicalObservations?.trim());

    if (feasibility === TechnicalViabilityResult.VIABLE) {
      if (!hasCandidateTechnologies) {
        throw new BadRequestException({
          code: 'CANDIDATE_TECHNOLOGIES_REQUIRED',
          message:
            'Debes registrar al menos una tecnologia candidata cuando la viabilidad es viable.',
        });
      }

      if (!hasRecommendedTechnology) {
        throw new BadRequestException({
          code: 'TECHNOLOGY_RECOMMENDATION_REQUIRED',
          message: 'La tecnologia recomendada es obligatoria cuando la viabilidad es viable.',
        });
      }

      if (!hasConfidence || !hasEvaluationSource) {
        throw new BadRequestException({
          code: 'TECHNICAL_CONFIDENCE_AND_SOURCE_REQUIRED',
          message:
            'Nivel de certeza y fuente de evaluacion son obligatorios cuando la viabilidad es viable.',
        });
      }

      return;
    }

    if (feasibility === TechnicalViabilityResult.VALIDATION_REQUIRED) {
      if (!hasCandidateTechnologies || !hasConfidence || !hasEvaluationSource || !hasObservations) {
        throw new BadRequestException({
          code: 'VALIDATION_REQUIRED_FIELDS_MISSING',
          message:
            'Para validacion tecnica requerida debes registrar tecnologias candidatas, certeza, fuente y observacion tecnica.',
        });
      }

      return;
    }

    if (feasibility === TechnicalViabilityResult.NOT_VIABLE) {
      if (!hasEvaluationSource || !hasObservations) {
        throw new BadRequestException({
          code: 'NOT_VIABLE_FIELDS_MISSING',
          message: 'Para no viable debes registrar fuente de evaluacion y observacion tecnica.',
        });
      }
    }
  }

  private normalizeConsentStatus(value: CreateConsentDto['status']): ConsentStatus {
    if (value === 'PENDING') {
      return ConsentStatus.PENDIENTE;
    }

    if (value === 'ACCEPTED') {
      return ConsentStatus.ACEPTADO;
    }

    if (value === 'REJECTED') {
      return ConsentStatus.RECHAZADO;
    }

    if (value === 'REVOKED') {
      return ConsentStatus.REVOCADO;
    }

    return value;
  }

  /**
   * Algunos usuarios de plataforma pueden autenticarse con `sub` no UUID.
   * Las tablas tenant exigen UUID en columnas operativas (`advisor_id`, `checked_by`).
   * Si el actor actual no cumple, degradamos a `createdBy` del expediente para evitar 500.
   */
  private resolvePersistenceActorId(actorUserId: string, fallbackUserId: string): string {
    if (this.isUuid(actorUserId)) {
      return actorUserId;
    }

    if (this.isUuid(fallbackUserId)) {
      return fallbackUserId;
    }

    throw new BadRequestException({
      code: 'INVALID_ACTOR_ID',
      message:
        'No fue posible resolver un identificador válido del actor para persistir la operación.',
    });
  }

  private isUuid(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveActorName(schemaName: string, userId: string): Promise<string | null> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUser = await qr.manager.findOne(User, { where: { id: userId } });
      if (tenantUser) {
        return this.formatActorName(tenantUser);
      }

      const platformUser = await qr.manager.findOne(PlatformUser, { where: { id: userId } });
      if (platformUser) {
        return this.formatActorName(platformUser);
      }

      return null;
    });
  }

  private encryptValue(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private formatActorName(user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  }): string | null {
    const firstName = this.decodeProfileValue(user.firstName);
    const lastName = this.decodeProfileValue(user.lastName);
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    if (fullName) {
      return fullName;
    }

    return this.decodeProfileValue(user.email);
  }

  private decryptValue(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de valor cifrado inválido.');
    }

    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const ciphertext = Buffer.from(parts[2]!, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private decodeProfileValue(value: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!this.looksLikeEncryptedValue(value)) {
      return value;
    }

    try {
      return this.decryptValue(value);
    } catch {
      return null;
    }
  }

  private looksLikeEncryptedValue(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return false;
    }

    const [iv, authTag, ciphertext] = parts;
    const isHex = (segment: string, expectedLength?: number) => {
      if (!segment || (expectedLength && segment.length !== expectedLength)) {
        return false;
      }

      return /^[0-9a-f]+$/i.test(segment) && segment.length % 2 === 0;
    };

    return isHex(iv ?? '', 24) && isHex(authTag ?? '', 32) && isHex(ciphertext ?? '');
  }

  private async syncCompleteness(expedienteId: string, schemaName: string): Promise<void> {
    const completeness = await this.completenessCalculator.calculate(expedienteId);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(
        ExpedienteRecord,
        { id: expedienteId },
        {
          completenessCommercial: completeness.commercial,
          completenessLegal: completeness.legal,
          completenessTechnical: completeness.technical,
          completenessOperational: completeness.operational,
        },
      );
    });
  }
}
