'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, SearchX } from 'lucide-react';
import type { InternalUser } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalEmptyState,
  PortalSkeletonBlock,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { AssuranceTicketDetail } from './AssuranceTicketDetail';
import { ASSURANCE_PATH, getAssuranceCreateFromTicketPath } from './assurance-routes';
import { AssuranceAccessState } from './assurance-ui';
import {
  getAssuranceRoleAccess,
  loadOperationalUsers,
  useAssuranceTicketDetail,
} from './use-assurance-ticket-detail';

function readTicketId(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const backLink = (
  <Link
    href={ASSURANCE_PATH}
    className={`inline-flex items-center gap-1.5 ${portalPanelDenseActionClassName}`}
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    Volver a la mesa de ayuda
  </Link>
);

/**
 * Página propia del ticket (`/dashboard/assurance/tickets/[id]`, spec MOD10 §3 K y CA-11): el
 * mismo contenido que el panel, con la misma carga de datos y los mismos permisos que la bandeja.
 * El permiso de página (`assurance.tickets.read`) lo aplica el layout de la mesa de ayuda.
 */
export function AssuranceTicketPageClient() {
  const params = useParams<{ id: string }>();
  const ticketId = readTicketId(params?.id);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canView, canManage } = getAssuranceRoleAccess(user?.role);
  const [assignees, setAssignees] = useState<InternalUser[]>([]);
  const ticketDetail = useAssuranceTicketDetail();
  const { open } = ticketDetail;

  useEffect(() => {
    if (authLoading || !user || !canView || !ticketId) return;
    void open(ticketId);
    // Igual que la bandeja: los responsables se cargan para cualquier rol con acceso.
    loadOperationalUsers()
      .then(setAssignees)
      .catch(() => setAssignees([]));
  }, [authLoading, canView, open, ticketId, user]);

  if (authLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title="Detalle del ticket" subtitle="Cargando el caso…" actions={backLink} />
        <PortalSkeletonBlock className="h-96" />
      </div>
    );
  }

  if (!user) {
    return <AssuranceAccessState reason="session" />;
  }

  if (!canView) {
    return <AssuranceAccessState reason="role" />;
  }

  if (!ticketId || ticketDetail.errorStatus === 404) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ticket no encontrado" actions={backLink} />
        <PortalEmptyState
          icon={SearchX}
          title="Este ticket no existe o ya no está disponible."
          description="Vuelve a la mesa de ayuda para elegir otro caso."
          action={backLink}
        />
      </div>
    );
  }

  const { ticket, error } = ticketDetail.detailProps;

  return (
    <AssuranceTicketDetail
      {...ticketDetail.detailProps}
      // Antes de la primera respuesta no hay ticket ni error: es carga, no «no disponible».
      isLoading={ticketDetail.detailProps.isLoading || (!ticket && !error)}
      assignees={assignees}
      canManage={canManage}
      canOperate={canView}
      emptyDescription="Vuelve a la mesa de ayuda para elegir otro caso."
      // Ticket cerrado: la creación vive en Mesa de ayuda; se abre allí con su cliente (§2).
      onCreateFollowUpTicket={
        canManage ? (source) => router.push(getAssuranceCreateFromTicketPath(source.id)) : undefined
      }
      onCreateLinkedTask={() => {
        router.push(
          `/dashboard/operations/tasks/new?ticketId=${encodeURIComponent(ticketId)}&fromAssurance=1`,
        );
      }}
    >
      {({ content, composer }) => (
        <div className="space-y-6">
          <PageHeader
            title={ticket?.ticketNumber ?? 'Detalle del ticket'}
            subtitle={ticket?.subject ?? 'Consulta comentarios, historial y acciones del caso.'}
            actions={backLink}
          />
          <section
            aria-label="Detalle del ticket"
            className="rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2"
          >
            <div className="px-5 py-4">{content}</div>
            {composer ? (
              <div className="sticky bottom-0 rounded-b-2xl border-t border-gray-100 bg-white px-5 py-4 dark:border-dark-border dark:bg-dark-surface-2">
                {composer}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </AssuranceTicketDetail>
  );
}
