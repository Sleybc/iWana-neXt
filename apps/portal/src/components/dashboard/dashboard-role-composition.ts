/**
 * Composición tipada del inicio `/dashboard` por rol de tenant.
 *
 * Contrato interno exhaustivo: `Record<UserRole, …>` sin `default`.
 * Si el enum crece, TypeScript falla en compilación.
 *
 * UX spec §4 / §5.3 · HLD-MOD02-DASHBOARD-EMPRESA-v2.0 §5.2
 */
import { UserRole } from '@iwana/shared';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  HandCoins,
  Package,
  UserRound,
  Users,
} from 'lucide-react';

export type DashboardActionId =
  | 'register-subscriber'
  | 'schedule-visit'
  | 'view-today-agenda'
  | 'register-case'
  | 'new-opportunity'
  | 'review-plans-without-price'
  | 'view-profile';

export type DashboardMetricId = 'I-1' | 'I-2' | 'I-3' | 'I-4' | 'I-5' | 'I-6' | 'I-7';

export type DashboardBlockId =
  | 'field-attention'
  | 'help-desk'
  | 'commercial-attention'
  | 'pipeline'
  | 'inventory'
  | 'next-configuration'
  | 'change-history'
  | 'quick-actions';

export interface DashboardRoleComposition {
  primaryActionId: DashboardActionId;
  secondaryActionId: DashboardActionId | null;
  metricIds: readonly DashboardMetricId[];
  dominantBlockId: DashboardBlockId | null;
  supportBlockIds: readonly DashboardBlockId[];
  foldedBlockIds: readonly DashboardBlockId[];
  showOperationalTenantCard: boolean;
}

export interface DashboardActionDefinition {
  id: DashboardActionId;
  label: string;
  /** Ruta verificada en inventario `apps/portal/src/app/dashboard/` + UX §5.3 */
  href: string;
}

export type DashboardMetricAccent = 'neutral' | 'primary' | 'warning' | 'danger';

export interface DashboardMetricDefinition {
  id: DashboardMetricId;
  eyebrow: string;
  label: string;
  description: string;
  accent: DashboardMetricAccent;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /**
   * Destino con filtros de UX §3.2.
   * `null` = excepción I-6 (despliega atención comercial en el propio inicio).
   */
  buildHref: (todayLocalDate: string) => string | null;
  /** Fuentes remotas requeridas para resolver la cifra */
  sources: readonly DashboardDataSourceId[];
}

export interface DashboardBlockDefinition {
  id: DashboardBlockId;
  title: string;
  sources: readonly DashboardDataSourceId[];
}

/** Fuentes remotas del fan-out (HLD §4.2 + branding público). */
export type DashboardDataSourceId =
  | 'public-branding'
  | 'tenant-summary'
  | 'tenant-me'
  | 'wfm'
  | 'assurance'
  | 'commercial'
  | 'inventory'
  | 'crm'
  | 'audit';

/**
 * Techo de autorización HLD §5.2 (no composición).
 * La composición debe ser un subconjunto — nunca ampliar.
 */
export const DASHBOARD_ROLE_AUTHORIZATION_CEILING: Record<
  UserRole,
  {
    metricIds: readonly DashboardMetricId[];
    blockIds: readonly DashboardBlockId[];
    actionIds: readonly DashboardActionId[];
  }
> = {
  [UserRole.ADMIN]: {
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6', 'I-7'],
    blockIds: [
      'field-attention',
      'help-desk',
      'commercial-attention',
      'pipeline',
      'inventory',
      'next-configuration',
      'change-history',
      'quick-actions',
    ],
    actionIds: [
      'register-subscriber',
      'schedule-visit',
      'view-today-agenda',
      'register-case',
      'new-opportunity',
      'review-plans-without-price',
      'view-profile',
    ],
  },
  [UserRole.NOC]: {
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4'],
    blockIds: ['field-attention', 'inventory', 'quick-actions'],
    actionIds: ['schedule-visit', 'view-today-agenda', 'view-profile'],
  },
  [UserRole.SUPPORT]: {
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4'],
    blockIds: ['help-desk', 'field-attention', 'quick-actions'],
    actionIds: ['register-case', 'register-subscriber', 'view-profile'],
  },
  [UserRole.SALES]: {
    metricIds: ['I-5', 'I-6', 'I-7'],
    blockIds: ['commercial-attention', 'pipeline', 'quick-actions'],
    actionIds: ['register-subscriber', 'new-opportunity', 'view-profile'],
  },
  [UserRole.ACCOUNTANT]: {
    metricIds: ['I-5'],
    blockIds: ['commercial-attention', 'quick-actions'],
    actionIds: ['review-plans-without-price', 'view-profile'],
  },
  [UserRole.TECHNICIAN]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-today-agenda', 'view-profile'],
  },
  [UserRole.CONTRACTOR]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-today-agenda', 'view-profile'],
  },
  // Historial completo pendiente de aprobación de seguridad (UX §4.9).
  [UserRole.AUDITOR]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-profile'],
  },
  [UserRole.HR]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-profile'],
  },
  [UserRole.SUBSCRIBER]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-profile'],
  },
  [UserRole.PARTNER]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-profile'],
  },
  [UserRole.INVESTOR]: {
    metricIds: [],
    blockIds: ['quick-actions'],
    actionIds: ['view-profile'],
  },
};

export const DASHBOARD_ACTION_REGISTRY: Record<DashboardActionId, DashboardActionDefinition> = {
  'register-subscriber': {
    id: 'register-subscriber',
    label: 'Registrar suscriptor',
    href: '/dashboard/crm/subscribers/new',
  },
  'schedule-visit': {
    id: 'schedule-visit',
    label: 'Programar visita',
    href: '/dashboard/scheduling?open=create',
  },
  'view-today-agenda': {
    id: 'view-today-agenda',
    label: 'Ver mi agenda de hoy',
    href: '/dashboard/scheduling/agenda',
  },
  'register-case': {
    id: 'register-case',
    label: 'Registrar caso',
    href: '/dashboard/assurance',
  },
  'new-opportunity': {
    id: 'new-opportunity',
    label: 'Nueva oportunidad',
    href: '/dashboard/crm/expedientes',
  },
  'review-plans-without-price': {
    id: 'review-plans-without-price',
    label: 'Revisar planes sin precio',
    href: '/dashboard/commercial?tab=plans&missingPrice=1',
  },
  'view-profile': {
    id: 'view-profile',
    label: 'Ver mi perfil',
    href: '/dashboard/profile',
  },
};

export const DASHBOARD_METRIC_REGISTRY: Record<DashboardMetricId, DashboardMetricDefinition> = {
  'I-1': {
    id: 'I-1',
    eyebrow: 'Operaciones de campo',
    label: 'Visitas de hoy',
    description: 'Agenda del día en curso',
    accent: 'primary',
    icon: CalendarClock,
    buildHref: (todayLocalDate) =>
      `/dashboard/scheduling/agenda?view=day&fromDate=${encodeURIComponent(todayLocalDate)}`,
    sources: ['wfm'],
  },
  'I-2': {
    id: 'I-2',
    eyebrow: 'Operaciones de campo',
    label: 'Solicitudes por programar',
    description: 'Listas para agenda',
    accent: 'warning',
    icon: ClipboardList,
    buildHref: () => '/dashboard/scheduling/pending-visits?status=READY_TO_SCHEDULE',
    sources: ['wfm'],
  },
  'I-3': {
    id: 'I-3',
    eyebrow: 'Mesa de ayuda',
    label: 'Casos abiertos',
    description: 'Casos en atención',
    accent: 'primary',
    icon: AlertTriangle,
    buildHref: () => '/dashboard/assurance?status=OPEN',
    sources: ['assurance'],
  },
  'I-4': {
    id: 'I-4',
    eyebrow: 'Mesa de ayuda',
    label: 'Casos en riesgo de incumplir',
    description: 'Acuerdo de servicio en riesgo',
    accent: 'danger',
    icon: AlertTriangle,
    buildHref: () => '/dashboard/assurance?slaBreachStatus=AT_RISK',
    sources: ['assurance'],
  },
  'I-5': {
    id: 'I-5',
    eyebrow: 'Comercial',
    label: 'Planes sin precio vigente',
    description: 'Catálogo incompleto para facturar',
    accent: 'warning',
    icon: HandCoins,
    buildHref: () => '/dashboard/commercial?tab=plans&missingPrice=1',
    sources: ['commercial'],
  },
  'I-6': {
    id: 'I-6',
    eyebrow: 'Comercial',
    label: 'Ofertas en riesgo',
    description: 'Vencen pronto o cerca del cupo',
    accent: 'warning',
    icon: HandCoins,
    // Excepción UX §3.4: no hay filtro único en destino.
    buildHref: () => null,
    sources: ['commercial'],
  },
  'I-7': {
    id: 'I-7',
    eyebrow: 'Oportunidades',
    label: 'Oportunidades en seguimiento',
    description: 'Embudo abierto',
    accent: 'primary',
    icon: Users,
    buildHref: () => '/dashboard/crm/expedientes?view=open',
    sources: ['crm'],
  },
};

export const DASHBOARD_BLOCK_REGISTRY: Record<DashboardBlockId, DashboardBlockDefinition> = {
  'field-attention': {
    id: 'field-attention',
    title: 'Atención de campo',
    sources: ['wfm'],
  },
  'help-desk': {
    id: 'help-desk',
    title: 'Casos de la mesa de ayuda',
    sources: ['assurance'],
  },
  'commercial-attention': {
    id: 'commercial-attention',
    title: 'Atención comercial',
    sources: ['commercial'],
  },
  pipeline: {
    id: 'pipeline',
    title: 'Embudo de oportunidades',
    sources: ['crm'],
  },
  inventory: {
    id: 'inventory',
    title: 'Estado del almacén',
    sources: ['inventory'],
  },
  'next-configuration': {
    id: 'next-configuration',
    title: 'Próximo paso de configuración',
    sources: ['tenant-summary'],
  },
  'change-history': {
    id: 'change-history',
    title: 'Historial de cambios',
    sources: ['audit'],
  },
  'quick-actions': {
    id: 'quick-actions',
    title: 'Accesos rápidos',
    sources: [],
  },
};

export const DASHBOARD_ROLE_COMPOSITION: Record<UserRole, DashboardRoleComposition> = {
  [UserRole.ADMIN]: {
    primaryActionId: 'register-subscriber',
    secondaryActionId: 'schedule-visit',
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6', 'I-7'],
    dominantBlockId: 'field-attention',
    supportBlockIds: ['next-configuration', 'change-history', 'quick-actions'],
    foldedBlockIds: ['help-desk', 'commercial-attention', 'inventory'],
    showOperationalTenantCard: true,
  },
  [UserRole.NOC]: {
    primaryActionId: 'schedule-visit',
    secondaryActionId: 'view-today-agenda',
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4'],
    dominantBlockId: 'field-attention',
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: ['inventory'],
    showOperationalTenantCard: true,
  },
  [UserRole.SUPPORT]: {
    primaryActionId: 'register-case',
    secondaryActionId: 'register-subscriber',
    metricIds: ['I-3', 'I-4', 'I-1', 'I-2'],
    dominantBlockId: 'help-desk',
    supportBlockIds: ['field-attention', 'quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.SALES]: {
    primaryActionId: 'register-subscriber',
    secondaryActionId: 'new-opportunity',
    metricIds: ['I-5', 'I-6', 'I-7'],
    dominantBlockId: 'commercial-attention',
    supportBlockIds: ['pipeline', 'quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.ACCOUNTANT]: {
    primaryActionId: 'review-plans-without-price',
    secondaryActionId: null,
    metricIds: ['I-5'],
    dominantBlockId: 'commercial-attention',
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.TECHNICIAN]: {
    primaryActionId: 'view-today-agenda',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.CONTRACTOR]: {
    primaryActionId: 'view-today-agenda',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.AUDITOR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.HR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.SUBSCRIBER]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.PARTNER]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.INVESTOR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    dominantBlockId: null,
    supportBlockIds: ['quick-actions'],
    foldedBlockIds: [],
    showOperationalTenantCard: true,
  },
};

/** Roles con ficha operativa vía contrato autenticado (HLD §5.2). */
const OPERATIONAL_TENANT_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
]);

export function isUserRole(value: string | null | undefined): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}

export function getDashboardRoleComposition(role: UserRole): DashboardRoleComposition {
  return DASHBOARD_ROLE_COMPOSITION[role];
}

export function resolveDashboardAction(id: DashboardActionId): DashboardActionDefinition {
  return DASHBOARD_ACTION_REGISTRY[id];
}

export function resolveDashboardMetric(id: DashboardMetricId): DashboardMetricDefinition {
  return DASHBOARD_METRIC_REGISTRY[id];
}

export function resolveDashboardBlock(id: DashboardBlockId): DashboardBlockDefinition {
  return DASHBOARD_BLOCK_REGISTRY[id];
}

/** Fecha local YYYY-MM-DD para filtros de agenda (I-1). */
export function toLocalDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fuentes a pedir en el fan-out para un rol (R-1):
 * solo contratos autorizados y usados por la composición.
 */
export function resolveDashboardDataSources(role: UserRole): readonly DashboardDataSourceId[] {
  const composition = getDashboardRoleComposition(role);
  const sources = new Set<DashboardDataSourceId>(['public-branding']);

  if (role === UserRole.ADMIN) {
    sources.add('tenant-summary');
  } else if (OPERATIONAL_TENANT_ROLES.has(role) && composition.showOperationalTenantCard) {
    sources.add('tenant-me');
  }

  for (const metricId of composition.metricIds) {
    for (const source of resolveDashboardMetric(metricId).sources) {
      sources.add(source);
    }
  }

  const blockIds = [
    composition.dominantBlockId,
    ...composition.supportBlockIds,
    ...composition.foldedBlockIds,
  ].filter((id): id is DashboardBlockId => id != null);

  for (const blockId of blockIds) {
    for (const source of resolveDashboardBlock(blockId).sources) {
      sources.add(source);
    }
  }

  return Array.from(sources);
}

export function listCompositionBlockIds(
  composition: DashboardRoleComposition,
): readonly DashboardBlockId[] {
  const ids: DashboardBlockId[] = [];
  if (composition.dominantBlockId) ids.push(composition.dominantBlockId);
  ids.push(...composition.supportBlockIds);
  ids.push(...composition.foldedBlockIds);
  return ids;
}

/** Icono decorativo de identidad (B3) — no es acción. */
export const DASHBOARD_IDENTITY_ICON = UserRound;
export const DASHBOARD_INVENTORY_ICON = Package;
