import type { ExecutionOrderAllowedAction, ExecutionOrderTemplateRequirement } from '@iwana/shared';

export type RequirementActionDescriptor =
  | { kind: 'activity'; requirementKey: string; activityType: string; action: 'REGISTER_ACTIVITY' }
  | {
      kind: 'evidence';
      requirementKey: string;
      evidenceType: 'PHOTO' | 'DOCUMENT' | 'SIGNATURE';
      action: 'REGISTER_EVIDENCE';
    }
  | {
      kind: 'consumption';
      requirementKey: string;
      itemCategory: string;
      finalDisposition?: string;
      action: 'REGISTER_ITEM_USAGE';
    }
  | {
      kind: 'acceptance';
      requirementKey: string;
      action: 'CLOSE';
      mode: 'existing-close';
      signatureEvidenceRef?: string;
    };

export function getRequirementAction(
  requirement: ExecutionOrderTemplateRequirement,
  allowedActions: readonly ExecutionOrderAllowedAction[] | null,
): RequirementActionDescriptor | undefined {
  const requirementKey = requirement.key;
  if (requirement.kind === 'ACTIVITY' && allowedActions?.includes('REGISTER_ACTIVITY'))
    return {
      kind: 'activity',
      requirementKey,
      activityType: requirement.activityType,
      action: 'REGISTER_ACTIVITY',
    };
  if (requirement.kind === 'EVIDENCE' && allowedActions?.includes('REGISTER_EVIDENCE'))
    return {
      kind: 'evidence',
      requirementKey,
      evidenceType: requirement.evidenceType,
      action: 'REGISTER_EVIDENCE',
    };
  if (requirement.kind === 'MATERIAL' && allowedActions?.includes('REGISTER_ITEM_USAGE'))
    return {
      kind: 'consumption',
      requirementKey,
      itemCategory: requirement.itemCategory,
      ...(requirement.finalDisposition ? { finalDisposition: requirement.finalDisposition } : {}),
      action: 'REGISTER_ITEM_USAGE',
    };
  return undefined;
}

export function requirementActionLabel(action: RequirementActionDescriptor): string {
  if (action.kind === 'activity') return 'Registrar actividad';
  if (action.kind === 'consumption') return 'Registrar equipo instalado';
  if (action.kind === 'acceptance') return 'Cerrar orden';
  if (action.evidenceType === 'SIGNATURE') return 'Capturar firma del cliente';
  if (action.requirementKey === 'service-test') return 'Añadir foto de la prueba de servicio';
  if (action.requirementKey === 'work-photo') return 'Añadir fotos del trabajo';
  return 'Adjuntar evidencia';
}
