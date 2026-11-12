'use client';

import { useCallback, useId, useState } from 'react';
import Link from 'next/link';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@iwana/ui';
import { Tag } from 'lucide-react';
import type { SubscriberTag, SubscriberTagChip } from '@iwana/shared';
import { PortalAlert } from '@/components/shared/portal-ui';
import { subscriberTagsApi } from '@/lib/api-client';
import { SubscriberTagChip as TagChip } from './SubscriberTagChips';
import { subscriberTagErrorMessage } from './subscriber-tag-ui';

export const SUBSCRIBER_TAGS_SETTINGS_HREF = '/dashboard/settings/subscriber-tags';

interface SubscriberTagEditorProps {
  subscriberId: string;
  tags: SubscriberTagChip[];
  /** Recibe las etiquetas vigentes que devuelve la API tras asignar o quitar. */
  onTagsChange: (tags: SubscriberTagChip[]) => void;
  className?: string;
}

type CatalogState =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: SubscriberTag[] };

/**
 * «Etiquetas ▾» de la ficha: lista el catálogo con una casilla por etiqueta. Cada cambio
 * se guarda al momento y los chips se refrescan con la respuesta de la API.
 */
export function SubscriberTagEditor({
  subscriberId,
  tags,
  onTagsChange,
  className,
}: SubscriberTagEditorProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'idle' });
  const [pendingTagId, setPendingTagId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();

  const loadCatalog = useCallback(async () => {
    setCatalog({ status: 'loading' });
    try {
      const data = await subscriberTagsApi.list();
      setCatalog({ status: 'ready', data });
    } catch {
      setCatalog({ status: 'error' });
    }
  }, []);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      void loadCatalog();
    }
  }

  async function toggle(tag: SubscriberTag, assigned: boolean) {
    setPendingTagId(tag.id);
    setError(null);
    try {
      const next = assigned
        ? await subscriberTagsApi.unassign(subscriberId, tag.id)
        : await subscriberTagsApi.assign(subscriberId, tag.id);
      onTagsChange(next);
    } catch (toggleError) {
      setError(subscriberTagErrorMessage(toggleError));
    } finally {
      setPendingTagId(null);
    }
  }

  const assignedIds = new Set(tags.map((tag) => tag.id));

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`min-h-11 gap-1 px-2 text-xs md:min-h-8 ${className ?? ''}`}
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          {tags.length > 0 ? 'Editar etiquetas' : 'Asignar etiqueta'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3" aria-labelledby={headingId}>
        <p id={headingId} className="text-sm font-semibold text-gray-900 dark:text-white">
          Etiquetas del suscriptor
        </p>

        {catalog.status === 'loading' || catalog.status === 'idle' ? (
          <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
            Cargando etiquetas…
          </p>
        ) : null}

        {catalog.status === 'error' ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar las etiquetas."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadCatalog()}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}

        {catalog.status === 'ready' && catalog.data.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Aún no hay etiquetas. Un administrador puede crearlas en Ajustes.
          </p>
        ) : null}

        {catalog.status === 'ready' && catalog.data.length > 0 ? (
          <fieldset
            className="max-h-64 space-y-1 overflow-y-auto"
            aria-busy={pendingTagId !== null}
          >
            <legend className="sr-only">Asignar etiqueta</legend>
            {catalog.data.map((tag) => {
              const assigned = assignedIds.has(tag.id);
              const inputId = `${headingId}-${tag.id}`;
              return (
                <div key={tag.id} className="flex min-h-11 items-center gap-2 md:min-h-9">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={assigned}
                    disabled={pendingTagId !== null}
                    onChange={() => void toggle(tag, assigned)}
                    className="h-4 w-4 rounded border-gray-300 accent-iwana-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary"
                  />
                  <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer">
                    <TagChip tag={tag} />
                  </label>
                </div>
              );
            })}
          </fieldset>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <Link
          href={SUBSCRIBER_TAGS_SETTINGS_HREF}
          className="inline-flex min-h-11 items-center text-sm font-medium text-iwana-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary md:min-h-8 dark:text-iwana-primary-300"
        >
          Ver etiquetas en Ajustes
        </Link>
      </PopoverContent>
    </Popover>
  );
}
