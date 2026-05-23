import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import {
  runInTenantSchema,
  TenantContext,
  OrganizationSite,
  WfmSiteBusinessHours,
} from '@iwana/db';
import { BusinessHoursWeekday } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { BusinessHoursDayDto } from '../dto/business-hours-day.dto';
import { UpdateSiteBusinessHoursDto } from '../dto/update-site-business-hours.dto';

const ORDERED_WEEKDAYS = [
  BusinessHoursWeekday.MONDAY,
  BusinessHoursWeekday.TUESDAY,
  BusinessHoursWeekday.WEDNESDAY,
  BusinessHoursWeekday.THURSDAY,
  BusinessHoursWeekday.FRIDAY,
  BusinessHoursWeekday.SATURDAY,
  BusinessHoursWeekday.SUNDAY,
] as const;

type NormalizedBusinessHoursDay = {
  weekday: BusinessHoursWeekday;
  startTime: string | null;
  endTime: string | null;
  isEnabled: boolean;
};

@Injectable()
export class SiteBusinessHoursService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getWeek(
    organizationSiteId: string,
    actor: JwtPayload,
  ): Promise<NormalizedBusinessHoursDay[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return this.getWeekForSite(qr.manager, tenantId, organizationSiteId);
    });
  }

  async replaceWeek(
    organizationSiteId: string,
    dto: UpdateSiteBusinessHoursDto,
    actor: JwtPayload,
  ): Promise<NormalizedBusinessHoursDay[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const normalizedDays = this.normalizeWeek(dto.days);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return this.replaceWeekForSite(qr.manager, tenantId, organizationSiteId, normalizedDays);
    });
  }

  private async getWeekForSite(
    manager: DataSource['manager'],
    tenantId: string,
    organizationSiteId: string,
  ): Promise<NormalizedBusinessHoursDay[]> {
    await this.assertSiteExists(manager, organizationSiteId, tenantId);

    const rows = await manager.find(WfmSiteBusinessHours, {
      where: { tenantId, organizationSiteId },
      order: { weekday: 'ASC' },
    });

    return ORDERED_WEEKDAYS.map((weekday) => {
      const row = rows.find((item) => item.weekday === weekday);
      return {
        weekday,
        startTime: row?.startTime ?? null,
        endTime: row?.endTime ?? null,
        isEnabled: row?.isEnabled ?? false,
      };
    });
  }

  private async replaceWeekForSite(
    manager: DataSource['manager'],
    tenantId: string,
    organizationSiteId: string,
    normalizedDays: NormalizedBusinessHoursDay[],
  ): Promise<NormalizedBusinessHoursDay[]> {
    await this.assertSiteExists(manager, organizationSiteId, tenantId);
    await manager.delete(WfmSiteBusinessHours, { tenantId, organizationSiteId });

    const rows = normalizedDays.map((day) =>
      manager.create(WfmSiteBusinessHours, {
        tenantId,
        organizationSiteId,
        weekday: day.weekday,
        startTime: day.startTime,
        endTime: day.endTime,
        isEnabled: day.isEnabled,
      }),
    );

    await manager.save(WfmSiteBusinessHours, rows);
    return normalizedDays;
  }

  private normalizeWeek(days: BusinessHoursDayDto[]): NormalizedBusinessHoursDay[] {
    const byWeekday = new Map(days.map((day) => [day.weekday, day]));

    if (byWeekday.size !== ORDERED_WEEKDAYS.length || days.length !== ORDERED_WEEKDAYS.length) {
      throw new BadRequestException(
        'La semana por sede debe incluir exactamente un registro por dia.',
      );
    }

    return ORDERED_WEEKDAYS.map((weekday) => {
      const day = byWeekday.get(weekday);

      if (!day) {
        throw new BadRequestException(
          'La semana por sede debe cubrir todos los dias configurables.',
        );
      }

      this.assertTimeWindow(day.startTime ?? null, day.endTime ?? null, day.isEnabled);

      return {
        weekday,
        startTime: day.isEnabled ? (day.startTime ?? null) : null,
        endTime: day.isEnabled ? (day.endTime ?? null) : null,
        isEnabled: day.isEnabled,
      };
    });
  }

  private assertTimeWindow(
    startTime: string | null,
    endTime: string | null,
    isEnabled: boolean,
  ): void {
    if (!isEnabled) {
      return;
    }

    if (!startTime || !endTime || startTime >= endTime) {
      throw new BadRequestException('Cada dia habilitado debe tener una ventana horaria valida.');
    }
  }

  private async assertSiteExists(
    manager: DataSource['manager'],
    organizationSiteId: string,
    tenantId: string,
  ) {
    const site = await manager.findOne(OrganizationSite, {
      where: { id: organizationSiteId, tenantId, deletedAt: IsNull() },
    });

    if (!site) {
      throw new NotFoundException('La sede organizacional no existe para este tenant.');
    }
  }
}
