import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InventoryTrackingMode,
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  type StockIssuePickableItem,
} from '@iwana/shared';
import { inventoryApi } from '@/lib/api-client';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { STOCK_COMMITTED_NEXT_STEP_TEXT } from './inventory-labels';
import { StockIssueComposer } from './StockIssueComposer';

jest.mock('./InventoryLocationPicker', () => ({
  InventoryLocationPicker: ({
    id,
    label,
    onChange,
  }: {
    id?: string;
    label?: string;
    onChange: (id: string | null, item: { id: string; label: string } | null) => void;
  }) => (
    <button
      type="button"
      aria-label={label ?? 'Bodega'}
      data-testid={id}
      onClick={() => {
        if (id === 'issue-destination') {
          onChange('loc-2', { id: 'loc-2', label: 'TEC-01 · Custodia técnico' });
          return;
        }
        onChange('loc-1', { id: 'loc-1', label: 'BOD-01 · Bodega principal' });
      }}
    >
      Elegir {label}
    </button>
  ),
}));

function buildPickable(overrides: Partial<StockIssuePickableItem> = {}): StockIssuePickableItem {
  return {
    itemId: 'item-1',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    categoryId: 'cat-1',
    categoryName: 'Equipos de cliente',
    unitOfMeasure: 'UNIT',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    assetControlled: false,
    availability: [
      {
        condition: StockBalanceCondition.NEW,
        quantityOnHand: '3',
        quantityReserved: '0',
        available: '3',
      },
    ],
    totalAvailable: '3',
    lots: [],
    availableSerialCount: 0,
    ...overrides,
  };
}

const pickableCable = buildPickable({
  itemId: 'item-2',
  sku: 'CAB-010',
  name: 'Cable drop',
  categoryId: 'cat-2',
  categoryName: 'Materiales',
  unitOfMeasure: 'METER',
  availability: [
    {
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '8',
      quantityReserved: '0',
      available: '8',
    },
  ],
  totalAvailable: '8',
});

const pickableRouter = buildPickable({
  itemId: 'item-serial',
  sku: 'SER-9',
  name: 'Router Onu Gpon',
  categoryId: 'cat-1',
  categoryName: 'Equipos de cliente',
  unitOfMeasure: 'UNIT',
  trackingMode: InventoryTrackingMode.SERIALIZED,
  assetControlled: true,
  availability: [
    {
      condition: StockBalanceCondition.NEW,
      quantityOnHand: '1',
      quantityReserved: '0',
      available: '1',
    },
    {
      condition: StockBalanceCondition.REFURBISHED,
      quantityOnHand: '2',
      quantityReserved: '0',
      available: '2',
    },
  ],
  totalAvailable: '3',
  lots: [],
  availableSerialCount: 2,
});

function buildMeta(options?: {
  total?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  randomAccess?: boolean;
  nextCursor?: string | null;
}) {
  const total = options?.total ?? 0;
  const page = options?.page ?? 1;
  const limit = options?.limit ?? PORTAL_DEFAULT_PAGE_SIZE;
  return {
    nextCursor: options?.nextCursor ?? null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : null,
    hasMore: options?.hasMore ?? false,
    mode: (options?.randomAccess === false ? 'cursor' : 'page') as 'page' | 'cursor',
    capabilities: {
      randomAccess: options?.randomAccess !== false,
      sortableFields: [] as string[],
    },
    sort: null,
  };
}

const listPickableItemsMock = inventoryApi.listPickableItems as jest.Mock;
const listAssetsMock = inventoryApi.listAssets as jest.Mock;
const getItemMock = inventoryApi.getItem as jest.Mock;
const searchItemsForPickerMock = inventoryApi.searchItemsForPicker as jest.Mock;

function mockPickableBackend(options?: {
  stock?: StockIssuePickableItem[];
  catalog?: StockIssuePickableItem[];
  stockTotal?: number;
}) {
  const stock = options?.stock ?? [buildPickable(), pickableCable];
  const catalog = options?.catalog ?? [buildPickable(), pickableCable, pickableRouter];
  listPickableItemsMock.mockImplementation(
    (params: { scope?: string; q?: string; page?: number; limit?: number }) => {
      const pool = params.scope === 'catalog' ? catalog : stock;
      const q = params.q?.trim().toLowerCase() ?? '';
      const filtered = q
        ? pool.filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(q))
        : pool;
      const limit = params.limit ?? PORTAL_DEFAULT_PAGE_SIZE;
      const total =
        params.scope === 'catalog' ? filtered.length : (options?.stockTotal ?? filtered.length);
      const page = params.page ?? 1;
      const data = filtered.slice((page - 1) * limit, page * limit);
      return Promise.resolve({
        data,
        meta: buildMeta({
          total,
          page,
          limit,
          hasMore: page * limit < total,
        }),
      });
    },
  );
}

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listPickableItems: jest.fn(),
      listAssets: jest.fn().mockImplementation((params: { itemId?: string }) => {
        if (params?.itemId === 'item-serial') {
          return Promise.resolve({
            data: [
              {
                id: 'asset-1',
                tenantId: 'tenant-1',
                inventoryItemId: 'item-serial',
                serialNumber: 'SN-001',
                assetTag: 'TAG-001',
                currentStatus: 'AVAILABLE',
                currentLocationId: 'loc-1',
              },
              {
                id: 'asset-2',
                tenantId: 'tenant-1',
                inventoryItemId: 'item-serial',
                serialNumber: 'SN-002',
                assetTag: null,
                currentStatus: 'AVAILABLE',
                currentLocationId: 'loc-1',
              },
            ],
            meta: buildMeta({ total: 2, limit: 50 }),
          });
        }
        return Promise.resolve({ data: [], meta: buildMeta({ total: 0, limit: 50 }) });
      }),
      getItem: jest.fn().mockImplementation((id: string) => {
        if (id === 'item-9') {
          return Promise.resolve({
            id: 'item-9',
            tenantId: 'tenant-1',
            sku: 'SER-9',
            name: 'Router serializado',
            trackingMode: 'SERIALIZED',
            unitOfMeasure: 'UNIT',
          });
        }
        return Promise.resolve({
          id,
          tenantId: 'tenant-1',
          sku: 'GEN-001',
          name: 'Genérico',
          trackingMode: 'CONSUMABLE',
          unitOfMeasure: 'UNIT',
        });
      }),
      searchItemsForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    },
  };
});

function renderComposer(props: Record<string, unknown> = {}) {
  return render(<StockIssueComposer onSubmit={jest.fn()} {...(props as object)} />);
}

function setupUser() {
  return userEvent.setup();
}

/** Abre el panel de línea desde el catálogo (vía principal) y confirma con seriales. */
async function addSerializedViaPanel(
  user: ReturnType<typeof userEvent.setup>,
  options?: { serialLabels?: string[] },
) {
  await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
  await user.click(await screen.findByRole('button', { name: /SER-9 · Router Onu Gpon/ }));

  const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
  const serialInput = within(dialog).getByPlaceholderText('Buscar serial disponible');
  const labels = options?.serialLabels ?? ['SN-001'];
  await user.click(serialInput);
  for (const [index, label] of labels.entries()) {
    if (index > 0) {
      // Tras agregar, el picker cierra el listado; escribir reabre la búsqueda.
      await user.type(serialInput, 'SN');
    }
    await user.click(await within(dialog).findByRole('option', { name: new RegExp(label) }));
  }
  await user.click(within(dialog).getByRole('button', { name: 'Agregar al borrador' }));
  return dialog;
}

describe('StockIssueComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: true,
        media: '',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
    mockPickableBackend();
  });

  it('CA-S1-01: elegida la bodega y sin escribir nada, Con material lista con cantidad y el contador refleja meta.total', async () => {
    const user = setupUser();
    listPickableItemsMock.mockImplementation((params: { scope?: string }) => {
      if (params.scope === 'catalog') {
        return Promise.resolve({ data: [], meta: buildMeta({ total: 128 }) });
      }
      return Promise.resolve({
        data: [buildPickable(), pickableCable],
        meta: buildMeta({ total: 2 }),
      });
    });

    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));

    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();
    expect(screen.getByText(/Disponible en origen: 3/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Con material (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Catálogo (128)' })).toBeInTheDocument();
    // B1 se consulta una vez por pestaña (origen + scope), sin N+1 por ítem.
    expect(listPickableItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLocationId: 'loc-1', scope: 'with-stock' }),
      expect.anything(),
    );
    expect(getItemMock).not.toHaveBeenCalled();
  });

  it('CA-S2-10: con más ítems que la página, la segunda página es alcanzable desde el pager (ADR-065)', async () => {
    const user = setupUser();
    const universe = Array.from({ length: 26 }, (_, index) =>
      buildPickable({ itemId: `item-${index}`, sku: `SKU-${index}`, name: `Producto ${index}` }),
    );
    listPickableItemsMock.mockImplementation(
      (params: { scope?: string; page?: number; limit?: number }) => {
        if (params.scope === 'catalog') {
          return Promise.resolve({ data: [], meta: buildMeta({ total: 0 }) });
        }
        const limit = params.limit ?? PORTAL_DEFAULT_PAGE_SIZE;
        const page = params.page ?? 1;
        return Promise.resolve({
          data: universe.slice((page - 1) * limit, page * limit),
          meta: buildMeta({
            total: universe.length,
            page,
            limit,
            hasMore: page * limit < universe.length,
          }),
        });
      },
    );

    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByRole('tab', { name: 'Con material (26)' })).toBeInTheDocument();

    // Pie numerado con conteo en el pie; la primera página no contiene el ítem 25.
    expect(screen.getByText('Mostrando 1–20 de 26 productos')).toBeInTheDocument();
    expect(screen.queryByText(/SKU-25 · Producto 25/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText(/SKU-25 · Producto 25/)).toBeInTheDocument();
    expect(listPickableItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, scope: 'with-stock' }),
      expect.anything(),
    );
    expect(screen.getByText('Mostrando 21–26 de 26 productos')).toBeInTheDocument();
  });

  it('CA-S1-02: el catálogo muestra categoría, unidad y disponible reales', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));

    const catalogTable = await screen.findByRole('table');
    const body = within(catalogTable).getAllByRole('row').slice(1);
    expect(body.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Equipos de cliente').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Unidad').length).toBeGreaterThanOrEqual(2);
    // Disponible real por ítem, sin hardcodes de categoría ni unidad.
    expect(screen.getAllByText('Materiales').length).toBeGreaterThanOrEqual(1);
  });

  it('CA-S1-03: el disponible se ve por condición, sin ocultar reacondicionado', async () => {
    const user = setupUser();
    mockPickableBackend({ stock: [buildPickable(), pickableRouter] });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    // Sugerencia con desglose en texto.
    expect(await screen.findByText(/1 nuevo · 2 reacondicionado/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    // Catálogo con badges tonales por condición, nunca enums crudos.
    expect(await screen.findByText('Reacondicionado · 2')).toBeInTheDocument();
    expect(screen.queryByText(/REFURBISHED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NEW/)).not.toBeInTheDocument();
  });

  it('busca con un solo carácter contra el mismo endpoint (fin del mínimo de 2)', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();

    expect(screen.getByPlaceholderText('Buscar por código, nombre o marca')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar ítem'), 'O');

    await waitFor(() => {
      expect(listPickableItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'O' }),
        expect.anything(),
      );
    });
  });

  it('muestra Reintentar cuando la carga falla en vez de silenciarla', async () => {
    const user = setupUser();
    listPickableItemsMock.mockRejectedValueOnce(new Error('Fallo de red'));
    listPickableItemsMock.mockRejectedValueOnce(new Error('Fallo de red'));
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText('No fue posible cargar el material')).toBeInTheDocument();

    mockPickableBackend();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();
  });

  it('pide la bodega de origen y avisa cuando no hay material', async () => {
    const user = setupUser();
    renderComposer();

    expect(
      screen.getByText(
        'Con el origen definido verás el material disponible para agregar a la salida.',
      ),
    ).toBeInTheDocument();

    mockPickableBackend({ stock: [], catalog: [] });
    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText('Esta bodega no tiene material disponible')).toBeInTheDocument();
  });

  it('renders create-mode sections and submits multiple lines', async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    renderComposer({ onSubmit });

    expect(screen.getByRole('heading', { name: 'Datos de la salida' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Con material/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));

    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(screen.getAllByText('ONT-001 · ONT WiFi 6').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('columnheader', { name: 'Cantidad' }).length).toBeGreaterThanOrEqual(
      1,
    );

    await user.click(screen.getByRole('button', { name: 'Crear salida' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockIssueType.TECHNICIAN_CUSTODY,
        sourceLocationId: 'loc-1',
        destinationLocationId: 'loc-2',
        lines: [
          expect.objectContaining({
            itemId: 'item-1',
            condition: StockBalanceCondition.NEW,
          }),
        ],
      }),
    );
  });

  it('appends next-step guidance when create fails with a remote stock error', () => {
    renderComposer({
      error:
        'No hay suficiente material disponible: hay cantidad comprometida por salidas abiertas.',
    });

    expect(screen.getByText('No se pudo crear la salida')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No hay suficiente material disponible: hay cantidad comprometida por salidas abiertas.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(STOCK_COMMITTED_NEXT_STEP_TEXT)).toBeInTheDocument();
  });

  it('shows stock suggestions and warns when quantity exceeds available balance', async () => {
    const user = setupUser();

    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));

    expect(await screen.findByText(/Disponible en origen: 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    const quantityInput = screen.getByLabelText(/Cantidad ONT WiFi/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, '9');

    expect(screen.getByText(/Supera el material disponible en origen/i)).toBeInTheDocument();
  });

  it('CA-S1-07: la línea con lote único nace con él y el detalle muestra número y vencimiento', async () => {
    const user = setupUser();
    mockPickableBackend({
      stock: [
        buildPickable({
          availability: [
            {
              condition: StockBalanceCondition.NEW,
              quantityOnHand: '50',
              quantityReserved: '0',
              available: '50',
            },
          ],
          totalAvailable: '50',
          lots: [
            {
              lotId: 'lote-a',
              lotNumber: 'LOTE-A',
              expiryDate: '2026-05-20',
              condition: StockBalanceCondition.NEW,
              available: '50',
            },
          ],
        }),
      ],
    });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText(/Disponible en origen: 50/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    // Lote único: la línea nace con ese lote y el detalle lo muestra como dato.
    expect(screen.getByText(/Lote LOTE-A · vence 20\/05\/2026 · 50/)).toBeInTheDocument();
  });

  it('deja la elección al operador cuando hay más de un lote en origen', async () => {
    const user = setupUser();
    mockPickableBackend({
      stock: [
        buildPickable({
          availability: [
            {
              condition: StockBalanceCondition.NEW,
              quantityOnHand: '50',
              quantityReserved: '0',
              available: '50',
            },
          ],
          totalAvailable: '50',
          lots: [
            {
              lotId: 'lote-a',
              lotNumber: 'LOTE-A',
              expiryDate: null,
              condition: StockBalanceCondition.NEW,
              available: '30',
            },
            {
              lotId: 'lote-b',
              lotNumber: 'LOTE-B',
              expiryDate: null,
              condition: StockBalanceCondition.NEW,
              available: '20',
            },
          ],
        }),
      ],
    });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));

    expect(await screen.findByText(/Disponible en origen: 50/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    // Con dos lotes no se adivina: la fila no muestra lote y Modificar abre el panel.
    expect(screen.queryByText(/Lote LOTE-A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lote LOTE-B/)).not.toBeInTheDocument();
  });

  it('CA-S2-07: el clic en el producto abre el panel con condición, lote, seriales y cantidad', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));

    // El clic va sobre el nombre (botón), no sobre la fila: el checkbox queda intacto.
    await user.click(await screen.findByRole('button', { name: /SER-9 · Router Onu Gpon/ }));

    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(within(dialog).getByText(/SKU SER-9/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Condición')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Seriales')).toBeInTheDocument();
    expect(within(dialog).getByText('Cantidad')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Cantidad: 0');

    // El checkbox de la vía rápida no quedó marcado por la apertura del panel.
    expect(screen.getByRole('checkbox', { name: /Seleccionar SER-9/i })).not.toBeChecked();
  });

  it('CA-S2-08: Modificar reabre el panel con los valores actuales de la línea', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addSerializedViaPanel(user, { serialLabels: ['SN-001', 'SN-002'] });

    // La línea quedó en el borrador con cantidad 2 (número de seriales).
    expect(screen.queryByText('Falta configurar seriales')).not.toBeInTheDocument();
    expect(screen.getByText(/2 seriales: SN-001, SN-002/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modificar' }));

    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(within(dialog).getByText('SN-001')).toBeInTheDocument();
    expect(within(dialog).getByText('SN-002')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Cantidad: 2');
  });

  it('CA-S2-09: la tabla del borrador no tiene columna Condición editable', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(screen.queryByRole('columnheader', { name: 'Condición' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox', { name: /Condición/ })).toHaveLength(0);
    // La condición se lee como dato en el detalle.
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThanOrEqual(1);
  });

  it('CA-S1-05: la línea de vía rápida sin seriales bloquea el envío y Modificar lo resuelve', async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderComposer({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    const submitButton = screen.getByRole('button', { name: 'Crear salida' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('No se pudo crear la salida')).toBeInTheDocument();
    const messages = await screen.findAllByText('Selecciona los seriales de Router Onu Gpon.');
    expect(messages.length).toBeGreaterThanOrEqual(2);
    // El foco de la corrección va al panel de la línea inválida.
    expect(await screen.findByRole('dialog', { name: /Router Onu Gpon/ })).toBeInTheDocument();

    // Dentro del panel se eligen los seriales y la cantidad queda fija en N.
    const dialog = screen.getByRole('dialog', { name: /Router Onu Gpon/ });
    const serialInput = within(dialog).getByPlaceholderText('Buscar serial disponible');
    await user.click(serialInput);
    await user.click(await within(dialog).findByRole('option', { name: /SN-001/ }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Cantidad: 1');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await user.click(screen.getByRole('button', { name: 'Crear salida' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              itemId: 'item-serial',
              serializedAssetIds: ['asset-1'],
              requestedQty: 1,
            }),
          ],
        }),
      );
    });
  });

  it('avisa cuando el serializado no tiene seriales en la bodega y mantiene el bloqueo', async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    mockPickableBackend({
      stock: [buildPickable({ ...pickableRouter, availableSerialCount: 0 })],
      catalog: [buildPickable({ ...pickableRouter, availableSerialCount: 0 })],
    });
    listAssetsMock.mockResolvedValue({ data: [], meta: buildMeta({ total: 0, limit: 50 }) });
    renderComposer({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    // La fila hace visible el pendiente con el badge (mitigación G1).
    expect(await screen.findByText('Falta configurar seriales')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear salida' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('No se pudo crear la salida')).toBeInTheDocument();

    // El panel explica por qué y la confirmación queda bloqueada.
    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(
      await within(dialog).findByText(
        'Este producto serializado no tiene seriales disponibles en esta bodega.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('la vía rápida anuncia la línea serializada sin seriales en la región viva', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));
    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(await screen.findByText('Falta configurar seriales')).toBeInTheDocument();
    expect(
      screen.getByText(/Se agregó Router Onu Gpon sin seriales: usa Modificar en la fila/),
    ).toBeInTheDocument();
  });

  it('la vía manual hidrata el serializado y exige seriales por el panel (C3)', async () => {
    const user = setupUser();
    searchItemsForPickerMock.mockResolvedValue({
      data: [{ id: 'item-9', label: 'Router serializado', sublabel: 'SKU SER-9' }],
      total: 1,
    });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar línea manual' }));

    const itemInput = screen.getByLabelText('Producto');
    await user.click(itemInput);
    await user.type(itemInput, 'SER-9');
    await user.click(await screen.findByRole('option', { name: /Router serializado/ }));

    // getItem aporta SERIALIZED: la fila marca el pendiente y el panel exige seriales.
    expect(await screen.findByText('Falta configurar seriales')).toBeInTheDocument();
    expect(getItemMock).toHaveBeenCalledWith('item-9');
  });

  it('loads edit mode with guardrail and disables save until there are changes', async () => {
    renderComposer({
      mode: 'edit',
      editIssue: {
        id: 'issue-1',
        tenantId: 'tenant-1',
        type: StockIssueType.TECHNICIAN_CUSTODY,
        status: StockIssueStatus.REQUESTED,
        sourceLocationId: 'loc-1',
        destinationLocationId: 'loc-2',
        destinationRefId: null,
        originRefId: null,
        commercialRefId: null,
        reason: null,
        costCenter: null,
        handoffMethod: null,
        handoffNotes: null,
        handoffAttachments: null,
        createdByUserId: null,
        dispatchedByUserId: null,
        closedAt: null,
        stockMovementId: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        lines: [
          {
            id: 'line-1',
            tenantId: 'tenant-1',
            issueId: 'issue-1',
            itemId: 'item-1',
            requestedQty: '1.00',
            dispatchedQty: null,
            lotId: null,
            serializedAssetId: null,
            condition: StockBalanceCondition.NEW,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      } as never,
      onUpdate: jest.fn().mockResolvedValue(undefined),
    });

    expect(screen.getByText('Edición disponible en estado solicitada')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contexto de la salida' })).toBeInTheDocument();
    expect((await screen.findAllByText('ONT-001 · ONT WiFi 6')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('la edición hidrata el serializado desde el caché B1 y Modificar abre el panel (C3)', async () => {
    const user = userEvent.setup();
    renderComposer({
      mode: 'edit',
      editIssue: {
        id: 'issue-9',
        tenantId: 'tenant-1',
        type: StockIssueType.TECHNICIAN_CUSTODY,
        status: StockIssueStatus.REQUESTED,
        sourceLocationId: 'loc-1',
        destinationLocationId: 'loc-2',
        destinationRefId: null,
        originRefId: null,
        commercialRefId: null,
        reason: null,
        costCenter: null,
        handoffMethod: null,
        handoffNotes: null,
        handoffAttachments: null,
        createdByUserId: null,
        dispatchedByUserId: null,
        closedAt: null,
        stockMovementId: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        lines: [
          {
            id: 'line-9',
            tenantId: 'tenant-1',
            issueId: 'issue-9',
            itemId: 'item-serial',
            requestedQty: '1.00',
            dispatchedQty: null,
            lotId: null,
            serializedAssetId: null,
            condition: StockBalanceCondition.NEW,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      } as never,
      onUpdate: jest.fn().mockResolvedValue(undefined),
    });

    // La línea serializada del detalle queda marcada como pendiente de seriales.
    expect(await screen.findByText('Falta configurar seriales')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modificar' }));
    expect(await screen.findByRole('dialog', { name: /Router Onu Gpon/ })).toBeInTheDocument();
  });

  it('F4: el código deja marcada la coincidencia única sin clic manual (CA-F4-05)', async () => {
    listPickableItemsMock.mockImplementation((params: { scope?: string; q?: string }) => {
      if (params.scope === 'catalog' && params.q?.trim()) {
        return Promise.resolve({
          data: [
            buildPickable({
              itemId: 'item-9',
              sku: 'ONT-009',
              name: 'ONT Escaneada',
              categoryName: 'Equipos de cliente',
              unitOfMeasure: 'UNIT',
            }),
          ],
          meta: buildMeta({ total: 1 }),
        });
      }
      return Promise.resolve({ data: [], meta: buildMeta({ total: 0 }) });
    });

    renderComposer();

    fireEvent.click(screen.getByRole('button', { name: 'Origen' }));
    fireEvent.click(await screen.findByRole('tab', { name: /Catálogo/ }));
    fireEvent.change(screen.getByLabelText('Buscar ítem'), {
      target: { value: '4006381333931' },
    });

    // El código viaja como q al endpoint B1 (el backend ya resuelve barcode).
    await screen.findByRole('checkbox', { name: /ONT Escaneada/i });
    expect(listPickableItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: '4006381333931', scope: 'catalog' }),
      expect.anything(),
    );
    // Coincidencia única: queda marcada sin clic manual; el escaneo sigue vivo.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /ONT Escaneada/i })).toBeChecked();
    });
  });
});
