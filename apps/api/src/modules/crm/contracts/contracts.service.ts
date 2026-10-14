import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MediaUsage, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  PersonType,
  ServiceUsage,
  type InternetVatResult,
  type ListResponse,
} from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { Contract } from './entities/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractFromExpedienteDto } from './dto/create-contract-from-expediente.dto';
import { UpdateServicePointDto } from './dto/update-service-point.dto';
import {
  CONTRACT_PLAN_ID_MAX_LENGTH,
  normalizeContractPlanId,
} from './utils/contract-plan-id.util';
import { ContractStatus } from '../enums/contract-status.enum';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { IInternetVatResolverPort } from '../../taxation/ports/internet-vat-resolver.port';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import { AuditService } from '../../audit/audit.service';
import type { AuditEntryInput } from '../../audit/interfaces/audit-entry.interface';
import { MediaService } from '../../media/media.service';
import { IPrivacyAuthorizationReadPort } from '../../privacy/ports/privacy-authorization-read.port';

/** Transiciones de estado permitidas según máquina de estados del spec. */
const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  [ContractStatus.DRAFT]: [ContractStatus.ACTIVE],
  [ContractStatus.ACTIVE]: [ContractStatus.SUSPENDED, ContractStatus.TERMINATED],
  [ContractStatus.SUSPENDED]: [
    ContractStatus.ACTIVE,
    ContractStatus.TERMINATED,
    ContractStatus.ARCHIVED,
  ],
  [ContractStatus.TERMINATED]: [ContractStatus.ARCHIVED],
  [ContractStatus.ARCHIVED]: [],
};

const AUDITABLE_CONTRACT_UPDATE_FIELDS = new Set([
  'alias',
  'quoteId',
  'installationAddress',
  'installationCity',
  'installationDepartment',
  'installationPostalCode',
  'customerSegment',
  'serviceUsage',
  'installationStratum',
  'additionalProductIds',
  'additionalServiceIds',
  'paymentMethod',
  'billingCycle',
  'fiscalName',
  'fiscalDocument',
  'fiscalAddress',
  'startDate',
  'endDate',
  'planSnapshotJson',
]);

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly commercialCatalogPort: CommercialCatalogReadPort,
    private readonly internetVatResolver: IInternetVatResolverPort,
    private readonly auditService: AuditService,
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(IPrivacyAuthorizationReadPort)
    private readonly privacyAuthorizationReadPort?: IPrivacyAuthorizationReadPort,
  ) {}

  // ── Creación ────────────────────────────────────────────────────────────────

  async create(dto: CreateContractDto, actorId?: string): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const planId = this._requirePlanId(
      dto.planId,
      `El plan del contrato debe tener entre 1 y ${CONTRACT_PLAN_ID_MAX_LENGTH} caracteres.`,
    );

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: dto.subscriberId, tenantId },
        select: { id: true, tenantId: true, personType: true, partyId: true },
      });
      if (!subscriber) {
        throw new NotFoundException('Suscriptor del contrato no encontrado.');
      }
      await this.requireContractualAuthorization(subscriber.partyId);

      const installationStratum = dto.installationStratum ?? null;
      const serviceUsage = dto.serviceUsage ?? null;
      if (serviceUsage === ServiceUsage.RESIDENTIAL) {
        this._validateServicePoint(serviceUsage, installationStratum, subscriber.personType);
      }

      const alias =
        dto.alias?.trim() || this._buildAlias(dto.installationCity, dto.installationAddress);

      const entity = qr.manager.create(Contract, {
        tenantId,
        quoteId: dto.quoteId ?? null,
        subscriberId: dto.subscriberId,
        planId,
        planSnapshotJson: dto.planSnapshotJson,
        status: ContractStatus.DRAFT,
        alias,
        installationAddress: dto.installationAddress ?? null,
        installationCity: dto.installationCity ?? null,
        installationDepartment: dto.installationDepartment ?? null,
        installationPostalCode: dto.installationPostalCode ?? null,
        installationNotes: dto.installationNotes ?? null,
        customerSegment: dto.customerSegment ?? null,
        serviceUsage,
        installationStratum,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        additionalProductIds: dto.additionalProductIds ?? [],
        additionalServiceIds: dto.additionalServiceIds ?? [],
        paymentMethod: dto.paymentMethod ?? null,
        billingCycle: dto.billingCycle ?? null,
        fiscalName: dto.fiscalName ?? null,
        fiscalDocument: dto.fiscalDocument ?? null,
        fiscalAddress: dto.fiscalAddress ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
      });

      return qr.manager.save(Contract, entity);
    });
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'Contract',
      entityId: created.id,
      userId: actorId ?? null,
      newValue: {
        subscriberId: created.subscriberId,
        planId: created.planId,
        status: created.status,
      },
    });
    return created;
  }

  /**
   * Crea un contrato en estado DRAFT a partir del interés comercial registrado
   * en el expediente de origen del subscriber.
   */
  async createFromExpediente(
    subscriberId: string,
    dto: CreateContractFromExpedienteDto,
    actorId?: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar que el subscriber existe en el tenant
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: subscriberId },
      });
      if (!subscriber) {
        throw new NotFoundException(`Suscriptor ${subscriberId} no encontrado.`);
      }
      await this.requireContractualAuthorization(subscriber.partyId);

      // Resolver el expediente: usar el del DTO si viene, o el del subscriber
      const expedienteId = dto.expedienteId ?? subscriber.expedienteId ?? null;
      if (!expedienteId) {
        throw new BadRequestException(
          'El suscriptor no tiene expediente de origen y no se proporcionó un expedienteId.',
        );
      }

      const expediente = await qr.manager.findOne(ExpedienteRecord, {
        where: { id: expedienteId },
      });
      if (!expediente) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado.`);
      }
      const planId = this._requirePlanId(
        expediente.interestedPlanId,
        'El expediente no tiene un plan de interés registrado. Crea el contrato de forma directa.',
      );

      // Dirección de instalación: prioridad DTO → expediente → subscriber
      const installationAddress =
        dto.installationAddress ?? expediente.address ?? subscriber.address;
      const installationCity =
        dto.installationCity ?? expediente.municipality ?? subscriber.city ?? null;
      const installationDepartment =
        dto.installationDepartment ?? expediente.department ?? subscriber.department ?? null;
      const installationPostalCode =
        dto.installationPostalCode ?? expediente.postalCode ?? subscriber.postalCode ?? null;

      const expedienteAddress = expediente.address?.trim() ?? '';
      const resolvedInstallationAddress = installationAddress?.trim() ?? '';
      const sameInstallationPoint =
        expedienteAddress.length > 0 && expedienteAddress === resolvedInstallationAddress;
      const serviceUsage = dto.serviceUsage ?? null;
      const installationStratum =
        dto.installationStratum !== undefined
          ? dto.installationStratum
          : sameInstallationPoint
            ? expediente.stratum
            : null;
      if (serviceUsage === ServiceUsage.RESIDENTIAL) {
        this._validateServicePoint(serviceUsage, installationStratum, subscriber.personType);
      }

      const alias = dto.alias?.trim() || this._buildAlias(installationCity, installationAddress);

      const entity = qr.manager.create(Contract, {
        tenantId,
        quoteId: null,
        subscriberId,
        planId,
        planSnapshotJson: { id: planId, source: 'expediente' },
        status: ContractStatus.DRAFT,
        alias,
        installationAddress: installationAddress ?? null,
        installationCity: installationCity ?? null,
        installationDepartment: installationDepartment ?? null,
        installationPostalCode: installationPostalCode ?? null,
        installationNotes: dto.installationNotes ?? null,
        customerSegment:
          dto.customerSegment ?? expediente.customerSegment ?? subscriber.customerSegment ?? null,
        serviceUsage,
        installationStratum,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        additionalProductIds: (expediente.additionalProductIds as string[]) ?? [],
        additionalServiceIds: (expediente.additionalServiceIds as string[]) ?? [],
        paymentMethod: dto.paymentMethod ?? expediente.paymentMethod ?? null,
        billingCycle: dto.billingCycle ?? expediente.billingCycle ?? null,
        fiscalName: expediente.fiscalName ?? null,
        fiscalDocument: null,
        fiscalAddress: null,
        startDate: null,
        endDate: null,
      });

      return qr.manager.save(Contract, entity);
    });
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'Contract',
      entityId: created.id,
      userId: actorId ?? null,
      newValue: {
        subscriberId: created.subscriberId,
        planId: created.planId,
        status: created.status,
      },
    });
    return created;
  }

  // ── Consulta ────────────────────────────────────────────────────────────────

  async findAll(filters: {
    status?: ContractStatus;
    planId?: string;
    page?: number;
    limit?: number;
  }): Promise<ListResponse<Contract>> {
    const { schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(Contract, 'c')
        .orderBy('c.createdAt', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      if (filters.status) {
        qb.andWhere('c.status = :status', { status: filters.status });
      }
      if (filters.planId) {
        qb.andWhere('c.planId = :planId', { planId: filters.planId });
      }

      const [data, total] = await qb.getManyAndCount();
      return {
        data,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }

  async findAllBySubscriber(
    subscriberId: string,
    filters: { page?: number; limit?: number } = {},
  ): Promise<ListResponse<Contract>> {
    const { schemaName } = TenantContext.getOrThrow();
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const [data, total] = await qr.manager
        .createQueryBuilder(Contract, 'c')
        .where('c.subscriberId = :subscriberId', { subscriberId })
        .orderBy('c.createdAt', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return {
        data,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: [],
        }),
      };
    });
  }

  async findOne(id: string): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Contract, { where: { id } }),
    );
    if (!entity) {
      throw new NotFoundException(`Contrato ${id} no encontrado.`);
    }
    return entity;
  }

  // ── Actualización parcial ───────────────────────────────────────────────────

  async update(id: string, dto: UpdateContractDto, actorId?: string): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    const servicePointFieldsChanged =
      dto.serviceUsage !== undefined || dto.installationStratum !== undefined;
    const fiscalFieldsChanged =
      servicePointFieldsChanged ||
      dto.fiscalName !== undefined ||
      dto.fiscalDocument !== undefined ||
      dto.fiscalAddress !== undefined;
    if (fiscalFieldsChanged && entity.status !== ContractStatus.DRAFT) {
      throw new ConflictException({
        code: 'SERVICE_POINT_REQUIRES_DEDICATED_ACTION',
        message: 'El punto de servicio solo se modifica en borradores o por la acción dedicada.',
      });
    }

    // planSnapshotJson solo editable en DRAFT
    if (dto.planSnapshotJson !== undefined && entity.status !== ContractStatus.DRAFT) {
      throw new ConflictException(
        'CONTRACT_IMMUTABLE_AFTER_SIGN: El snapshot del plan no puede modificarse después de activar el contrato.',
      );
    }

    if (servicePointFieldsChanged) {
      const nextUsage = dto.serviceUsage ?? entity.serviceUsage;
      const nextStratum =
        dto.installationStratum !== undefined
          ? dto.installationStratum
          : entity.installationStratum;
      if (nextUsage === ServiceUsage.RESIDENTIAL) {
        const subscriber = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
          qr.manager.findOne(Subscriber, {
            where: { id: entity.subscriberId, tenantId },
            select: { id: true, tenantId: true, personType: true },
          }),
        );
        if (!subscriber) {
          throw new NotFoundException('Suscriptor del contrato no encontrado.');
        }
        this._validateServicePoint(nextUsage, nextStratum, subscriber.personType);
      }
    }

    if (dto.alias !== undefined) entity.alias = dto.alias.trim();
    if (dto.quoteId !== undefined) entity.quoteId = dto.quoteId ?? null;
    if (dto.installationAddress !== undefined)
      entity.installationAddress = dto.installationAddress ?? null;
    if (dto.installationCity !== undefined) entity.installationCity = dto.installationCity ?? null;
    if (dto.installationDepartment !== undefined)
      entity.installationDepartment = dto.installationDepartment ?? null;
    if (dto.installationPostalCode !== undefined)
      entity.installationPostalCode = dto.installationPostalCode ?? null;
    if (dto.installationNotes !== undefined)
      entity.installationNotes = dto.installationNotes ?? null;
    if (dto.customerSegment !== undefined) entity.customerSegment = dto.customerSegment ?? null;
    if (dto.serviceUsage !== undefined) entity.serviceUsage = dto.serviceUsage;
    if (dto.installationStratum !== undefined)
      entity.installationStratum = dto.installationStratum ?? null;
    if (dto.additionalProductIds !== undefined)
      entity.additionalProductIds = dto.additionalProductIds;
    if (dto.additionalServiceIds !== undefined)
      entity.additionalServiceIds = dto.additionalServiceIds;
    if (dto.paymentMethod !== undefined) entity.paymentMethod = dto.paymentMethod ?? null;
    if (dto.billingCycle !== undefined) entity.billingCycle = dto.billingCycle ?? null;
    if (dto.fiscalName !== undefined) entity.fiscalName = dto.fiscalName ?? null;
    if (dto.fiscalDocument !== undefined) entity.fiscalDocument = dto.fiscalDocument ?? null;
    if (dto.fiscalAddress !== undefined) entity.fiscalAddress = dto.fiscalAddress ?? null;
    if (dto.startDate !== undefined) entity.startDate = dto.startDate ?? null;
    if (dto.endDate !== undefined) entity.endDate = dto.endDate ?? null;
    if (dto.planSnapshotJson !== undefined) entity.planSnapshotJson = dto.planSnapshotJson;

    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Contract, entity),
    );
    const changedFields = Object.keys(dto).filter((field) =>
      AUDITABLE_CONTRACT_UPDATE_FIELDS.has(field),
    );
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Contract',
      entityId: updated.id,
      userId: actorId ?? null,
      oldValue: { status: entity.status },
      newValue: { changedFields },
    });
    return updated;
  }

  // ── Transiciones de estado ──────────────────────────────────────────────────

  /** DRAFT → ACTIVE (firma del contrato) */
  async activate(id: string, actorId?: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE, actorId);
  }

  /** Recalcula el snapshot fiscal de un punto de servicio ya activo. */
  async updateServicePoint(
    id: string,
    dto: UpdateServicePointDto,
    actorId: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    if (dto.serviceUsage === undefined && dto.installationStratum === undefined) {
      throw new UnprocessableEntityException({
        code: 'SERVICE_POINT_CHANGE_REQUIRED',
        message: 'Indica al menos un campo del punto de servicio.',
      });
    }

    const { updated, previousTreatment } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const entity = await qr.manager.findOne(Contract, { where: { id } });
        if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        if (entity.status !== ContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'SERVICE_POINT_ACTION_REQUIRES_ACTIVE_CONTRACT',
            message: 'La acción dedicada requiere un contrato activo.',
          });
        }

        const subscriber = await qr.manager.findOne(Subscriber, {
          where: { id: entity.subscriberId, tenantId },
          select: { id: true, tenantId: true, personType: true },
        });
        if (!subscriber) {
          throw new NotFoundException('Suscriptor del contrato no encontrado.');
        }

        const serviceUsage = dto.serviceUsage ?? entity.serviceUsage;
        const installationStratum =
          dto.installationStratum !== undefined
            ? dto.installationStratum
            : entity.installationStratum;
        this._validateActivationInputs(serviceUsage, installationStratum, subscriber.personType);

        const previousTreatment = this._snapshotTreatment(entity.vatSnapshot);
        entity.serviceUsage = serviceUsage;
        entity.installationStratum = installationStratum;
        entity.vatSnapshot = await this._resolveVatSnapshot(entity);

        return {
          updated: await qr.manager.save(Contract, entity),
          previousTreatment,
        };
      },
    );

    const changedFields = [
      ...(dto.serviceUsage !== undefined ? ['serviceUsage'] : []),
      ...(dto.installationStratum !== undefined ? ['installationStratum'] : []),
    ];
    const auditEntry: AuditEntryInput = {
      action: AuditAction.UPDATE,
      entityType: 'ContractServicePoint',
      entityId: updated.id,
      userId: actorId,
      oldValue: { vatTreatment: previousTreatment },
      newValue: {
        changedFields,
        vatTreatment: this._snapshotTreatment(updated.vatSnapshot),
      },
    };
    await this.auditService.log(auditEntry);
    return updated;
  }

  async uploadStratumEvidence(
    id: string,
    file: Express.Multer.File,
    actorId: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    if (!file) {
      throw new BadRequestException('Se requiere el campo "file" con el soporte del estrato.');
    }

    const current = await this.findOne(id);
    this._assertEvidenceApplicable(current);
    if (current.status !== ContractStatus.DRAFT && current.status !== ContractStatus.ACTIVE) {
      throw new ConflictException({
        code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
        message: 'El soporte solo puede modificarse en borradores o contratos activos.',
      });
    }

    const subscriber = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.manager.findOne(Subscriber, {
        where: { id: current.subscriberId, tenantId },
        select: { id: true, tenantId: true, personType: true },
      }),
    );
    if (!subscriber) {
      throw new NotFoundException('Suscriptor del contrato no encontrado.');
    }
    this._validateServicePoint(
      ServiceUsage.RESIDENTIAL,
      current.installationStratum,
      subscriber.personType,
    );

    this._assertStratumEvidenceStorageIsPrivate();

    const asset = await this.mediaService.uploadStratumEvidence(schemaName, file, actorId);

    let updated: Contract;
    try {
      updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const entity = await qr.manager.findOne(Contract, { where: { id } });
        if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        this._assertEvidenceApplicable(entity);
        if (entity.status !== ContractStatus.DRAFT && entity.status !== ContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
            message: 'El soporte solo puede modificarse en borradores o contratos activos.',
          });
        }

        const previousTreatment = this._snapshotTreatment(entity.vatSnapshot);
        const previousAssetId = entity.stratumEvidenceMediaId;
        entity.stratumEvidenceMediaId = asset.id;
        if (entity.status === ContractStatus.ACTIVE) {
          entity.vatSnapshot = await this._resolveVatSnapshot(entity);
        }
        const saved = await qr.manager.save(Contract, entity);
        await this._auditStratumEvidenceChange(
          saved,
          actorId,
          previousAssetId,
          previousTreatment,
          entity.status === ContractStatus.ACTIVE,
        );
        return saved;
      });
    } catch (error) {
      await this._softDeleteEvidenceAsset(asset.id, schemaName);
      throw error;
    }

    if (current.stratumEvidenceMediaId && current.stratumEvidenceMediaId !== asset.id) {
      await this._softDeleteEvidenceAsset(current.stratumEvidenceMediaId, schemaName);
    }
    return updated;
  }

  async removeStratumEvidence(id: string, actorId: string): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const { updated, previousAssetId } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const entity = await qr.manager.findOne(Contract, { where: { id } });
        if (!entity) throw new NotFoundException(`Contrato ${id} no encontrado.`);
        if (entity.status !== ContractStatus.DRAFT && entity.status !== ContractStatus.ACTIVE) {
          throw new ConflictException({
            code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
            message: 'El soporte solo puede modificarse en borradores o contratos activos.',
          });
        }

        const previousAssetId = entity.stratumEvidenceMediaId;
        const previousTreatment = this._snapshotTreatment(entity.vatSnapshot);
        if (!previousAssetId) return { updated: entity, previousAssetId: null };

        entity.stratumEvidenceMediaId = null;
        if (entity.status === ContractStatus.ACTIVE) {
          entity.vatSnapshot = await this._resolveVatSnapshot(entity);
        }
        const saved = await qr.manager.save(Contract, entity);
        await this._auditStratumEvidenceChange(
          saved,
          actorId,
          previousAssetId,
          previousTreatment,
          entity.status === ContractStatus.ACTIVE,
        );
        return { updated: saved, previousAssetId };
      },
    );

    if (previousAssetId) {
      await this._softDeleteEvidenceAsset(previousAssetId, schemaName);
    } else {
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ContractStratumEvidence',
        entityId: updated.id,
        userId: actorId,
        oldValue: { hasStratumEvidence: false },
        newValue: { hasStratumEvidence: false },
      });
    }
    return updated;
  }

  async getStratumEvidenceSignedUrl(
    id: string,
    actorId: string,
  ): Promise<{ signedUrl: string; expiresAt: Date }> {
    const { schemaName } = TenantContext.getOrThrow();
    const contract = await this.findOne(id);
    this._assertStratumEvidenceStorageIsPrivate();
    const mediaId = contract.stratumEvidenceMediaId;
    if (!mediaId || !(await this._hasVerifiedStratumEvidence(contract, schemaName))) {
      throw new NotFoundException('Soporte del estrato no encontrado para este contrato.');
    }

    const signedUrl = await this.mediaService.getStratumEvidenceSignedUrl(mediaId, schemaName);
    await this.auditService.log({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'STRATUM_EVIDENCE_ACCESS',
      entityId: contract.id,
      userId: actorId,
      newValue: { resource: 'stratumEvidence' },
    });
    return signedUrl;
  }

  /** ACTIVE → SUSPENDED */
  async suspend(id: string, actorId?: string): Promise<Contract> {
    return this._transition(id, ContractStatus.SUSPENDED, actorId);
  }

  /** SUSPENDED → ACTIVE */
  async reactivate(id: string, actorId?: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE, actorId);
  }

  /** ACTIVE | SUSPENDED → TERMINATED */
  async terminate(id: string, actorId?: string): Promise<Contract> {
    return this._transition(id, ContractStatus.TERMINATED, actorId);
  }

  /** SUSPENDED | TERMINATED → ARCHIVED */
  async archive(id: string, actorId?: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ARCHIVED, actorId);
  }

  // ── Eliminación ─────────────────────────────────────────────────────────────

  async remove(id: string, actorId?: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    if (entity.status !== ContractStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden eliminar contratos en estado DRAFT.');
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.softDelete(Contract, { id });
    });
    await this.auditService.log({
      action: AuditAction.DELETE,
      entityType: 'Contract',
      entityId: id,
      userId: actorId ?? null,
      oldValue: { status: entity.status },
      newValue: { deleted: true },
    });
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async requireContractualAuthorization(partyId: string | null): Promise<void> {
    if (!partyId) {
      throw new UnprocessableEntityException({
        code: 'CONTRACT_DATA_AUTHORIZATION_REQUIRED',
        message: 'El suscriptor no tiene autorización vigente para el tratamiento contractual.',
      });
    }
    if (!this.privacyAuthorizationReadPort) {
      throw new ServiceUnavailableException('La consulta de autorizaciones no está disponible.');
    }
    const authorization = await this.privacyAuthorizationReadPort.hasActive(
      partyId,
      'TRATAMIENTO_CONTRACTUAL',
    );
    if (!authorization.active) {
      throw new UnprocessableEntityException({
        code: 'CONTRACT_DATA_AUTHORIZATION_REQUIRED',
        message: 'El suscriptor no tiene autorización vigente para el tratamiento contractual.',
      });
    }
    if (authorization.legacyUnverified) {
      this.logger.warn('Autorización heredada del titular requiere recolectar evidencia.');
    }
  }

  private async _transition(
    id: string,
    target: ContractStatus,
    actorId?: string,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[entity.status];

    if (!allowed.includes(target)) {
      throw new ConflictException(
        `INVALID_STATE_TRANSITION: No se puede pasar de ${entity.status} a ${target}.`,
      );
    }

    if (target === ContractStatus.ACTIVE) {
      if (!entity.serviceUsage) {
        throw new UnprocessableEntityException({
          code: 'SERVICE_USAGE_REQUIRED',
          message: 'serviceUsage es obligatorio para activar el contrato.',
        });
      }
      const subscriber = await runInTenantSchema(this.dataSource, schemaName, (qr) =>
        qr.manager.findOne(Subscriber, {
          where: { id: entity.subscriberId, tenantId },
          select: { id: true, tenantId: true, personType: true },
        }),
      );
      if (!subscriber) {
        throw new NotFoundException('Suscriptor del contrato no encontrado.');
      }
      this._validateActivationInputs(
        entity.serviceUsage,
        entity.installationStratum,
        subscriber.personType,
      );
      entity.vatSnapshot = await this._resolveVatSnapshot(entity);
    }

    const previousStatus = entity.status;
    entity.status = target;

    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Contract, entity),
    );
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Contract',
      entityId: updated.id,
      userId: actorId ?? null,
      oldValue: { status: previousStatus },
      newValue: { status: updated.status },
    });
    return updated;
  }

  private _validateActivationInputs(
    serviceUsage: ServiceUsage | null,
    installationStratum: number | null,
    personType: PersonType,
  ): asserts serviceUsage is ServiceUsage {
    if (!serviceUsage) {
      throw new UnprocessableEntityException({
        code: 'SERVICE_USAGE_REQUIRED',
        message: 'serviceUsage es obligatorio para activar el contrato.',
      });
    }
    this._validateServicePoint(serviceUsage, installationStratum, personType);
  }

  private _validateServicePoint(
    serviceUsage: ServiceUsage,
    installationStratum: number | null,
    personType: PersonType,
  ): void {
    if (serviceUsage === ServiceUsage.RESIDENTIAL && personType === PersonType.JURIDICA) {
      throw new UnprocessableEntityException({
        code: 'RESIDENTIAL_USAGE_NOT_ALLOWED',
        message: 'Una persona jurídica no puede registrar un punto de servicio residencial.',
      });
    }
    if (serviceUsage === ServiceUsage.RESIDENTIAL && installationStratum == null) {
      throw new UnprocessableEntityException({
        code: 'STRATUM_REQUIRED',
        message: 'installationStratum es obligatorio para un punto de servicio residencial.',
      });
    }
  }

  private async _resolveVatSnapshot(contract: Contract): Promise<Contract['vatSnapshot']> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const plan = await this.commercialCatalogPort.getPlanById(
      tenantId,
      schemaName,
      contract.planId,
    );
    if (!plan || !plan.vatConcept) {
      throw new UnprocessableEntityException({
        code: 'VAT_CONCEPT_REQUIRED',
        message: `El plan ${plan?.name ?? contract.planId} no tiene concepto fiscal asignado.`,
      });
    }
    if (!contract.serviceUsage) {
      throw new UnprocessableEntityException({
        code: 'SERVICE_USAGE_REQUIRED',
        message: 'serviceUsage es obligatorio para activar el contrato.',
      });
    }

    const stratumEvidenceAvailable = await this._hasVerifiedStratumEvidence(contract, schemaName);
    if (contract.stratumEvidenceMediaId && !stratumEvidenceAvailable) {
      this.logger.warn(
        'Soporte de estrato heredado no verificable; se aplicará el tratamiento estándar.',
      );
    }

    let result: InternetVatResult;
    try {
      result = this.internetVatResolver.resolve({
        vatConcept: plan.vatConcept,
        networkType: plan.networkType,
        usage: contract.serviceUsage,
        stratum: contract.installationStratum,
        stratumEvidenceAvailable,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        throw new UnprocessableEntityException({
          code: 'STRATUM_REQUIRED',
          message: 'installationStratum es obligatorio para un punto de servicio residencial.',
        });
      }
      throw error;
    }

    if (result.status === 'NOT_CANONICAL') return null;
    return {
      treatment: result.treatment,
      legalBasis: result.legalBasis,
      ratePercent: result.ratePercent,
      requiresAccountantReview: result.requiresAccountantReview,
      resolvedAt: new Date().toISOString(),
    };
  }

  private _assertEvidenceApplicable(contract: Contract): void {
    if (
      contract.serviceUsage !== ServiceUsage.RESIDENTIAL ||
      contract.installationStratum == null ||
      contract.installationStratum < 1 ||
      contract.installationStratum > 3
    ) {
      throw new UnprocessableEntityException({
        code: 'STRATUM_EVIDENCE_NOT_APPLICABLE',
        message: 'El soporte solo aplica a puntos residenciales de estrato 1, 2 o 3.',
      });
    }
  }

  private _assertStratumEvidenceStorageIsPrivate(): void {
    const storageDriver = this.configService.get<string>('STORAGE_DRIVER', 'local');
    const bucketPublic = this.configService.get<boolean | string>('S3_BUCKET_PUBLIC', false);
    const publicBaseUrl = this.configService.get<string>('S3_PUBLIC_BASE_URL');
    const isBucketPublic = bucketPublic === true || bucketPublic === 'true';
    const hasPublicBaseUrl = typeof publicBaseUrl === 'string' && publicBaseUrl.trim().length > 0;

    if (storageDriver !== 'minio' || isBucketPublic || hasPublicBaseUrl) {
      throw new ServiceUnavailableException({
        code: 'STRATUM_EVIDENCE_STORAGE_MUST_BE_PRIVATE',
        message: 'La carga del soporte requiere almacenamiento privado sin URL permanente.',
      });
    }
  }

  private async _hasVerifiedStratumEvidence(
    contract: Contract,
    schemaName: string,
  ): Promise<boolean> {
    const mediaId = contract.stratumEvidenceMediaId;
    if (!mediaId) return false;
    try {
      const asset = await this.mediaService.findOne(mediaId, schemaName);
      return asset.usage === MediaUsage.STRATUM_EVIDENCE;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  private async _softDeleteEvidenceAsset(mediaId: string, schemaName: string): Promise<void> {
    try {
      await this.mediaService.softDelete(mediaId, schemaName);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }
  }

  private async _auditStratumEvidenceChange(
    contract: Contract,
    actorId: string,
    previousAssetId: string | null,
    previousTreatment: string | null,
    wasActive: boolean,
  ): Promise<void> {
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: wasActive ? 'ContractServicePoint' : 'ContractStratumEvidence',
      entityId: contract.id,
      userId: actorId,
      oldValue: wasActive
        ? { vatTreatment: previousTreatment }
        : { hasStratumEvidence: previousAssetId !== null },
      newValue: wasActive
        ? {
            changedFields: ['stratumEvidenceMediaId'],
            vatTreatment: this._snapshotTreatment(contract.vatSnapshot),
          }
        : { hasStratumEvidence: contract.stratumEvidenceMediaId !== null },
    });
  }

  private _snapshotTreatment(value: Contract['vatSnapshot']): string | null {
    if (!value || typeof value !== 'object') return null;
    const treatment = (value as Record<string, unknown>)['treatment'];
    return typeof treatment === 'string' ? treatment : null;
  }

  /** Única regla del plan de un contrato, para la creación directa y desde expediente. */
  private _requirePlanId(value: unknown, message: string): string {
    const planId = normalizeContractPlanId(value);
    if (!planId) {
      throw new BadRequestException(message);
    }
    return planId;
  }

  /** Genera un alias legible a partir de ciudad y dirección. */
  private _buildAlias(city?: string | null, address?: string | null): string {
    const parts = [city, address].filter(Boolean);
    if (parts.length > 0) {
      return `Servicio — ${parts.join(' ')}`.slice(0, 120);
    }
    return `Servicio del ${new Date().toLocaleDateString('es-CO')}`;
  }
}
