import type { Tone } from '@iwana/ui';
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
  LifeBuoy,
  ReceiptText,
  Timer,
  UserCheck,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';

export type DashboardActionId =
  | 'schedule-visit'
  | 'view-today-agenda'
  | 'register-case'
  | 'new-opportunity'
  | 'review-plans-without-price'
  | 'view-profile';

/**
 * Celdas de la franja de pulso (dirección «Pulso y atención» §5.1): `P-1` base activa de
 * suscriptores, `P-2` recaudo del mes y `P-3` cartera vencida (HLD-MOD02 v3.0 §6).
 */
export type DashboardMetricId =
  | 'P-1'
  | 'P-2'
  | 'P-3'
  | 'I-1'
  | 'I-2'
  | 'I-3'
  | 'I-4'
  | 'I-5'
  | 'I-6'
  | 'I-7';

export type DashboardMetricSourceStatus = 'idle' | 'loading' | 'updating' | 'success' | 'error';

/** Bloques de detalle bajo las áreas (B4). */
export type DashboardBlockId =
  | 'today-agenda'
  | 'field-attention'
  | 'commercial-attention'
  | 'change-history';

/** Filas posibles de la cola «Requiere tu atención» (B2). El orden del tipo no es prioridad. */
export type DashboardAttentionId =
  | 'cases-breached'
  | 'visits-overdue'
  | 'requests-overdue'
  | 'provisioning-failed'
  | 'offers-at-risk'
  | 'cases-at-risk'
  | 'cutoff-today'
  | 'provisioning-unfinished'
  | 'requests-ready'
  | 'plans-without-price'
  | 'fiscal-incomplete'
  | 'stock-below-minimum'
  | 'configuration-pending';

/** Chips de B1b — salud de módulos (centro de mando). */
export type DashboardModuleHealthId =
  | 'scheduling'
  | 'help-desk'
  | 'commercial'
  | 'opportunities'
  | 'inventory'
  | 'configuration'
  | 'operations';

export type DashboardModuleHealthStatus = 'ok' | 'attention' | 'at-risk' | 'unknown';

/** Cards «Por área» (B3): un módulo, un estado y una sola visual. */
export type DashboardAreaId =
  | 'help-desk'
  | 'scheduling'
  | 'opportunities'
  | 'billing'
  | 'subscribers'
  | 'provisioning'
  | 'inventory';

/** Pestañas del bloque Tendencia (contrato DS de gráficas §6). */
export type DashboardTrendId = 'subscribers' | 'collections' | 'cases';

export interface DashboardRoleComposition {
  primaryActionId: DashboardActionId;
  secondaryActionId: DashboardActionId | null;
  /** Celdas de la franja de pulso (B1), máximo 5. */
  metricIds: readonly DashboardMetricId[];
  /** Filas que la cola de atención (B2) puede mostrar a este rol. */
  attentionIds: readonly DashboardAttentionId[];
  /** Cards «Por área» (B3). */
  areaIds: readonly DashboardAreaId[];
  /** Pestañas de Tendencia (B2 izquierda), en el orden en que se ofrecen. */
  trendIds: readonly DashboardTrendId[];
  /** Chips de navegación: solo roles de ejecución en campo. */
  moduleHealthIds: readonly DashboardModuleHealthId[];
  dominantBlockId: DashboardBlockId | null;
  supportBlockIds: readonly DashboardBlockId[];
  showOperationalTenantCard: boolean;
}

export interface DashboardActionDefinition {
  id: DashboardActionId;
  label: string;
  /** Ruta verificada en inventario `apps/portal/src/app/dashboard/` + UX §5.3 */
  href: string;
}

/** Tono de la métrica: `Tone` del DS sin `success` (contrato DS 2026-11-21 §2; danger → error). */
export type DashboardMetricAccent = Exclude<Tone, 'success'>;

export interface DashboardMetricDefinition {
  id: DashboardMetricId;
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
  | 'today-agenda'
  | 'assurance'
  | 'commercial'
  | 'inventory'
  | 'crm'
  | 'audit'
  | 'subscribers'
  | 'cutoff'
  | 'provisioning'
  | 'replenishment'
  /** N1 · `GET /billing/dashboard/summary`. */
  | 'billing-summary'
  /** N2 · `GET /crm/subscribers/dashboard/summary`. */
  | 'subscribers-summary'
  /** N3 · `GET /assurance/dashboard/series`. */
  | 'cases-series';

/**
 * Techo de autorización HLD §5.2 (no composición).
 * La composición debe ser un subconjunto — nunca ampliar.
 */
export const DASHBOARD_ROLE_AUTHORIZATION_CEILING: Record<
  UserRole,
  {
    metricIds: readonly DashboardMetricId[];
    attentionIds: readonly DashboardAttentionId[];
    areaIds: readonly DashboardAreaId[];
    trendIds: readonly DashboardTrendId[];
    moduleHealthIds: readonly DashboardModuleHealthId[];
    blockIds: readonly DashboardBlockId[];
    actionIds: readonly DashboardActionId[];
  }
> = {
  [UserRole.ADMIN]: {
    metricIds: ['P-1', 'P-2', 'P-3', 'I-1', 'I-2', 'I-3', 'I-4', 'I-5', 'I-6', 'I-7'],
    attentionIds: [
      'cases-breached',
      'visits-overdue',
      'requests-overdue',
      'provisioning-failed',
      'offers-at-risk',
      'cases-at-risk',
      'cutoff-today',
      'provisioning-unfinished',
      'requests-ready',
      'plans-without-price',
      'fiscal-incomplete',
      'stock-below-minimum',
      'configuration-pending',
    ],
    areaIds: [
      'help-desk',
      'scheduling',
      'opportunities',
      'billing',
      'subscribers',
      'provisioning',
      'inventory',
    ],
    trendIds: ['subscribers', 'collections', 'cases'],
    moduleHealthIds: [],
    blockIds: ['today-agenda', 'field-attention', 'commercial-attention', 'change-history'],
    actionIds: [
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
    attentionIds: [
      'cases-breached',
      'visits-overdue',
      'requests-overdue',
      'provisioning-failed',
      'cases-at-risk',
      'cutoff-today',
      'provisioning-unfinished',
      'requests-ready',
      'stock-below-minimum',
    ],
    areaIds: ['help-desk', 'scheduling', 'provisioning', 'inventory'],
    trendIds: ['cases'],
    moduleHealthIds: [],
    blockIds: ['field-attention'],
    actionIds: ['schedule-visit', 'view-today-agenda', 'view-profile'],
  },
  [UserRole.SUPPORT]: {
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4'],
    attentionIds: [
      'cases-breached',
      'visits-overdue',
      'requests-overdue',
      'cases-at-risk',
      'cutoff-today',
      'requests-ready',
    ],
    areaIds: ['help-desk', 'scheduling'],
    trendIds: ['cases'],
    moduleHealthIds: [],
    blockIds: ['field-attention'],
    actionIds: ['register-case', 'new-opportunity', 'view-profile'],
  },
  // CTO 2026-11-17: el Ejecutivo comercial también ve dinero (N1 admite SALES).
  [UserRole.SALES]: {
    metricIds: ['P-1', 'P-2', 'P-3', 'I-5', 'I-6', 'I-7'],
    attentionIds: ['offers-at-risk', 'plans-without-price'],
    areaIds: ['opportunities', 'subscribers', 'billing'],
    trendIds: ['subscribers', 'collections'],
    moduleHealthIds: [],
    blockIds: ['commercial-attention'],
    actionIds: ['new-opportunity', 'view-profile'],
  },
  [UserRole.ACCOUNTANT]: {
    metricIds: ['P-1', 'P-2', 'P-3', 'I-5'],
    attentionIds: ['plans-without-price', 'fiscal-incomplete', 'cutoff-today'],
    areaIds: ['billing', 'subscribers'],
    trendIds: ['collections', 'subscribers'],
    moduleHealthIds: [],
    blockIds: ['commercial-attention'],
    actionIds: ['review-plans-without-price', 'view-profile'],
  },
  [UserRole.TECHNICIAN]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: ['scheduling'],
    blockIds: [],
    actionIds: ['view-today-agenda', 'view-profile'],
  },
  [UserRole.CONTRACTOR]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: ['scheduling'],
    blockIds: [],
    actionIds: ['view-today-agenda', 'view-profile'],
  },
  // D-SEC-01 / C-13: listado aprobado (SEC GO condicionado); sin página «ver todo».
  [UserRole.AUDITOR]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    blockIds: ['change-history'],
    actionIds: ['view-profile'],
  },
  [UserRole.HR]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    blockIds: [],
    actionIds: ['view-profile'],
  },
  [UserRole.SUBSCRIBER]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    blockIds: [],
    actionIds: ['view-profile'],
  },
  [UserRole.PARTNER]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    blockIds: [],
    actionIds: ['view-profile'],
  },
  [UserRole.INVESTOR]: {
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    blockIds: [],
    actionIds: ['view-profile'],
  },
};

export const DASHBOARD_ACTION_REGISTRY: Record<DashboardActionId, DashboardActionDefinition> = {
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
    href: '/dashboard/crm/expedientes#nueva-oportunidad',
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
  'P-1': {
    id: 'P-1',
    label: 'Suscriptores activos',
    description: 'Base con servicio activo',
    accent: 'primary',
    icon: UserCheck,
    buildHref: () => '/dashboard/crm/subscribers?queue=active',
    sources: ['subscribers'],
  },
  'P-2': {
    id: 'P-2',
    label: 'Recaudo del mes',
    description: 'Pagos registrados en el mes',
    accent: 'primary',
    icon: Wallet,
    buildHref: () => '/dashboard/billing/payments',
    sources: ['billing-summary'],
  },
  'P-3': {
    id: 'P-3',
    label: 'Cartera vencida',
    description: 'Saldo de facturas vencidas',
    accent: 'warning',
    icon: ReceiptText,
    buildHref: () => '/dashboard/billing/documents?paymentState=VENCIDO',
    sources: ['billing-summary'],
  },
  'I-1': {
    id: 'I-1',
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
    label: 'Solicitudes por programar',
    description: 'Listas para agenda',
    accent: 'warning',
    icon: ClipboardList,
    buildHref: () => '/dashboard/scheduling/pending-visits?status=READY_TO_SCHEDULE',
    sources: ['wfm'],
  },
  'I-3': {
    id: 'I-3',
    label: 'Casos abiertos',
    description: 'Casos en atención',
    accent: 'primary',
    icon: LifeBuoy,
    buildHref: () => '/dashboard/assurance?status=OPEN',
    sources: ['assurance'],
  },
  'I-4': {
    id: 'I-4',
    label: 'Casos en riesgo de incumplir',
    description: 'Acuerdo de servicio en riesgo',
    accent: 'error',
    icon: AlertTriangle,
    buildHref: () => '/dashboard/assurance?slaBreachStatus=AT_RISK',
    sources: ['assurance'],
  },
  'I-5': {
    id: 'I-5',
    label: 'Planes sin precio vigente',
    description: 'Catálogo incompleto para facturar',
    accent: 'warning',
    icon: HandCoins,
    buildHref: () => '/dashboard/commercial?tab=plans&missingPrice=1',
    sources: ['commercial'],
  },
  'I-6': {
    id: 'I-6',
    label: 'Ofertas en riesgo',
    description: 'Vencen pronto o cerca del cupo',
    accent: 'warning',
    icon: Timer,
    // Excepción UX §3.4: no hay filtro único en destino.
    buildHref: () => null,
    sources: ['commercial'],
  },
  'I-7': {
    id: 'I-7',
    label: 'Oportunidades en seguimiento',
    description: 'Embudo abierto',
    accent: 'primary',
    icon: Users,
    buildHref: () => '/dashboard/crm/expedientes?view=open',
    sources: ['crm'],
  },
};

export const DASHBOARD_BLOCK_REGISTRY: Record<DashboardBlockId, DashboardBlockDefinition> = {
  'today-agenda': {
    id: 'today-agenda',
    title: 'Hoy en agenda',
    sources: ['today-agenda', 'cutoff'],
  },
  'field-attention': {
    id: 'field-attention',
    title: 'Atención de campo',
    sources: ['wfm'],
  },
  'commercial-attention': {
    id: 'commercial-attention',
    title: 'Atención comercial',
    sources: ['commercial'],
  },
  'change-history': {
    id: 'change-history',
    title: 'Historial de cambios',
    sources: ['audit'],
  },
};

export interface DashboardAreaDefinition {
  id: DashboardAreaId;
  /** Rótulo igual al del menú. */
  label: string;
  sources: readonly DashboardDataSourceId[];
  href: string;
}

export const DASHBOARD_AREA_REGISTRY: Record<DashboardAreaId, DashboardAreaDefinition> = {
  'help-desk': {
    id: 'help-desk',
    label: 'Mesa de ayuda',
    sources: ['assurance'],
    href: '/dashboard/assurance',
  },
  scheduling: {
    id: 'scheduling',
    label: 'Programación',
    sources: ['wfm'],
    href: '/dashboard/scheduling',
  },
  opportunities: {
    id: 'opportunities',
    label: 'Oportunidades',
    sources: ['crm'],
    href: '/dashboard/crm/expedientes?view=open',
  },
  billing: {
    id: 'billing',
    label: 'Facturación',
    sources: ['billing-summary'],
    href: '/dashboard/billing/documents',
  },
  subscribers: {
    id: 'subscribers',
    label: 'Suscriptores',
    sources: ['subscribers'],
    href: '/dashboard/crm/subscribers',
  },
  provisioning: {
    id: 'provisioning',
    label: 'Aprovisionamiento',
    sources: ['provisioning'],
    href: '/dashboard/network/provisioning',
  },
  inventory: {
    id: 'inventory',
    label: 'Inventario',
    sources: ['inventory'],
    href: '/dashboard/inventory',
  },
};

export interface DashboardTrendDefinition {
  id: DashboardTrendId;
  /** Rótulo de la pestaña. */
  label: string;
  /** Una fuente por pestaña: si falla o no está autorizada, la pestaña no se ofrece. */
  source: DashboardDataSourceId;
}

/** Pestañas de Tendencia y su contrato (HLD-MOD02 v3.0 §3; contrato DS de gráficas §6). */
export const DASHBOARD_TREND_REGISTRY: Record<DashboardTrendId, DashboardTrendDefinition> = {
  subscribers: { id: 'subscribers', label: 'Suscriptores', source: 'subscribers-summary' },
  collections: { id: 'collections', label: 'Recaudo', source: 'billing-summary' },
  cases: { id: 'cases', label: 'Casos', source: 'cases-series' },
};

/** Fuente remota que sostiene cada fila de la cola de atención (una por fila). */
export const DASHBOARD_ATTENTION_SOURCES: Record<DashboardAttentionId, DashboardDataSourceId> = {
  'cases-breached': 'assurance',
  'visits-overdue': 'wfm',
  'requests-overdue': 'wfm',
  'provisioning-failed': 'provisioning',
  'offers-at-risk': 'commercial',
  'cases-at-risk': 'assurance',
  'cutoff-today': 'cutoff',
  'provisioning-unfinished': 'provisioning',
  'requests-ready': 'wfm',
  'plans-without-price': 'commercial',
  'fiscal-incomplete': 'subscribers',
  'stock-below-minimum': 'replenishment',
  'configuration-pending': 'tenant-summary',
};

export interface DashboardModuleHealthDefinition {
  id: DashboardModuleHealthId;
  label: string;
  /** Fuentes remotas; vacío = chip de navegación honesto (Sin dato). */
  sources: readonly DashboardDataSourceId[];
  /** Destino cuando no hay señal que reconcilie un filtro. */
  fallbackHref: string;
}

export const DASHBOARD_MODULE_HEALTH_REGISTRY: Record<
  DashboardModuleHealthId,
  DashboardModuleHealthDefinition
> = {
  scheduling: {
    id: 'scheduling',
    label: 'Programación',
    sources: ['wfm'],
    fallbackHref: '/dashboard/scheduling',
  },
  'help-desk': {
    id: 'help-desk',
    label: 'Mesa de ayuda',
    sources: ['assurance'],
    fallbackHref: '/dashboard/assurance',
  },
  commercial: {
    id: 'commercial',
    label: 'Comercial',
    sources: ['commercial'],
    fallbackHref: '/dashboard/commercial',
  },
  opportunities: {
    id: 'opportunities',
    label: 'Oportunidades',
    sources: ['crm'],
    fallbackHref: '/dashboard/crm/expedientes?view=open',
  },
  inventory: {
    id: 'inventory',
    label: 'Inventario',
    sources: ['inventory'],
    fallbackHref: '/dashboard/inventory',
  },
  configuration: {
    id: 'configuration',
    label: 'Configuración',
    sources: ['tenant-summary'],
    fallbackHref: '/dashboard/settings',
  },
  operations: {
    id: 'operations',
    label: 'Operaciones',
    sources: [],
    fallbackHref: '/dashboard/operations',
  },
};

/** Tope visual B1b. Los chips de overflow salen tras «Ver más módulos». */
export const DASHBOARD_MODULE_HEALTH_VISIBLE_CAP = 8;
export const DASHBOARD_MODULE_HEALTH_OVERFLOW_IDS: readonly DashboardModuleHealthId[] = [
  'operations',
];

export const DASHBOARD_ROLE_COMPOSITION: Record<UserRole, DashboardRoleComposition> = {
  [UserRole.ADMIN]: {
    primaryActionId: 'new-opportunity',
    secondaryActionId: 'schedule-visit',
    metricIds: ['P-1', 'P-2', 'P-3', 'I-3', 'I-1'],
    attentionIds: [
      'cases-breached',
      'visits-overdue',
      'requests-overdue',
      'provisioning-failed',
      'offers-at-risk',
      'cases-at-risk',
      'cutoff-today',
      'provisioning-unfinished',
      'requests-ready',
      'plans-without-price',
      'fiscal-incomplete',
      'stock-below-minimum',
      'configuration-pending',
    ],
    areaIds: ['help-desk', 'scheduling', 'opportunities', 'billing', 'provisioning', 'inventory'],
    trendIds: ['subscribers', 'collections', 'cases'],
    moduleHealthIds: [],
    dominantBlockId: 'today-agenda',
    supportBlockIds: ['change-history'],
    showOperationalTenantCard: false,
  },
  [UserRole.NOC]: {
    primaryActionId: 'schedule-visit',
    secondaryActionId: 'view-today-agenda',
    metricIds: ['I-1', 'I-2', 'I-3', 'I-4'],
    attentionIds: [
      'cases-breached',
      'visits-overdue',
      'requests-overdue',
      'provisioning-failed',
      'cases-at-risk',
      'cutoff-today',
      'provisioning-unfinished',
      'requests-ready',
      'stock-below-minimum',
    ],
    areaIds: ['help-desk', 'scheduling', 'provisioning', 'inventory'],
    trendIds: ['cases'],
    moduleHealthIds: [],
    dominantBlockId: 'field-attention',
    supportBlockIds: [],
    showOperationalTenantCard: false,
  },
  [UserRole.SUPPORT]: {
    primaryActionId: 'register-case',
    secondaryActionId: 'new-opportunity',
    metricIds: ['I-3', 'I-4', 'I-1', 'I-2'],
    attentionIds: [
      'cases-breached',
      'visits-overdue',
      'requests-overdue',
      'cases-at-risk',
      'cutoff-today',
      'requests-ready',
    ],
    areaIds: ['help-desk', 'scheduling'],
    trendIds: ['cases'],
    moduleHealthIds: [],
    dominantBlockId: 'field-attention',
    supportBlockIds: [],
    showOperationalTenantCard: false,
  },
  [UserRole.SALES]: {
    primaryActionId: 'new-opportunity',
    secondaryActionId: null,
    // Tope de 5 celdas: «Planes sin precio» (I-5) cede su lugar a Recaudo y Cartera y sigue en
    // la cola de atención (`plans-without-price`).
    metricIds: ['I-7', 'P-1', 'P-2', 'P-3', 'I-6'],
    attentionIds: ['offers-at-risk', 'plans-without-price'],
    areaIds: ['opportunities', 'subscribers', 'billing'],
    trendIds: ['subscribers', 'collections'],
    moduleHealthIds: [],
    dominantBlockId: 'commercial-attention',
    supportBlockIds: [],
    showOperationalTenantCard: false,
  },
  [UserRole.ACCOUNTANT]: {
    primaryActionId: 'review-plans-without-price',
    secondaryActionId: null,
    metricIds: ['P-2', 'P-3', 'P-1', 'I-5'],
    attentionIds: ['plans-without-price', 'fiscal-incomplete', 'cutoff-today'],
    areaIds: ['billing', 'subscribers'],
    trendIds: ['collections', 'subscribers'],
    moduleHealthIds: [],
    dominantBlockId: 'commercial-attention',
    supportBlockIds: [],
    showOperationalTenantCard: false,
  },
  [UserRole.TECHNICIAN]: {
    primaryActionId: 'view-today-agenda',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: ['scheduling'],
    dominantBlockId: null,
    supportBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.CONTRACTOR]: {
    primaryActionId: 'view-today-agenda',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: ['scheduling'],
    dominantBlockId: null,
    supportBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.AUDITOR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    dominantBlockId: null,
    // UX §4.9 B2b — historial minimizado (últimos N, sin «ver todo»).
    supportBlockIds: ['change-history'],
    showOperationalTenantCard: true,
  },
  [UserRole.HR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    dominantBlockId: null,
    supportBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.SUBSCRIBER]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    dominantBlockId: null,
    supportBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.PARTNER]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    dominantBlockId: null,
    supportBlockIds: [],
    showOperationalTenantCard: true,
  },
  [UserRole.INVESTOR]: {
    primaryActionId: 'view-profile',
    secondaryActionId: null,
    metricIds: [],
    attentionIds: [],
    areaIds: [],
    trendIds: [],
    moduleHealthIds: [],
    dominantBlockId: null,
    supportBlockIds: [],
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

/** Piezas de una composición (o del techo) que piden datos remotos. */
export interface DashboardSourceParts {
  metricIds: readonly DashboardMetricId[];
  attentionIds: readonly DashboardAttentionId[];
  areaIds: readonly DashboardAreaId[];
  trendIds: readonly DashboardTrendId[];
  blockIds: readonly DashboardBlockId[];
}

/**
 * Fuentes que exigen las piezas dadas. Los chips de navegación no añaden peticiones (técnico no
 * pide el resumen de campo). Sirve a la composición y, en pruebas, al techo de autorización.
 */
export function collectDashboardPartSources(
  parts: DashboardSourceParts,
): ReadonlySet<DashboardDataSourceId> {
  const sources = new Set<DashboardDataSourceId>();
  for (const metricId of parts.metricIds) {
    for (const source of resolveDashboardMetric(metricId).sources) sources.add(source);
  }
  for (const attentionId of parts.attentionIds) {
    sources.add(DASHBOARD_ATTENTION_SOURCES[attentionId]);
  }
  for (const areaId of parts.areaIds) {
    for (const source of DASHBOARD_AREA_REGISTRY[areaId].sources) sources.add(source);
  }
  for (const trendId of parts.trendIds) {
    sources.add(DASHBOARD_TREND_REGISTRY[trendId].source);
  }
  for (const blockId of parts.blockIds) {
    for (const source of resolveDashboardBlock(blockId).sources) sources.add(source);
  }
  return sources;
}

/**
 * Fuentes a pedir en el fan-out para un rol (R-1): solo contratos autorizados y usados por el
 * pulso, la cola de atención, la tendencia, las áreas y los bloques de detalle.
 */
export function resolveDashboardDataSources(role: UserRole): readonly DashboardDataSourceId[] {
  const composition = getDashboardRoleComposition(role);
  const sources = new Set<DashboardDataSourceId>(['public-branding']);

  if (role === UserRole.ADMIN) {
    sources.add('tenant-summary');
  } else if (OPERATIONAL_TENANT_ROLES.has(role) && composition.showOperationalTenantCard) {
    sources.add('tenant-me');
  }

  const parts = collectDashboardPartSources({
    ...composition,
    blockIds: listCompositionBlockIds(composition),
  });
  for (const source of parts) sources.add(source);

  return Array.from(sources);
}

export function listCompositionBlockIds(
  composition: DashboardRoleComposition,
): readonly DashboardBlockId[] {
  const ids: DashboardBlockId[] = [];
  if (composition.dominantBlockId) ids.push(composition.dominantBlockId);
  ids.push(...composition.supportBlockIds);
  return ids;
}

/** Icono decorativo de identidad (B3) — no es acción. */
export const DASHBOARD_IDENTITY_ICON = UserRound;

/**
 * Tinte de métrica del inicio (UX U-D / DS v1.4).
 * `warning`/`error` solo si hay señal (`value > 0` o delta). Cero no es urgencia.
 * `primary`/`neutral` se conservan.
 */
export function resolveDashboardMetricAccent(options: {
  declared: DashboardMetricAccent;
  value: number | null;
  hasDelta: boolean;
}): DashboardMetricAccent {
  const { declared, value, hasDelta } = options;
  if (declared !== 'warning' && declared !== 'error') {
    return declared;
  }
  const hasSignal = (value != null && value > 0) || hasDelta;
  return hasSignal ? declared : 'neutral';
}

export function resolveDashboardModuleHealth(
  id: DashboardModuleHealthId,
): DashboardModuleHealthDefinition {
  return DASHBOARD_MODULE_HEALTH_REGISTRY[id];
}

/**
 * Parte la lista de chips en visibles vs overflow («Ver más módulos»).
 * Los chips de overflow (Operaciones) salen primero si se supera el tope.
 */
export function splitDashboardModuleHealthIds(ids: readonly DashboardModuleHealthId[]): {
  visibleIds: readonly DashboardModuleHealthId[];
  overflowIds: readonly DashboardModuleHealthId[];
} {
  if (ids.length <= DASHBOARD_MODULE_HEALTH_VISIBLE_CAP) {
    return { visibleIds: ids, overflowIds: [] };
  }

  const overflowSet = new Set<DashboardModuleHealthId>(DASHBOARD_MODULE_HEALTH_OVERFLOW_IDS);
  const pinned: DashboardModuleHealthId[] = [];
  const overflow: DashboardModuleHealthId[] = [];
  for (const id of ids) {
    if (overflowSet.has(id)) overflow.push(id);
    else pinned.push(id);
  }

  if (pinned.length <= DASHBOARD_MODULE_HEALTH_VISIBLE_CAP) {
    return { visibleIds: pinned, overflowIds: overflow };
  }

  return {
    visibleIds: pinned.slice(0, DASHBOARD_MODULE_HEALTH_VISIBLE_CAP),
    overflowIds: [...pinned.slice(DASHBOARD_MODULE_HEALTH_VISIBLE_CAP), ...overflow],
  };
}
