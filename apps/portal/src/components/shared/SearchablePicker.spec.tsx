import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SearchableMultiPicker,
  SearchablePicker,
  type SearchablePickerItem,
  type SearchablePickerSearchResult,
} from './SearchablePicker';

const RESOURCE = { singular: 'proveedor', plural: 'proveedores' } as const;

const ITEMS: SearchablePickerItem[] = [
  { id: '1', label: 'Proveedor Alfa', sublabel: 'NIT ····1234' },
  { id: '2', label: 'Proveedor Beta', sublabel: 'Activo' },
  { id: '3', label: 'Proveedor Gamma' },
];

function mockSearch(
  result:
    | SearchablePickerSearchResult
    | ((q: string, signal: AbortSignal) => Promise<SearchablePickerSearchResult>),
) {
  if (typeof result === 'function') {
    return jest.fn(result);
  }
  return jest.fn(async (_q: string, _signal: AbortSignal) => result);
}

describe('SearchablePicker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  async function typeQuery(input: HTMLElement, text: string) {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.type(input, text);
  }

  async function flushDebounce(ms = 300) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  it('S1: no dispara onSearch bajo el umbral de 2 caracteres', async () => {
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    await typeQuery(input, 'a');
    await flushDebounce(500);

    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe al menos 2 caracteres')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-label', 'Resultados de proveedores');
  });

  it('CA-PICK-02: debounce 300 ms antes de onSearch', async () => {
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    await typeQuery(input, 'al');

    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(onSearch).not.toHaveBeenCalled();

    await flushDebounce(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('al', expect.any(AbortSignal));
  });

  it('aborta la petición anterior al tipar de nuevo', async () => {
    const signals: AbortSignal[] = [];
    const onSearch = jest.fn((_q: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<SearchablePickerSearchResult>(() => {
        /* pending */
      });
    });

    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    await typeQuery(input, 'al');
    await flushDebounce();
    expect(onSearch).toHaveBeenCalledTimes(1);

    await typeQuery(input, 'f');
    await flushDebounce();
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('S2: muestra skeleton de filas mientras carga', async () => {
    let resolveSearch!: (value: SearchablePickerSearchResult) => void;
    const onSearch = jest.fn(
      () =>
        new Promise<SearchablePickerSearchResult>((resolve) => {
          resolveSearch = resolve;
        }),
    );

    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    await typeQuery(screen.getByRole('combobox', { name: 'Proveedor' }), 'al');
    await flushDebounce();

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('No hay proveedores que coincidan')).not.toBeInTheDocument();
    expect(within(listbox).queryByRole('option')).not.toBeInTheDocument();

    await act(async () => {
      resolveSearch({ items: [ITEMS[0]!], total: 1 });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Proveedor Alfa/i })).toBeInTheDocument();
    });
  });

  it('S3: muestra label — sublabel y selecciona con clic', async () => {
    const onChange = jest.fn();
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={onChange}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    await typeQuery(screen.getByRole('combobox', { name: 'Proveedor' }), 'pr');
    await flushDebounce();

    const option = await screen.findByRole('option', { name: /Proveedor Alfa — NIT/i });
    expect(option).toBeInTheDocument();

    await act(async () => {
      option.click();
    });
    expect(onChange).toHaveBeenCalledWith(ITEMS[0]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('S4: vacío de búsqueda distinto del umbral', async () => {
    const onSearch = mockSearch({ items: [], total: 0 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    await typeQuery(screen.getByRole('combobox', { name: 'Proveedor' }), 'zz');
    await flushDebounce();

    expect(screen.getByText('No hay proveedores que coincidan')).toBeInTheDocument();
    expect(screen.queryByText('Escribe al menos 2 caracteres')).not.toBeInTheDocument();
  });

  it('S5: error + Reintentar vuelve a consultar el mismo q', async () => {
    const onSearch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ items: [ITEMS[0]!], total: 1 });

    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    await typeQuery(screen.getByRole('combobox', { name: 'Proveedor' }), 'al');
    await flushDebounce();

    expect(await screen.findByText('No fue posible cargar proveedores.')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await act(async () => {
      retry.click();
    });

    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith('al', expect.any(AbortSignal));
    expect(await screen.findByRole('option', { name: /Proveedor Alfa/i })).toBeInTheDocument();
  });

  it('S6: banda de truncado cuando total > items.length', async () => {
    const onSearch = mockSearch({ items: ITEMS.slice(0, 2), total: 40 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    await typeQuery(screen.getByRole('combobox', { name: 'Proveedor' }), 'pr');
    await flushDebounce();

    expect(
      screen.getByText('Mostrando los 2 más relevantes. Afina la búsqueda.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cargar más/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('teclado: flechas + Enter confirman; Escape cierra', async () => {
    const onChange = jest.fn();
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={onChange}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    await user.type(input, 'pr');
    await flushDebounce();
    await screen.findByRole('option', { name: /Proveedor Alfa/i });

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith(ITEMS[1]);

    // Reabrir y cerrar con Escape
    await user.clear(input);
    await user.type(input, 'pr');
    await flushDebounce();
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('a11y: combobox + aria-activedescendant + live region tras estabilizar', async () => {
    const onSearch = mockSearch({ items: ITEMS.slice(0, 1), total: 1 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');

    await typeQuery(input, 'al');
    await flushDebounce();

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls');
    await waitFor(() => {
      expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
    });
    expect(screen.getByText('1 proveedor')).toBeInTheDocument();
  });

  it('Limpiar selección llama onChange(null)', async () => {
    const onChange = jest.fn();
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value="1"
        selectedItem={{ label: 'Proveedor Alfa', sublabel: 'NIT ····1234' }}
        onChange={onChange}
        onSearch={onSearch}
        label="Proveedor"
      />,
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Limpiar selección' }).click();
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('minChars=0: enfocar con selección no busca con el label y conserva la lista precargada', async () => {
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value="1"
        selectedItem={{ label: 'Proveedor Alfa', sublabel: 'NIT ····1234' }}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
        minChars={0}
      />,
    );

    // Preload al montar (q=''); al enfocar no debe buscarse con el label.
    await act(async () => {
      fireEvent.focus(screen.getByRole('combobox', { name: 'Proveedor' }));
    });
    await flushDebounce();

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('', expect.any(AbortSignal));
    expect(
      await screen.findByRole('option', { name: /Proveedor Alfa — NIT/i }),
    ).toBeInTheDocument();
  });

  it('minChars=0: escribir tras seleccionar sí dispara la búsqueda', async () => {
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value="1"
        selectedItem={{ label: 'Proveedor Alfa', sublabel: 'NIT ····1234' }}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
        minChars={0}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    await act(async () => {
      fireEvent.focus(input);
    });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.clear(input);
    await user.type(input, 'be');
    await flushDebounce();

    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith('be', expect.any(AbortSignal));
    expect(await screen.findByRole('option', { name: /Proveedor Beta/i })).toBeInTheDocument();
  });

  it('minChars=0: Reintentar con selección consulta la lista completa, no el label', async () => {
    const onSearch = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ items: [ITEMS[0]!], total: 1 });

    render(
      <SearchablePicker
        resource={RESOURCE}
        value="1"
        selectedItem={{ label: 'Proveedor Alfa', sublabel: 'NIT ····1234' }}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
        minChars={0}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.focus(screen.getByRole('combobox', { name: 'Proveedor' }));
    });

    expect(await screen.findByText('No fue posible cargar proveedores.')).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Reintentar' }).click();
    });

    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith('', expect.any(AbortSignal));
    expect(
      await screen.findByRole('option', { name: /Proveedor Alfa — NIT/i }),
    ).toBeInTheDocument();
  });

  it('disabled no abre listbox ni dispara onSearch', async () => {
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    render(
      <SearchablePicker
        resource={RESOURCE}
        value={null}
        onChange={jest.fn()}
        onSearch={onSearch}
        label="Proveedor"
        disabled
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    expect(input).toBeDisabled();
    await flushDebounce(500);
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SearchableMultiPicker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  async function flushDebounce(ms = 300) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  it('añadir opción no cierra el listbox y limpia el campo (CA-PICK-16)', async () => {
    const onChange = jest.fn();
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const { rerender } = render(
      <SearchableMultiPicker
        resource={RESOURCE}
        value={[]}
        onChange={onChange}
        onSearch={onSearch}
        label="Proveedores"
      />,
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'pr');
    await flushDebounce();

    await user.click(await screen.findByRole('option', { name: /Proveedor Alfa/i }));
    expect(onChange).toHaveBeenCalledWith([ITEMS[0]]);

    rerender(
      <SearchableMultiPicker
        resource={RESOURCE}
        value={[ITEMS[0]!]}
        onChange={onChange}
        onSearch={onSearch}
        label="Proveedores"
      />,
    );

    expect(input).toHaveValue('');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Escribe al menos 2 caracteres')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar Proveedor Alfa' })).toBeInTheDocument();
  });

  it('Backspace con campo vacío quita el último chip', async () => {
    const onChange = jest.fn();
    const onSearch = mockSearch({ items: ITEMS, total: 3 });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    render(
      <SearchableMultiPicker
        resource={RESOURCE}
        value={[ITEMS[0]!, ITEMS[1]!]}
        onChange={onChange}
        onSearch={onSearch}
        label="Proveedores"
      />,
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(onChange).toHaveBeenCalledWith([ITEMS[0]]);
  });
});
