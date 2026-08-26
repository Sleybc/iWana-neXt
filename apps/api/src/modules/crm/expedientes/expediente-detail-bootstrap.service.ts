import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { DataSource } from 'typeorm';
import {
  CrmActorReadPort,
  CrmAttributionReadPort,
  CrmResponsibilityReadPort,
  CrmSubscriberReadPort,
  type CrmCurrentAttributionSnapshot,
} from '../ports';
import { ExpedienteRecord } from './entities/expediente-record.entity';
import {
  type CompletenessCalculationContext,
  CompletenessCalculator,
} from './completeness-calculator.service';
import { PipelineRecommendationService } from './pipeline-recommendation.service';
import { AuditService } from '../../audit/audit.service';
import {
  type CurrentAttributionSummary,
  type ExpedienteDetailBootstrap,
  type ExpedienteDetailOperationalMetadata,
  type ExpedienteDetailProjection,
  type SubscriberSummary,
} from './dto/expediente-detail-bootstrap.dto';
import type { ExpedienteSensitiveFieldPresence } from './expediente-section-completeness.types';
import { DOCUMENT_SUPPORT_KEYS, type DocumentSupportApprovedFlags } from './document-support.types';

const BOOTSTRAP_CONTEXT_FIELDS: (keyof ExpedienteRecord)[] = [
  'id',
  'status',
  'previousStatus',
  'statusChangedAt',
  'dataConsentRevoked',
  'fullName',
  'documentType',
  'personType',
  'source',
  'acquisitionChannel',
  'interestedPlanId',
  'additionalProductIds',
  'additionalServiceIds',
  'casePriority',
  'availableTechnology',
  'feasibility',
  'candidateTechnologies',
  'technicalConfidence',
  'evaluationSource',
  'estimatedEquipment',
  'identityVerified',
  'legalComplianceStatus',
  'ticketId',
  'workOrderId',
  'createdBy',
  'createdAt',
  'updatedAt',
];

const PRESENCE_ALIASES = {
  documentNumber: 'bootstrap_has_document_number',
  phonePrimary: 'bootstrap_has_phone_primary',
  emailPrimary: 'bootstrap_has_email_primary',
  altContactPhone: 'bootstrap_has_alt_contact_phone',
  companyName: 'bootstrap_has_company_name',
  altContactName: 'bootstrap_has_alt_contact_name',
  paymentMethod: 'bootstrap_has_payment_method',
  billingCycle: 'bootstrap_has_billing_cycle',
  fiscalName: 'bootstrap_has_fiscal_name',
  hasAddress: 'bootstrap_has_address',
  hasMunicipality: 'bootstrap_has_municipality',
  hasDepartment: 'bootstrap_has_department',
  hasPostalCode: 'bootstrap_has_postal_code',
  hasStratum: 'bootstrap_has_stratum',
  hasNeighborhood: 'bootstrap_has_neighborhood',
  hasLatitude: 'bootstrap_has_latitude',
  hasLongitude: 'bootstrap_has_longitude',
  hasLocation: 'bootstrap_has_location',
  documentSupportApproved: {
    identity_document: 'bootstrap_document_identity_approved',
    utility_bill: 'bootstrap_document_utility_bill_approved',
    chamber_of_commerce: 'bootstrap_document_chamber_approved',
    rut: 'bootstrap_document_rut_approved',
    legal_representative_id: 'bootstrap_document_legal_representative_approved',
  },
} as const;

@Injectable()
export class ExpedienteDetailBootstrapService {
  private readonly logger = new Logger(ExpedienteDetailBootstrapService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly completenessCalculator: CompletenessCalculator,
    private readonly pipelineRecommendationService: PipelineRecommendationService,
    private readonly attributionsReadPort: CrmAttributionReadPort,
    private readonly responsibilitiesReadPort: CrmResponsibilityReadPort,
    private readonly subscribersReadPort: CrmSubscriberReadPort,
    private readonly crmActorReadPort: CrmActorReadPort,
    private readonly auditService: AuditService,
  ) {}

  async getDetailBootstrap(id: string, actorUserId: string): Promise<ExpedienteDetailBootstrap> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const { expediente, sensitiveFieldPresence } = await this.loadContextProjection(id, schemaName);

    const relatedContextPromise = this.completenessCalculator.loadRelatedContext(id, schemaName);
    const completenessPromise = relatedContextPromise.then((relatedContext) => {
      const context: CompletenessCalculationContext = {
        expediente,
        sensitiveFieldPresence,
        ...relatedContext,
      };
      return this.completenessCalculator.calculateFromContext(context);
    });
    const enrichmentsPromise = Promise.all([
      this.buildOperationalMetadata(expediente, schemaName),
      this.attributionsReadPort.getCurrentAttribution(id),
      this.responsibilitiesReadPort.getResponsibility(id),
      this.getOptionalSubscriberSummary(id),
    ]);

    const [completeness, enrichments] = await Promise.all([
      completenessPromise,
      enrichmentsPromise,
    ]);

    const pipelineRecommendation =
      await this.pipelineRecommendationService.getRecommendationFromContext(
        expediente,
        completeness,
        sensitiveFieldPresence,
      );

    const [operationalMetadata, currentAttribution, responsibility, subscriberSummary] =
      enrichments;

    const result: ExpedienteDetailBootstrap = {
      expediente: this.toSafeProjection(expediente, sensitiveFieldPresence),
      completeness,
      pipelineRecommendation,
      operationalMetadata,
      currentAttribution: currentAttribution ? this.toAttributionSummary(currentAttribution) : null,
      responsibility,
      subscriberSummary,
    };

    // Solo registra dimensiones operativas; nunca persiste la proyección ni valores PII.
    // AuditService es fire-and-forget y no bloquea la respuesta si falla la auditoría.
    void this.auditService.log({
      action: AuditAction.LIST_ACCESS,
      entityType: 'ExpedienteBootstrap',
      entityId: id,
      userId: actorUserId,
      tenantId,
      schemaName,
      newValue: {
        surface: 'detail-bootstrap',
        result: 'success',
      },
    });

    return result;
  }

  private async loadContextProjection(
    id: string,
    schemaName: string,
  ): Promise<{
    expediente: ExpedienteRecord;
    sensitiveFieldPresence: ExpedienteSensitiveFieldPresence;
  }> {
    const result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager
        .createQueryBuilder(ExpedienteRecord, 'expediente')
        .select(BOOTSTRAP_CONTEXT_FIELDS.map((field) => `expediente.${field}`))
        // Solo se transportan flags booleanos; los valores cifrados no salen del query.
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.document_number_encrypted), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.documentNumber,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.phone_primary_encrypted), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.phonePrimary,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.email_primary_encrypted), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.emailPrimary,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.alt_contact_phone_encrypted), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.altContactPhone,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.company_name), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.companyName,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.alt_contact_name), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.altContactName,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.payment_method), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.paymentMethod,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.billing_cycle), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.billingCycle,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.fiscal_name), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.fiscalName,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.address), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.hasAddress,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.municipality), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.hasMunicipality,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.department), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.hasDepartment,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.postal_code), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.hasPostalCode,
        )
        .addSelect(
          'CASE WHEN expediente.stratum IS NOT NULL THEN TRUE ELSE FALSE END',
          PRESENCE_ALIASES.hasStratum,
        )
        .addSelect(
          "CASE WHEN NULLIF(BTRIM(expediente.neighborhood), '') IS NOT NULL THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.hasNeighborhood,
        )
        .addSelect(
          'CASE WHEN expediente.latitude IS NOT NULL THEN TRUE ELSE FALSE END',
          PRESENCE_ALIASES.hasLatitude,
        )
        .addSelect(
          'CASE WHEN expediente.longitude IS NOT NULL THEN TRUE ELSE FALSE END',
          PRESENCE_ALIASES.hasLongitude,
        )
        .addSelect(
          `CASE WHEN NULLIF(BTRIM(expediente.address), '') IS NOT NULL
            OR NULLIF(BTRIM(expediente.municipality), '') IS NOT NULL
            OR NULLIF(BTRIM(expediente.department), '') IS NOT NULL
            OR NULLIF(BTRIM(expediente.postal_code), '') IS NOT NULL
            OR expediente.stratum IS NOT NULL
            OR NULLIF(BTRIM(expediente.neighborhood), '') IS NOT NULL
            OR expediente.latitude IS NOT NULL
            OR expediente.longitude IS NOT NULL
            THEN TRUE ELSE FALSE END`,
          PRESENCE_ALIASES.hasLocation,
        )
        .addSelect(
          "CASE WHEN expediente.document_supports->'identity_document'->'versions'->0->>'status' = 'APPROVED' THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.documentSupportApproved.identity_document,
        )
        .addSelect(
          "CASE WHEN expediente.document_supports->'utility_bill'->'versions'->0->>'status' = 'APPROVED' THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.documentSupportApproved.utility_bill,
        )
        .addSelect(
          "CASE WHEN expediente.document_supports->'chamber_of_commerce'->'versions'->0->>'status' = 'APPROVED' THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.documentSupportApproved.chamber_of_commerce,
        )
        .addSelect(
          "CASE WHEN expediente.document_supports->'rut'->'versions'->0->>'status' = 'APPROVED' THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.documentSupportApproved.rut,
        )
        .addSelect(
          "CASE WHEN expediente.document_supports->'legal_representative_id'->'versions'->0->>'status' = 'APPROVED' THEN TRUE ELSE FALSE END",
          PRESENCE_ALIASES.documentSupportApproved.legal_representative_id,
        )
        .where('expediente.id = :id', { id });

      const { entities, raw } = await query.getRawAndEntities();
      const expediente = entities[0];
      const row = raw[0] as Record<string, unknown> | undefined;

      return expediente
        ? {
            expediente,
            sensitiveFieldPresence: {
              documentNumber: this.readPresenceFlag(row, PRESENCE_ALIASES.documentNumber),
              phonePrimary: this.readPresenceFlag(row, PRESENCE_ALIASES.phonePrimary),
              emailPrimary: this.readPresenceFlag(row, PRESENCE_ALIASES.emailPrimary),
              altContactPhone: this.readPresenceFlag(row, PRESENCE_ALIASES.altContactPhone),
              companyName: this.readPresenceFlag(row, PRESENCE_ALIASES.companyName),
              altContactName: this.readPresenceFlag(row, PRESENCE_ALIASES.altContactName),
              paymentMethod: this.readPresenceFlag(row, PRESENCE_ALIASES.paymentMethod),
              billingCycle: this.readPresenceFlag(row, PRESENCE_ALIASES.billingCycle),
              fiscalName: this.readPresenceFlag(row, PRESENCE_ALIASES.fiscalName),
              hasAddress: this.readPresenceFlag(row, PRESENCE_ALIASES.hasAddress),
              hasMunicipality: this.readPresenceFlag(row, PRESENCE_ALIASES.hasMunicipality),
              hasDepartment: this.readPresenceFlag(row, PRESENCE_ALIASES.hasDepartment),
              hasPostalCode: this.readPresenceFlag(row, PRESENCE_ALIASES.hasPostalCode),
              hasStratum: this.readPresenceFlag(row, PRESENCE_ALIASES.hasStratum),
              hasNeighborhood: this.readPresenceFlag(row, PRESENCE_ALIASES.hasNeighborhood),
              hasLatitude: this.readPresenceFlag(row, PRESENCE_ALIASES.hasLatitude),
              hasLongitude: this.readPresenceFlag(row, PRESENCE_ALIASES.hasLongitude),
              hasLocation: this.readPresenceFlag(row, PRESENCE_ALIASES.hasLocation),
              documentSupportApproved: DOCUMENT_SUPPORT_KEYS.reduce<DocumentSupportApprovedFlags>(
                (flags, key) => {
                  flags[key] = this.readPresenceFlag(
                    row,
                    PRESENCE_ALIASES.documentSupportApproved[key],
                  );
                  return flags;
                },
                {},
              ),
            },
          }
        : null;
    });

    if (!result) {
      throw new NotFoundException('Expediente no encontrado');
    }

    return result;
  }

  private async buildOperationalMetadata(
    expediente: ExpedienteRecord,
    schemaName: string,
  ): Promise<ExpedienteDetailOperationalMetadata> {
    const auditLogs = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(AuditLog, {
        where: { entityType: 'ExpedienteRecord', entityId: expediente.id },
        select: ['userId', 'createdAt', 'newValue'],
        order: { createdAt: 'DESC' },
        take: 25,
      }),
    );
    const latestAudit = auditLogs.find((audit) => !this.isPiiAccessAudit(audit.newValue));

    const actorIds = [expediente.createdBy, latestAudit?.userId].filter(
      (userId): userId is string => Boolean(userId),
    );
    const actors = actorIds.length
      ? await this.crmActorReadPort.findByIds(schemaName, [...new Set(actorIds)])
      : [];
    const actorMap = new Map(actors.map((actor) => [actor.id, actor.name]));
    const createdBy = {
      userId: expediente.createdBy ?? null,
      name: expediente.createdBy ? (actorMap.get(expediente.createdBy) ?? null) : null,
    };
    const lastEditedUserId = latestAudit?.userId ?? expediente.createdBy ?? null;

    return {
      createdBy,
      lastEditedBy: {
        userId: lastEditedUserId,
        name: lastEditedUserId ? (actorMap.get(lastEditedUserId) ?? null) : null,
      },
      lastActivityAt: latestAudit?.createdAt ?? expediente.updatedAt ?? null,
    };
  }

  private async getOptionalSubscriberSummary(id: string): Promise<SubscriberSummary | null> {
    try {
      return await this.subscribersReadPort.findSummaryByExpedienteId(id);
    } catch (error) {
      if (this.isSchemaCompatibilityError(error)) {
        return null;
      }

      this.logger.warn('No se pudo obtener el resumen opcional del suscriptor.');
      throw error;
    }
  }

  private readPresenceFlag(row: Record<string, unknown> | undefined, alias: string): boolean {
    return row?.[alias] === true || row?.[alias] === 'true';
  }

  private isPiiAccessAudit(newValue: Record<string, unknown> | null | undefined): boolean {
    return typeof newValue?.['piiaAccess'] === 'string';
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

  private toSafeProjection(
    expediente: ExpedienteRecord,
    sensitiveFieldPresence: ExpedienteSensitiveFieldPresence,
  ): ExpedienteDetailProjection {
    return {
      id: expediente.id,
      status: expediente.status,
      previousStatus: expediente.previousStatus,
      statusChangedAt: expediente.statusChangedAt,
      dataConsentRevoked: Boolean(expediente.dataConsentRevoked),
      createdAt: expediente.createdAt,
      updatedAt: expediente.updatedAt,
      fullName: expediente.fullName,
      documentType: expediente.documentType,
      personType: expediente.personType,
      hasLocation:
        sensitiveFieldPresence.hasLocation ??
        Boolean(
          expediente.address ||
          expediente.municipality ||
          expediente.latitude != null ||
          expediente.longitude != null,
        ),
      source: expediente.source,
      acquisitionChannel: expediente.acquisitionChannel,
      interestedPlanId: expediente.interestedPlanId,
      additionalProductIds: expediente.additionalProductIds,
      additionalServiceIds: expediente.additionalServiceIds ?? [],
    };
  }

  private toAttributionSummary(
    attribution: CrmCurrentAttributionSnapshot,
  ): CurrentAttributionSummary {
    return {
      id: attribution.id,
      expedienteId: attribution.expedienteId,
      attributionRole: attribution.attributionRole,
      actorRole: attribution.actorRole,
      actorName: attribution.actorName,
      acquisitionChannel: attribution.acquisitionChannel,
      attributedAt: attribution.attributedAt,
      revokedAt: attribution.revokedAt,
    };
  }
}
