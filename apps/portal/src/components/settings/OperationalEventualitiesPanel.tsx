'use client';

import { useEffect, useState } from 'react';
import { Button } from '@iwana/ui';
import {
  wfmApi,
  usersApi,
  type OperationalEventuality,
  type OperationalEventualityType,
  type OperationalEventualityStatus,
  type CreateOperationalEventualityDto,
  type InternalUser,
  type ListUsersResponse,
} from '@/lib/api-client';
import { PortalPanel, PortalEmptyState } from '@/components/shared/portal-ui';

const EVENTUALITY_TYPE_LABELS: Record<OperationalEventualityType, string> = {
  extra_availability: 'Disponibilidad extra',
  operational_block: 'Bloqueo operativo',
  early_entry: 'Entrada anticipada',
  extended_shift: 'Extensión de jornada',
  emergency_response: 'Respuesta a emergencia',
};

const EVENTUALITY_STATUS_LABELS: Record<OperationalEventualityStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
};

const STATUS_BADGE_CLASSES: Record<OperationalEventualityStatus, string> = {
  pending:
    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  confirmed:
    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled:
    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const inputClass =
  'h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';

const selectClass =
  'h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100 appearance-none';

interface EmptyDraft {
  userId: string;
  type: OperationalEventualityType | '';
  startsAt: string;
  endsAt: string;
  reason: string;
  origin: string;
  requiresHrReview: boolean;
}

const EMPTY_DRAFT: EmptyDraft = {
  userId: '',
  type: '',
  startsAt: '',
  endsAt: '',
  reason: '',
  origin: '',
  requiresHrReview: false,
};

interface Props {
  canEdit: boolean;
}

export function OperationalEventualitiesPanel({ canEdit }: Props) {
  const [items, setItems] = useState<OperationalEventuality[]>([]);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<EmptyDraft>(EMPTY_DRAFT);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [itemsRes, usersRes] = await Promise.all([
        wfmApi.operationalEventualities.list(),
        usersApi.list(),
      ]);
      setItems(Array.isArray(itemsRes) ? itemsRes : []);
      const usersData = usersRes as ListUsersResponse | InternalUser[];
      setUsers(
        Array.isArray(usersData) ? usersData : ((usersData as ListUsersResponse).data ?? []),
      );
    } catch {
      setError('No se pudo cargar la información. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }

  function updateDraft<K extends keyof EmptyDraft>(key: K, value: EmptyDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!draft.userId || !draft.type || !draft.startsAt || !draft.endsAt) {
      setError('Completa los campos obligatorios: técnico, tipo, inicio y fin.');
      return;
    }
    if (draft.startsAt >= draft.endsAt) {
      setError('La fecha de inicio debe ser anterior a la fecha de fin.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const dto: CreateOperationalEventualityDto = {
        userId: draft.userId,
        type: draft.type as OperationalEventualityType,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        reason: draft.reason.trim() || null,
        origin: draft.origin.trim() || null,
        requiresHrReview: draft.requiresHrReview,
      };
      const created = await wfmApi.operationalEventualities.create(dto);
      setItems((prev) => [created as OperationalEventuality, ...prev]);
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      setFeedback('Eventualidad registrada.');
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setError('No se pudo registrar la eventualidad.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, status: OperationalEventualityStatus) {
    try {
      const updated = await wfmApi.operationalEventualities.updateStatus(id, { status });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? (updated as OperationalEventuality) : item)),
      );
    } catch {
      setError('No se pudo actualizar el estado.');
    }
  }

  async function handleDelete(id: string) {
    try {
      await wfmApi.operationalEventualities.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError('No se pudo eliminar la eventualidad.');
    }
  }

  function getUserName(userId: string): string {
    const found = users.find((u) => u.id === userId);
    return found
      ? found.firstName && found.lastName
        ? `${found.firstName} ${found.lastName}`
        : (found.email ?? userId)
      : userId;
  }

  function formatDateLocal(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  return (
    <PortalPanel
      title="Eventualidades operativas"
      description="Disponibilidad extra, bloqueos, entradas anticipadas, extensiones de jornada y respuestas a emergencia."
    >
      {feedback && (
        <p className="mb-3 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
          {feedback}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {canEdit && (
        <div className="mb-4">
          {!showForm ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(true)}
              data-testid="add-eventuality-btn"
            >
              + Registrar eventualidad
            </Button>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-surface-2">
              <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Nueva eventualidad operativa
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Técnico *
                  </label>
                  <select
                    className={selectClass}
                    value={draft.userId}
                    onChange={(e) => updateDraft('userId', e.target.value)}
                    data-testid="eventuality-user-select"
                  >
                    <option value="">Selecciona un técnico</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Tipo *
                  </label>
                  <select
                    className={selectClass}
                    value={draft.type}
                    onChange={(e) =>
                      updateDraft('type', e.target.value as OperationalEventualityType | '')
                    }
                    data-testid="eventuality-type-select"
                  >
                    <option value="">Selecciona un tipo</option>
                    {(Object.keys(EVENTUALITY_TYPE_LABELS) as OperationalEventualityType[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {EVENTUALITY_TYPE_LABELS[key]}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Inicio *
                  </label>
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={draft.startsAt}
                    onChange={(e) => updateDraft('startsAt', e.target.value)}
                    data-testid="eventuality-starts-at"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Fin *
                  </label>
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={draft.endsAt}
                    onChange={(e) => updateDraft('endsAt', e.target.value)}
                    data-testid="eventuality-ends-at"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Motivo
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    maxLength={320}
                    value={draft.reason}
                    onChange={(e) => updateDraft('reason', e.target.value)}
                    placeholder="Motivo (opcional)"
                    data-testid="eventuality-reason"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Origen
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    maxLength={80}
                    value={draft.origin}
                    onChange={(e) => updateDraft('origin', e.target.value)}
                    placeholder="Origen (opcional)"
                    data-testid="eventuality-origin"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  id="requires-hr-review"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-iwana-secondary focus:ring-iwana-secondary"
                  checked={draft.requiresHrReview}
                  onChange={(e) => updateDraft('requiresHrReview', e.target.checked)}
                  data-testid="eventuality-requires-hr"
                />
                <label
                  htmlFor="requires-hr-review"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  Requiere revisión de RRHH
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={isSaving}
                  data-testid="save-eventuality-btn"
                >
                  {isSaving ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setDraft(EMPTY_DRAFT);
                    setError(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-400">Cargando eventualidades…</p>
      ) : items.length === 0 ? (
        <PortalEmptyState
          title="Sin eventualidades"
          description="No hay eventualidades operativas registradas."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border">
          <table
            className="min-w-full divide-y divide-gray-200 dark:divide-dark-border"
            data-testid="eventualities-table"
          >
            <thead className="bg-gray-50 dark:bg-dark-surface-2">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Técnico
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Inicio
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Fin
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Estado
                </th>
                {canEdit && (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {getUserName(item.userId)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {EVENTUALITY_TYPE_LABELS[item.type] ?? item.type}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {formatDateLocal(item.startsAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                    {formatDateLocal(item.endsAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={STATUS_BADGE_CLASSES[item.status]}>
                      {EVENTUALITY_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.status === 'pending' && (
                          <>
                            <button
                              className="text-xs font-medium text-green-600 hover:underline dark:text-green-400"
                              onClick={() => void handleUpdateStatus(item.id, 'confirmed')}
                              data-testid={`confirm-eventuality-${item.id}`}
                            >
                              Confirmar
                            </button>
                            <button
                              className="text-xs font-medium text-red-500 hover:underline dark:text-red-400"
                              onClick={() => void handleUpdateStatus(item.id, 'cancelled')}
                              data-testid={`cancel-eventuality-${item.id}`}
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                        {item.status !== 'pending' && (
                          <button
                            className="text-xs font-medium text-gray-400 hover:underline dark:text-gray-500"
                            onClick={() => void handleDelete(item.id)}
                            data-testid={`delete-eventuality-${item.id}`}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}
