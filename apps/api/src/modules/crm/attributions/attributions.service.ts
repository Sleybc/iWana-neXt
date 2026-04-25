import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryRunner } from 'typeorm';
import { PlatformUser, runInTenantSchema, TenantContext, User } from '@iwana/db';
import { AttributionRole, PlatformRole, UserRole } from '@iwana/shared';
import { SalesAttribution } from './entities/sales-attribution.entity';
import { CreateAttributionDto } from './dto/create-attribution.dto';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';

@Injectable()
export class AttributionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createAttribution(
    expedienteId: string,
    dto: CreateAttributionDto,
    actorUserId: string,
  ): Promise<SalesAttribution> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const expediente = await qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } });
      if (!expediente) {
        throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
      }

      const now = new Date();
      const current = await qr.manager.findOne(SalesAttribution, {
        where: { expedienteId, revokedAt: IsNull() },
      });

      if (current) {
        if (!dto.reattributionReason?.trim()) {
          throw new BadRequestException({
            code: 'REATTRIBUTION_REASON_REQUIRED',
            message: 'La reatribución exige motivo cuando ya existe una atribución activa.',
          });
        }

        current.revokedAt = now;
        current.revokedBy = actorUserId;
        current.revokedReason = this.sanitizeText(dto.reattributionReason, 255);
        await qr.manager.save(SalesAttribution, current);
      }

      const actorIdentity = await this.resolveActorIdentity(qr, dto.actorId);

      const entity = qr.manager.create(SalesAttribution, {
        tenantId,
        expedienteId,
        attributionRole: AttributionRole.ORIGINATOR,
        actorId: dto.actorId,
        actorRole: actorIdentity.actorRole,
        actorName: actorIdentity.actorName,
        acquisitionChannel: dto.acquisitionChannel,
        notes: this.sanitizeText(dto.notes, 500),
        attributedAt: now,
        attributedBy: actorUserId,
        revokedAt: null,
        revokedBy: null,
        revokedReason: null,
      });

      return qr.manager.save(SalesAttribution, entity);
    });
  }

  async getCurrentAttribution(expedienteId: string): Promise<SalesAttribution | null> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(SalesAttribution, {
        where: { expedienteId, revokedAt: IsNull() },
        order: { attributedAt: 'DESC' },
      }),
    );
  }

  async getAttributionHistory(expedienteId: string): Promise<SalesAttribution[]> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(SalesAttribution, {
        where: { expedienteId },
        order: { attributedAt: 'DESC' },
      }),
    );
  }

  async revokeAttribution(
    expedienteId: string,
    reason: string,
    actorUserId: string,
  ): Promise<SalesAttribution> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const current = await qr.manager.findOne(SalesAttribution, {
        where: { expedienteId, revokedAt: IsNull() },
      });

      if (!current) {
        throw new NotFoundException('No existe atribución activa para revocar.');
      }

      current.revokedAt = new Date();
      current.revokedBy = actorUserId;
      current.revokedReason = this.sanitizeText(reason, 255);

      return qr.manager.save(SalesAttribution, current);
    });
  }

  private sanitizeText(value: string | undefined, maxLength: number): string | null {
    if (!value) {
      return null;
    }

    const sanitized = value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
    return sanitized.length > 0 ? sanitized : null;
  }

  private async resolveActorIdentity(
    qr: QueryRunner,
    actorId: string,
  ): Promise<{ actorName: string; actorRole: UserRole }> {
    const tenantUser = await qr.manager.findOne(User, { where: { id: actorId } });
    if (tenantUser) {
      return {
        actorName: this.formatActorName(tenantUser.firstName, tenantUser.lastName, tenantUser.email),
        actorRole: tenantUser.role,
      };
    }

    const platformUser = await qr.manager.findOne(PlatformUser, { where: { id: actorId } });
    if (platformUser) {
      return {
        actorName: this.formatActorName(platformUser.firstName, platformUser.lastName, platformUser.email),
        actorRole: this.mapPlatformRoleToUserRole(platformUser.role),
      };
    }

    throw new BadRequestException({
      code: 'ACTOR_NOT_FOUND',
      message:
        'El actor originador no existe en el sistema. Debe estar creado como usuario antes de atribuir el expediente.',
    });
  }

  private mapPlatformRoleToUserRole(role: PlatformRole): UserRole {
    if (role === PlatformRole.SYSTEM_ADMIN) {
      return UserRole.SYSTEM_ADMIN;
    }

    return UserRole.IWANA_SUPPORT;
  }

  private formatActorName(firstName?: string | null, lastName?: string | null, email?: string): string {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return fullName || email || 'Usuario sin nombre';
  }
}
