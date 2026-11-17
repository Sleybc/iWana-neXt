'use client';

import { CalendarClock, ClipboardList, Paperclip } from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import type { AssuranceTicket } from '@/lib/api-client';
import {
  formatAssuranceDate,
  formatAssuranceDateTime,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketTypeLabel,
} from './assurance-labels';
import { getTicketDeadlineState, type TicketFieldWork } from './assurance-ticket-model';
import { formatTicketAttachmentCount } from './ticket-attachments';
import { TicketPriorityBadge, TicketStatusBadge } from './ticket-badges';

export type TicketListItemTicket = Pick<
  AssuranceTicket,
  | 'id'
  | 'ticketNumber'
  | 'subject'
  | 'status'
  | 'priority'
  | 'type'
  | 'slaBreachStatus'
  | 'createdAt'
> & { attachmentCount?: number | undefined };

export interface TicketListItemProps {
  ticket: TicketListItemTicket;
  /** Nombre, «Sin asignar» o «Responsable no disponible» (`getAssuranceAssigneeLabel`). */
  assigneeLabel: string;
  /** Plazo pendiente más próximo (ms); `null` en cerrados o sin plazo. */
  slaDeadline: number | null;
  fieldWork?: TicketFieldWork | null | undefined;
  /** Ticket recién creado: se resalta en la lista. */
  highlighted?: boolean | undefined;
  /** Reloj inyectable para pruebas. */
  now?: number | undefined;
  onOpen: (opener: HTMLButtonElement) => void;
}

function formatElapsed(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} días`;
}

/**
 * Fila densa de ticket (spec MOD05 pestaña Soporte §4): un único botón, ≤ 64 px desde `sm`.
 * Móvil: número + plazo, asunto, y badges con responsable.
 */
export function TicketListItem({
  ticket,
  assigneeLabel,
  slaDeadline,
  fieldWork,
  highlighted = false,
  now = Date.now(),
  onOpen,
}: TicketListItemProps) {
  const deadlineState = getTicketDeadlineState(ticket);
  // Vencido lo dice `slaBreachStatus` (mismo criterio que el orden y la franja); el reloj solo mide cuánto.
  const overdue = deadlineState === 'overdue';
  // Plazo ya pasado que el servidor aún no marca (pestaña abierta): se avisa sin contarlo como vencido.
  const pastDue = !overdue && slaDeadline !== null && slaDeadline < now;
  const atRisk = !overdue && (pastDue || deadlineState === 'at_risk');
  const attachmentCount = ticket.attachmentCount ?? 0;
  const attachmentsLabel =
    attachmentCount > 0 ? formatTicketAttachmentCount(attachmentCount) : null;

  let deadlineLabel: string | null = null;
  if (overdue) {
    deadlineLabel =
      slaDeadline !== null && slaDeadline < now
        ? `Vencido hace ${formatElapsed(now - slaDeadline)}`
        : 'Vencido';
  } else if (pastDue && slaDeadline !== null) {
    deadlineLabel = `Plazo pasado el ${formatAssuranceDateTime(new Date(slaDeadline))}`;
  } else if (slaDeadline !== null) {
    deadlineLabel = `Vence ${formatAssuranceDateTime(new Date(slaDeadline))}`;
  }

  const accessibleName = [
    `Abrir ticket ${ticket.ticketNumber}: ${ticket.subject}`,
    getAssuranceTicketStatusLabel(ticket.status),
    `prioridad ${getAssuranceTicketPriorityLabel(ticket.priority).toLowerCase()}`,
    overdue ? 'vencido' : null,
    attachmentsLabel ? `con ${attachmentsLabel}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const FieldWorkIcon = fieldWork?.kind === 'order' ? ClipboardList : CalendarClock;

  return (
    <li>
      <button
        type="button"
        aria-label={accessibleName}
        onClick={(event) => onOpen(event.currentTarget)}
        className={cn(
          'block min-h-11 w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
          interactiveFocusClassName,
          highlighted && 'bg-iwana-surface-soft dark:bg-dark-surface-3',
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-2 sm:flex-nowrap">
          <span className="order-1 shrink-0 font-mono text-xs font-semibold text-iwana-secondary-700 dark:text-gray-300">
            {ticket.ticketNumber}
          </span>
          <span className="order-3 block min-w-0 basis-full truncate text-sm font-medium text-gray-900 dark:text-white sm:order-2 sm:flex-1 sm:basis-auto">
            {ticket.subject}
          </span>
          {deadlineLabel ? (
            <span
              className={cn(
                'order-2 ml-auto shrink-0 text-xs sm:order-3',
                overdue
                  ? 'font-semibold text-error-700 dark:text-error-400'
                  : atRisk
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-gray-600 dark:text-gray-300',
              )}
            >
              {deadlineLabel}
            </span>
          ) : null}
        </span>
        {/* Móvil: dos líneas fijas sin envolver (≤ 96 px, spec §4/§9). Desde `sm` los dos grupos
            se disuelven (`contents`) y todo queda en una sola línea. */}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-300 sm:flex-nowrap">
          <span className="flex min-w-0 basis-full items-center gap-x-2 sm:contents">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {ticket.type ? (
              <span className="sr-only sm:not-sr-only sm:shrink-0">
                {getAssuranceTicketTypeLabel(ticket.type)}
              </span>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className="min-w-0 flex-1 truncate sm:flex-initial">
              <span className="sr-only">Responsable:</span> {assigneeLabel}
            </span>
            {attachmentsLabel ? (
              <span
                data-testid="ticket-attachment-clip"
                title={`Con ${attachmentsLabel}`}
                className="inline-flex shrink-0 items-center gap-1"
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true">{attachmentCount}</span>
                <span className="sr-only">Con {attachmentsLabel}</span>
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 basis-full items-center gap-x-2 sm:contents">
            {fieldWork ? (
              <span
                title={fieldWork.label}
                className="inline-flex min-w-0 items-center gap-1 sm:shrink-0"
              >
                <FieldWorkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{fieldWork.label}</span>
              </span>
            ) : null}
            <span className="ml-auto shrink-0">
              Abierto {formatAssuranceDate(ticket.createdAt)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
