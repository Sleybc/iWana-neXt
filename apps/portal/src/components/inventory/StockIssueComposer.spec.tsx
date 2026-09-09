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
import { SERIAL_QTY_HELP_TEXT } from './StockIssueLineSidePeek';
import { StockIssueComposer } from './StockIssueComposer';

let mockSourceId = 'loc-1';

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
        onChange(mockSourceId, { id: mockSourceId, label: 'BOD-01 · Bodega principal' });
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
  await user.type(screen.getByLabelText('Buscar producto'), 'SER-9');
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

/**
 * Alta por selección (casilleros): con la selección ya marcada, pulsa
 * «Agregar N producto(s)» y configura la línea en el panel (cantidad y/o
 * seriales) antes de confirmar. Con `cancel` solo abre el panel y lo cierra
 * con Escape para verificar la restauración de la selección.
 */
async function addViaSearch(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  productName: RegExp,
  options?: { quantity?: string; serialLabels?: string[] },
) {
  await user.type(screen.getByLabelText('Buscar producto'), query);
  await user.click(await screen.findByRole('button', { name: productName }));
  const dialog = await screen.findByRole('dialog', { name: productName });
  if (options?.quantity) {
    const qtyInput = within(dialog).getByLabelText('Cantidad');
    await user.clear(qtyInput);
    await user.type(qtyInput, options.quantity);
  }
  for (const [index, label] of (options?.serialLabels ?? []).entries()) {
    const serialInput = within(dialog).getByPlaceholderText('Buscar serial disponible');
    await user.click(serialInput);
    if (index > 0) {
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
    mockSourceId = 'loc-1';
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
    // Aislamiento determinista por test (FE01 flaky): `clearAllMocks` no
    // revierte `mockResolvedValue` de un test previo; se restablecen los
    // lookups a su default para que el orden no cambie el resultado.
    listAssetsMock.mockImplementation((params: { itemId?: string }) => {
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
    });
    searchItemsForPickerMock.mockResolvedValue({ data: [], total: 0 });
  });

  it('CA-S1-01: elegida la bodega y sin busqueda no hay lista; al buscar, cada resultado trae disponibilidad', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));

    // En reposo: solo el buscador; ninguna lista que crezca con el catalogo.
    expect(await screen.findByText('Busca un producto para agregar')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();
    expect(screen.getAllByText(/Disponible en origen: 3/).length).toBeGreaterThanOrEqual(1);
    expect(listPickableItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLocationId: 'loc-1', scope: 'catalog' }),
      expect.anything(),
    );
    expect(getItemMock).not.toHaveBeenCalled();
  });

  it('CA-S2-10: con mas items que la pagina, la segunda pagina es alcanzable desde el pager (ADR-065)', async () => {
    const user = setupUser();
    const universe = Array.from({ length: 26 }, (_, index) =>
      buildPickable({ itemId: `item-${index}`, sku: `SKU-${index}`, name: `Producto ${index}` }),
    );
    listPickableItemsMock.mockImplementation(
      (params: { scope?: string; page?: number; limit?: number; q?: string }) => {
        if (params.scope === 'catalog') {
          const limit = params.limit ?? PORTAL_DEFAULT_PAGE_SIZE;
          const page = params.page ?? 1;
          const filtered = universe.filter((item) =>
            `${item.sku} ${item.name}`.toLowerCase().includes((params.q ?? '').toLowerCase()),
          );
          return Promise.resolve({
            data: filtered.slice((page - 1) * limit, page * limit),
            meta: buildMeta({
              total: filtered.length,
              page,
              limit,
              hasMore: page * limit < filtered.length,
            }),
          });
        }
        return Promise.resolve({ data: [], meta: buildMeta({ total: 0 }) });
      },
    );

    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'Producto');
    expect(await screen.findByText('Mostrando 1–20 de 26 productos')).toBeInTheDocument();
    expect(screen.queryByText(/SKU-25 · Producto 25/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText(/SKU-25 · Producto 25/)).toBeInTheDocument();
    expect(listPickableItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, scope: 'catalog' }),
      expect.anything(),
    );
    expect(screen.getByText('Mostrando 21–26 de 26 productos')).toBeInTheDocument();
  });

  it('CA-S1-02: el resultado del buscador muestra disponibilidad real', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'Cable');
    expect(await screen.findByText(/CAB-010 · Cable drop/)).toBeInTheDocument();
    expect(screen.getByText(/Disponible en origen: 8/)).toBeInTheDocument();
  });

  it('CA-S1-03: el disponible se ve por condicion, sin ocultar reacondicionado', async () => {
    const user = setupUser();
    mockPickableBackend({ stock: [buildPickable(), pickableRouter] });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'Router');
    expect(await screen.findByText(/1 nuevo · 2 reacondicionado/)).toBeInTheDocument();
    expect(screen.queryByText(/REFURBISHED/)).not.toBeInTheDocument();
  });

  it('busca con un solo caracter contra el mismo endpoint (fin del minimo de 2)', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText('Busca un producto para agregar')).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText('Busca por código, nombre, marca o escanea'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar producto'), 'O');

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
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    expect(await screen.findByText('No fue posible cargar el material')).toBeInTheDocument();

    mockPickableBackend();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();
  });

  it('pide la bodega de origen y, con ella, muestra el estado vacio de busqueda', async () => {
    const user = setupUser();
    renderComposer();

    expect(
      screen.getByText(
        'Selecciona primero la bodega de origen para buscar con el disponible de cada producto.',
      ),
    ).toBeInTheDocument();

    mockPickableBackend({ stock: [], catalog: [] });
    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    expect(await screen.findByText('No hay productos que coincidan')).toBeInTheDocument();
  });

  it('renders create-mode sections and submits the searched line', async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    renderComposer({ onSubmit });

    expect(screen.getByRole('heading', { name: 'Buscar y agregar' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));

    await addViaSearch(user, 'ONT', /ONT WiFi 6/);

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

  it('warns when quantity exceeds available balance inside the capture panel', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    await user.click(await screen.findByRole('button', { name: /ONT-001 · ONT WiFi 6/ }));

    const dialog = await screen.findByRole('dialog', { name: /ONT WiFi 6/ });
    const quantityInput = within(dialog).getByLabelText('Cantidad');
    await user.clear(quantityInput);
    await user.type(quantityInput, '9');

    expect(
      within(dialog).getByText(/Supera el material disponible en origen/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();
  });

  it('buscar y abrir: el resultado abre el panel de configuración sin tocar el borrador', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    await user.click(await screen.findByRole('button', { name: /ONT-001 · ONT WiFi 6/ }));

    // El panel se abre con el producto cargado; el borrador sigue vacio hasta
    // confirmar la captura.
    const dialog = await screen.findByRole('dialog', { name: /ONT WiFi 6/ });
    expect(within(dialog).getByLabelText('Cantidad')).toHaveValue('1');
    // El borrador queda intacto: el vacio sigue presente con el panel abierto.
    expect(screen.getByText('Aún no hay líneas en el borrador')).toBeInTheDocument();
  });

  it('buscar y agregar: la cantidad elegida en el panel queda en la linea del borrador', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/, { quantity: '2' });

    expect(await screen.findByLabelText(/Cantidad ONT WiFi/i)).toHaveValue('2');
  });

  it('confirmar el alta devuelve el foco al buscador para encadenar productos', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/);

    expect(await screen.findByLabelText('Buscar producto')).toHaveFocus();
  });

  it('cancelar el panel descarta la captura: el borrador queda vacio', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    await user.click(await screen.findByRole('button', { name: /ONT-001 · ONT WiFi 6/ }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Aún no hay líneas en el borrador')).toBeInTheDocument();
  });

  it('reintentar un item ya agregado abre el panel en edicion sobre esa linea', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/, { quantity: '2' });

    await user.type(screen.getByLabelText('Buscar producto'), 'ONT');
    await user.click(await screen.findByRole('button', { name: /ONT-001 · ONT WiFi 6/ }));

    const dialog = await screen.findByRole('dialog', { name: /ONT WiFi 6/ });
    expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Cantidad')).toHaveValue('2');
  });

  it('CA-S1-07: la linea con lote unico nace con el y el detalle muestra numero y vencimiento', async () => {
    const user = setupUser();
    const onuConLoteUnico = buildPickable({
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
    });
    mockPickableBackend({ stock: [onuConLoteUnico], catalog: [onuConLoteUnico] });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/);

    // Lote unico: la linea nace con ese lote y el detalle lo muestra como dato.
    expect(screen.getByText(/Lote LOTE-A · vence 20\/05\/2026 · 50/)).toBeInTheDocument();
  });

  it('deja la eleccion al operador cuando hay mas de un lote en origen', async () => {
    const user = setupUser();
    const onuConDosLotes = buildPickable({
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
    });
    mockPickableBackend({ stock: [onuConDosLotes], catalog: [onuConDosLotes] });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/);

    // Con dos lotes no se adivina: la fila no muestra lote y Modificar abre el panel.
    expect(screen.queryByText(/Lote LOTE-A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lote LOTE-B/)).not.toBeInTheDocument();
  });

  it('CA-S2-07: el resultado del buscador abre el panel con condicion, lote, seriales y cantidad', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'SER-9');
    await user.click(await screen.findByRole('button', { name: /SER-9 · Router Onu Gpon/ }));

    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(within(dialog).getByText(/SKU SER-9/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Condición')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Seriales')).toBeInTheDocument();
    expect(within(dialog).getByText('Cantidad')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Cantidad')).toHaveValue('0');
    expect(within(dialog).getByRole('status')).toHaveTextContent(SERIAL_QTY_HELP_TEXT);
  });

  it('CA-S2-08: Modificar reabre el panel con los valores actuales de la línea', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addSerializedViaPanel(user, { serialLabels: ['SN-001', 'SN-002'] });

    // La línea quedó en el borrador con cantidad 2 (número de seriales).
    expect(screen.queryByText('Falta configurar seriales')).not.toBeInTheDocument();
    expect(screen.getByText('2 seriales')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modificar' }));

    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    // La hidratación de seriales ocurre en un efecto (reset por `line.id`), así
    // que los chips pueden no haber montado en el primer render del diálogo:
    // se espera async en vez de asumir el estado ya resuelto (CA-S2-08 flaky).
    expect(await within(dialog).findByText('SN-001')).toBeInTheDocument();
    expect(await within(dialog).findByText('SN-002')).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Cantidad')).toHaveValue('2');
  });

  it('CA-S2-09: la tabla del borrador no tiene columna Condicion editable', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/);

    expect(screen.queryByRole('columnheader', { name: 'Condicion' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox', { name: /Condición/ })).toHaveLength(0);
    // La condicion se lee como dato en el detalle.
    expect(screen.getAllByText('Nuevo').length).toBeGreaterThanOrEqual(1);
  });

  it('CA-S1-05: el serializado exige seriales en el panel antes de entrar al borrador', async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderComposer({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'SER-9');
    await user.click(await screen.findByRole('button', { name: /SER-9 · Router Onu Gpon/ }));

    // La confirmacion queda bloqueada hasta elegir seriales: la linea no entra
    // al borrador sin configuracion.
    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(within(dialog).getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();

    const serialInput = within(dialog).getByPlaceholderText('Buscar serial disponible');
    await user.click(serialInput);
    await user.click(await within(dialog).findByRole('option', { name: /SN-001/ }));
    expect(within(dialog).getByLabelText('Cantidad')).toHaveValue('1');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar al borrador' }));

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
    await user.type(screen.getByLabelText('Buscar producto'), 'SER-9');
    await user.click(await screen.findByRole('button', { name: /SER-9 · Router Onu Gpon/ }));

    // El panel abre directo con el bloqueo y la explicacion; el borrador
    // permanece vacio porque la linea nunca entro sin configurar.
    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(
      await within(dialog).findByText(
        'Este producto serializado no tiene seriales disponibles en esta bodega.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Agregar al borrador' })).toBeDisabled();
    expect(screen.getByText('Aún no hay líneas en el borrador')).toBeInTheDocument();
  });

  it('la vía manual hidrata el serializado y exige seriales por el panel (C3)', async () => {
    const user = setupUser();
    searchItemsForPickerMock.mockResolvedValue({
      data: [{ id: 'item-9', label: 'Router serializado', sublabel: 'SKU SER-9' }],
      total: 1,
    });
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByText('Busca un producto para agregar')).toBeInTheDocument();

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
    expect(await screen.findByText('ONT WiFi 6')).toBeInTheDocument();
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

  it('F4 (CA-F4-05): el escaneo con coincidencia unica abre el panel directo', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT-001');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: /ONT WiFi 6/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Se abrió ONT-001 · ONT WiFi 6 para configurar la línea/),
    ).toBeInTheDocument();
  });

  it('la busqueda tecleada con una sola coincidencia no abre nada sin Enter', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'ONT-001');

    // La coincidencia unica queda listada para eleccion manual: sin Enter no
    // hay captura automatica.
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-S2.1-FE01: rebuscar un item ya en el borrador abre edicion, no duplica', async () => {
    const user = setupUser();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'SER-9', /Router Onu Gpon/, { serialLabels: ['SN-001'] });

    // Buscar de nuevo y abrir el mismo item: edicion sobre la misma linea.
    await user.type(screen.getByLabelText('Buscar producto'), 'SER-9');
    await user.click(await screen.findByRole('button', { name: /SER-9 · Router Onu Gpon/ }));
    const dialog = await screen.findByRole('dialog', { name: /Router Onu Gpon/ });
    expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();

    // La hidratacion trae el serial de la linea antes de permitir guardar.
    expect(await within(dialog).findByText('SN-001')).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Cantidad')).toHaveValue('1');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // Una sola fila del item en el borrador.
    expect(screen.getAllByText('Router Onu Gpon')).toHaveLength(1);
  });

  it('CA-S2.1-FE04: cambiar la bodega invalida la disponibilidad anterior', async () => {
    const user = setupUser();
    listPickableItemsMock.mockImplementation(
      (params: { sourceLocationId?: string; scope?: string }) => {
        if (params.sourceLocationId === 'loc-2') {
          return Promise.resolve({ data: [], meta: buildMeta({ total: 0 }) });
        }
        return Promise.resolve({
          data: [buildPickable(), pickableCable],
          meta: buildMeta({ total: 2 }),
        });
      },
    );
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/);
    expect(await screen.findByText(/ONT-001 · ONT WiFi 6/)).toBeInTheDocument();
    expect(screen.queryByText('Bodega cambiada')).not.toBeInTheDocument();

    // Cambio de bodega: aviso explicito y disponible anterior invalidado.
    mockSourceId = 'loc-2';
    await user.click(screen.getByRole('button', { name: 'Origen' }));

    expect(await screen.findByText('Bodega cambiada')).toBeInTheDocument();
    expect(screen.getByText(/Supera el material disponible en origen/i)).toBeInTheDocument();
  });

  it('CA-S2.1-FE05: con busy la cantidad inline y las acciones se deshabilitan', async () => {
    const user = setupUser();
    const { rerender } = renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await addViaSearch(user, 'ONT', /ONT WiFi 6/);
    const quantityInput = await screen.findByLabelText(/Cantidad ONT WiFi/i);
    expect(quantityInput).toBeEnabled();

    rerender(<StockIssueComposer onSubmit={jest.fn()} isSubmitting />);

    expect(screen.getByLabelText(/Cantidad ONT WiFi/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modificar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeDisabled();
  });
});
