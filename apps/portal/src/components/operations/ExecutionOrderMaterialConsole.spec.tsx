// R3 — consumo y custodia de punta a punta en la consola de OT (CA-10 / CA-11).
//
// Se monta `ExecutionOrdersClient` con la API simulada: lo que se verifica es qué
// consulta la consola y cuándo (la custodia solo al abrir «Registrar equipo
// instalado»), qué ofrece al usuario y cómo se comporta ante el error, el cierre,
// el cambio de OT, la desconexión y el refresco tras registrar. Los cuatro casos de
// «custodia del ejecutor» de `ExecutionOrdersClient.spec.tsx` viven aquí desde R3.
import type { ReactNode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRole, WfmWorkType } from '@iwana/shared';
import { ExecutionOrdersClient } from './ExecutionOrdersClient';
import { ApiError, inventoryApi, tasksApi } from '@/lib/api-client';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
let searchParamsMock = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => searchParamsMock,
}));

jest.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'tech-001', role: UserRole.TECHNICIAN } }),
}));

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
    }
  },
  inventoryApi: {
    listCategories: jest.fn(),
    listItems: jest.fn(),
    listLocations: jest.fn(),
    getExecutorCustody: jest.fn(),
  },
  organizationApi: { list: jest.fn().mockResolvedValue({ data: [], meta: {} }) },
  tasksApi: {
    get: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    timeline: jest.fn().mockResolvedValue([]),
    assignmentHistory: jest.fn().mockResolvedValue([]),
    transition: jest.fn(),
    executionOrders: {
      list: jest.fn(),
      get: jest.fn(),
      listActivities: jest.fn(),
      listItemUsage: jest.fn(),
      listEvidence: jest.fn(),
      listTemplateVersions: jest.fn(),
      registerItemUsage: jest.fn(),
    },
    create: jest.fn(),
  },
  usersApi: { searchForPicker: jest.fn().mockResolvedValue({ data: [], total: 0 }) },
}));

const pageMeta = (overrides: Record<string, unknown> = {}) => ({
  nextCursor: null,
  total: 1,
  totalIsEstimate: false,
  page: 1,
  limit: 100,
  totalPages: 1,
  hasMore: false,
  mode: 'page',
  capabilities: { randomAccess: true, sortableFields: [] },
  sort: null,
  ...overrides,
});

const cursorMeta = (overrides: Record<string, unknown> = {}) =>
  pageMeta({ mode: 'cursor', page: null, totalPages: null, ...overrides });

function buildOrder(
  id: string,
  number: string,
  {
    assigneeId = 'tech-001',
    withAssignee = true,
    status = 'IN_PROGRESS',
    allowedActions = ['REGISTER_ITEM_USAGE'],
    version = 1,
  }: {
    assigneeId?: string;
    withAssignee?: boolean;
    status?: string;
    allowedActions?: string[];
    version?: number;
  } = {},
) {
  return {
    id,
    number,
    version,
    status,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-001',
      key: 'INSTALACION_ESTANDAR',
      version: 2,
      label: 'Instalación estándar',
      requirements: [
        {
          key: 'installed-equipment',
          label: 'Equipos instalados en el sitio del cliente',
          required: true,
          kind: 'MATERIAL',
          itemCategory: 'CPE',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        },
      ],
    },
    schedule: {
      eventId: 'event-001',
      window: { startAt: '2026-10-05T14:00:00.000Z', endAt: '2026-10-05T16:00:00.000Z' },
    },
    ...(withAssignee
      ? { assignee: { type: 'TECHNICIAN', id: assigneeId, displayLabel: 'Carlos López' } }
      : {}),
    site: { id: 'site-001', label: 'Sitio autorizado' },
    completion: {
      progress: 0,
      requirements: [
        {
          requirementId: 'installed-equipment',
          label: 'Equipos instalados en el sitio del cliente',
          kind: 'MATERIAL',
          satisfied: false,
        },
      ],
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
  } as never;
}

const catalogItem = (id: string, categoryCode = 'CPE') =>
  ({
    id,
    sku: `SKU-${id}`,
    name: `Equipo ${id}`,
    status: 'ACTIVE',
    categoryId: `cat-${categoryCode}`,
    categoryCode,
  }) as never;

function custodyResponse(
  page: number,
  totalPages: number,
  assets: Array<{ id: string; item: string; serial: string }>,
  locationName = 'Bodega móvil de Carlos López',
) {
  const m = pageMeta({ page, totalPages, hasMore: page < totalPages, total: assets.length });
  return {
    location: {
      id: 'loc-mobile-001',
      name: locationName,
      type: 'MOBILE_TECHNICIAN',
      responsibleType: 'TECHNICIAN',
      responsibleRefId: 'tech-001',
    },
    assets: {
      items: assets.map((asset) => ({
        id: asset.id,
        inventoryItemId: asset.item,
        serialNumber: asset.serial,
        currentStatus: 'ASSIGNED_TO_TECHNICIAN',
      })),
      meta: m,
    },
    balances: { items: [], meta: pageMeta({ total: 0, totalPages: 0 }) },
  } as never;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const setOnline = (value: boolean) =>
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });

const materialButton = () =>
  screen.findByRole('button', { name: /^Registrar equipo instalado para / });
const sheet = () => screen.getByRole('region', { name: 'Registrar equipo instalado' });

describe('Consola de OT — consumo y custodia bajo demanda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setOnline(true);
    searchParamsMock = new URLSearchParams();
    mockPush.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    mockReplace.mockImplementation((href: string) => {
      searchParamsMock = new URLSearchParams(String(href).split('?')[1] ?? '');
    });
    jest.mocked(tasksApi.executionOrders.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      meta: pageMeta({ limit: 20, total: 0, totalPages: 0 }),
    } as never);
    jest.mocked(tasksApi.executionOrders.listActivities).mockResolvedValue([] as never);
    jest.mocked(tasksApi.executionOrders.listItemUsage).mockResolvedValue([] as never);
    jest
      .mocked(tasksApi.executionOrders.listEvidence)
      .mockResolvedValue({ data: [], meta: pageMeta({ total: 0 }) } as never);
    jest.mocked(inventoryApi.listCategories).mockResolvedValue({
      data: [{ id: 'cat-CPE', code: 'CPE' }],
      meta: cursorMeta(),
    } as never);
    jest
      .mocked(inventoryApi.listItems)
      .mockResolvedValue({ data: [catalogItem('item-ont')], meta: cursorMeta() } as never);
    jest
      .mocked(inventoryApi.getExecutorCustody)
      .mockResolvedValue(
        custodyResponse(1, 1, [
          { id: 'custody-asset-001', item: 'item-ont', serial: 'ONT-2026-001' },
        ]),
      );
  });

  afterEach(() => {
    searchParamsMock = new URLSearchParams();
  });

  function openOrder(id: string, number: string, options?: Parameters<typeof buildOrder>[2]) {
    jest.mocked(tasksApi.executionOrders.get).mockResolvedValue(buildOrder(id, number, options));
    searchParamsMock = new URLSearchParams({ executionOrderId: id });
    return render(<ExecutionOrdersClient />);
  }

  const expectNoInventoryReads = () => {
    expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
    expect(inventoryApi.listItems).not.toHaveBeenCalled();
    expect(inventoryApi.listCategories).not.toHaveBeenCalled();
    expect(inventoryApi.listLocations).not.toHaveBeenCalled();
  };

  describe('cuándo se consulta (CA-10)', () => {
    it('cargar la OT en progreso, aunque permita registrar consumo, no consulta custodia ni inventario', async () => {
      openOrder('eo-001', 'OT-001');

      expect(await materialButton()).toBeInTheDocument();
      expect(screen.queryByText('En custodia del ejecutor')).not.toBeInTheDocument();
      expectNoInventoryReads();
    });

    it.each(['CREATED', 'ASSIGNED', 'EN_ROUTE'])(
      'preinicio (%s) no monta el acto ni consulta, aunque llegue REGISTER_ITEM_USAGE',
      async (status) => {
        openOrder('eo-pre', 'OT-PRE', {
          status,
          allowedActions: ['START', 'REGISTER_ITEM_USAGE'],
        });

        expect((await screen.findAllByText('OT-PRE')).length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByRole('button', { name: /^Registrar equipo instalado/ })).toBeNull();
        expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
        expectNoInventoryReads();
      },
    );

    it.each(['BLOCKED', 'COMPLETED', 'CANCELLED'])(
      'solo lectura (%s) no ofrece el acto ni consulta',
      async (status) => {
        openOrder('eo-ro', 'OT-RO', { status, allowedActions: [] });

        expect((await screen.findAllByText('OT-RO')).length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByRole('button', { name: /^Registrar equipo instalado/ })).toBeNull();
        expectNoInventoryReads();
      },
    );

    it('sin REGISTER_ITEM_USAGE en progreso tampoco consulta', async () => {
      openOrder('eo-sin-permiso', 'OT-SIN-PERMISO', { allowedActions: ['REGISTER_EVIDENCE'] });

      expect((await screen.findAllByText('OT-SIN-PERMISO')).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: /^Registrar equipo instalado/ })).toBeNull();
      expectNoInventoryReads();
    });

    it('al abrir el acto consulta la custodia del responsable de la OT y muestra lo compatible', async () => {
      openOrder('eo-custody-001', 'OT-CUSTODY-001', { assigneeId: 'tech-777' });
      await userEvent.setup().click(await materialButton());

      expect(await within(sheet()).findByText('ONT-2026-001')).toBeInTheDocument();
      // El id que se consulta es el del responsable de la OT, no el de una ubicación de stock.
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledWith('tech-777', {
        page: 1,
        limit: 100,
      });
      expect(inventoryApi.listLocations).not.toHaveBeenCalled();
      expect(within(sheet()).getByText('En custodia del ejecutor')).toBeInTheDocument();
      // El nombre de la custodia llega a la vista y a la custodia de origen preseleccionada.
      expect(
        within(sheet()).getByRole('combobox', { name: 'Custodia de origen' }),
      ).toHaveTextContent('Bodega móvil de Carlos López');
    });

    it('cancelar el acto y volver a abrirlo vuelve a consultar; cerrarlo no consulta nada más', async () => {
      const user = userEvent.setup();
      openOrder('eo-reopen', 'OT-REOPEN');
      await user.click(await materialButton());
      await within(sheet()).findByText('ONT-2026-001');
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1);

      await user.click(within(sheet()).getByRole('button', { name: 'Cancelar' }));
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1);

      await user.click(await materialButton());
      await within(sheet()).findByText('ONT-2026-001');
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(2);
    });
  });

  describe('selección por categoría (CA-11)', () => {
    it('recorre varias páginas de custodia: el equipo compatible de la última página se ofrece', async () => {
      const user = userEvent.setup();
      jest
        .mocked(inventoryApi.getExecutorCustody)
        .mockResolvedValueOnce(
          custodyResponse(1, 3, [{ id: 'a1', item: 'item-herramienta', serial: 'HERR-1' }]),
        )
        .mockResolvedValueOnce(
          custodyResponse(2, 3, [{ id: 'a2', item: 'item-herramienta', serial: 'HERR-2' }]),
        )
        .mockResolvedValueOnce(
          custodyResponse(3, 3, [{ id: 'a3', item: 'item-ont', serial: 'ONT-PAG-3' }]),
        );
      openOrder('eo-paginas', 'OT-PAGINAS');
      await user.click(await materialButton());

      expect(await within(sheet()).findByText('ONT-PAG-3')).toBeInTheDocument();
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(3);
      expect(within(sheet()).queryByText('HERR-1')).toBeNull();
      await user.click(within(sheet()).getByRole('combobox', { name: 'Ítem' }));
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
        'SKU-item-ont · Equipo item-ont',
      ]);
      expect(
        screen.queryByText('No hay equipos de esta categoría en tu custodia'),
      ).not.toBeInTheDocument();
    });

    it('sin equipos de la categoría en ninguna página muestra el copy de UX §5 y no ofrece otra categoría', async () => {
      jest
        .mocked(inventoryApi.getExecutorCustody)
        .mockResolvedValue(
          custodyResponse(1, 1, [{ id: 'a1', item: 'item-herramienta', serial: 'HERR-1' }]),
        );
      openOrder('eo-vacio', 'OT-VACIO');
      await userEvent.setup().click(await materialButton());

      expect(
        await within(sheet()).findByText('No hay equipos de esta categoría en tu custodia'),
      ).toBeInTheDocument();
      expect(
        within(sheet()).getByText('Contacta a supervisión para revisar la disponibilidad.'),
      ).toBeInTheDocument();
      expect(within(sheet()).queryByText('HERR-1')).toBeNull();
      expect(within(sheet()).getByRole('combobox', { name: 'Ítem' })).toBeDisabled();
    });

    it('sin responsable asignado no consulta custodia y muestra el vacío', async () => {
      openOrder('eo-custody-none', 'OT-SIN-ASSIGNEE', { withAssignee: false });
      await userEvent.setup().click(await materialButton());

      expect(
        await within(sheet()).findByText('No hay equipos de esta categoría en tu custodia'),
      ).toBeInTheDocument();
      expect(inventoryApi.getExecutorCustody).not.toHaveBeenCalled();
    });
  });

  describe('error, reintento, cancelación y cambio de OT', () => {
    it('mantiene la OT operativa cuando la custodia responde 404 y el reintento recupera', async () => {
      const user = userEvent.setup();
      jest
        .mocked(inventoryApi.getExecutorCustody)
        .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Endpoint no disponible'))
        .mockResolvedValueOnce(
          custodyResponse(1, 1, [{ id: 'a1', item: 'item-ont', serial: 'ONT-REINTENTO' }]),
        );
      openOrder('eo-404', 'OT-404');
      await user.click(await materialButton());

      expect(await within(sheet()).findByText('Custodia no disponible')).toBeInTheDocument();
      // La orden sigue operativa: el resumen y el historial siguen ahí.
      expect(screen.getAllByText('OT-404').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Equipos y materiales')).toBeInTheDocument();
      expect(within(sheet()).getByRole('combobox', { name: 'Ítem' })).toBeDisabled();

      await user.click(within(sheet()).getByRole('button', { name: 'Reintentar' }));

      expect(await within(sheet()).findByText('ONT-REINTENTO')).toBeInTheDocument();
      expect(within(sheet()).queryByText('Custodia no disponible')).toBeNull();
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(2);
      // El reintento no vuelve a leer la orden entera.
      expect(tasksApi.executionOrders.get).toHaveBeenCalledTimes(1);
    });

    it('descarta la respuesta tardía si se cierra el drawer mientras la custodia está en vuelo', async () => {
      const user = userEvent.setup();
      const late = deferred<never>();
      jest.mocked(inventoryApi.getExecutorCustody).mockReturnValue(late.promise);
      openOrder('eo-late', 'OT-LATE');
      await user.click(await materialButton());
      await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1));
      expect(within(sheet()).getByLabelText('Cargando custodia del ejecutor')).toBeInTheDocument();

      const veil = document.body.querySelector<HTMLElement>('[data-portal-veil]');
      expect(veil).not.toBeNull();
      await user.click(veil as HTMLElement);
      expect(screen.queryByText('OT-LATE')).not.toBeInTheDocument();

      await act(async () => {
        late.resolve(
          custodyResponse(
            1,
            1,
            [{ id: 'tarde', item: 'item-ont', serial: 'ONT-TARDIO-001' }],
            'Custodia tardía',
          ),
        );
      });

      expect(screen.queryByText('Custodia tardía')).not.toBeInTheDocument();
      expect(screen.queryByText('ONT-TARDIO-001')).not.toBeInTheDocument();
      expect(screen.queryByText('En custodia del ejecutor')).not.toBeInTheDocument();
    });

    it('cambio de OT con la custodia en vuelo: la respuesta de la anterior no aparece en la nueva', async () => {
      const user = userEvent.setup();
      const late = deferred<never>();
      jest.mocked(inventoryApi.getExecutorCustody).mockReturnValueOnce(late.promise);
      const { rerender } = openOrder('eo-a', 'OT-A', { assigneeId: 'tech-aaa' });
      await user.click(await materialButton());
      await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1));

      // Se navega a otra orden sin cerrar la anterior.
      jest
        .mocked(tasksApi.executionOrders.get)
        .mockResolvedValue(buildOrder('eo-b', 'OT-B', { assigneeId: 'tech-bbb' }));
      searchParamsMock = new URLSearchParams({ executionOrderId: 'eo-b' });
      rerender(<ExecutionOrdersClient />);
      expect((await screen.findAllByText('OT-B')).length).toBeGreaterThanOrEqual(1);

      await act(async () => {
        late.resolve(
          custodyResponse(
            1,
            1,
            [{ id: 'a-1', item: 'item-ont', serial: 'ONT-DE-A' }],
            'Custodia de A',
          ),
        );
      });

      expect(screen.queryByText('ONT-DE-A')).not.toBeInTheDocument();
      expect(screen.queryByText('Custodia de A')).not.toBeInTheDocument();
      // La nueva OT no consulta nada hasta que se abra su propio acto.
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1);
      jest
        .mocked(inventoryApi.getExecutorCustody)
        .mockResolvedValueOnce(
          custodyResponse(
            1,
            1,
            [{ id: 'b-1', item: 'item-ont', serial: 'ONT-DE-B' }],
            'Custodia de B',
          ),
        );
      await user.click(await materialButton());
      expect(await within(sheet()).findByText('ONT-DE-B')).toBeInTheDocument();
      expect(inventoryApi.getExecutorCustody).toHaveBeenLastCalledWith('tech-bbb', {
        page: 1,
        limit: 100,
      });
    });

    it('sin conexión con la hoja abierta bloquea el formulario y avisa; al volver la red se puede reintentar', async () => {
      const user = userEvent.setup();
      openOrder('eo-offline', 'OT-OFFLINE');
      await user.click(await materialButton());
      await within(sheet()).findByText('ONT-2026-001');

      setOnline(false);
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(
        await within(sheet()).findByText(
          'Sin conexión; vuelve a intentar cuando recuperes la red.',
        ),
      ).toBeInTheDocument();
      expect(within(sheet()).getByLabelText('Cantidad')).toBeDisabled();
      expect(within(sheet()).getByRole('button', { name: 'Registrar material' })).toBeDisabled();

      setOnline(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(within(sheet()).getByLabelText('Cantidad')).toBeEnabled();
    });
  });

  describe('registro y refresco', () => {
    it('registra el consumo con el payload vigente y, con la hoja abierta, refresca la custodia', async () => {
      const user = userEvent.setup();
      jest
        .mocked(tasksApi.executionOrders.registerItemUsage)
        .mockResolvedValue({ id: 'iu-nuevo' } as never);
      openOrder('eo-registro', 'OT-REGISTRO', { version: 7 });
      await user.click(await materialButton());
      await within(sheet()).findByText('ONT-2026-001');

      await user.click(within(sheet()).getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'SKU-item-ont · Equipo item-ont' }));
      await user.type(within(sheet()).getByLabelText('Serial o lote'), 'ONT-2026-001');
      await user.click(within(sheet()).getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Instalar' }));
      await user.click(within(sheet()).getByRole('button', { name: 'Registrar material' }));

      await waitFor(() =>
        expect(tasksApi.executionOrders.registerItemUsage).toHaveBeenCalledTimes(1),
      );
      expect(tasksApi.executionOrders.registerItemUsage).toHaveBeenCalledWith(
        'eo-registro',
        {
          itemId: 'item-ont',
          requirementKey: 'installed-equipment',
          technicianCustodyId: 'tech-001',
          quantity: 1,
          serialNumber: 'ONT-2026-001',
          action: 'INSTALL',
          finalDisposition: 'INSTALLED_AT_CUSTOMER',
        },
        7,
      );
      // Tras registrar, con MATERIAL todavía abierto, la disponibilidad se vuelve a leer.
      await waitFor(() => expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(2));
      expect(await within(sheet()).findByText('ONT-2026-001')).toBeInTheDocument();
      expect(within(sheet()).getByLabelText('Serial o lote')).toHaveValue('');
    });

    it('un fallo al registrar conserva la captura y no recarga la custodia', async () => {
      const user = userEvent.setup();
      jest
        .mocked(tasksApi.executionOrders.registerItemUsage)
        .mockRejectedValue(new ApiError(409, 'VERSION_CONFLICT', 'Conflicto de versión'));
      openOrder('eo-falla', 'OT-FALLA');
      await user.click(await materialButton());
      await within(sheet()).findByText('ONT-2026-001');
      await user.click(within(sheet()).getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'SKU-item-ont · Equipo item-ont' }));
      await user.type(within(sheet()).getByLabelText('Serial o lote'), 'ONT-2026-001');
      await user.click(within(sheet()).getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Instalar' }));
      await user.click(within(sheet()).getByRole('button', { name: 'Registrar material' }));

      await waitFor(() =>
        expect(tasksApi.executionOrders.registerItemUsage).toHaveBeenCalledTimes(1),
      );
      expect(within(sheet()).getByLabelText('Serial o lote')).toHaveValue('ONT-2026-001');
      expect(inventoryApi.getExecutorCustody).toHaveBeenCalledTimes(1);
    });
  });
});
