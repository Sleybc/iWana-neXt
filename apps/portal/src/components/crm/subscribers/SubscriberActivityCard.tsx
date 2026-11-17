'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button, Input } from '@iwana/ui';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import {
  AccessPermissionKey,
  SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
  type BillingAccountStatement,
  type LifecycleChangeRecord,
  type SubscriberNote,
} from '@iwana/shared';
import { ApiError, subscribersApi, type AssuranceTicket, type Contract } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PortalAlert, PortalEmptyState, PortalFilterChip } from '@/components/shared/portal-ui';
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

const ACTIVITY_PAGE_SIZE = 5;
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
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const pageRevision = useRef(0);

  useEffect(() => {
    pageRevision.current += 1;
    setExtraLifecycle([]);
    setExtraNotes([]);
    setCursors(load.data?.cursors ?? null);
    setPage(1);
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
  const start = (page - 1) * ACTIVITY_PAGE_SIZE;
  const end = start + ACTIVITY_PAGE_SIZE;
  const visible = filtered.slice(start, end);
  const pendingSources = (Object.keys(cursors ?? {}) as PagedKey[]).filter(
    (key) =>
      cursors?.[key].hasMore &&
      (filter === 'todas' || filter === (key === 'lifecycle' ? 'servicio' : 'nota')),
  );
  const hasNextPage = filtered.length > end || pendingSources.length > 0;

  function resetPage() {
    pageRevision.current += 1;
    setPage(1);
    setMoreError(false);
  }

  async function nextPage() {
    const revision = pageRevision.current;
    setMoreError(false);
    const lastOnNextPage = filtered[end + ACTIVITY_PAGE_SIZE - 1];
    // Trae la fuente antes de mostrar filas más antiguas que su última entrada cargada.
    const sourcesToLoad = pendingSources.filter((key) => {
      const kind = key === 'lifecycle' ? 'servicio' : 'nota';
      const lastFromSource = filtered.filter((item) => item.kind === kind).at(-1);
      return (
        !lastOnNextPage ||
        !lastFromSource ||
        sortActivity([lastFromSource, lastOnNextPage])[0] === lastFromSource
      );
    });
    if (sourcesToLoad.length > 0 && cursors) {
      setLoadingMore(true);
      try {
        const next = { ...cursors };
        const responses = await Promise.all(
          sourcesToLoad.map(async (key) => {
            const params = { page: cursors[key].page + 1, limit: REMOTE_PAGE_LIMIT };
            return key === 'lifecycle'
              ? {
                  key,
                  params,
                  response: await subscribersApi.lifecycleChanges(subscriberId, params),
                }
              : { key, params, response: await subscribersApi.listNotes(subscriberId, params) };
          }),
        );
        let hasNextRow = filtered.length > end;
        const loadedKeys = new Set(filtered.map((item) => item.key));
        for (const { key, params, response } of responses) {
          next[key] = { page: params.page, hasMore: response.meta.hasMore };
          if (key === 'lifecycle') {
            setExtraLifecycle((prev) => [...prev, ...response.data]);
            hasNextRow ||= response.data.some(
              (record) => !loadedKeys.has(lifecycleToActivity(record, contracts, anonymized).key),
            );
          } else {
            setExtraNotes((prev) => [...prev, ...response.data]);
            hasNextRow ||= response.data.some((note) => !loadedKeys.has(noteToActivity(note).key));
          }
        }
        setCursors(next);
        if (!hasNextRow) return;
      } catch {
        setMoreError(true);
        return;
      } finally {
        setLoadingMore(false);
      }
    }
    if (revision === pageRevision.current) setPage(page + 1);
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
            onCreated={(note) => {
              setExtraNotes((prev) => [note, ...prev]);
              resetPage();
            }}
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
                    disabled={loadingMore}
                    onClick={load.reload}
                  >
                    Reintentar
                  </Button>
                }
              />
            ) : null}
            <fieldset
              aria-label="Filtrar actividad por tipo"
              className="flex flex-wrap gap-2"
              disabled={loadingMore}
            >
              <PortalFilterChip
                active={filter === 'todas'}
                className="min-h-11 sm:min-h-0"
                onClick={() => {
                  setFilter('todas');
                  resetPage();
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
                    resetPage();
                  }}
                >
                  {ACTIVITY_KIND_LABELS[kind]}
                </PortalFilterChip>
              ))}
            </fieldset>
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
                className="divide-y divide-gray-100 text-xs dark:divide-dark-border"
              >
                {visible.map((item) => (
                  <li key={item.key} className="py-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="min-w-0 break-words font-medium text-gray-900 dark:text-white">
                        {item.title}
                      </p>
                      <time dateTime={item.at} className="text-gray-600 dark:text-gray-400">
                        {formatActivityDate(item.at)}
                      </time>
                    </div>
                    {item.detail ? (
                      <p className="text-gray-600 dark:text-gray-400">{item.detail}</p>
                    ) : null}
                    {item.body ? (
                      <p className="mt-1 whitespace-pre-line break-words text-gray-700 dark:text-gray-200">
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
            {page > 1 || hasNextPage ? (
              <nav
                aria-label="Paginación de actividad"
                className="flex flex-wrap items-center justify-end gap-x-2 border-t border-gray-100 pt-2 dark:border-dark-border"
              >
                <span
                  role="status"
                  className="text-xs tabular-nums text-gray-600 dark:text-gray-400"
                >
                  {visible.length > 0 ? `Registros ${start + 1}–${start + visible.length}` : null}
                  {pendingSources.length === 0 ? ` de ${filtered.length}` : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Página anterior"
                  disabled={page === 1 || loadingMore}
                  onClick={() => {
                    setMoreError(false);
                    setPage((value) => value - 1);
                  }}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label="Página siguiente"
                  disabled={!hasNextPage}
                  loading={loadingMore}
                  onClick={() => void nextPage()}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </nav>
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
      <div className="flex items-end gap-2">
        <Input
          id={fieldId}
          type="text"
          label="Nueva nota"
          value={body}
          maxLength={SUBSCRIBER_NOTE_BODY_MAX_LENGTH}
          disabled={saving}
          aria-describedby={`${helpId} ${counterId}`}
          className="h-11"
          containerClassName="min-w-0 flex-1"
          onChange={(event) => setBody(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          className="h-11 shrink-0"
          loading={saving}
          disabled={!trimmed}
        >
          Guardar nota
        </Button>
      </div>
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
    </form>
  );
}
