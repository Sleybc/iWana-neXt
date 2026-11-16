'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@iwana/ui';
import { Download } from 'lucide-react';
import type {
  MigrationSourceConnection,
  MigrationUispUser,
  MigrationUispUsersListMeta,
} from '@iwana/shared';
import { PortalAlert, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { migrationApi } from '@/lib/api-client';
import { formatMigrationDate, migrationErrorMessage } from './migration-labels';
import {
  UISP_USERS_FETCH_MAX_POLLS,
  UISP_USERS_SECTION_ID,
  uispConnectionErrorMessage,
  uispFetchFailureMessage,
} from './migration-uisp-users-labels';
import { MigrationUispConnectionPanel } from './MigrationUispConnectionPanel';
import { MigrationUispUsersReview } from './MigrationUispUsersReview';
import { MIGRATION_POLL_INTERVAL_MS } from './useMigrationAccess';

interface FetchBaseline {
  lastFetchedAt: string | null;
  lastCheckedAt: string | null;
  polls: number;
}

type FetchOutcome = { kind: 'success' | 'error' | 'timeout'; message: string };

/**
 * Configuración → Importaciones → «Usuarios de UISP» (spec 2026-11-15 «usuarios» §2.1–§2.4):
 * conexión, lectura en segundo plano con sondeo y lista de revisión.
 */
export function MigrationUispUsersSection() {
  const [connection, setConnection] = useState<MigrationSourceConnection | null | undefined>(
    undefined,
  );
  const [users, setUsers] = useState<MigrationUispUser[] | null>(null);
  const [meta, setMeta] = useState<MigrationUispUsersListMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [outcome, setOutcome] = useState<FetchOutcome | null>(null);
  const baseline = useRef<FetchBaseline | null>(null);

  const loadConnection = useCallback(async () => {
    const next = await migrationApi.getUispConnection();
    setConnection(next ?? null);
    return next ?? null;
  }, []);

  const loadUsers = useCallback(async () => {
    const response = await migrationApi.listUispUsers();
    setUsers(response.data);
    setMeta(response.meta);
    return response;
  }, []);

  const load = useCallback(async () => {
    try {
      await Promise.all([loadConnection(), loadUsers()]);
      setLoadError(null);
    } catch (error) {
      setLoadError(migrationErrorMessage(error, 'No pudimos cargar los usuarios de UISP.'));
    }
  }, [loadConnection, loadUsers]);

  useEffect(() => {
    void load();
  }, [load]);

  const finish = useCallback((result: FetchOutcome) => {
    baseline.current = null;
    setFetching(false);
    setOutcome(result);
  }, []);

  const poll = useCallback(async () => {
    const current = baseline.current;
    if (!current) return;
    current.polls += 1;
    try {
      const [nextConnection, list] = await Promise.all([loadConnection(), loadUsers()]);
      if (list.meta.lastFetchedAt !== current.lastFetchedAt) {
        finish({
          kind: 'success',
          message: `Lista actualizada: ${list.meta.total === 1 ? '1 usuario' : `${list.meta.total} usuarios`} de UISP.`,
        });
        return;
      }
      // Si alguien retiró la conexión mientras se leía, la lectura no tiene dónde terminar.
      if (!nextConnection) {
        finish({
          kind: 'error',
          message:
            'La conexión con UISP se retiró antes de terminar. Configúrala de nuevo para traer usuarios.',
        });
        return;
      }
      // La lectura registra el resultado en la conexión al terminar, también si no escribió filas.
      if (nextConnection.lastCheckedAt !== current.lastCheckedAt) {
        finish(
          nextConnection.lastCheckResult === 'OK'
            ? { kind: 'success', message: 'Lectura terminada: no hubo cambios en la lista.' }
            : { kind: 'error', message: uispFetchFailureMessage(nextConnection.lastCheckResult) },
        );
        return;
      }
    } catch {
      // Un fallo puntual de lectura no corta el sondeo; el tope lo cierra.
    }
    if (current.polls >= UISP_USERS_FETCH_MAX_POLLS) {
      finish({
        kind: 'timeout',
        message:
          'La lectura está tardando más de lo normal. Actualiza la lista en unos minutos para ver el resultado.',
      });
    }
  }, [finish, loadConnection, loadUsers]);

  useEffect(() => {
    if (!fetching) return;
    const timer = setInterval(() => void poll(), MIGRATION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetching, poll]);

  async function startFetch() {
    setOutcome(null);
    try {
      await migrationApi.fetchUispUsers();
      baseline.current = {
        lastFetchedAt: meta?.lastFetchedAt ?? null,
        lastCheckedAt: connection?.lastCheckedAt ?? null,
        polls: 0,
      };
      setFetching(true);
    } catch (error) {
      setOutcome({
        kind: 'error',
        message: uispConnectionErrorMessage(error, 'No pudimos empezar a traer los usuarios.'),
      });
    }
  }

  if (connection === undefined && !loadError) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PortalSkeletonBlock className="h-40" />
        <PortalSkeletonBlock className="h-56" />
      </div>
    );
  }

  const retry = (
    <Button type="button" variant="secondary" onClick={() => void load()}>
      Reintentar
    </Button>
  );

  return (
    <>
      {connection !== undefined ? (
        <MigrationUispConnectionPanel
          connection={connection}
          onChange={setConnection}
          onReload={() => void loadConnection().catch(() => undefined)}
        />
      ) : null}

      <PortalPanel
        id={UISP_USERS_SECTION_ID}
        title="Usuarios de UISP"
        description={
          meta?.lastFetchedAt
            ? `Trae a tu personal de UISP para que los tickets, comentarios y pagos importados queden a nombre de quien los atendió. Última lectura: ${formatMigrationDate(meta.lastFetchedAt)}`
            : 'Trae a tu personal de UISP para que los tickets, comentarios y pagos importados queden a nombre de quien los atendió.'
        }
        labelled
        actions={
          <Button
            type="button"
            className="min-h-11"
            disabled={!connection || fetching}
            loading={fetching}
            onClick={() => void startFetch()}
          >
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            Traer usuarios de UISP
          </Button>
        }
      >
        <div className="space-y-4">
          <p role="status" aria-live="polite" className="text-sm text-gray-700 dark:text-gray-200">
            {fetching ? 'Trayendo usuarios… La lista se actualiza sola.' : ''}
          </p>
          {outcome ? (
            <PortalAlert
              variant={
                outcome.kind === 'success'
                  ? 'success'
                  : outcome.kind === 'timeout'
                    ? 'warning'
                    : 'error'
              }
              live={outcome.kind === 'error' ? 'assertive' : 'polite'}
              title={outcome.message}
              action={
                outcome.kind === 'timeout' ? (
                  <Button type="button" variant="secondary" onClick={() => void load()}>
                    Actualizar lista
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {loadError ? (
            <PortalAlert variant="error" title={loadError} action={retry} />
          ) : users === null ? (
            <div aria-busy="true" className="space-y-2">
              <PortalSkeletonBlock className="h-14" />
              <PortalSkeletonBlock className="h-14" />
            </div>
          ) : (
            <MigrationUispUsersReview
              users={users}
              hasConnection={Boolean(connection)}
              onChanged={() => load()}
            />
          )}
        </div>
      </PortalPanel>
    </>
  );
}
