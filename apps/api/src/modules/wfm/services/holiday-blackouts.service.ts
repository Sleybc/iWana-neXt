import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext, WfmHolidayBlackout } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateHolidayBlackoutDto } from '../dto/create-holiday-blackout.dto';
import { UpdateHolidayBlackoutDto } from '../dto/update-holiday-blackout.dto';

@Injectable()
export class HolidayBlackoutsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(actor: JwtPayload): Promise<WfmHolidayBlackout[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager.find(WfmHolidayBlackout, {
        where: { tenantId },
        order: { blackoutDate: 'ASC', createdAt: 'DESC' },
      });
    });
  }

  async create(dto: CreateHolidayBlackoutDto, actor: JwtPayload): Promise<WfmHolidayBlackout> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const blackout = qr.manager.create(WfmHolidayBlackout, {
        tenantId,
        organizationSiteId: dto.organizationSiteId ?? null,
        blackoutDate: dto.blackoutDate,
        isRecurring: dto.isRecurring ?? false,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        isEnabled: dto.isEnabled ?? true,
      });

      return qr.manager.save(WfmHolidayBlackout, blackout);
    });
  }

  async update(
    id: string,
    dto: UpdateHolidayBlackoutDto,
    actor: JwtPayload,
  ): Promise<WfmHolidayBlackout> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const blackout = await qr.manager.findOne(WfmHolidayBlackout, {
        where: { id, tenantId },
      });

      if (!blackout) {
        throw new NotFoundException('El festivo o cierre no existe para este tenant.');
      }

      if (dto.organizationSiteId !== undefined) {
        blackout.organizationSiteId = dto.organizationSiteId ?? null;
      }
      blackout.blackoutDate = dto.blackoutDate ?? blackout.blackoutDate;
      blackout.isRecurring = dto.isRecurring ?? blackout.isRecurring;
      blackout.name = dto.name?.trim() ?? blackout.name;
      blackout.description =
        dto.description === undefined ? blackout.description : (dto.description?.trim() ?? null);
      blackout.isEnabled = dto.isEnabled ?? blackout.isEnabled;

      return qr.manager.save(WfmHolidayBlackout, blackout);
    });
  }

  async remove(id: string, actor: JwtPayload): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const result = await qr.manager.delete(WfmHolidayBlackout, { id, tenantId });

      if (!result.affected) {
        throw new NotFoundException('El festivo o cierre no existe para este tenant.');
      }
    });
  }
}
