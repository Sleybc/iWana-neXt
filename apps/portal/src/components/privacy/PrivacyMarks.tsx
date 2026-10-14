import { Badge } from '@iwana/ui';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import type { PrivacyMark } from '@iwana/shared';
import { MARK_LABELS } from './privacy-labels';

const MARK_ICONS: Record<PrivacyMark, typeof ShieldCheck> = {
  RECLAMO_EN_TRAMITE: ShieldAlert,
  VICTIMA_FALSEDAD_PERSONAL: ShieldX,
  DATOS_BLOQUEADOS: ShieldCheck,
};

const MARK_DESCRIPTIONS: Record<PrivacyMark, string> = {
  RECLAMO_EN_TRAMITE: 'Hay un reclamo de datos personales en curso.',
  VICTIMA_FALSEDAD_PERSONAL: 'Existe un reporte activo de suplantación.',
  DATOS_BLOQUEADOS: 'Algunos datos están restringidos por un deber de conservación.',
};

export function PrivacyMarks({
  marks = [],
  compact = false,
}: {
  marks?: PrivacyMark[];
  compact?: boolean;
}) {
  if (marks.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Marcas de privacidad">
      {marks.map((mark) => {
        const Icon = MARK_ICONS[mark];
        return (
          <li key={mark}>
            <Badge
              variant="warning"
              title={MARK_DESCRIPTIONS[mark]}
              className="inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {compact ? <span className="sr-only">{MARK_LABELS[mark]}</span> : MARK_LABELS[mark]}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
