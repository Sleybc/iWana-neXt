import { Badge, cn } from '@iwana/ui';
import type { SubscriberDerivedBadge } from './subscriber-badges';

interface SubscriberDerivedBadgesProps {
  badges: SubscriberDerivedBadge[];
  /** Nombre accesible de la lista, p. ej. «Insignias del suscriptor». */
  label?: string;
  className?: string;
}

/** Solo lectura: las insignias se derivan de datos reales y no se editan (CA-6). */
export function SubscriberDerivedBadges({
  badges,
  label = 'Insignias del suscriptor',
  className,
}: SubscriberDerivedBadgesProps) {
  if (badges.length === 0) return null;
  return (
    <ul aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {badges.map((badge) => (
        <li key={badge.id}>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </li>
      ))}
    </ul>
  );
}
