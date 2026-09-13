// apps/portal/src/components/operations/execution-order-requirements.ts
// Extracción verbatim de OperationsClient.tsx (:142-271, 307-337) — split F2
// (spec 2026-09-13 §4.5). Incluye `mapOperationsError` porque su rango de
// origen (:142-151) cae dentro de este archivo según la propia spec.
//
// D-A1 (directriz vinculante del despacho OLA2): la interface
// `ExecutionOrderMissingRequirement` migra aquí; `ExecutionOrderDrawer.tsx`
// re-punta su import type a este módulo (hay dos importadores del monolito,
// no uno: `page.tsx`, que desaparece, y el drawer, que permanece).
import { ApiError, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import type { ExecutionOrderTemplateVersion } from '@iwana/shared';

export function mapOperationsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    if (error.status === 403) return 'No tienes permisos para operar esta vista de Operaciones.';
    if (error.status === 404) return 'El elemento consultado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible completar la operación. Intenta de nuevo.';
}

export interface ExecutionOrderMissingRequirement {
  requirementId: string;
  label: string;
  kind: string;
  reason: string;
}

export function getMissingRequirements(error: unknown): ExecutionOrderMissingRequirement[] {
  if (!(error instanceof ApiError)) return [];
  const details = error.details;
  const values =
    error.missingRequirements ??
    (details && typeof details === 'object'
      ? (details as { missingRequirements?: unknown }).missingRequirements
      : undefined);
  if (!Array.isArray(values)) return [];

  return values.flatMap((value): ExecutionOrderMissingRequirement[] => {
    if (typeof value === 'string') {
      return [
        {
          requirementId: value,
          label: 'Requisito pendiente',
          kind: 'OTHER',
          reason: 'Completa el requisito pendiente antes de cerrar la orden.',
        },
      ];
    }
    if (!value || typeof value !== 'object') return [];
    const requirement = value as Record<string, unknown>;
    if (typeof requirement.requirementId !== 'string') {
      return [];
    }
    const kind = typeof requirement.kind === 'string' ? requirement.kind : 'OTHER';
    const label = productRequirementLabel(
      typeof requirement.label === 'string' ? requirement.label : undefined,
      kind,
      requirement.requirementId,
    );
    return [
      {
        requirementId: requirement.requirementId,
        label,
        kind,
        reason: productRequirementReason(
          typeof requirement.reason === 'string' ? requirement.reason : undefined,
          kind,
          label,
        ),
      },
    ];
  });
}

const REQUIREMENT_KIND_LABELS: Record<string, string> = {
  FIELD: 'Información requerida',
  ACTIVITY: 'Actividad pendiente',
  MEASUREMENT: 'Medición pendiente',
  EVIDENCE: 'Evidencia pendiente',
  MATERIAL: 'Material pendiente',
  COMPLIANCE: 'Aceptación del cliente pendiente',
  OTHER: 'Requisito pendiente',
};

function containsRawRequirementToken(value: string): boolean {
  return (
    /^[A-Z0-9_:-]+$/u.test(value) ||
    /\b(?:FIELD|ACTIVITY|MEASUREMENT|EVIDENCE|MATERIAL|COMPLIANCE|PHOTO|DOCUMENT|SIGNATURE)\b/u.test(
      value,
    )
  );
}

export function productRequirementLabel(
  label: string | undefined,
  kind: string,
  requirementId: string,
): string {
  if (label?.trim()) {
    return label.trim();
  }

  const normalizedId = requirementId.toLowerCase();
  if (/(?:photo|foto|evidence|evidencia)/u.test(normalizedId)) return 'Evidencia requerida';
  if (/(?:signature|firma|acceptance|aceptación)/u.test(normalizedId)) {
    return 'Aceptación del cliente';
  }
  if (/(?:serial|ont|material|item|equipment|equipo)/u.test(normalizedId)) {
    return 'Material o equipo requerido';
  }
  if (/(?:measurement|medición|speed|prueba)/u.test(normalizedId)) return 'Medición requerida';
  if (/(?:activity|actividad|install|installation)/u.test(normalizedId)) {
    return 'Actividad requerida';
  }
  return REQUIREMENT_KIND_LABELS[kind] ?? 'Requisito pendiente';
}

function productRequirementReason(reason: string | undefined, kind: string, label: string): string {
  if (reason?.trim() && !containsRawRequirementToken(reason) && !/categoría\s+"/iu.test(reason)) {
    return reason.trim();
  }

  switch (kind) {
    case 'EVIDENCE':
      return `Adjunta ${label.toLowerCase()} antes de cerrar la orden.`;
    case 'MATERIAL':
      return 'Registra el material o equipo requerido antes de cerrar la orden.';
    case 'COMPLIANCE':
      return 'Registra la aceptación del cliente antes de cerrar la orden.';
    case 'ACTIVITY':
      return 'Registra la actividad requerida antes de cerrar la orden.';
    case 'MEASUREMENT':
      return 'Registra la medición requerida antes de cerrar la orden.';
    case 'FIELD':
      return 'Completa la información requerida antes de cerrar la orden.';
    default:
      return 'Completa el requisito pendiente antes de cerrar la orden.';
  }
}

/**
 * Deriva la plantilla aplicada desde el snapshot congelado que viaja en el
 * detalle de la OT (DATA-P1-3). Devuelve null cuando la OT no tiene plantilla
 * vinculada o cuando el snapshot no está disponible; en ambos casos el cierre
 * queda bloqueado en coherencia con el gate de cierre del backend.
 */
export function deriveTemplateFromDetail(
  detail: ExecutionOrderDetailResponse | null,
): ExecutionOrderTemplateVersion | null {
  const reference = detail?.template;
  if (!detail || !reference?.requirements) {
    return null;
  }
  return {
    id: reference.id,
    templateId: reference.id,
    key: reference.key,
    version: reference.version,
    label: reference.label,
    workType: detail.workType,
    status: 'PUBLISHED',
    requirements: reference.requirements,
    reasonCatalogs: [],
  };
}

export function isValidFutureEvidenceExpiry(
  expiresAt: string | null | undefined,
  now = Date.now(),
): expiresAt is string {
  if (!expiresAt) {
    return false;
  }

  const parsedExpiry = Date.parse(expiresAt);
  return Number.isFinite(parsedExpiry) && parsedExpiry > now;
}
