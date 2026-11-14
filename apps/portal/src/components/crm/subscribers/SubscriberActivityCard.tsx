'use client';

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@iwana/ui';
import { History } from 'lucide-react';
import {
  AccessPermissionKey,
  SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
  type BillingAccountStatement,
  type LifecycleChangeRecord,
  type SubscriberNote,
} from '@iwana/shared';
import { ApiError, subscribersApi, type AssuranceTicket, type Contract } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFilterChip,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import {
  loadSubscriberTickets,
  loadSubscriberVisits,
  RemoteCard,
  useCardLoad,
} from './SubscriberOverviewCards';
import type { VisitEntry } from './SubscriberVisitsSection';
import {
  ACTIVITY_KIND_LABELS,
  formatActivityDate,
  lifecycleToActivity,
  noteToActivity,
  sortActivity,
  statementToActivity,
  ticketToActivity,
  visitToActivity,
  type ActivityItem,
  type ActivityKind,
} from './subscriber-activity';

/** Filas visibles por paso de «Ver más». */
export const ACTIVITY_PAGE_SIZE = 10;
/** Tamaño de página pedido a las fuentes paginadas (estados y notas). */
const REMOTE_PAGE_LIMIT = 20;

type PagedKey = 'lifecycle' | 'notes';
interface PagedCursor {
  page: number;
  hasMore: boolean;
}

interface ActivitySnapshot {
  lifecycle: LifecycleChangeRecord[];
  notes: SubscriberNote[];
  tickets: AssuranceTicket[];
  visits: VisitEntry[];
  cursors: Record<PagedKey, PagedCursor>;
  /** Alguna fuente falló y la bitácora se muestra incompleta. */
  partial: boolean;
  /** Todas las fuentes respondieron 403: el perfil no puede ver este titular. */
  forbidden: boolean;
}

const NOTE_ERROR_MESSAGES = {
  forbidden: 'Tu perfil no permite registrar notas en este suscriptor.',
  locked: 'No se pueden agregar notas: los datos del titular están bloqueados o anonimizados.',
  invalid: `Revisa la nota: debe tener entre 1 y ${SUBSCRIBER_NOTE_BODY_MAX_LENGTH} caracteres.`,
  generic: 'No pudimos guardar la nota. Intenta de nuevo.',
} as const;

function isForbidden(reason: unknown): boolean {
  return reason instanceof ApiError && reason.status === 403;
}

interface SubscriberActivityCardProps {
  subscriberId: string;
  contracts: Contract[];
  anonymized: boolean;
  /** Titular con datos bloqueados: lectura sí (si la API la permite), nota no. */
  restricted: boolean;
  /** Estado de cuenta ya cargado por la ficha; `null` sin permiso de facturación. */
  statement: BillingAccountStatement | null;
  canReadBilling: boolean;
}

export function SubscriberActivityCard({
  subscriberId,
  contracts,
  anonymized,
  restricted,
  statement,
  canReadBilling,
}: SubscriberActivityCardProps) {
  const { hasPermission } = usePermissions();
  const canReadTickets = hasPermission(AccessPermissionKey.ASSURANCE_TICKETS_READ);
  const canReadVisits = hasPermission(AccessPermissionKey.WFM_SCHEDULE_READ);
  const canManage = hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
  const showBilling = canReadBilling && !anonymized;

  const loadActivity = useCallback(async (): Promise<ActivitySnapshot> => {
    const page = { page: 1, limit: REMOTE_PAGE_LIMIT };
    const [lifecycle, notes, tickets, visits] = await Promise.allSettled([
      subscribersApi.lifecycleChanges(subscriberId, page),
      subscribersApi.listNotes(subscriberId, page),
      canReadTickets
        ? loadSubscriberTickets(subscriberId)
        : Promise.resolve([] as AssuranceTicket[]),
      canReadVisits ? loadSubscriberVisits(subscriberId) : Promise.resolve([]),
    ]);
    // Solo cuentan las fuentes que el perfil puede consultar.
    const settled = [
      lifecycle,
      notes,
      ...(canReadTickets ? [tickets] : []),
      ...(canReadVisits ? [visits] : []),
    ];
    const failures = settled.filter((result) => result.status === 'rejected');
    if (failures.length === settled.length) {
      if (failures.every((failure) => isForbidden(failure.reason))) {
        return {
          lifecycle: [],
          notes: [],
          tickets: [],
          visits: [],
          cursors: {
            lifecycle: { page: 1, hasMore: false },
            notes: { page: 1, hasMore: false },
          },
          partial: false,
          forbidden: true,
        };
      }
      throw failures[0]!.reason;
    }
    return {
      lifecycle: lifecycle.status === 'fulfilled' ? lifecycle.value.data : [],
      notes: notes.status === 'fulfilled' ? notes.value.data : [],
      tickets: tickets.status === 'fulfilled' ? tickets.value : [],
      visits: visits.status === 'fulfilled' ? visits.value : [],
      cursors: {
        lifecycle: {
          page: 1,
          hasMore: lifecycle.status === 'fulfilled' && lifecycle.value.meta.hasMore,
        },
        notes: { page: 1, hasMore: notes.status === 'fulfilled' && notes.value.meta.hasMore },
      },
      partial: failures.length > 0,
      forbidden: false,
    };
  }, [subscriberId, canReadTickets, canReadVisits]);
  const load = useCardLoad(loadActivity, Boolean(subscriberId));

  // Páginas siguientes y notas recién creadas se suman a la carga base.
  const [extraLifecycle, setExtraLifecycle] = useState<LifecycleChangeRecord[]>([]);
  const [extraNotes, setExtraNotes] = useState<SubscriberNote[]>([]);
  const [cursors, setCursors] = useState<Record<PagedKey, PagedCursor> | null>(null);
  const [filter, setFilter] = useState<ActivityKind | 'todas'>('todas');
  const [shown, setShown] = useState(ACTIVITY_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  useEffect(() => {
    setExtraLifecycle([]);
    setExtraNotes([]);
    setCursors(load.data?.cursors ?? null);
    setShown(ACTIVITY_PAGE_SIZE);
    setMoreError(false);
  }, [load.data]);

  const kinds = useMemo<ActivityKind[]>(
    () => [
      'nota',
      'servicio',
      ...(canReadTickets ? (['ticket'] as const) : []),
      ...(canReadVisits ? (['visita'] as const) : []),
      ...(showBilling ? (['cobro'] as const) : []),
    ],
    [canReadTickets, canReadVisits, showBilling],
  );

  const items = useMemo<ActivityItem[]>(() => {
    if (!load.data) return [];
    const byKey = new Map<string, ActivityItem>();
    const all = [
      ...[...load.data.lifecycle, ...extraLifecycle].map((record) =>
        lifecycleToActivity(record, contracts, anonymized),
      ),
      ...[...extraNotes, ...load.data.notes].map(noteToActivity),
      ...load.data.tickets.map(ticketToActivity),
      ...load.data.visits.map(visitToActivity),
      ...(showBilling && statement ? statementToActivity(statement) : []),
    ];
    for (const item of all) byKey.set(item.key, item);
    return sortActivity([...byKey.values()]);
  }, [load.data, extraLifecycle, extraNotes, contracts, anonymized, showBilling, statement]);

  const filtered = filter === 'todas' ? items : items.filter((item) => item.kind === filter);
  const visible = filtered.slice(0, shown);
  const pendingSources = (Object.keys(cursors ?? {}) as PagedKey[]).filter(
    (key) =>
      cursors?.[key].hasMore &&
      (filter === 'todas' || filter === (key === 'lifecycle' ? 'servicio' : 'nota')),
  );
  const canShowMore = filtered.length > shown || pendingSources.length > 0;

  async function showMore() {
    setMoreError(false);
    if (filtered.length - shown < ACTIVITY_PAGE_SIZE && pendingSources.length > 0 && cursors) {
      setLoadingMore(true);
      try {
        const next = { ...cursors };
        await Promise.all(
          pendingSources.map(async (key) => {
            const params = { page: cursors[key].page + 1, limit: REMOTE_PAGE_LIMIT };
            if (key === 'lifecycle') {
              const response = await subscribersApi.lifecycleChanges(subscriberId, params);
              setExtraLifecycle((prev) => [...prev, ...response.data]);
              next.lifecycle = { page: params.page, hasMore: response.meta.hasMore };
            } else {
              const response = await subscribersApi.listNotes(subscriberId, params);
              setExtraNotes((prev) => [...prev, ...response.data]);
              next.notes = { page: params.page, hasMore: response.meta.hasMore };
            }
          }),
        );
        setCursors(next);
      } catch {
        setMoreError(true);
        return;
      } finally {
        setLoadingMore(false);
      }
    }
    setShown((value) => value + ACTIVITY_PAGE_SIZE);
  }

  const canWriteNote = canManage && !anonymized && !restricted;

  return (
    <RemoteCard
      title="Actividad"
      load={load}
      errorTitle="No pudimos cargar la actividad"
      errorDescription="Reintenta en unos minutos."
      lead={
        canWriteNote && !load.data?.forbidden ? (
          <SubscriberNoteComposer
            subscriberId={subscriberId}
            onCreated={(note) => setExtraNotes((prev) => [note, ...prev])}
          />
        ) : null
      }
    >
      {(snapshot) =>
        snapshot.forbidden ? (
          <PortalAlert
            variant="warning"
            title="No tienes acceso a la actividad de este suscriptor"
            description="Los datos del titular están bloqueados para tu perfil."
          />
        ) : (
          <div className="space-y-3">
            {snapshot.partial ? (
              <PortalAlert
                variant="warning"
                title="Parte de la actividad no se pudo cargar"
                description="Lo que ves puede estar incompleto. Reintenta en unos minutos."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    onClick={load.reload}
                  >
                    Reintentar
                  </Button>
                }
              />
            ) : null}
            <div
              role="group"
              aria-label="Filtrar actividad por tipo"
              className="flex flex-wrap gap-2"
            >
              <PortalFilterChip
                active={filter === 'todas'}
                className="min-h-11 sm:min-h-0"
                onClick={() => {
                  setFilter('todas');
                  setShown(ACTIVITY_PAGE_SIZE);
                }}
              >
                Todas
              </PortalFilterChip>
              {kinds.map((kind) => (
                <PortalFilterChip
                  key={kind}
                  active={filter === kind}
                  className="min-h-11 sm:min-h-0"
                  onClick={() => {
                    setFilter(kind);
                    setShown(ACTIVITY_PAGE_SIZE);
                  }}
                >
                  {ACTIVITY_KIND_LABELS[kind]}
                </PortalFilterChip>
              ))}
            </div>
            {visible.length === 0 ? (
              <PortalEmptyState
                embedded
                icon={History}
                title={
                  filter === 'todas'
                    ? 'Aún no hay actividad registrada'
                    : 'No hay actividad de este tipo'
                }
                description={
                  filter === 'todas'
                    ? 'Aquí verás cambios de estado, notas, tickets, visitas, facturas y pagos.'
                    : 'Elige «Todas» para ver el resto de la actividad.'
                }
              />
            ) : (
              <ol
                aria-label="Actividad del suscriptor"
                className="divide-y divide-gray-100 dark:divide-dark-border"
              >
                {visible.map((item) => (
                  <li key={item.key} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="min-w-0 break-words text-sm font-medium text-gray-900 dark:text-white">
                        {item.title}
                      </p>
                      <time
                        dateTime={item.at}
                        className="shrink-0 text-sm text-gray-500 dark:text-gray-400"
                      >
                        {formatActivityDate(item.at)}
                      </time>
                    </div>
                    {item.detail ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{item.detail}</p>
                    ) : null}
                    {item.body ? (
                      <p className="mt-1 whitespace-pre-line break-words text-sm text-gray-700 dark:text-gray-200">
                        {item.body}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
            {moreError ? (
              <PortalAlert
                variant="error"
                title="No pudimos cargar más actividad. Intenta de nuevo."
              />
            ) : null}
            {canShowMore ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  loading={loadingMore}
                  onClick={() => void showMore()}
                >
                  Ver más
                </Button>
              </div>
            ) : null}
          </div>
        )
      }
    </RemoteCard>
  );
}

function SubscriberNoteComposer({
  subscriberId,
  onCreated,
}: {
  subscriberId: string;
  onCreated: (note: SubscriberNote) => void;
}) {
  const fieldId = useId();
  const helpId = `${fieldId}-ayuda`;
  const counterId = `${fieldId}-contador`;
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [success, setSuccess] = useState('');
  const trimmed = body.trim();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      const note = await subscribersApi.createNote(subscriberId, { body: trimmed });
      onCreated(note);
      setBody('');
      setSuccess('Nota guardada.');
    } catch (createError) {
      if (createError instanceof ApiError && createError.status === 409) {
        setLocked(true);
      } else if (createError instanceof ApiError && createError.status === 403) {
        setError(NOTE_ERROR_MESSAGES.forbidden);
      } else if (createError instanceof ApiError && createError.status === 400) {
        setError(NOTE_ERROR_MESSAGES.invalid);
      } else {
        setError(NOTE_ERROR_MESSAGES.generic);
      }
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <div className="pb-3">
        <PortalAlert variant="warning" title={NOTE_ERROR_MESSAGES.locked} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-2 border-b border-gray-100 pb-3 dark:border-dark-border"
      aria-label="Agregar nota"
    >
      <label htmlFor={fieldId} className="text-sm font-medium text-gray-900 dark:text-white">
        Nueva nota
      </label>
      <textarea
        id={fieldId}
        value={body}
        maxLength={SUBSCRIBER_NOTE_BODY_MAX_LENGTH}
        rows={3}
        disabled={saving}
        aria-describedby={`${helpId} ${counterId}`}
        className={portalTextareaClassName}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p id={helpId} className="text-sm text-gray-500 dark:text-gray-400">
          No escribas datos sensibles: documentos, contraseñas, datos de salud o de pago. La nota no
          se puede editar después.
        </p>
        <p id={counterId} className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
          {body.length}/{SUBSCRIBER_NOTE_BODY_MAX_LENGTH}
        </p>
      </div>
      {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
      <p
        role="status"
        aria-live="polite"
        className={success ? 'text-sm text-gray-700 dark:text-gray-200' : 'sr-only'}
      >
        {success}
      </p>
      <div className="flex justify-end">
        <Button type="submit" className="min-h-11" loading={saving} disabled={!trimmed}>
          Guardar nota
        </Button>
      </div>
    </form>
  );
}
