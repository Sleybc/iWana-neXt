/**
 * Pestaña «Equipos» y tarjeta «Equipos instalados» (spec 2026-11-16 equipos del suscriptor,
 * §2.2–§2.4; CA-3, CA-6, CA-7, CA-8). Mocks derivados de los tipos del contrato A1 v1.0,
 * no de la implementación del backend.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  AccessPermissionKey,
  AssetLifecycleEventType,
  InventoryResponsibleType,
  SerializedAssetStatus,
  SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
  type ListMeta,
  type SubscriberEquipmentHistoryItem,
  type SubscriberEquipmentItem,
  type SubscriberEquipmentResponse,
  type SubscriberMaterialItem,
} from '@iwana/shared';
import { inventoryApi, type SerializedAssetDetailRecord } from '@/lib/api-client';
import { SubscriberEquipmentTab } from './SubscriberEquipmentTab';
import { SubscriberInstalledEquipmentCard } from './SubscriberOverviewCards';
import { useSubscriberEquipment } from './use-subscriber-equipment';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: () => ({
    hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
  }),
}));

const SUBSCRIBER_ID = 'subscriber-synthetic';

function meta(total: number, page = 1, hasMore = false): ListMeta {
  const limit = SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT;
  return {
    nextCursor: null,
    total,
    totalIsEstimate: false,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
  };
}

function equipmentItem(overrides: Partial<SubscriberEquipmentItem> = {}): SubscriberEquipmentItem {
  return {
    loanId: 'loan-1',
    assetId: 'asset-1',
    itemName: 'ONT WiFi 6',
    model: 'HG8145X6',
    serialNumber: 'SN-0001',
    macAddress: 'AA:BB:CC:00:00:01',
    status: SerializedAssetStatus.INSTALLED_COMODATO,
    installedAt: '2026-10-01T15:00:00.000Z',
    removedAt: null,
    executionOrderRefId: 'order-1',
    contractRefId: 'contract-1',
    usefulLife: {
      monthsTotal: 36,
      monthsElapsed: 1,
      monthsRemaining: 35,
      warrantyUntil: '2027-10-01',
      status: 'vigente',
    },
    ...overrides,
  };
}

function material(overrides: Partial<SubscriberMaterialItem> = {}): SubscriberMaterialItem {
  return {
    movementId: 'mov-1',
    movementNumber: 'MOV-0001',
    occurredAt: '2026-10-01T15:00:00.000Z',
    itemName: 'Cable drop',
    quantity: '25',
    unitOfMeasure: 'METER',
    executionOrderRefId: 'order-1',
    ...overrides,
  };
}

function event(
  overrides: Partial<SubscriberEquipmentHistoryItem> = {},
): SubscriberEquipmentHistoryItem {
  return {
    id: 'evt-1',
    assetId: 'asset-1',
    serialNumber: 'SN-0001',
    eventType: AssetLifecycleEventType.INSTALLED,
    occurredAt: '2026-10-01T15:00:00.000Z',
    ...overrides,
  };
}

const OPEN_2 = equipmentItem({
  loanId: 'loan-2',
  assetId: 'asset-2',
  model: null,
  itemName: 'Router mesh',
  serialNumber: 'SN-0002',
  macAddress: null,
  executionOrderRefId: null,
});
const RETIRED = equipmentItem({
  loanId: 'loan-3',
  assetId: 'asset-3',
  model: 'EG8145V5',
  serialNumber: 'SN-0003',
  status: SerializedAssetStatus.AVAILABLE,
  removedAt: '2026-09-01T10:00:00.000Z',
  installedAt: '2026-01-01T10:00:00.000Z',
});

function fullResponse(): SubscriberEquipmentResponse {
  return {
    equipment: [equipmentItem(), OPEN_2, RETIRED],
    materials: {
      // Un movimiento con dos ítems repite movementId (aviso de A2).
      items: [
        material(),
        material({ itemName: 'Conector SC/APC', quantity: '2', unitOfMeasure: 'UNIT' }),
      ],
      meta: meta(3, 1, true),
    },
    history: {
      items: [
        event(),
        event({
          id: 'evt-2',
          assetId: 'asset-3',
          serialNumber: 'SN-0003',
          eventType: AssetLifecycleEventType.RETURNED,
          occurredAt: '2026-09-01T10:00:00.000Z',
        }),
      ],
      meta: meta(3, 1, true),
    },
  };
}

function emptyResponse(): SubscriberEquipmentResponse {
  return {
    equipment: [],
    materials: { items: [], meta: meta(0) },
    history: { items: [], meta: meta(0) },
  };
}

function assetDetail(): SerializedAssetDetailRecord {
  return {
    id: 'asset-1',
    tenantId: 'tenant-synthetic',
    inventoryItemId: 'item-1',
    serialNumber: 'SN-0001',
    normalizedSerialNumber: 'SN-0001',
    macAddress: 'AA:BB:CC:00:00:01',
    normalizedMacAddress: 'AA:BB:CC:00:00:01',
    assetTag: null,
    currentStatus: SerializedAssetStatus.INSTALLED_COMODATO,
    currentLocationId: null,
    currentResponsibleType: InventoryResponsibleType.NONE,
    currentResponsibleRefId: null,
    subscriberRefId: null,
    contractRefId: null,
    purchaseOrderRef: null,
    purchaseDate: null,
    usefulLifeMonths: null,
    warrantyUntil: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    item: { id: 'item-1', sku: 'ONT-001', name: 'ONT WiFi 6', categoryName: 'CPE' },
    currentLocation: null,
    purchaseOrigin: null,
    usefulLife: {
      monthsTotal: null,
      monthsElapsed: null,
      monthsRemaining: null,
      warrantyUntil: null,
      status: 'sin-dato',
    },
    lifecycle: { data: [], total: 0, page: 1, limit: 20 },
    movements: { data: [], total: 0, page: 1, limit: 20 },
    loans: { data: [], total: 0 },
  } as unknown as SerializedAssetDetailRecord;
}

function Harness({
  anonymized = false,
  onOpenEquipment = () => undefined,
}: {
  anonymized?: boolean;
  onOpenEquipment?: () => void;
}) {
  const equipment = useSubscriberEquipment(SUBSCRIBER_ID, true);
  return (
    <>
      <SubscriberInstalledEquipmentCard equipment={equipment} onOpenEquipment={onOpenEquipment} />
      <SubscriberEquipmentTab equipment={equipment} anonymized={anonymized} />
    </>
  );
}

function section(name: string) {
  return screen.getByRole('region', { name });
}

const getEquipment = () => jest.spyOn(inventoryApi, 'getSubscriberEquipment');

describe('SubscriberEquipmentTab y tarjeta Equipos instalados', () => {
  beforeEach(() => {
    mockGranted.current = new Set([
      AccessPermissionKey.INVENTORY_STOCK_READ,
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    ]);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('estados §2.3 (CA-7)', () => {
    it('cargando: skeleton con la rejilla de las tablas y del historial', () => {
      getEquipment().mockReturnValue(new Promise(() => undefined));
      const { container } = render(<Harness />);
      expect(screen.getByText('Cargando equipos instalados…')).toBeInTheDocument();
      expect(screen.getByText('Cargando materiales usados…')).toBeInTheDocument();
      // Equipos y materiales: 3 filas de skeleton cada una, con sus columnas.
      expect(container.querySelectorAll('[data-table-skeleton-row]')).toHaveLength(6);
      const firstSkeletonRow = container.querySelector('[data-table-skeleton-row]');
      expect(firstSkeletonRow?.querySelectorAll('td')).toHaveLength(5);
      expect(container.querySelectorAll('[data-timeline-skeleton-row]')).toHaveLength(3);
    });

    it('vacío: mensaje del suscriptor sin equipos y sin botón para crear', async () => {
      getEquipment().mockResolvedValue(emptyResponse());
      render(<SubscriberEquipmentTabOnly />);
      const installed = section('Equipos instalados');
      expect(
        await within(installed).findByText('Este suscriptor no tiene equipos registrados'),
      ).toBeInTheDocument();
      expect(within(installed).queryByRole('button')).not.toBeInTheDocument();
      expect(
        within(section('Historial de equipos')).getByText('Sin eventos de equipos'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Ningún evento coincide con el filtro')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Quitar filtro' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /crear|registrar|agregar/i }),
      ).not.toBeInTheDocument();
    });

    it('filtro sin resultados: aviso propio con «Quitar filtro», distinto del vacío', async () => {
      const user = userEvent.setup();
      const spy = getEquipment()
        .mockResolvedValueOnce(fullResponse())
        .mockResolvedValueOnce({ ...fullResponse(), history: { items: [], meta: meta(0) } })
        .mockResolvedValueOnce(fullResponse());
      render(<Harness />);
      const history = await screen.findByRole('region', { name: 'Historial de equipos' });
      await within(history).findByText('Instalación');

      await user.selectOptions(within(history).getByLabelText('Equipo'), 'asset-2');
      expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
        historyPage: 1,
        historyLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
        historyAssetId: 'asset-2',
      });
      expect(
        await within(history).findByText('Ningún evento coincide con el filtro'),
      ).toBeInTheDocument();
      expect(within(history).queryByText('Sin eventos de equipos')).not.toBeInTheDocument();

      await user.click(within(history).getByRole('button', { name: 'Quitar filtro' }));
      expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
        historyPage: 1,
        historyLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
      });
      expect(await within(history).findByText('Instalación')).toBeInTheDocument();
      expect(within(history).getByLabelText('Equipo')).toHaveValue('');
    });

    it('error: aviso compacto con «Reintentar», la cabecera se mantiene y el foco vuelve al título', async () => {
      const user = userEvent.setup();
      getEquipment().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      const installed = section('Equipos instalados');
      expect(
        await within(installed).findByText('No pudimos cargar los equipos'),
      ).toBeInTheDocument();
      expect(
        within(installed).getByRole('heading', { name: 'Equipos instalados' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('boom')).not.toBeInTheDocument();

      await user.click(within(installed).getByRole('button', { name: 'Reintentar' }));
      expect(await within(installed).findByText('SN-0001')).toBeInTheDocument();
      await waitFor(() =>
        expect(
          within(installed).getByRole('heading', { name: 'Equipos instalados' }),
        ).toHaveFocus(),
      );
    });

    it('titular anonimizado: equipos e historial visibles, sin «Ver ficha del equipo» ni «Ver OT» (C1)', async () => {
      const user = userEvent.setup();
      const writeText = jest.spyOn(navigator.clipboard, 'writeText');
      const getAsset = jest.spyOn(inventoryApi, 'getAsset');
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly anonymized />);
      const installed = await screen.findByRole('region', { name: 'Equipos instalados' });
      await within(installed).findByText('SN-0001');
      expect(within(section('Historial de equipos')).getByText('Instalación')).toBeInTheDocument();
      expect(within(section('Materiales usados')).queryByRole('link')).not.toBeInTheDocument();

      // El menú queda con las dos copias y sigue operable con teclado.
      const trigger = within(installed).getByRole('button', { name: /Acciones de HG8145X6/ });
      act(() => trigger.focus());
      await user.keyboard('{ArrowDown}');
      await waitFor(() =>
        expect(screen.getByRole('menuitem', { name: 'Copiar serial' })).toHaveFocus(),
      );
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Copiar serial',
        'Copiar MAC',
      ]);
      expect(
        screen.queryByRole('menuitem', { name: 'Ver ficha del equipo' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Ver OT' })).not.toBeInTheDocument();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Copiar MAC' })).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(writeText).toHaveBeenLastCalledWith('AA:BB:CC:00:00:01');
      expect(getAsset).not.toHaveBeenCalled();
    });

    it('titular visible: el menú ofrece «Ver ficha del equipo» (caso contrario de C1)', async () => {
      const user = userEvent.setup();
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      const installed = await screen.findByRole('region', { name: 'Equipos instalados' });
      await user.click(
        await within(installed).findByRole('button', { name: /Acciones de HG8145X6/ }),
      );
      expect(screen.getByRole('menuitem', { name: 'Ver ficha del equipo' })).toBeInTheDocument();
    });
  });

  describe('una sola llamada inicial y páginas aparte (CA-3)', () => {
    it('tarjeta y pestaña comparten la primera llamada, sin parámetros', async () => {
      const spy = getEquipment().mockResolvedValue(fullResponse());
      render(<Harness />);
      await screen.findAllByText('SN-0001');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(SUBSCRIBER_ID);
    });

    it('«Cargar más» de materiales pide solo la página siguiente y la agrega', async () => {
      const user = userEvent.setup();
      const spy = getEquipment()
        .mockResolvedValueOnce(fullResponse())
        .mockResolvedValueOnce({
          ...fullResponse(),
          materials: {
            items: [material({ movementId: 'mov-2', itemName: 'Roseta óptica', quantity: '1' })],
            meta: meta(3, 2, false),
          },
        });
      render(<Harness />);
      const materials = await screen.findByRole('region', { name: 'Materiales usados' });
      await user.click(await within(materials).findByRole('button', { name: 'Cargar más' }));
      expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
        materialsPage: 2,
        materialsLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
      });
      expect(await within(materials).findByText('Roseta óptica')).toBeInTheDocument();
      // Dos ítems del mismo movimiento siguen siendo dos filas.
      expect(within(materials).getAllByRole('row')).toHaveLength(4);
      expect(
        within(materials).queryByRole('button', { name: 'Cargar más' }),
      ).not.toBeInTheDocument();
    });

    it('«Ver más» del historial pide solo la página siguiente', async () => {
      const user = userEvent.setup();
      const spy = getEquipment()
        .mockResolvedValueOnce(fullResponse())
        .mockResolvedValueOnce({
          ...fullResponse(),
          history: {
            items: [
              event({
                id: 'evt-3',
                eventType: AssetLifecycleEventType.REPAIRED,
                occurredAt: '2026-08-01T10:00:00.000Z',
              }),
            ],
            meta: meta(3, 2, false),
          },
        });
      render(<Harness />);
      const history = await screen.findByRole('region', { name: 'Historial de equipos' });
      await user.click(await within(history).findByRole('button', { name: 'Ver más' }));
      expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
        historyPage: 2,
        historyLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
      });
      expect(await within(history).findByText('Reparación')).toBeInTheDocument();
      expect(within(history).getAllByRole('listitem')).toHaveLength(3);
    });
  });

  describe('Equipos instalados', () => {
    it('tabla con encabezados; «Mostrar retirados» añade los cerrados con su fecha de retiro', async () => {
      const user = userEvent.setup();
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      const installed = await screen.findByRole('region', { name: 'Equipos instalados' });
      const table = await within(installed).findByRole('table', { name: 'Equipos instalados' });
      for (const name of ['Equipo', 'Serial', 'MAC', 'Estado', 'Desde', 'Acciones']) {
        expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
      }
      expect(within(table).getAllByText('Instalado en comodato')).toHaveLength(2);
      expect(within(table).queryByText('SN-0003')).not.toBeInTheDocument();

      const toggle = within(installed).getByRole('switch', { name: 'Mostrar retirados' });
      expect(toggle).not.toBeChecked();
      await user.click(toggle);
      const retiredRow = within(table).getByText('SN-0003').closest('tr') as HTMLElement;
      expect(within(retiredRow).getByText('Retirado')).toBeInTheDocument();
      expect(within(retiredRow).getByText(/Retirado el/)).toBeInTheDocument();
      // El estado actual del equipo tras el retiro no se muestra en la fila de este suscriptor.
      expect(within(retiredRow).queryByText('Disponible')).not.toBeInTheDocument();
    });

    it('vocabulario §2.4: sin términos internos ni enums en pantalla', async () => {
      getEquipment().mockResolvedValue(fullResponse());
      const { container } = render(<Harness />);
      await screen.findAllByText('SN-0001');
      const text = container.textContent ?? '';
      for (const forbidden of [/activo serializado/i, /\bloan\b/i, /kardex/i]) {
        expect(text).not.toMatch(forbidden);
      }
      for (const value of [
        ...Object.values(SerializedAssetStatus),
        ...Object.values(AssetLifecycleEventType),
        'METER',
      ]) {
        expect(text).not.toContain(value);
      }
    });
  });

  describe('menú ⋯ por equipo (CA-6, CA-8)', () => {
    it('se opera con teclado y «Ver ficha del equipo» abre el drawer existente', async () => {
      const user = userEvent.setup();
      getEquipment().mockResolvedValue(fullResponse());
      const getAsset = jest.spyOn(inventoryApi, 'getAsset').mockResolvedValue(assetDetail());
      render(<SubscriberEquipmentTabOnly />);
      const trigger = await screen.findByRole('button', {
        name: 'Acciones de HG8145X6, serial SN-0001',
      });
      act(() => trigger.focus());
      await user.keyboard('{ArrowDown}');
      const first = await screen.findByRole('menuitem', { name: 'Ver ficha del equipo' });
      await waitFor(() => expect(first).toHaveFocus());
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Ver OT' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();

      await user.keyboard('{ArrowDown}');
      await waitFor(() =>
        expect(screen.getByRole('menuitem', { name: 'Ver ficha del equipo' })).toHaveFocus(),
      );
      await user.keyboard('{Enter}');
      expect(getAsset).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ lifecyclePage: 1 }),
      );
      const drawer = await screen.findByTestId('serialized-asset-detail-drawer');
      expect(within(drawer).getByText('SN-0001')).toBeInTheDocument();
      // En la ficha no hay a dónde llevar el kardex: el botón no se ofrece.
      expect(within(drawer).queryByTestId('asset-detail-open-kardex')).not.toBeInTheDocument();
    });

    it('«Ver OT» usa la ruta existente de OT y solo aparece con OT y permiso', async () => {
      const user = userEvent.setup();
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      await user.click(
        await screen.findByRole('button', { name: 'Acciones de HG8145X6, serial SN-0001' }),
      );
      expect(screen.getByRole('menuitem', { name: 'Ver OT' })).toHaveAttribute(
        'href',
        '/dashboard/operations/execution-orders?executionOrderId=order-1',
      );
      await user.keyboard('{Escape}');
      await user.click(
        screen.getByRole('button', { name: 'Acciones de Router mesh, serial SN-0002' }),
      );
      expect(screen.queryByRole('menuitem', { name: 'Ver OT' })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Copiar MAC' })).not.toBeInTheDocument();
    });

    it('sin permiso de OT no ofrece «Ver OT»', async () => {
      const user = userEvent.setup();
      mockGranted.current = new Set([AccessPermissionKey.INVENTORY_STOCK_READ]);
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      await user.click(
        await screen.findByRole('button', { name: 'Acciones de HG8145X6, serial SN-0001' }),
      );
      expect(screen.queryByRole('menuitem', { name: 'Ver OT' })).not.toBeInTheDocument();
    });

    it('«Copiar serial» y «Copiar MAC» copian y lo anuncian', async () => {
      const user = userEvent.setup();
      const writeText = jest.spyOn(navigator.clipboard, 'writeText');
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      const trigger = await screen.findByRole('button', {
        name: 'Acciones de HG8145X6, serial SN-0001',
      });
      await user.click(trigger);
      await user.click(screen.getByRole('menuitem', { name: 'Copiar serial' }));
      expect(writeText).toHaveBeenLastCalledWith('SN-0001');
      expect(await screen.findByText('Serial copiado.')).toBeInTheDocument();
      await user.click(trigger);
      await user.click(screen.getByRole('menuitem', { name: 'Copiar MAC' }));
      expect(writeText).toHaveBeenLastCalledWith('AA:BB:CC:00:00:01');
      expect(await screen.findByText('MAC copiada.')).toBeInTheDocument();
    });

    it('objetivos de 44 px en el disparador y los elementos del menú', async () => {
      const user = userEvent.setup();
      getEquipment().mockResolvedValue(fullResponse());
      render(<SubscriberEquipmentTabOnly />);
      const trigger = await screen.findByRole('button', {
        name: 'Acciones de HG8145X6, serial SN-0001',
      });
      expect(trigger).toHaveClass('min-h-11', 'min-w-11');
      await user.click(trigger);
      for (const item of screen.getAllByRole('menuitem')) {
        expect(item).toHaveClass('min-h-11');
      }
    });
  });

  describe('tarjeta Equipos instalados (CA-1)', () => {
    it('muestra hasta 3 equipos abiertos y «Ver todo» abre la pestaña', async () => {
      const user = userEvent.setup();
      const onOpenEquipment = jest.fn();
      const response = fullResponse();
      response.equipment = [
        ...response.equipment,
        equipmentItem({ loanId: 'loan-4', assetId: 'asset-4', serialNumber: 'SN-0004' }),
        equipmentItem({ loanId: 'loan-5', assetId: 'asset-5', serialNumber: 'SN-0005' }),
      ];
      getEquipment().mockResolvedValue(response);
      render(<Harness onOpenEquipment={onOpenEquipment} />);
      const card = screen.getAllByRole('region', { name: 'Equipos instalados' })[0] as HTMLElement;
      expect(await within(card).findAllByRole('listitem')).toHaveLength(3);
      expect(within(card).queryByText('Serial SN-0003')).not.toBeInTheDocument();
      expect(within(card).getByText('Y 1 equipo instalado más.')).toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: 'Ver todo' }));
      expect(onOpenEquipment).toHaveBeenCalledTimes(1);
    });
  });

  it('axe sin violaciones con datos en la pestaña y en la tarjeta (CA-8)', async () => {
    getEquipment().mockResolvedValue(fullResponse());
    const tab = render(<SubscriberEquipmentTabOnly />);
    await screen.findByText('SN-0001');
    await screen.findByText('Instalación');
    expect(await axe(tab.container)).toHaveNoViolations();
    tab.unmount();

    const card = render(<CardOnly />);
    await screen.findByText('Serial SN-0001');
    expect(await axe(card.container)).toHaveNoViolations();
  });
});

function SubscriberEquipmentTabOnly({ anonymized = false }: { anonymized?: boolean }) {
  const equipment = useSubscriberEquipment(SUBSCRIBER_ID, true);
  return <SubscriberEquipmentTab equipment={equipment} anonymized={anonymized} />;
}

function CardOnly() {
  const equipment = useSubscriberEquipment(SUBSCRIBER_ID, true);
  return (
    <SubscriberInstalledEquipmentCard equipment={equipment} onOpenEquipment={() => undefined} />
  );
}

/**
 * Casos complementarios de QA (Ola 3): estados de §2.3 que no estaban cubiertos en la tarjeta,
 * el estado «todos retirados», los errores de página y la tabla de materiales (CA-7, CA-8).
 */
describe('SubscriberEquipmentTab — estados complementarios (QA Ola 3)', () => {
  beforeEach(() => {
    mockGranted.current = new Set([
      AccessPermissionKey.INVENTORY_STOCK_READ,
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    ]);
  });
  afterEach(() => jest.restoreAllMocks());

  function allRetiredResponse(): SubscriberEquipmentResponse {
    return { ...fullResponse(), equipment: [RETIRED] };
  }

  it('todos retirados: «Sin equipos instalados», distinto del vacío, y «Mostrar retirados» los revela', async () => {
    const user = userEvent.setup();
    getEquipment().mockResolvedValue(allRetiredResponse());
    render(<SubscriberEquipmentTabOnly />);
    const installed = await screen.findByRole('region', { name: 'Equipos instalados' });
    expect(await within(installed).findByText('Sin equipos instalados')).toBeInTheDocument();
    expect(
      within(installed).queryByText('Este suscriptor no tiene equipos registrados'),
    ).not.toBeInTheDocument();
    expect(within(installed).queryByRole('table')).not.toBeInTheDocument();

    await user.click(within(installed).getByRole('switch', { name: 'Mostrar retirados' }));
    const table = within(installed).getByRole('table', { name: 'Equipos instalados' });
    const row = within(table).getByText('SN-0003').closest('tr') as HTMLElement;
    expect(within(row).getByText('Retirado')).toBeInTheDocument();
  });

  it('vacío sin retirados: no ofrece el interruptor «Mostrar retirados»', async () => {
    getEquipment().mockResolvedValue(emptyResponse());
    render(<SubscriberEquipmentTabOnly />);
    const installed = section('Equipos instalados');
    await within(installed).findByText('Este suscriptor no tiene equipos registrados');
    expect(within(installed).queryByRole('switch')).not.toBeInTheDocument();
    expect(
      within(section('Materiales usados')).getByText('Sin materiales registrados'),
    ).toBeInTheDocument();
  });

  it('error inicial: materiales e historial no se pintan; el aviso vive en Equipos instalados', async () => {
    getEquipment().mockRejectedValue(new Error('boom'));
    render(<SubscriberEquipmentTabOnly />);
    await within(section('Equipos instalados')).findByText('No pudimos cargar los equipos');
    expect(screen.queryByRole('region', { name: 'Materiales usados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Historial de equipos' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
  });

  it('materiales: tabla con encabezados Fecha, Material, Cantidad y OT; unidad en español (CA-8)', async () => {
    getEquipment().mockResolvedValue(fullResponse());
    render(<SubscriberEquipmentTabOnly />);
    const materials = await screen.findByRole('region', { name: 'Materiales usados' });
    const table = await within(materials).findByRole('table', { name: 'Materiales usados' });
    for (const name of ['Fecha', 'Material', 'Cantidad', 'OT']) {
      expect(within(table).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    const cableRow = within(table).getByText('Cable drop').closest('tr') as HTMLElement;
    expect(within(cableRow).queryByText(/METER/)).not.toBeInTheDocument();
    expect(
      within(cableRow).getByRole('link', { name: 'Ver OT del movimiento MOV-0001' }),
    ).toHaveAttribute('href', '/dashboard/operations/execution-orders?executionOrderId=order-1');
  });

  it('«Cargar más» de materiales fallido: aviso con «Reintentar» que repite la misma página', async () => {
    const user = userEvent.setup();
    const spy = getEquipment()
      .mockResolvedValueOnce(fullResponse())
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        ...fullResponse(),
        materials: {
          items: [material({ movementId: 'mov-2', itemName: 'Roseta óptica', quantity: '1' })],
          meta: meta(3, 2, false),
        },
      });
    render(<SubscriberEquipmentTabOnly />);
    const materials = await screen.findByRole('region', { name: 'Materiales usados' });
    await user.click(await within(materials).findByRole('button', { name: 'Cargar más' }));
    expect(
      await within(materials).findByText('No pudimos cargar más materiales'),
    ).toBeInTheDocument();
    // La lista ya cargada se mantiene y «Cargar más» se oculta mientras hay error.
    expect(within(materials).getByText('Cable drop')).toBeInTheDocument();
    expect(within(materials).queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();

    await user.click(within(materials).getByRole('button', { name: 'Reintentar' }));
    expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
      materialsPage: 2,
      materialsLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
    });
    expect(await within(materials).findByText('Roseta óptica')).toBeInTheDocument();
    expect(
      within(materials).queryByText('No pudimos cargar más materiales'),
    ).not.toBeInTheDocument();
  });

  it('«Ver más» del historial fallido: la lista se mantiene y «Reintentar» repite la página', async () => {
    const user = userEvent.setup();
    const spy = getEquipment()
      .mockResolvedValueOnce(fullResponse())
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        ...fullResponse(),
        history: {
          items: [
            event({
              id: 'evt-3',
              eventType: AssetLifecycleEventType.REPAIRED,
              occurredAt: '2026-08-01T10:00:00.000Z',
            }),
          ],
          meta: meta(3, 2, false),
        },
      });
    render(<SubscriberEquipmentTabOnly />);
    const history = await screen.findByRole('region', { name: 'Historial de equipos' });
    await user.click(await within(history).findByRole('button', { name: 'Ver más' }));
    expect(
      await within(history).findByText('No pudimos cargar el historial de equipos'),
    ).toBeInTheDocument();
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(history).getByRole('button', { name: 'Reintentar' }));
    expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
      historyPage: 2,
      historyLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
    });
    expect(await within(history).findByText('Reparación')).toBeInTheDocument();
    expect(within(history).getAllByRole('listitem')).toHaveLength(3);
  });

  it('filtro fallido: «Reintentar» repite la lectura con el mismo filtro', async () => {
    const user = userEvent.setup();
    const spy = getEquipment()
      .mockResolvedValueOnce(fullResponse())
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        ...fullResponse(),
        history: {
          items: [event({ id: 'evt-9', assetId: 'asset-2', serialNumber: 'SN-0002' })],
          meta: meta(1),
        },
      });
    render(<SubscriberEquipmentTabOnly />);
    const history = await screen.findByRole('region', { name: 'Historial de equipos' });
    await within(history).findByText('Instalación');
    await user.selectOptions(within(history).getByLabelText('Equipo'), 'asset-2');
    expect(
      await within(history).findByText('No pudimos cargar el historial de equipos'),
    ).toBeInTheDocument();
    // Un error no es «filtro sin resultados».
    expect(
      within(history).queryByText('Ningún evento coincide con el filtro'),
    ).not.toBeInTheDocument();

    await user.click(within(history).getByRole('button', { name: 'Reintentar' }));
    expect(spy).toHaveBeenLastCalledWith(SUBSCRIBER_ID, {
      historyPage: 1,
      historyLimit: SUBSCRIBER_EQUIPMENT_DEFAULT_LIMIT,
      historyAssetId: 'asset-2',
    });
    expect(await within(history).findByText(/Serial SN-0002/)).toBeInTheDocument();
    expect(within(history).getByLabelText('Equipo')).toHaveValue('asset-2');
  });

  describe('tarjeta Equipos instalados: estados (CA-1, CA-7)', () => {
    it('cargando: región ocupada y sin filas', () => {
      getEquipment().mockReturnValue(new Promise(() => undefined));
      render(<CardOnly />);
      const card = section('Equipos instalados');
      expect(card).toHaveAttribute('aria-busy', 'true');
      expect(within(card).queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('vacío: mensaje del suscriptor sin equipos, sin botón para crear', async () => {
      getEquipment().mockResolvedValue(emptyResponse());
      render(<CardOnly />);
      const card = section('Equipos instalados');
      expect(
        await within(card).findByText('Este suscriptor no tiene equipos registrados'),
      ).toBeInTheDocument();
      expect(
        within(card).queryByRole('button', { name: /crear|registrar|agregar/i }),
      ).not.toBeInTheDocument();
    });

    it('todos retirados: «Sin equipos instalados», distinto del vacío', async () => {
      getEquipment().mockResolvedValue(allRetiredResponse());
      render(<CardOnly />);
      const card = section('Equipos instalados');
      expect(await within(card).findByText('Sin equipos instalados')).toBeInTheDocument();
      expect(
        within(card).queryByText('Este suscriptor no tiene equipos registrados'),
      ).not.toBeInTheDocument();
      expect(within(card).queryByText('Serial SN-0003')).not.toBeInTheDocument();
    });

    it('error: aviso con «Reintentar» que relee y devuelve el foco al título', async () => {
      const user = userEvent.setup();
      const spy = getEquipment()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(fullResponse());
      render(<CardOnly />);
      const card = section('Equipos instalados');
      expect(
        await within(card).findByText('No pudimos cargar los equipos instalados'),
      ).toBeInTheDocument();
      expect(screen.queryByText('boom')).not.toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: 'Reintentar' }));
      expect(await within(card).findByText('Serial SN-0001')).toBeInTheDocument();
      expect(spy).toHaveBeenCalledTimes(2);
      await waitFor(() =>
        expect(within(card).getByRole('heading', { name: 'Equipos instalados' })).toHaveFocus(),
      );
    });

    it('solo lista equipos abiertos: el retirado no aparece', async () => {
      getEquipment().mockResolvedValue(fullResponse());
      render(<CardOnly />);
      const card = section('Equipos instalados');
      expect(await within(card).findAllByRole('listitem')).toHaveLength(2);
      expect(within(card).queryByText('Serial SN-0003')).not.toBeInTheDocument();
      expect(within(card).queryByText(/instalados? más\./)).not.toBeInTheDocument();
    });
  });

  it('axe sin violaciones en vacío y en error (CA-8)', async () => {
    getEquipment().mockResolvedValue(emptyResponse());
    const empty = render(<SubscriberEquipmentTabOnly />);
    await screen.findByText('Este suscriptor no tiene equipos registrados');
    expect(await axe(empty.container)).toHaveNoViolations();
    empty.unmount();

    getEquipment().mockRejectedValue(new Error('boom'));
    const failed = render(<SubscriberEquipmentTabOnly />);
    await screen.findByText('No pudimos cargar los equipos');
    expect(await axe(failed.container)).toHaveNoViolations();
  });
});
