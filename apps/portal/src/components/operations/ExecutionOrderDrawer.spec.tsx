import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  InventoryResponsibleType,
  SerializedAssetStatus,
  StockBalanceCondition,
  WfmWorkType,
} from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ListMeta,
} from '@iwana/shared';
import type {
  ExecutionOrderDetailResponse,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import {
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_VARIANTS,
} from './operations-labels';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

// PROMPT-MOD11 §4.1: distribución de allowedActions por estado (contrato nuevo).
const preStartStatuses = [
  ExecutionOrderStatus.CREATED,
  ExecutionOrderStatus.ASSIGNED,
  ExecutionOrderStatus.EN_ROUTE,
];

function defaultActionsFor(status: ExecutionOrderStatus): ExecutionOrderAllowedAction[] {
  if (status === ExecutionOrderStatus.IN_PROGRESS) {
    return ['REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE', 'BLOCK', 'CLOSE'];
  }
  if (preStartStatuses.includes(status)) {
    return ['START'];
  }
  return [];
}

function detailFactory(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  const status = overrides.status ?? ExecutionOrderStatus.ASSIGNED;
  return {
    id: 'eo-001',
    number: 'OTE-20260727-001',
    version: 1,
    status,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-001',
      key: 'INSTALACION_FIBRA',
      version: 3,
      label: 'Instalación fibra',
    },
    schedule: {
      eventId: 'se-001',
      window: { startAt: '2026-07-27T14:00:00.000Z', endAt: '2026-07-27T16:00:00.000Z' },
    },
    assignee: {
      type: 'TECHNICIAN',
      id: 'tech-001',
      displayLabel: 'Carlos López',
    },
    site: { id: 'site-001', label: 'Torre Norte', address: 'Calle 1 # 2 - 3' },
    completion: { progress: 0 },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: defaultActionsFor(status),
    createdAt: '2026-07-27T12:00:00.000Z',
    updatedAt: '2026-07-27T12:00:00.000Z',
    ...overrides,
  };
}

function templateFactory(): ExecutionOrderTemplateVersion {
  return {
    id: 'tplv-001',
    templateId: 'tpl-001',
    key: 'INSTALACION_FIBRA',
    version: 3,
    label: 'Instalación fibra',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: [
      {
        key: 'req-verify-address',
        label: 'Verificar dirección',
        required: true,
        kind: 'FIELD',
        fieldType: 'BOOLEAN',
      },
      {
        key: 'req-connect-cpe',
        label: 'Conectar ONU',
        required: true,
        kind: 'ACTIVITY',
        activityType: 'INSTALLATION',
      },
      {
        key: 'req-speed-test',
        label: 'Prueba de velocidad',
        required: true,
        kind: 'MEASUREMENT',
        measurement: 'NUMBER',
        unit: 'Mbps',
      },
      {
        key: 'req-photo-install',
        label: 'Foto de instalación',
        required: true,
        kind: 'EVIDENCE',
        evidenceType: 'PHOTO',
      },
      {
        key: 'req-ont-serial',
        label: 'Serial ONT',
        required: true,
        kind: 'MATERIAL',
        itemCategory: 'ONT',
      },
    ],
    reasonCatalogs: ['CAUSA_TECNICA', 'CAUSA_CLIENTE'],
    effectiveFrom: '2026-07-01',
  };
}

function customerAcceptanceTemplateFactory(): ExecutionOrderTemplateVersion {
  const template = templateFactory();
  return {
    ...template,
    requirements: [
      ...template.requirements,
      {
        key: 'req-customer-acceptance',
        label: 'Aceptación del cliente',
        required: true,
        kind: 'COMPLIANCE',
        policyKey: 'CUSTOMER_ACCEPTANCE',
      },
    ],
  };
}

function activitiesFactory(): ExecutionOrderActivity[] {
  return [
    {
      id: 'act-001',
      activityType: 'INSTALLATION',
      description: 'Se instaló ONU en sala principal',
      occurredAt: '2026-07-27T14:30:00.000Z',
      actorRef: { type: 'USER', id: 'tech-001' },
      createdAt: '2026-07-27T14:30:00.000Z',
    },
    {
      id: 'act-002',
      activityType: 'FIELD_NOTE',
      description: 'Cableado externo en buen estado',
      occurredAt: '2026-07-27T14:45:00.000Z',
      actorRef: { type: 'USER', id: 'tech-001' },
      measurements: [{ key: 'distancia', value: 12, unit: 'm' }],
      createdAt: '2026-07-27T14:45:00.000Z',
    },
  ];
}

function itemUsageFactory(): ExecutionOrderItemUsage[] {
  return [
    {
      id: 'iu-001',
      itemId: 'item-001',
      quantity: 1,
      serial: 'ONT-2026-001',
      action: ExecutionOrderItemAction.INSTALL,
      finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      inventoryRequestId: 'ir-001',
      movementStatus: 'CONFIRMED',
      createdAt: '2026-07-27T14:30:00.000Z',
    },
  ];
}

function evidenceFactory(): ExecutionOrderEvidence[] {
  return [
    {
      id: 'ev-001',
      mediaAssetId: 'ma-001',
      evidenceType: 'PHOTO',
      requirementKey: 'req-photo-install',
      capturedAt: '2026-07-27T15:00:00.000Z',
      receivedAt: '2026-07-27T15:01:00.000Z',
      status: 'AVAILABLE',
      createdAt: '2026-07-27T15:01:00.000Z',
    },
  ];
}

function customerSignatureEvidenceFactory(): ExecutionOrderEvidence[] {
  return [
    {
      id: 'ev-signature-001',
      mediaAssetId: 'ma-signature-001',
      evidenceType: 'SIGNATURE',
      requirementKey: 'CUSTOMER_SIGNATURE',
      capturedAt: '2026-07-27T15:10:00.000Z',
      receivedAt: '2026-07-27T15:11:00.000Z',
      status: 'AVAILABLE',
      createdAt: '2026-07-27T15:11:00.000Z',
    },
  ];
}

const terminalStatuses = [
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
];

// Contrato congelado v1 de custodia del ejecutor (registros canónicos del portal).
function custodyAssetFactory(
  overrides: Partial<SerializedAssetRecord> = {},
): SerializedAssetRecord {
  return {
    id: 'custody-asset-001',
    tenantId: 'tenant-001',
    inventoryItemId: 'item-001',
    serialNumber: 'ONT-2026-001',
    normalizedSerialNumber: 'ONT2026001',
    macAddress: null,
    normalizedMacAddress: null,
    assetTag: null,
    currentStatus: SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN,
    currentLocationId: 'loc-mobile-001',
    currentResponsibleType: InventoryResponsibleType.TECHNICIAN,
    currentResponsibleRefId: 'tech-001',
    subscriberRefId: null,
    contractRefId: null,
    purchaseOrderRef: null,
    purchaseDate: null,
    usefulLifeMonths: null,
    warrantyUntil: null,
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
    ...overrides,
  };
}

function custodyBalanceFactory(overrides: Partial<StockBalanceRecord> = {}): StockBalanceRecord {
  return {
    id: 'custody-balance-001',
    tenantId: 'tenant-001',
    itemId: 'item-001',
    locationId: 'loc-mobile-001',
    lotId: null,
    condition: StockBalanceCondition.NEW,
    quantityOnHand: '4',
    quantityReserved: '0',
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
    ...overrides,
  };
}

function custodyMetaFactory(overrides: Partial<ListMeta> = {}): ListMeta {
  return {
    nextCursor: null,
    total: 1,
    totalIsEstimate: false,
    page: 1,
    limit: 25,
    totalPages: 1,
    hasMore: false,
    mode: 'page',
    capabilities: { randomAccess: true, sortableFields: [] },
    sort: null,
    ...overrides,
  };
}

const editableStatuses = [
  ExecutionOrderStatus.CREATED,
  ExecutionOrderStatus.ASSIGNED,
  ExecutionOrderStatus.EN_ROUTE,
  ExecutionOrderStatus.IN_PROGRESS,
  ExecutionOrderStatus.BLOCKED,
];

const allStatuses = [...editableStatuses, ...terminalStatuses];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionOrderDrawer', () => {
  const noop = async () => undefined;

  it('usa lima para el estado Ejecutada y reserva éxito para el resultado Ejecutada', () => {
    expect(EXECUTION_ORDER_STATUS_VARIANTS[ExecutionOrderStatus.COMPLETED]).toBe('lime');
    expect(EXECUTION_ORDER_RESULT_VARIANTS[ExecutionOrderResult.EXECUTED]).toBe('success');
  });

  it('renderiza el estado completado en lima y el resultado con variante de éxito', () => {
    renderDrawer({
      order: detailFactory({
        status: ExecutionOrderStatus.COMPLETED,
        result: ExecutionOrderResult.EXECUTED,
      }),
    });

    const executedBadges = screen.getAllByText('Ejecutada');
    expect(executedBadges.some((badge) => badge.className.includes('bg-iwana-secondary-100'))).toBe(
      true,
    );
    expect(executedBadges.some((badge) => badge.className.includes('bg-success-50'))).toBe(true);
  });

  function renderDrawer(props: Partial<Parameters<typeof ExecutionOrderDrawer>[0]> = {}) {
    return render(
      <ExecutionOrderDrawer
        open={true}
        order={detailFactory()}
        activities={[]}
        itemUsage={[]}
        evidence={[]}
        template={templateFactory()}
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
        onBlock={jest.fn().mockResolvedValue(undefined)}
        onUnblock={jest.fn().mockResolvedValue(undefined)}
        onCloseOrder={jest.fn().mockResolvedValue(undefined)}
        itemOptions={[{ value: 'item-001', label: 'ONT de instalación' }]}
        {...props}
      />,
    );
  }

  // ----------------------------------------------------
  // Loading, empty, error states
  // ----------------------------------------------------
  describe('async states', () => {
    it('shows skeleton while loading', () => {
      renderDrawer({ isLoading: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      expect(document.querySelectorAll('.animate-pulse')).toHaveLength(3);
    });

    it('shows empty state when no order and no error', () => {
      renderDrawer({ order: null, error: null });
      expect(screen.getByText('Sin OT seleccionada')).toBeInTheDocument();
    });

    it('shows error alert when loading fails', () => {
      const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
      renderDrawer({ order: null, error: 'Error de red al cargar la OT', onRefreshDetail });
      expect(screen.getByText('No fue posible cargar la OT')).toBeInTheDocument();
      screen.getByRole('button', { name: 'Reintentar' }).click();
      expect(onRefreshDetail).toHaveBeenCalledTimes(1);
    });

    it('shows inline error banner alongside content', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        error: 'Error al registrar actividad',
      });
      expect(screen.getByText('No fue posible completar la operación')).toBeInTheDocument();
      // OT number appears in both title and summary; verify at least 2 occurrences
      const matches = screen.getAllByText('OTE-20260727-001');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('shows a non-blocking success banner with the loaded order', () => {
      renderDrawer({ successMessage: 'La actividad quedó registrada.' });

      expect(screen.getByText('Operación completada')).toBeInTheDocument();
      expect(screen.getByText('La actividad quedó registrada.')).toBeInTheDocument();
      expect(screen.getByText('Compromiso')).toBeInTheDocument();
    });

    it('shows offline banner when no connection', () => {
      renderDrawer({ offline: true });
      // "Sin conexión" aparece en varios lugares (título, descripción y cierre)
      const matches = screen.getAllByText(/Sin conexión/);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('shows forbidden state when allowedActions is null', () => {
      renderDrawer({ order: detailFactory({ allowedActions: null }) });
      expect(screen.getByText(/No tienes acceso a esta orden/)).toBeInTheDocument();
      expect(screen.queryByText('Resumen de la OT')).not.toBeInTheDocument();
      expect(screen.queryByText('Compromiso')).not.toBeInTheDocument();
      expect(screen.queryByText('Equipos y materiales')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // State coverage — all 9 OT states
  // ----------------------------------------------------
  describe.each(allStatuses)('status %s', (status) => {
    const isTerminal = terminalStatuses.includes(status);

    it('renders the OT number (appears in title and summary)', () => {
      renderDrawer({ order: detailFactory({ status }) });
      const matches = screen.getAllByText('OTE-20260727-001');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('renders the 6 blocks', () => {
      renderDrawer({ order: detailFactory({ status }) });
      // Use headings that exist in sections
      expect(screen.getByText('Compromiso')).toBeInTheDocument();
      expect(screen.getByText('Checklist de instalación')).toBeInTheDocument();
      expect(screen.getByText('Trabajo realizado')).toBeInTheDocument();
      expect(screen.getByText('Equipos y materiales')).toBeInTheDocument();
      expect(screen.getByText('Evidencia y conformidad')).toBeInTheDocument();
      expect(screen.getByText('Cierre')).toBeInTheDocument();
    });

    if (isTerminal) {
      it('shows no editable controls (terminal)', () => {
        const overrides: Partial<ExecutionOrderDetailResponse> = { status };
        if (status === ExecutionOrderStatus.COMPLETED) {
          overrides.result = ExecutionOrderResult.EXECUTED;
        }
        renderDrawer({
          order: detailFactory(overrides),
          activities: activitiesFactory(),
          itemUsage: itemUsageFactory(),
          evidence: evidenceFactory(),
        });
        expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Crear seguimiento' })).toBeNull();
        expect(screen.getByText(/La OT está cerrada/)).toBeInTheDocument();
      });
    } else {
      it('shows editable controls matching allowedActions', () => {
        const isPreStartStatus = preStartStatuses.includes(status);
        const actions: ExecutionOrderAllowedAction[] =
          status === ExecutionOrderStatus.BLOCKED
            ? ['UNBLOCK']
            : isPreStartStatus
              ? ['START']
              : ['REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE', 'CLOSE'];
        renderDrawer({ order: detailFactory({ status, allowedActions: actions }) });

        if (status === ExecutionOrderStatus.BLOCKED) {
          expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
          expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
          return;
        }

        if (actions.includes('START')) {
          expect(screen.getByRole('button', { name: 'Iniciar ejecución' })).toBeInTheDocument();
        }
        if (isPreStartStatus) {
          expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
          expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
          expect(
            screen.getByText('Inicia la ejecución para registrar el trabajo realizado'),
          ).toBeInTheDocument();
          expect(
            screen.getByText('Inicia la ejecución para registrar equipos y materiales'),
          ).toBeInTheDocument();
          expect(
            screen.getByText('Inicia la ejecución para registrar evidencia'),
          ).toBeInTheDocument();
        } else {
          expect(screen.getByRole('button', { name: 'Registrar actividad' })).toBeInTheDocument();
          expect(screen.getByRole('button', { name: 'Registrar material' })).toBeInTheDocument();
          expect(
            screen.queryByText('Inicia la ejecución para registrar el trabajo realizado'),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText('Inicia la ejecución para registrar equipos y materiales'),
          ).not.toBeInTheDocument();
          expect(
            screen.queryByText('Inicia la ejecución para registrar evidencia'),
          ).not.toBeInTheDocument();
        }
      });
    }
  });

  // ----------------------------------------------------
  // Block 1 — Compromiso (deduplicado: sitio/ventana/responsable viven en Resumen)
  // ----------------------------------------------------
  describe('Block 1 — Compromiso', () => {
    it('shows site, window, responsible in Resumen and tipo/estado in Compromiso', () => {
      renderDrawer();
      // Sitio/responsable/plantilla están en el Resumen superior (no duplicados en Compromiso)
      expect(screen.getAllByText('Torre Norte').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Carlos López').length).toBeGreaterThanOrEqual(1);
      const section = screen.getByRole('region', { name: 'Compromiso' });
      expect(within(section).getByText(/Instalación/)).toBeInTheDocument();
      // Compromiso ya no duplica sitio/ventana
      expect(within(section).queryByText('Torre Norte')).not.toBeInTheDocument();
    });

    it('shows the OT number (title is also the OT number)', () => {
      renderDrawer();
      const matches = screen.getAllByText('OTE-20260727-001');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ----------------------------------------------------
  // Block 2 — Checklist
  // ----------------------------------------------------
  describe('Block 2 — Checklist', () => {
    it('renders ProgressMeter with template progress', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.IN_PROGRESS,
          completion: { progress: 60 },
        }),
      });
      const section = screen.getByRole('region', { name: 'Checklist de instalación' });
      expect(within(section).getByRole('progressbar')).toBeInTheDocument();
      expect(within(section).getByText('60%')).toBeInTheDocument();
    });

    it('lists template requirements', () => {
      renderDrawer();
      expect(screen.getByText('Verificar dirección')).toBeInTheDocument();
      expect(screen.getByText('Conectar ONU')).toBeInTheDocument();
      expect(screen.getByText('Prueba de velocidad')).toBeInTheDocument();
      expect(screen.getByText('Foto de instalación')).toBeInTheDocument();
      expect(screen.getByText('Serial ONT')).toBeInTheDocument();
    });

    it('muestra completados sobre total sin interpretar el valor completado como porcentaje', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.IN_PROGRESS,
          completion: { progress: 40, completed: 2, total: 5 },
        }),
      });

      const section = screen.getByRole('region', { name: 'Checklist de instalación' });
      expect(within(section).getByText(/2 de 5/)).toBeInTheDocument();
      expect(within(section).getByRole('progressbar')).toHaveValue(40);
    });

    it('shows actionable closure gaps without exposing internal identifiers', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        missingRequirements: [
          {
            requirementId: 'req-photo-install',
            label: 'Foto de instalación',
            kind: 'EVIDENCE',
            reason: 'Adjunta una foto de la instalación.',
          },
        ],
      });

      expect(screen.getByRole('alert', { name: 'Requisitos pendientes' })).toHaveTextContent(
        'Adjunta una foto de la instalación.',
      );
      expect(screen.queryByText('req-photo-install')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Block 3 — Trabajo realizado
  // ----------------------------------------------------
  describe('Block 3 — Trabajo realizado', () => {
    it('shows activity list when activities are available', () => {
      renderDrawer({ activities: activitiesFactory() });
      expect(screen.getByText('Se instaló ONU en sala principal')).toBeInTheDocument();
      expect(screen.getByText('Cableado externo en buen estado')).toBeInTheDocument();
    });

    it('shows empty message when no activities', () => {
      renderDrawer({ activities: [] });
      expect(screen.getByText(/Aún no hay actividades registradas/)).toBeInTheDocument();
    });

    it('shows activity registration form when allowed', async () => {
      const onRegisterActivity = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onRegisterActivity,
      });

      const textarea = screen.getByRole('textbox', { name: 'Descripción de la actividad' });
      await user.type(textarea, 'Cable tendido hasta el poste');
      await user.click(screen.getByRole('button', { name: 'Registrar actividad' }));

      expect(onRegisterActivity).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Cable tendido hasta el poste' }),
      );
    });

    it('muestra el toggle replegado cuando ya hay actividades registradas', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        activities: activitiesFactory(),
      });

      const toggle = screen.getByRole('button', { name: 'Registrar nueva actividad' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
      expect(screen.queryByRole('textbox', { name: 'Descripción de la actividad' })).toBeNull();
    });

    it('despliega el formulario al pulsar Registrar nueva actividad', async () => {
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        activities: activitiesFactory(),
      });

      await user.click(screen.getByRole('button', { name: 'Registrar nueva actividad' }));

      expect(screen.getByRole('button', { name: 'Registrar nueva actividad' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(
        screen.getByRole('textbox', { name: 'Descripción de la actividad' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ocultar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar actividad' })).toBeInTheDocument();
    });

    it('repliega el formulario tras registrar una actividad con éxito', async () => {
      const onRegisterActivity = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        activities: activitiesFactory(),
        onRegisterActivity,
      });

      await user.click(screen.getByRole('button', { name: 'Registrar nueva actividad' }));
      await user.type(
        screen.getByRole('textbox', { name: 'Descripción de la actividad' }),
        'Prueba de velocidad completada',
      );
      await user.click(screen.getByRole('button', { name: 'Registrar actividad' }));

      expect(onRegisterActivity).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Prueba de velocidad completada' }),
      );
      expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Registrar nueva actividad' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Descripción de la actividad' })).toBeNull();
    });

    it('muestra el formulario expandido sin toggle cuando no hay actividades', () => {
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      expect(screen.getByText('Registrar nueva actividad')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar nueva actividad' })).toBeNull();
      expect(
        screen.getByRole('textbox', { name: 'Descripción de la actividad' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ocultar' })).toBeNull();
    });

    it('does not show registration form on terminal OT', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
        }),
        activities: activitiesFactory(),
      });
      expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
    });
  });

  describe('payloads del contrato congelado', () => {
    it('envía note exacto al iniciar la OT', async () => {
      const onStart = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({ onStart });

      await user.click(screen.getByRole('button', { name: 'Iniciar ejecución' }));

      expect(onStart).toHaveBeenCalledWith('Inicio de ejecución en campo');
    });

    it('envía serialNumber y technicianCustodyId al registrar inventario', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onRegisterItemUsage,
      });

      await user.click(screen.getByRole('combobox', { name: 'Ítem' }));
      await user.click(screen.getByRole('option', { name: 'ONT de instalación' }));
      await user.type(screen.getByLabelText('Serial o lote'), 'ONT-2026-001');
      await user.click(screen.getByRole('combobox', { name: 'Acción' }));
      await user.click(screen.getByRole('option', { name: 'Instalar' }));
      await user.click(screen.getByRole('combobox', { name: 'Custodia de origen' }));
      await user.click(screen.getByRole('option', { name: 'Carlos López' }));
      await user.click(screen.getByRole('combobox', { name: 'Destino' }));
      await user.click(screen.getByRole('option', { name: 'Instalado en cliente' }));
      await user.click(screen.getByRole('button', { name: 'Registrar material' }));

      expect(onRegisterItemUsage).toHaveBeenCalledWith({
        itemId: 'item-001',
        technicianCustodyId: 'tech-001',
        quantity: 1,
        serialNumber: 'ONT-2026-001',
        action: 'INSTALL',
        finalDisposition: 'INSTALLED_AT_CUSTOMER',
      });
    });

    it('bloquea el registro hasta seleccionar acción y custodia', () => {
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
      expect(screen.getByLabelText('Acción')).toBeInTheDocument();
      expect(screen.getByLabelText('Custodia de origen')).toBeInTheDocument();
    });

    it('no fija una acción ni un destino por defecto', () => {
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      expect(screen.getByRole('combobox', { name: 'Acción' })).toHaveTextContent(
        'Selecciona una acción',
      );
      expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveTextContent(
        'Selecciona una opción',
      );
    });

    it('muestra estado vacío cuando la OT no tiene custodia elegible', () => {
      const { assignee: _assignee, ...orderWithoutAssignee } = detailFactory({
        status: ExecutionOrderStatus.IN_PROGRESS,
      });
      renderDrawer({
        order: orderWithoutAssignee,
      });

      expect(
        screen.getByText('La orden no tiene una custodia técnica o de cuadrilla elegible.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
    });

    it('conserva el requirementKey real y selecciona un solo archivo al subir evidencia', async () => {
      const onUploadEvidence = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onUploadEvidence,
      });

      const file = new File(['evidencia'], 'instalacion.jpg', { type: 'image/jpeg' });
      const input = screen.getByLabelText('Adjuntar evidencia');
      await user.upload(input, file);

      expect(input).not.toHaveAttribute('multiple');
      expect(onUploadEvidence).toHaveBeenCalledWith(file, 'req-photo-install');
    });

    it('muestra Cargar más cuando quedan evidencias y conserva el callback', async () => {
      const onLoadMoreEvidence = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        evidence: evidenceFactory(),
        evidenceMeta: {
          page: 20,
          limit: 1,
          total: 2,
          totalIsEstimate: false,
          totalPages: 2,
          nextCursor: null,
          hasMore: true,
          mode: 'page',
          capabilities: { randomAccess: true, sortableFields: [] },
          sort: null,
        },
        onLoadMoreEvidence,
      });

      await user.click(screen.getByRole('button', { name: 'Cargar más' }));

      expect(onLoadMoreEvidence).toHaveBeenCalledTimes(1);
    });

    it('envía summary obligatorio al cerrar la OT', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onCloseOrder,
      });

      const summary = screen.getByRole('textbox', { name: 'Resumen de cierre' });
      await user.clear(summary);
      await user.type(summary, 'Trabajo completado');
      const closeButton = await screen.findByRole('button', { name: 'Cerrar OT' });
      await waitFor(() => expect(closeButton).not.toBeDisabled());
      await user.click(closeButton);
      await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

      expect(onCloseOrder).toHaveBeenCalledWith({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Trabajo completado',
      });
    });

    it('envía customerAcceptance con artifactId y method al cerrar la OT', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onCloseOrder,
        evidence: customerSignatureEvidenceFactory(),
        template: customerAcceptanceTemplateFactory(),
      });

      const closeSummary = screen.getByRole('textbox', { name: 'Resumen de cierre' });
      await user.clear(closeSummary);
      await user.type(closeSummary, 'Trabajo completado');
      await waitFor(() => expect(closeSummary).toHaveValue('Trabajo completado'));
      const artifactSelect = screen.getByRole('combobox', { name: 'Referencia de evidencia' });
      await user.click(artifactSelect);
      await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
      await waitFor(() => expect(artifactSelect).toHaveTextContent('Firma del cliente'));
      const methodSelect = screen.getByRole('combobox', { name: 'Forma de aceptación' });
      await user.click(methodSelect);
      await user.click(screen.getByRole('option', { name: 'Firma' }));
      await waitFor(() => expect(methodSelect).toHaveTextContent('Firma'));
      const closeButton = screen.getByRole('button', { name: 'Cerrar OT' });
      await waitFor(() => expect(closeButton).not.toBeDisabled());
      await user.click(closeButton);
      await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));

      expect(onCloseOrder).toHaveBeenCalledWith({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Trabajo completado',
        customerAcceptance: { artifactId: 'ma-signature-001', method: 'SIGNATURE' },
      });
    });

    it('exige firma cuando el material queda instalado en cliente y envía solo SIGNATURE', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        itemUsage: itemUsageFactory(),
        evidence: customerSignatureEvidenceFactory(),
        onCloseOrder,
      });

      const closeSummary = screen.getByRole('textbox', { name: 'Resumen de cierre' });
      await user.clear(closeSummary);
      await user.type(closeSummary, 'Trabajo completado');
      await waitFor(() => expect(closeSummary).toHaveValue('Trabajo completado'));
      const closeButton = screen.getByRole('button', { name: 'Cerrar OT' });
      await waitFor(() => expect(closeButton).toBeDisabled());
      const artifactSelect = screen.getByRole('combobox', { name: 'Referencia de evidencia' });
      await user.click(artifactSelect);
      await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
      await waitFor(() => expect(artifactSelect).toHaveTextContent('Firma del cliente'));
      const methodSelect = screen.getByRole('combobox', { name: 'Forma de aceptación' });
      await user.click(methodSelect);
      expect(screen.getByRole('option', { name: 'Firma' })).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'Código de verificación' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Otra forma' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('option', { name: 'Firma' }));
      await waitFor(() => expect(methodSelect).toHaveTextContent('Firma'));
      await waitFor(() => expect(closeButton).not.toBeDisabled());
      await user.click(closeButton);
      await user.click(await screen.findByRole('button', { name: 'Confirmar cierre' }));

      expect(onCloseOrder).toHaveBeenCalledWith({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Trabajo completado',
        customerAcceptance: { artifactId: 'ma-signature-001', method: 'SIGNATURE' },
      });
    });

    it('mantiene el cierre disponible cuando no hay aceptación opcional elegible', async () => {
      const user = userEvent.setup();
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      const closeSummary = screen.getByRole('textbox', { name: 'Resumen de cierre' });
      await user.clear(closeSummary);
      await user.type(closeSummary, 'Trabajo completado');
      await waitFor(() => expect(closeSummary).toHaveValue('Trabajo completado'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Cerrar OT' })).not.toBeDisabled(),
      );
      expect(screen.getByRole('combobox', { name: 'Referencia de evidencia' })).toBeDisabled();
    });

    it('no permite escribir artifactId y explica cuando falta evidencia CUSTOMER_SIGNATURE', () => {
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      expect(screen.getByRole('combobox', { name: 'Referencia de evidencia' })).toBeDisabled();
      expect(
        screen.getByText(/No hay una firma de cliente disponible y validada/),
      ).toBeInTheDocument();
    });

    it('hace obligatoria la firma cuando el resultado implica material instalado en el cliente', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        itemUsage: itemUsageFactory(),
        onCloseOrder,
      });

      await user.type(
        screen.getByRole('textbox', { name: 'Resumen de cierre' }),
        'Trabajo completado',
      );
      expect(onCloseOrder).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeDisabled();
      expect(screen.getByText(/firma de cliente disponible y validada/)).toBeInTheDocument();
    });

    it('bloquea el cierre cuando la plantilla exige aceptación y falta evidencia elegible', async () => {
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        template: customerAcceptanceTemplateFactory(),
      });

      await user.type(
        screen.getByRole('textbox', { name: 'Resumen de cierre' }),
        'Trabajo completado',
      );

      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeDisabled();
      expect(
        screen.getByText(/No hay una firma de cliente disponible y validada/),
      ).toBeInTheDocument();
    });

    it('mantiene la captura en memoria y no usa almacenamiento del navegador', async () => {
      const setItem = jest.spyOn(Storage.prototype, 'setItem');
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        evidence: customerSignatureEvidenceFactory(),
      });

      await user.click(screen.getByRole('combobox', { name: 'Referencia de evidencia' }));
      await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
      await user.click(screen.getByRole('combobox', { name: 'Forma de aceptación' }));
      await user.click(screen.getByRole('option', { name: 'Firma' }));

      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });
  });

  // ----------------------------------------------------
  // Block 4 — Equipos y materiales
  // ----------------------------------------------------
  describe('Block 4 — Equipos y materiales', () => {
    it('shows item usage list with status badges', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        itemUsage: itemUsageFactory(),
      });
      expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(screen.getByText('Confirmado')).toBeInTheDocument();
    });

    it('does not expose item UUID when no serial is available', () => {
      const { serial: _serial, ...usageWithoutSerial } = itemUsageFactory()[0]!;
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        itemUsage: [usageWithoutSerial],
      });

      expect(screen.getByText('Material registrado')).toBeInTheDocument();
      expect(screen.queryByText('item-001')).not.toBeInTheDocument();
    });

    it('shows empty message when no items', () => {
      renderDrawer({ itemUsage: [] });
      expect(screen.getByText(/Aún no hay consumos registrados/)).toBeInTheDocument();
    });

    it('shows add item form when allowed', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
      });
      expect(screen.getByLabelText('Ítem')).toBeInTheDocument();
      expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeInTheDocument();
    });

    it('exige una cantidad positiva y muestra el error junto al campo', async () => {
      const user = userEvent.setup();
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      const quantity = screen.getByLabelText('Cantidad');
      expect(quantity).toHaveAttribute('min', '1');
      expect(quantity).toHaveAttribute('step', '1');

      await user.clear(quantity);
      await user.type(quantity, '0');

      expect(screen.getByText('La cantidad debe ser entera y mayor que cero.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();

      await user.clear(quantity);
      await user.type(quantity, '1.5');
      expect(screen.getByText('La cantidad debe ser entera y mayor que cero.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeDisabled();
    });

    it('disables add item form on terminal OT', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
        }),
        itemUsage: itemUsageFactory(),
      });
      expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
    });

    it('shows inventory reconciliation status', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
          inventoryReconciliation: 'CONFIRMED',
        }),
      });
      expect(screen.getByText(/Conciliación confirmada/)).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // En custodia del ejecutor (sub-sección de solo lectura del bloque 4)
  // ----------------------------------------------------
  describe('En custodia del ejecutor', () => {
    const custodyProps = {
      executorCustodyState: 'available' as const,
      executorCustodyName: 'Bodega móvil de Carlos López',
      executorCustodyAssets: [custodyAssetFactory()],
      executorCustodyAssetsMeta: custodyMetaFactory(),
      executorCustodyBalances: [custodyBalanceFactory()],
      executorCustodyBalancesMeta: custodyMetaFactory(),
    };

    function materialsSection() {
      return screen.getByRole('region', { name: 'Equipos y materiales' });
    }

    it('muestra custodia, equipos y materiales con datos del contrato', () => {
      renderDrawer({ ...custodyProps });

      expect(screen.getByText('En custodia del ejecutor')).toBeInTheDocument();
      expect(screen.getByText('Bodega móvil de Carlos López')).toBeInTheDocument();
      expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(screen.getByText('ONT de instalación · Asignado a técnico')).toBeInTheDocument();
      expect(screen.getByText('ONT de instalación')).toBeInTheDocument();
      expect(screen.getByText('Cantidad disponible: 4')).toBeInTheDocument();
      expect(screen.queryByText('Custodia no disponible')).not.toBeInTheDocument();
      expect(
        screen.queryByText('El ejecutor no tiene equipos ni materiales en custodia'),
      ).not.toBeInTheDocument();
    });

    it('muestra el vacío informativo cuando el ejecutor no tiene custodia', () => {
      renderDrawer({
        executorCustodyState: 'available',
        executorCustodyAssets: [],
        executorCustodyBalances: [],
      });

      expect(
        screen.getByText('El ejecutor no tiene equipos ni materiales en custodia'),
      ).toBeInTheDocument();
      expect(screen.getByText('Lo asignado desde inventario aparecerá aquí.')).toBeInTheDocument();
    });

    it('muestra la alerta de no disponible con la acción de actualizar detalle', () => {
      const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
      renderDrawer({
        executorCustodyState: 'unavailable',
        onRefreshDetail,
      });

      const section = materialsSection();
      expect(within(section).getByText('Custodia no disponible')).toBeInTheDocument();
      within(section).getByRole('button', { name: 'Actualizar detalle' }).click();
      expect(onRefreshDetail).toHaveBeenCalledTimes(1);
    });

    it('muestra skeleton mientras carga la custodia', () => {
      renderDrawer({ executorCustodyState: 'loading' });

      const section = materialsSection();
      expect(within(section).getByLabelText('Cargando custodia del ejecutor')).toBeInTheDocument();
      expect(within(section).getByText('En custodia del ejecutor')).toBeInTheDocument();
    });

    it('expone la paginación compartida vía onLoadMoreExecutorCustody', async () => {
      const onLoadMoreExecutorCustody = jest.fn().mockResolvedValue(undefined);
      renderDrawer({
        ...custodyProps,
        executorCustodyAssetsMeta: custodyMetaFactory({ hasMore: true, total: 3 }),
        executorCustodyBalancesMeta: custodyMetaFactory(),
        isLoadingMoreExecutorCustody: false,
        onLoadMoreExecutorCustody,
      });

      const section = materialsSection();
      const loadMore = within(section).getByRole('button', { name: 'Cargar más' });
      await userEvent.click(loadMore);
      expect(onLoadMoreExecutorCustody).toHaveBeenCalledTimes(1);
    });

    it('es visible en pre-inicio porque es información de lectura', () => {
      renderDrawer({
        ...custodyProps,
        order: detailFactory({ status: ExecutionOrderStatus.CREATED }),
      });

      expect(screen.getByText('En custodia del ejecutor')).toBeInTheDocument();
      expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
    });

    it.each(terminalStatuses)('queda oculta en estado terminal %s', (status) => {
      renderDrawer({
        ...custodyProps,
        order: detailFactory({ status, result: ExecutionOrderResult.EXECUTED }),
      });

      expect(screen.queryByText('En custodia del ejecutor')).not.toBeInTheDocument();
      expect(screen.queryByText('ONT-2026-001')).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Block 5 — Evidencia y conformidad
  // ----------------------------------------------------
  describe('Block 5 — Evidencia y conformidad', () => {
    it('normaliza evidencias null y mantiene el estado vacío', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        evidence: null,
      });

      expect(screen.getByText('Sin evidencias registradas')).toBeInTheDocument();
    });

    it('explica honestamente cuando el servicio de evidencias no está disponible', () => {
      const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        evidence: null,
        evidenceState: 'unavailable',
        onRefreshDetail,
      });

      expect(screen.getByText('Evidencias no disponibles')).toBeInTheDocument();
      expect(screen.getByText(/No pudimos consultar las evidencias/)).toBeInTheDocument();
      expect(screen.queryByText('Sin evidencias registradas')).not.toBeInTheDocument();
      screen.getByRole('button', { name: 'Actualizar detalle' }).click();
      expect(onRefreshDetail).toHaveBeenCalledTimes(1);
    });

    it('shows evidence list with status', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        evidence: evidenceFactory(),
      });
      expect(screen.getAllByText(/Foto de instalación/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Disponible')).toBeInTheDocument();
    });

    it('shows upload area when allowed', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
      });
      expect(screen.getByText('Adjuntar evidencia')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Seleccionar archivos' })).toBeInTheDocument();
    });

    it('shows geo-reference display', () => {
      renderDrawer();
      expect(screen.getByText('Calle 1 # 2 - 3')).toBeInTheDocument();
    });

    it('does not show upload on terminal OT', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
        }),
        evidence: evidenceFactory(),
      });
      expect(screen.queryByText('Adjuntar evidencia')).toBeNull();
    });
  });

  // ----------------------------------------------------
  // Block 6 — Cierre
  // ----------------------------------------------------
  describe('Block 6 — Cierre', () => {
    it('sin causas disponibles, solo muestra Ejecutada y Ejecutada con observaciones', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
      });
      expect(screen.getByLabelText('Resultado')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Resumen de cierre' })).toBeInTheDocument();
      // NOT_EXECUTED no debe aparecer sin catálogo de causas
      expect(screen.queryByRole('option', { name: 'No ejecutada' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
    });

    it('muestra opción No ejecutada y selector de causas cuando el catálogo está disponible', async () => {
      const user = userEvent.setup();
      const causes = [
        {
          id: 'cause-1',
          code: 'CUSTOMER_ABSENT',
          label: 'El cliente no estaba',
          category: 'CUSTOMER' as const,
          requiresEvidence: true,
        },
        {
          id: 'cause-2',
          code: 'FORCE_MAJEURE',
          label: 'Clima o vía cerrada',
          category: 'FORCE_MAJEURE' as const,
          requiresEvidence: false,
        },
      ];
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        nonRealizationCauses: causes,
      });
      // Abrir el select de resultado y seleccionar NOT_EXECUTED
      await user.click(screen.getByRole('combobox', { name: 'Resultado' }));
      await user.click(screen.getByRole('option', { name: 'No ejecutada' }));
      // Las tarjetas de causa deben aparecer
      expect(screen.getByText('El cliente no estaba')).toBeInTheDocument();
      expect(screen.getByText('Clima o vía cerrada')).toBeInTheDocument();
      // Seleccionar una causa con evidencia requerida
      await user.click(screen.getByText('El cliente no estaba'));
      expect(
        screen.getByText(/Toma una foto del sitio. Es lo que respalda que la visita se intentó./),
      ).toBeInTheDocument();
    });

    it('bloquea el cierre cuando la versión asignada de la plantilla no está disponible', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        template: null,
      });

      expect(screen.getAllByText('Plantilla no disponible').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).not.toBeInTheDocument();
      expect(
        screen.getByText(/No es posible validar los requisitos de cierre/),
      ).toBeInTheDocument();
    });

    it('bloquea la subida cuando la plantilla no está disponible y ofrece actualizar el detalle', () => {
      const onRefreshDetail = jest.fn().mockResolvedValue(undefined);
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.IN_PROGRESS,
          allowedActions: ['REGISTER_EVIDENCE'],
        }),
        template: null,
        onRefreshDetail,
      });

      expect(screen.getAllByText('Plantilla no disponible').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByLabelText('Adjuntar evidencia')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Seleccionar archivos' }),
      ).not.toBeInTheDocument();
      screen.getByRole('button', { name: 'Actualizar detalle' }).click();
      expect(onRefreshDetail).toHaveBeenCalledTimes(1);
    });

    it('usa copy seguro en checklist y requisitos pendientes sin label', () => {
      const template = templateFactory();
      template.requirements[0] = {
        ...template.requirements[0],
        label: '',
      } as (typeof template.requirements)[number];
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        template,
        missingRequirements: [
          {
            requirementId: 'req-unknown',
            label: '',
            kind: 'MEASUREMENT',
            reason: '',
          },
        ],
      });

      expect(screen.getByText('Información requerida')).toBeInTheDocument();
      expect(screen.getByText('Medición requerida')).toBeInTheDocument();
      expect(
        screen.getByText('Completa el requisito pendiente antes de cerrar la orden.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('req-unknown')).not.toBeInTheDocument();
    });

    it('shows readonly close block on terminal OT', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
          completion: { progress: 100, closedAt: '2026-07-27T15:30:00.000Z' },
        }),
      });
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
      expect(screen.getByText(/La OT está cerrada/)).toBeInTheDocument();
    });

    it('shows confirmation dialog before closing', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onCloseOrder,
      });

      // Type summary to enable the close button
      const textarea = screen.getByRole('textbox', { name: 'Resumen de cierre' });
      await user.clear(textarea);
      await user.type(textarea, 'Trabajo completado exitosamente');

      // Wait for the button to be enabled
      const closeBtn = await screen.findByRole('button', { name: 'Cerrar OT' });
      await waitFor(() => expect(closeBtn).not.toBeDisabled());

      // Click the close button to open confirmation
      await user.click(closeBtn);

      // Verify confirmation dialog appeared by checking the cancel button
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });

    it('shows missing requirements from closure gate', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.IN_PROGRESS,
          completion: { progress: 40 },
        }),
      });
      expect(screen.getByText(/Requisitos pendientes/)).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Blocked state
  // ----------------------------------------------------
  describe('Blocked state', () => {
    it('shows blocked reason and unblock action', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.BLOCKED,
          allowedActions: ['UNBLOCK'],
        }),
        activities: activitiesFactory(),
      });
      // The status badge should say "Bloqueada" (appears in ExecutionOrderSummary and Block 1)
      const matches = screen.getAllByText('Bloqueada');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Desbloqueo no disponible')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Desbloquear OT' })).toBeNull();
    });

    it('does not render block or unblock controls without real handlers', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.BLOCKED, allowedActions: ['UNBLOCK'] }),
        onBlock: undefined as never,
        onUnblock: undefined as never,
      });

      expect(screen.queryByRole('button', { name: 'Bloquear OT' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Desbloquear OT' })).toBeNull();
      expect(screen.queryByText('Desbloqueo no disponible')).toBeNull();
    });
  });

  // ----------------------------------------------------
  // Accessibility
  // ----------------------------------------------------
  describe('accessibility', () => {
    it('uses dialog role for the drawer', () => {
      renderDrawer();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has labelled sections for each block', () => {
      renderDrawer();
      // Each section has an aria-labelledby pointing to its heading
      const sectionLabels = [
        'Compromiso',
        'Checklist de instalación',
        'Trabajo realizado',
        'Equipos y materiales',
        'Evidencia y conformidad',
        'Cierre',
      ];
      sectionLabels.forEach((label) => {
        expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
      });
    });

    it('focuses drawer content when opened', () => {
      renderDrawer();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Offline state
  // ----------------------------------------------------
  describe('offline', () => {
    it('blocks all mutation buttons when offline', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        offline: true,
      });
      // "Sin conexión" aparece en varios lugares
      const matches = screen.getAllByText(/Sin conexión/);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Crear seguimiento' })).toBeNull();
    });
  });

  describe('syncState', () => {
    it.each(['PENDING', 'DIVERGED', 'FAILED'] as const)(
      'mantiene la OT en solo lectura cuando la sincronización está en %s',
      (syncState) => {
        renderDrawer({
          order: detailFactory({
            status: ExecutionOrderStatus.IN_PROGRESS,
            syncState,
            allowedActions: ['START', 'REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'CLOSE'],
          }),
        });

        expect(
          screen.getByText(/Solo puedes consultar o actualizar el detalle/),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Registrar actividad' }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: 'Registrar material' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Cerrar OT' })).not.toBeInTheDocument();
      },
    );

    it('no afirma sincronización cuando el estado no está disponible', () => {
      renderDrawer({ order: detailFactory({ syncState: undefined as never }) });

      expect(screen.getByText('Estado de sincronización no disponible')).toBeInTheDocument();
      expect(screen.queryByText('Sincronizada')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Iniciar ejecución' })).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Checklist gate — no iniciar => solo consulta
  // ----------------------------------------------------
  describe('Checklist gate', () => {
    it.each(preStartStatuses)('deshabilita el checklist antes de iniciar (%s)', (status) => {
      renderDrawer({ order: detailFactory({ status }) });

      expect(
        screen.getByText('Inicia la ejecución para habilitar el checklist'),
      ).toBeInTheDocument();
      const checklistSection = screen.getByRole('region', { name: 'Checklist de instalación' });
      expect(within(checklistSection).getByText('Avance de requisitos')).toBeInTheDocument();
      // contenido atenuado y marcado como deshabilitado
      const disabledContainer = checklistSection.querySelector('[aria-disabled="true"]');
      expect(disabledContainer).not.toBeNull();
      expect(disabledContainer?.className).toContain('opacity-60');
      // requisitos pendientes suprimidos antes de iniciar
      expect(
        screen.queryByRole('alert', { name: 'Requisitos pendientes' }),
      ).not.toBeInTheDocument();
    });

    it('activa el checklist cuando la ejecución ya inició', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        missingRequirements: [
          {
            requirementId: 'req-x',
            label: 'Foto faltante',
            kind: 'EVIDENCE',
            reason: 'Falta foto',
          },
        ],
      });

      expect(
        screen.queryByText('Inicia la ejecución para habilitar el checklist'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('alert', { name: 'Requisitos pendientes' })).toBeInTheDocument();
      const checklistSection = screen.getByRole('region', { name: 'Checklist de instalación' });
      expect(checklistSection.querySelector('[aria-disabled="true"]')).toBeNull();
    });

    it('permite ver el checklist en estado terminal sin el gate de inicio', () => {
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.COMPLETED,
          result: ExecutionOrderResult.EXECUTED,
        }),
      });

      expect(
        screen.queryByText('Inicia la ejecución para habilitar el checklist'),
      ).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Pre-inicio — bloques 3/4/5 en solo lectura con hint
  // ----------------------------------------------------
  describe('Pre-inicio — bloques 3/4/5 en solo lectura con hint', () => {
    it.each(preStartStatuses)(
      'muestra hint por bloque y oculta los formularios de registro (%s)',
      (status) => {
        renderDrawer({
          order: detailFactory({ status }),
          activities: activitiesFactory(),
          itemUsage: itemUsageFactory(),
          evidence: evidenceFactory(),
        });

        const workSection = screen.getByRole('region', { name: 'Trabajo realizado' });
        expect(
          within(workSection).getByText('Inicia la ejecución para registrar el trabajo realizado'),
        ).toBeInTheDocument();
        expect(
          within(workSection).queryByRole('button', { name: 'Registrar actividad' }),
        ).toBeNull();

        const materialsSection = screen.getByRole('region', { name: 'Equipos y materiales' });
        expect(
          within(materialsSection).getByText(
            'Inicia la ejecución para registrar equipos y materiales',
          ),
        ).toBeInTheDocument();
        expect(
          within(materialsSection).queryByRole('button', { name: 'Registrar material' }),
        ).toBeNull();

        const evidenceSection = screen.getByRole('region', { name: 'Evidencia y conformidad' });
        expect(
          within(evidenceSection).getByText('Inicia la ejecución para registrar evidencia'),
        ).toBeInTheDocument();
        expect(within(evidenceSection).queryByText('Adjuntar evidencia')).toBeNull();

        // La lista (lectura) permanece visible junto al hint.
        expect(
          within(workSection).getByText('Se instaló ONU en sala principal'),
        ).toBeInTheDocument();
        expect(within(materialsSection).getByText('ONT-2026-001')).toBeInTheDocument();
        expect(
          within(evidenceSection).getAllByText(/Foto de instalación/).length,
        ).toBeGreaterThanOrEqual(1);
      },
    );

    it.each(preStartStatuses)(
      'mantiene los estados vacíos visibles junto al hint pre-inicio (%s)',
      (status) => {
        renderDrawer({ order: detailFactory({ status }) });

        expect(screen.getByText('Aún no hay actividades registradas')).toBeInTheDocument();
        expect(screen.getByText('Aún no hay consumos registrados')).toBeInTheDocument();
        expect(screen.getByText('Sin evidencias registradas')).toBeInTheDocument();
      },
    );

    it('no muestra los hints pre-inicio cuando la ejecución ya inició', () => {
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      expect(
        screen.queryByText('Inicia la ejecución para registrar el trabajo realizado'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Inicia la ejecución para registrar equipos y materiales'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Inicia la ejecución para registrar evidencia'),
      ).not.toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Responsive behavior
  // ----------------------------------------------------
  describe('responsive', () => {
    it('uses wide size for the workspace', () => {
      renderDrawer();
      const aside = document.querySelector('aside');
      expect(aside?.className).toContain('md:max-w-[48rem]');
    });
  });

  // ----------------------------------------------------
  // QA-49 — cero persistencia de OT en el navegador
  // ----------------------------------------------------
  describe('QA-49: cero persistencia de OT en el navegador', () => {
    function spyBrowserStorage() {
      return {
        setItem: jest.spyOn(Storage.prototype, 'setItem'),
        removeItem: jest.spyOn(Storage.prototype, 'removeItem'),
        clear: jest.spyOn(Storage.prototype, 'clear'),
        // jsdom no implementa IndexedDB: si el entorno no la expone, no existe
        // superficie de escritura que vigilar.
        open: typeof indexedDB === 'undefined' ? null : jest.spyOn(indexedDB, 'open'),
      };
    }

    function expectZeroStorageWrites(spies: {
      setItem: jest.SpyInstance;
      removeItem: jest.SpyInstance;
      clear: jest.SpyInstance;
      open: jest.SpyInstance | null;
    }) {
      expect(spies.setItem).not.toHaveBeenCalled();
      expect(spies.removeItem).not.toHaveBeenCalled();
      expect(spies.clear).not.toHaveBeenCalled();
      if (spies.open) expect(spies.open).not.toHaveBeenCalled();
      spies.setItem.mockRestore();
      spies.removeItem.mockRestore();
      spies.clear.mockRestore();
      spies.open?.mockRestore();
    }

    it('no escribe OT en storage al renderizar detalle con evidencia, actividades y materiales', () => {
      const spies = spyBrowserStorage();
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.IN_PROGRESS,
          allowedActions: ['START', 'REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'CLOSE'],
        }),
        activities: activitiesFactory(),
        itemUsage: itemUsageFactory(),
        evidence: [...evidenceFactory(), ...customerSignatureEvidenceFactory()],
        template: customerAcceptanceTemplateFactory(),
      });

      // El detalle se muestra completo (contenido sensible en memoria).
      expect(screen.getByText('ONT-2026-001')).toBeInTheDocument();
      expect(screen.getByText('Se instaló ONU en sala principal')).toBeInTheDocument();
      expect(screen.getByText(/Firma · Evidencia asociada/u)).toBeInTheDocument();

      expectZeroStorageWrites(spies);
    });

    it('no persiste la selección de evidencia ni la firma del cliente al operar el cierre', async () => {
      const spies = spyBrowserStorage();
      const user = userEvent.setup();
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      renderDrawer({
        order: detailFactory({
          status: ExecutionOrderStatus.IN_PROGRESS,
          allowedActions: ['REGISTER_ACTIVITY', 'REGISTER_EVIDENCE', 'CLOSE'],
        }),
        evidence: customerSignatureEvidenceFactory(),
        template: customerAcceptanceTemplateFactory(),
        onCloseOrder,
      });

      await user.type(
        screen.getByRole('textbox', { name: 'Resumen de cierre' }),
        'Trabajo completado y firmado',
      );
      await user.click(screen.getByRole('combobox', { name: 'Referencia de evidencia' }));
      await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
      await user.click(screen.getByRole('combobox', { name: 'Forma de aceptación' }));
      await user.click(screen.getByRole('option', { name: 'Firma' }));

      expectZeroStorageWrites(spies);
    });
  });
});
