'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import { Tags } from 'lucide-react';
import {
  AccessPermissionKey,
  SUBSCRIBER_TAG_CATALOG_MAX,
  SUBSCRIBER_TAG_COLOR_PATTERN,
  SUBSCRIBER_TAG_NAME_MAX_LENGTH,
  UserRole,
  type SubscriberTag,
} from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { subscriberTagsApi } from '@/lib/api-client';
import { SubscriberTagChip } from '@/components/crm/subscribers/tags/SubscriberTagChips';
import {
  SUBSCRIBER_TAG_DEFAULT_COLOR,
  subscriberTagErrorMessage,
} from '@/components/crm/subscribers/tags/subscriber-tag-ui';

const PAGE_TITLE = 'Etiquetas de suscriptor';
const PAGE_SUBTITLE =
  'Marca a tus suscriptores con etiquetas propias para encontrarlos y filtrarlos en la lista.';

interface TagDraft {
  name: string;
  color: string;
}

function validateDraft(draft: TagDraft): string | null {
  const name = draft.name.trim();
  if (!name) return 'Escribe el nombre de la etiqueta.';
  if (name.length > SUBSCRIBER_TAG_NAME_MAX_LENGTH) {
    return `El nombre admite máximo ${SUBSCRIBER_TAG_NAME_MAX_LENGTH} caracteres.`;
  }
  if (!SUBSCRIBER_TAG_COLOR_PATTERN.test(draft.color)) {
    return 'Escribe el color con el formato #RRGGBB, por ejemplo #2563EB.';
  }
  return null;
}

function assignedCopy(count: number): string {
  return count === 1 ? '1 suscriptor' : `${count} suscriptores`;
}

interface TagFieldsProps {
  idPrefix: string;
  draft: TagDraft;
  disabled: boolean;
  onChange: (draft: TagDraft) => void;
}

/** Nombre, selector de color y su valor hexadecimal editable. */
function TagFields({ idPrefix, draft, disabled, onChange }: TagFieldsProps) {
  const colorValid = SUBSCRIBER_TAG_COLOR_PATTERN.test(draft.color);
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_8rem] sm:items-end">
      <Input
        id={`${idPrefix}-name`}
        label="Nombre"
        value={draft.name}
        maxLength={SUBSCRIBER_TAG_NAME_MAX_LENGTH}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
      <div className="space-y-1">
        <label
          htmlFor={`${idPrefix}-color`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          Color
        </label>
        <input
          id={`${idPrefix}-color`}
          type="color"
          value={colorValid ? draft.color : SUBSCRIBER_TAG_DEFAULT_COLOR}
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, color: event.target.value.toUpperCase() })}
          className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3"
        />
      </div>
      <Input
        id={`${idPrefix}-hex`}
        label="Código de color"
        value={draft.color}
        maxLength={7}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, color: event.target.value.toUpperCase() })}
      />
    </div>
  );
}

function CreateTagForm({
  disabled,
  onCreated,
}: {
  disabled: boolean;
  onCreated: (tag: SubscriberTag) => void;
}) {
  const idPrefix = useId();
  const [draft, setDraft] = useState<TagDraft>({ name: '', color: SUBSCRIBER_TAG_DEFAULT_COLOR });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateDraft(draft);
    setSuccess('');
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await subscriberTagsApi.create({
        name: draft.name.trim(),
        color: draft.color,
      });
      onCreated(created);
      setDraft({ name: '', color: draft.color });
      setSuccess(`Etiqueta «${created.name}» creada.`);
    } catch (createError) {
      setError(subscriberTagErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label="Nueva etiqueta"
      className="space-y-3"
    >
      <TagFields
        idPrefix={idPrefix}
        draft={draft}
        disabled={saving || disabled}
        onChange={setDraft}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving || disabled} className="min-h-11">
          {saving ? 'Creando…' : 'Crear etiqueta'}
        </Button>
        {draft.name.trim() && SUBSCRIBER_TAG_COLOR_PATTERN.test(draft.color) ? (
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Vista previa:{' '}
            <SubscriberTagChip tag={{ name: draft.name.trim(), color: draft.color }} />
          </span>
        ) : null}
      </div>
      {disabled ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Llegaste al máximo de {SUBSCRIBER_TAG_CATALOG_MAX} etiquetas.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      ) : null}
    </form>
  );
}

function TagRow({
  tag,
  canManage,
  onUpdated,
  onDeleteRequest,
}: {
  tag: SubscriberTag;
  canManage: boolean;
  onUpdated: (tag: SubscriberTag) => void;
  onDeleteRequest: (tag: SubscriberTag) => void;
}) {
  const idPrefix = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TagDraft>({ name: tag.name, color: tag.color });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft({ name: tag.name, color: tag.color });
    setError(null);
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateDraft(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    const name = draft.name.trim();
    const payload = {
      ...(name !== tag.name ? { name } : {}),
      ...(draft.color !== tag.color.toUpperCase() ? { color: draft.color } : {}),
    };
    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onUpdated(await subscriberTagsApi.update(tag.id, payload));
      setEditing(false);
    } catch (updateError) {
      setError(subscriberTagErrorMessage(updateError));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <li className="py-3">
        <form
          onSubmit={(event) => void save(event)}
          aria-label={`Editar etiqueta ${tag.name}`}
          className="space-y-3"
        >
          <TagFields idPrefix={idPrefix} draft={draft} disabled={saving} onChange={setDraft} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving} className="min-h-11">
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              className="min-h-11"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <SubscriberTagChip tag={tag} />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {assignedCopy(tag.assignedCount)}
        </span>
      </div>
      {canManage ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 md:min-h-8"
            aria-label={`Editar etiqueta ${tag.name}`}
            onClick={startEditing}
          >
            Editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 text-rose-700 md:min-h-8 dark:text-rose-300"
            aria-label={`Eliminar etiqueta ${tag.name}`}
            onClick={() => onDeleteRequest(tag)}
          >
            Eliminar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function DeleteTagDialog({
  tag,
  onClose,
  onDeleted,
}: {
  tag: SubscriberTag | null;
  onClose: () => void;
  onDeleted: (tagId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [tag?.id]);

  async function confirm() {
    if (!tag) return;
    setDeleting(true);
    setError(null);
    try {
      await subscriberTagsApi.remove(tag.id);
      onDeleted(tag.id);
    } catch (deleteError) {
      setError(subscriberTagErrorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={tag !== null} onOpenChange={(open) => (!open && !deleting ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar etiqueta</DialogTitle>
          <DialogDescription>
            {tag
              ? tag.assignedCount > 0
                ? `La etiqueta «${tag.name}» se quitará de ${assignedCopy(tag.assignedCount)}. Esta acción no se puede deshacer.`
                : `La etiqueta «${tag.name}» no está asignada a ningún suscriptor. Esta acción no se puede deshacer.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={deleting}
            className="min-h-11"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            className="min-h-11"
            onClick={() => void confirm()}
          >
            {deleting ? 'Eliminando…' : 'Eliminar etiqueta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: SubscriberTag[] };

function sortByName(tags: SubscriberTag[]): SubscriberTag[] {
  return [...tags].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export function SubscriberTagsSettingsClient() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_READ);
  const canManage =
    user?.role === UserRole.ADMIN && hasPermission(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [toDelete, setToDelete] = useState<SubscriberTag | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', data: await subscriberTagsApi.list() });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  function updateList(change: (tags: SubscriberTag[]) => SubscriberTag[]) {
    setState((current) =>
      current.status === 'ready'
        ? { status: 'ready', data: sortByName(change(current.data)) }
        : current,
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
        <PortalAlert
          variant="warning"
          title="No tienes acceso a esta sección"
          description="Pide a un administrador que te dé acceso a la información de suscriptores."
        />
      </div>
    );
  }

  const tags = state.status === 'ready' ? state.data : [];
  const catalogFull = tags.length >= SUBSCRIBER_TAG_CATALOG_MAX;

  return (
    <div className="space-y-6">
      <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />

      {canManage ? (
        <PortalPanel title="Nueva etiqueta" as="section" labelled>
          <CreateTagForm
            disabled={catalogFull}
            onCreated={(tag) => updateList((current) => [...current, tag])}
          />
        </PortalPanel>
      ) : (
        <PortalAlert
          variant="info"
          title="Solo lectura"
          description="Solo un administrador puede crear, editar o eliminar etiquetas."
        />
      )}

      <PortalPanel title="Etiquetas" as="section" labelled>
        {notice ? (
          <p role="status" className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">
            {notice}
          </p>
        ) : null}
        {state.status === 'loading' ? (
          <div className="space-y-2" aria-busy="true">
            <span role="status" className="sr-only">
              Cargando etiquetas…
            </span>
            <PortalSkeletonBlock className="h-10" />
            <PortalSkeletonBlock className="h-10" />
          </div>
        ) : null}
        {state.status === 'error' ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar las etiquetas."
            description="Reintenta en unos minutos."
            action={
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        ) : null}
        {state.status === 'ready' && tags.length === 0 ? (
          <PortalEmptyState
            embedded
            icon={Tags}
            title="Aún no hay etiquetas"
            description={
              canManage
                ? 'Crea la primera para empezar a marcar suscriptores.'
                : 'Cuando un administrador cree etiquetas, aparecerán aquí.'
            }
          />
        ) : null}
        {state.status === 'ready' && tags.length > 0 ? (
          <ul
            aria-label="Etiquetas de suscriptor"
            className="divide-y divide-gray-100 dark:divide-dark-border"
          >
            {tags.map((tag) => (
              <TagRow
                key={`${tag.id}-${tag.updatedAt}`}
                tag={tag}
                canManage={canManage}
                onUpdated={(updated) => {
                  setNotice('');
                  updateList((current) =>
                    current.map((item) => (item.id === updated.id ? updated : item)),
                  );
                }}
                onDeleteRequest={(target) => {
                  setNotice('');
                  setToDelete(target);
                }}
              />
            ))}
          </ul>
        ) : null}
      </PortalPanel>

      <DeleteTagDialog
        tag={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={(tagId) => {
          const name = toDelete?.name ?? '';
          setToDelete(null);
          updateList((current) => current.filter((item) => item.id !== tagId));
          setNotice(`Etiqueta «${name}» eliminada.`);
        }}
      />
    </div>
  );
}
