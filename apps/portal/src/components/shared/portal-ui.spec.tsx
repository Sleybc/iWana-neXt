import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  PortalActionToolbar,
  PortalAlert,
  PortalDataTableHead,
  PortalDataTableSortableHead,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalResultsStrip,
  PortalSidePeek,
  PortalSuccessAlert,
  PortalTablePagination,
  PortalTablePager,
  buildPageWindow,
  interactiveFocusClassName,
  portalInlineTextLinkClassName,
  PORTAL_DEFAULT_PAGE_SIZE,
  PORTAL_PAGE_SIZE_OPTIONS,
} from './portal-ui';
import { USERS_PAGE_SIZE } from '@/components/users/users-query';

function mockMatchMediaSmUp(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('640') ? matches : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}
describe('portal-ui', () => {
  it('should expose polite live regions by default for success alerts', () => {
    render(
      <PortalAlert
        variant="success"
        title="Operación completada"
        description="Los cambios se guardaron correctamente."
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
  });

  it('PortalActionToolbar expone toolbar con nombre accesible cuando hay aria-label', () => {
    render(
      <PortalActionToolbar align="end" aria-label="Acciones del inicio">
        <button type="button">Actualizar</button>
      </PortalActionToolbar>,
    );

    expect(screen.getByRole('toolbar', { name: 'Acciones del inicio' })).toBeInTheDocument();
  });

  it('should expose polite live regions by default for error alerts (variant no decide politeness)', () => {
    render(
      <PortalAlert
        variant="error"
        title="No fue posible completar la operación"
        description="Intenta nuevamente."
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('título de alerta en sentence case, no eyebrow uppercase (DS v1.5)', () => {
    render(
      <PortalAlert
        variant="warning"
        title="Verificación en dos pasos no obligatoria"
        description="Se recomienda activarla para todos los usuarios."
      />,
    );

    const title = screen.getByText('Verificación en dos pasos no obligatoria');
    expect(title).toHaveClass('font-semibold');
    expect(title).not.toHaveClass('portal-eyebrow');
  });

  it('PortalPanel compact usa p-4; default conserva p-5 (DS v1.6)', () => {
    const { rerender, container } = render(
      <PortalPanel title="Historial de cambios">contenido</PortalPanel>,
    );
    expect(container.firstElementChild?.className).toMatch(/\bp-5\b/);
    expect(container.firstElementChild?.className).not.toMatch(/\bp-4\b/);

    rerender(
      <PortalPanel compact title="Historial de cambios">
        contenido
      </PortalPanel>,
    );
    expect(container.firstElementChild?.className).toMatch(/\bp-4\b/);
  });

  it('el class-token de enlace inline incluye el anillo iWana', () => {
    expect(portalInlineTextLinkClassName.split(/\s+/)).toEqual(
      expect.arrayContaining(interactiveFocusClassName.split(/\s+/)),
    );
  });

  it('should expose assertive live region when live="assertive" is opted in', () => {
    render(
      <PortalAlert
        variant="error"
        live="assertive"
        title="No fue posible completar la operación"
        description="Intenta nuevamente."
      />,
    );

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true');
  });

  it('should omit live role and aria-live when live="off"', () => {
    const { container } = render(
      <PortalAlert
        variant="warning"
        live="off"
        title="Atención operativa"
        description="Revisa el catálogo."
      />,
    );

    const root = container.firstElementChild;
    expect(root).toBeTruthy();
    expect(root).not.toHaveAttribute('role');
    expect(root).not.toHaveAttribute('aria-live');
    expect(root).not.toHaveAttribute('aria-atomic');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should use the shared token class in empty states', () => {
    const { container } = render(
      <PortalEmptyState
        title="Sin resultados"
        description="No encontramos elementos para mostrar."
      />,
    );

    expect(container.firstChild).toHaveClass('bg-iwana-surface-soft');
  });

  it('embedded no pinta segunda cáscara (DS §1.9)', () => {
    const { container } = render(
      <PortalEmptyState
        embedded
        title="Sin avisos de campo"
        description="No hay avisos pendientes."
      />,
    );

    expect(container.firstChild).not.toHaveClass('bg-iwana-surface-soft');
    expect(container.firstChild).not.toHaveClass('rounded-2xl');
    expect(container.firstChild).not.toHaveClass('border');
  });

  it('PortalDataTableHead impone scope="col" por defecto', () => {
    render(
      <table>
        <thead>
          <tr>
            <PortalDataTableHead>Nombre</PortalDataTableHead>
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toHaveAttribute('scope', 'col');
  });
});

describe('PortalSidePeek a11y', () => {
  beforeEach(() => {
    document.body.classList.remove('overflow-hidden');
  });

  it('confina Tab dentro del panel y cierra con Escape', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <div>
        <button type="button">Fuera del panel</button>
        <PortalSidePeek
          open
          onClose={onClose}
          title="Crear ítem"
          description="Formulario de prueba"
          footer={
            <button type="button" data-testid="peek-save">
              Guardar
            </button>
          }
        >
          <button type="button" data-testid="peek-field">
            Campo
          </button>
        </PortalSidePeek>
      </div>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Crear ítem' });
    expect(dialog).toBeInTheDocument();
    expect(document.body).toHaveClass('overflow-hidden');

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    const fieldButton = screen.getByTestId('peek-field');
    const saveButton = screen.getByTestId('peek-save');

    await user.tab();
    expect(document.activeElement === closeButton || document.activeElement === fieldButton).toBe(
      true,
    );

    // Avanzar varias veces: el foco no debe salir del dialog.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(
        screen.getByRole('button', { name: 'Fuera del panel' }),
      );
    }

    // Cierre con Escape.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    // El botón de guardar sigue siendo alcanzable dentro del trap (no regresionamos el footer).
    expect(saveButton).toBeInTheDocument();
  });

  // Misma carrera que `Dialog`, `OperationalSidePeek` y `usePortalSideDrawerA11y`:
  // el foco de apertura se difiere un `requestAnimationFrame` y ese frame puede
  // caer DESPUÉS de la primera interacción. Se intercepta el rAF para fijar el
  // instante en que corre y hacer la carrera determinista.
  it('enfoca al abrir cuando nadie ha reclamado el foco', () => {
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    // Documento en reposo: el foco no puede venir prestado del caso anterior.
    (document.activeElement as HTMLElement | null)?.blur();

    render(
      <PortalSidePeek open onClose={jest.fn()} title="Crear ítem">
        <input aria-label="Cantidad" />
      </PortalSidePeek>,
    );

    act(() => {
      frames.forEach((frame) => frame(0));
    });

    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    jest.restoreAllMocks();
  });

  it('no roba el foco a una interacción ya en curso', () => {
    const frames: FrameRequestCallback[] = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    render(
      <PortalSidePeek open onClose={jest.fn()} title="Crear ítem">
        <input aria-label="Cantidad" />
      </PortalSidePeek>,
    );

    // El operador toca un control del panel antes de que corra el frame diferido.
    const field = screen.getByLabelText('Cantidad');
    act(() => {
      field.focus();
    });

    act(() => {
      frames.forEach((frame) => frame(0));
    });

    // Reubicar el foco aquí cierra un desplegable recién abierto o descarta lo
    // que se está tecleando.
    expect(field).toHaveFocus();
    jest.restoreAllMocks();
  });

  it('se apila en --z-drawer por encima de barras sticky (ADR-075)', () => {
    render(
      <PortalSidePeek open onClose={jest.fn()} title="Nuevo plan">
        Campo
      </PortalSidePeek>,
    );

    const layer = screen.getByRole('presentation');
    expect(layer).toHaveClass('z-(--z-drawer)');
    expect(layer).not.toHaveClass('z-40');
  });

  it('se apila en --z-drawer por encima de barras sticky (ADR-075)', () => {
    render(
      <PortalSidePeek open onClose={jest.fn()} title="Nuevo plan">
        Campo
      </PortalSidePeek>,
    );

    const layer = screen.getByRole('presentation');
    expect(layer).toHaveClass('z-(--z-drawer)');
    expect(layer).not.toHaveClass('z-40');
  });

  it('al abrir enfoca el panel y al cerrar restaura el foco al trigger', async () => {
    const onClose = jest.fn();

    function Harness({ open }: { open: boolean }) {
      return (
        <div>
          <button type="button" data-testid="trigger">
            Abrir panel
          </button>
          <PortalSidePeek open={open} onClose={onClose} title="Detalle lateral">
            <button type="button" data-testid="peek-field">
              Campo
            </button>
          </PortalSidePeek>
        </div>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    rerender(<Harness open />);

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: 'Detalle lateral' });
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    onClose();
    rerender(<Harness open={false} />);

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('PortalSuccessAlert', () => {
  it('muestra el mensaje de éxito y permite cerrar', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();

    render(<PortalSuccessAlert message="Combo creado." onDismiss={onDismiss} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Operación completada')).toBeInTheDocument();
    expect(screen.getByText('Combo creado.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('acepta description como alias de message', () => {
    render(<PortalSuccessAlert description="Promoción desactivada." onDismiss={jest.fn()} />);

    expect(screen.getByText('Promoción desactivada.')).toBeInTheDocument();
  });
});

describe('PortalTablePagination', () => {
  it('no renderiza nada si !hasMore', () => {
    const { container } = render(
      <PortalTablePagination hasMore={false} onLoadMore={jest.fn()} loading={false} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('muestra el botón Cargar más cuando hasMore', async () => {
    const user = userEvent.setup();
    const onLoadMore = jest.fn();

    render(
      <PortalTablePagination
        hasMore={true}
        onLoadMore={onLoadMore}
        loading={false}
        shown={20}
        total={48}
        resourceLabel="usuarios"
      />,
    );

    expect(screen.queryByText(/Mostrando 20 de 48/i)).toHaveClass('sr-only');
    const button = screen.getByRole('button', { name: 'Cargar más' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón mientras loading', () => {
    render(<PortalTablePagination hasMore={true} onLoadMore={jest.fn()} loading={true} />);

    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeDisabled();
  });
});

describe('PORTAL_PAGE_SIZE_OPTIONS', () => {
  it('alineado a USERS_PAGE_SIZE / default 20', () => {
    expect(PORTAL_PAGE_SIZE_OPTIONS).toEqual([10, 20, 50]);
    expect(PORTAL_DEFAULT_PAGE_SIZE).toBe(20);
    expect(USERS_PAGE_SIZE).toBe(PORTAL_DEFAULT_PAGE_SIZE);
  });
});

describe('buildPageWindow', () => {
  it('lista todas las páginas cuando caben', () => {
    expect(buildPageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('inserta elipsis en extremos', () => {
    expect(buildPageWindow(5, 12)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 12]);
  });
});

describe('PortalResultsStrip', () => {
  it('sin controls conserva justify-end vía clase', () => {
    const { container } = render(<PortalResultsStrip badge={<span>20 usuarios</span>} />);
    expect(container.firstChild).toHaveClass('justify-end');
    expect(screen.getByText('20 usuarios')).toBeInTheDocument();
  });

  it('con controls usa justify-between', () => {
    const { container } = render(
      <PortalResultsStrip
        controls={<button type="button">Filtro</button>}
        badge={<span>badge</span>}
      />,
    );
    expect(container.firstChild).toHaveClass('justify-between');
    expect(screen.getByRole('button', { name: 'Filtro' })).toBeInTheDocument();
  });
});

describe('PortalTablePager', () => {
  const resource = { singular: 'usuario', plural: 'usuarios' };

  it('no renderiza pie con cero resultados', () => {
    const { container } = render(
      <PortalTablePager
        page={1}
        pageCount={0}
        onPageChange={jest.fn()}
        from={0}
        to={0}
        total={0}
        resource={resource}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('página única: solo conteo, sin navegación', () => {
    render(
      <PortalTablePager
        page={1}
        pageCount={1}
        onPageChange={jest.fn()}
        from={1}
        to={12}
        total={12}
        resource={resource}
      />,
    );
    expect(screen.getAllByText('12 usuarios').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('muestra rango, nav y aria-current en la página activa', async () => {
    const user = userEvent.setup();
    const onPageChange = jest.fn();
    render(
      <PortalTablePager
        page={3}
        pageCount={7}
        onPageChange={onPageChange}
        from={41}
        to={60}
        total={128}
        resource={resource}
      />,
    );

    expect(
      screen.getAllByText('Mostrando 41\u201360 de 128 usuarios').length,
    ).toBeGreaterThanOrEqual(1);
    const nav = screen.getByRole('navigation', { name: 'Paginación de usuarios' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('deshabilita controles y marca aria-busy en loading', () => {
    render(
      <PortalTablePager
        page={2}
        pageCount={5}
        onPageChange={jest.fn()}
        from={21}
        to={40}
        total={90}
        resource={resource}
        loading
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveAttribute('aria-busy', 'true');
    expect(nav).toHaveAttribute('data-loading', 'true');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('density compact aplica h-8; default conserva h-11', () => {
    const { rerender } = render(
      <PortalTablePager
        page={2}
        pageCount={3}
        onPageChange={jest.fn()}
        from={11}
        to={20}
        total={30}
        resource={resource}
      />,
    );

    const defaultPage = screen.getByRole('button', { name: 'Página 2' });
    expect(defaultPage).toHaveClass('h-11', 'min-w-11', 'rounded-xl');
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveClass('min-h-11');

    rerender(
      <PortalTablePager
        page={2}
        pageCount={3}
        onPageChange={jest.fn()}
        from={11}
        to={20}
        total={30}
        resource={resource}
        density="compact"
      />,
    );

    const compactPage = screen.getByRole('button', { name: 'Página 2' });
    expect(compactPage).toHaveClass('h-8', 'min-w-8', 'rounded-lg');
    expect(compactPage).not.toHaveClass('h-11');
    expect(screen.getByRole('button', { name: 'Anterior' })).not.toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveClass('text-xs');
  });

  it('un solo resultado usa singular', () => {
    render(
      <PortalTablePager
        page={1}
        pageCount={1}
        onPageChange={jest.fn()}
        from={1}
        to={1}
        total={1}
        resource={resource}
      />,
    );
    expect(screen.getAllByText('1\u20131 de 1 usuario').length).toBeGreaterThanOrEqual(1);
  });

  it('total estimado antepone «más de»', () => {
    render(
      <PortalTablePager
        page={3}
        pageCount={50}
        onPageChange={jest.fn()}
        from={41}
        to={60}
        total={1000}
        resource={resource}
        totalIsEstimate
      />,
    );
    expect(
      screen.getAllByText(/Mostrando 41\u201360 de m\u00e1s de/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('permanece montado tras paginar (sin CLS de desmontaje)', async () => {
    const user = userEvent.setup();
    const onPageChange = jest.fn();
    const { rerender } = render(
      <PortalTablePager
        page={1}
        pageCount={3}
        onPageChange={onPageChange}
        from={1}
        to={20}
        total={55}
        resource={resource}
      />,
    );
    const nav = screen.getByRole('navigation');
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(
      <PortalTablePager
        page={2}
        pageCount={3}
        onPageChange={onPageChange}
        from={21}
        to={40}
        total={55}
        resource={resource}
      />,
    );
    expect(screen.getByRole('navigation')).toBe(nav);
  });
});

describe('PortalPageSizeSelect', () => {
  it('alinea la etiqueta y el selector en la misma fila', () => {
    const { container } = render(<PortalPageSizeSelect value={20} onChange={jest.fn()} />);
    const wrapper = container.querySelector('[data-min-option]');
    const label = screen.getByText('Filas por página');

    expect(wrapper).toHaveClass('flex', 'items-center');
    expect(label.tagName).toBe('LABEL');
    expect(label.parentElement).toBe(wrapper);
    expect(screen.getByRole('combobox', { name: 'Filas por página' })).toBeInTheDocument();
  });

  it('usa Select de @iwana/ui con etiqueta Filas por página', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<PortalPageSizeSelect value={20} onChange={onChange} />);

    expect(screen.getByText('Filas por página')).toBeInTheDocument();
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('h-11');
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: '50' });
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it('density compact densifica el Select a h-8', () => {
    render(<PortalPageSizeSelect value={20} onChange={jest.fn()} density="compact" />);
    expect(screen.getByRole('combobox', { name: 'Filas por página' })).toHaveClass(
      'h-8',
      'rounded-lg',
      'text-xs',
    );
  });

  it('respeta opciones explícitas y estado disabled', async () => {
    const onChange = jest.fn();
    render(<PortalPageSizeSelect value={10} options={[10, 50]} onChange={onChange} disabled />);

    const select = screen.getByRole('combobox', { name: 'Filas por página' });
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('10');
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    // @iwana/ui usa un combobox button + listbox, no un <select> nativo.
    const user = userEvent.setup();
    render(<PortalPageSizeSelect value={10} options={[10, 50]} onChange={onChange} />);
    await user.click(screen.getAllByRole('combobox', { name: 'Filas por página' })[1]!);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['10', '50']);
  });

  it('acepta override local 5–100 sin mutar el default global', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <PortalPageSizeSelect value={20} options={[5, 10, 20, 30, 50, 100]} onChange={onChange} />,
    );

    expect(PORTAL_PAGE_SIZE_OPTIONS).toEqual([10, 20, 50]);
    await user.click(screen.getByRole('combobox', { name: 'Filas por página' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '5',
      '10',
      '20',
      '30',
      '50',
      '100',
    ]);
  });
});

describe('PortalDataTableSortableHead', () => {
  beforeEach(() => {
    mockMatchMediaSmUp(true);
  });

  it('cicla sin orden → asc → desc → sin orden y fija aria-sort', async () => {
    const user = userEvent.setup();
    const onSortChange = jest.fn();

    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <PortalDataTableSortableHead field="name" activeSort={null} onSortChange={onSortChange}>
              Nombre
            </PortalDataTableSortableHead>
            <PortalDataTableHead>Estado</PortalDataTableHead>
          </tr>
        </thead>
      </table>,
    );

    const sortable = screen.getByRole('columnheader', { name: /Nombre/i });
    expect(sortable).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Estado' })).not.toHaveAttribute('aria-sort');

    await user.click(screen.getByRole('button', { name: 'Ordenar por Nombre, ascendente' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ by: 'name', dir: 'asc' });

    rerender(
      <table>
        <thead>
          <tr>
            <PortalDataTableSortableHead
              field="name"
              activeSort={{ by: 'name', dir: 'asc' }}
              onSortChange={onSortChange}
            >
              Nombre
            </PortalDataTableSortableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: 'Ordenar por Nombre, descendente' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ by: 'name', dir: 'desc' });

    rerender(
      <table>
        <thead>
          <tr>
            <PortalDataTableSortableHead
              field="name"
              activeSort={{ by: 'name', dir: 'desc' }}
              onSortChange={onSortChange}
            >
              Nombre
            </PortalDataTableSortableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: 'Quitar orden por Nombre' }));
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it('deshabilita el control en loading sin desmontarlo', () => {
    render(
      <table>
        <thead>
          <tr>
            <PortalDataTableSortableHead
              field="name"
              activeSort={{ by: 'name', dir: 'asc' }}
              onSortChange={jest.fn()}
              loading
            >
              Nombre
            </PortalDataTableSortableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('button', { name: /Ordenar por Nombre/ })).toBeDisabled();
  });

  it('el botón de orden ocupa el ancho del encabezado y queda a la izquierda', () => {
    render(
      <table>
        <thead>
          <tr>
            <PortalDataTableSortableHead field="name" activeSort={null} onSortChange={jest.fn()}>
              Nombre
            </PortalDataTableSortableHead>
          </tr>
        </thead>
      </table>,
    );

    const button = screen.getByRole('button', { name: 'Ordenar por Nombre, ascendente' });
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('justify-start');
    expect(button.className).not.toContain('ml-auto');
  });

  it('en mobile conserva scope y aria-sort, pero no monta un botón de orden', () => {
    mockMatchMediaSmUp(false);

    render(
      <table>
        <thead>
          <tr>
            <PortalDataTableSortableHead field="name" activeSort={null} onSortChange={jest.fn()}>
              Nombre
            </PortalDataTableSortableHead>
          </tr>
        </thead>
      </table>,
    );

    const header = screen.getByRole('columnheader', { name: 'Nombre' });
    expect(header).toHaveAttribute('scope', 'col');
    expect(header).toHaveAttribute('aria-sort', 'none');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PortalTablePager — contrato de pie y a11y', () => {
  const resource = { singular: 'usuario', plural: 'usuarios' };

  it('monta el control de tamaño junto al rango del pager', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = jest.fn();

    render(
      <PortalTablePager
        page={1}
        pageCount={2}
        onPageChange={jest.fn()}
        from={1}
        to={20}
        total={35}
        resource={resource}
        pageSizeControl={
          <PortalPageSizeSelect value={20} onChange={onPageSizeChange} options={[10, 20, 50]} />
        }
      />,
    );

    expect(screen.getByText('Mostrando 1–20 de 35 usuarios')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Filas por página' });
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '50' }));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('restaura el foco dentro de la navegación después de cambiar de página', async () => {
    const user = userEvent.setup();
    const onPageChange = jest.fn();
    const { rerender } = render(
      <PortalTablePager
        page={1}
        pageCount={2}
        onPageChange={onPageChange}
        from={1}
        to={20}
        total={35}
        resource={resource}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    rerender(
      <PortalTablePager
        page={2}
        pageCount={2}
        onPageChange={onPageChange}
        from={21}
        to={35}
        total={35}
        resource={resource}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('navigation').contains(document.activeElement)).toBe(true);
    });
  });

  it('pasa axe sin violaciones sobre una tabla representativa con pager', async () => {
    const { container } = render(
      <div>
        <table aria-label="Listado de usuarios">
          <caption className="sr-only">Usuarios de prueba</caption>
          <thead>
            <tr>
              <PortalDataTableHead>Nombre</PortalDataTableHead>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Registro de prueba</td>
            </tr>
          </tbody>
        </table>
        <PortalTablePager
          page={1}
          pageCount={2}
          onPageChange={jest.fn()}
          from={1}
          to={20}
          total={35}
          resource={resource}
        />
      </div>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
