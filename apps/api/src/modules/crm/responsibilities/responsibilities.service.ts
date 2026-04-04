import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { PlatformUser, runInTenantSchema, TenantContext, User } from '@iwana/db';
import { OperationalResponsibilityHistory } from './entities/operational-responsibility-history.entity';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { UpdateResponsibilityDto } from './dto';

export interface ResponsibilityActor {
  userId: string | null;
  name: string | null;
  role: string | null;
}

export interface ResponsibilitySnapshot {
  currentResponsibleUserId: string | null;
  currentResponsibleAssignedAt: Date | null;
  currentResponsible: ResponsibilityActor;
  expedienteId: string;
}

export interface OperationalHistoryItem {
  id: string;
  previousResponsible: ResponsibilityActor | null;
  newResponsible: ResponsibilityActor;
  changedByActor: ResponsibilityActor;
  changedAt: Date;
  notes: string | null;
}

@Injectable()
export class ResponsibilitiesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getResponsibility(expedienteId: string): Promise<ResponsibilitySnapshot> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const actor = entity.currentResponsibleUserId
        ? await this.resolveActor(schemaName, entity.currentResponsibleUserId)
        : { userId: null, name: null, role: null };

      return {
        currentResponsibleUserId: entity.currentResponsibleUserId,
        currentResponsibleAssignedAt: entity.currentResponsibleAssignedAt,
        currentResponsible: actor,
        expedienteId: entity.id,
      };
    });
  }

  async updateResponsibility(
    expedienteId: string,
    dto: UpdateResponsibilityDto,
    actorUserId: string,
  ): Promise<ResponsibilitySnapshot> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const now = new Date();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const previousResponsibleUserId = entity.currentResponsibleUserId ?? null;

      entity.currentResponsibleUserId = dto.responsibleUserId;
      entity.currentResponsibleAssignedAt = now;
      await qr.manager.save(ExpedienteRecord, entity);

      const historyEntry = qr.manager.create(OperationalResponsibilityHistory, {
        tenantId,
        expedienteId,
        previousResponsibleUserId,
        newResponsibleUserId: dto.responsibleUserId,
        changedBy: actorUserId,
        changedAt: now,
        notes: dto.notes ?? null,
      });
      await qr.manager.save(OperationalResponsibilityHistory, historyEntry);

      return this.getResponsibility(expedienteId);
    });
  }

  async getResponsibilityHistory(
    expedienteId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: OperationalHistoryItem[]; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const [items, total] = await qr.manager.findAndCount(OperationalResponsibilityHistory, {
        where: { expedienteId },
        order: { changedAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const userIds = new Set<string>();
      for (const item of items) {
        if (item.previousResponsibleUserId) userIds.add(item.previousResponsibleUserId);
        if (item.newResponsibleUserId) userIds.add(item.newResponsibleUserId);
        if (item.changedBy) userIds.add(item.changedBy);
      }

      const actorMap =
        userIds.size > 0
          ? await this.resolveActorsBatch(schemaName, Array.from(userIds))
          : new Map<string, ResponsibilityActor>();

      const data: OperationalHistoryItem[] = items.map((item) => ({
        id: item.id,
        previousResponsible: item.previousResponsibleUserId
          ? (actorMap.get(item.previousResponsibleUserId) ?? {
              userId: item.previousResponsibleUserId,
              name: null,
              role: null,
            })
          : null,
        newResponsible: actorMap.get(item.newResponsibleUserId) ?? {
          userId: item.newResponsibleUserId,
          name: null,
          role: null,
        },
        changedByActor: actorMap.get(item.changedBy) ?? {
          userId: item.changedBy,
          name: null,
          role: null,
        },
        changedAt: item.changedAt,
        notes: item.notes,
      }));

      return { data, total };
    });
  }

  private async resolveActor(schemaName: string, userId: string): Promise<ResponsibilityActor> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUser = await qr.manager.findOne(User, { where: { id: userId } });
      if (tenantUser) {
        return {
          userId: tenantUser.id,
          name: this.formatActorName(tenantUser),
          role: tenantUser.role,
        };
      }

      const platformUser = await qr.manager.findOne(PlatformUser, { where: { id: userId } });
      if (platformUser) {
        return {
          userId: platformUser.id,
          name: this.formatActorName(platformUser),
          role: null,
        };
      }

      return { userId, name: null, role: null };
    });
  }

  private async resolveActorsBatch(
    schemaName: string,
    userIds: string[],
  ): Promise<Map<string, ResponsibilityActor>> {
    if (userIds.length === 0) {
      return new Map();
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tenantUsers = await qr.manager.find(User, { where: { id: In(userIds) } });
      const foundTenantIds = new Set(tenantUsers.map((u) => u.id));
      const platformIds = userIds.filter((id) => !foundTenantIds.has(id));
      const platformUsers = platformIds.length
        ? await qr.manager.find(PlatformUser, { where: { id: In(platformIds) } })
        : [];

      const map = new Map<string, ResponsibilityActor>();
      for (const user of tenantUsers) {
        map.set(user.id, { userId: user.id, name: this.formatActorName(user), role: user.role });
      }
      for (const pu of platformUsers) {
        map.set(pu.id, { userId: pu.id, name: this.formatActorName(pu), role: null });
      }
      return map;
    });
  }

  private formatActorName(user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  }): string | null {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.email || null;
  }
}
