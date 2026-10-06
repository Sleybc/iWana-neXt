// R3 — acto «Registrar equipo instalado» e historial de consumos (CA-10 / CA-11).
//
// Se monta el drawer completo para que el slot reciba el sobre real (`order`,
// `requirement`, `action`, `context`); lo que el hook de custodia carga bajo
// demanda llega aquí por las props del contexto, tal como lo entrega el adaptador.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
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

    it('vacío del historial con el copy del requisito, también con el acto cerrado', () => {
      renderDrawer({ itemUsage: [] });

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
      expect(history.getAllByText('Mostrando 1 de 3 consumos').length).toBeGreaterThanOrEqual(1);
      await userEvent.click(history.getByRole('button', { name: 'Cargar más' }));

      expect(onLoadMoreItemUsage).toHaveBeenCalledTimes(1);
      expect(onLoadMoreExecutorCustody).not.toHaveBeenCalled();
    });
  });
});
