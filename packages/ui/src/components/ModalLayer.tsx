'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

/**
 * Filo de una superficie que **se superpone** a contenido que no le pertenece: capas modales
 * (drawers, diálogos) y superficies flotantes ancladas (popover, menú de select, dropdown).
 * El nombre dice la relación, no el mueble: el escalón lo decide cómo se apila la superficie,
 * no cómo se llama el componente (ADR-056 §2 regla 3, enmienda del 2026-09-07).
 *
 * En **claro** el límite lo porta la superficie (panel blanco sobre fondo velado = 3.36:1) y
 * este borde es un remate suave. En **oscuro** la superficie no puede portarlo, y por partida
 * doble:
 *
 * - panel modal sobre fondo velado: **1.24:1** — y ninguna opacidad de negro lo arregla,
 *   porque incluso un velo al 100% se queda en 1.32:1;
 * - flotante abierto **dentro** de un panel modal: **1.00:1**, el mismo token de superficie
 *   (`dark-surface-2`) a ambos lados, y sin velo que ayude porque el velo está debajo del
 *   panel, no debajo del menú.
 *
 * Así que el portador pasa a ser el borde, y `iwana-neutral-600` da **4.61:1 contra la
 * superficie**. Se especifica **contra la propia superficie, nunca contra lo que quede
 * detrás**: el fondo de una superposición es contenido arbitrario —rango real `#0A0A0A`
 * a `#666666` bajo velo— y ningún valor fijo cumple 3:1 contra ese rango completo.
 *
 * Solo el borde EXTERIOR. Los filos internos (cabecera, pie, divisores) se quedan en
 * `dark-border`: la jerarquía «exterior fuerte / interiores tenues» es lo que evita que la
 * superficie se lea como wireframe.
 *
 * La geometría no viaja aquí — `border-l` en un drawer lateral, `border` + radio en un diálogo
 * centrado o un menú — porque difiere entre consumidores.
 */
export const overlayEdgeClassName = 'border-gray-200 dark:border-iwana-neutral-600';

export type ModalLayerAlign = 'end' | 'center';

export interface ModalLayerProps {
  /** Alineación del panel dentro de la capa. Sin defecto: se declara siempre. */
  align: ModalLayerAlign;
  /**
   * Cierre por interacción sobre el velo. Ausente ⇒ velo inerte, sin handler.
   * El consumidor pone aquí su propia guarda (capa superior, edición en curso,
   * guardado en vuelo): la capa no conoce esas reglas.
   */
  onVeilClick?: () => void;
  /**
   * SOLO alcance responsive y padding de la capa (`xl:hidden`, `px-4 py-6`).
   * Prohibido: `z-`, `fixed`, `inset-`, `justify-`, `items-`, `bg-`. Todo eso
   * es plomería fija — abrirla es reinstalar la duplicación que esta capa vino
   * a eliminar.
   */
  className?: string;
  children: ReactNode;
}

/**
 * Capa de superposición modal compartida: portal, escalón, velo y alineación.
 *
 * Contrato: `docs/specs/2026-09-07-contrato-modal-layer-velo.md`.
 * Base normativa: ADR-075 + enmienda C-DS-04 §2bis y §2ter.
 *
 * Tres decisiones que no son configurables, y por qué:
 *
 * 1. **Portal a `document.body`.** Un `fixed inset-0` que vive dentro del árbol
 *    de la página se ancla al primer ancestro que le cree bloque contenedor
 *    (`transform`, `filter`, `backdrop-filter`, `contain`, `will-change`…) y
 *    deja de cubrir el viewport: tapa el contenido y deja el chrome fuera del
 *    velo.
 * 2. **Una sola capa en `--z-modal`, con el velo DENTRO.** El velo no degrada
 *    al chrome a un escalón inferior; es la capa la que se monta por encima.
 *    El chrome no cambia de z-index, así que la atenuación es instantánea: no
 *    hay viaje de evento ni re-render del layout que esperar.
 * 3. **El `backdrop-filter` vive en el velo, nunca en la capa.** Sobre la capa
 *    `fixed` la convertiría en bloque contenedor de sus descendientes `fixed` y
 *    atraparía a los `--z-popover` que se supone deben sobrevivir a la capa
 *    (§2ter). El velo es hermano del panel: desenfoca lo que queda detrás sin
 *    tocar el contexto de apilamiento del panel.
 *
 * **El velo no es un `<button>`.** El panel declara `aria-modal="true"`; el velo
 * es su hermano, fuera del subárbol del modal, y toda AT que honre `aria-modal`
 * lo omite. Un `<button>` etiquetado no compra accesibilidad: compra un nombre
 * que la AT tiene instrucción de saltar y que, cuando no lo salta, anuncia un
 * *affordance* que en el caso inerte miente. El cierre para teclado y AT es
 * Escape más el botón «Cerrar» de la cabecera del panel — obligación del panel,
 * no de la capa.
 *
 * `onMouseDown`, no `onClick`: el cierre debe resolverse al presionar, como en
 * los dos primitivos más maduros del árbol. Un `click` sobre el velo puede
 * originarse en un arrastre que empezó dentro del panel (selección de texto que
 * termina fuera) y cerraría el panel a mitad de una interacción legítima.
 */
export function ModalLayer({ align, onVeilClick, className, children }: ModalLayerProps) {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      role="presentation"
      className={cn(
        'fixed inset-0 z-(--z-modal) flex',
        align === 'end' ? 'justify-end' : 'items-center justify-center',
        className,
      )}
    >
      <div
        data-portal-veil=""
        aria-hidden="true"
        // `absolute inset-0` resuelve contra la caja de relleno de la capa, así
        // que el velo cubre también el padding que declare `className`: el
        // cierre por clic en el margen de un diálogo centrado se conserva.
        className="absolute inset-0 bg-(--color-veil) backdrop-blur-sm"
        {...(onVeilClick ? { onMouseDown: onVeilClick } : {})}
      />
      {children}
    </div>,
    document.body,
  );
}
