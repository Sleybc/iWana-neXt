'use client';

import { PortalSidePeek } from '@/components/shared/portal-ui';
import { AssuranceTicketDetail, type AssuranceTicketDetailProps } from './AssuranceTicketDetail';
import { getAssuranceTicketPath } from './assurance-routes';

interface AssuranceTicketDrawerProps extends Omit<AssuranceTicketDetailProps, 'children'> {
  open: boolean;
  onClose: () => void;
  /** «Abrir en página» en la cabecera (spec §3 K). Por defecto, sí. */
  showOpenInPage?: boolean | undefined;
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
          {content}
        </PortalSidePeek>
      )}
    </AssuranceTicketDetail>
  );
}
