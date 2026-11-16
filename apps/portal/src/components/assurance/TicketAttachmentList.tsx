'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Download, ExternalLink, FileImage, FileText, FileVideoCamera, Play } from 'lucide-react';
import { Badge, Button, cn } from '@iwana/ui';
import type { TicketAttachmentStatus } from '@iwana/shared';
import {
  assuranceApi,
  type AssuranceTicketAttachment,
  type AssuranceTicketAttachmentDisposition,
  type AssuranceTicketAttachmentLink,
} from '@/lib/api-client';
import { PortalSkeletonBlock, interactiveFocusClassName } from '@/components/shared/portal-ui';
import {
  TICKET_ATTACHMENT_STATUS_LABELS,
  formatTicketAttachmentSize,
  getTicketAttachmentKind,
  getTicketAttachmentKindLabel,
  getTicketAttachmentLinkFailure,
  isTicketAttachmentLinkFresh,
  toSafeTicketAttachmentUrl,
  type TicketAttachmentKind,
} from './ticket-attachments';
import {
  downloadTicketAttachment,
  openTicketAttachmentInNewTab,
} from './ticket-attachment-navigation';

/** `preview`: bajo el comentario, con miniatura y reproductor. `compact`: resumen del caso. */
export type TicketAttachmentListVariant = 'preview' | 'compact';

interface TicketAttachmentListProps {
  ticketId: string;
  attachments: readonly AssuranceTicketAttachment[];
  variant: TicketAttachmentListVariant;
  label: string;
}

const KIND_ICONS = {
  image: FileImage,
  pdf: FileText,
  video: FileVideoCamera,
} satisfies Record<TicketAttachmentKind, unknown>;

const actionButtonClassName = 'min-h-11 gap-1.5';

/**
 * Enlace firmado del adjunto: se pide al mostrar (miniatura) o al hacer clic, y solo se
 * reutiliza mientras no venza. Un 409 actualiza el estado visible.
 */
function useTicketAttachmentLink(ticketId: string, attachment: AssuranceTicketAttachment) {
  const [status, setStatus] = useState<TicketAttachmentStatus>(attachment.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AssuranceTicketAttachmentDisposition | null>(null);

  useEffect(() => setStatus(attachment.status), [attachment.status]);

  const requestLink = useCallback(
    async (
      disposition: AssuranceTicketAttachmentDisposition,
    ): Promise<AssuranceTicketAttachmentLink | null> => {
      setPending(disposition);
      setError(null);
      try {
        const link = await assuranceApi.tickets.getAttachmentLink(
          ticketId,
          attachment.id,
          disposition,
        );
        const url = toSafeTicketAttachmentUrl(link.url);
        if (!url) {
          setError('No pudimos abrir el archivo. Intenta de nuevo.');
          return null;
        }
        return { ...link, url };
      } catch (cause) {
        const failure = getTicketAttachmentLinkFailure(cause);
        if (failure.kind === 'status') setStatus(failure.status);
        else setError(failure.message);
        return null;
      } finally {
        setPending(null);
      }
    },
    [attachment.id, ticketId],
  );

  return { status, error, pending, requestLink };
}

function ImageThumbnail({
  attachment,
  requestLink,
}: {
  attachment: AssuranceTicketAttachment;
  requestLink: (
    disposition: AssuranceTicketAttachmentDisposition,
  ) => Promise<AssuranceTicketAttachmentLink | null>;
}) {
  const [link, setLink] = useState<AssuranceTicketAttachmentLink | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const retriedRef = useRef(false);

  const load = useCallback(async () => {
    setState('loading');
    const next = await requestLink('inline');
    setLink(next);
    setState(next ? 'ready' : 'failed');
  }, [requestLink]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFullSize = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (isTicketAttachmentLinkFresh(link)) return;
    event.preventDefault();
    const next = await requestLink('inline');
    if (!next) return;
    setLink(next);
    openTicketAttachmentInNewTab(next.url);
  };

  if (state === 'loading') {
    return (
      <div role="status" aria-label={`Cargando vista previa de ${attachment.filename}`}>
        <PortalSkeletonBlock className="mt-3 h-24 w-24 rounded-xl" />
      </div>
    );
  }
  if (state === 'failed' || !link) return null;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => void openFullSize(event)}
      className={cn('mt-3 inline-block rounded-xl', interactiveFocusClassName)}
    >
      {/* Enlace firmado externo y de corta vida: next/image exigiría declarar el host. */}
      <img
        src={link.url}
        alt={`Vista previa de ${attachment.filename}`}
        className="h-24 w-24 rounded-xl border border-gray-200 object-cover dark:border-dark-border"
        onError={() => {
          // El enlace pudo vencer antes de cargar: se pide uno nuevo una sola vez.
          if (retriedRef.current) {
            setState('failed');
            return;
          }
          retriedRef.current = true;
          void load();
        }}
      />
    </a>
  );
}

function TicketAttachmentItem({
  ticketId,
  attachment,
  variant,
}: {
  ticketId: string;
  attachment: AssuranceTicketAttachment;
  variant: TicketAttachmentListVariant;
}) {
  const { status, error, pending, requestLink } = useTicketAttachmentLink(ticketId, attachment);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const kind = getTicketAttachmentKind(attachment.contentType);
  const Icon = KIND_ICONS[kind];
  const available = status === 'AVAILABLE';

  const openInNewTab = async () => {
    const link = await requestLink('inline');
    if (link) openTicketAttachmentInNewTab(link.url);
  };
  const download = async () => {
    const link = await requestLink('attachment');
    if (link) downloadTicketAttachment(link.url);
  };
  const playVideo = async () => {
    const link = await requestLink('inline');
    if (link) setVideoUrl(link.url);
  };

  const openLabel =
    kind === 'pdf'
      ? 'Abrir PDF'
      : kind === 'video'
        ? variant === 'preview'
          ? 'Reproducir video'
          : 'Abrir video'
        : 'Ver foto';
  const showOpenButton = !(kind === 'image' && variant === 'preview') && videoUrl === null;

  return (
    <li
      data-testid="ticket-attachment"
      data-attachment-status={status}
      className="rounded-xl border border-gray-200 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2"
    >
      <div className="flex flex-wrap items-start gap-3">
        <Icon
          className="mt-0.5 h-5 w-5 shrink-0 text-iwana-primary dark:text-iwana-primary-300"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-medium text-gray-900 dark:text-white">
            {attachment.filename}
          </p>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            {getTicketAttachmentKindLabel(attachment.contentType)} ·{' '}
            {formatTicketAttachmentSize(attachment.sizeBytes)}
          </p>
        </div>
        {available ? (
          <div className="flex flex-wrap gap-2">
            {showOpenButton ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={actionButtonClassName}
                loading={pending === 'inline'}
                disabled={pending !== null}
                aria-label={`${openLabel}: ${attachment.filename}`}
                onClick={() =>
                  void (kind === 'video' && variant === 'preview' ? playVideo() : openInNewTab())
                }
              >
                {kind === 'video' && variant === 'preview' ? (
                  <Play className="h-4 w-4" aria-hidden />
                ) : (
                  <ExternalLink className="h-4 w-4" aria-hidden />
                )}
                {openLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={actionButtonClassName}
              loading={pending === 'attachment'}
              disabled={pending !== null}
              aria-label={`Descargar ${attachment.filename}`}
              onClick={() => void download()}
            >
              <Download className="h-4 w-4" aria-hidden />
              Descargar
            </Button>
          </div>
        ) : (
          <Badge variant={status === 'IN_REVIEW' ? 'warning' : 'error'}>
            {TICKET_ATTACHMENT_STATUS_LABELS[status]}
          </Badge>
        )}
      </div>

      {status === 'IN_REVIEW' ? (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          Estamos revisando el archivo. Podrás abrirlo cuando termine.
        </p>
      ) : null}
      {status === 'BLOCKED' ? (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          No se puede abrir ni descargar.
        </p>
      ) : null}

      {available && variant === 'preview' && kind === 'image' ? (
        <ImageThumbnail attachment={attachment} requestLink={requestLink} />
      ) : null}
      {available && videoUrl ? (
        <video
          controls
          preload="metadata"
          src={videoUrl}
          aria-label={`Video ${attachment.filename}`}
          className="mt-3 max-h-80 w-full rounded-xl bg-black"
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-error-700 dark:text-error-400">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function TicketAttachmentList({
  ticketId,
  attachments,
  variant,
  label,
}: TicketAttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <ul aria-label={label} className={cn('space-y-2', variant === 'preview' ? 'mt-3' : null)}>
      {attachments.map((attachment) => (
        <TicketAttachmentItem
          key={attachment.id}
          ticketId={ticketId}
          attachment={attachment}
          variant={variant}
        />
      ))}
    </ul>
  );
}
