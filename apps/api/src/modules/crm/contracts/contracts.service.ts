import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { ListResponse } from '@iwana/shared';
import { buildPageMeta, clampLimit } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';
import { Contract } from './entities/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractFromExpedienteDto } from './dto/create-contract-from-expediente.dto';
import { ContractStatus } from '../enums/contract-status.enum';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { Subscriber } from '../subscribers/entities/subscriber.entity';

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

@Injectable()
export class ContractsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ── Creación ────────────────────────────────────────────────────────────────

  async create(dto: CreateContractDto): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const alias =
        dto.alias?.trim() || this._buildAlias(dto.installationCity, dto.installationAddress);

      const entity = qr.manager.create(Contract, {
        tenantId,
        quoteId: dto.quoteId ?? null,
        subscriberId: dto.subscriberId,
        planId: dto.planId,
        planSnapshotJson: dto.planSnapshotJson,
        status: ContractStatus.DRAFT,
        alias,
        installationAddress: dto.installationAddress ?? null,
        installationCity: dto.installationCity ?? null,
        installationDepartment: dto.installationDepartment ?? null,
        installationPostalCode: dto.installationPostalCode ?? null,
        installationNotes: dto.installationNotes ?? null,
        customerSegment: dto.customerSegment ?? null,
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
  }

  /**
   * Crea un contrato en estado DRAFT a partir del interés comercial registrado
   * en el expediente de origen del subscriber.
   */
  async createFromExpediente(
    subscriberId: string,
    dto: CreateContractFromExpedienteDto,
  ): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar que el subscriber existe en el tenant
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: subscriberId },
      });
      if (!subscriber) {
        throw new NotFoundException(`Suscriptor ${subscriberId} no encontrado.`);
      }

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
      if (!expediente.interestedPlanId) {
        throw new BadRequestException(
          'El expediente no tiene un plan de interés registrado. Crea el contrato de forma directa.',
        );
      }

      // Dirección de instalación: prioridad DTO → expediente → subscriber
      const installationAddress =
        dto.installationAddress ?? expediente.address ?? subscriber.address;
      const installationCity =
        dto.installationCity ?? expediente.municipality ?? subscriber.city ?? null;
      const installationDepartment =
        dto.installationDepartment ?? expediente.department ?? subscriber.department ?? null;
      const installationPostalCode =
        dto.installationPostalCode ?? expediente.postalCode ?? subscriber.postalCode ?? null;

      const alias = dto.alias?.trim() || this._buildAlias(installationCity, installationAddress);

      const entity = qr.manager.create(Contract, {
        tenantId,
        quoteId: null,
        subscriberId,
        planId: expediente.interestedPlanId,
        planSnapshotJson: { id: expediente.interestedPlanId, source: 'expediente' },
        status: ContractStatus.DRAFT,
        alias,
        installationAddress: installationAddress ?? null,
        installationCity: installationCity ?? null,
        installationDepartment: installationDepartment ?? null,
        installationPostalCode: installationPostalCode ?? null,
        installationNotes: dto.installationNotes ?? null,
        customerSegment: dto.customerSegment ?? subscriber.customerSegment ?? null,
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

  async update(id: string, dto: UpdateContractDto): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    // planSnapshotJson solo editable en DRAFT
    if (dto.planSnapshotJson !== undefined && entity.status !== ContractStatus.DRAFT) {
      throw new ConflictException(
        'CONTRACT_IMMUTABLE_AFTER_SIGN: El snapshot del plan no puede modificarse después de activar el contrato.',
      );
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

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Contract, entity),
    );
  }

  // ── Transiciones de estado ──────────────────────────────────────────────────

  /** DRAFT → ACTIVE (firma del contrato) */
  async activate(id: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE);
  }

  /** ACTIVE → SUSPENDED */
  async suspend(id: string): Promise<Contract> {
    return this._transition(id, ContractStatus.SUSPENDED);
  }

  /** SUSPENDED → ACTIVE */
  async reactivate(id: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ACTIVE);
  }

  /** ACTIVE | SUSPENDED → TERMINATED */
  async terminate(id: string): Promise<Contract> {
    return this._transition(id, ContractStatus.TERMINATED);
  }

  /** SUSPENDED | TERMINATED → ARCHIVED */
  async archive(id: string): Promise<Contract> {
    return this._transition(id, ContractStatus.ARCHIVED);
  }

  // ── Eliminación ─────────────────────────────────────────────────────────────

  async remove(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    if (entity.status !== ContractStatus.DRAFT) {
      throw new BadRequestException('Solo se pueden eliminar contratos en estado DRAFT.');
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.softDelete(Contract, { id });
    });
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  private async _transition(id: string, target: ContractStatus): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[entity.status];

    if (!allowed.includes(target)) {
      throw new ConflictException(
        `INVALID_STATE_TRANSITION: No se puede pasar de ${entity.status} a ${target}.`,
      );
    }

    entity.status = target;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Contract, entity),
    );
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
