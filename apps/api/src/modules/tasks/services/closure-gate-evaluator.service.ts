import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionOrderTemplateRequirement as TemplateRequirement } from '@iwana/shared';

type FieldRequirement = Extract<TemplateRequirement, { kind: 'FIELD' }>;
type ActivityRequirement = Extract<TemplateRequirement, { kind: 'ACTIVITY' }>;
type MeasurementRequirement = Extract<TemplateRequirement, { kind: 'MEASUREMENT' }>;
type EvidenceRequirement = Extract<TemplateRequirement, { kind: 'EVIDENCE' }>;
type MaterialRequirement = Extract<TemplateRequirement, { kind: 'MATERIAL' }>;
type ComplianceRequirement = Extract<TemplateRequirement, { kind: 'COMPLIANCE' }>;

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
  /**
   * Consumos de items registrados (para MATERIAL).
   *
   * La categoría debe proceder de una fuente autoritativa del consumo. Si no
   * está presente, el requisito falla cerrado; el evaluador no infiere una
   * categoría a partir del identificador del item.
   */
  itemUsages?: Array<{ itemId: string; itemCategory?: string; requirementKey?: string }>;
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
        return false;
    }
  }

  private evaluateField(req: FieldRequirement, context: OrderEvaluationContext): boolean {
    const fieldData = context.fieldData ?? {};
    return req.key in fieldData && fieldData[req.key] !== null && fieldData[req.key] !== '';
  }

  private evaluateActivity(req: ActivityRequirement, context: OrderEvaluationContext): boolean {
    const activities = context.activities ?? [];
    return activities.some((a) => a.activityType === req.activityType);
  }

  private evaluateMeasurement(
    req: MeasurementRequirement,
    context: OrderEvaluationContext,
  ): boolean {
    const measurements = context.measurements ?? [];
    return measurements.some((m) => m.key === req.key && m.value !== null && m.value !== undefined);
  }

  private evaluateEvidence(req: EvidenceRequirement, context: OrderEvaluationContext): boolean {
    const evidences = context.evidences ?? [];
    return evidences.some(
      (e) => e.requirementKey === req.key && e.evidenceType === req.evidenceType,
    );
  }

  private evaluateMaterial(req: MaterialRequirement, context: OrderEvaluationContext): boolean {
    const usages = context.itemUsages ?? [];
    return usages.some(
      (usage) =>
        usage.itemId.trim().length > 0 &&
        usage.itemCategory === req.itemCategory &&
        (usage.requirementKey === undefined || usage.requirementKey === req.key),
    );
  }

  private evaluateCompliance(req: ComplianceRequirement, context: OrderEvaluationContext): boolean {
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
        return `No se ha registrado una actividad de tipo "${req.activityType}".`;
      }
      case 'MEASUREMENT': {
        return `No se ha registrado la medición "${req.label}"${req.unit ? ` (${req.unit})` : ''}.`;
      }
      case 'EVIDENCE': {
        // Traducir el tipo de evidencia a texto visible
        const evidenceLabel =
          req.evidenceType === 'PHOTO'
            ? 'foto'
            : req.evidenceType === 'SIGNATURE'
              ? 'firma'
              : req.evidenceType === 'DOCUMENT'
                ? 'documento'
                : 'evidencia';
        return `No se ha vinculado una ${evidenceLabel} para "${req.label}".`;
      }
      case 'MATERIAL': {
        return `No se ha registrado consumo de materiales de categoría "${req.itemCategory}".`;
      }
      case 'COMPLIANCE':
        return `No se ha registrado la aceptación del cliente para "${req.label}".`;
      default:
        return 'El requisito no se ha cumplido.';
    }
  }
}
