import { fireEvent, render, screen } from '@testing-library/react';
import { CatalogPicker, MultiCatalogPicker } from './CatalogPicker';

/**
 * M8 quitó los literales `z-10`/`z-20` de los cazadores de clic exterior y los
 * dejó SIN escalón. Sin z, un cazador `fixed inset-0` queda por debajo de
 * cualquier hermano posicionado posterior con z > 0 y el clic sobre esa zona
 * deja de cerrar el desplegable — el contrato implícito de orden de documento
 * que ADR-075 vino a eliminar.
 *
 * Contrato verificado aquí: cazador y panel comparten el escalón `--z-popover`
 * (el cazador es superficie transparente de captura, no capa visible: sube al
 * escalón del panel al que sirve) y el panel va DESPUÉS en orden de documento,
 * que es lo que lo hace pintar encima dentro del mismo escalón.
 */

interface Plan {
  id: string;
  name: string;
}

const ITEMS: Plan[] = [
  { id: 'p1', name: 'Plan Fibra 300' },
  { id: 'p2', name: 'Plan Fibra 600' },
];

const getKey = (item: Plan) => item.id;
const getLabel = (item: Plan) => item.name;

/** El cazador y el panel son los dos hermanos que el desplegable añade al abrirse. */
function dropdownParts(root: HTMLElement) {
  const catcher = root.querySelector<HTMLElement>('div.fixed.inset-0');
  if (!catcher) throw new Error('No hay cazador de clic exterior.');
  const panel = catcher.nextElementSibling as HTMLElement | null;
  if (!panel) throw new Error('El cazador no tiene panel hermano posterior.');
  return { catcher, panel };
}

function assertPopoverStep(root: HTMLElement) {
  const { catcher, panel } = dropdownParts(root);
  expect(catcher).toHaveClass('z-(--z-popover)');
  expect(panel).toHaveClass('z-(--z-popover)');
  // Mismo escalón: el orden de documento es lo que pone el panel encima.
  expect(catcher.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('CatalogPicker — cazador de clic exterior en `--z-popover`', () => {
  it('cazador y panel comparten el escalón, con el panel después en orden de documento', () => {
    const { container } = render(
      <CatalogPicker
        items={ITEMS}
        selectedId={null}
        onChange={jest.fn()}
        getKey={getKey}
        getLabel={getLabel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Seleccionar/ }));
    expect(screen.getByRole('option', { name: /Plan Fibra 300/ })).toBeInTheDocument();

    assertPopoverStep(container);
  });

  it('el clic sobre el cazador cierra el desplegable', () => {
    const { container } = render(
      <CatalogPicker
        items={ITEMS}
        selectedId={null}
        onChange={jest.fn()}
        getKey={getKey}
        getLabel={getLabel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Seleccionar/ }));
    expect(screen.getByRole('option', { name: /Plan Fibra 600/ })).toBeInTheDocument();

    fireEvent.click(dropdownParts(container).catcher);

    expect(screen.queryByRole('option', { name: /Plan Fibra 600/ })).not.toBeInTheDocument();
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();
  });
});

describe('MultiCatalogPicker — cazador de clic exterior en `--z-popover`', () => {
  it('cazador y panel comparten el escalón, con el panel después en orden de documento', () => {
    const { container } = render(
      <MultiCatalogPicker
        items={ITEMS}
        selectedIds={[]}
        onChange={jest.fn()}
        getKey={getKey}
        getLabel={getLabel}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /Plan Fibra 300/ })).toBeInTheDocument();

    assertPopoverStep(container);
  });

  it('el clic sobre el cazador cierra el desplegable', () => {
    const { container } = render(
      <MultiCatalogPicker
        items={ITEMS}
        selectedIds={[]}
        onChange={jest.fn()}
        getKey={getKey}
        getLabel={getLabel}
      />,
    );

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /Plan Fibra 600/ })).toBeInTheDocument();

    fireEvent.click(dropdownParts(container).catcher);

    expect(screen.queryByRole('option', { name: /Plan Fibra 600/ })).not.toBeInTheDocument();
    expect(container.querySelector('div.fixed.inset-0')).toBeNull();
  });
});
