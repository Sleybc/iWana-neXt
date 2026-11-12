import { cn } from '@iwana/ui';
import type { SubscriberTagChip as SubscriberTagChipData } from '@iwana/shared';
import { SUBSCRIBER_TAG_VISIBLE_MAX, subscriberTagTextColor } from './subscriber-tag-ui';

interface SubscriberTagChipProps {
  tag: Pick<SubscriberTagChipData, 'name' | 'color'>;
  className?: string;
}

/** Chip con el color de la etiqueta; el texto se elige negro o blanco por contraste. */
export function SubscriberTagChip({ tag, className }: SubscriberTagChipProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-[10rem] items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/10 dark:ring-white/25',
        className,
      )}
      style={{ backgroundColor: tag.color, color: subscriberTagTextColor(tag.color) }}
    >
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

interface SubscriberTagChipsProps {
  tags: SubscriberTagChipData[] | undefined;
  max?: number;
  className?: string;
}

/**
 * Etiquetas del suscriptor en una sola línea: muestra hasta `max` y resume el resto
 * con «+N», cuyo nombre accesible y título listan las etiquetas ocultas.
 */
export function SubscriberTagChips({
  tags,
  max = SUBSCRIBER_TAG_VISIBLE_MAX,
  className,
}: SubscriberTagChipsProps) {
  if (!tags || tags.length === 0) return null;
  const visible = tags.slice(0, max);
  const hidden = tags.slice(max);
  const hiddenNames = hidden.map((tag) => tag.name).join(', ');

  return (
    <ul
      aria-label="Etiquetas"
      className={cn('flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden', className)}
    >
      {visible.map((tag) => (
        <li key={tag.id} className="min-w-0 shrink">
          <SubscriberTagChip tag={tag} />
        </li>
      ))}
      {hidden.length > 0 ? (
        <li className="shrink-0">
          <span
            title={hiddenNames}
            aria-label={`${hidden.length} etiquetas más: ${hiddenNames}`}
            className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-dark-surface-3 dark:text-gray-200"
          >
            +{hidden.length}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
