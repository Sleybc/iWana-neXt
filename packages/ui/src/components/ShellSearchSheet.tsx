'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { headerIconControlClassName, interactiveFocusClassName } from '../focus';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ShellSearchSheetProps {
  open: boolean;
  onClose: () => void;
  /** Título visible de la hoja, que además la nombra para lectores de pantalla. */
  title: string;
  /** Etiqueta del botón de cierre. */
  closeLabel: string;
  /** El buscador. Se enfoca su primer `input[role="combobox"]` al abrir. */
  children: ReactNode;
  /** Elemento al que devolver el foco al cerrar (el disparador del header). */
  triggerRef: { current: HTMLElement | null };
}

/**
 * Hoja de búsqueda a pantalla completa del shell, en móvil.
 *
 * **Portalada a `document.body`, y eso no es opcional.** Medido en Chrome 148 sobre
 * `apps/web`: su `<header>` lleva `backdrop-blur`, que por Filter Effects L2 lo convierte en
 * bloque contenedor de descendientes `fixed`. La hoja, que declaraba `fixed inset-0`, medía
 * **375 × 68 px** en un viewport de 375 × 812 — la caja del header, no la pantalla — y
 * `elementFromPoint` a 400, 600 y 780 px devolvía elementos de la página de detrás. Un
 * `aria-modal="true"` que dejaba el 92% de la pantalla interactuable. Portalada al `body`
 * escapa de ese bloque contenedor y cubre el viewport (ADR-075 §2ter, obligación 2).
 *
 * El escalón vive aquí porque, una vez portalada, la hoja **sí** compite en el contexto de
 * apilamiento raíz: es una capa de viewport que captura el foco, luego `--z-modal` (§2bis).
 * Mientras colgaba del header, su z era ordenación local y no un escalón — de ahí que el
 * literal `z-50` y el token `--z-modal` que lo sustituyó dieran exactamente el mismo
 * resultado: ninguno.
 *
 * No lleva velo: es una superficie opaca a pantalla completa, no un panel sobre contenido.
 * Por eso no consume `ModalLayer`, cuya capa siempre pinta velo.
 *
 * Estados de a11y que el constructo debe y que ninguna de las dos app-shells tenía completos:
 * `role="dialog"` + `aria-modal`, trampa de `Tab`, Escape, foco inicial en el campo, retorno
 * del foco al disparador, y cierre al cruzar a desktop — sin ese último, el estado seguiría
 * abierto con la trampa viva sobre un overlay ya no renderizado.
 */
export function ShellSearchSheet({
  open,
  onClose,
  title,
  closeLabel,
  children,
  triggerRef,
}: ShellSearchSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  // Los consumidores pasan `onClose` inline; sin este ref, cada render volvería a
  // suscribir el listener de breakpoint y el de teclado.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Foco inicial al campo, y retorno al disparador cuando cierra.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const frameId = window.requestAnimationFrame(() => {
        const input = sheetRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]');
        input?.focus();
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }

    return undefined;
  }, [open, triggerRef]);

  // Escape y trampa de Tab.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const sheet = sheetRef.current;
      if (!sheet) {
        return;
      }

      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        return;
      }

      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !sheet.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !sheet.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // La hoja solo existe bajo `lg`. Al cruzar a desktop desaparecería de la vista con el
  // estado abierto y la trampa de `Tab` viva sobre contenido no renderizado.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (desktopQuery.matches) {
        onCloseRef.current();
      }
    };

    closeOnDesktop();
    desktopQuery.addEventListener('change', closeOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeOnDesktop);
  }, []);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={sheetRef}
      id="shell-search-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-(--z-modal) flex flex-col bg-white lg:hidden dark:bg-dark-surface"
    >
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-dark-border">
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={cn(headerIconControlClassName, interactiveFocusClassName)}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="truncate text-sm font-semibold text-iwana-primary dark:text-white">{title}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>,
    document.body,
  );
}
