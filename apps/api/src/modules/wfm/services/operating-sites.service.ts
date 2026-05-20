import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import {
  runInTenantSchema,
  TenantContext,
  WfmCompanyBusinessHours,
  WfmOperatingSite,
  WfmSiteBusinessHours,
} from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateOperatingSiteDto } from '../dto/create-operating-site.dto';
import { UpdateOperatingSiteDto } from '../dto/update-operating-site.dto';

@Injectable()
export class OperatingSitesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(actor: JwtPayload): Promise<WfmOperatingSite[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(WfmOperatingSite, {
        where: { tenantId, deletedAt: IsNull() },
        order: { name: 'ASC' },
      }),
    );
  }

  async create(dto: CreateOperatingSiteDto, actor: JwtPayload): Promise<WfmOperatingSite> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await this.ensureSiteUniqueness(qr.manager, tenantId, dto.name, dto.code);

      const site = qr.manager.create(WfmOperatingSite, {
        tenantId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        address: dto.address?.trim() ?? null,
        municipality: dto.municipality?.trim() ?? null,
        sector: dto.sector?.trim() ?? null,
        latitude: dto.latitude?.toString() ?? null,
        longitude: dto.longitude?.toString() ?? null,
        isActive: dto.isActive ?? true,
      });

      const savedSite = await qr.manager.save(WfmOperatingSite, site);
      await this.copyCompanyBusinessHoursToSite(qr.manager, tenantId, savedSite.id);

      return savedSite;
    });
  }

  async update(
    id: string,
    dto: UpdateOperatingSiteDto,
    actor: JwtPayload,
  ): Promise<WfmOperatingSite> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const site = await this.getSiteOrThrow(qr.manager, id, tenantId);
      const nextName = dto.name?.trim() ?? site.name;
      const nextCode = dto.code?.trim().toUpperCase() ?? site.code;

      await this.ensureSiteUniqueness(qr.manager, tenantId, nextName, nextCode, id);

      site.name = nextName;
      site.code = nextCode;
      site.address = dto.address === undefined ? site.address : (dto.address?.trim() ?? null);
      site.municipality =
        dto.municipality === undefined ? site.municipality : (dto.municipality?.trim() ?? null);
      site.sector = dto.sector === undefined ? site.sector : (dto.sector?.trim() ?? null);
      site.latitude =
        dto.latitude === undefined ? site.latitude : (dto.latitude?.toString() ?? null);
      site.longitude =
        dto.longitude === undefined ? site.longitude : (dto.longitude?.toString() ?? null);
      site.isActive = dto.isActive ?? site.isActive;

      return qr.manager.save(WfmOperatingSite, site);
    });
  }

  async remove(id: string, actor: JwtPayload): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const site = await this.getSiteOrThrow(qr.manager, id, tenantId);
      await qr.manager.softRemove(WfmOperatingSite, site);
    });
  }

  private async getSiteOrThrow(manager: DataSource['manager'], id: string, tenantId: string) {
    const site = await manager.findOne(WfmOperatingSite, {
      where: { id, tenantId, deletedAt: IsNull() },
    });

    if (!site) {
      throw new NotFoundException('La sede operativa no existe para este tenant.');
    }

    return site;
  }

  private async copyCompanyBusinessHoursToSite(
    manager: DataSource['manager'],
    tenantId: string,
    siteId: string,
  ): Promise<void> {
    const companyDays = await manager.find(WfmCompanyBusinessHours, {
      where: { tenantId },
      order: { weekday: 'ASC' },
    });

    if (companyDays.length === 0) {
      return;
    }

    const siteDays = companyDays.map((day) =>
      manager.create(WfmSiteBusinessHours, {
        tenantId,
        siteId,
        weekday: day.weekday,
        startTime: day.startTime,
        endTime: day.endTime,
        isEnabled: day.isEnabled,
      }),
    );

    await manager.save(WfmSiteBusinessHours, siteDays);
  }

  private async ensureSiteUniqueness(
    manager: DataSource['manager'],
    tenantId: string,
    name: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await manager.find(WfmOperatingSite, {
      where: { tenantId, deletedAt: IsNull() },
      select: { id: true, name: true, code: true },
    });

    const duplicate = existing.find(
      (site) => site.id !== excludeId && (site.name === name || site.code === code),
    );

    if (duplicate) {
      throw new BadRequestException('Ya existe una sede operativa con el mismo nombre o codigo.');
    }
  }
}
