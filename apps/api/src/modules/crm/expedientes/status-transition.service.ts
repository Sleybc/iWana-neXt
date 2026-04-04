import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExpedienteStatus } from '@iwana/shared';
import { CompletenessCalculator } from './completeness-calculator.service';
import { ExpedienteRecord } from './entities/expediente-record.entity';

/**
 * Interfaz para resultado de validación de transición
 */
export interface TransitionValidationResult {
  valid: boolean;
  missingFields?: string[];
  errorMessage?: string;
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
   * PRD v2.0 §4.5
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

    switch (targetStatus) {
      case ExpedienteStatus.CONTACTADO:
        return this.validateContacted(expediente);
      case ExpedienteStatus.PRECALIFICADO:
        return this.validatePrecalificado(expediente);
      case ExpedienteStatus.VALIDANDO_COBERTURA:
        return this.validateValidandoCobertura(expediente);
      case ExpedienteStatus.VIABLE_COMERCIALMENTE:
        return this.validateViableComercialmente(expediente);
      case ExpedienteStatus.EN_COTIZACION:
        return this.validateEnCotizacion(expediente);
      case ExpedienteStatus.PENDIENTE_DECISION:
        return this.validatePendienteDecision(expediente);
      case ExpedienteStatus.LISTO_PARA_INSTALACION:
        return this.validateListoParaInstalacion(expediente);
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

  private validateContacted(expediente: ExpedienteRecord): TransitionValidationResult {
    const hasContact = expediente.phonePrimaryEncrypted || expediente.emailPrimaryEncrypted;
    if (!hasContact) {
      return { valid: false, missingFields: ['Teléfono o Email'] };
    }
    return { valid: true };
  }

  private validatePrecalificado(expediente: ExpedienteRecord): TransitionValidationResult {
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
    const hasCoordinates = expediente.latitude && expediente.longitude;
    const hasAddress = expediente.address && expediente.municipality;

    if (!hasCoordinates && !hasAddress) {
      return { valid: false, missingFields: ['Coordenadas (lat/lng) o Dirección completa'] };
    }
    return { valid: true };
  }

  private validateViableComercialmente(expediente: ExpedienteRecord): TransitionValidationResult {
    return { valid: true };
  }

  private validateEnCotizacion(expediente: ExpedienteRecord): TransitionValidationResult {
    if (!expediente.interestedPlanId) {
      return { valid: false, missingFields: ['Plan de interés seleccionado'] };
    }
    return { valid: true };
  }

  private validatePendienteDecision(expediente: ExpedienteRecord): TransitionValidationResult {
    return { valid: true };
  }

  private validateListoParaInstalacion(expediente: ExpedienteRecord): TransitionValidationResult {
    const missing: string[] = [];

    if (!expediente.installationAddress) missing.push('Dirección de instalación');
    if (!expediente.siteContactName) missing.push('Contacto en sitio');

    if (missing.length > 0) {
      return { valid: false, missingFields: missing };
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
    expediente: ExpedienteRecord,
  ): Promise<TransitionValidationResult> {
    const missing: string[] = [];

    const completeness = await this.completenessCalculator.calculate(expedienteId);
    const commercial = completeness.commercial;
    const legal = completeness.legal;
    const tech = completeness.technical;
    const ops = completeness.operational;

    if (commercial < 90 || legal < 90 || tech < 90 || ops < 90) {
      missing.push('Completitud >= 90% en las 4 dimensiones');
    }

    if (!expediente.checklistCompleted) missing.push('Checklist completo');

    if (missing.length > 0) {
      return { valid: false, missingFields: missing };
    }
    return { valid: true };
  }
}
