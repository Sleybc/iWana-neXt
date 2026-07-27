import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionOrderTemplateRequirement as TemplateRequirement } from '@iwana/shared';

/**
 * Resultado de evaluar un requisito contra el estado actual de la OT.
 */
export interface RequirementEvaluation {
  requirementId: string; // key del requisito
  label: string;
  kind: string;
  satisfied: boolean;
  reason?: string | undefined;
}

/**
 * Resultado de la evaluación completa del gate de cierre.
 */
export interface ClosureGateEvaluation {
  passed: boolean;
  totalRequired: number;
  satisfiedRequired: number;
  missingRequirements: RequirementEvaluation[];
  allEvaluations: RequirementEvaluation[];
}

/**
 * Contexto de la OT necesario para evaluar los requisitos.
 * Todos los campos son opcionales; el evaluador los consulta según el kind.
 */
export interface OrderEvaluationContext {
  /** Datos de campo libre registrados en la OT (para FIELD). */
  fieldData?: Record<string, unknown>;
  /** Actividades registradas (para ACTIVITY). */
  activities?: Array<{ activityType: string }>;
  /** Mediciones registradas en actividades (para MEASUREMENT). */
  measurements?: Array<{ key: string; value: unknown }>;
  /** Evidencias vinculadas (para EVIDENCE). */
  evidences?: Array<{ evidenceType: string; requirementKey: string }>;
  /** Consumos de items registrados (para MATERIAL). */
  itemUsages?: Array<{ itemId: string }>;
  /** Artefactos de aceptación del cliente (para COMPLIANCE). */
  complianceArtifacts?: Array<{ policyKey?: string }>;
  /** Si la OT tiene aceptación del cliente registrada. */
  hasCustomerAcceptance?: boolean;
  /** Datos del comando de cierre (summary, result, customerAcceptance). */
  closeCommand?: Record<string, unknown>;
}

/**
 * Evaluador determinista del gate de cierre.
 *
 * Evalúa cada requisito de la plantilla contra el estado actual de la OT,
 * usando el snapshot congelado (no la plantilla viva).
 *
 * El evaluador es puramente declarativo: no ejecuta expresiones ni
 * componentes arbitrarios. Cada kind tiene una regla fija y predecible.
 *
 * ADR-068 §"Gate de cierre determinista que devuelve faltantes accionables"
 * UX spec §6: "El gate de cierre enumera faltantes accionables"
 */
@Injectable()
export class ClosureGateEvaluatorService {
  private readonly logger = new Logger(ClosureGateEvaluatorService.name);

  /**
   * Evalúa todos los requisitos de la plantilla contra el contexto de la OT.
   *
   * @param requirements - Array de requisitos del snapshot de plantilla
   * @param context - Estado actual de la OT (actividades, evidencias, etc.)
   * @returns Evaluación completa con faltantes accionables
   */
  evaluate(
    requirements: TemplateRequirement[],
    context: OrderEvaluationContext,
  ): ClosureGateEvaluation {
    const evaluations: RequirementEvaluation[] = requirements.map((req) => {
      const satisfied = this.evaluateRequirement(req, context);
      return {
        requirementId: req.key,
        label: req.label,
        kind: req.kind,
        satisfied,
        reason: satisfied ? undefined : this.reasonForRequirement(req),
      };
    });

    const required = evaluations.filter((e) => {
      // A requirement is "required" if it's set as required in the template
      const req = requirements.find((r) => r.key === e.requirementId);
      return req?.required !== false;
    });

    const missing = required.filter((e) => !e.satisfied);

    return {
      passed: missing.length === 0,
      totalRequired: required.length,
      satisfiedRequired: required.filter((e) => e.satisfied).length,
      missingRequirements: missing,
      allEvaluations: evaluations,
    };
  }

  /**
   * Evalúa un único requisito contra el contexto.
   */
  private evaluateRequirement(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    switch (req.kind) {
      case 'FIELD':
        return this.evaluateField(req, context);
      case 'ACTIVITY':
        return this.evaluateActivity(req, context);
      case 'MEASUREMENT':
        return this.evaluateMeasurement(req, context);
      case 'EVIDENCE':
        return this.evaluateEvidence(req, context);
      case 'MATERIAL':
        return this.evaluateMaterial(req, context);
      case 'COMPLIANCE':
        return this.evaluateCompliance(req, context);
      default:
        return true; // Unknown kinds don't block
    }
  }

  private evaluateField(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    if (!req.kind) return true; // FIELD por defecto
    const fieldData = context.fieldData ?? {};
    return req.key in fieldData && fieldData[req.key] !== null && fieldData[req.key] !== '';
  }

  private evaluateActivity(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    const activities = context.activities ?? [];
    // Extract activityType from discriminated union
    const activityType = (req as any).activityType as string | undefined;
    if (!activityType) return false;
    return activities.some((a) => a.activityType === activityType);
  }

  private evaluateMeasurement(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    const measurements = context.measurements ?? [];
    return measurements.some((m) => m.key === req.key && m.value !== null && m.value !== undefined);
  }

  private evaluateEvidence(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    const evidences = context.evidences ?? [];
    return evidences.some((e) => e.requirementKey === req.key);
  }

  private evaluateMaterial(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    // MATERIAL requirements check that at least one item usage exists
    // with matching category. For now, we check that any item usage is recorded
    // that references this requirement key via a mapping.
    const usages = context.itemUsages ?? [];
    // If there's at least one item usage and the template requires materials, pass
    // In a full implementation, category matching would be done here
    if (usages.length === 0) return false;
    return true;
  }

  private evaluateCompliance(req: TemplateRequirement, context: OrderEvaluationContext): boolean {
    // COMPLIANCE checks for customer acceptance artifact or policy satisfaction
    if (context.hasCustomerAcceptance) return true;
    const cmd = context.closeCommand as Record<string, unknown> | undefined;
    if (cmd?.customerAcceptance) return true;
    if (context.complianceArtifacts && context.complianceArtifacts.length > 0) return true;
    return false;
  }

  /**
   * Genera un mensaje de razón accionable para un requisito no satisfecho.
   */
  private reasonForRequirement(req: TemplateRequirement): string {
    switch (req.kind) {
      case 'FIELD':
        return `El campo "${req.label}" no se ha completado.`;
      case 'ACTIVITY': {
        const at = (req as any).activityType as string | undefined;
        return `No se ha registrado una actividad de tipo "${at ?? req.label}".`;
      }
      case 'MEASUREMENT': {
        const unit = (req as any).unit as string | undefined;
        return `No se ha registrado la medición "${req.label}"${unit ? ` (${unit})` : ''}.`;
      }
      case 'EVIDENCE': {
        const et = (req as any).evidenceType as string | undefined;
        // Traducir el tipo de evidencia a texto visible
        const evidenceLabel =
          et === 'PHOTO'
            ? 'foto'
            : et === 'SIGNATURE'
              ? 'firma'
              : et === 'DOCUMENT'
                ? 'documento'
                : 'evidencia';
        return `No se ha vinculado una ${evidenceLabel} para "${req.label}".`;
      }
      case 'MATERIAL': {
        const cat = (req as any).itemCategory as string | undefined;
        return `No se ha registrado consumo de materiales${cat ? ` de categoría "${cat}"` : ''}.`;
      }
      case 'COMPLIANCE':
        return `No se ha registrado la aceptación del cliente para "${req.label}".`;
      default: {
        const r = req as { label: string };
        return `El requisito "${r.label}" no se ha cumplido.`;
      }
    }
  }
}
