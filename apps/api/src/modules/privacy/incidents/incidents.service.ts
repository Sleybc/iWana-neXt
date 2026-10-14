import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AuditAction,
  CreatePrivacyIncident,
  PrivacyIncident,
  ReportPrivacyIncident,
  addColombiaBusinessDays,
} from '@iwana/shared';
import { DataSource, IsNull } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrivacyIncidentEntity } from '../entities/privacy-incident.entity';
import { bogotaCivilDate, withPrivacyTenant } from '../ports/privacy-tenant-query';

export function sicReportDueDate(detectedAt: Date): string {
  return addColombiaBusinessDays(bogotaCivilDate(detectedAt), 15);
}

@Injectable()
export class IncidentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PrivacyIncident[]> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = await manager.getRepository(PrivacyIncidentEntity).find({
        order: { detectedAt: 'DESC', id: 'DESC' },
      });
      return rows.map((row) => this.toView(row));
    });
  }

  async create(input: CreatePrivacyIncident, actor: JwtPayload): Promise<PrivacyIncident> {
    const detectedAt = new Date();
    const sicReportDueAt = sicReportDueDate(detectedAt);
    const saved = await withPrivacyTenant(this.dataSource, async (manager) => {
      const repository = manager.getRepository(PrivacyIncidentEntity);
      return repository.save(
        repository.create({
          detectedAt,
          description: input.description,
          affectedCategories: input.affectedCategories,
          sicReportDueAt,
          reportedAt: null,
          externalReference: null,
          actorId: actor.sub,
        }),
      );
    });

    // Solo queda el identificador opaco; la descripción y las categorías pueden contener PII.
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'PrivacyIncident',
      entityId: saved.id,
    });
    return this.toView(saved);
  }

  async report(
    id: string,
    input: ReportPrivacyIncident,
    actor: JwtPayload,
  ): Promise<PrivacyIncident> {
    const incident = await withPrivacyTenant(this.dataSource, async (manager) => {
      const repository = manager.getRepository(PrivacyIncidentEntity);
      const existing = await repository.findOne({ where: { id } });
      if (!existing) {
        throw new NotFoundException({
          code: 'PRIVACY_INCIDENT_NOT_FOUND',
          message: 'No existe el incidente de privacidad indicado.',
        });
      }
      if (existing.reportedAt !== null || existing.externalReference !== null) {
        throw new ConflictException({
          code: 'PRIVACY_INCIDENT_ALREADY_REPORTED',
          message: 'El incidente ya fue reportado.',
        });
      }

      const today = bogotaCivilDate(new Date());
      const detectedAt = bogotaCivilDate(existing.detectedAt);
      if (input.reportedAt < detectedAt || input.reportedAt > today) {
        throw new UnprocessableEntityException({
          code: 'PRIVACY_INCIDENT_REPORTED_DATE_INVALID',
          message: 'La fecha de reporte debe estar entre la detección y hoy.',
        });
      }

      const result = await repository.update(
        { id, reportedAt: IsNull(), externalReference: IsNull() },
        { reportedAt: input.reportedAt, externalReference: input.externalReference },
      );
      if (result.affected !== 1) {
        const latest = await repository.findOne({ where: { id } });
        if (!latest) {
          throw new NotFoundException({
            code: 'PRIVACY_INCIDENT_NOT_FOUND',
            message: 'No existe el incidente de privacidad indicado.',
          });
        }
        throw new ConflictException({
          code: 'PRIVACY_INCIDENT_ALREADY_REPORTED',
          message: 'El incidente ya fue reportado.',
        });
      }

      const updated = await repository.findOne({ where: { id } });
      if (!updated) {
        throw new NotFoundException({
          code: 'PRIVACY_INCIDENT_NOT_FOUND',
          message: 'No existe el incidente de privacidad indicado.',
        });
      }
      return updated;
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'PrivacyIncident',
      entityId: incident.id,
      userId: actor.sub,
    });
    return this.toView(incident);
  }

  private toView(row: PrivacyIncidentEntity): PrivacyIncident {
    return {
      id: row.id,
      detectedAt: row.detectedAt.toISOString(),
      description: row.description,
      affectedCategories: row.affectedCategories,
      sicReportDueAt: row.sicReportDueAt,
      reportedAt: row.reportedAt,
      externalReference: row.externalReference,
    };
  }
}
