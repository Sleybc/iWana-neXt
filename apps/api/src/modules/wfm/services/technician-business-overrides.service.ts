import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext, WfmTechnicianBusinessOverride } from '@iwana/db';
import { BusinessHoursWeekday } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateTechnicianBusinessOverrideDto } from '../dto/create-technician-business-override.dto';
import { UpdateTechnicianBusinessOverrideDto } from '../dto/update-technician-business-override.dto';

type NormalizedTechnicianOverride = {
  userId: string;
  siteId: string | null;
  overrideDate: string | null;
  weekday: BusinessHoursWeekday | null;
  startTime: string | null;
  endTime: string | null;
  isEnabled: boolean;
  reason: string | null;
};

@Injectable()
export class TechnicianBusinessOverridesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(actor: JwtPayload): Promise<WfmTechnicianBusinessOverride[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(WfmTechnicianBusinessOverride, {
        where: { tenantId },
        order: { overrideDate: 'ASC', weekday: 'ASC', createdAt: 'DESC' },
      }),
    );
  }

  async create(
    dto: CreateTechnicianBusinessOverrideDto,
    actor: JwtPayload,
  ): Promise<WfmTechnicianBusinessOverride> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const normalized = this.normalizePayload(dto);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const override = qr.manager.create(WfmTechnicianBusinessOverride, {
        tenantId,
        ...normalized,
      });

      return qr.manager.save(WfmTechnicianBusinessOverride, override);
    });
  }

  async update(
    id: string,
    dto: UpdateTechnicianBusinessOverrideDto,
    actor: JwtPayload,
  ): Promise<WfmTechnicianBusinessOverride> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const current = await qr.manager.findOne(WfmTechnicianBusinessOverride, {
        where: { id, tenantId },
      });

      if (!current) {
        throw new NotFoundException('El override del tecnico no existe para este tenant.');
      }

      const normalized = this.normalizePayload({
        userId: dto.userId ?? current.userId,
        siteId: dto.siteId === undefined ? current.siteId : dto.siteId,
        overrideDate:
          dto.overrideDate === undefined ? current.overrideDate : (dto.overrideDate ?? null),
        weekday: dto.weekday === undefined ? current.weekday : (dto.weekday ?? null),
        startTime: dto.startTime === undefined ? current.startTime : (dto.startTime ?? null),
        endTime: dto.endTime === undefined ? current.endTime : (dto.endTime ?? null),
        isEnabled: dto.isEnabled ?? current.isEnabled,
        reason: dto.reason === undefined ? current.reason : (dto.reason ?? null),
      });

      Object.assign(current, normalized);

      return qr.manager.save(WfmTechnicianBusinessOverride, current);
    });
  }

  async remove(id: string, actor: JwtPayload): Promise<void> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const result = await qr.manager.delete(WfmTechnicianBusinessOverride, {
        id,
        tenantId,
      });

      if (!result.affected) {
        throw new NotFoundException('El override del tecnico no existe para este tenant.');
      }
    });
  }

  private normalizePayload(
    dto: CreateTechnicianBusinessOverrideDto | UpdateTechnicianBusinessOverrideDto,
  ): NormalizedTechnicianOverride {
    if (!dto.overrideDate && !dto.weekday) {
      throw new BadRequestException(
        'El override debe definir una fecha puntual o un dia de semana.',
      );
    }

    const isEnabled = dto.isEnabled ?? false;

    if (isEnabled) {
      if (!dto.startTime || !dto.endTime || dto.startTime >= dto.endTime) {
        throw new BadRequestException(
          'El override habilitado debe tener una ventana horaria valida.',
        );
      }
    }

    if (!dto.userId) {
      throw new BadRequestException('El override debe indicar el tecnico afectado.');
    }

    return {
      userId: dto.userId,
      siteId: dto.siteId ?? null,
      overrideDate: dto.overrideDate ?? null,
      weekday: dto.weekday ?? null,
      startTime: isEnabled ? (dto.startTime ?? null) : null,
      endTime: isEnabled ? (dto.endTime ?? null) : null,
      isEnabled,
      reason: dto.reason?.trim() ?? null,
    };
  }
}
