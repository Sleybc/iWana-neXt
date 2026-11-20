'use client';

import { CalendarClock, ClipboardList, MessageSquare, Paperclip } from 'lucide-react';
import { cn, interactiveFocusClassName } from '@iwana/ui';
import type { AssuranceTicket } from '@/lib/api-client';
import {
  formatAssuranceDate,
  formatAssuranceDateTime,
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketTypeLabel,
} from './assurance-labels';
import {
  formatTicketCommentCount,
  getTicketDeadlineState,
  getTicketStory,
  type TicketFieldWork,
} from './assurance-ticket-model';
import { formatElapsed } from '@/lib/format-relative-time';
import { AssigneeMark } from './AssigneeMark';
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
> & {
  attachmentCount?: number | undefined;
  description?: string | null | undefined;
  commentCount?: number | undefined;
  firstCommentExcerpt?: string | null | undefined;
};

export interface TicketListItemProps {
  ticket: TicketListItemTicket;
  /** Nombre, «Sin asignar» o «Responsable no disponible» (`getAssuranceAssigneeLabel`). */
  assigneeLabel: string;
  /** Plazo pendiente más próximo (ms); `null` en cerrados o sin plazo. */
  slaDeadline: number | null;
  fieldWork?: TicketFieldWork | null | undefined;
  /** Ticket recién creado: se resalta en la lista. */
  highlighted?: boolean | undefined;
  /** Ticket abierto en la vista dividida: `aria-current`, fondo y barra izquierda (dictamen D1 §5). */
  selected?: boolean | undefined;
  /** Reloj inyectable para pruebas. */
  now?: number | undefined;
  /**
   * Vista dividida (spec 2026-11-20 v1.2, bloque J): tres líneas como máximo — número y asunto;
   * estado, prioridad, visita, responsable, adjuntos, comentarios y fecha; relato. El tipo va
   * en el nombre accesible y en el título.
   */
  dense?: boolean | undefined;
  onOpen: (opener: HTMLButtonElement) => void;
}

/**
 * Fila densa de ticket (spec MOD05 pestaña Soporte §4): un único botón. Responde al ancho de la
 * lista (`@container` en el `<ul>`), no al viewport: desde 32rem todo en una línea; por debajo
 * (móvil y columna de la vista dividida) número + plazo, asunto y badges con responsable.
 * Bajo los datos, una línea del relato (spec 2026-11-20 §3 D).
 */
export function TicketListItem({
  ticket,
  assigneeLabel,
  slaDeadline,
  fieldWork,
  highlighted = false,
  selected = false,
  now = Date.now(),
  dense = false,
  onOpen,
}: TicketListItemProps) {
  const deadlineState = getTicketDeadlineState(ticket);
  // Vencido lo dice `slaBreachStatus` (mismo criterio que el orden y la franja); el reloj solo mide cuánto.
  const overdue = deadlineState === 'overdue';
  // Plazo ya pasado que el servidor aún no marca (pestaña abierta): se avisa sin contarlo como vencido.
  const pastDue = !overdue && slaDeadline !== null && slaDeadline < now;
  const atRisk = !overdue && (pastDue || deadlineState === 'at_risk');
  const attachmentCount = ticket.attachmentCount ?? 0;
  const commentCount = ticket.commentCount ?? 0;
  // Texto escrito por usuarios: React lo escapa; solo se muestra, nunca se interpreta.
  const story = getTicketStory(ticket);
  const commentsLabel = commentCount > 0 ? formatTicketCommentCount(commentCount) : null;
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
    commentsLabel ? `con ${commentsLabel}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const FieldWorkIcon = fieldWork?.kind === 'order' ? ClipboardList : CalendarClock;

  if (dense) {
    const typeLabel = ticket.type ? getAssuranceTicketTypeLabel(ticket.type) : null;
    const openedLabel = `Abierto ${formatAssuranceDate(ticket.createdAt)}`;
    // El nombre no cambia (pruebas y lectores ya lo conocen); lo que la fila compacta no escribe
    // completo va en la descripción accesible (H5).
    const denseDescription = [
      typeLabel ? `Tipo ${typeLabel.toLowerCase()}` : null,
      `Responsable ${assigneeLabel}`,
      fieldWork ? fieldWork.label : null,
      deadlineLabel,
      openedLabel,
    ]
      .filter(Boolean)
      .join('. ');
    const descriptionId = `ticket-row-${ticket.id}-detalle`;
    return (
      <li>
        <button
          type="button"
          aria-label={accessibleName}
          aria-describedby={descriptionId}
          aria-current={selected ? 'true' : undefined}
          title={typeLabel ?? undefined}
          onClick={(event) => onOpen(event.currentTarget)}
          className={cn(
            'block min-h-11 w-full rounded-xl border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
            interactiveFocusClassName,
            (highlighted || selected) && 'bg-iwana-surface-soft dark:bg-dark-surface-3',
            selected && 'border-iwana-primary dark:border-iwana-primary-500',
          )}
        >
          {/* Alto ≈ 74 px: 16 de relleno + 20 + 2 + 20 + 16. Con la separación entre filas caben
              5 completas a 1440×900 (CA-17); más aire deja la quinta en el borde. */}
          <span className="flex items-baseline gap-x-2 leading-5">
            <span className="shrink-0 font-mono text-xs font-semibold text-iwana-secondary-700 dark:text-gray-300">
              {ticket.ticketNumber}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
              {ticket.subject}
            </span>
            {deadlineLabel ? (
              <span
                className={cn(
                  'max-w-[45%] shrink-0 truncate text-xs',
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
          <span className="mt-0.5 flex h-5 min-w-0 items-center gap-x-2 overflow-hidden text-xs text-gray-600 dark:text-gray-300">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {fieldWork ? (
              <span
                data-testid="ticket-field-work"
                title={fieldWork.label}
                className="inline-flex shrink-0 items-center"
              >
                <FieldWorkIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
            {/* La descripción accesible ya dice «Responsable X»: el círculo no repite el prefijo. */}
            <AssigneeMark label={assigneeLabel} size="xs" />
            <span className="min-w-0 flex-1" aria-hidden="true" />
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
            {commentsLabel ? (
              <span
                data-testid="ticket-comment-count"
                title={`Con ${commentsLabel}`}
                className="inline-flex shrink-0 items-center gap-1"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true">{commentCount}</span>
                <span className="sr-only">Con {commentsLabel}</span>
              </span>
            ) : null}
            <span className="shrink-0" title={openedLabel}>
              {formatAssuranceDate(ticket.createdAt)}
            </span>
          </span>
          {story ? (
            <span className="line-clamp-1 text-xs leading-4 text-gray-600 dark:text-gray-300">
              {story}
            </span>
          ) : null}
        </button>
        <span id={descriptionId} className="sr-only">
          {denseDescription}
        </span>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        aria-label={accessibleName}
        aria-current={selected ? 'true' : undefined}
        onClick={(event) => onOpen(event.currentTarget)}
        className={cn(
          'block min-h-11 w-full rounded-xl border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:bg-iwana-surface-soft dark:hover:bg-dark-surface-3',
          interactiveFocusClassName,
          (highlighted || selected) && 'bg-iwana-surface-soft dark:bg-dark-surface-3',
          selected && 'border-iwana-primary dark:border-iwana-primary-500',
        )}
      >
        <span className="flex flex-wrap items-baseline gap-x-2 @lg:flex-nowrap">
          <span className="order-1 shrink-0 font-mono text-xs font-semibold text-iwana-secondary-700 dark:text-gray-300">
            {ticket.ticketNumber}
          </span>
          <span className="order-3 block min-w-0 basis-full truncate text-sm font-medium text-gray-900 dark:text-white @lg:order-2 @lg:flex-1 @lg:basis-auto">
            {ticket.subject}
          </span>
          {deadlineLabel ? (
            <span
              className={cn(
                'order-2 ml-auto shrink-0 text-xs @lg:order-3',
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
        {/* Estrecho: dos líneas fijas sin envolver (≤ 96 px, spec §4/§9). Desde `@lg` los dos
            grupos se disuelven (`contents`) y todo queda en una sola línea. */}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-300 @lg:flex-nowrap">
          <span className="flex min-w-0 basis-full items-center gap-x-2 @lg:contents">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            {ticket.type ? (
              <span className="sr-only @xs:not-sr-only @xs:shrink-0">
                {getAssuranceTicketTypeLabel(ticket.type)}
              </span>
            ) : null}
            <span aria-hidden="true">·</span>
            <AssigneeMark label={assigneeLabel} size="xs" srPrefix="Responsable:" />
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
            {commentsLabel ? (
              <span
                data-testid="ticket-comment-count"
                title={`Con ${commentsLabel}`}
                className="inline-flex shrink-0 items-center gap-1"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true">{commentCount}</span>
                <span className="sr-only">Con {commentsLabel}</span>
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 basis-full items-center gap-x-2 @lg:contents">
            {fieldWork ? (
              <span
                title={fieldWork.label}
                className="inline-flex min-w-0 items-center gap-1 @lg:shrink-0"
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
        {story ? (
          <span className="mt-1 line-clamp-1 text-xs text-gray-600 dark:text-gray-300">
            {story}
          </span>
        ) : null}
      </button>
    </li>
  );
}
