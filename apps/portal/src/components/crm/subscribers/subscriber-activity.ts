import type { BillingAccountStatement, LifecycleChangeRecord, SubscriberNote } from '@iwana/shared';
import type { AssuranceTicket, Contract } from '@/lib/api-client';
import { getAssuranceTicketStatusLabel } from '@/components/assurance/assurance-labels';
import {
  DOCUMENT_STATES,
  formatBillingMoney,
  PAYMENT_METHODS,
} from '@/components/billing/billing-copy';
import { CONTRACT_STATUS_META, SUBSCRIBER_STATUS_META } from './subscriber-ui';
import { contractServiceName, lifecycleReasonLabel } from './subscriber-lifecycle-ui';
import type { VisitEntry } from './SubscriberVisitsSection';

/**
 * Bitácora de la ficha (spec §3 D, D3): v1 compuesta en el portal con lecturas que ya
 * respetan permisos. La auditoría sigue siendo la fuente de verdad; esto es solo lectura.
 */
export type ActivityKind = 'nota' | 'servicio' | 'ticket' | 'visita' | 'cobro';

export interface ActivityItem {
  key: string;
  kind: ActivityKind;
  /** ISO 8601; ordena la bitácora de lo más reciente a lo más antiguo. */
  at: string;
  title: string;
  detail?: string;
  /** Texto libre (nota manual o nota del cambio de estado); se pinta como texto. */
  body?: string;
}

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  nota: 'Notas',
  servicio: 'Estados',
  ticket: 'Tickets',
  visita: 'Visitas',
  cobro: 'Cobros y pagos',
};

const LIFECYCLE_SOURCE_LABELS: Record<LifecycleChangeRecord['source'], string> = {
  MANUAL: 'Registrado por el equipo',
  SYSTEM: 'Automático',
  BILLING: 'Por facturación',
  IMPORTADO: 'Importado de UISP',
};

function statusLabel(record: LifecycleChangeRecord): string {
  const meta =
    record.entityType === 'CONTRACT'
      ? CONTRACT_STATUS_META[record.toStatus as keyof typeof CONTRACT_STATUS_META]
      : SUBSCRIBER_STATUS_META[record.toStatus as keyof typeof SUBSCRIBER_STATUS_META];
  return meta?.label ?? 'otro estado';
}

export function lifecycleToActivity(
  record: LifecycleChangeRecord,
  contracts: Contract[],
  anonymized: boolean,
): ActivityItem {
  const contract =
    record.entityType === 'CONTRACT'
      ? contracts.find((candidate) => candidate.id === record.entityId)
      : undefined;
  const subject =
    record.entityType === 'CONTRACT'
      ? `Servicio ${contract && !anonymized ? `«${contractServiceName(contract)}»` : ''}`.trim()
      : 'Suscriptor';
  const reason = lifecycleReasonLabel(record.reasonCode);
  return {
    key: `servicio:${record.id}`,
    kind: 'servicio',
    at: record.changedAt,
    title: `${subject} pasó a ${statusLabel(record).toLowerCase()}`,
    detail: [reason === '—' ? null : reason, LIFECYCLE_SOURCE_LABELS[record.source]]
      .filter(Boolean)
      .join(' · '),
    ...(record.note ? { body: record.note } : {}),
  };
}

export function noteToActivity(note: SubscriberNote): ActivityItem {
  return {
    key: `nota:${note.id}`,
    kind: 'nota',
    at: note.createdAt,
    title: 'Nota',
    body: note.body,
  };
}

export function ticketToActivity(ticket: AssuranceTicket): ActivityItem {
  return {
    key: `ticket:${ticket.id}`,
    kind: 'ticket',
    at: ticket.createdAt,
    title: `Ticket ${ticket.ticketNumber}: ${ticket.subject}`,
    detail: getAssuranceTicketStatusLabel(ticket.status),
  };
}

export function visitToActivity(visit: VisitEntry): ActivityItem {
  return {
    key: `visita:${visit.key}`,
    kind: 'visita',
    at: visit.date ?? visit.createdAt,
    title: `Visita: ${visit.workType}`,
    detail: visit.statusLabel,
  };
}

/** Estado y monto, omitiendo lo que no llegó. */
function joinDetail(label: string | undefined, amount: string | undefined): string {
  return [label, amount !== undefined ? formatBillingMoney(amount) : undefined]
    .filter(Boolean)
    .join(' · ');
}

/** Documentos de cobro y pagos del estado de cuenta que la ficha ya cargó (MOD14). */
export function statementToActivity(statement: BillingAccountStatement): ActivityItem[] {
  const documents = statement.documents.map<ActivityItem>((document) => ({
    key: `cobro:documento:${document.id}`,
    kind: 'cobro',
    at: document.issueDate ?? document.createdAt,
    title: document.number
      ? `Documento de cobro ${document.number}`
      : document.status === 'IMPORTADO'
        ? `Histórico importado${document.externalNumber ? ` ${document.externalNumber}` : ''}`
        : 'Documento de cobro en borrador',
    detail: joinDetail(DOCUMENT_STATES[document.status]?.label, document.total),
  }));
  const payments = statement.payments.map<ActivityItem>((payment) => ({
    key: `cobro:pago:${payment.id}`,
    kind: 'cobro',
    at: payment.paidAt,
    title: payment.status === 'ANULADO' ? 'Pago anulado' : 'Pago registrado',
    detail: joinDetail(PAYMENT_METHODS[payment.method], payment.amount),
  }));
  return [...documents, ...payments];
}

function timestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Más reciente primero; empate estable por clave para no reordenar al paginar. */
export function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) => timestamp(b.at) - timestamp(a.at) || a.key.localeCompare(b.key));
}

export function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
