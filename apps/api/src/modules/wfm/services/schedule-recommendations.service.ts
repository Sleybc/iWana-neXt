import { BadRequestException, Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ScheduleEvent, TechnicianAvailability, TenantContext, runInTenantSchema } from '@iwana/db';
import { ScheduleEventStatus, TechnicianAvailabilityType, WfmWorkType } from '@iwana/shared';
import {
  ScheduleRecommendationRequest,
  ScheduleRecommendationRequestInput,
  ScheduleRecommendationRequestSchema,
} from '../dto';
import { WfmTenantSettingsReadPort } from '../ports/wfm-tenant-settings-read.port';
import {
  getLocalDateString,
  isScheduleRangeWithinOperatingWindow,
} from './installation-schedule-window';
import { OperatingWindowResolverService } from './operating-window-resolver.service';

const ACTIVE_STATUSES: ScheduleEventStatus[] = [
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
];
const SLOT_STEP_MINUTES = 15;
const MINUTE_MS = 60 * 1000;
const MAX_WINDOW_DAYS = 14;

export interface ScheduleRecommendationScoreBreakdown {
  distance: number;
  municipality: number;
  sector: number;
  routeContinuity: number;
  load: number;
  earliest: number;
}

export interface ScheduleRecommendationResult {
  technicianId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  score: number;
  labels: string[];
  scoreBreakdown: ScheduleRecommendationScoreBreakdown;
  distanceKm: number | null;
  nearestEventId: string | null;
  totalScheduledMinutes: number;
  eventCount: number;
}

type EventLike = Pick<
  ScheduleEvent,
  | 'id'
  | 'assignedUserId'
  | 'scheduledStartAt'
  | 'scheduledEndAt'
  | 'municipality'
  | 'sector'
  | 'latitude'
  | 'longitude'
>;

type AvailabilityLike = Pick<TechnicianAvailability, 'userId' | 'type' | 'startsAt' | 'endsAt'>;

interface TerritorialContext {
  municipality: string | null;
  sector: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CandidateSlotContext {
  technicianId: string;
  startAt: Date;
  endAt: Date;
  events: EventLike[];
  explicitAvailability: AvailabilityLike[];
  windowStartAt: Date;
  windowEndAt: Date;
  target: TerritorialContext;
}

@Injectable()
export class ScheduleRecommendationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(WfmTenantSettingsReadPort)
    private readonly tenantSettingsReadPort: WfmTenantSettingsReadPort,
    private readonly operatingWindowResolver: OperatingWindowResolverService,
  ) {}

  async recommend(input: ScheduleRecommendationRequest): Promise<ScheduleRecommendationResult[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = ScheduleRecommendationRequestSchema.parse(input);
    const effectiveOperatingSiteId = validated.organizationSiteId ?? null;
    const windowStartAt = new Date(validated.windowStartAt);
    const windowEndAt = new Date(validated.windowEndAt);
    const windowDays = (windowEndAt.getTime() - windowStartAt.getTime()) / (24 * 60 * MINUTE_MS);
    const timezone = await this.tenantSettingsReadPort.getTimezone(tenantId);

    if (windowDays > MAX_WINDOW_DAYS) {
      throw new BadRequestException(
        `La ventana de recomendacion no puede superar ${MAX_WINDOW_DAYS} dias.`,
      );
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const events = await qr.manager
        .createQueryBuilder(ScheduleEvent, 'se')
        .where('se.tenant_id = :tenantId', { tenantId })
        .andWhere('se.assigned_user_id IN (:...candidateUserIds)', {
          candidateUserIds: validated.candidateUserIds,
        })
        .andWhere('se.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
        .andWhere('se.deleted_at IS NULL')
        .andWhere('se.scheduled_start_at < :windowEndAt', { windowEndAt })
        .andWhere('se.scheduled_end_at > :windowStartAt', { windowStartAt })
        .orderBy('se.scheduled_start_at', 'ASC')
        .getMany();

      const availability = await qr.manager
        .createQueryBuilder(TechnicianAvailability, 'ta')
        .where('ta.tenant_id = :tenantId', { tenantId })
        .andWhere('ta.user_id IN (:...candidateUserIds)', {
          candidateUserIds: validated.candidateUserIds,
        })
        .andWhere('ta.starts_at < :windowEndAt', { windowEndAt })
        .andWhere('ta.ends_at > :windowStartAt', { windowStartAt })
        .orderBy('ta.starts_at', 'ASC')
        .getMany();

      return this.buildRecommendations(
        qr.manager,
        validated,
        events,
        availability,
        windowStartAt,
        windowEndAt,
        timezone,
        tenantId,
        effectiveOperatingSiteId,
      );
    });
  }

  private async buildRecommendations(
    manager: EntityManager,
    input: ScheduleRecommendationRequestInput,
    events: EventLike[],
    availability: AvailabilityLike[],
    windowStartAt: Date,
    windowEndAt: Date,
    timezone: string,
    tenantId: string,
    effectiveOperatingSiteId: string | null,
  ): Promise<ScheduleRecommendationResult[]> {
    const eventsByTechnician = groupBy(events, (event) => event.assignedUserId);
    const availabilityByTechnician = groupBy(availability, (item) => item.userId);
    const operatingWindowCache = new Map<
      string,
      Promise<Awaited<ReturnType<OperatingWindowResolverService['resolveWithManager']>>>
    >();
    const target: TerritorialContext = {
      municipality: normalizeText(input.municipality),
      sector: normalizeText(input.sector),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    };
    const recommendations: ScheduleRecommendationResult[] = [];

    for (const technicianId of input.candidateUserIds) {
      const technicianEvents = eventsByTechnician.get(technicianId) ?? [];
      const technicianAvailability = availabilityByTechnician.get(technicianId) ?? [];
      const explicitAvailability = technicianAvailability.filter(
        (item) => item.type === TechnicianAvailabilityType.AVAILABLE,
      );
      const blockedAvailability = technicianAvailability.filter(
        (item) => item.type !== TechnicianAvailabilityType.AVAILABLE,
      );

      for (const startAt of buildSlotStarts(windowStartAt, windowEndAt, input.durationMinutes)) {
        const endAt = new Date(startAt.getTime() + input.durationMinutes * MINUTE_MS);

        if (input.workType === WfmWorkType.INSTALLATION) {
          const dateLocal = getLocalDateString(startAt, timezone);

          if (!dateLocal) {
            continue;
          }

          const cacheKey = `${technicianId}:${effectiveOperatingSiteId ?? 'global'}:${dateLocal}`;
          const effectiveWindowPromise =
            operatingWindowCache.get(cacheKey) ??
            this.operatingWindowResolver.resolveWithManager(manager as any, {
              tenantId,
              organizationSiteId: effectiveOperatingSiteId,
              technicianId,
              dateLocal,
              timezone,
            });

          operatingWindowCache.set(cacheKey, effectiveWindowPromise);
          const effectiveWindow = await effectiveWindowPromise;

          if (
            effectiveWindow.status !== 'OPEN' ||
            !effectiveWindow.startTime ||
            !effectiveWindow.endTime ||
            !isScheduleRangeWithinOperatingWindow(startAt, endAt, timezone, {
              startTime: effectiveWindow.startTime,
              endTime: effectiveWindow.endTime,
            })
          ) {
            continue;
          }
        }

        if (
          technicianEvents.some((event) =>
            overlaps(startAt, endAt, event.scheduledStartAt, event.scheduledEndAt),
          )
        ) {
          continue;
        }

        if (
          blockedAvailability.some((item) => overlaps(startAt, endAt, item.startsAt, item.endsAt))
        ) {
          continue;
        }

        if (
          explicitAvailability.length > 0 &&
          !explicitAvailability.some((item) =>
            containsRange(item.startsAt, item.endsAt, startAt, endAt),
          )
        ) {
          continue;
        }

        recommendations.push(
          this.scoreSlot({
            technicianId,
            startAt,
            endAt,
            events: technicianEvents,
            explicitAvailability,
            windowStartAt,
            windowEndAt,
            target,
          }),
        );
      }
    }

    return recommendations
      .sort(
        (left, right) =>
          right.score - left.score || left.scheduledStartAt.localeCompare(right.scheduledStartAt),
      )
      .slice(0, input.maxResults ?? 8)
      .map((recommendation, index) => ({
        ...recommendation,
        labels: index === 0 ? ['Recomendado', ...recommendation.labels] : recommendation.labels,
      }));
  }

  private scoreSlot(context: CandidateSlotContext): ScheduleRecommendationResult {
    const nearest = findNearestTerritorialEvent(context.events, context.target, context.startAt);
    const sameMunicipality = context.target.municipality
      ? context.events.some(
          (event) => normalizeText(event.municipality) === context.target.municipality,
        )
      : false;
    const sameSector = context.target.sector
      ? context.events.some((event) => normalizeText(event.sector) === context.target.sector)
      : false;
    const totalScheduledMinutes = context.events.reduce(
      (total, event) =>
        total +
        Math.max(
          0,
          Math.round(
            (event.scheduledEndAt.getTime() - event.scheduledStartAt.getTime()) / MINUTE_MS,
          ),
        ),
      0,
    );
    const distance = nearest?.distanceKm ?? null;
    const distanceScore = scoreDistance(distance);
    const municipalityScore = sameMunicipality ? 25 : 0;
    const sectorScore = sameSector ? 20 : 0;
    const routeContinuityScore = scoreRouteContinuity(
      nearest?.minutesGap ?? null,
      sameMunicipality,
      sameSector,
      distance,
    );
    const loadScore = scoreLoad(totalScheduledMinutes);
    const earliestScore = scoreEarliest(
      context.startAt,
      context.windowStartAt,
      context.windowEndAt,
    );
    const scoreBreakdown = {
      distance: distanceScore,
      municipality: municipalityScore,
      sector: sectorScore,
      routeContinuity: routeContinuityScore,
      load: loadScore,
      earliest: earliestScore,
    };
    const labels = buildLabels({
      sameMunicipality,
      sameSector,
      distance,
      explicitAvailability: context.explicitAvailability.length > 0,
      totalScheduledMinutes,
    });

    return {
      technicianId: context.technicianId,
      scheduledStartAt: context.startAt.toISOString(),
      scheduledEndAt: context.endAt.toISOString(),
      score: Math.round(Object.values(scoreBreakdown).reduce((total, value) => total + value, 0)),
      labels,
      scoreBreakdown,
      distanceKm: distance !== null ? Number(distance.toFixed(2)) : null,
      nearestEventId: nearest?.event.id ?? null,
      totalScheduledMinutes,
      eventCount: context.events.length,
    };
  }
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

function buildSlotStarts(windowStartAt: Date, windowEndAt: Date, durationMinutes: number): Date[] {
  const starts: Date[] = [];
  const first = roundUpToStep(windowStartAt, SLOT_STEP_MINUTES);
  const lastStartMs = windowEndAt.getTime() - durationMinutes * MINUTE_MS;

  for (
    let cursorMs = first.getTime();
    cursorMs <= lastStartMs;
    cursorMs += SLOT_STEP_MINUTES * MINUTE_MS
  ) {
    starts.push(new Date(cursorMs));
  }

  return starts;
}

function roundUpToStep(date: Date, stepMinutes: number): Date {
  const stepMs = stepMinutes * MINUTE_MS;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

function overlaps(startAt: Date, endAt: Date, busyStart: Date, busyEnd: Date): boolean {
  return busyStart.getTime() < endAt.getTime() && busyEnd.getTime() > startAt.getTime();
}

function containsRange(
  containerStart: Date,
  containerEnd: Date,
  startAt: Date,
  endAt: Date,
): boolean {
  return containerStart.getTime() <= startAt.getTime() && containerEnd.getTime() >= endAt.getTime();
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  return normalized || null;
}

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineKm(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function findNearestTerritorialEvent(
  events: EventLike[],
  target: TerritorialContext,
  slotStartAt: Date,
): { event: EventLike; distanceKm: number | null; minutesGap: number } | null {
  let nearest: { event: EventLike; distanceKm: number | null; minutesGap: number } | null = null;

  for (const event of events) {
    const eventLat = toNumber(event.latitude);
    const eventLon = toNumber(event.longitude);
    const distanceKm =
      target.latitude !== null &&
      target.longitude !== null &&
      eventLat !== null &&
      eventLon !== null
        ? haversineKm(target.latitude, target.longitude, eventLat, eventLon)
        : null;
    const gapBefore = Math.abs(slotStartAt.getTime() - event.scheduledEndAt.getTime());
    const gapAfter = Math.abs(event.scheduledStartAt.getTime() - slotStartAt.getTime());
    const minutesGap = Math.round(Math.min(gapBefore, gapAfter) / MINUTE_MS);

    if (!nearest) {
      nearest = { event, distanceKm, minutesGap };
      continue;
    }

    const currentDistance = distanceKm ?? Number.POSITIVE_INFINITY;
    const nearestDistance = nearest.distanceKm ?? Number.POSITIVE_INFINITY;
    if (
      currentDistance < nearestDistance ||
      (currentDistance === nearestDistance && minutesGap < nearest.minutesGap)
    ) {
      nearest = { event, distanceKm, minutesGap };
    }
  }

  return nearest;
}

function scoreDistance(distanceKm: number | null): number {
  if (distanceKm === null) return 0;
  if (distanceKm <= 1) return 35;
  if (distanceKm <= 3) return 30;
  if (distanceKm <= 7) return 22;
  if (distanceKm <= 15) return 12;
  return 4;
}

function scoreRouteContinuity(
  minutesGap: number | null,
  sameMunicipality: boolean,
  sameSector: boolean,
  distanceKm: number | null,
): number {
  if (minutesGap === null) return 0;
  const hasRouteAffinity =
    sameSector || sameMunicipality || (distanceKm !== null && distanceKm <= 7);
  if (!hasRouteAffinity) return 0;
  if (minutesGap <= 60) return 10;
  if (minutesGap <= 180) return 7;
  if (minutesGap <= 360) return 4;
  return 1;
}

function scoreLoad(totalScheduledMinutes: number): number {
  if (totalScheduledMinutes <= 180) return 5;
  if (totalScheduledMinutes <= 360) return 3;
  if (totalScheduledMinutes <= 480) return 1;
  return 0;
}

function scoreEarliest(startAt: Date, windowStartAt: Date, windowEndAt: Date): number {
  const span = Math.max(1, windowEndAt.getTime() - windowStartAt.getTime());
  const elapsed = Math.max(0, startAt.getTime() - windowStartAt.getTime());
  return Math.max(0, Math.round(5 * (1 - elapsed / span)));
}

function buildLabels(input: {
  sameMunicipality: boolean;
  sameSector: boolean;
  distance: number | null;
  explicitAvailability: boolean;
  totalScheduledMinutes: number;
}): string[] {
  const labels: string[] = ['Franja libre'];
  if (input.sameSector) labels.push('Mismo sector/vereda');
  if (input.sameMunicipality) labels.push('Mismo municipio');
  if (input.distance !== null && input.distance <= 7) labels.push('Ruta compacta');
  if (input.explicitAvailability) labels.push('Disponibilidad confirmada');
  if (input.totalScheduledMinutes <= 180) labels.push('Carga baja');
  return labels;
}
