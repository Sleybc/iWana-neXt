'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { UserSearch } from 'lucide-react';
import {
  isMigrationImportableUserRole,
  type MigrationUispUser,
  type UserRole,
} from '@iwana/shared';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSearchField,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { ApiError, migrationApi, usersApi, type InternalUser } from '@/lib/api-client';
import { buildInternalUserLabel } from '@/lib/portal-user-options';
import {
  getPortalUserRoleLabel,
  getPortalUserStatusLabel,
  getPortalUserStatusVariant,
} from '@/lib/user-labels';
import { uispUsersActionErrorMessage } from './migration-uisp-users-labels';

/** Página corta de búsqueda: la persona se encuentra escribiendo, no recorriendo el directorio. */
export const UISP_LINK_SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

type SearchState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; users: InternalUser[]; hasMore: boolean };

interface MigrationUispUserLinkDialogProps {
  /** Fila pendiente a enlazar; `null` cierra el diálogo. */
  row: MigrationUispUser | null;
  onClose: () => void;
  /** Se llama tras enlazar con el nombre visible del usuario de iWana elegido. */
  onLinked: (row: MigrationUispUser, targetLabel: string) => void;
}

/**
 * «Enlazar con…» (2026-11-15): enlaza a mano una fila pendiente de UISP con un usuario de iWana
 * existente, para no duplicar a quien ya tiene cuenta (filas «sin datos» o sin el mismo correo).
 * Solo ofrece personal de la empresa: los roles externos se excluyen con
 * `MIGRATION_IMPORTABLE_USER_ROLES`; la API vuelve a validarlo (`USUARIO_NO_VALIDO`).
 */
export function MigrationUispUserLinkDialog({
  row,
  onClose,
  onLinked,
}: MigrationUispUserLinkDialogProps) {
  const baseId = useId();
  const searchId = `${baseId}-buscar`;
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<InternalUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const open = row !== null;

  // Al abrir otra fila el diálogo arranca limpio.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setChosen(null);
    setSubmitError(null);
  }, [open, row?.id]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    setSearch({ kind: 'loading' });
    const timer = setTimeout(
      () => {
        const term = query.trim();
        usersApi
          .list({ limit: UISP_LINK_SEARCH_LIMIT, ...(term ? { search: term } : {}) })
          .then((response) => {
            if (requestRef.current !== requestId) return;
            setSearch({
              kind: 'ready',
              users: response.data.filter((user) =>
                isMigrationImportableUserRole(user.role as UserRole),
              ),
              hasMore: response.meta.hasMore,
            });
          })
          .catch((error: unknown) => {
            if (requestRef.current !== requestId) return;
            setSearch({
              kind: 'error',
              message:
                error instanceof ApiError && error.status === 403
                  ? 'No tienes acceso a la lista de usuarios de iWana. Pide apoyo a un administrador.'
                  : 'No pudimos buscar usuarios de iWana. Intenta de nuevo.',
            });
          });
      },
      query === '' ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [open, query, attempt]);

  // Foco: el botón de confirmar al elegir; el buscador al volver a la lista.
  useEffect(() => {
    if (!open) return;
    if (chosen) confirmRef.current?.focus();
    else document.getElementById(searchId)?.focus();
  }, [open, chosen, searchId]);

  function close() {
    if (submitting) return;
    onClose();
  }

  async function confirm() {
    if (!row || !chosen) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await migrationApi.resolveUispUsers({
        items: [{ id: row.id, action: 'ENLAZAR', targetUserId: chosen.id }],
      });
      onLinked(row, buildInternalUserLabel(chosen));
    } catch (error) {
      setSubmitError(
        uispUsersActionErrorMessage(error, 'No pudimos enlazar el usuario. Intenta de nuevo.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const uispLabel = row ? `al usuario de UISP n.º ${row.uispUserId}` : '';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enlazar {uispLabel} con un usuario de iWana</DialogTitle>
          {chosen ? null : (
            <DialogDescription>
              Busca a la persona por nombre o correo. Solo aparece el personal de la empresa.
            </DialogDescription>
          )}
        </DialogHeader>

        {chosen ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              El usuario de UISP n.º {row?.uispUserId} se enlazará con{' '}
              <strong className="font-medium text-gray-900 dark:text-white">
                {buildInternalUserLabel(chosen)}
              </strong>
              . Sus tickets y pagos quedarán a su nombre.
            </p>
            {submitError ? (
              <PortalAlert variant="error" live="assertive" title={submitError} />
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={submitting}
                onClick={() => {
                  setSubmitError(null);
                  setChosen(null);
                }}
              >
                Elegir otro
              </Button>
              <Button
                ref={confirmRef}
                type="button"
                className="min-h-11"
                loading={submitting}
                onClick={() => void confirm()}
              >
                Enlazar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <PortalSearchField
              id={searchId}
              label="Buscar usuario de iWana por nombre o correo"
              placeholder="Nombre o correo"
              value={query}
              onChange={setQuery}
            />
            <div aria-live="polite" aria-busy={search.kind === 'loading'}>
              {search.kind === 'loading' ? (
                <div className="space-y-2">
                  <PortalSkeletonBlock className="h-14" />
                  <PortalSkeletonBlock className="h-14" />
                  <PortalSkeletonBlock className="h-14" />
                </div>
              ) : search.kind === 'error' ? (
                <PortalAlert
                  variant="error"
                  title={search.message}
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => setAttempt((value) => value + 1)}
                    >
                      Reintentar
                    </Button>
                  }
                />
              ) : search.users.length === 0 ? (
                <PortalEmptyState
                  embedded
                  icon={UserSearch}
                  title="No encontramos usuarios de iWana con esa búsqueda"
                  description="Revisa el nombre o el correo. Si la persona aún no tiene usuario, cierra y usa Crear."
                />
              ) : (
                <div className="space-y-2">
                  <ul
                    aria-label="Usuarios de iWana encontrados"
                    className="max-h-80 space-y-2 overflow-y-auto"
                  >
                    {search.users.map((user) => {
                      const label = buildInternalUserLabel(user);
                      return (
                        <li key={user.id}>
                          <button
                            type="button"
                            className={cn(
                              'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 text-left hover:bg-iwana-surface-soft dark:border-dark-border dark:hover:bg-dark-surface-3',
                              interactiveFocusClassName,
                            )}
                            onClick={() => setChosen(user)}
                          >
                            <span className="min-w-0">
                              <span className="block font-medium text-gray-900 dark:text-white">
                                {label}
                              </span>
                              <span className="block break-all text-sm text-gray-600 dark:text-gray-300">
                                {user.email} · {getPortalUserRoleLabel(user.role)}
                              </span>
                            </span>
                            <Badge variant={getPortalUserStatusVariant(user.status)}>
                              {getPortalUserStatusLabel(user.status)}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {search.hasMore ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Hay más usuarios. Escribe parte del nombre o del correo para encontrarlo.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" className="min-h-11" onClick={close}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
