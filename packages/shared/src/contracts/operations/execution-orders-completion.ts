/**
 * Contrato de API tipado — estado por requisito de la OT de ejecución, MOD11.
 *
 * Archivo HERMANO del contrato congelado `execution-orders.ts`: nace separado
 * porque aquel declara "no modificar sin versionar" y el tipo del ítem vive
 * aquí para que la ampliación del congelado sea un solo campo aditivo
 * (spec 2026-09-14 §7, E2 aprobada por el CTO). Este archivo es la fuente de
 * verdad del tipo de estado por requisito v1; un cambio posterior se versiona
 * y se notifica a AI-EM-ARCH, nunca se parchea en silencio
 * (protocolo multiagente §3bis regla 1).
 *
 * El tipo deriva de `RequirementEvaluation`
 * (`apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts:14-20`,
 * retorno de `evaluate()` en `:85-116`): no inventa forma nueva. `kind` queda
 * como `string` a propósito —igual que en el evaluador— para que este archivo
 * no importe del congelado que lo referencia (sin ciclos entre contratos).
 */

export interface ExecutionOrderRequirementStatus {
  /** Clave del requisito dentro del snapshot congelado de la OT. */
  requirementId: string;
  /** Etiqueta de producto del requisito; nunca una clave técnica cruda. */
  label: string;
  /** Kind del requisito (`ACTIVITY`, `EVIDENCE`, `MATERIAL`, `COMPLIANCE`, `FIELD`, `MEASUREMENT`). */
  kind: string;
  /** Si el requisito está satisfecho según la evaluación real del gate de cierre. */
  satisfied: boolean;
  /** Por qué no está cumplido, en lenguaje de producto; ausente cuando está satisfecho. */
  reason?: string | undefined;
}
