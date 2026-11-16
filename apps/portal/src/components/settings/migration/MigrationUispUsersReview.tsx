'use client';

import { useEffect, useId, useMemo, useState } from 'react';
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
import { Users } from 'lucide-react';
import {
  MIGRATION_UISP_USER_STATUSES,
  isMigrationImportableUserRole,
  type MigrationImportableUserRole,
  type MigrationUispUser,
  type MigrationUispUserResolveItem,
  type MigrationUispUserStatus,
  type UserRole,
} from '@iwana/shared';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalFilterChip,
  portalCheckboxClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalFieldClassName,
  portalFilterChipGroupClassName,
  portalSelectTriggerClassName,
  portalWellClassName,
} from '@/components/shared/portal-ui';
import { migrationApi } from '@/lib/api-client';
import { getDefaultOperationalResource, getPortalUserRoleLabel } from '@/lib/user-labels';
import {
  UISP_IMPORTABLE_ROLE_OPTIONS,
  UISP_USERS_MAX_PER_ACTION,
  UISP_USER_STATUS_PRESENTATION,
  uispActivityLabel,
  uispUserDisplayName,
  uispUsersActionErrorMessage,
} from './migration-uisp-users-labels';

type Filter = MigrationUispUserStatus | 'TODOS';
type Dialogs = 'create' | 'discard' | null;
type Busy = 'create' | 'link' | 'discard' | 'invite' | null;

/** Zona táctil de 44 px alrededor de la casilla (WCAG 2.5.8). */
const checkboxHitAreaClassName = 'inline-flex min-h-11 min-w-11 items-center justify-center';

function countCopy(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

interface MigrationUispUsersReviewProps {
  users: MigrationUispUser[];
  hasConnection: boolean;
  /** Se llama tras cada acción para volver a leer la lista. */
  onChanged: () => Promise<void> | void;
}

export function MigrationUispUsersReview({
  users,
  hasConnection,
  onChanged,
}: MigrationUispUsersReviewProps) {
  const baseId = useId();
  const roleId = `${baseId}-rol`;
  const operationalId = `${baseId}-programacion`;
  const [filter, setFilter] = useState<Filter>('PENDIENTE');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [role, setRole] = useState<MigrationImportableUserRole | ''>('');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [nameErrors, setNameErrors] = useState<Record<string, string>>({});
  const [operational, setOperational] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result = { TODOS: users.length } as Record<Filter, number>;
    for (const status of MIGRATION_UISP_USER_STATUSES) {
      result[status] = users.filter((user) => user.status === status).length;
    }
    return result;
  }, [users]);

  const visible = useMemo(
    () => (filter === 'TODOS' ? users : users.filter((user) => user.status === filter)),
    [users, filter],
  );

  // La selección solo guarda filas visibles: al filtrar o recargar se descartan las demás.
  useEffect(() => {
    setSelected((current) => {
      const visibleIds = new Set(visible.map((user) => user.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visible]);

  const selectedRows = visible.filter((user) => selected.has(user.id));
  const pendingRows = selectedRows.filter((user) => user.status === 'PENDIENTE');
  const linkableRows = pendingRows.filter((user) => user.matchedUserId !== null);
  const invitableRows = selectedRows.filter((user) => user.status === 'CREADO');
  const unnamedRows = pendingRows.filter((user) => user.source === 'SIN_DATOS');
  const activeRows = pendingRows.filter((user) => user.isActiveInUisp === true);
  const allVisibleSelected = visible.length > 0 && selectedRows.length === visible.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((user) => user.id)));
  }

  function tooMany(count: number): boolean {
    if (count <= UISP_USERS_MAX_PER_ACTION) return false;
    setError(`Elige máximo ${UISP_USERS_MAX_PER_ACTION} usuarios a la vez.`);
    return true;
  }

  async function run(kind: Exclude<Busy, null>, action: () => Promise<string>) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      setSelected(new Set());
      setNotice(message);
      await onChanged();
    } catch (actionError) {
      setError(
        uispUsersActionErrorMessage(
          actionError,
          'No pudimos completar la acción. Intenta de nuevo.',
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  function openCreate() {
    if (!role || pendingRows.length === 0 || tooMany(pendingRows.length)) return;
    setNameErrors({});
    setOperational(getDefaultOperationalResource(role));
    setDialog('create');
  }

  function confirmCreate() {
    if (!role) return;
    const missing: Record<string, string> = {};
    for (const user of unnamedRows) {
      const value = (names[user.id] ?? '').trim();
      if (value === '') missing[user.id] = 'Escribe un nombre para este usuario.';
      else if (value.length > 120) missing[user.id] = 'Usa máximo 120 caracteres.';
    }
    setNameErrors(missing);
    if (Object.keys(missing).length > 0) return;
    const items: MigrationUispUserResolveItem[] = pendingRows.map((user) => ({
      id: user.id,
      action: 'CREAR',
      role,
      ...(user.source === 'SIN_DATOS' ? { displayName: (names[user.id] ?? '').trim() } : {}),
      ...(user.isActiveInUisp === true ? { isOperationalResource: operational } : {}),
    }));
    setDialog(null);
    void run('create', async () => {
      await migrationApi.resolveUispUsers({ items });
      setNames({});
      return `${countCopy(items.length, 'usuario creado', 'usuarios creados')} sin acceso. Los activos en UISP podrán entrar cuando les envíes la invitación.`;
    });
  }

  function link() {
    if (linkableRows.length === 0 || tooMany(linkableRows.length)) return;
    const skipped = pendingRows.length - linkableRows.length;
    void run('link', async () => {
      await migrationApi.resolveUispUsers({
        items: linkableRows.map((user) => ({ id: user.id, action: 'ENLAZAR' })),
      });
      const base = `${countCopy(linkableRows.length, 'usuario enlazado', 'usuarios enlazados')} con su usuario de iWana.`;
      return skipped > 0
        ? `${base} ${countCopy(skipped, 'seleccionado no tenía', 'seleccionados no tenían')} coincidencia y siguen pendientes.`
        : base;
    });
  }

  function confirmDiscard() {
    setDialog(null);
    const items = pendingRows.map((user) => ({ id: user.id, action: 'DESCARTAR' as const }));
    void run('discard', async () => {
      await migrationApi.resolveUispUsers({ items });
      return `${countCopy(items.length, 'usuario descartado', 'usuarios descartados')}. Lo suyo queda a nombre de quien importó.`;
    });
  }

  function invite() {
    if (invitableRows.length === 0 || tooMany(invitableRows.length)) return;
    void run('invite', async () => {
      const result = await migrationApi.inviteUispUsers(invitableRows.map((user) => user.id));
      const sent =
        result.invitados === 1
          ? 'Enviamos 1 invitación.'
          : `Enviamos ${result.invitados} invitaciones.`;
      return result.omitidos > 0
        ? `${sent} ${countCopy(result.omitidos, 'usuario no la recibió', 'usuarios no la recibieron')}: solo se invita a quien está pendiente de activar y tiene un correo real.`
        : sent;
    });
  }

  if (users.length === 0) {
    return (
      <PortalEmptyState
        embedded
        icon={Users}
        title="Aún no has traído usuarios de UISP"
        description={
          hasConnection
            ? 'Usa «Traer usuarios de UISP» para ver aquí a tu personal y decidir qué hacer con cada uno.'
            : 'Primero registra la conexión con UISP y luego trae a tu personal.'
        }
      />
    );
  }

  const roleLabel = role ? getPortalUserRoleLabel(role) : '';
  const filters: Filter[] = ['PENDIENTE', 'ENLAZADO', 'CREADO', 'DESCARTADO', 'TODOS'];

  return (
    <div className="space-y-4">
      <PortalAlert
        variant="info"
        title="Nadie entra a iWana sin tu invitación"
        description="Los usuarios activos en UISP se crean sin acceso hasta que les envíes la invitación. Los inactivos se crean sin acceso, no aparecen en Programación y no se pueden invitar; si vuelven a trabajar, reactívalos desde Usuarios."
      />

      <div role="group" aria-label="Filtrar por estado" className={portalFilterChipGroupClassName}>
        {filters.map((value) => (
          <PortalFilterChip
            key={value}
            active={filter === value}
            count={counts[value]}
            onClick={() => setFilter(value)}
          >
            {value === 'TODOS' ? 'Todos' : UISP_USER_STATUS_PRESENTATION[value].filterLabel}
          </PortalFilterChip>
        ))}
      </div>

      <div
        role="toolbar"
        aria-label="Acciones con los usuarios seleccionados"
        className={`${portalWellClassName} flex flex-wrap items-end gap-3`}
      >
        <p className="w-full text-sm font-medium text-gray-900 dark:text-white" aria-live="polite">
          {selectedRows.length === 0
            ? 'Selecciona usuarios para crear, enlazar, descartar o invitar.'
            : `${countCopy(selectedRows.length, 'usuario seleccionado', 'usuarios seleccionados')}.`}
        </p>
        <div className="space-y-1">
          <label htmlFor={roleId} className="text-sm font-medium text-gray-900 dark:text-white">
            Rol para crear
          </label>
          <select
            id={roleId}
            value={role}
            disabled={busy !== null}
            className={`${portalSelectTriggerClassName} min-h-11 sm:w-56`}
            onChange={(event) => {
              const value = event.target.value as UserRole | '';
              setRole(value && isMigrationImportableUserRole(value) ? value : '');
            }}
          >
            <option value="">Elige un rol</option>
            {UISP_IMPORTABLE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy !== null || pendingRows.length === 0 || !role}
          loading={busy === 'create'}
          onClick={openCreate}
        >
          Crear{pendingRows.length > 0 ? ` (${pendingRows.length})` : ''}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={busy !== null || linkableRows.length === 0}
          loading={busy === 'link'}
          onClick={link}
        >
          Enlazar{linkableRows.length > 0 ? ` (${linkableRows.length})` : ''}
        </Button>
        <Button
          type="button"
          variant="softDestructive"
          className="min-h-11"
          disabled={busy !== null || pendingRows.length === 0}
          loading={busy === 'discard'}
          onClick={() => {
            if (!tooMany(pendingRows.length)) setDialog('discard');
          }}
        >
          Descartar{pendingRows.length > 0 ? ` (${pendingRows.length})` : ''}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={busy !== null || invitableRows.length === 0}
          loading={busy === 'invite'}
          onClick={invite}
        >
          Enviar invitación{invitableRows.length > 0 ? ` (${invitableRows.length})` : ''}
        </Button>
        {pendingRows.length > 0 && !role ? (
          <p className="w-full text-sm text-gray-600 dark:text-gray-300">
            Para crear, elige primero el rol. Enlazar solo aplica a quien tiene coincidencia en
            iWana.
          </p>
        ) : null}
      </div>

      {notice ? <PortalAlert variant="success" title={notice} /> : null}
      {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}

      {visible.length === 0 ? (
        <PortalEmptyState
          embedded
          icon={Users}
          title={
            filter === 'TODOS'
              ? 'No hay usuarios de UISP'
              : `No hay usuarios en «${UISP_USER_STATUS_PRESENTATION[filter].filterLabel}»`
          }
          description="Cambia el filtro para ver los demás."
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <table className="w-full min-w-[56rem]" aria-busy={busy !== null}>
            <caption className="sr-only">Usuarios de UISP para revisar</caption>
            <thead>
              <tr className={portalDataTableHeadRowClassName}>
                <PortalDataTableHead className="w-12">
                  <label className={checkboxHitAreaClassName}>
                    <input
                      type="checkbox"
                      className={portalCheckboxClassName}
                      aria-label="Seleccionar todos los usuarios visibles"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                    />
                  </label>
                </PortalDataTableHead>
                <PortalDataTableHead>Nombre</PortalDataTableHead>
                <PortalDataTableHead>Correo</PortalDataTableHead>
                <PortalDataTableHead>En UISP</PortalDataTableHead>
                <PortalDataTableHead>Coincidencia en iWana</PortalDataTableHead>
                <PortalDataTableHead className="text-right">Lotes</PortalDataTableHead>
                <PortalDataTableHead>Rol</PortalDataTableHead>
                <PortalDataTableHead>Estado</PortalDataTableHead>
              </tr>
            </thead>
            <tbody className={portalDataTableBodyClassName}>
              {visible.map((user) => {
                const name = uispUserDisplayName(user);
                const status = UISP_USER_STATUS_PRESENTATION[user.status];
                return (
                  <tr
                    key={user.id}
                    className={cn(
                      user.isActiveInUisp === false && portalDataTableInactiveRowClassName,
                    )}
                  >
                    <td className={portalDataTableCellClassName}>
                      <label className={checkboxHitAreaClassName}>
                        <input
                          type="checkbox"
                          className={portalCheckboxClassName}
                          aria-label={`Seleccionar a ${name}`}
                          checked={selected.has(user.id)}
                          onChange={() => toggle(user.id)}
                        />
                      </label>
                    </td>
                    <th
                      scope="row"
                      className={`${portalDataTableCellClassName} text-left font-medium text-gray-900 dark:text-white`}
                    >
                      {name}
                    </th>
                    <td className={`${portalDataTableCellClassName} break-all`}>
                      {user.email ?? 'Sin correo'}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {uispActivityLabel(user.isActiveInUisp)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {user.matchedUserId ? 'Mismo correo' : 'Sin coincidencia'}
                    </td>
                    <td className={`${portalDataTableCellClassName} text-right tabular-nums`}>
                      {user.referencedInBatches}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {user.proposedRole ? getPortalUserRoleLabel(user.proposedRole) : '—'}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialog === 'create'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Crear {countCopy(pendingRows.length, 'usuario', 'usuarios')} como {roleLabel}
            </DialogTitle>
            <DialogDescription>
              Nadie recibe correo ni puede entrar todavía. Los activos en UISP quedan pendientes de
              activar hasta que les envíes la invitación; los inactivos y los que no tienen datos
              quedan inactivos y fuera de Programación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {unnamedRows.length > 0 ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-gray-900 dark:text-white">
                  UISP no trajo el nombre de estos usuarios. Escríbelo para crearlos.
                </legend>
                {unnamedRows.map((user) => {
                  const inputId = `${baseId}-nombre-${user.id}`;
                  const errorId = `${inputId}-error`;
                  return (
                    <div key={user.id} className="space-y-1">
                      <label htmlFor={inputId} className="text-sm text-gray-700 dark:text-gray-200">
                        Nombre para el usuario de UISP n.º {user.uispUserId}
                      </label>
                      <input
                        id={inputId}
                        type="text"
                        autoComplete="off"
                        maxLength={120}
                        value={names[user.id] ?? ''}
                        aria-invalid={nameErrors[user.id] ? true : undefined}
                        aria-describedby={nameErrors[user.id] ? errorId : undefined}
                        className={`${portalFieldClassName} min-h-11`}
                        onChange={(event) =>
                          setNames((current) => ({ ...current, [user.id]: event.target.value }))
                        }
                      />
                      {nameErrors[user.id] ? (
                        <p id={errorId} className="text-sm text-red-700 dark:text-red-300">
                          {nameErrors[user.id]}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            ) : null}
            {activeRows.length > 0 ? (
              <div className="flex items-start gap-3">
                <input
                  id={operationalId}
                  type="checkbox"
                  checked={operational}
                  className={`${portalCheckboxClassName} mt-1`}
                  onChange={(event) => setOperational(event.target.checked)}
                />
                <label htmlFor={operationalId} className="text-sm text-gray-700 dark:text-gray-200">
                  Mostrar en Programación a los activos en UISP (
                  {countCopy(activeRows.length, 'usuario', 'usuarios')})
                </label>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setDialog(null)}
              >
                Cancelar
              </Button>
              <Button type="button" className="min-h-11" onClick={confirmCreate}>
                Crear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'discard'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Descartar {countCopy(pendingRows.length, 'usuario', 'usuarios')} de UISP
            </DialogTitle>
            <DialogDescription>
              No se crea ningún usuario. Los tickets, comentarios y pagos de estas personas quedan a
              nombre de quien importó, y sus datos se borran de esta lista.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              onClick={confirmDiscard}
            >
              Descartar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
