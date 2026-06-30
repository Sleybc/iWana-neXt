import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, QueryRunner } from 'typeorm';
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

interface ResponsibilityLookupManager {
  findOne(
    entity: typeof ExpedienteRecord,
    options: { where: { id: string } },
  ): Promise<ExpedienteRecord | null>;
  query(query: string, parameters?: unknown[]): Promise<unknown[]>;
}

@Injectable()
export class ResponsibilitiesService {
  private readonly logger = new Logger(ResponsibilitiesService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getResponsibility(expedienteId: string): Promise<ResponsibilitySnapshot> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await this.findResponsibilitySource(qr, expedienteId, schemaName);
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
      const entity = await this.findResponsibilitySource(qr, expedienteId, schemaName);
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const previousResponsibleUserId = entity.currentResponsibleUserId ?? null;

      try {
        // Usar update() en lugar de save() para tocar ÚNICAMENTE las columnas de responsable,
        // evitando que save() intente poner a null los campos NOT NULL que no se proporcionan.
        await qr.manager.update(ExpedienteRecord, expedienteId, {
          currentResponsibleUserId: dto.responsibleUserId,
          currentResponsibleAssignedAt: now,
          // Mantener sincronía con schemas legacy que aún usan assigned_to
          assignedTo: dto.responsibleUserId,
        });
      } catch (error) {
        if (!this.isSchemaCompatibilityError(error)) {
          throw error;
        }

        this.logger.warn(
          `Compatibilidad temporal activada para actualización de responsable del expediente ${expedienteId} en schema ${schemaName}.`,
        );

        await qr.manager.query(
          `
            UPDATE expediente_records
            SET assigned_to = $1,
                updated_at = $2
            WHERE id = $3
          `,
          [dto.responsibleUserId, now, expedienteId],
        );
      }

      try {
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
      } catch (historyError) {
        if (!this.isSchemaCompatibilityError(historyError)) {
          throw historyError;
        }

        this.logger.warn(
          `Historial operativo no disponible para expediente ${expedienteId} en schema ${schemaName}. ` +
            `Se omite el registro de reasignación por compatibilidad temporal.`,
        );
      }

      // Construir el snapshot directamente con los datos que ya conocemos y el qr activo,
      // evitando abrir una nueva transacción que leería el valor previo al commit.
      const newActor = await this.resolveActorWithQr(qr, dto.responsibleUserId);
      return {
        currentResponsibleUserId: dto.responsibleUserId,
        currentResponsibleAssignedAt: now,
        currentResponsible: newActor,
        expedienteId,
      };
    });
  }

  async getResponsibilityHistory(
    expedienteId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: OperationalHistoryItem[]; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await this.findResponsibilitySource(qr, expedienteId, schemaName);
      if (!entity) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      let items: OperationalResponsibilityHistory[] = [];
      let total = 0;
      try {
        [items, total] = await qr.manager.findAndCount(OperationalResponsibilityHistory, {
          where: { expedienteId },
          order: { changedAt: 'DESC' },
          skip: (page - 1) * limit,
          take: limit,
        });
      } catch (err) {
        if (this.isSchemaCompatibilityError(err)) {
          this.logger.warn(
            `Compatibilidad temporal activada para historial operativo del expediente ${expedienteId} en schema ${schemaName}.`,
          );
          return { data: [], total: 0 };
        }

        throw err;
      }

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

  private async findResponsibilitySource(
    qr: { manager: ResponsibilityLookupManager },
    expedienteId: string,
    schemaName: string,
  ): Promise<{
    id: string;
    currentResponsibleUserId: string | null;
    currentResponsibleAssignedAt: Date | null;
  } | null> {
    try {
      const entity = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!entity) {
        return null;
      }

      return {
        id: entity.id,
        currentResponsibleUserId: entity.currentResponsibleUserId,
        currentResponsibleAssignedAt: entity.currentResponsibleAssignedAt,
      };
    } catch (error) {
      if (!this.isSchemaCompatibilityError(error)) {
        throw error;
      }

      this.logger.warn(
        `Compatibilidad temporal activada para responsabilidad operativa del expediente ${expedienteId} en schema ${schemaName}.`,
      );

      const rows = (await qr.manager.query(
        `
          SELECT id, assigned_to, updated_at
          FROM expediente_records
          WHERE id = $1
          LIMIT 1
        `,
        [expedienteId],
      )) as Array<{ id: string; assigned_to: string | null; updated_at: Date | string | null }>;

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        currentResponsibleUserId: row.assigned_to,
        currentResponsibleAssignedAt: row.updated_at ? new Date(row.updated_at) : null,
      };
    }
  }

  private isSchemaCompatibilityError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const pgCode =
      'driverError' in error &&
      error.driverError &&
      typeof error.driverError === 'object' &&
      'code' in error.driverError
        ? error.driverError.code
        : undefined;

    return pgCode === '42P01' || pgCode === '42703';
  }

  private async resolveActor(schemaName: string, userId: string): Promise<ResponsibilityActor> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return this.resolveActorWithQr(qr, userId);
    });
  }

  /**
   * Resuelve el actor usando un QueryRunner existente, sin abrir una nueva transacción.
   * Usar cuando ya se está dentro de runInTenantSchema para evitar lecturas de valores
   * no confirmados por la transacción padre.
   */
  private async resolveActorWithQr(qr: QueryRunner, userId: string): Promise<ResponsibilityActor> {
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
