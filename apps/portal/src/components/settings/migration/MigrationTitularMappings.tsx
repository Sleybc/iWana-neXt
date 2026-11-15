'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import type { MigrationBatchCounts, MigrationPendingValue } from '@iwana/shared';
import { PortalAlert, portalInlineTextLinkClassName } from '@/components/shared/portal-ui';
import { migrationApi, subscribersApi, type SubscriberRecord } from '@/lib/api-client';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { formatMaskedDocument } from '@/components/crm/subscribers/SubscriberIdentityCard';
import {
  SUBSCRIBER_STATUS_META,
  formatSubscriberName,
} from '@/components/crm/subscribers/subscriber-ui';
import { externalClientLabel, migrationErrorMessage } from './migration-labels';

type CandidateState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; subscriber: SubscriberRecord };

function useCandidate(candidateRef: string | undefined): CandidateState | null {
  const [state, setState] = useState<CandidateState | null>(
    candidateRef ? { status: 'loading' } : null,
  );
  useEffect(() => {
    if (!candidateRef) return;
    let active = true;
    setState({ status: 'loading' });
    subscribersApi.getById(candidateRef).then(
      (subscriber) => active && setState({ status: 'ready', subscriber }),
      () => active && setState({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [candidateRef]);
  return state;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function CandidateSummary({ subscriber }: { subscriber: SubscriberRecord }) {
  // Mismo criterio que la ficha: sin nombre ni documento si está anonimizado o bloqueado.
  const visible = !subscriber.anonymizedAt && !subscriber.privacyRestricted;
  const name = visible ? formatSubscriberName(subscriber) : 'Datos protegidos';
  const document = visible ? formatMaskedDocument(subscriber) : null;
  const since = subscriber.convertedAt ?? subscriber.activatedAt ?? subscriber.createdAt;
  const status = SUBSCRIBER_STATUS_META[subscriber.status];
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
      <dt className="text-gray-500 dark:text-gray-400">Suscriptor en iWana</dt>
      <dd className="font-medium text-gray-900 dark:text-white">
        <Link
          href={`/dashboard/crm/subscribers/${encodeURIComponent(subscriber.id)}`}
          className={portalInlineTextLinkClassName}
        >
          {name}
        </Link>
      </dd>
      {document ? (
        <>
          <dt className="text-gray-500 dark:text-gray-400">Documento</dt>
          <dd className="text-gray-900 dark:text-white">{document}</dd>
        </>
      ) : null}
      <dt className="text-gray-500 dark:text-gray-400">En iWana desde</dt>
      <dd className="text-gray-900 dark:text-white">{formatBillingDate(since)}</dd>
      {status ? (
        <>
          <dt className="text-gray-500 dark:text-gray-400">Estado</dt>
          <dd>
            <Badge variant={status.variant}>{status.label}</Badge>
          </dd>
        </>
      ) : null}
    </dl>
  );
}

interface TitularCardProps {
  value: MigrationPendingValue;
  counts: MigrationBatchCounts | undefined;
  onSaved: () => void;
}

function TitularCard({ value, counts, onSaved }: TitularCardProps) {
  const candidate = useCandidate(value.candidateRef);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientLabel = externalClientLabel(value.externalValue);
  const crossed = counts?.observaciones.CRUCE_CON_FACTURACION_IWANA ?? 0;
  const entities = counts?.entidades;
  const ready = candidate?.status === 'ready' && value.candidateRef;

  async function confirm() {
    if (!value.candidateRef || saving) return;
    setSaving(true);
    setError(null);
    try {
      await migrationApi.createMapping({
        kind: 'TITULAR',
        externalValue: value.externalValue,
        externalLabel: null,
        action: 'EQUIVALE',
        targetRef: value.candidateRef,
      });
      setOpen(false);
      onSaved();
    } catch (saveError) {
      setError(migrationErrorMessage(saveError, 'No pudimos complementar el titular.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-dark-border">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{clientLabel}</p>
      {candidate === null ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          No encontramos el suscriptor de iWana que le corresponde.
        </p>
      ) : candidate.status === 'loading' ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Cargando el suscriptor de iWana…
        </p>
      ) : candidate.status === 'error' ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar el suscriptor de iWana"
          description="Recarga la página para intentarlo de nuevo."
        />
      ) : (
        <CandidateSummary subscriber={candidate.subscriber} />
      )}
      <Button
        type="button"
        className="min-h-11"
        disabled={!ready}
        aria-label={`Complementar este titular: ${clientLabel}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Complementar este titular
      </Button>
      {error && !open ? <PortalAlert variant="error" live="assertive" title={error} /> : null}

      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complementar este titular</DialogTitle>
            <DialogDescription>
              El {clientLabel.charAt(0).toLowerCase() + clientLabel.slice(1)} se une al suscriptor
              que ya existe en iWana.
            </DialogDescription>
          </DialogHeader>
          <ul className="ml-4 list-disc space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <li>Se enlaza el cliente de UISP con este suscriptor.</li>
            <li>
              Sus servicios de UISP entran como contratos terminados; el servicio actual de iWana no
              cambia.
            </li>
            <li>
              Se importa todo su historial: facturas, pagos, tickets y soportes.
              {entities ? (
                <>
                  {' '}
                  En este lote vienen{' '}
                  {plural(entities.CONTRATO?.leidos ?? 0, 'contrato', 'contratos')},{' '}
                  {plural(entities.DOCUMENTO_COBRO?.leidos ?? 0, 'factura', 'facturas')} y{' '}
                  {plural(entities.PAGO?.leidos ?? 0, 'pago', 'pagos')}.
                </>
              ) : null}
            </li>
            <li>Solo se completan los datos que están vacíos en iWana; ninguno se reemplaza.</li>
          </ul>
          {crossed > 0 ? (
            <PortalAlert
              variant="warning"
              title={`${plural(crossed, 'factura se cruza', 'facturas se cruzan')} con la facturación de iWana`}
              description="Revisa esos periodos antes de promover para no cobrar dos veces."
            />
          ) : null}
          {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-11"
              loading={saving}
              onClick={() => void confirm()}
            >
              Complementar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

interface MigrationTitularMappingsProps {
  pending: MigrationPendingValue[];
  counts: MigrationBatchCounts | undefined;
  onSaved: () => void;
}

/** Grupo «Titulares existentes»: clientes de UISP que ya son suscriptores en iWana (§2.7). */
export function MigrationTitularMappings({
  pending,
  counts,
  onSaved,
}: MigrationTitularMappingsProps) {
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="migration-titulares-existentes" className="space-y-3">
      <h3
        id="migration-titulares-existentes"
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        Titulares existentes
      </h3>
      <ul aria-label="Titulares existentes" className="space-y-3">
        {pending.map((value) => (
          <TitularCard key={value.externalValue} value={value} counts={counts} onSaved={onSaved} />
        ))}
      </ul>
    </section>
  );
}
