import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  runInTenantSchema,
  TenantContext,
  WfmCompanyBusinessHours,
  WfmHolidayBlackout,
} from '@iwana/db';
import { BusinessHoursWeekday } from '@iwana/shared';

export interface ResolveOperatingWindowInput {
  tenantId: string;
  organizationSiteId?: string | null;
  technicianId?: string | null;
  dateLocal: string;
  timezone: string;
}

export interface OperatingWindowResult {
  status: 'OPEN' | 'CLOSED';
  source: 'HOLIDAY_BLACKOUT' | 'COMPANY_HOURS' | 'MISSING_CONFIGURATION';
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

@Injectable()
export class OperatingWindowResolverService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resolve(input: ResolveOperatingWindowInput): Promise<OperatingWindowResult> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      this.resolveWithManager(qr.manager, input),
    );
  }

  async resolveWithManager(
    manager: Pick<EntityManager, 'find' | 'findOne'>,
    input: ResolveOperatingWindowInput,
  ): Promise<OperatingWindowResult> {
    const weekday = toBusinessHoursWeekday(input.dateLocal);

    const blackout = await this.findHolidayBlackout(manager, input);
    if (blackout) {
      return {
        status: 'CLOSED',
        source: 'HOLIDAY_BLACKOUT',
        startTime: null,
        endTime: null,
        reason: blackout.name,
      };
    }

    const companyHours = await manager.findOne(WfmCompanyBusinessHours, {
      where: { tenantId: input.tenantId, weekday },
    });
    if (companyHours) {
      return this.toBusinessHoursResult(
        'COMPANY_HOURS',
        companyHours.isEnabled,
        companyHours.startTime,
        companyHours.endTime,
        'La empresa esta cerrada para la fecha consultada.',
      );
    }

    return {
      status: 'CLOSED',
      source: 'MISSING_CONFIGURATION',
      startTime: null,
      endTime: null,
      reason: 'No existe una configuracion de horario operativo para la fecha consultada.',
    };
  }

  private async findHolidayBlackout(
    manager: Pick<EntityManager, 'find'>,
    input: ResolveOperatingWindowInput,
  ): Promise<WfmHolidayBlackout | null> {
    const blackouts = await manager.find(WfmHolidayBlackout, {
      where: { tenantId: input.tenantId, isEnabled: true },
    });

    const applicable = blackouts
      .filter((item) => this.matchesSite(item.organizationSiteId, input.organizationSiteId ?? null))
      .filter((item) =>
        item.isRecurring
          ? item.blackoutDate.slice(5) === input.dateLocal.slice(5)
          : item.blackoutDate === input.dateLocal,
      )
      .sort((left, right) =>
        this.sortBySiteSpecificity(
          left.organizationSiteId,
          right.organizationSiteId,
          input.organizationSiteId ?? null,
        ),
      );

    return applicable[0] ?? null;
  }

  private toBusinessHoursResult(
    source: OperatingWindowResult['source'],
    isEnabled: boolean,
    startTime: string | null,
    endTime: string | null,
    closedReason: string,
  ): OperatingWindowResult {
    return {
      status: isEnabled ? 'OPEN' : 'CLOSED',
      source,
      startTime: isEnabled ? startTime : null,
      endTime: isEnabled ? endTime : null,
      reason: isEnabled ? null : closedReason,
    };
  }

  private matchesSite(candidateSiteId: string | null, inputSiteId: string | null): boolean {
    return candidateSiteId === null || candidateSiteId === inputSiteId;
  }

  private sortBySiteSpecificity(
    leftSiteId: string | null,
    rightSiteId: string | null,
    inputSiteId: string | null,
  ): number {
    const leftScore = leftSiteId && leftSiteId === inputSiteId ? 1 : 0;
    const rightScore = rightSiteId && rightSiteId === inputSiteId ? 1 : 0;
    return rightScore - leftScore;
  }
}

function toBusinessHoursWeekday(dateLocal: string): BusinessHoursWeekday {
  const day = new Date(`${dateLocal}T12:00:00.000Z`).getUTCDay();

  switch (day) {
    case 0:
      return BusinessHoursWeekday.SUNDAY;
    case 1:
      return BusinessHoursWeekday.MONDAY;
    case 2:
      return BusinessHoursWeekday.TUESDAY;
    case 3:
      return BusinessHoursWeekday.WEDNESDAY;
    case 4:
      return BusinessHoursWeekday.THURSDAY;
    case 5:
      return BusinessHoursWeekday.FRIDAY;
    default:
      return BusinessHoursWeekday.SATURDAY;
  }
}
