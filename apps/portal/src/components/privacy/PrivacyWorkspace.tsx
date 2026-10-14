'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AccessPermissionKey } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { ApiError, privacyApi } from '@/lib/api-client';
import type {
  LegalText,
  LegalTextType,
  PrivacyIncident,
  PrivacyInventory,
  RequestKind,
  RequestStatus,
  RequestSummary,
} from '@iwana/shared';
import { PrivacyRequestDetail } from './PrivacyRequestDetail';
import { RequestForm } from './RequestForm';
import {
  formatCivilDate,
  formatLocalDateTime,
  getPurposeLabel,
  getDueLabel,
  getLabel,
  LEGAL_TEXT_TYPE_LABELS,
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_RIGHTS,
  PRIVACY_REQUEST_STATUSES,
} from './privacy-labels';

type Surface = 'requests' | 'legal' | 'incidents' | 'inventory';

const selectClass =
  'portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white';
const inputClass =
  'portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white';
const textareaClass = `${inputClass} min-h-28`;
const surfaceLabels: Record<Surface, string> = {
  requests: 'Solicitudes',
  legal: 'Textos legales',
  incidents: 'Incidentes',
  inventory: 'Inventario de bases',
};

function readSurface(value: string | null): Surface {
  return value === 'legal' || value === 'incidents' || value === 'inventory' ? value : 'requests';
}

function readRequestKind(value: string | null): RequestKind | '' {
  return PRIVACY_REQUEST_KINDS.find((item) => item.value === value)?.value ?? '';
}

function readRequestStatus(value: string | null): RequestStatus | '' {
  return PRIVACY_REQUEST_STATUSES.find((item) => item.value === value)?.value ?? '';
}

function RequestSummaryCard({ item, onOpen }: { item: RequestSummary; onOpen: () => void }) {
  const due = getDueLabel(item);
  const dueIcon = due.tone === 'error' ? '⚠' : due.tone === 'warning' ? '◷' : '✓';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-[var(--shadow-sm)] transition hover:border-iwana-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iwana-primary dark:border-dark-border dark:bg-dark-surface-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">
            {getLabel(PRIVACY_REQUEST_KINDS, item.kind)} ·{' '}
            {getLabel(PRIVACY_REQUEST_RIGHTS, item.right)}
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Recibida {formatLocalDateTime(item.receivedAt)}
          </p>
        </div>
        <span className="rounded-full border border-gray-200 px-3 py-1 text-sm dark:border-dark-border">
          {getLabel(PRIVACY_REQUEST_STATUSES, item.status)}
        </span>
      </div>
      {item.purpose ? (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Finalidad: {getPurposeLabel(item.purpose)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span
          aria-label={`Vencimiento: ${due.label}`}
          className={
            due.tone === 'error'
              ? 'font-semibold text-red-700 dark:text-red-300'
              : due.tone === 'warning'
                ? 'font-semibold text-amber-800 dark:text-amber-200'
                : 'text-gray-700 dark:text-gray-200'
          }
        >
          <span aria-hidden="true">{dueIcon} </span>
          {due.label}
        </span>
        <span>Fecha límite: {formatCivilDate(item.extendedUntil ?? item.dueAt)}</span>
      </div>
    </button>
  );
}

function RequestsSurface({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const kind = readRequestKind(search.get('kind'));
  const status = readRequestStatus(search.get('status'));
  const dueWithinDays = search.get('dueWithinDays') ?? '';
  const cursor = search.get('cursor') ?? '';
  const page = Math.max(1, Number(search.get('page') ?? '1'));
  const [items, setItems] = useState<RequestSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(search.get('requestId'));
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const previousCursors = useRef<string[]>([]);
  const [filters, setFilters] = useState({ kind, status, dueWithinDays });

  useEffect(() => setFilters({ kind, status, dueWithinDays }), [kind, status, dueWithinDays]);

  const replaceQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
    },
    [pathname, router, search],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await privacyApi.listRequests({
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        ...(dueWithinDays ? { dueWithinDays: Number(dueWithinDays) } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 20,
      });
      setItems(result.data);
      setTotal(result.meta.total);
      setNextCursor(result.meta.nextCursor);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? loadError.message
          : 'No fue posible cargar las solicitudes.',
      );
    } finally {
      setLoading(false);
    }
  }, [cursor, dueWithinDays, kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeFilter = (name: 'kind' | 'status' | 'dueWithinDays', value: string) => {
    if (name === 'kind') {
      const selected = readRequestKind(value);
      setFilters((current) => ({ ...current, kind: selected }));
    } else if (name === 'status') {
      const selected = readRequestStatus(value);
      setFilters((current) => ({ ...current, status: selected }));
    } else {
      setFilters((current) => ({ ...current, dueWithinDays: value }));
    }
    previousCursors.current = [];
    replaceQuery({ [name]: value || null, cursor: null, page: null });
  };
  const openRequest = (id: string) => {
    setSelectedId(id);
    replaceQuery({ requestId: id });
  };

  return (
    <div className="space-y-4">
      <PortalPanel
        title="Solicitudes de datos personales"
        description="Revisa plazos, actuaciones y tareas pendientes."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>Radicar solicitud</Button>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">
            Tipo
            <select
              className={selectClass}
              value={filters.kind}
              onChange={(event) => changeFilter('kind', event.target.value)}
            >
              <option value="">Todos los tipos</option>
              {PRIVACY_REQUEST_KINDS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Estado
            <select
              className={selectClass}
              value={filters.status}
              onChange={(event) => changeFilter('status', event.target.value)}
            >
              <option value="">Todos los estados</option>
              {PRIVACY_REQUEST_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            Vencimiento
            <select
              className={selectClass}
              value={filters.dueWithinDays}
              onChange={(event) => changeFilter('dueWithinDays', event.target.value)}
            >
              <option value="">Cualquier fecha</option>
              <option value="2">En los próximos 2 días hábiles</option>
            </select>
          </label>
        </div>
      </PortalPanel>

      {creationNotice ? (
        <PortalAlert variant="success" title="Solicitud registrada" description={creationNotice} />
      ) : null}

      <div className="space-y-3" aria-busy={loading}>
        {loading && items.length === 0 ? (
          <div className="space-y-3" role="status">
            <span className="sr-only">Cargando solicitudes</span>
            <PortalSkeletonBlock className="h-32" />
            <PortalSkeletonBlock className="h-32" />
            <PortalSkeletonBlock className="h-32" />
          </div>
        ) : null}
        {error ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar las solicitudes"
            description={error}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <PortalEmptyState
            title={
              kind || status || dueWithinDays
                ? 'No hay solicitudes con estos filtros'
                : 'Aún no hay solicitudes'
            }
            description={
              kind || status || dueWithinDays
                ? 'Limpia los filtros para revisar todas las solicitudes.'
                : 'Las solicitudes radicadas aparecerán aquí con su fecha límite.'
            }
            action={
              kind || status || dueWithinDays ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    previousCursors.current = [];
                    replaceQuery({
                      kind: null,
                      status: null,
                      dueWithinDays: null,
                      cursor: null,
                      page: null,
                    });
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : null
            }
          />
        ) : null}
        {items.map((item) => (
          <RequestSummaryCard key={item.id} item={item} onOpen={() => openRequest(item.id)} />
        ))}
        {items.length ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm dark:bg-dark-surface-2">
            <p role="status">
              Página {page} · {total} solicitudes en total
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1 || loading}
                onClick={() => {
                  const previous = previousCursors.current.pop() ?? null;
                  replaceQuery({ cursor: previous, page: page > 2 ? String(page - 1) : null });
                }}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={!nextCursor || loading}
                onClick={() => {
                  if (!nextCursor) return;
                  previousCursors.current.push(cursor || '');
                  replaceQuery({ cursor: nextCursor, page: String(page + 1) });
                }}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <RequestForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id, outcome) => {
          setCreateOpen(false);
          void load();
          setSelectedId(id);
          setCreationNotice(
            outcome.submittedKind === 'SUPLANTACION' && outcome.registeredKind === 'SUPLANTACION'
              ? `El reporte quedó registrado. ${outcome.suspendedContractCount} contratos impugnados fueron confirmados como suspendidos.`
              : outcome.submittedKind === 'SUPLANTACION'
                ? 'Sin contratos impugnados, el caso quedó registrado como reclamo.'
                : 'La solicitud quedó en la bandeja con su fecha límite.',
          );
        }}
        allowImpersonation={false}
      />
      <PrivacyRequestDetail
        requestId={selectedId}
        open={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null);
          replaceQuery({ requestId: null });
        }}
        canManage={canManage}
        onChanged={() => void load()}
      />
    </div>
  );
}

function LegalTextsSurface() {
  const [texts, setTexts] = useState<LegalText[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<LegalTextType>('AUTORIZACION');
  const [version, setVersion] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<LegalText | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTexts(await privacyApi.listLegalTexts());
    } catch {
      setError('No fue posible cargar los textos legales.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await privacyApi.createLegalText({
        type,
        version: version.trim(),
        content,
        url: url.trim() || null,
      });
      setCreating(false);
      setVersion('');
      setContent('');
      setUrl('');
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof ApiError ? saveError.message : 'No fue posible publicar el texto.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PortalPanel
        title="Textos legales"
        description="Las versiones publicadas son inmutables. Para corregir una, publica otra versión."
        actions={
          <Button onClick={() => setCreating((open) => !open)}>
            {creating ? 'Cancelar' : 'Crear nueva versión'}
          </Button>
        }
      >
        {error ? (
          <PortalAlert variant="error" title="No se completó la operación" description={error} />
        ) : null}
        {creating ? (
          <div className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <label className="block space-y-1 text-sm font-medium">
              Tipo
              <select
                className={selectClass}
                value={type}
                onChange={(event) => setType(event.target.value as LegalTextType)}
              >
                {Object.entries(LEGAL_TEXT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Versión
              <input
                className={inputClass}
                maxLength={32}
                value={version}
                onChange={(event) => setVersion(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Contenido
              <textarea
                className={textareaClass}
                maxLength={200000}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Enlace opcional
              <input
                className={inputClass}
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Al publicar, el tipo, la versión y el contenido quedan inmutables.
            </p>
            <Button
              disabled={saving || !version.trim() || !content.trim()}
              onClick={() => void save()}
            >
              {saving ? 'Publicando…' : 'Publicar versión'}
            </Button>
          </div>
        ) : null}
        {loading ? (
          <PortalSkeletonBlock className="h-40" />
        ) : texts.length ? (
          <div className="space-y-2">
            {texts.map((text) => (
              <button
                key={text.id}
                type="button"
                onClick={() => setSelected(text)}
                className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3 text-left dark:border-dark-border"
              >
                <span>
                  <strong>{LEGAL_TEXT_TYPE_LABELS[text.type]}</strong> · versión {text.version}
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-300">
                    {formatLocalDateTime(text.publishedAt)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {text.isCurrent ? (
                    <span className="rounded-full bg-iwana-secondary/10 px-3 py-1 text-sm font-semibold text-iwana-secondary-700 dark:text-iwana-secondary-300">
                      Vigente
                    </span>
                  ) : null}
                  <code className="text-xs">{text.sha256.slice(0, 12)}…</code>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <PortalEmptyState
            title="No hay textos publicados"
            description="Publica una versión para habilitar la captura de autorizaciones."
          />
        )}
      </PortalPanel>
      {selected ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-text-detail-title"
          className="fixed inset-0 z-(--z-modal) overflow-y-auto bg-black/40 p-4"
        >
          <section className="mx-auto my-8 max-w-3xl space-y-4 rounded-2xl bg-white p-6 dark:bg-dark-surface-2">
            <h2 id="legal-text-detail-title" className="text-lg font-semibold">
              {LEGAL_TEXT_TYPE_LABELS[selected.type]} · versión {selected.version}
            </h2>
            <p className="text-sm">
              SHA-256: <code className="break-all">{selected.sha256}</code>
            </p>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-iwana-surface-soft p-4 text-sm dark:bg-dark-surface-3">
              {selected.content}
            </pre>
            {selected.url ? (
              <a href={selected.url} target="_blank" rel="noreferrer" className="text-sm underline">
                Abrir enlace del texto
              </a>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function IncidentsSurface() {
  const [items, setItems] = useState<PrivacyIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState('');
  const [reported, setReported] = useState<PrivacyIncident | null>(null);
  const [reportedAt, setReportedAt] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await privacyApi.listIncidents());
    } catch {
      setError('No fue posible cargar los incidentes.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const submitIncident = async () => {
    setSaving(true);
    setError(null);
    try {
      await privacyApi.createIncident({
        description: description.trim(),
        affectedCategories: categories
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      });
      setDescription('');
      setCategories('');
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No fue posible registrar el incidente.',
      );
    } finally {
      setSaving(false);
    }
  };
  const markReported = async () => {
    if (!reported) return;
    setSaving(true);
    setError(null);
    try {
      await privacyApi.reportIncident(reported.id, {
        reportedAt,
        externalReference: externalReference.trim(),
      });
      setReported(null);
      setExternalReference('');
      setReportedAt('');
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No fue posible marcar el incidente como reportado.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PortalPanel
        title="Incidentes de datos personales"
        description="Registra incidentes y controla el plazo para informar a la SIC."
      >
        {error ? (
          <PortalAlert variant="error" title="No se completó la operación" description={error} />
        ) : null}
        <div className="grid gap-3">
          <label className="block space-y-1 text-sm font-medium">
            Descripción
            <textarea
              className={textareaClass}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Categorías afectadas{' '}
            <span className="font-normal text-gray-600">(separadas por coma)</span>
            <input
              className={inputClass}
              value={categories}
              onChange={(event) => setCategories(event.target.value)}
            />
          </label>
          <Button
            className="justify-self-start"
            disabled={saving || !description.trim() || !categories.trim()}
            onClick={() => void submitIncident()}
          >
            {saving ? 'Registrando…' : 'Registrar incidente'}
          </Button>
        </div>
      </PortalPanel>
      <PortalPanel title="Incidentes registrados">
        {loading ? (
          <PortalSkeletonBlock className="h-40" />
        ) : items.length ? (
          <div className="space-y-3">
            {items.map((incident) => (
              <article
                key={incident.id}
                className="rounded-xl border border-gray-200 p-4 dark:border-dark-border"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      Incidente detectado {formatLocalDateTime(incident.detectedAt)}
                    </h3>
                    <p className="mt-1 text-sm">
                      Vencimiento para informar a la SIC: {formatCivilDate(incident.sicReportDueAt)}
                    </p>
                    <p className="mt-1 text-sm">
                      Categorías: {incident.affectedCategories.join(', ')}
                    </p>
                  </div>
                  <span className="text-sm font-medium">
                    {incident.reportedAt
                      ? `Reportado el ${formatCivilDate(incident.reportedAt)}`
                      : 'Pendiente de reporte'}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                  {incident.description}
                </p>
                {!incident.reportedAt ? (
                  <Button
                    className="mt-3"
                    variant="secondary"
                    onClick={() => {
                      setReported(incident);
                      setReportedAt(
                        new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }),
                      );
                    }}
                  >
                    Marcar como reportado
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <PortalEmptyState
            title="No hay incidentes registrados"
            description="Los incidentes aparecerán aquí para dar seguimiento a su reporte."
          />
        )}
      </PortalPanel>
      {reported ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-incident-title"
          className="fixed inset-0 z-(--z-modal) grid place-items-center bg-black/40 p-4"
        >
          <section className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 dark:bg-dark-surface-2">
            <h2 id="report-incident-title" className="text-lg font-semibold">
              Marcar como reportado
            </h2>
            <label className="block space-y-1 text-sm font-medium">
              Fecha del reporte
              <input
                className={inputClass}
                type="date"
                value={reportedAt}
                onChange={(event) => setReportedAt(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Referencia externa
              <input
                className={inputClass}
                maxLength={100}
                value={externalReference}
                onChange={(event) => setExternalReference(event.target.value)}
              />
            </label>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Esta acción registra el reporte realizado. No envía una notificación a la SIC desde
              iWana y no se puede repetir.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReported(null)}>
                Cancelar
              </Button>
              <Button
                disabled={saving || !reportedAt || !externalReference.trim()}
                onClick={() => void markReported()}
              >
                {saving ? 'Guardando…' : 'Confirmar reporte'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const INVENTORY_LABELS: Record<string, string> = {
  CLIENTES: 'Clientes',
  PROSPECTOS: 'Prospectos',
  PROVEEDORES: 'Proveedores',
  USUARIOS_SISTEMA: 'Usuarios del sistema',
};
function InventorySurface() {
  const [inventory, setInventory] = useState<PrivacyInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setInventory(await privacyApi.getInventory());
    } catch {
      setError('No fue posible cargar la declaración del inventario.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <PortalPanel
      title="Inventario de bases de datos"
      description="Declaración de las bases, finalidades, retención y medidas de seguridad."
      actions={
        inventory ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Generado {formatLocalDateTime(inventory.generatedAt)}
          </p>
        ) : null
      }
    >
      {loading ? (
        <PortalSkeletonBlock className="h-60" />
      ) : error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el inventario"
          description={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      ) : inventory?.databases.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {inventory.databases.map((database) => (
            <article
              key={database.key}
              className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
            >
              <h3 className="text-base font-semibold">{INVENTORY_LABELS[database.key]}</h3>
              <div>
                <h4 className="text-sm font-medium">Categorías de datos</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {database.categories.join(', ') || 'Sin categorías declaradas'}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Finalidades</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {database.purposes.map(getPurposeLabel).join(', ') ||
                    'Sin finalidades declaradas'}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium">Retención</h4>
                <ul className="text-sm text-gray-600 dark:text-gray-300">
                  {database.retention.map((retention) => (
                    <li key={retention.category}>
                      {retention.category}: {retention.years} años
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm">
                Datos sensibles: {database.hasSensitiveData ? 'Sí' : 'No declarados'}
              </p>
              <p className="text-sm">Transferencias internacionales: Sin declaración registrada</p>
              <div>
                <h4 className="text-sm font-medium">Medidas de seguridad</h4>
                <ul className="list-inside list-disc text-sm text-gray-600 dark:text-gray-300">
                  {database.securityMeasures.map((measure) => (
                    <li key={measure}>{measure}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <PortalEmptyState
          title="No hay declaración disponible"
          description="El inventario aparecerá aquí cuando la API publique su declaración."
        />
      )}
    </PortalPanel>
  );
}

export function PrivacyWorkspace() {
  const { status: permissionsStatus, hasPermission } = usePermissions();
  const canRead = hasPermission(AccessPermissionKey.PRIVACY_READ);
  const canManage = hasPermission(AccessPermissionKey.PRIVACY_MANAGE);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const surface = readSurface(search.get('view'));
  const tabs = useMemo(
    () =>
      canManage
        ? (Object.entries(surfaceLabels) as Array<[Surface, string]>)
        : [['requests', 'Solicitudes'] as [Surface, string]],
    [canManage],
  );

  const setSurface = (next: Surface) => {
    const query = new URLSearchParams(search.toString());
    if (next === 'requests') query.delete('view');
    else query.set('view', next);
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
  };

  if (permissionsStatus === 'loading')
    return (
      <div className="space-y-4" aria-busy="true">
        <PortalSkeletonBlock className="h-20" />
        <PortalSkeletonBlock className="h-72" />
      </div>
    );
  if (!canRead)
    return (
      <PortalAlert
        variant="warning"
        title="No tienes acceso a privacidad"
        description="Solicita a una persona administradora el acceso a las solicitudes de datos personales."
      />
    );

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        title="Privacidad"
        subtitle="Atiende solicitudes de datos personales y administra el cumplimiento."
      />
      {canManage ? (
        <nav aria-label="Secciones de privacidad" className="flex flex-wrap gap-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={surface === id ? 'page' : undefined}
              onClick={() => setSurface(id)}
              className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iwana-primary ${surface === id ? 'bg-iwana-primary text-white' : 'border border-gray-200 bg-white text-gray-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}
      {surface === 'requests' ? <RequestsSurface canManage={canManage} /> : null}
      {surface === 'legal' && canManage ? <LegalTextsSurface /> : null}
      {surface === 'incidents' && canManage ? <IncidentsSurface /> : null}
      {surface === 'inventory' && canManage ? <InventorySurface /> : null}
    </div>
  );
}
