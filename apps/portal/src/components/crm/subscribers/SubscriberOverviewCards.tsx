'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Badge, Button } from '@iwana/ui';
import { CalendarClock, LifeBuoy, ReceiptText } from 'lucide-react';
import type { BillingPolicyPreview } from '@iwana/shared';
import type { AssuranceTicket, Contract } from '@/lib/api-client';
import { assuranceApi, billingApi } from '@/lib/api-client';
import {
  formatAssuranceDateTime,
  getAssuranceTicketStatusLabel,
  getAssuranceTicketStatusVariant,
} from '@/components/assurance/assurance-labels';
import { formatWfmDateTime } from '@/components/scheduling/scheduling-ui';
import { formatBillingMoney } from '@/components/billing/billing-copy';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  PortalSkeletonBlock,
  portalFieldRowClassName,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { compareTickets, isActiveTicket } from './SubscriberTicketsSection';
import {
  isOpenVisitEntry,
  loadSubscriberVisitEntries,
  type VisitEntry,
} from './SubscriberVisitsSection';
import { formatBillingDate } from './billing-cycle-ui';
import { useContractPlan } from './use-contract-plan';

const MAX_ROWS = 3;

/**
 * Comparte la lectura en curso entre tarjetas de la misma ficha (Tickets activos y
 * Actividad piden lo mismo al montar): una sola llamada y el mismo resultado o error.
 * Al resolverse se olvida, así «Reintentar» siempre vuelve a consultar.
 */
function shareInFlight<T>(load: (subscriberId: string) => Promise<T>) {
  const inFlight = new Map<string, Promise<T>>();
  return (subscriberId: string): Promise<T> => {
    const current = inFlight.get(subscriberId);
    if (current) return current;
    const request = load(subscriberId).finally(() => inFlight.delete(subscriberId));
    inFlight.set(subscriberId, request);
    return request;
  };
}

/** Tickets del suscriptor (hasta 100), compartidos entre tarjetas. */
export const loadSubscriberTickets = shareInFlight(
  async (subscriberId: string): Promise<AssuranceTicket[]> =>
    (await assuranceApi.tickets.list({ subscriberId, limit: 100 })).data,
);

/** Visitas del suscriptor, compartidas entre tarjetas. */
export const loadSubscriberVisits = shareInFlight(loadSubscriberVisitEntries);

export type LoadState<T> = { data: T | null; error: boolean; loading: boolean; reload: () => void };

/** Lectura de una tarjeta de la Vista general; `enabled=false` no llama a la API. */
export function useCardLoad<T>(load: () => Promise<T>, enabled: boolean): LoadState<T> {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({
    data: null,
    error: false,
    loading: enabled,
  });
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState((prev) => ({ ...prev, error: false, loading: true }));
    load().then(
      (data) => {
        if (active) setState({ data, error: false, loading: false });
      },
      () => {
        if (active) setState({ data: null, error: true, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [load, enabled, revision]);
  return { ...state, reload };
}

/** Cabecera visible en todos los estados; el foco vuelve al título tras reintentar (§8.3). */
export function RemoteCard<T>({
  title,
  titleAddon,
  actions,
  load,
  errorTitle,
  errorDescription,
  lead,
  titleRef: externalTitleRef,
  children,
}: {
  title: string;
  titleAddon?: ReactNode;
  actions?: ReactNode;
  load: LoadState<T>;
  errorTitle: string;
  errorDescription?: string;
  /** Contenido fijo antes del cuerpo remoto (p. ej. un formulario); se ve en todos los estados. */
  lead?: ReactNode;
  /** Permite que la ficha lleve el foco al título desde otra acción. */
  titleRef?: RefObject<HTMLHeadingElement | null>;
  children: (data: T) => ReactNode;
}) {
  const ownTitleRef = useRef<HTMLHeadingElement>(null);
  const titleRef = externalTitleRef ?? ownTitleRef;
  const retried = useRef(false);
  useEffect(() => {
    if (retried.current && !load.loading) {
      retried.current = false;
      titleRef.current?.focus();
    }
  }, [load.loading, titleRef]);
  return (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title={title}
      titleAddon={titleAddon}
      actions={actions}
      busy={load.loading}
      titleRef={titleRef}
      titleTabIndex={-1}
    >
      {lead}
      {load.loading ? (
        <div aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className={portalFieldRowClassName}>
              <PortalSkeletonBlock className="h-4 w-24" />
              <PortalSkeletonBlock className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : load.error ? (
        <PortalAlert
          variant="error"
          title={errorTitle}
          description={errorDescription}
          action={
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => {
                retried.current = true;
                load.reload();
              }}
            >
              Reintentar
            </Button>
          }
        />
      ) : load.data !== null ? (
        children(load.data)
      ) : null}
    </PortalPanel>
  );
}

function GoToLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={portalPanelDenseActionClassName} onClick={onClick}>
      {label}
    </button>
  );
}

// ── Siguiente cobro (D5): fechas de MOD14 + precio mensual del contrato ──────

function NextChargeBody({
  preview,
  contract,
}: {
  preview: BillingPolicyPreview;
  contract: Contract;
}) {
  const plan = useContractPlan(contract);
  const next = preview.cycles[0]?.items[0];
  if (!next) {
    return (
      <PortalEmptyState
        embedded
        icon={ReceiptText}
        title="Aún no hay una fecha de cobro estimada"
        description="La fecha aparece cuando la política de facturación la calcule."
      />
    );
  }
  return (
    <PortalFieldList>
      <PortalFieldRow label="Periodo">
        {`${formatBillingDate(next.periodStart)} a ${formatBillingDate(next.periodEnd)}`}
      </PortalFieldRow>
      <PortalFieldRow label="Generación">{formatBillingDate(next.generationDate)}</PortalFieldRow>
      <PortalFieldRow label="Vencimiento">{formatBillingDate(next.dueDate)}</PortalFieldRow>
      <PortalFieldRow label="Valor mensual" mono empty={plan.price === undefined && !plan.loading}>
        {plan.price !== undefined
          ? formatBillingMoney(plan.price)
          : plan.loading
            ? 'Consultando plan…'
            : null}
      </PortalFieldRow>
    </PortalFieldList>
  );
}

export function SubscriberNextChargeCard({
  contract,
  onOpenBilling,
}: {
  /** Primer contrato activo; sin él no hay cobro que estimar. */
  contract: Contract | null;
  onOpenBilling: () => void;
}) {
  const contractId = contract?.id ?? null;
  const loadPreview = useCallback(
    () => billingApi.preview({ contractId: contractId ?? undefined }),
    [contractId],
  );
  const load = useCardLoad(loadPreview, contractId !== null);
  const titleAddon = <Badge variant="neutral">Estimado</Badge>;
  if (!contract) {
    return (
      <PortalPanel as="section" labelled density="dense" title="Siguiente cobro">
        <PortalEmptyState
          embedded
          icon={ReceiptText}
          title="Sin servicio activo para estimar el cobro"
          description="El estimado se calcula con el primer servicio activo."
        />
      </PortalPanel>
    );
  }
  return (
    <RemoteCard
      title="Siguiente cobro"
      titleAddon={titleAddon}
      actions={<GoToLink label="Ver facturación" onClick={onOpenBilling} />}
      load={load}
      errorTitle="No pudimos estimar el siguiente cobro"
    >
      {(preview) => <NextChargeBody preview={preview} contract={contract} />}
    </RemoteCard>
  );
}

// ── Tickets activos ───────────────────────────────────────────────────────────

export function SubscriberActiveTicketsCard({
  subscriberId,
  onOpenSupport,
}: {
  subscriberId: string;
  onOpenSupport: () => void;
}) {
  const loadTickets = useCallback(async (): Promise<AssuranceTicket[]> => {
    return (await loadSubscriberTickets(subscriberId)).filter(isActiveTicket).sort(compareTickets);
  }, [subscriberId]);
  const load = useCardLoad(loadTickets, true);
  return (
    <RemoteCard
      title="Tickets activos"
      actions={<GoToLink label="Ver soporte" onClick={onOpenSupport} />}
      load={load}
      errorTitle="No pudimos cargar los tickets activos"
    >
      {(tickets) =>
        tickets.length === 0 ? (
          <PortalEmptyState
            embedded
            icon={LifeBuoy}
            title="Sin tickets activos"
            description="Los tickets abiertos del suscriptor aparecerán aquí."
          />
        ) : (
          <OverviewList
            total={tickets.length}
            rows={tickets.slice(0, MAX_ROWS).map((ticket) => ({
              key: ticket.id,
              title: ticket.subject,
              detail: `Abierto ${formatAssuranceDateTime(ticket.createdAt)}`,
              badge: (
                <Badge variant={getAssuranceTicketStatusVariant(ticket.status)}>
                  {getAssuranceTicketStatusLabel(ticket.status)}
                </Badge>
              ),
            }))}
            moreLabel={(count) =>
              `Y ${count} ${count === 1 ? 'ticket activo más' : 'tickets activos más'}.`
            }
          />
        )
      }
    </RemoteCard>
  );
}

// ── Visitas abiertas ──────────────────────────────────────────────────────────

export function SubscriberOpenVisitsCard({
  subscriberId,
  onOpenSupport,
}: {
  subscriberId: string;
  onOpenSupport: () => void;
}) {
  const loadVisits = useCallback(
    async (): Promise<VisitEntry[]> =>
      (await loadSubscriberVisits(subscriberId)).filter(isOpenVisitEntry),
    [subscriberId],
  );
  const load = useCardLoad(loadVisits, true);
  return (
    <RemoteCard
      title="Visitas abiertas"
      actions={<GoToLink label="Ver soporte" onClick={onOpenSupport} />}
      load={load}
      errorTitle="No pudimos cargar las visitas abiertas"
    >
      {(visits) =>
        visits.length === 0 ? (
          <PortalEmptyState
            embedded
            icon={CalendarClock}
            title="Sin visitas abiertas"
            description="Las visitas pendientes o agendadas aparecerán aquí."
          />
        ) : (
          <OverviewList
            total={visits.length}
            rows={visits.slice(0, MAX_ROWS).map((visit) => ({
              key: visit.key,
              title: visit.workType,
              detail: visit.date ? formatWfmDateTime(visit.date) : 'Sin fecha agendada',
              badge: <Badge variant={visit.statusVariant}>{visit.statusLabel}</Badge>,
            }))}
            moreLabel={(count) =>
              `Y ${count} ${count === 1 ? 'visita abierta más' : 'visitas abiertas más'}.`
            }
          />
        )
      }
    </RemoteCard>
  );
}

function OverviewList({
  rows,
  total,
  moreLabel,
}: {
  rows: Array<{ key: string; title: string; detail: string; badge: ReactNode }>;
  total: number;
  moreLabel: (count: number) => string;
}) {
  const hidden = total - rows.length;
  return (
    <>
      <ul className="divide-y divide-gray-100 dark:divide-dark-border">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {row.title}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{row.detail}</p>
            </div>
            <span className="shrink-0">{row.badge}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="pt-2 text-sm text-gray-500 dark:text-gray-400">{moreLabel(hidden)}</p>
      ) : null}
    </>
  );
}
