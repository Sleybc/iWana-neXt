import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext, WfmCompanyBusinessHours } from '@iwana/db';
import { BusinessHoursWeekday } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { BusinessHoursDayDto } from '../dto/business-hours-day.dto';
import { UpdateCompanyBusinessHoursDto } from '../dto/update-company-business-hours.dto';

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
export class CompanyBusinessHoursService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getWeek(actor: JwtPayload): Promise<NormalizedBusinessHoursDay[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = await qr.manager.find(WfmCompanyBusinessHours, {
        where: { tenantId },
      });

      return this.toWeekResponse(rows);
    });
  }

  async replaceWeek(
    dto: UpdateCompanyBusinessHoursDto,
    actor: JwtPayload,
  ): Promise<NormalizedBusinessHoursDay[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const normalizedDays = this.normalizeWeek(dto.days);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.delete(WfmCompanyBusinessHours, { tenantId });

      const rows = normalizedDays.map((day) =>
        qr.manager.create(WfmCompanyBusinessHours, {
          tenantId,
          weekday: day.weekday,
          startTime: day.startTime,
          endTime: day.endTime,
          isEnabled: day.isEnabled,
        }),
      );

      await qr.manager.save(WfmCompanyBusinessHours, rows);
      return normalizedDays;
    });
  }

  private normalizeWeek(days: BusinessHoursDayDto[]): NormalizedBusinessHoursDay[] {
    const byWeekday = new Map(days.map((day) => [day.weekday, day]));

    if (byWeekday.size !== ORDERED_WEEKDAYS.length || days.length !== ORDERED_WEEKDAYS.length) {
      throw new BadRequestException(
        'La semana operativa debe incluir exactamente un registro por dia.',
      );
    }

    return ORDERED_WEEKDAYS.map((weekday) => {
      const day = byWeekday.get(weekday);

      if (!day) {
        throw new BadRequestException(
          'La semana operativa debe cubrir todos los dias configurables.',
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

  private toWeekResponse(rows: WfmCompanyBusinessHours[]): NormalizedBusinessHoursDay[] {
    const byWeekday = new Map(rows.map((row) => [row.weekday, row]));

    return ORDERED_WEEKDAYS.map((weekday) => {
      const day = byWeekday.get(weekday);

      return {
        weekday,
        startTime: day?.startTime ?? null,
        endTime: day?.endTime ?? null,
        isEnabled: day?.isEnabled ?? false,
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
}
