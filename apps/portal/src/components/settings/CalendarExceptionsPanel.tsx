'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@iwana/ui';
import {
  organizationApi,
  type OrganizationBusinessHoursExceptionSnapshot,
  type OrganizationSiteSummary,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';
const inputClassName =
  'h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';

function normalizeTime(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 5);
}

interface Props {
  exceptions: OrganizationBusinessHoursExceptionSnapshot[];
  sites: OrganizationSiteSummary[];
  canEdit: boolean;
  onCreated: (exception: OrganizationBusinessHoursExceptionSnapshot) => void;
  onDeleted: (id: string) => void;
}

interface NewExceptionDraft {
  name: string;
  exceptionDate: string;
  isOpen: boolean;
  isRecurring: boolean;
  opensAt: string;
  closesAt: string;
  organizationSiteId: string;
}

const emptyDraft: NewExceptionDraft = {
  name: '',
  exceptionDate: '',
  isOpen: false,
  isRecurring: false,
  opensAt: '',
  closesAt: '',
  organizationSiteId: '',
};

export function CalendarExceptionsPanel({
  exceptions,
  sites,
  canEdit,
  onCreated,
  onDeleted,
}: Props) {
  const [newException, setNewException] = useState<NewExceptionDraft>(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!newException.name.trim() || !newException.exceptionDate) return;

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const created = await organizationApi.createException({
        exceptionDate: newException.exceptionDate,
        name: newException.name.trim(),
        isOpen: newException.isOpen,
        isRecurring: newException.isRecurring,
        opensAt: newException.isOpen ? newException.opensAt || null : null,
        closesAt: newException.isOpen ? newException.closesAt || null : null,
        organizationSiteId: newException.organizationSiteId || null,
      });
      onCreated(created);
      setNewException(emptyDraft);
      setFeedback('Excepción creada correctamente.');
    } catch {
      setError('No fue posible crear la excepción. Intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(globalThis.confirm?.('¿Eliminar esta excepción de horario?') ?? true)) return;

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await organizationApi.deleteException(id);
      onDeleted(id);
      setFeedback('Excepción eliminada.');
    } catch {
      setError('No fue posible eliminar la excepción. Intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PortalPanel
      title="Festivos y cierres especiales"
      description="Fechas concretas en que la atención difiere del horario habitual, por festivos, cierres o aperturas extraordinarias."
    >
      {feedback ? (
        <p className="mb-3 text-sm text-green-700 dark:text-green-400">{feedback}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {/* Formulario de nueva excepción */}
      {canEdit ? (
        <div className="mb-4 rounded-2xl border border-gray-200 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
          <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
            Registrar nueva excepción
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Nombre</label>
              <input
                type="text"
                placeholder="Ej: Día festivo nacional"
                value={newException.name}
                onChange={(e) => setNewException((prev) => ({ ...prev, name: e.target.value }))}
                className={inputClassName}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Fecha</label>
              <input
                type="date"
                value={newException.exceptionDate}
                onChange={(e) =>
                  setNewException((prev) => ({ ...prev, exceptionDate: e.target.value }))
                }
                className={inputClassName}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Sede (opcional)
              </label>
              <select
                value={newException.organizationSiteId}
                onChange={(e) =>
                  setNewException((prev) => ({ ...prev, organizationSiteId: e.target.value }))
                }
                className={inputClassName}
              >
                <option value="">Todas las sedes</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 self-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={newException.isOpen}
                  onChange={(e) =>
                    setNewException((prev) => ({ ...prev, isOpen: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
                />
                Abierto ese día
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={newException.isRecurring}
                  onChange={(e) =>
                    setNewException((prev) => ({ ...prev, isRecurring: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
                />
                Recurrente
              </label>
            </div>
            {newException.isOpen ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Desde</label>
                  <input
                    type="time"
                    value={newException.opensAt}
                    onChange={(e) =>
                      setNewException((prev) => ({ ...prev, opensAt: e.target.value }))
                    }
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Hasta</label>
                  <input
                    type="time"
                    value={newException.closesAt}
                    onChange={(e) =>
                      setNewException((prev) => ({ ...prev, closesAt: e.target.value }))
                    }
                    className={inputClassName}
                  />
                </div>
              </>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={isSaving || !newException.name.trim() || !newException.exceptionDate}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden={true} />
              Agregar excepción
            </Button>
          </div>
        </div>
      ) : null}

      {/* Tabla de excepciones existentes */}
      {exceptions.length === 0 ? (
        <PortalEmptyState
          title="Sin excepciones registradas"
          description="No hay festivos ni cierres especiales registrados para este tenant."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
            <thead className="bg-[#f8faf5] dark:bg-dark-surface-3">
              <tr>
                <th className={tableHeadClass}>Nombre</th>
                <th className={tableHeadClass}>Fecha</th>
                <th className={tableHeadClass}>Estado</th>
                <th className={tableHeadClass}>Sede</th>
                {canEdit ? <th className={tableHeadClass}>Acción</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
              {exceptions.map((exc) => {
                const excSite = exc.organizationSiteId
                  ? sites.find((s) => s.id === exc.organizationSiteId)
                  : null;

                return (
                  <tr key={exc.id}>
                    <td className={cellClass}>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{exc.name}</p>
                        {exc.isRecurring ? (
                          <p className="text-xs text-gray-500">Recurrente anual</p>
                        ) : null}
                      </div>
                    </td>
                    <td className={cellClass}>{exc.exceptionDate}</td>
                    <td className={cellClass}>
                      {exc.isOpen ? (
                        <span className="text-sm text-green-600 dark:text-green-400">
                          Abierto{' '}
                          {exc.opensAt
                            ? `${normalizeTime(exc.opensAt)} – ${normalizeTime(exc.closesAt)}`
                            : ''}
                        </span>
                      ) : (
                        <span className="text-sm text-red-600 dark:text-red-400">Cerrado</span>
                      )}
                    </td>
                    <td className={cellClass}>{excSite ? excSite.name : 'Todas'}</td>
                    {canEdit ? (
                      <td className={cellClass}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(exc.id)}
                          disabled={isSaving}
                        >
                          Eliminar
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}
