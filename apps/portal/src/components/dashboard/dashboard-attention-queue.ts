/**
 * Cola «Requiere tu atención» del inicio (B2): una fila por señal, En riesgo antes que Atención.
 * Una fuente en error o sin leer no produce fila ni cero.
 *
 * Dirección: docs/specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md §5.2
 */
import {
  DASHBOARD_ATTENTION_SOURCES,
  type DashboardAttentionId,
  type DashboardDataSourceId,
  type DashboardMetricSourceStatus,
} from './dashboard-role-composition';

export type DashboardAttentionSeverity = 'at-risk' | 'attention';

export interface DashboardAttentionRow {
  id: DashboardAttentionId;
  severity: DashboardAttentionSeverity;
  title: string;
  /** Rótulo del área, igual al del menú. */
  area: string;
  /** Abre el mismo conjunto que cuenta la fila (CA-V2-05). */
  href: string;
  count: number;
}

export interface DashboardAttentionQueue {
  /** `loading` solo mientras ninguna fuente pedida ha respondido. */
  state: 'loading' | 'ready';
  rows: readonly DashboardAttentionRow[];
  /** Fuentes pedidas que fallaron: la cola no puede afirmar «todo al día». */
  failedSources: readonly DashboardDataSourceId[];
}

interface AttentionDefinition {
  id: DashboardAttentionId;
  severity: DashboardAttentionSeverity;
  area: string;
  one: string;
  many: (formatted: string) => string;
  href: (todayLocalDate: string) => string;
}

const READY_TO_SCHEDULE_HREF = '/dashboard/scheduling/pending-visits?status=READY_TO_SCHEDULE';
const CASES_AT_RISK_HREF = '/dashboard/assurance?slaBreachStatus=AT_RISK';

/** El orden del arreglo es el orden de la cola: primero En riesgo, luego Atención. */
const ATTENTION_DEFINITIONS: readonly AttentionDefinition[] = [
  {
    id: 'cases-breached',
    severity: 'at-risk',
    area: 'Mesa de ayuda',
    one: '1 caso superó su tiempo de atención',
    many: (n) => `${n} casos superaron su tiempo de atención`,
    href: () => CASES_AT_RISK_HREF,
  },
  {
    id: 'visits-overdue',
    severity: 'at-risk',
    area: 'Programación',
    one: '1 visita vencida sin cerrar',
    many: (n) => `${n} visitas vencidas sin cerrar`,
    href: (today) => `/dashboard/scheduling/agenda?view=day&fromDate=${encodeURIComponent(today)}`,
  },
  {
    id: 'requests-overdue',
    severity: 'at-risk',
    area: 'Programación',
    one: '1 solicitud de visita con atención vencida',
    many: (n) => `${n} solicitudes de visita con atención vencida`,
    href: () => READY_TO_SCHEDULE_HREF,
  },
  {
    id: 'provisioning-failed',
    severity: 'at-risk',
    area: 'Aprovisionamiento',
    one: '1 servicio quedó sin aprovisionar',
    many: (n) => `${n} servicios quedaron sin aprovisionar`,
    href: () => '/dashboard/network/provisioning?queue=FAILED',
  },
  {
    id: 'offers-at-risk',
    severity: 'at-risk',
    area: 'Comercial',
    one: '1 oferta en riesgo',
    many: (n) => `${n} ofertas en riesgo`,
    href: () => '/dashboard/commercial',
  },
  {
    id: 'cases-at-risk',
    severity: 'attention',
    area: 'Mesa de ayuda',
    one: '1 caso en riesgo de incumplir',
    many: (n) => `${n} casos en riesgo de incumplir`,
    href: () => CASES_AT_RISK_HREF,
  },
  {
    id: 'cutoff-today',
    severity: 'attention',
    area: 'Suscriptores',
    one: '1 servicio entra a corte hoy',
    many: (n) => `${n} servicios entran a corte hoy`,
    href: (today) => `/dashboard/crm/subscribers/agenda-corte?date=${encodeURIComponent(today)}`,
  },
  {
    id: 'provisioning-unfinished',
    severity: 'attention',
    area: 'Aprovisionamiento',
    one: '1 instalación cerrada sin aprovisionar',
    many: (n) => `${n} instalaciones cerradas sin aprovisionar`,
    href: () => '/dashboard/network/provisioning?queue=CLOSED_UNPROVISIONED',
  },
  {
    id: 'requests-ready',
    severity: 'attention',
    area: 'Programación',
    one: '1 solicitud lista para programar',
    many: (n) => `${n} solicitudes listas para programar`,
    href: () => READY_TO_SCHEDULE_HREF,
  },
  {
    id: 'plans-without-price',
    severity: 'attention',
    area: 'Comercial',
    one: '1 plan sin precio vigente',
    many: (n) => `${n} planes sin precio vigente`,
    href: () => '/dashboard/commercial?tab=plans&missingPrice=1',
  },
  {
    id: 'fiscal-incomplete',
    severity: 'attention',
    area: 'Suscriptores',
    one: '1 suscriptor con datos fiscales incompletos',
    many: (n) => `${n} suscriptores con datos fiscales incompletos`,
    href: () => '/dashboard/crm/subscribers?queue=fiscalIncomplete',
  },
  {
    id: 'stock-below-minimum',
    severity: 'attention',
    area: 'Inventario',
    one: '1 producto por reponer',
    many: (n) => `${n} productos por reponer`,
    href: () => '/dashboard/inventory',
  },
  {
    id: 'configuration-pending',
    severity: 'attention',
    area: 'Configuración',
    one: '1 pendiente de configuración',
    many: (n) => `${n} pendientes de configuración`,
    href: () => '/dashboard/settings',
  },
];

const formatCount = (value: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);

export interface DashboardAttentionInput {
  /** Filas que la composición del rol autoriza. */
  allowedIds: readonly DashboardAttentionId[];
  sourceStatus: (id: DashboardDataSourceId) => DashboardMetricSourceStatus;
  /** Cifra por fila; `null` o ausente = la fuente no entregó el dato. */
  counts: Partial<Record<DashboardAttentionId, number | null>>;
  todayLocalDate: string;
}

export function resolveAttentionQueue(input: DashboardAttentionInput): DashboardAttentionQueue {
  const allowed = new Set(input.allowedIds);
  const requestedSources = new Set<DashboardDataSourceId>(
    input.allowedIds.map((id) => DASHBOARD_ATTENTION_SOURCES[id]),
  );
  const failedSources: DashboardDataSourceId[] = [];
  let answered = 0;
  for (const source of requestedSources) {
    const status = input.sourceStatus(source);
    if (status === 'error') failedSources.push(source);
    if (status !== 'idle' && status !== 'loading') answered += 1;
  }

  const rows: DashboardAttentionRow[] = [];
  for (const definition of ATTENTION_DEFINITIONS) {
    if (!allowed.has(definition.id)) continue;
    const status = input.sourceStatus(DASHBOARD_ATTENTION_SOURCES[definition.id]);
    if (status !== 'success' && status !== 'updating') continue;
    const count = input.counts[definition.id];
    if (count == null || count <= 0) continue;
    rows.push({
      id: definition.id,
      severity: definition.severity,
      area: definition.area,
      title: count === 1 ? definition.one : definition.many(formatCount(count)),
      href: definition.href(input.todayLocalDate),
      count,
    });
  }

  return {
    state: requestedSources.size > 0 && answered === 0 ? 'loading' : 'ready',
    rows,
    failedSources,
  };
}
