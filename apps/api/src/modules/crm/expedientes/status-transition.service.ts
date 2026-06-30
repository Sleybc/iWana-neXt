import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExpedienteStatus } from '@iwana/shared';
import { CompletenessCalculator } from './completeness-calculator.service';
import { type MissingRequirement } from './expediente-section-completeness.types';
import { ExpedienteRecord } from './entities/expediente-record.entity';

/**
 * Interfaz para resultado de validación de transición
 */
export interface TransitionValidationResult {
  valid: boolean;
  missingFields?: string[];
  errorMessage?: string;
  missingRequirements?: MissingRequirement[];
  warningTitle?: string;
  warningMessage?: string;
}

/**
 * Servicio de transición de estados del pipeline
 * PRD v2.0 §4.5 - Campos mínimos por transición
 */
@Injectable()
export class StatusTransitionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly completenessCalculator: CompletenessCalculator,
  ) {}

  /**
   * Validar si una transición es permitida según campos mínimos
   * Pipeline consolidado (8 estados): NUEVO_POTENCIAL, PRECALIFICADO,
   * VALIDANDO_COBERTURA, EN_COTIZACION, LISTO_PARA_INSTALACION,
   * INSTALACION_AGENDADA, CLIENTE_ACTIVO, DESCARTADO
   *
   * Estados eliminados (ADR-026):
   * - CONTACTADO → absorbido por NUEVO_POTENCIAL
   * - PENDIENTE_DATOS → absorbido por PRECALIFICADO
   * - VIABLE_COMERCIALMENTE → absorbido por VALIDANDO_COBERTURA
   * - PENDIENTE_DECISION → absorbido por EN_COTIZACION
   */
  async validateTransition(
    expedienteId: string,
    targetStatus: ExpedienteStatus,
  ): Promise<TransitionValidationResult> {
    const { schemaName } = TenantContext.getOrThrow();

    const expediente = (await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } }),
    )) as ExpedienteRecord | null;

    if (!expediente) {
      throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
    }

    if (expediente.status === targetStatus) {
      return { valid: true };
    }

    switch (targetStatus) {
      case ExpedienteStatus.PRECALIFICADO:
        return this.validatePrecalificado(expediente);
      case ExpedienteStatus.VALIDANDO_COBERTURA:
        return this.validateValidandoCobertura(expediente);
      case ExpedienteStatus.EN_COTIZACION:
        return this.validateEnCotizacion(expediente);
      case ExpedienteStatus.LISTO_PARA_INSTALACION:
        return this.validateListoParaInstalacion(expedienteId);
      case ExpedienteStatus.INSTALACION_AGENDADA:
        return this.validateInstalacionAgenda(expediente);
      case ExpedienteStatus.CLIENTE_ACTIVO:
        return this.validateClienteActivo(expedienteId, expediente);
      case ExpedienteStatus.DESCARTADO:
        return { valid: true };
      default:
        return { valid: true };
    }
  }

  private validatePrecalificado(expediente: ExpedienteRecord): TransitionValidationResult {
    // PRECALIFICADO absorbe los requisitos de CONTACTADO y PENDIENTE_DATOS (ADR-026)
    const missing: string[] = [];

    if (!expediente.documentType) missing.push('Tipo de documento');
    if (!expediente.documentNumberEncrypted) missing.push('Número de documento');
    if (!expediente.phonePrimaryEncrypted && !expediente.emailPrimaryEncrypted)
      missing.push('Teléfono o Email');
    if (!expediente.address) missing.push('Dirección');
    if (!expediente.municipality) missing.push('Municipio');

    if (missing.length > 0) {
      return { valid: false, missingFields: missing };
    }
    return { valid: true };
  }

  private validateValidandoCobertura(expediente: ExpedienteRecord): TransitionValidationResult {
    // VALIDANDO_COBERTURA absorbe VIABLE_COMERCIALMENTE (ADR-026)
    const hasCoordinates = expediente.latitude && expediente.longitude;
    const hasAddress = expediente.address && expediente.municipality;

    if (!hasCoordinates && !hasAddress) {
      return { valid: false, missingFields: ['Coordenadas (lat/lng) o Dirección completa'] };
    }
    return { valid: true };
  }

  private validateEnCotizacion(expediente: ExpedienteRecord): TransitionValidationResult {
    // EN_COTIZACION absorbe PENDIENTE_DECISION (ADR-026)
    if (!expediente.interestedPlanId) {
      return { valid: false, missingFields: ['Plan de interés seleccionado'] };
    }
    return { valid: true };
  }

  private async validateListoParaInstalacion(
    expedienteId: string,
  ): Promise<TransitionValidationResult> {
    const completeness = await this.completenessCalculator.calculate(expedienteId);

    if (!completeness.installationReadiness.canTransition) {
      return {
        valid: false,
        errorMessage: completeness.installationReadiness.message,
        missingFields: this.formatMissingFields(completeness.missingRequirements),
        missingRequirements: completeness.missingRequirements,
      };
    }

    if (completeness.installationReadiness.status === 'READY_WITH_PENDING') {
      return {
        valid: true,
        warningTitle: completeness.installationReadiness.title,
        warningMessage: completeness.installationReadiness.message,
        missingRequirements: completeness.missingRequirements,
      };
    }

    return { valid: true };
  }

  private validateInstalacionAgenda(expediente: ExpedienteRecord): TransitionValidationResult {
    const missing: string[] = [];

    if (!expediente.ticketId) missing.push('Ticket vinculado');
    if (!expediente.workOrderId) missing.push('Orden de trabajo vinculada');

    if (missing.length > 0) {
      return { valid: false, missingFields: missing };
    }
    return { valid: true };
  }

  private async validateClienteActivo(
    expedienteId: string,
    _expediente: ExpedienteRecord,
  ): Promise<TransitionValidationResult> {
    const completeness = await this.completenessCalculator.calculate(expedienteId);

    // Soportes documentales son informativos, no bloquean el pipeline (ADR-026, spec pipeline asistido).
    // Se valida que las 6 secciones funcionales estén al 100%.
    const functionalSections = completeness.sectionCompleteness.filter(
      (s) => s.key !== 'documentSupport',
    );
    const functionalMissing = completeness.missingRequirements.filter(
      (r) => r.sectionKey !== 'documentSupport',
    );
    const allFunctionalComplete = functionalSections.every((s) => s.percentage === 100);

    if (!allFunctionalComplete) {
      return {
        valid: false,
        missingFields: [
          'Completitud funcional = 100% en las 6 secciones (excluye soportes documentales)',
          ...this.formatMissingFields(functionalMissing),
        ],
        missingRequirements: functionalMissing,
      };
    }

    // Soportes documentales pendientes se devuelven como advertencia informativa
    const documentalMissing = completeness.missingRequirements.filter(
      (r) => r.sectionKey === 'documentSupport',
    );
    if (documentalMissing.length > 0) {
      return {
        valid: true,
        warningTitle: 'Soportes documentales pendientes',
        warningMessage:
          'El expediente puede avanzar a Cliente activo. Los soportes documentales están pendientes y deben gestionarse lo antes posible.',
        missingRequirements: documentalMissing,
      };
    }

    return { valid: true };
  }

  private formatMissingFields(missingRequirements: MissingRequirement[]): string[] {
    return missingRequirements.map(
      (requirement) => `${requirement.sectionLabel}: ${requirement.fieldLabel}`,
    );
  }
}
