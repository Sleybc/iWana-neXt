import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { ConsentRecord } from './entities/consent-record-v2.entity';
import { CoverageCheck } from './entities/coverage-check.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { ConsentType, ConsentStatus, Feasibility } from '@iwana/shared';
import {
  DOCUMENT_SUPPORT_STATUS,
  getDocumentDefinitionsByPersonType,
  type StoredDocumentSupportMap,
} from './document-support.types';

/**
 * Interfaz de resultado de completitud por dimensión
 */
export interface CompletenessResult {
  commercial: number;
  legal: number;
  technical: number;
  operational: number;
  overall: number;
}

/**
 * Calculadora de completitud por 4 dimensiones
 * PRD v2.0 §4.6
 */
@Injectable()
export class CompletenessCalculator {
  private readonly logger = new Logger(CompletenessCalculator.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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

    // Intentar cargar sub-tablas CRM. Si no existen (migración pendiente), continuar con
    // arrays vacíos para que al menos los campos del expediente contribuyan al score.
    let consents: ConsentRecord[] = [];
    let quotes: Quote[] = [];
    let coverageChecks: CoverageCheck[] = [];

    try {
      const expedienteData = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const loadedConsents = await qr.manager.find(ConsentRecord, { where: { expedienteId } });
        const loadedQuotes = await qr.manager.find(Quote, { where: { expedienteId } });
        const loadedCoverageChecks = await qr.manager.find(CoverageCheck, {
          where: { expedienteId },
        });
        return {
          consents: loadedConsents,
          quotes: loadedQuotes,
          coverageChecks: loadedCoverageChecks,
        };
      });

      consents = expedienteData.consents;
      quotes = expedienteData.quotes;
      coverageChecks = expedienteData.coverageChecks;
    } catch (subTableError) {
      if (this.isSchemaCompatibilityError(subTableError)) {
        // Sub-tablas aún no migradas — calcular con arrays vacíos para reflejar al menos
        // los campos del expediente (identificación, interés comercial, operativa).
        this.logger.warn(
          `Sub-tablas CRM no disponibles para expediente ${expedienteId} en schema ${schemaName}. ` +
            `Se calculará completitud parcial sin consents/quotes/coverage.`,
        );
      } else {
        throw subTableError;
      }
    }

    try {
      const commercial = this.calculateCommercial(expediente, quotes);
      const legal = this.calculateLegal(expediente, consents);
      const technical = Math.max(
        this.calculateTechnical(expediente, coverageChecks),
        this.calculateTechnicalFromStructuredFields(expediente),
      );
      const operational = this.calculateOperational(expediente);

      const overall = Math.round((commercial + legal + technical + operational) / 4);

      return { commercial, legal, technical, operational, overall };
    } catch (error) {
      this.logger.error(
        `Error calculating completeness for expediente ${expedienteId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (this.isSchemaCompatibilityError(error)) {
        this.logger.warn(
          `Compatibilidad temporal activada al calcular completitud del expediente ${expedienteId} en schema ${schemaName}.`,
        );
        return this.buildFallbackFromStoredCompleteness(expediente);
      }

      throw error;
    }
  }

  private buildFallbackFromStoredCompleteness(expediente: ExpedienteRecord): CompletenessResult {
    const commercial = expediente.completenessCommercial ?? 0;
    const legal = expediente.completenessLegal ?? 0;
    const technical = expediente.completenessTechnical ?? 0;
    const operational = expediente.completenessOperational ?? 0;
    const overall = Math.round((commercial + legal + technical + operational) / 4);

    return { commercial, legal, technical, operational, overall };
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
  private calculateCommercial(expediente: ExpedienteRecord, quotes: Quote[]): number {
    let score = 0;
    let total = 0;

    // Identificación (4 campos)
    total += 4;
    if (expediente.fullName) score++;
    if (expediente.documentType) score++;
    if (expediente.documentNumberEncrypted) score++;
    if (expediente.phonePrimaryEncrypted) score++;

    // Contacto (2 campos)
    total += 2;
    if (expediente.phonePrimaryEncrypted) score++;
    if (expediente.emailPrimaryEncrypted) score++;

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
  private calculateLegal(expediente: ExpedienteRecord, consents: ConsentRecord[]): number {
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
  private calculateOperational(expediente: ExpedienteRecord): number {
    let score = 0;
    const total = 3;

    // Facturación — se ingresa desde Suscriptor 360 una vez que el expediente se convierte a cliente.
    if (expediente.paymentMethod) score++;
    if (expediente.billingCycle) score++;
    if (expediente.fiscalName) score++;

    return Math.round((score / total) * 100);
  }
}
