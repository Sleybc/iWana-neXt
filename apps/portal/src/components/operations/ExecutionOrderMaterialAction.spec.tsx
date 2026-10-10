// R3 — acto «Registrar equipo instalado» e historial de consumos (CA-10 / CA-11).
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
  { value: 'item-ont', label: 'CPE-ONT · ONT de fibra' },
  { value: 'item-router', label: 'CPE-RTR · Router WiFi' },
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
    fireEvent.click(screen.getByRole('button', { name: /^Registrar equipo instalado para / }));
  }
  return {
    ...result,
    /** Nuevas props sobre el mismo árbol: conserva el estado del formulario abierto. */
    update: (next: Partial<DrawerProps>) => result.rerender(<DrawerUnderTest {...next} />),
  };
}

const sheet = () => screen.getByRole('region', { name: 'Registrar equipo instalado' });

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

        expect(screen.queryByRole('button', { name: /Registrar equipo instalado/ })).toBeNull();
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
      expect(screen.queryByRole('button', { name: /Registrar equipo instalado/ })).toBeNull();
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

      expect(screen.queryByRole('button', { name: /Registrar equipo instalado/ })).toBeNull();
      expect(onOpenRequirementAction).not.toHaveBeenCalled();
    });

    it('con la OT solo cargada, sin abrir el acto, la custodia no se monta ni se pide', () => {
      const onOpenRequirementAction = jest.fn();
      renderDrawer({ onOpenRequirementAction });

      expect(
        screen.getByRole('button', { name: /^Registrar equipo instalado para / }),
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
      expect(screen.queryByRole('region', { name: 'Registrar equipo instalado' })).toBeNull();
    });
  });

  describe('estados de la carga bajo demanda', () => {
    it('cargando: esqueleto de custodia y selector con su estado, sin vacío definitivo', () => {
      renderDrawer(
        { executorCustodyState: 'loading', itemsState: 'loading', itemOptions: [] },
        { open: true },
      );

      expect(within(sheet()).getByLabelText('Cargando custodia del ejecutor')).toBeInTheDocument();
      expect(within(sheet()).getByRole('combobox', { name: 'Ítem' })).toBeDisabled();
      expect(within(sheet()).getByText('Consultando tu custodia.')).toBeInTheDocument();
      expect(
        screen.queryByText('No hay equipos de esta categoría en tu custodia'),
      ).not.toBeInTheDocument();
    });

    it('disponible con equipos: muestra solo lo entregado, con su categoría y conteo', () => {
      renderDrawer(
        {
          executorCustodyName: 'Bodega móvil de Carlos López',
          executorCustodyAssets: [custodyAsset],
          executorCustodyAssetsMeta: meta(),
          executorCustodyBalances: [custodyBalance],
          executorCustodyBalancesMeta: meta(),
        },
        { open: true },
      );

      const region = within(sheet());
      expect(region.getByText('Bodega móvil de Carlos López')).toBeInTheDocument();
      expect(region.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(region.getByText('CPE-ONT · ONT de fibra · Asignado a técnico')).toBeInTheDocument();
      expect(region.getAllByText('CPE-RTR · Router WiFi').length).toBeGreaterThanOrEqual(1);
      expect(region.getByText('Cantidad disponible: 4')).toBeInTheDocument();
      // Concordancia con el total que se informa.
      expect(region.getByText('1 equipo')).toBeInTheDocument();
      expect(region.getByText('1 material')).toBeInTheDocument();
      expect(region.getByText('Selecciona un equipo de tu custodia')).toBeInTheDocument();
    });

    it('vacío por categoría: copy cerrado de UX §5 y selector sin opciones de otra categoría', () => {
      renderDrawer(
        { itemOptions: [], executorCustodyAssets: [], executorCustodyBalances: [] },
        { open: true },
      );

      const region = within(sheet());
      expect(
        region.getByText('No hay equipos de esta categoría en tu custodia'),
      ).toBeInTheDocument();
      expect(
        region.getByText('Contacta a supervisión para revisar la disponibilidad.'),
      ).toBeInTheDocument();
      expect(region.getByRole('combobox', { name: 'Ítem' })).toBeDisabled();
      expect(region.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
    });

    it('error: alerta de custodia no disponible y reintento que reabre el mismo acto', async () => {
      const onOpenRequirementAction = jest.fn();
      const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
      renderDrawer(
        {
          executorCustodyState: 'unavailable',
          itemsState: 'unavailable',
          itemOptions: [],
          onOpenRequirementAction,
          onRefreshDetail,
        },
        { open: true },
      );
      onOpenRequirementAction.mockClear();

      const region = within(sheet());
      expect(region.getByText('Custodia no disponible')).toBeInTheDocument();
      expect(region.getByRole('combobox', { name: 'Ítem' })).toHaveTextContent(
        'Inventario no disponible',
      );
      expect(region.getByRole('combobox', { name: 'Ítem' })).toBeDisabled();
      await userEvent.click(region.getByRole('button', { name: 'Reintentar' }));

      // El reintento recarga solo la custodia: reabre el mismo descriptor, no el detalle.
      expect(onOpenRequirementAction).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'consumption', requirementKey: 'installed-equipment' }),
      );
      expect(onRefreshDetail).not.toHaveBeenCalled();
    });

    it('si la conexión cae con la hoja abierta, el formulario queda bloqueado y la red se avisa', () => {
      const { update } = renderDrawer({}, { open: true });
      expect(within(sheet()).getByLabelText('Cantidad')).toBeEnabled();

      update({ offline: true });

      expect(
        within(sheet()).getByText('Sin conexión; vuelve a intentar cuando recuperes la red.'),
      ).toBeInTheDocument();
      expect(within(sheet()).getByLabelText('Cantidad')).toBeDisabled();
    });

    it('la paginación se conserva: «Cargar más» pide la siguiente página de custodia', async () => {
      const onLoadMoreExecutorCustody = jest.fn().mockResolvedValue(undefined);
      renderDrawer(
        {
          executorCustodyAssets: [custodyAsset],
          executorCustodyAssetsMeta: meta({ hasMore: true, total: 1 }),
          executorCustodyBalances: [],
          executorCustodyBalancesMeta: meta({ total: 0 }),
          onLoadMoreExecutorCustody,
        },
        { open: true },
      );

      await userEvent.click(within(sheet()).getByRole('button', { name: 'Cargar más' }));

      expect(onLoadMoreExecutorCustody).toHaveBeenCalledTimes(1);
    });
  });

  describe('formulario y payload', () => {
    async function fillAndSubmit(
      user: ReturnType<typeof userEvent.setup>,
      serial = 'ONT-2026-001',
    ) {
      await user.click(screen.getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'CPE-ONT · ONT de fibra' }));
      await user.type(screen.getByLabelText('Serial o lote'), serial);
      await user.click(screen.getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Instalar' }));
      await user.click(screen.getByRole('button', { name: 'Registrar material' }));
    }

    it('conserva el payload vigente: ítem, custodia del responsable, cantidad, acción y destino del requisito', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(true);
      const user = userEvent.setup();
      renderDrawer({ onRegisterItemUsage }, { open: true });

      // El responsable de la OT es la única custodia elegible: llega preseleccionado.
      expect(screen.getByRole('combobox', { name: 'Custodia de origen' })).toHaveTextContent(
        'Carlos López',
      );
      await fillAndSubmit(user);

      expect(onRegisterItemUsage).toHaveBeenCalledTimes(1);
      expect(onRegisterItemUsage).toHaveBeenCalledWith({
        itemId: 'item-ont',
        requirementKey: 'installed-equipment',
        technicianCustodyId: 'tech-001',
        quantity: 1,
        serialNumber: 'ONT-2026-001',
        action: 'INSTALL',
        finalDisposition: 'INSTALLED_AT_CUSTOMER',
      });
    });

    it('usa la custodia entregada por el adaptador (ubicación del responsable)', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(true);
      const user = userEvent.setup();
      renderDrawer(
        {
          onRegisterItemUsage,
          custodyOptions: [{ type: 'TECHNICIAN', id: 'tech-001', label: 'Bodega móvil de Carlos' }],
        },
        { open: true },
      );

      expect(screen.getByRole('combobox', { name: 'Custodia de origen' })).toHaveTextContent(
        'Bodega móvil de Carlos',
      );
      await fillAndSubmit(user);

      expect(onRegisterItemUsage).toHaveBeenCalledWith(
        expect.objectContaining({ technicianCustodyId: 'tech-001' }),
      );
    });

    it('el destino lo define el requisito: queda fijo, visible y sin opciones ajenas', async () => {
      const user = userEvent.setup();
      renderDrawer({}, { open: true });

      const destination = screen.getByRole('combobox', { name: 'Destino' });
      expect(destination).toBeDisabled();
      expect(destination).toHaveTextContent('Instalado en cliente');
      expect(screen.getByText('Lo define el requisito.')).toBeInTheDocument();
      await user.click(destination);
      expect(screen.queryByRole('option', { name: 'Consumo interno' })).toBeNull();
    });

    it('sin destino declarado por el requisito el usuario lo elige', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(true);
      const user = userEvent.setup();
      const free = template();
      renderDrawer(
        { onRegisterItemUsage, template: free, order: detail({}, free) },
        { open: true },
      );

      expect(screen.getByRole('combobox', { name: 'Destino' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
      await user.click(screen.getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'CPE-ONT · ONT de fibra' }));
      await user.click(screen.getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Consumir' }));
      await user.click(screen.getByRole('combobox', { name: 'Destino' }));
      await user.click(screen.getByRole('option', { name: 'Consumo interno' }));
      await user.click(screen.getByRole('button', { name: 'Registrar material' }));

      expect(onRegisterItemUsage).toHaveBeenCalledWith({
        itemId: 'item-ont',
        requirementKey: 'installed-equipment',
        technicianCustodyId: 'tech-001',
        quantity: 1,
        action: 'CONSUME',
        finalDisposition: 'INTERNAL_CONSUMPTION',
      });
    });

    it('no habilita el registro hasta elegir ítem y acción, y valida la cantidad', async () => {
      const user = userEvent.setup();
      renderDrawer({}, { open: true });
      const submit = screen.getByRole('button', { name: 'Registrar material' });

      expect(submit).toBeDisabled();
      await user.click(screen.getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'CPE-RTR · Router WiFi' }));
      expect(submit).toBeDisabled();
      await user.click(screen.getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Instalar' }));
      expect(submit).toBeEnabled();

      await user.clear(screen.getByLabelText('Cantidad'));
      await user.type(screen.getByLabelText('Cantidad'), '0');
      expect(screen.getByText('La cantidad debe ser entera y mayor que cero.')).toBeInTheDocument();
      expect(submit).toBeDisabled();
    });

    it('un fallo conserva la captura; un éxito limpia ítem, serial y acción', async () => {
      const onRegisterItemUsage = jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const user = userEvent.setup();
      renderDrawer({ onRegisterItemUsage }, { open: true });

      await fillAndSubmit(user);
      expect(screen.getByLabelText('Serial o lote')).toHaveValue('ONT-2026-001');
      expect(screen.getByRole('combobox', { name: 'Ítem' })).toHaveTextContent(
        'CPE-ONT · ONT de fibra',
      );

      await user.click(screen.getByRole('button', { name: 'Registrar material' }));
      expect(onRegisterItemUsage).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Serial o lote')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Acción' })).toHaveTextContent(
        'Selecciona una acción',
      );
    });

    it('si la lista de opciones cambia y el ítem elegido ya no es compatible, no se envía', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(true);
      const user = userEvent.setup();
      const { update } = renderDrawer({ onRegisterItemUsage }, { open: true });
      await user.click(screen.getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'CPE-ONT · ONT de fibra' }));
      await user.click(screen.getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Instalar' }));
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeEnabled();

      update({
        onRegisterItemUsage,
        itemOptions: [{ value: 'item-router', label: 'CPE-RTR · Router WiFi' }],
      });

      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
      expect(onRegisterItemUsage).not.toHaveBeenCalled();
    });

    it('sin responsable la custodia de origen no existe y el registro queda bloqueado', () => {
      const { assignee: _assignee, ...withoutAssignee } = detail();
      renderDrawer({ order: withoutAssignee as ExecutionOrderDetailResponse }, { open: true });

      expect(
        screen.getByText('La orden no tiene una custodia técnica o de cuadrilla elegible.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
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
      // La custodia disponible solo aparece dentro del acto, nunca en el historial.
      expect(within(history).queryByText('En custodia del ejecutor')).toBeNull();
      expect(within(capture).getByText('En custodia del ejecutor')).toBeInTheDocument();
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
