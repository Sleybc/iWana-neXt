import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExpedienteStatus } from '@iwana/shared';
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { CompletenessCalculator, type CompletenessResult } from './completeness-calculator.service';
import type { MissingRequirement } from './expediente-section-completeness.types';

/**
 * Resultado de la recomendación del pipeline asistido.
 * Spec: docs/superpowers/specs/2026-05-05-crm-pipeline-state-recommendation-design.md
 */
export interface PipelineRecommendation {
  currentStatus: ExpedienteStatus;
  /** Estado sugerido calculado por hitos. null si ya está en el estado óptimo recomendado. */
  suggestedStatus: ExpedienteStatus | null;
  /** Razón en texto corto visible al asesor. */
  recommendationReason: string | null;
  /** Faltantes que bloquean la transición al estado sugerido (no incluye soportes documentales). */
  blockingRequirements: MissingRequirement[];
  /** Faltantes informativos: soportes documentales y datos opcionales. No bloquean el pipeline. */
  informationalRequirements: MissingRequirement[];
}

/**
 * Servicio de recomendación asistida del pipeline CRM.
 *
 * Calcula el siguiente estado sugerido basado en hitos de negocio reales:
 * datos mínimos, ubicación, plan elegido, viabilidad funcional, ticket/OT.
 *
 * Los soportes documentales NO bloquean el pipeline — son solo pendientes informativos.
 * El usuario siempre confirma la transición manualmente.
 */
@Injectable()
export class PipelineRecommendationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly completenessCalculator: CompletenessCalculator,
  ) {}

  async getRecommendation(expedienteId: string): Promise<PipelineRecommendation> {
    const { schemaName } = TenantContext.getOrThrow();

    const expediente = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } }),
    );

    if (!expediente) {
      throw new NotFoundException(`Expediente ${expedienteId} no encontrado`);
    }

    const completeness = await this.completenessCalculator.calculate(expedienteId);

    // Separar soportes documentales (informativos) del resto (potencialmente bloqueantes)
    const informationalRequirements = completeness.missingRequirements.filter(
      (r) => r.sectionKey === 'documentSupport',
    );
    const functionalMissing = completeness.missingRequirements.filter(
      (r) => r.sectionKey !== 'documentSupport',
    );

    // Porcentaje funcional sin contar la sección de soportes documentales
    const functionalOverall = this.calculateFunctionalOverall(completeness);

    const suggestedStatus = this.calculateSuggestedStatus(expediente, functionalOverall);

    const { reason, blocking } = this.buildReasonAndBlocking(
      expediente,
      suggestedStatus,
      functionalMissing,
      functionalOverall,
    );

    const isSameAsCurrentOrDescartado =
      suggestedStatus === expediente.status || expediente.status === ExpedienteStatus.DESCARTADO;

    return {
      currentStatus: expediente.status,
      suggestedStatus: isSameAsCurrentOrDescartado ? null : suggestedStatus,
      recommendationReason: isSameAsCurrentOrDescartado ? null : reason,
      blockingRequirements: blocking,
      informationalRequirements,
    };
  }

  /**
   * Calcula el porcentaje funcional excluyendo la sección de soportes documentales.
   * Esto evita que expedientes válidos (ej: vivienda nueva sin recibo) queden bloqueados.
   */
  private calculateFunctionalOverall(completeness: CompletenessResult): number {
    const functionalSections = completeness.sectionCompleteness.filter(
      (s) => s.key !== 'documentSupport',
    );

    if (functionalSections.length === 0) return 0;

    return Math.round(
      functionalSections.reduce((sum, s) => sum + s.percentage, 0) / functionalSections.length,
    );
  }

  /**
   * Calcula el estado sugerido más alto alcanzable según los hitos del expediente.
   * Orden de evaluación: de mayor a menor en el pipeline.
   */
  private calculateSuggestedStatus(
    expediente: ExpedienteRecord,
    functionalOverall: number,
  ): ExpedienteStatus {
    // Hito CLIENTE_ACTIVO: ticket + OT + datos funcionales completos
    if (expediente.ticketId && expediente.workOrderId && functionalOverall >= 100) {
      return ExpedienteStatus.CLIENTE_ACTIVO;
    }

    // Hito INSTALACION_AGENDADA: ticket y orden de trabajo vinculados
    if (expediente.ticketId && expediente.workOrderId) {
      return ExpedienteStatus.INSTALACION_AGENDADA;
    }

    // Hito LISTO_PARA_INSTALACION: avance funcional >= 75%
    if (functionalOverall >= 75) {
      return ExpedienteStatus.LISTO_PARA_INSTALACION;
    }

    // Hito EN_COTIZACION: plan de interés seleccionado
    if (expediente.interestedPlanId) {
      return ExpedienteStatus.EN_COTIZACION;
    }

    // Hito VALIDANDO_COBERTURA: ubicación suficiente para verificar cobertura
    const hasCoordinates = expediente.latitude != null && expediente.longitude != null;
    const hasAddress = expediente.address && expediente.municipality;
    if (hasCoordinates || hasAddress) {
      return ExpedienteStatus.VALIDANDO_COBERTURA;
    }

    // Hito PRECALIFICADO: datos mínimos de identificación y contacto
    const hasIdentity = expediente.documentType && expediente.documentNumberEncrypted;
    const hasContact = expediente.phonePrimaryEncrypted || expediente.emailPrimaryEncrypted;
    if (hasIdentity && hasContact) {
      return ExpedienteStatus.PRECALIFICADO;
    }

    return ExpedienteStatus.NUEVO_POTENCIAL;
  }

  /**
   * Construye el texto de razón y los faltantes bloqueantes para el estado sugerido.
   * Los faltantes son los requisitos funcionales (no documentales) que aún faltan.
   */
  private buildReasonAndBlocking(
    expediente: ExpedienteRecord,
    suggestedStatus: ExpedienteStatus,
    functionalMissing: MissingRequirement[],
    functionalOverall: number,
  ): { reason: string; blocking: MissingRequirement[] } {
    const REASON_MAP: Record<ExpedienteStatus, string> = {
      [ExpedienteStatus.NUEVO_POTENCIAL]: 'La oportunidad tiene datos mínimos registrados.',
      [ExpedienteStatus.PRECALIFICADO]: 'La oportunidad tiene identificación y contacto completos.',
      [ExpedienteStatus.VALIDANDO_COBERTURA]:
        'La ubicación está disponible para verificar cobertura.',
      [ExpedienteStatus.EN_COTIZACION]:
        'El plan de interés fue seleccionado. La oportunidad puede avanzar a cotización.',
      [ExpedienteStatus.LISTO_PARA_INSTALACION]:
        'Las secciones principales del expediente están completas. Puede avanzar a instalación.',
      [ExpedienteStatus.INSTALACION_AGENDADA]:
        'El ticket y la orden de trabajo están vinculados. La instalación puede ser agendada.',
      [ExpedienteStatus.CLIENTE_ACTIVO]:
        'La oportunidad tiene datos funcionales completos, ticket y orden de trabajo.',
      [ExpedienteStatus.DESCARTADO]: 'El expediente fue descartado.',
    };

    // Calcular los faltantes necesarios para alcanzar el estado sugerido
    const blocking = this.getBlockingForSuggestedStatus(
      expediente,
      suggestedStatus,
      functionalMissing,
      functionalOverall,
    );

    return {
      reason: REASON_MAP[suggestedStatus] ?? 'Estado calculado por hitos del expediente.',
      blocking,
    };
  }

  /**
   * Retorna los faltantes funcionales que aún bloquean el estado sugerido.
   * Si el estado sugerido ya es alcanzable, la lista es vacía.
   */
  private getBlockingForSuggestedStatus(
    expediente: ExpedienteRecord,
    suggestedStatus: ExpedienteStatus,
    functionalMissing: MissingRequirement[],
    functionalOverall: number,
  ): MissingRequirement[] {
    switch (suggestedStatus) {
      case ExpedienteStatus.PRECALIFICADO:
        return functionalMissing.filter((r) =>
          ['identification', 'contact', 'address'].includes(r.sectionKey),
        );

      case ExpedienteStatus.VALIDANDO_COBERTURA:
        return functionalMissing.filter((r) => r.sectionKey === 'address');

      case ExpedienteStatus.EN_COTIZACION:
        return functionalMissing.filter((r) => r.sectionKey === 'customerInterest');

      case ExpedienteStatus.LISTO_PARA_INSTALACION:
        // Si functionalOverall < 75, mostrar todos los faltantes funcionales como pendientes
        if (functionalOverall < 75) return functionalMissing;
        return [];

      case ExpedienteStatus.INSTALACION_AGENDADA: {
        const missing: MissingRequirement[] = [];
        if (!expediente.ticketId) {
          missing.push({
            sectionKey: 'operational',
            sectionLabel: 'Operativo',
            fieldKey: 'ticketId',
            fieldLabel: 'Ticket vinculado',
          });
        }
        if (!expediente.workOrderId) {
          missing.push({
            sectionKey: 'operational',
            sectionLabel: 'Operativo',
            fieldKey: 'workOrderId',
            fieldLabel: 'Orden de trabajo vinculada',
          });
        }
        return missing;
      }

      case ExpedienteStatus.CLIENTE_ACTIVO:
        // Faltantes funcionales al 100% + ticket + OT
        return functionalMissing;

      default:
        return [];
    }
  }
}
