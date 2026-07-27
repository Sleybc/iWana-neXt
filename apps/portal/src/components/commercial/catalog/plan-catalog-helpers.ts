import { z } from 'zod';
import { InstallationRule } from '@iwana/shared';
import { ApiError, type PlanCatalogItem } from '@/lib/api-client';
import type { PlanCatalogFilters } from '@/components/commercial/catalog/catalog-filter-params';

export type SpeedMode = 'SYMMETRIC' | 'ASYMMETRIC';

export const planFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Ingresa un nombre de al menos 2 caracteres.')
      .max(140, 'Máximo 140 caracteres.'),
    technology: z
      .string()
      .trim()
      .min(2, 'Ingresa una tecnología válida.')
      .max(100, 'Máximo 100 caracteres.'),
    speedMode: z.enum(['SYMMETRIC', 'ASYMMETRIC']),
    downloadSpeedMbps: z.number().int().min(1).max(100000),
    uploadSpeedMbps: z.number().int().min(1).max(100000),
    basePrice: z.number().min(0, 'El precio no puede ser negativo.'),
    installationEnabled: z.boolean(),
    installationFee: z.number().min(0, 'El valor no puede ser negativo.'),
    installationRule: z.nativeEnum(InstallationRule),
  })
  .superRefine((value, ctx) => {
    if (value.speedMode === 'SYMMETRIC' && value.downloadSpeedMbps !== value.uploadSpeedMbps) {
      ctx.addIssue({
        path: ['uploadSpeedMbps'],
        code: z.ZodIssueCode.custom,
        message: 'En modo simétrico, bajada y subida deben ser iguales.',
      });
    }

    if (value.installationEnabled && value.installationRule === 'NEVER') {
      ctx.addIssue({
        path: ['installationRule'],
        code: z.ZodIssueCode.custom,
        message: 'Selecciona una regla válida cuando la instalación está habilitada.',
      });
    }
  });

export type PlanFormValues = z.infer<typeof planFormSchema>;

export const BLOCKED_TECHNOLOGIES = new Set(['FTTH']);
export const TECHNOLOGY_SUGGESTIONS = ['GPON', 'XGS-PON', 'HFC', 'WIFI6', 'WIFI5'];
export const TECHNOLOGY_OPTIONS_STORAGE_KEY = 'iwana.portal.commercial.plan-technology-options';

/** Lee tecnologías del localStorage; retorna los defaults si no hay datos o están corruptos. */
export function loadPersistedTechnologies(): string[] {
  if (typeof window === 'undefined') {
    return mergeTechnologyOptions([], TECHNOLOGY_SUGGESTIONS);
  }
  try {
    const stored = window.localStorage.getItem(TECHNOLOGY_OPTIONS_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = (parsed as unknown[]).filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        );
        if (valid.length > 0) {
          return mergeTechnologyOptions([], valid);
        }
      }
    }
  } catch {
    // localStorage no accesible — usar defaults.
  }
  return mergeTechnologyOptions([], TECHNOLOGY_SUGGESTIONS);
}

/** Escribe tecnologías al localStorage de forma síncrona. */
export function persistTechnologies(options: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(TECHNOLOGY_OPTIONS_STORAGE_KEY, JSON.stringify(options));
  } catch {
    // localStorage no disponible (incógnito bloqueado, cuota llena, etc.).
  }
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(value);
}

export function parseMoneyFromApi(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export function formatSpeed(plan: PlanCatalogItem): string {
  if (plan.downloadSpeedMbps === plan.uploadSpeedMbps) {
    return `${plan.downloadSpeedMbps} Mbps simétricos`;
  }
  return `${plan.downloadSpeedMbps}↓ / ${plan.uploadSpeedMbps}↑ Mbps`;
}

export function formatInstallationText(plan: PlanCatalogItem): string {
  if (plan.installationRule === 'NEVER') {
    return 'Sin instalación';
  }

  if (plan.installationRule === 'ALWAYS') {
    return `Siempre ${formatMoney(parseMoneyFromApi(plan.installationFee))}`;
  }

  return `Bajo demanda (${formatMoney(parseMoneyFromApi(plan.installationFee))})`;
}

export function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu rol no tiene permisos para consultar el catálogo de planes.';
    }
    return error.message;
  }
  return 'No fue posible cargar el catálogo de planes. Intenta de nuevo.';
}

export function mapMutationError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'No fue posible guardar el plan. Intenta de nuevo.';
}

export function normalizeTechnologyName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function mergeTechnologyOptions(current: string[], incoming: string[]): string[] {
  const unique = new Map<string, string>();

  [...current, ...incoming].forEach((item) => {
    const normalized = normalizeTechnologyName(item);
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  });

  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function isBlockedTechnology(value: string): boolean {
  return BLOCKED_TECHNOLOGIES.has(normalizeTechnologyName(value).toUpperCase());
}

export function filterAllowedTechnologies(options: string[]): string[] {
  return options.filter((option) => !isBlockedTechnology(option));
}

export function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

export function planFiltersEqual(a: PlanCatalogFilters, b: PlanCatalogFilters): boolean {
  return a.q === b.q && a.status === b.status && a.missingPrice === b.missingPrice;
}

export function toFormValues(plan: PlanCatalogItem): PlanFormValues {
  const symmetric = plan.downloadSpeedMbps === plan.uploadSpeedMbps;
  return {
    name: plan.name,
    technology: plan.technology,
    speedMode: symmetric ? 'SYMMETRIC' : 'ASYMMETRIC',
    downloadSpeedMbps: plan.downloadSpeedMbps,
    uploadSpeedMbps: plan.uploadSpeedMbps,
    basePrice: parseMoneyFromApi(plan.basePrice),
    installationEnabled: plan.installationRule !== 'NEVER',
    installationFee: parseMoneyFromApi(plan.installationFee),
    installationRule: plan.installationRule,
  };
}
