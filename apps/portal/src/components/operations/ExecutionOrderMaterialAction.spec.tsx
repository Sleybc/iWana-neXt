// R3 — captura de material e historial de consumos (CA-10 / CA-11).
//
// Se monta el drawer completo para que el slot reciba el sobre real (`order`,
// `requirement`, `action`, `context`); lo que el hook de custodia carga bajo
// demanda llega aquí por las props del contexto, tal como lo entrega el adaptador.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  INVENTORY_CONSUMPTION_PENDING_THRESHOLD_MS,
  ExecutionOrderItemAction,
  ExecutionOrderStatus,
  InventoryDisposition,
  InventoryResponsibleType,
  InventoryTrackingMode,
  SerializedAssetStatus,
  StockBalanceCondition,
  WfmWorkType,
} from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  InventoryReversalRejectionReasonCode,
  ExecutionOrderItemUsage,
  ExecutionOrderTemplateVersion,
  ListMeta,
} from '@iwana/shared';
import type {
  ExecutionOrderDetailResponse,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';

function template(finalDisposition?: string): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv-001',
    templateId: 'tpl-001',
    key: 'INSTALACION_ESTANDAR',
    version: 2,
    label: 'Instalación estándar',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: [
      {
        key: 'installed-equipment',
        label: 'Equipos instalados en el sitio del cliente',
        required: true,
        kind: 'MATERIAL',
        itemCategory: 'CPE',
        ...(finalDisposition ? { finalDisposition } : {}),
      },
      {
        key: 'service-test',
        label: 'Prueba de servicio en el sitio',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      },
    ],
    reasonCatalogs: [],
    effectiveFrom: '2026-07-01',
  } as ExecutionOrderTemplateVersion;
}

const IN_PROGRESS_ACTIONS: ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_ITEM_USAGE',
  'REGISTER_EVIDENCE',
  'CLOSE',
];

function detail(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
  tpl: ExecutionOrderTemplateVersion = template('INSTALLED_AT_CUSTOMER'),
): ExecutionOrderDetailResponse {
  return {
    id: 'eo-001',
    number: 'OTE-20261005-001',
    version: 3,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: { id: 'tpl-001', key: 'INSTALACION_ESTANDAR', version: 2, label: 'Instalación' },
    schedule: {
      eventId: 'se-001',
      window: { startAt: '2026-10-05T14:00:00.000Z', endAt: '2026-10-05T16:00:00.000Z' },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-001', displayLabel: 'Carlos López' },
    site: { id: 'site-001', label: 'Torre Norte', address: 'Calle 1 # 2 - 3' },
    completion: {
      progress: 0,
      requirements: tpl.requirements.map((requirement) => ({
        requirementId: requirement.key,
        label: requirement.label ?? requirement.key,
        kind: requirement.kind,
        satisfied: false,
      })),
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: IN_PROGRESS_ACTIONS,
    createdAt: '2026-10-05T12:00:00.000Z',
    updatedAt: '2026-10-05T12:00:00.000Z',
    ...overrides,
  } as ExecutionOrderDetailResponse;
}

function meta(overrides: Partial<ListMeta> = {}): ListMeta {
  return {
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
  };
}

const custodyAsset = {
  id: 'custody-asset-001',
  inventoryItemId: 'item-ont',
  serialNumber: 'ONT-2026-001',
  currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
  currentResponsibleType: InventoryResponsibleType.TECHNICIAN,
} as unknown as SerializedAssetRecord;

const custodyBalance = {
  id: 'custody-balance-001',
  itemId: 'item-router',
  quantityOnHand: '4',
  quantityReserved: '0',
  condition: StockBalanceCondition.NEW,
} as unknown as StockBalanceRecord;

const usage: ExecutionOrderItemUsage = {
  id: 'iu-001',
  itemId: 'item-ont',
  requirementKey: 'installed-equipment',
  quantity: 1,
  serial: 'ONT-2026-001',
  action: ExecutionOrderItemAction.INSTALL,
  finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
  inventoryRequestId: 'ir-001',
  movementStatus: 'CONFIRMED',
  createdAt: '2026-10-05T14:30:00.000Z',
};

const itemOptions = [
  {
    value: 'item-ont',
    label: 'CPE-ONT · ONT de fibra',
    sku: 'CPE-ONT',
    name: 'ONT de fibra',
    trackingMode: InventoryTrackingMode.SERIALIZED,
  },
  {
    value: 'item-router',
    label: 'CPE-RTR · Router WiFi',
    sku: 'CPE-RTR',
    name: 'Router WiFi',
    trackingMode: InventoryTrackingMode.CONSUMABLE,
  },
];

type DrawerProps = Parameters<typeof ExecutionOrderDrawer>[0];

function DrawerUnderTest(props: Partial<DrawerProps>) {
  return (
    <ExecutionOrderDrawer
      open
      order={detail()}
      activities={[]}
      itemUsage={[]}
      evidence={[]}
      template={template('INSTALLED_AT_CUSTOMER')}
      isLoading={false}
      isSubmitting={false}
      error={null}
      offline={false}
      onClose={jest.fn()}
      onOpenRequirementAction={jest.fn()}
      isLoadingMoreActivities={false}
      isLoadingMoreItemUsage={false}
      isLoadingMoreEvidence={false}
      isLoadingMoreExecutorCustody={false}
      onLoadMoreActivities={jest.fn()}
      onLoadMoreItemUsage={jest.fn()}
      onLoadMoreEvidence={jest.fn()}
      onLoadMoreExecutorCustody={jest.fn()}
      onStart={jest.fn().mockResolvedValue(undefined)}
      onRegisterActivity={jest.fn().mockResolvedValue(undefined)}
      onRegisterItemUsage={jest.fn().mockResolvedValue(undefined)}
      onUploadEvidence={jest.fn().mockResolvedValue(undefined)}
      onCloseOrder={jest.fn().mockResolvedValue(undefined)}
      itemOptions={itemOptions}
      itemsState="available"
      executorCustodyState="available"
      {...props}
    />
  );
}

function renderDrawer(props: Partial<DrawerProps> = {}, { open = false }: { open?: boolean } = {}) {
  const result = render(<DrawerUnderTest {...props} />);
  if (open) {
    fireEvent.click(
      screen.getByRole('button', {
        name: /^Registrar equipos instalados en el sitio del cliente para /,
      }),
    );
  }
  return {
    ...result,
    /** Nuevas props sobre el mismo árbol: conserva el estado del formulario abierto. */
    update: (next: Partial<DrawerProps>) => result.rerender(<DrawerUnderTest {...next} />),
  };
}

const sheet = () =>
  screen.getByRole('region', { name: 'Registrar equipos instalados en el sitio del cliente' });

describe('ExecutionOrderMaterialAction — acto de consumo', () => {
  describe('cuándo existe el acto (CA-10)', () => {
    it.each([
      ExecutionOrderStatus.CREATED,
      ExecutionOrderStatus.ASSIGNED,
      ExecutionOrderStatus.EN_ROUTE,
    ])(
      'preinicio (%s): no hay acto, formulario ni custodia, aunque llegue el permiso',
      (status) => {
        const onOpenRequirementAction = jest.fn();
        renderDrawer({
          order: detail({ status, allowedActions: ['START', 'REGISTER_ITEM_USAGE'] }),
          executorCustodyAssets: [custodyAsset],
          onOpenRequirementAction,
        });

        expect(
          screen.queryByRole('button', {
            name: /^Registrar equipos instalados en el sitio del cliente para /,
          }),
        ).toBeNull();
        expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
        expect(screen.queryByLabelText('Cantidad')).toBeNull();
        expect(document.querySelector('form')).toBeNull();
        expect(onOpenRequirementAction).not.toHaveBeenCalled();
      },
    );

    it.each([
      ExecutionOrderStatus.BLOCKED,
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ])('solo lectura (%s): se ve el historial pero no el acto ni la custodia', (status) => {
      renderDrawer({
        order: detail({ status, allowedActions: ['REGISTER_ITEM_USAGE'] }),
        itemUsage: [usage],
        executorCustodyAssets: [custodyAsset],
      });

      expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /^Registrar equipos instalados en el sitio del cliente para /,
        }),
      ).toBeNull();
      expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
      expect(screen.queryByLabelText('Cantidad')).toBeNull();
    });

    it('preinicio omite también el historial neutral y la paginación global', () => {
      const unattributedUsage: ExecutionOrderItemUsage = {
        ...usage,
        requirementKey: null,
        serial: 'PRESTART-USAGE',
      };
      renderDrawer({
        order: detail({ status: ExecutionOrderStatus.CREATED }),
        itemUsage: [unattributedUsage],
        itemUsageMeta: meta({ hasMore: true, total: 2 }),
      });

      expect(screen.queryByRole('region', { name: 'Consumos sin requisito asociado' })).toBeNull();
      expect(screen.queryByRole('region', { name: 'Equipos y materiales' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
    });

    it('en progreso sin REGISTER_ITEM_USAGE no ofrece el acto ni consulta nada', () => {
      const onOpenRequirementAction = jest.fn();
      renderDrawer({
        order: detail({ allowedActions: ['REGISTER_EVIDENCE', 'CLOSE'] }),
        onOpenRequirementAction,
      });

      expect(
        screen.queryByRole('button', {
          name: /^Registrar equipos instalados en el sitio del cliente para /,
        }),
      ).toBeNull();
      expect(onOpenRequirementAction).not.toHaveBeenCalled();
    });

    it('con la OT solo cargada, sin abrir el acto, la custodia no se monta ni se pide', () => {
      const onOpenRequirementAction = jest.fn();
      renderDrawer({ onOpenRequirementAction });

      expect(
        screen.getByRole('button', {
          name: /^Registrar equipos instalados en el sitio del cliente para /,
        }),
      ).toBeVisible();
      expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
      expect(onOpenRequirementAction).not.toHaveBeenCalled();
    });
  });

  describe('apertura', () => {
    it('al abrir informa al adaptador con el requisito de origen, su categoría y su destino', async () => {
      const onOpenRequirementAction = jest.fn();
      renderDrawer({ onOpenRequirementAction }, { open: true });

      expect(onOpenRequirementAction).toHaveBeenLastCalledWith({
        kind: 'consumption',
        requirementKey: 'installed-equipment',
        requirementLabel: 'Equipos instalados en el sitio del cliente',
        itemCategory: 'CPE',
        finalDisposition: 'INSTALLED_AT_CUSTOMER',
        action: 'REGISTER_ITEM_USAGE',
      });
      expect(sheet()).toBeInTheDocument();
    });

    it('cancelar cierra la hoja e informa al adaptador para cancelar la carga', async () => {
      const onOpenRequirementAction = jest.fn();
      renderDrawer({ onOpenRequirementAction }, { open: true });

      await userEvent.click(within(sheet()).getByRole('button', { name: 'Cancelar' }));

      expect(onOpenRequirementAction).toHaveBeenLastCalledWith(null);
      expect(
        screen.queryByRole('region', {
          name: 'Registrar equipos instalados en el sitio del cliente',
        }),
      ).toBeNull();
    });
  });

  describe('captura compacta por trackingMode', () => {
    it('muestra marca/modelo, serial, MAC, SKU y estado; registra exactamente un activo', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(undefined);
      const assetWithMac = {
        ...custodyAsset,
        macAddress: '00:11:22:33:44:55',
      } as SerializedAssetRecord;
      renderDrawer(
        {
          executorCustodyAssets: [assetWithMac],
          executorCustodyBalances: [],
          executorCustodyName: 'Bodega móvil de Carlos López',
          itemOptions: [
            { ...itemOptions[0]!, brand: 'TP Link', model: 'XC220G3V' },
            itemOptions[1]!,
          ],
          onRegisterItemUsage,
        },
        { open: true },
      );

      expect(
        screen.getByText(
          'Desde Bodega móvil de Carlos López · Se registrará como instalado en el sitio del cliente',
        ),
      ).toBeInTheDocument();
      const radio = screen.getByRole('radio', {
        name: /TP Link XC220G3V[\s\S]*Serial ONT-2026-001[\s\S]*MAC 00:11:22:33:44:55[\s\S]*CPE-ONT · Asignado a técnico/i,
      });
      expect(radio).toBeInTheDocument();
      const option = radio.closest('label')!;
      const content = option.querySelector(':scope > span')!;
      expect(content.textContent).toBe(
        'TP Link XC220G3VSerial ONT-2026-001\nMAC 00:11:22:33:44:55CPE-ONT · Asignado a técnico',
      );
      expect(document.body.innerHTML).not.toContain('[_label>');
      expect(screen.queryByLabelText('Serial o lote')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Acción')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Custodia de origen')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Destino')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('radio', { name: /Serial ONT-2026-001/i }));
      const registerButton = screen.getByRole('button', { name: 'Registrar equipo' });
      const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
      expect(registerButton.previousElementSibling).toHaveTextContent(
        'Serial ONT-2026-001 · MAC 00:11:22:33:44:55',
      );
      expect(registerButton.parentElement).toHaveClass('sticky', 'flex', 'flex-wrap', 'gap-2');
      expect(cancelButton.parentElement).toBe(registerButton.parentElement);
      expect(registerButton.closest('form')).not.toHaveClass('pb-28');
      await userEvent.click(registerButton);

      expect(onRegisterItemUsage).toHaveBeenCalledWith({
        itemId: 'item-ont',
        requirementKey: 'installed-equipment',
        technicianCustodyId: 'tech-001',
        quantity: 1,
        serialNumber: 'ONT-2026-001',
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      });
      expect(
        await screen.findByText(
          'Equipo registrado. Queda pendiente de confirmación de inventario.',
        ),
      ).toBeInTheDocument();
    });

    it('usa la referencia cuando faltan marca/modelo y no duplica el serial', async () => {
      renderDrawer(
        { executorCustodyAssets: [custodyAsset], executorCustodyBalances: [] },
        { open: true },
      );

      const radio = screen.getByRole('radio', {
        name: /ONT de fibra[\s\S]*Serial ONT-2026-001[\s\S]*CPE-ONT · Asignado a técnico/i,
      });
      expect(radio).toBeEnabled();
      const option = radio.closest('label')!;
      expect(option.textContent?.match(/ONT-2026-001/g)).toHaveLength(1);
      expect(option).toHaveTextContent('ONT de fibra');
      expect(option).toHaveTextContent('CPE-ONT · Asignado a técnico');
      expect(screen.queryByText('MAC no registrada')).not.toBeInTheDocument();
      await userEvent.click(radio);
      expect(
        screen.getByRole('button', { name: 'Registrar equipo' }).previousElementSibling,
      ).toHaveTextContent('Serial ONT-2026-001');
      expect(
        screen.getByRole('button', { name: 'Registrar equipo' }).previousElementSibling,
      ).not.toHaveTextContent('MAC');
    });

    it('muestra el equipo identificado por MAC sin serial y lo deshabilita con el motivo correspondiente', () => {
      const macOnlyAsset = { ...custodyAsset, serialNumber: null, macAddress: '00:11:22:33:44:55' };
      renderDrawer(
        { executorCustodyAssets: [macOnlyAsset], executorCustodyBalances: [] },
        { open: true },
      );

      const radio = screen.getByRole('radio', {
        name: /MAC 00:11:22:33:44:55[\s\S]*CPE-ONT · Asignado a técnico/i,
      });
      expect(radio).toBeDisabled();
      expect(radio).toHaveAccessibleDescription(
        'Este equipo no tiene serial registrado. Pide a supervisión que lo complete para poder registrarlo.',
      );
    });

    it('muestra los equipos sin identificadores como no seleccionables y explica qué datos faltan', () => {
      const unidentifiedAsset = { ...custodyAsset, serialNumber: null, macAddress: null };
      renderDrawer(
        { executorCustodyAssets: [unidentifiedAsset], executorCustodyBalances: [] },
        { open: true },
      );

      const radio = screen.getByRole('radio', {
        name: /Equipo sin identificar[\s\S]*CPE-ONT · Asignado a técnico/i,
      });
      expect(radio).toBeDisabled();
      expect(radio).toHaveAccessibleDescription(
        'Este equipo no tiene serial ni MAC registrados. Pide a supervisión que los complete.',
      );
    });

    it('busca por serial o MAC solo con más de ocho activos y ofrece limpiar la búsqueda', async () => {
      const assets = Array.from({ length: 9 }, (_, index) => ({
        ...custodyAsset,
        id: 'asset-' + index,
        serialNumber: 'ONT-' + index,
        macAddress: 'MAC-' + index,
      })) as SerializedAssetRecord[];
      renderDrawer({ executorCustodyAssets: assets, executorCustodyBalances: [] }, { open: true });

      const search = screen.getByRole('textbox', { name: 'Buscar equipo' });
      expect(screen.getByText('Serial o MAC')).toBeInTheDocument();
      await userEvent.type(search, 'MAC-8');
      expect(screen.getByRole('radio', { name: /ONT-8/i })).toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /ONT-1/i })).not.toBeInTheDocument();

      await userEvent.clear(search);
      await userEvent.type(search, 'sin-coincidencia');
      expect(screen.getByText('No encontramos equipos con ese serial o MAC.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
      expect(screen.getAllByRole('radio')).toHaveLength(9);
    });

    it('agrega saldos por artículo, resta reservas y comunica resultados parciales por fila', async () => {
      const onRegisterItemUsageBatch = jest
        .fn()
        .mockResolvedValueOnce([
          { key: 'item:item-router', status: 'success' },
          { key: 'item:item-patch', status: 'error' },
        ])
        .mockResolvedValueOnce([{ key: 'item:item-patch', status: 'success' }]);
      const options = [
        ...itemOptions,
        {
          value: 'item-patch',
          label: 'FO-PATCH · Patchcord',
          sku: 'FO-PATCH',
          name: 'Patchcord',
          trackingMode: InventoryTrackingMode.CONSUMABLE,
        },
      ];
      const balances = [
        { ...custodyBalance, id: 'router-1', quantityOnHand: '4', quantityReserved: '1' },
        { ...custodyBalance, id: 'router-2', quantityOnHand: '5', quantityReserved: '2' },
        {
          ...custodyBalance,
          id: 'patch-1',
          itemId: 'item-patch',
          quantityOnHand: '4',
          quantityReserved: '1',
        },
        {
          ...custodyBalance,
          id: 'empty-1',
          itemId: 'item-patch',
          quantityOnHand: '1',
          quantityReserved: '1',
        },
      ] as StockBalanceRecord[];
      renderDrawer(
        {
          itemOptions: options,
          executorCustodyAssets: [],
          executorCustodyBalances: balances,
          onRegisterItemUsageBatch,
        },
        { open: true },
      );

      expect(screen.getByText('Router WiFi · disponible 6 unidades')).toBeInTheDocument();
      expect(screen.getByText('Patchcord · disponible 3 unidades')).toBeInTheDocument();
      const routerQuantity = screen.getByRole('spinbutton', {
        name: 'Cantidad de Router WiFi (unidades)',
      });
      const patchQuantity = screen.getByRole('spinbutton', {
        name: 'Cantidad de Patchcord (unidades)',
      });
      await userEvent.click(screen.getByRole('button', { name: 'Sumar 1 unidad de Router WiFi' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sumar 1 unidad de Router WiFi' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sumar 1 unidad de Patchcord' }));
      expect(routerQuantity).toHaveValue(2);
      expect(patchQuantity).toHaveValue(1);
      await userEvent.click(screen.getByRole('button', { name: 'Registrar materiales' }));

      expect(onRegisterItemUsageBatch).toHaveBeenCalledTimes(1);
      const rows = onRegisterItemUsageBatch.mock.calls[0]![0];
      expect(rows).toHaveLength(2);
      expect(rows.map((row: { payload: { itemId: string } }) => row.payload.itemId)).toEqual([
        'item-patch',
        'item-router',
      ]);
      expect(
        rows.find((row: { payload: { itemId: string } }) => row.payload.itemId === 'item-router')
          ?.payload,
      ).toMatchObject({
        quantity: 2,
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      });
      expect(
        await screen.findByText(
          'Material registrado. Queda pendiente de confirmación de inventario.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('No se pudo registrar Patchcord. Intenta de nuevo.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      expect(
        screen.getByRole('spinbutton', { name: 'Cantidad de Router WiFi (unidades)' }),
      ).toHaveValue(0);
      expect(
        screen.getByRole('spinbutton', { name: 'Cantidad de Patchcord (unidades)' }),
      ).toHaveValue(1);
      const failedRowKey = rows.find(
        (row: { payload: { itemId: string } }) => row.payload.itemId === 'item-patch',
      )!.idempotencyKey;
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(onRegisterItemUsageBatch).toHaveBeenCalledTimes(2));
      expect(onRegisterItemUsageBatch.mock.calls[1]![0]).toHaveLength(1);
      expect(onRegisterItemUsageBatch.mock.calls[1]![0][0]).toMatchObject({
        key: 'item:item-patch',
        idempotencyKey: failedRowKey,
      });
    });

    it('muestra metros en disponible, cantidad y controles; conserva dos decimales al registrar', async () => {
      const onRegisterItemUsageBatch = jest
        .fn()
        .mockResolvedValue([{ key: 'item:item-drop', status: 'success' }]);
      const drop = {
        value: 'item-drop',
        label: 'FO-DROP · Fibra Drop',
        sku: 'FO-DROP',
        name: 'Fibra Drop',
        unitOfMeasure: 'METER',
        trackingMode: InventoryTrackingMode.CONSUMABLE,
      };
      renderDrawer(
        {
          itemOptions: [drop],
          executorCustodyAssets: [],
          executorCustodyBalances: [
            {
              ...custodyBalance,
              itemId: 'item-drop',
              quantityOnHand: '2.50',
              quantityReserved: '0.25',
            },
          ],
          onRegisterItemUsageBatch,
        },
        { open: true },
      );

      expect(screen.getByText('Fibra Drop · disponible 2,25 metros')).toBeInTheDocument();
      const quantity = screen.getByRole('spinbutton', {
        name: 'Cantidad de Fibra Drop (metros)',
      });
      expect(quantity).toHaveAttribute('max', '2.25');
      expect(quantity).toHaveAttribute('step', '0.01');
      expect(screen.getByRole('button', { name: 'Restar 1 metro de Fibra Drop' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Sumar 1 metro de Fibra Drop' }));
      expect(quantity).toHaveValue(1);

      await userEvent.clear(quantity);
      await userEvent.type(quantity, '1.25');
      expect(quantity).toHaveValue(1.25);
      await userEvent.click(screen.getByRole('button', { name: 'Registrar materiales' }));

      expect(onRegisterItemUsageBatch.mock.calls[0]![0][0]!.payload.quantity).toBe(1.25);
    });

    it('reutiliza la clave de idempotencia de la fila al reintentar tras un fallo', async () => {
      const onRegisterItemUsageBatch = jest
        .fn()
        .mockResolvedValueOnce([{ key: 'item:item-router', status: 'error' }])
        .mockResolvedValueOnce([{ key: 'item:item-router', status: 'success' }]);
      renderDrawer(
        {
          itemOptions: [itemOptions[1]!],
          executorCustodyAssets: [],
          executorCustodyBalances: [custodyBalance],
          onRegisterItemUsageBatch,
        },
        { open: true },
      );

      await userEvent.click(screen.getByRole('button', { name: 'Sumar 1 unidad de Router WiFi' }));
      await userEvent.click(screen.getByRole('button', { name: 'Registrar materiales' }));
      await screen.findByText('No se pudo registrar Router WiFi. Intenta de nuevo.');
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

      const firstKey = onRegisterItemUsageBatch.mock.calls[0]![0][0]!.idempotencyKey;
      const retryKey = onRegisterItemUsageBatch.mock.calls[1]![0][0]!.idempotencyKey;
      expect(retryKey).toBe(firstKey);
      expect(
        await screen.findByText(
          'Material registrado. Queda pendiente de confirmación de inventario.',
        ),
      ).toBeInTheDocument();
    });

    it.each([
      [
        InventoryDisposition.INSTALLED_AT_CUSTOMER,
        'Instalado en el sitio del cliente',
        ExecutionOrderItemAction.INSTALL,
      ],
      [
        InventoryDisposition.INTERNAL_CONSUMPTION,
        'Consumo interno',
        ExecutionOrderItemAction.CONSUME,
      ],
      [
        InventoryDisposition.RETURNED_TO_TECHNICIAN_STOCK,
        'Retorno a custodia técnica',
        ExecutionOrderItemAction.RETURN,
      ],
      [
        InventoryDisposition.RETURNED_TO_WAREHOUSE,
        'Retorno a bodega',
        ExecutionOrderItemAction.RETURN,
      ],
      [InventoryDisposition.DAMAGED_OR_LOST, 'Dañado o perdido', ExecutionOrderItemAction.REMOVE],
    ] as const)(
      'deriva la acción %s del destino elegido cuando el snapshot no lo fija',
      async (disposition, optionLabel, action) => {
        const onRegisterItemUsageBatch = jest
          .fn()
          .mockResolvedValue([{ key: 'item:item-router', status: 'success' }]);
        const optionalTemplate = template();
        renderDrawer(
          {
            order: detail({}, optionalTemplate),
            template: optionalTemplate,
            itemOptions: [itemOptions[1]!],
            executorCustodyAssets: [],
            executorCustodyBalances: [custodyBalance],
            onRegisterItemUsageBatch,
          },
          { open: true },
        );

        await userEvent.click(screen.getByRole('combobox', { name: 'Destino' }));
        await userEvent.click(await screen.findByRole('option', { name: optionLabel }));
        await userEvent.click(
          screen.getByRole('button', { name: 'Sumar 1 unidad de Router WiFi' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Registrar materiales' }));
        await waitFor(() => expect(onRegisterItemUsageBatch).toHaveBeenCalled());
        expect(onRegisterItemUsageBatch.mock.calls[0]![0][0]!.payload).toMatchObject({
          action,
          finalDisposition: disposition,
        });
      },
    );

    it('no envía filas con cantidad cero', async () => {
      const onRegisterItemUsageBatch = jest.fn();
      renderDrawer(
        {
          itemOptions: [itemOptions[1]!],
          executorCustodyAssets: [],
          executorCustodyBalances: [custodyBalance],
          onRegisterItemUsageBatch,
        },
        { open: true },
      );

      expect(
        screen.getByRole('spinbutton', { name: 'Cantidad de Router WiFi (unidades)' }),
      ).toHaveValue(0);
      expect(screen.getByRole('button', { name: 'Registrar materiales' })).toBeDisabled();
      expect(onRegisterItemUsageBatch).not.toHaveBeenCalled();
    });

    it('comunica carga, vacío y error recuperable con el copy cerrado', async () => {
      const loading = renderDrawer(
        {
          itemsState: 'loading',
          executorCustodyState: 'loading',
          executorCustodyAssets: [],
          executorCustodyBalances: [],
        },
        { open: true },
      );
      expect(screen.getByText('Cargando equipos de tu custodia…')).toBeInTheDocument();
      expect(screen.getByText('Cargando materiales de tu custodia…')).toBeInTheDocument();
      loading.unmount();

      const empty = renderDrawer(
        { itemOptions: [itemOptions[0]!], executorCustodyAssets: [], executorCustodyBalances: [] },
        { open: true },
      );
      expect(
        screen.getByText('No hay equipos de esta categoría en tu custodia.'),
      ).toBeInTheDocument();
      empty.unmount();

      const failedLoad = renderDrawer(
        {
          itemsState: 'unavailable',
          executorCustodyState: 'unavailable',
          executorCustodyAssets: [],
          executorCustodyBalances: [],
        },
        { open: true },
      );
      expect(screen.getByText('No pudimos cargar los equipos de tu custodia.')).toBeInTheDocument();
      expect(
        screen.getByText('No pudimos cargar los materiales de tu custodia.'),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(2);
      failedLoad.unmount();
    });
  });
  describe('historial de consumos', () => {
    it('vive bajo el requisito, separado de la captura, y no mezcla disponibilidad con consumo', () => {
      renderDrawer(
        {
          itemUsage: [usage],
          executorCustodyAssets: [custodyAsset],
          executorCustodyAssetsMeta: meta(),
        },
        { open: true },
      );

      const history = screen.getByRole('region', { name: 'Equipos y materiales' });
      const capture = sheet();
      expect(within(history).getByText('ONT-2026-001')).toBeInTheDocument();
      expect(within(history).getByText('Confirmado')).toBeInTheDocument();
      expect(
        within(history).getByText('Instalar · Cantidad: 1 · Instalado en cliente'),
      ).toBeInTheDocument();
      // El historial no mezcla la disponibilidad de custodia con los registros.
      expect(within(history).queryByText('En custodia del ejecutor')).toBeNull();
      expect(
        within(capture).getByText(
          /Desde Carlos López · Se registrará como instalado en el sitio del cliente/,
        ),
      ).toBeInTheDocument();
      expect(within(capture).queryByText('En custodia del ejecutor')).toBeNull();
      expect(history.contains(capture)).toBe(false);
    });

    it.each([
      [
        'CUSTODY_INSUFFICIENT',
        'No hay suficientes unidades disponibles en tu inventario asignado.',
        'Revisa la cantidad solicitada. Si necesitas más unidades, pide a tu supervisor que actualice tu inventario asignado.',
      ],
      [
        'SERIAL_NOT_IN_CUSTODY',
        'El equipo con ese número de serie no figura en tu inventario asignado.',
        'Comprueba el número de serie. Si es correcto, pide a tu supervisor que revise la asignación del equipo.',
      ],
      [
        'SUBSCRIBER_REQUIRED',
        'La orden no indica el cliente o la sede donde se instalará el equipo.',
        'Pide a tu supervisor que complete esos datos en la orden y vuelve a registrar el consumo.',
      ],
      [
        'ITEM_INACTIVE',
        'El producto seleccionado ya no está disponible para registrar consumos.',
        'Elige otro producto disponible. Si necesitas usar este producto, pide a tu supervisor que revise su disponibilidad.',
      ],
    ] as const)(
      'muestra las dos partes del motivo %s en lenguaje de producto',
      (reasonCode, whatHappened, nextStep) => {
        renderDrawer({
          itemUsage: [
            {
              ...usage,
              movementStatus: 'REJECTED',
              rejectionReasonCode: reasonCode,
            },
          ],
        });

        expect(screen.getByText(whatHappened)).toBeInTheDocument();
        expect(screen.getByText(nextStep)).toBeInTheDocument();
        expect(screen.queryByText(reasonCode)).toBeNull();
      },
    );

    it('avisa del pendiente prolongado al superar el umbral compartido', () => {
      renderDrawer({
        itemUsage: [
          {
            ...usage,
            movementStatus: 'PENDING',
            createdAt: new Date(
              Date.now() - INVENTORY_CONSUMPTION_PENDING_THRESHOLD_MS - 1,
            ).toISOString(),
          },
        ],
      });

      expect(
        screen.getByText('El consumo aún no se ha aplicado al inventario.'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'No lo registres de nuevo. Revisa el estado de la orden más tarde; si sigue igual, avisa a tu supervisor.',
        ),
      ).toBeInTheDocument();
    });

    it('no muestra el aviso de pendiente prolongado antes del umbral', () => {
      renderDrawer({
        itemUsage: [
          {
            ...usage,
            movementStatus: 'PENDING',
            createdAt: new Date(
              Date.now() - INVENTORY_CONSUMPTION_PENDING_THRESHOLD_MS + 60_000,
            ).toISOString(),
          },
        ],
      });

      expect(screen.queryByText('El consumo aún no se ha aplicado al inventario.')).toBeNull();
    });

    it('vacío del historial con el copy del requisito, también con el acto cerrado', () => {
      renderDrawer({ itemUsage: [], itemUsageMeta: meta() });

      expect(
        screen.getByText('Todavía no hay consumos registrados para este requisito'),
      ).toBeInTheDocument();
      expect(screen.queryByText('En custodia del ejecutor')).toBeNull();
    });

    it('pagina el historial sin tocar la custodia', async () => {
      const onLoadMoreItemUsage = jest.fn().mockResolvedValue(undefined);
      const onLoadMoreExecutorCustody = jest.fn();
      renderDrawer({
        itemUsage: [usage],
        itemUsageMeta: meta({ hasMore: true, total: 3 }),
        onLoadMoreItemUsage,
        onLoadMoreExecutorCustody,
      });

      const history = within(screen.getByRole('region', { name: 'Equipos y materiales' }));
      expect(screen.getByText('Mostrando 1 de 3 consumos')).toBeInTheDocument();
      expect(history.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Cargar más' })).toHaveLength(1);
      await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

      expect(onLoadMoreItemUsage).toHaveBeenCalledTimes(1);
      expect(onLoadMoreExecutorCustody).not.toHaveBeenCalled();
    });

    it('asocia por clave exacta y presenta los registros sin clave una sola vez fuera de las filas', () => {
      const multiMaterialTemplate: ExecutionOrderTemplateVersion = {
        ...template('INSTALLED_AT_CUSTOMER'),
        requirements: [
          ...template('INSTALLED_AT_CUSTOMER').requirements,
          {
            key: 'router-installation',
            label: 'Router instalado',
            required: true,
            kind: 'MATERIAL',
            itemCategory: 'CPE',
          },
        ],
      };
      const keyedForSecondRequirement: ExecutionOrderItemUsage = {
        ...usage,
        id: 'iu-router',
        requirementKey: 'router-installation',
        serial: 'ROUTER-2026-002',
      };
      const unkeyedNull: ExecutionOrderItemUsage = {
        ...usage,
        id: 'iu-legacy-null',
        requirementKey: null,
        serial: 'LEGACY-NULL',
      };
      // La lectura del API v1.4 en runtime puede omitir un campo que v1.5 tipa como nullable.
      const unkeyedMissing = {
        ...usage,
        id: 'iu-legacy-missing',
        requirementKey: undefined,
        serial: 'LEGACY-MISSING',
      } as unknown as ExecutionOrderItemUsage;

      renderDrawer({
        order: detail({}, multiMaterialTemplate),
        template: multiMaterialTemplate,
        itemUsage: [usage, keyedForSecondRequirement, unkeyedNull, unkeyedMissing],
        itemUsageMeta: meta({ hasMore: true, total: 5 }),
      });

      const installedRow = screen.getByRole('listitem', {
        name: /Equipos instalados en el sitio del cliente/,
      });
      const routerRow = screen.getByRole('listitem', { name: /Router instalado/ });
      expect(within(installedRow).getByText('ONT-2026-001')).toBeInTheDocument();
      expect(within(installedRow).queryByText('ROUTER-2026-002')).toBeNull();
      expect(within(routerRow).getByText('ROUTER-2026-002')).toBeInTheDocument();
      expect(within(routerRow).queryByText('ONT-2026-001')).toBeNull();

      const unattributed = screen.getByRole('region', { name: 'Consumos sin requisito asociado' });
      const requirementList = screen.getByRole('list', { name: 'Requisitos de la orden' });
      expect(
        within(requirementList).queryByRole('region', {
          name: 'Consumos sin requisito asociado',
        }),
      ).toBeNull();
      expect(
        within(unattributed).getByText('Estos registros no indican a qué requisito corresponden.'),
      ).toBeInTheDocument();
      expect(within(unattributed).getByText('LEGACY-NULL')).toBeInTheDocument();
      expect(within(unattributed).getByText('LEGACY-MISSING')).toBeInTheDocument();
      expect(screen.getAllByText('LEGACY-NULL')).toHaveLength(1);
      expect(screen.getAllByText('LEGACY-MISSING')).toHaveLength(1);
      expect(screen.getByText('Mostrando 4 de 5 consumos')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Cargar más' })).toHaveLength(1);
    });

    it('no anuncia vacíos por requisito mientras existan páginas pendientes', () => {
      renderDrawer({ itemUsage: [], itemUsageMeta: meta({ hasMore: true, total: 2 }) });

      expect(
        screen.queryByText('Todavía no hay consumos registrados para este requisito'),
      ).toBeNull();
      expect(screen.getByRole('button', { name: 'Cargar más' })).toBeInTheDocument();
    });

    it('omite el vacío mientras no haya metadata completa o exista un error de lectura', () => {
      const { unmount } = renderDrawer({ itemUsage: [] });
      expect(
        screen.queryByText('Todavía no hay consumos registrados para este requisito'),
      ).toBeNull();
      unmount();

      renderDrawer({
        itemUsage: [],
        itemUsageMeta: meta(),
        itemUsageError: 'No se pudo leer el historial.',
      });
      expect(
        screen.queryByText('Todavía no hay consumos registrados para este requisito'),
      ).toBeNull();
    });

    it('muestra error local y conserva consumos previos con un reintento exclusivo', async () => {
      const onRetryItemUsage = jest.fn().mockResolvedValue(undefined);
      renderDrawer({
        itemUsage: [usage],
        itemUsageMeta: meta({ hasMore: true, total: 3 }),
        itemUsageError: 'No se pudo cargar la página de consumos.',
        onRetryItemUsage,
      });

      expect(
        screen.getByText('No pudimos consultar los consumos').closest('[role="alert"]'),
      ).not.toBeNull();
      expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(
        screen.queryByText('Todavía no hay consumos registrados para este requisito'),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(onRetryItemUsage).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ExecutionOrderMaterialAction — reverso de consumo', () => {
  const reversalAllowed = ['REVERSE_ITEM_USAGE'] as ExecutionOrderAllowedAction[];
  const pendingReversal: NonNullable<ExecutionOrderItemUsage['reversal']> = {
    status: 'PENDING',
    requestedAt: '2026-10-10T12:00:00.000Z',
    rejectionReasonCode: null,
  };
  const confirmedReversal: NonNullable<ExecutionOrderItemUsage['reversal']> = {
    status: 'CONFIRMED',
    requestedAt: '2026-10-10T12:00:00.000Z',
    rejectionReasonCode: null,
  };
  const rejectedReversal: NonNullable<ExecutionOrderItemUsage['reversal']> = {
    status: 'REJECTED',
    requestedAt: '2026-10-10T12:00:00.000Z',
    rejectionReasonCode: 'REVERSAL_CUSTODY_INACTIVE',
  };

  it('solo muestra el reverso con permiso, consumo confirmado y sin reverso activo', () => {
    const allowed = detail({ allowedActions: reversalAllowed });
    const allowedView = renderDrawer({
      order: allowed,
      itemUsage: [usage],
      onReverseItemUsage: jest.fn(),
    });
    expect(screen.getByRole('button', { name: 'Revertir consumo' })).toBeInTheDocument();
    allowedView.unmount();

    const noPermission = renderDrawer({
      order: detail({ allowedActions: ['REGISTER_ITEM_USAGE'] }),
      itemUsage: [usage],
      onReverseItemUsage: jest.fn(),
    });
    expect(screen.queryByRole('button', { name: 'Revertir consumo' })).toBeNull();
    noPermission.unmount();

    renderDrawer({
      order: allowed,
      itemUsage: [{ ...usage, movementStatus: 'PENDING' }],
      onReverseItemUsage: jest.fn(),
    });
    expect(screen.queryByRole('button', { name: 'Revertir consumo' })).toBeNull();
  });

  it.each([pendingReversal, confirmedReversal])(
    'no permite una segunda solicitud mientras el reverso está %s',
    (reversal) => {
      renderDrawer({
        order: detail({ allowedActions: reversalAllowed }),
        itemUsage: [{ ...usage, reversal }],
        onReverseItemUsage: jest.fn(),
      });
      expect(screen.queryByRole('button', { name: 'Revertir consumo' })).toBeNull();
    },
  );

  it('vuelve a ofrecer el reverso tras un rechazo y muestra el copy final de U2', () => {
    renderDrawer({
      order: detail({ allowedActions: reversalAllowed }),
      itemUsage: [{ ...usage, reversal: rejectedReversal }],
      onReverseItemUsage: jest.fn(),
    });

    expect(screen.getByRole('button', { name: 'Revertir consumo' })).toBeInTheDocument();
    const rejectionNotice = screen
      .getByText('No se pudo revertir. Revisa el motivo y sigue la acción indicada.')
      .closest<HTMLElement>('[role="status"]')!;
    expect(rejectionNotice).toHaveTextContent(
      'No se pudo revertir. Revisa el motivo y sigue la acción indicada.',
    );
    expect(rejectionNotice).toHaveTextContent(
      'Qué pasó: La custodia del técnico ya no está activa.',
    );
    expect(rejectionNotice).toHaveTextContent(
      'Qué hacer: Revisa el estado de la custodia y coordina su regularización antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
    );
    expect(screen.queryByText('REVERSAL_CUSTODY_INACTIVE')).toBeNull();
  });

  it.each([
    [
      'REVERSAL_ASSET_MOVED',
      'El equipo ya no está en la ubicación donde quedó tras el consumo.',
      'Verifica su ubicación actual y el movimiento más reciente en el inventario antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
    ],
    [
      'REVERSAL_CUSTODY_INACTIVE',
      'La custodia del técnico ya no está activa.',
      'Revisa el estado de la custodia y coordina su regularización antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
    ],
    [
      'REVERSAL_ORIGINAL_NOT_FOUND',
      'No encontramos el movimiento de inventario necesario para aplicar el reverso.',
      'Revisa el historial de inventario. Si el movimiento no aparece, solicita una revisión antes de corregir la orden. Cuando resuelvas la causa, puedes solicitar un nuevo reverso.',
    ],
    [
      'REVERSAL_LOAN_MISMATCH',
      'El préstamo del equipo al cliente no está abierto como se esperaba.',
      'Revisa el estado del préstamo en el inventario antes de corregir la orden.',
    ],
  ] as const)(
    'muestra en lenguaje de producto el motivo %s',
    (reasonCode, whatHappened, nextStep) => {
      const reversal: NonNullable<ExecutionOrderItemUsage['reversal']> = {
        status: 'REJECTED',
        requestedAt: '2026-10-10T12:00:00.000Z',
        rejectionReasonCode: reasonCode as InventoryReversalRejectionReasonCode,
      };
      renderDrawer({
        order: detail({ allowedActions: reversalAllowed }),
        itemUsage: [{ ...usage, reversal }],
        onReverseItemUsage: jest.fn(),
      });

      const rejectionNotice = screen
        .getByText('No se pudo revertir. Revisa el motivo y sigue la acción indicada.')
        .closest<HTMLElement>('[role="status"]')!;
      expect(rejectionNotice).toHaveTextContent(`Qué pasó: ${whatHappened}`);
      expect(rejectionNotice).toHaveTextContent(`Qué hacer: ${nextStep}`);
      expect(screen.queryByText(reasonCode)).toBeNull();
    },
  );

  it('abre el diálogo con foco en el motivo y devuelve el foco al disparador al cancelar', async () => {
    renderDrawer({
      order: detail({ allowedActions: reversalAllowed }),
      itemUsage: [usage],
      onReverseItemUsage: jest.fn(),
    });
    const trigger = screen.getByRole('button', { name: 'Revertir consumo' });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Revertir consumo' });
    const reason = within(dialog).getByRole('textbox', {
      name: 'Motivo del reverso (obligatorio)',
    });
    await waitFor(() => expect(reason).toHaveFocus());
    expect(
      within(dialog).getByText(
        'Explica por qué solicitas este reverso. No incluyas datos personales.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(trigger).toHaveFocus();
  });

  it('valida el motivo obligatorio y envía texto recortado sin datos personales adicionales', async () => {
    const onReverseItemUsage = jest.fn().mockResolvedValue(true);
    renderDrawer({
      order: detail({ allowedActions: reversalAllowed }),
      itemUsage: [usage],
      onReverseItemUsage,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Revertir consumo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revertir consumo' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reverso' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Escribe un motivo para continuar.',
    );
    expect(onReverseItemUsage).not.toHaveBeenCalled();

    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Motivo del reverso (obligatorio)' }),
      '  Corrección operativa  ',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reverso' }));

    expect(onReverseItemUsage).toHaveBeenCalledWith('iu-001', {
      reason: 'Corrección operativa',
    });
    expect(await screen.queryByRole('dialog', { name: 'Revertir consumo' })).toBeNull();
  });

  it('anuncia pendiente y confirmado, marca la corrección terminal y el requisito pendiente', () => {
    const { rerender } = render(
      <DrawerUnderTest
        order={detail({ allowedActions: reversalAllowed })}
        itemUsage={[{ ...usage, reversal: pendingReversal }]}
      />,
    );
    expect(screen.getByText('Reverso pendiente.').closest('[role="status"]')).toHaveTextContent(
      'Estamos verificando el inventario. No vuelvas a enviar la solicitud; el estado se actualizará cuando recibamos una respuesta.',
    );

    rerender(
      <DrawerUnderTest
        order={detail({
          status: ExecutionOrderStatus.COMPLETED,
          allowedActions: [],
        })}
        itemUsage={[{ ...usage, reversal: confirmedReversal }]}
      />,
    );
    expect(screen.getByText('Reverso aplicado.').closest('[role="status"]')).toHaveTextContent(
      'El movimiento contrario quedó registrado en el inventario.',
    );
    expect(screen.getByText('Corrección posterior al cierre.')).toBeInTheDocument();
    expect(screen.getByText('Material pendiente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revertir consumo' })).toBeNull();
  });
});
