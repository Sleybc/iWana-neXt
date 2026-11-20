'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, cn } from '@iwana/ui';
import { PortalSidePeek } from '@/components/shared/portal-ui';
import { AssuranceTicketDetail, type AssuranceTicketDetailProps } from './AssuranceTicketDetail';
import { getAssuranceTicketPath } from './assurance-routes';

interface AssuranceTicketDrawerProps extends Omit<AssuranceTicketDetailProps, 'children'> {
  open: boolean;
  onClose: () => void;
  /** «Abrir en página» en la cabecera (spec §3 K). Por defecto, sí. */
  showOpenInPage?: boolean | undefined;
  /** Anterior y siguiente sobre la lista ya cargada (spec 2026-11-20 §3 G); sin ella no se pinta. */
  navigation?: AssuranceTicketNavigation | undefined;
}

export interface AssuranceTicketNavigation {
  /** Posición 1-based en la lista; `null` si el ticket abierto no está en la página cargada. */
  position: number | null;
  total: number;
  /** `undefined` en el borde: el botón queda desactivado. */
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}

function TicketNavigationBar({ position, total, onPrevious, onNext }: AssuranceTicketNavigation) {
  return (
    <nav
      aria-label="Recorrer tickets de la lista"
      className="mb-4 flex items-center justify-between gap-2"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Ticket anterior"
        disabled={!onPrevious}
        onClick={onPrevious}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Anterior
      </Button>
      {position !== null ? (
        <span className="text-xs text-gray-600 dark:text-gray-300">
          {position} de {total}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Ticket siguiente"
        disabled={!onNext}
        onClick={onNext}
      >
        Siguiente
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}

/** Ancho del panel con riel, paso 2 (spec MOD05 §8.6, D5): 768 px bajo `lg`, 896 px desde `lg`. */
const TICKET_PANEL_WIDTH_CLASS_NAME = 'max-w-3xl lg:max-w-4xl';

/**
 * Panel lateral del ticket: contenedor (`PortalSidePeek`: diálogo, foco, Escape, velo, bloqueo
 * de desplazamiento y difusión al chrome) alrededor del contenido compartido con la página.
 */
export function AssuranceTicketDrawer({
  open,
  onClose,
  showOpenInPage = true,
  navigation,
  ...detail
}: AssuranceTicketDrawerProps) {
  const { ticket } = detail;
  return (
    <AssuranceTicketDetail
      {...detail}
      openInPageHref={showOpenInPage && ticket ? getAssuranceTicketPath(ticket.id) : undefined}
    >
      {({ content, composer }) => (
        <PortalSidePeek
          open={open}
          onClose={onClose}
          title={ticket?.ticketNumber ?? 'Detalle del ticket'}
          description={ticket?.subject ?? 'Consulta comentarios, historial y acciones del caso.'}
          className={TICKET_PANEL_WIDTH_CLASS_NAME}
          footer={composer}
        >
          {navigation ? <TicketNavigationBar {...navigation} /> : null}
          {content}
        </PortalSidePeek>
      )}
    </AssuranceTicketDetail>
  );
}

type AssuranceTicketPaneProps = Omit<AssuranceTicketDetailProps, 'children' | 'openInPageHref'> & {
  className?: string | undefined;
};

/**
 * Panel fijo del ticket para la vista dividida (spec 2026-11-20 §3 A): el mismo contenido que el
 * panel lateral, sin diálogo ni velo; la lista sigue a la vista y operable. El riel interno se
 * apila solo, porque el cuerpo del detalle responde al ancho de su contenedor (D1 §4).
 */
export function AssuranceTicketPane({ className, ...detail }: AssuranceTicketPaneProps) {
  const { ticket } = detail;
  return (
    <AssuranceTicketDetail {...detail}>
      {({ content, composer }) => (
        <section
          aria-label="Ticket abierto"
          className={cn(
            'flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2',
            className,
          )}
        >
          <header className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-dark-border">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {ticket?.ticketNumber ?? 'Detalle del ticket'}
            </h2>
            <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-300">
              {ticket?.subject ?? 'Consulta comentarios, historial y acciones del caso.'}
            </p>
          </header>
          {/* Con alto acotado por el contenedor, solo el cuerpo se desplaza; cabecera y redactor quedan. */}
          <div data-testid="ticket-pane-body" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {content}
          </div>
          {composer ? (
            <div className="shrink-0 rounded-b-2xl border-t border-gray-100 px-4 py-3 dark:border-dark-border">
              {composer}
            </div>
          ) : null}
        </section>
      )}
    </AssuranceTicketDetail>
  );
}
