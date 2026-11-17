import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@iwana/ui';
import { PortalActionToolbar } from './portal-ui';

/**
 * Acciones de fila del portal (tablas y listas de la ficha): botones de ícono con nombre accesible
 * y tooltip, sobre la barra compacta (patrón de la tabla de Usuarios), para que las filas no
 * necesiten desplazamiento horizontal ni dependan de enlaces de texto sueltos.
 */
export function PortalRowActions({ children }: { children: ReactNode }) {
  return (
    <PortalActionToolbar compact align="end" className="!inline-flex !w-fit !flex-row sm:!w-fit">
      {children}
    </PortalActionToolbar>
  );
}

const ICON_CLASS = 'min-h-11 min-w-11';
const DANGER_CLASS =
  'min-h-11 min-w-11 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400';

interface RowIconProps {
  /** Nombre accesible: la acción y a qué fila aplica. */
  label: string;
  /** Tooltip corto con el nombre de la acción. */
  hint: string;
  children: ReactNode;
}

export function PortalRowIconButton({
  label,
  hint,
  onClick,
  disabled = false,
  busy = false,
  tone,
  children,
}: RowIconProps & {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Acciones destructivas (anular): resaltan en rojo al pasar el cursor. */
  tone?: 'danger';
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={tone === 'danger' ? DANGER_CLASS : ICON_CLASS}
      aria-label={label}
      aria-busy={busy || undefined}
      title={hint}
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : children}
    </Button>
  );
}

/** Variante enlace (abre en otra pestaña) con el mismo aspecto que `PortalRowIconButton`. */
export function PortalRowIconLink({
  label,
  hint,
  href,
  children,
}: RowIconProps & { href: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className={ICON_CLASS}>
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={hint}>
        {children}
      </a>
    </Button>
  );
}
