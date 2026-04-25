import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { ArcoRequest } from './entities/arco-request.entity';
import { HabeasDataConsent } from './entities/habeas-data-consent.entity';
import { CreateHabeasDataConsentDto } from './dto/create-habeas-data-consent.dto';
import { CreateArcoRequestDto, UpdateArcoRequestStatusDto } from './dto/arco-request.dto';

@Injectable()
export class HabeasDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createConsent(
    subscriberId: string,
    dto: CreateHabeasDataConsentDto,
  ): Promise<HabeasDataConsent> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(HabeasDataConsent, {
        tenantId,
        subscriberId,
        accepted: dto.accepted,
        channel: dto.channel,
        ipAddress: dto.ipAddress ?? null,
        legalTextVersion: dto.legalTextVersion ?? 'v1.0',
      });
      return qr.manager.save(HabeasDataConsent, entity);
    });
  }

  async listConsents(subscriberId: string): Promise<HabeasDataConsent[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(HabeasDataConsent, {
        where: { subscriberId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async createArcoRequest(subscriberId: string, dto: CreateArcoRequestDto): Promise<ArcoRequest> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(ArcoRequest, {
        tenantId,
        subscriberId,
        requestType: dto.requestType,
        description: dto.description ?? null,
        status: 'PENDING',
      });
      return qr.manager.save(ArcoRequest, entity);
    });
  }

  async listArcoRequests(subscriberId: string): Promise<ArcoRequest[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(ArcoRequest, {
        where: { subscriberId },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async updateArcoStatus(id: string, dto: UpdateArcoRequestStatusDto): Promise<ArcoRequest> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ArcoRequest, { where: { id } });
      if (!entity) {
        throw new NotFoundException(`Solicitud ARCO ${id} no encontrada.`);
      }
      entity.status = dto.status;
      if (dto.status === 'COMPLETED' || dto.status === 'REJECTED') {
        entity.resolvedAt = new Date();
      }
      return qr.manager.save(ArcoRequest, entity);
    });
  }
}
