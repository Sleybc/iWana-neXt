'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { BillingEmailLogEntry } from '@iwana/shared';
import { Badge } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import { EMAIL_REASONS, EMAIL_STATUSES, formatBillingInstant } from './billing-copy';
import { BillingLoadState, BillingTable, billingError, useBillingLoad } from './billing-ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';

/** Qué envíos del titular muestra el registro (spec MOD05↔MOD14 2026-11-13 R4). */
export type BillingEmailTarget =
  | { kind: 'FACTURA'; documentId: string }
  | { kind: 'RECIBO'; paymentId: string }
  | { kind: 'ESTADO_CUENTA' };

export function emailLogEntriesFor(
  entries: readonly BillingEmailLogEntry[],
  target: BillingEmailTarget,
): BillingEmailLogEntry[] {
  return entries.filter((entry) => {
    if (entry.kind !== target.kind) return false;
    if (target.kind === 'FACTURA') return entry.documentId === target.documentId;
    if (target.kind === 'RECIBO') return entry.paymentId === target.paymentId;
    return true;
  });
}

function periodLabel(entry: BillingEmailLogEntry): string {
  if (entry.periodFrom && entry.periodTo)
    return `${formatBillingDate(entry.periodFrom)} al ${formatBillingDate(entry.periodTo)}`;
  // Los periodos móviles (3 y 6 meses, último año) envían solo `from`.
  if (entry.periodFrom) return `Desde el ${formatBillingDate(entry.periodFrom)}`;
  if (entry.periodTo) return `Hasta el ${formatBillingDate(entry.periodTo)}`;
  return 'Todo el historial';
}

/**
 * Registro de envíos por correo de un documento, un recibo o el estado de cuenta. Solo muestra el
 * destinatario enmascarado que entrega la API (R4): nunca el correo en claro ni texto del servidor.
 */
export function BillingEmailLog({
  subscriberId,
  target,
  revision = 0,
}: {
  subscriberId: string;
  target: BillingEmailTarget;
  /** Cambia tras un envío para recargar el registro. */
  revision?: number;
}) {
  const headingId = useId();
  // Función asíncrona: un fallo al llamar la API queda como error visible, no como excepción.
  const load = useCallback(async () => billingApi.emailLog(subscriberId), [subscriberId]);
  const { data, loading, error, reload } = useBillingLoad(load, revision);
  const entries = data ? emailLogEntriesFor(data.entries, target) : [];
  const statement = target.kind === 'ESTADO_CUENTA';
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-semibold text-gray-900 dark:text-white">
        Registro de envíos
      </h3>
      <BillingLoadState loading={loading} error={error} onRetry={reload} />
      {data && !entries.length ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">Aún no hay envíos por correo.</p>
      ) : null}
      {entries.length ? (
        <BillingTable
          label="Envíos por correo"
          columns={[
            'Fecha',
            ...(statement ? ['Periodo'] : []),
            'Destinatario',
            'Asunto',
            'Estado',
            'Motivo',
          ]}
          rows={entries.map((entry) => {
            const status = EMAIL_STATUSES[entry.status];
            return {
              id: entry.id,
              cells: [
                formatBillingInstant(entry.processedAt ?? entry.createdAt),
                ...(statement ? [periodLabel(entry)] : []),
                entry.recipientMasked ?? 'No disponible',
                entry.subject,
                <div className="flex flex-wrap gap-1">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {entry.resend ? <Badge variant="neutral">Reenviado</Badge> : null}
                </div>,
                entry.reasonCode ? EMAIL_REASONS[entry.reasonCode] : '—',
              ],
            };
          })}
        />
      ) : null}
    </section>
  );
}

const REJECTION_DETAIL = {
  SIN_CORREO: 'El titular no tiene correo registrado. Regístralo en sus datos y vuelve a enviarlo.',
  TITULAR_RESTRINGIDO: 'Los datos del titular están restringidos: no se le envían correos.',
  FALLO_DE_ENVIO: 'El servidor de correo no aceptó el envío. Intenta de nuevo más tarde.',
} as const;

interface EmailSendOutcome {
  variant: 'success' | 'warning' | 'error';
  title: string;
  description?: string;
}

/** Resultado visible de una solicitud de envío (202 con la fila del registro). */
export function emailSendOutcome(entry: BillingEmailLogEntry): EmailSendOutcome {
  if (entry.status === 'RECHAZADO' || entry.status === 'ERROR') {
    return {
      variant: entry.status === 'RECHAZADO' ? 'warning' : 'error',
      title: 'No se envió el correo',
      description: REJECTION_DETAIL[entry.reasonCode ?? 'FALLO_DE_ENVIO'],
    };
  }
  if (entry.status === 'ENVIADO') return { variant: 'success', title: 'Correo enviado' };
  return {
    variant: 'success',
    title: entry.resend ? 'Reenvío en cola' : 'Envío en cola',
    description: 'El registro de envíos muestra cuándo sale el correo.',
  };
}

/** Envía un correo de facturación y devuelve el resultado; `sent` cambia tras cada intento. */
export function useBillingEmailSend() {
  const running = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<EmailSendOutcome | null>(null);
  const [sent, setSent] = useState(0);

  async function send(key: string, request: () => Promise<BillingEmailLogEntry>) {
    if (running.current) return;
    running.current = true;
    setBusy(key);
    setOutcome(null);
    try {
      setOutcome(emailSendOutcome(await request()));
    } catch (cause) {
      setOutcome({
        variant: 'error',
        title: 'No se envió el correo',
        description: billingError(cause),
      });
    } finally {
      running.current = false;
      setBusy(null);
      setSent((value) => value + 1);
    }
  }

  return { busy, outcome, sent, send };
}

export function BillingEmailSendResult({ outcome }: { outcome: EmailSendOutcome | null }) {
  if (!outcome) return null;
  return (
    <PortalAlert
      variant={outcome.variant}
      title={outcome.title}
      {...(outcome.description ? { description: outcome.description } : {})}
    />
  );
}
