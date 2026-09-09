import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle, ModalLayer } from '@iwana/ui';

/**
 * Contrato de `ModalLayer` — `docs/specs/2026-09-07-contrato-modal-layer-velo.md`.
 *
 * El primitive vive en `packages/ui`, pero su entorno de pruebas es `node`: sin
 * DOM no hay portal, ni velo, ni evento. Se prueba desde aquí, que es donde hay
 * jsdom, con el mismo precedente que `ui-primitives-a11y.spec.tsx`.
 *
 * Todas las consultas van contra `screen` / `document.body`: la capa está
 * portalada, así que cualquier aserto que preguntara por el contenedor de render
 * sería vacuo por construcción.
 */

function veil(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('[data-portal-veil]');
  if (!found) throw new Error('La capa no montó velo.');
  return found;
}

describe('ModalLayer — capa modal compartida', () => {
  it('porta la capa al body y la deja fuera del árbol de render', () => {
    const { container } = render(
      <ModalLayer align="end">
        <aside role="dialog" aria-modal="true" aria-label="Panel">
          Contenido
        </aside>
      </ModalLayer>,
    );

    const layer = screen.getByRole('dialog').parentElement;
    expect(layer).toHaveClass('fixed', 'inset-0', 'z-(--z-modal)', 'flex');
    expect(layer?.parentElement).toBe(document.body);
    expect(container).toBeEmptyDOMElement();
  });

  it('el velo no es un botón: es un div hermano, oculto a la AT', () => {
    render(
      <ModalLayer align="end" onVeilClick={jest.fn()}>
        <aside role="dialog" aria-modal="true" aria-label="Panel">
          Contenido
        </aside>
      </ModalLayer>,
    );

    const element = veil();
    expect(element.tagName).toBe('DIV');
    expect(element).toHaveAttribute('aria-hidden', 'true');
    // El panel declara el modal; el velo queda fuera de su subárbol y toda AT
    // que honre `aria-modal` lo omite. Un `<button>` etiquetado solo compraría
    // un nombre que la AT tiene instrucción de saltar.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(element).toHaveClass('absolute', 'inset-0');
    // Una sola clase para claro y oscuro: el token se redefine bajo `.dark`, así
    // que no existe una variante `dark:` que alguien pueda olvidar.
    expect(element).toHaveClass('bg-(--color-veil)');
    expect(element.className).not.toMatch(/dark:/);
    expect(element.className).not.toMatch(/bg-black/);
  });

  it('cierra en mousedown, no en click', () => {
    const onVeilClick = jest.fn();
    render(
      <ModalLayer align="end" onVeilClick={onVeilClick}>
        <aside role="dialog" aria-modal="true" aria-label="Panel">
          Contenido
        </aside>
      </ModalLayer>,
    );

    fireEvent.click(veil());
    expect(onVeilClick).not.toHaveBeenCalled();

    fireEvent.mouseDown(veil());
    expect(onVeilClick).toHaveBeenCalledTimes(1);
  });

  it('sin `onVeilClick` el velo queda inerte y el panel sigue montado', () => {
    render(
      <ModalLayer align="end">
        <aside role="dialog" aria-modal="true" aria-label="Panel">
          Contenido
        </aside>
      </ModalLayer>,
    );

    fireEvent.mouseDown(veil());

    expect(screen.getByRole('dialog', { name: 'Panel' })).toBeInTheDocument();
  });

  it('`align` es la única variante de alineación', () => {
    const { unmount } = render(
      <ModalLayer align="end">
        <aside role="dialog" aria-modal="true" aria-label="Lateral">
          Contenido
        </aside>
      </ModalLayer>,
    );

    const lateral = screen.getByRole('dialog').parentElement;
    expect(lateral).toHaveClass('justify-end');
    expect(lateral).not.toHaveClass('items-center');

    unmount();

    render(
      <ModalLayer align="center">
        <div role="dialog" aria-modal="true" aria-label="Centrado">
          Contenido
        </div>
      </ModalLayer>,
    );

    const centrado = screen.getByRole('dialog').parentElement;
    expect(centrado).toHaveClass('items-center', 'justify-center');
    expect(centrado).not.toHaveClass('justify-end');
  });

  it('`className` aporta padding a la capa y el velo lo sigue cubriendo', () => {
    render(
      <ModalLayer align="center" className="px-4 py-6" onVeilClick={jest.fn()}>
        <div role="dialog" aria-modal="true" aria-label="Centrado">
          Contenido
        </div>
      </ModalLayer>,
    );

    const layer = screen.getByRole('dialog').parentElement;
    expect(layer).toHaveClass('px-4', 'py-6');
    // `absolute inset-0` se resuelve contra la caja de RELLENO del contenedor,
    // así que el velo cubre también ese padding: el cierre por clic en el margen
    // del diálogo centrado se conserva.
    expect(veil()).toHaveClass('absolute', 'inset-0');
  });

  it('el desenfoque vive en el velo, nunca en la capa (ADR-075 §2ter)', () => {
    render(
      <ModalLayer align="center" onVeilClick={jest.fn()}>
        <div role="dialog" aria-modal="true" aria-label="Centrado">
          Contenido
        </div>
      </ModalLayer>,
    );

    const layer = screen.getByRole('dialog').parentElement;
    expect(veil()).toHaveClass('backdrop-blur-sm');
    // Un `backdrop-filter` sobre la capa `fixed` la convertiría en contexto de
    // apilamiento Y en bloque contenedor de sus descendientes `fixed`: atraparía
    // exactamente a los `--z-popover` que deben sobrevivirle.
    expect(layer?.className).not.toMatch(/backdrop-blur/);
    expect(layer?.className).not.toMatch(/bg-/);
  });
});

describe('Dialog sobre ModalLayer — cierre de la violación §2ter', () => {
  it('la capa del diálogo ya no pinta el velo ni el desenfoque', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Confirmar</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const layer = screen.getByRole('dialog').parentElement;
    expect(layer).toHaveClass('fixed', 'inset-0', 'z-(--z-modal)', 'px-4', 'py-6');
    expect(layer?.className).not.toMatch(/backdrop-blur/);
    expect(layer?.className).not.toMatch(/bg-black/);

    expect(veil()).toHaveClass('bg-(--color-veil)', 'backdrop-blur-sm');
  });
});
