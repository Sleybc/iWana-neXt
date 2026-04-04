import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { Contract } from './entities/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from '../enums/contract-status.enum';

@Injectable()
export class ContractsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(dto: CreateContractDto): Promise<Contract> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(Contract, {
        tenantId,
        quoteId: dto.quoteId,
        subscriberId: dto.subscriberId,
        planId: dto.planId,
        planSnapshotJson: dto.planSnapshotJson,
        status: ContractStatus.DRAFT,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
      });

      return qr.manager.save(Contract, entity);
    });
  }

  async findAll(filters: { status?: ContractStatus; planId?: string }): Promise<Contract[]> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const where: Record<string, string> = {};
      if (filters.status) {
        where['status'] = filters.status;
      }
      if (filters.planId) {
        where['planId'] = filters.planId;
      }

      return qr.manager.find(Contract, {
        where,
        order: { createdAt: 'DESC' },
      });
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

  async update(id: string, dto: UpdateContractDto): Promise<Contract> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.startDate !== undefined) entity.startDate = dto.startDate ?? null;
    if (dto.endDate !== undefined) entity.endDate = dto.endDate ?? null;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Contract, entity),
    );
  }

  async remove(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findOne(id);

    if (entity.status === ContractStatus.ACTIVE) {
      throw new BadRequestException('No se permite eliminar contratos activos.');
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.softDelete(Contract, { id });
    });
  }
}
