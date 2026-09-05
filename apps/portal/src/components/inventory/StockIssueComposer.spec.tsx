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
  availableSerialCount: 1,
});

function buildMeta(overrides: Record<string, unknown> = {}) {
  return {
    nextCursor: null,
    total: 0,
    totalIsEstimate: false,
    page: null,
    limit: 25,
    totalPages: null,
    hasMore: false,
    mode: 'cursor' as const,
    capabilities: { randomAccess: false, sortableFields: [] as string[] },
    sort: null,
    ...overrides,
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
    (params: { scope?: string; q?: string; cursor?: string }) => {
      const pool = params.scope === 'catalog' ? catalog : stock;
      const q = params.q?.trim().toLowerCase() ?? '';
      const filtered = q
        ? pool.filter((item) => `${item.sku} ${item.name}`.toLowerCase().includes(q))
        : pool;
      const total =
        params.scope === 'catalog' ? filtered.length : (options?.stockTotal ?? filtered.length);
      return Promise.resolve({ data: filtered, meta: buildMeta({ total }) });
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
            ],
            meta: {
              nextCursor: null,
              total: 1,
              totalIsEstimate: false,
              page: null,
              limit: 50,
              totalPages: null,
              hasMore: false,
              mode: 'cursor',
              capabilities: { randomAccess: false, sortableFields: [] },
              sort: null,
            },
          });
        }
        return Promise.resolve({
          data: [],
          meta: {
            nextCursor: null,
            total: 0,
            totalIsEstimate: false,
            page: null,
            limit: 50,
            totalPages: null,
            hasMore: false,
            mode: 'cursor',
            capabilities: { randomAccess: false, sortableFields: [] },
            sort: null,
          },
        });
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
    const user = userEvent.setup();
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

  it('CA-S1-01: el tab con más filas que la página ofrece Cargar más', async () => {
    const user = userEvent.setup();
    const pageOne = Array.from({ length: 25 }, (_, index) =>
      buildPickable({ itemId: `item-${index}`, sku: `SKU-${index}`, name: `Producto ${index}` }),
    );
    listPickableItemsMock.mockImplementation((params: { scope?: string; cursor?: string }) => {
      if (params.scope === 'catalog') {
        return Promise.resolve({ data: [], meta: buildMeta({ total: 0 }) });
      }
      if (params.cursor === 'cursor-2') {
        return Promise.resolve({
          data: [buildPickable({ itemId: 'item-25', sku: 'SKU-25', name: 'Producto 25' })],
          meta: buildMeta({ total: 26, hasMore: false, nextCursor: null }),
        });
      }
      return Promise.resolve({
        data: pageOne,
        meta: buildMeta({ total: 26, hasMore: true, nextCursor: 'cursor-2' }),
      });
    });

    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    expect(await screen.findByRole('tab', { name: 'Con material (26)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => {
      expect(screen.getByText(/SKU-25 · Producto 25/)).toBeInTheDocument();
    });
    expect(listPickableItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
      expect.anything(),
    );
  });

  it('CA-S1-02: el catálogo muestra categoría, unidad y disponible reales', async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    renderComposer({ onSubmit });

    expect(screen.getByRole('heading', { name: 'Datos de la salida' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Con material/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));

    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(screen.getAllByText('ONT-001 · ONT WiFi 6').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('columnheader', { name: 'Disponible en origen' }).length,
    ).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: 'Crear salida' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockIssueType.TECHNICIAN_CUSTODY,
        sourceLocationId: 'loc-1',
        destinationLocationId: 'loc-2',
        lines: [
          expect.objectContaining({ itemId: 'item-1', condition: StockBalanceCondition.NEW }),
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
    const user = userEvent.setup();

    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));

    expect(await screen.findByText(/Disponible en origen: 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    const quantityInput = screen.getByLabelText(/Cantidad ONT-001/i);
    await user.clear(quantityInput);
    await user.type(quantityInput, '9');

    expect(screen.getByText(/Supera el material disponible en origen/i)).toBeInTheDocument();
  });

  it('CA-S1-07: la línea con lote muestra número real y vencimiento, y el disponible sigue a la tupla', async () => {
    const user = userEvent.setup();
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

    // Lote único: la línea nace con ese lote y la columna no salta de 50 a 0.
    expect(screen.getByLabelText('Lote ONT-001 · ONT WiFi 6')).toHaveTextContent(
      'LOTE-A · vence 20/05/2026 · 50',
    );
    expect(screen.getByRole('cell', { name: '50' })).toBeInTheDocument();
  });

  it('deja la elección al operador cuando hay más de un lote en origen', async () => {
    const user = userEvent.setup();
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

    // Con dos lotes no se adivina: la línea queda sin lote, muestra 0 y decide el operador.
    expect(screen.getByLabelText('Lote ONT-001 · ONT WiFi 6')).toHaveTextContent(
      'Sin lote específico',
    );
    expect(screen.getByRole('cell', { name: '0' })).toBeInTheDocument();
  });

  it('CA-S1-04: un ítem serializado desde Catálogo ofrece el selector de serial', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));

    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(
      await screen.findByRole('combobox', { name: 'Serial SER-9 · Router Onu Gpon' }),
    ).toBeInTheDocument();
  });

  it('CA-S1-05: Crear salida queda habilitado y al enviar bloquea con error inline, global y foco', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderComposer({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(screen.getByRole('tab', { name: /Catálogo/ }));

    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));
    await user.click(screen.getByRole('button', { name: 'Destino' }));

    const serialInput = await screen.findByRole('combobox', {
      name: 'Serial SER-9 · Router Onu Gpon',
    });
    const submitButton = screen.getByRole('button', { name: 'Crear salida' });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('No se pudo crear la salida')).toBeInTheDocument();
    // Global + inline por línea con el mismo mensaje.
    const messages = await screen.findAllByText(
      'Selecciona el serial del activo para SER-9 · Router Onu Gpon.',
    );
    expect(messages).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent(/serial/i);
    await waitFor(() => {
      expect(document.activeElement).toBe(serialInput);
    });

    // Al elegir el serial, el envío avanza.
    await user.click(serialInput);
    await user.click(await screen.findByRole('option', { name: /SN-001/ }));
    await user.click(screen.getByRole('button', { name: 'Crear salida' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [expect.objectContaining({ itemId: 'item-serial', serializedAssetId: 'asset-1' })],
        }),
      );
    });
  });

  it('avisa cuando el serializado no tiene seriales en la bodega y mantiene el bloqueo', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    mockPickableBackend({
      stock: [buildPickable({ ...pickableRouter, availableSerialCount: 0 })],
      catalog: [buildPickable({ ...pickableRouter, availableSerialCount: 0 })],
    });
    listAssetsMock.mockResolvedValue({
      data: [],
      meta: buildMeta({ total: 0, limit: 50 }),
    });
    renderComposer({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Origen' }));
    await user.click(await screen.findByRole('checkbox', { name: /Seleccionar SER-9/i }));
    await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

    expect(
      await screen.findByText(
        'Este producto serializado no tiene seriales disponibles en esta bodega.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear salida' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('No se pudo crear la salida')).toBeInTheDocument();
  });

  it('la vía manual hidrata el serializado y exige serial (C3)', async () => {
    const user = userEvent.setup();
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

    // getItem aporta SERIALIZED: la línea ofrece serial en vez de "—".
    expect(await screen.findByRole('combobox', { name: /Serial/ })).toBeInTheDocument();
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

  it('la edición hidrata el serializado desde el caché B1 (C3)', async () => {
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

    // La línea serializada ofrece el selector aunque venga del detalle.
    expect(
      await screen.findByRole('combobox', { name: 'Serial SER-9 · Router Onu Gpon' }),
    ).toBeInTheDocument();
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
    // Coincidencia única: queda marcada sin clic manual.
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /ONT Escaneada/i })).toBeChecked();
    });
  });
});
