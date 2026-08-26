import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { ConsentRecord } from './entities/consent-record-v2.entity';
import { CoverageCheck } from './entities/coverage-check.entity';
import {
  DOCUMENT_SUPPORT_STATUS,
  getDocumentDefinitionsByPersonType,
  type StoredDocumentSupportMap,
} from './document-support.types';
import { ExpedienteSectionCompletenessService } from './expediente-section-completeness.service';
import { CrmQuoteReadPort, type CrmQuoteSnapshot } from '../ports/crm-quote-read.port';
import {
  type InstallationReadinessSummary,
  type MissingRequirement,
  type SectionCompletenessItem,
  type ExpedienteSensitiveFieldPresence,
} from './expediente-section-completeness.types';

/**
 * Interfaz de resultado de completitud por dimensión
 */
export interface CompletenessResult {
  commercial: number;
  legal: number;
  technical: number;
  operational: number;
  overall: number;
  sectionCompleteness: SectionCompletenessItem[];
  installationReadiness: InstallationReadinessSummary;
  missingRequirements: MissingRequirement[];
}

export interface CompletenessCalculationContext {
  expediente: ExpedienteRecord;
  consents: ConsentRecord[];
  quotes: CrmQuoteSnapshot[];
  coverageChecks: CoverageCheck[];
  sensitiveFieldPresence?: ExpedienteSensitiveFieldPresence;
}

/**
 * Calculadora de completitud por 4 dimensiones
 * PRD v2.0 §4.6
 */
@Injectable()
export class CompletenessCalculator {
  private readonly logger = new Logger(CompletenessCalculator.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sectionCompletenessService: ExpedienteSectionCompletenessService,
    private readonly crmQuoteReadPort: CrmQuoteReadPort,
  ) {}

  /**
   * Calcular completitud de un expediente por las 4 dimensiones
   * PRD v2.0 §4.6
   */
  async calculate(expedienteId: string): Promise<CompletenessResult> {
    const { schemaName } = TenantContext.getOrThrow();
    this.logger.debug(
      `Calculating completeness for expediente ${expedienteId} in schema ${schemaName}`,
    );

    const expediente = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } }),
    );

    if (!expediente) {
      throw new Error(`Expediente ${expedienteId} no encontrado`);
    }

    const relatedContext = await this.loadRelatedContext(expedienteId, schemaName);

    return this.calculateFromContext({ expediente, ...relatedContext });
  }

  async loadRelatedContext(
    expedienteId: string,
    schemaName: string,
  ): Promise<Pick<CompletenessCalculationContext, 'consents' | 'quotes' | 'coverageChecks'>> {
    // Intentar cargar sub-tablas CRM. Si no existen (migración pendiente), continuar con
    // arrays vacíos para que al menos los campos del expediente contribuyan al score.
    let consents: ConsentRecord[] = [];
    try {
      consents = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
        qr.manager.find(ConsentRecord, {
          where: { expedienteId },
          select: ['id', 'expedienteId', 'consentType', 'status'],
        }),
      );
    } catch (consentError) {
      if (!this.isSchemaCompatibilityError(consentError)) {
        throw consentError;
      }
      this.logger.warn(`Consents no disponibles para expediente ${expedienteId}.`);
    }

    let coverageChecks: CoverageCheck[] = [];
    try {
      coverageChecks = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
        qr.manager.find(CoverageCheck, {
          where: { expedienteId },
          select: ['id', 'expedienteId', 'result'],
        }),
      );
    } catch (coverageError) {
      if (!this.isSchemaCompatibilityError(coverageError)) {
        throw coverageError;
      }
      this.logger.warn(`Coverage checks no disponibles para expediente ${expedienteId}.`);
    }

    let quotes: CrmQuoteSnapshot[] = [];
    try {
      quotes = await this.crmQuoteReadPort.findByExpedienteId(schemaName, expedienteId);
    } catch (quoteError) {
      if (!this.isSchemaCompatibilityError(quoteError)) {
        throw quoteError;
      }
      this.logger.warn(`Quotes no disponibles para expediente ${expedienteId}.`);
    }

    return { consents, coverageChecks, quotes };
  }

  async calculateFromContext(context: CompletenessCalculationContext): Promise<CompletenessResult> {
    const { expediente, consents, quotes, coverageChecks, sensitiveFieldPresence } = context;
    const expedienteId = expediente.id;
    const { schemaName } = TenantContext.getOrThrow();

    try {
      const commercial = this.calculateCommercial(expediente, quotes, sensitiveFieldPresence);
      const legal = this.calculateLegal(expediente, consents, sensitiveFieldPresence);
      const technical = Math.max(
        this.calculateTechnical(expediente, coverageChecks),
        this.calculateTechnicalFromStructuredFields(expediente),
      );
      const operational = this.calculateOperational(expediente, sensitiveFieldPresence);
      const sectionSummary = this.sectionCompletenessService.calculateSummary({
        expediente,
        consents,
        quotes,
        coverageChecks,
        sensitiveFieldPresence,
      });

      return {
        commercial,
        legal,
        technical,
        operational,
        overall: sectionSummary.overallPercentage,
        sectionCompleteness: sectionSummary.sections,
        installationReadiness: sectionSummary.installationReadiness,
        missingRequirements: sectionSummary.missingRequirements,
      };
    } catch (error) {
      this.logger.error(
        `Error calculating completeness for expediente ${expedienteId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (this.isSchemaCompatibilityError(error)) {
        this.logger.warn(
          `Compatibilidad temporal activada al calcular completitud del expediente ${expedienteId} en schema ${schemaName}.`,
        );
        return this.buildFallbackFromStoredCompleteness(expediente, sensitiveFieldPresence);
      }

      throw error;
    }
  }

  /**
   * Versión batch: calcula la completitud de múltiples expedientes con una
   * consulta por tabla usando `In(ids)`. No abre conexiones propias — usa el
   * `EntityManager` del llamador.
   *
   * Reemplaza al `Promise.all` sobre `calculate()` en el listado de expedientes,
   * que con `limit=100` abría 300 adquisiciones concurrentes contra DB_POOL_MAX=10.
   */
  async calculateBatch(
    manager: EntityManager,
    schemaName: string,
    expedienteIds: string[],
  ): Promise<Map<string, CompletenessResult>> {
    const result = new Map<string, CompletenessResult>();

    if (expedienteIds.length === 0) {
      return result;
    }

    // 1 query: todos los expedientes del lote
    const expedientes = await manager.find(ExpedienteRecord, {
      where: { id: In(expedienteIds) },
    });

    // 1 query: todos los consentimientos. Una tabla ausente no debe eliminar
    // datos obtenidos de las otras fuentes del lote.
    let consents: ConsentRecord[] = [];
    try {
      consents = await manager.find(ConsentRecord, {
        where: { expedienteId: In(expedienteIds) },
        select: ['id', 'expedienteId', 'consentType', 'status'],
      });
    } catch (error) {
      if (!this.isSchemaCompatibilityError(error)) {
        throw error;
      }
      this.logger.warn('Consents no disponibles para el lote de completitud.');
    }

    // 1 query: todos los chequeos de cobertura, con fallback independiente.
    let coverageChecks: CoverageCheck[] = [];
    try {
      coverageChecks = await manager.find(CoverageCheck, {
        where: { expedienteId: In(expedienteIds) },
        select: ['id', 'expedienteId', 'result'],
      });
    } catch (error) {
      if (!this.isSchemaCompatibilityError(error)) {
        throw error;
      }
      this.logger.warn('Coverage checks no disponibles para el lote de completitud.');
    }

    // 1 query: todas las cotizaciones (vía port batch), con fallback independiente.
    let quotes: CrmQuoteSnapshot[] = [];
    try {
      quotes = await this.crmQuoteReadPort.findByExpedienteIds(manager, expedienteIds);
    } catch (error) {
      if (!this.isSchemaCompatibilityError(error)) {
        throw error;
      }
      this.logger.warn('Quotes no disponibles para el lote de completitud.');
    }

    // Agrupar datos por expedienteId
    const consentsByExpediente = new Map<string, ConsentRecord[]>();
    for (const c of consents) {
      const bucket = consentsByExpediente.get(c.expedienteId) ?? [];
      bucket.push(c);
      consentsByExpediente.set(c.expedienteId, bucket);
    }

    const coverageByExpediente = new Map<string, CoverageCheck[]>();
    for (const c of coverageChecks) {
      const bucket = coverageByExpediente.get(c.expedienteId) ?? [];
      bucket.push(c);
      coverageByExpediente.set(c.expedienteId, bucket);
    }

    const quotesByExpediente = new Map<string, CrmQuoteSnapshot[]>();
    for (const q of quotes) {
      const bucket = quotesByExpediente.get(q.expedienteId) ?? [];
      bucket.push(q);
      quotesByExpediente.set(q.expedienteId, bucket);
    }

    // Calcular completitud para cada expediente
    for (const expediente of expedientes) {
      const expedienteConsents = consentsByExpediente.get(expediente.id) ?? [];
      const expedienteCoverage = coverageByExpediente.get(expediente.id) ?? [];
      const expedienteQuotes = quotesByExpediente.get(expediente.id) ?? [];

      try {
        const commercial = this.calculateCommercial(expediente, expedienteQuotes);
        const legal = this.calculateLegal(expediente, expedienteConsents);
        const technical = Math.max(
          this.calculateTechnical(expediente, expedienteCoverage),
          this.calculateTechnicalFromStructuredFields(expediente),
        );
        const operational = this.calculateOperational(expediente);
        const sectionSummary = this.sectionCompletenessService.calculateSummary({
          expediente,
          consents: expedienteConsents,
          quotes: expedienteQuotes,
          coverageChecks: expedienteCoverage,
        });

        result.set(expediente.id, {
          commercial,
          legal,
          technical,
          operational,
          overall: sectionSummary.overallPercentage,
          sectionCompleteness: sectionSummary.sections,
          installationReadiness: sectionSummary.installationReadiness,
          missingRequirements: sectionSummary.missingRequirements,
        });
      } catch (error) {
        this.logger.error(
          `Error calculating completeness for expediente ${expediente.id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
        result.set(expediente.id, this.buildFallbackFromStoredCompleteness(expediente));
      }
    }

    return result;
  }

  private buildFallbackFromStoredCompleteness(
    expediente: ExpedienteRecord,
    sensitiveFieldPresence?: ExpedienteSensitiveFieldPresence,
  ): CompletenessResult {
    const commercial = expediente.completenessCommercial ?? 0;
    const legal = expediente.completenessLegal ?? 0;
    const technical = expediente.completenessTechnical ?? 0;
    const operational = expediente.completenessOperational ?? 0;
    const sectionSummary = this.sectionCompletenessService.calculateSummary({
      expediente,
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence,
    });

    return {
      commercial,
      legal,
      technical,
      operational,
      overall: sectionSummary.overallPercentage,
      sectionCompleteness: sectionSummary.sections,
      installationReadiness: sectionSummary.installationReadiness,
      missingRequirements: sectionSummary.missingRequirements,
    };
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

  /**
   * Dimensión Comercial: identificación + contacto + interés + cotización
   * PRD v2.0 §4.6
   */
  private calculateCommercial(
    expediente: ExpedienteRecord,
    quotes: CrmQuoteSnapshot[],
    sensitiveFieldPresence?: ExpedienteSensitiveFieldPresence,
  ): number {
    let score = 0;
    let total = 0;

    // Identificación (4 campos)
    total += 4;
    if (expediente.fullName || sensitiveFieldPresence?.companyName) score++;
    if (expediente.documentType) score++;
    if (sensitiveFieldPresence?.documentNumber ?? expediente.documentNumberEncrypted) score++;
    if (sensitiveFieldPresence?.phonePrimary ?? expediente.phonePrimaryEncrypted) score++;

    // Contacto (2 campos)
    total += 2;
    if (sensitiveFieldPresence?.phonePrimary ?? expediente.phonePrimaryEncrypted) score++;
    if (sensitiveFieldPresence?.emailPrimary ?? expediente.emailPrimaryEncrypted) score++;

    // Interés comercial (3 campos)
    total += 3;
    if (expediente.acquisitionChannel || expediente.source) score++;
    if (expediente.interestedPlanId) score++;
    if (expediente.casePriority) score++;

    // Cotización (1 campo)
    total += 1;
    if (quotes.length > 0) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Dimensión Legal: consentimiento tratamiento datos + consentimiento comercial + verificación identidad
   * PRD v2.0 §4.6
   */
  private calculateLegal(
    expediente: ExpedienteRecord,
    consents: ConsentRecord[],
    sensitiveFieldPresence?: ExpedienteSensitiveFieldPresence,
  ): number {
    let score = 0;
    let total = 4;

    const dataTreatment = consents.find(
      (c) => c.consentType === 'TRATAMIENTO_DATOS' && c.status === 'ACEPTADO',
    );
    const commercialConsent = consents.find(
      (c) => c.consentType === 'CONTACTO_COMERCIAL' && c.status === 'ACEPTADO',
    );
    const identityVerified = expediente.identityVerified === 'verified';
    const documentSupports =
      expediente.documentSupports && typeof expediente.documentSupports === 'object'
        ? (expediente.documentSupports as StoredDocumentSupportMap)
        : {};
    const requiredDocumentDefinitions = getDocumentDefinitionsByPersonType(expediente.personType);
    const allRequiredDocumentsApproved =
      requiredDocumentDefinitions.length > 0 &&
      requiredDocumentDefinitions.every(
        (definition) =>
          sensitiveFieldPresence?.documentSupportApproved?.[definition.key] ??
          documentSupports[definition.key]?.versions?.[0]?.status ===
            DOCUMENT_SUPPORT_STATUS.APPROVED,
      );

    if (dataTreatment) score++;
    if (commercialConsent) score++;
    if (identityVerified) score++;
    if (allRequiredDocumentsApproved) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Dimensión Técnica: cobertura verificada + factibilidad + tecnología + equipamiento
   * PRD v2.0 §4.6
   */
  private calculateTechnical(
    expediente: ExpedienteRecord,
    coverageChecks: CoverageCheck[],
  ): number {
    let score = 0;
    let total = 4;

    const hasCoverage = coverageChecks.length > 0;
    const viableCoverage = coverageChecks.find(
      (c) => c.result === 'VIABLE' || c.result === 'CONDITIONAL',
    );

    if (hasCoverage) score++;
    if (viableCoverage) score++;
    if (expediente.availableTechnology) score++;
    if (expediente.estimatedEquipment) score++;

    return Math.round((score / total) * 100);
  }

  private calculateTechnicalFromStructuredFields(expediente: ExpedienteRecord): number {
    let score = 0;
    const total = 4;

    if (expediente.feasibility) score++;
    if ((expediente.candidateTechnologies?.length ?? 0) > 0 || expediente.availableTechnology)
      score++;
    if (expediente.technicalConfidence) score++;
    if (expediente.evaluationSource) score++;

    return Math.round((score / total) * 100);
  }

  /**
   * Dimensión Operativa: datos instalación + facturación + materiales
   * PRD v2.0 §4.6
   */
  private calculateOperational(
    expediente: ExpedienteRecord,
    sensitiveFieldPresence?: ExpedienteSensitiveFieldPresence,
  ): number {
    let score = 0;
    const total = 3;

    // Facturación — se ingresa desde Suscriptor 360 una vez que el expediente se convierte a cliente.
    if (sensitiveFieldPresence?.paymentMethod ?? expediente.paymentMethod) score++;
    if (sensitiveFieldPresence?.billingCycle ?? expediente.billingCycle) score++;
    if (sensitiveFieldPresence?.fiscalName ?? expediente.fiscalName) score++;

    return Math.round((score / total) * 100);
  }
}
