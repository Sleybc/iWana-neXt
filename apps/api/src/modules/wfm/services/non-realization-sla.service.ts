import { Injectable } from '@nestjs/common';
import { NonRealizationCauseCategory } from '@iwana/shared';

/**
 * Acción de SLA recomendada por el sistema.
 * El sistema nunca decide automáticamente — devuelve la recomendación
 * para que el llamante la aplique o la ignore según el flujo de negocio.
 */
export type SlaAction = 'PAUSE' | 'CONTINUE' | 'CLOSE';

export interface SlaEvaluation {
  action: SlaAction;
  reason: string;
}

/** Interfaz mínima de causa para evaluación de SLA — no requiere la entidad completa. */
export interface NonRealizationCauseSlaView {
  category: NonRealizationCauseCategory;
  label: string;
  requiresEvidence: boolean;
  pausesSla: boolean;
  closesWork: boolean;
}

@Injectable()
export class NonRealizationSlaService {
  /**
   * Evalúa qué acción de SLA corresponde según la causa, el contador de
   * intentos y la evidencia disponible.
   *
   * ADR-077 D5:
   * - pausesSla=true → PAUSE (solo si hay evidencia cuando requiresEvidence=true)
   * - closesWork=true + retryCount >= 3 → CLOSE
   * - resto → CONTINUE
   *
   * El SLA nunca se reinicia. PAUSE no modifica slaDueAt; solo registra
   * slaPausedAt para que el cálculo de vencimiento lo descuente.
   */
  evaluateSlaAction(
    cause: NonRealizationCauseSlaView,
    retryCount: number,
    evidenceSubmitted: boolean,
  ): SlaEvaluation {
    // Si requiere evidencia y no la tiene, el reloj sigue
    if (cause.requiresEvidence && !evidenceSubmitted) {
      return {
        action: 'CONTINUE',
        reason: `La causa "${cause.label}" exige evidencia del intento. Sin evidencia, el SLA sigue corriendo.`,
      };
    }

    // Causas que cierran trabajo al agotar intentos
    if (cause.closesWork && retryCount >= 3) {
      return {
        action: 'CLOSE',
        reason: `Se alcanzó el límite de 3 intentos con causa "${cause.label}". Requiere decisión del coordinador.`,
      };
    }

    if (cause.pausesSla) {
      return {
        action: 'PAUSE',
        reason: `SLA pausado por causa "${cause.label}" (${cause.category}).`,
      };
    }

    return {
      action: 'CONTINUE',
      reason: `Causa "${cause.label}" (${cause.category}) no pausa el SLA. El reloj sigue corriendo.`,
    };
  }

  /**
   * Determina si una categoría de causa consume intento.
   * ADR-077 D1: solo CUSTOMER consume intento.
   */
  consumesRetry(category: NonRealizationCauseCategory): boolean {
    return category === NonRealizationCauseCategory.CUSTOMER;
  }

  /**
   * Determina si la categoría es imputable al cliente.
   */
  isCustomerCause(category: NonRealizationCauseCategory): boolean {
    return category === NonRealizationCauseCategory.CUSTOMER;
  }

  /**
   * Calcula el cambio de retry_count cuando el coordinador reclasifica.
   *
   * - Si la nueva categoría es CUSTOMER y la anterior NO era CUSTOMER:
   *   incrementa retroactivamente (la clasificación del coordinador es autoritativa).
   * - Si la nueva categoría NO es CUSTOMER y la anterior era CUSTOMER:
   *   NO decrementa (el contador nunca baja).
   * - Si son iguales: no hay cambio.
   *
   * Devuelve el delta a aplicar (0 o +1).
   */
  computeReclassificationRetryDelta(
    previousCategory: NonRealizationCauseCategory | null,
    newCategory: NonRealizationCauseCategory,
  ): number {
    if (!previousCategory) {
      // Sin clasificación previa: aplicar normalmente
      return this.isCustomerCause(newCategory) ? 1 : 0;
    }

    const wasCustomer = this.isCustomerCause(previousCategory);
    const isCustomer = this.isCustomerCause(newCategory);

    if (!wasCustomer && isCustomer) {
      // Reclasificación a CUSTOMER: incrementa retroactivamente
      return 1;
    }

    if (wasCustomer && !isCustomer) {
      // Reclasificación desde CUSTOMER: NUNCA decrementa
      return 0;
    }

    // Misma categoría: sin cambio
    return 0;
  }
}
