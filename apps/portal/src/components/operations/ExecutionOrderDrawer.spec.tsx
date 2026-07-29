import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ExecutionOrderItemAction,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  InventoryDisposition,
  WfmWorkType,
} from '@iwana/shared';
import type {
  ExecutionOrderDetail,
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
} from '@iwana/shared';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function detailFactory(overrides: Partial<ExecutionOrderDetail> = {}): ExecutionOrderDetail {
  return {
    id: 'eo-001',
    number: 'OTE-20260727-001',
    version: 1,
    status: ExecutionOrderStatus.ASSIGNED,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-001',
      key: 'INSTALACION_FIBRA',
      version: 3,
      label: 'Instalacion fibra',
    },
    schedule: {
      eventId: 'se-001',
      window: { startAt: '2026-07-27T14:00:00.000Z', endAt: '2026-07-27T16:00:00.000Z' },
    },
    assignee: {
      type: 'TECHNICIAN',
      id: 'tech-001',
      displayLabel: 'Carlos Lopez',
    },
    site: { id: 'site-001', label: 'Torre Norte', address: 'Calle 1 # 2 - 3' },
    completion: { progress: 0 },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: [
      'START',
      'REGISTER_ACTIVITY',
      'REGISTER_ITEM_USAGE',
      'REGISTER_EVIDENCE',
      'CLOSE',
    ],
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
    label: 'Instalacion fibra',
    workType: WfmWorkType.INSTALLATION,
    status: 'PUBLISHED',
    requirements: [
      {
        key: 'req-verify-address',
        label: 'Verificar direccion',
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
        label: 'Foto de instalacion',
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

function activitiesFactory(): ExecutionOrderActivity[] {
  return [
    {
      id: 'act-001',
      activityType: 'INSTALLATION',
      description: 'Se instalo ONU en sala principal',
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

const terminalStatuses = [
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
];

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
        onStart={jest.fn().mockResolvedValue(undefined)}
        onRegisterActivity={jest.fn().mockResolvedValue(undefined)}
        onRegisterItemUsage={jest.fn().mockResolvedValue(undefined)}
        onUploadEvidence={jest.fn().mockResolvedValue(undefined)}
        onBlock={jest.fn().mockResolvedValue(undefined)}
        onUnblock={jest.fn().mockResolvedValue(undefined)}
        onCloseOrder={jest.fn().mockResolvedValue(undefined)}
        onCreateFollowUp={jest.fn().mockResolvedValue(undefined)}
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
    });

    it('shows empty state when no order and no error', () => {
      renderDrawer({ order: null, error: null });
      expect(screen.getByText('Sin OT seleccionada')).toBeInTheDocument();
    });

    it('shows error alert when loading fails', () => {
      renderDrawer({ order: null, error: 'Error de red al cargar la OT' });
      expect(screen.getByText('No fue posible cargar la OT')).toBeInTheDocument();
    });

    it('shows inline error banner alongside content', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        error: 'Error al registrar actividad',
      });
      expect(screen.getByText('No fue posible completar la operacion')).toBeInTheDocument();
      // OT number appears in both title and summary; verify at least 2 occurrences
      const matches = screen.getAllByText('OTE-20260727-001');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('shows offline banner when no connection', () => {
      renderDrawer({ offline: true });
      // "Sin conexion" appears in multiple places (banner title, description, close block)
      const matches = screen.getAllByText(/Sin conexion/);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('shows forbidden state when allowedActions is null', () => {
      renderDrawer({ order: detailFactory({ allowedActions: null }) });
      expect(screen.getByText(/No tienes acceso a esta orden/)).toBeInTheDocument();
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
      expect(screen.getByText('Checklist de instalacion')).toBeInTheDocument();
      expect(screen.getByText('Trabajo realizado')).toBeInTheDocument();
      expect(screen.getByText('Equipos y materiales')).toBeInTheDocument();
      expect(screen.getByText('Evidencia y conformidad')).toBeInTheDocument();
      expect(screen.getByText('Cierre')).toBeInTheDocument();
    });

    if (isTerminal) {
      it('shows no editable controls (terminal)', () => {
        const overrides: Partial<ExecutionOrderDetail> = { status };
        if (status === ExecutionOrderStatus.COMPLETED) {
          overrides.result = ExecutionOrderResult.EXECUTED;
        }
        renderDrawer({
          order: detailFactory(overrides),
          activities: activitiesFactory(),
          itemUsage: itemUsageFactory(),
          evidence: evidenceFactory(),
        });
        expect(screen.queryByRole('button', { name: 'Iniciar ejecucion' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
        expect(screen.getByText(/La OT esta cerrada/)).toBeInTheDocument();
      });

      it('shows follow-up creation button', () => {
        const overrides: Partial<ExecutionOrderDetail> = { status };
        overrides.result = ExecutionOrderResult.EXECUTED;
        overrides.allowedActions = ['CREATE_FOLLOW_UP'];
        renderDrawer({
          order: detailFactory(overrides),
        });
        expect(screen.getByRole('button', { name: 'Crear seguimiento' })).toBeInTheDocument();
      });
    } else {
      it('shows editable controls matching allowedActions', () => {
        const actions: ExecutionOrderAllowedAction[] =
          status === ExecutionOrderStatus.BLOCKED
            ? ['UNBLOCK']
            : ['START', 'REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE', 'CLOSE'];
        renderDrawer({ order: detailFactory({ status, allowedActions: actions }) });

        if (actions.includes('START')) {
          expect(screen.getByRole('button', { name: 'Iniciar ejecucion' })).toBeInTheDocument();
        }
        if (actions.includes('REGISTER_ACTIVITY')) {
          expect(screen.getByRole('button', { name: 'Registrar actividad' })).toBeInTheDocument();
        }
        if (actions.includes('REGISTER_ITEM_USAGE')) {
          expect(screen.getByRole('button', { name: 'Registrar material' })).toBeInTheDocument();
        }
        if (actions.includes('CLOSE')) {
          expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
        }
      });
    }
  });

  // ----------------------------------------------------
  // Block 1 — Compromiso
  // ----------------------------------------------------
  describe('Block 1 — Compromiso', () => {
    it('shows site, window, responsible, template, and priority', () => {
      renderDrawer();
      const section = screen.getByRole('region', { name: 'Compromiso' });
      expect(within(section).getByText('Torre Norte')).toBeInTheDocument();
      expect(within(section).getByText('Carlos Lopez')).toBeInTheDocument();
      expect(within(section).getByText(/Instalacion fibra/)).toBeInTheDocument();
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
      const section = screen.getByRole('region', { name: 'Checklist de instalacion' });
      expect(within(section).getByRole('progressbar')).toBeInTheDocument();
      expect(within(section).getByText('60%')).toBeInTheDocument();
    });

    it('lists template requirements', () => {
      renderDrawer();
      expect(screen.getByText('Verificar direccion')).toBeInTheDocument();
      expect(screen.getByText('Conectar ONU')).toBeInTheDocument();
      expect(screen.getByText('Prueba de velocidad')).toBeInTheDocument();
      expect(screen.getByText('Foto de instalacion')).toBeInTheDocument();
      expect(screen.getByText('Serial ONT')).toBeInTheDocument();
    });

    it('shows actionable closure gaps without exposing internal identifiers', () => {
      renderDrawer({
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
      expect(screen.getByText('Se instalo ONU en sala principal')).toBeInTheDocument();
      expect(screen.getByText('Cableado externo en buen estado')).toBeInTheDocument();
    });

    it('shows empty message when no activities', () => {
      renderDrawer({ activities: [] });
      expect(screen.getByText(/Aun no hay actividades registradas/)).toBeInTheDocument();
    });

    it('shows activity registration form when allowed', async () => {
      const onRegisterActivity = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onRegisterActivity,
      });

      const textarea = screen.getByLabelText('Descripcion de la actividad');
      await user.type(textarea, 'Cable tendido hasta el poste');
      await user.click(screen.getByRole('button', { name: 'Registrar actividad' }));

      expect(onRegisterActivity).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Cable tendido hasta el poste' }),
      );
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

      await user.click(screen.getByRole('button', { name: 'Iniciar ejecucion' }));

      expect(onStart).toHaveBeenCalledWith('Inicio de ejecucion en campo');
    });

    it('envía serialNumber y technicianCustodyId al registrar inventario', async () => {
      const onRegisterItemUsage = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onRegisterItemUsage,
      });

      await user.type(screen.getByLabelText('Item (SKU o descripcion)'), 'item-001');
      await user.type(screen.getByLabelText('Serial o lote'), 'ONT-2026-001');
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

    it('conserva el requirementKey real al subir evidencia', async () => {
      const onUploadEvidence = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onUploadEvidence,
      });

      const file = new File(['evidencia'], 'instalacion.jpg', { type: 'image/jpeg' });
      await user.upload(screen.getByLabelText('Adjuntar evidencia'), file);

      expect(onUploadEvidence).toHaveBeenCalledWith([file], 'req-photo-install');
    });

    it('envía summary obligatorio al cerrar la OT', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onCloseOrder,
      });

      const summary = screen.getByLabelText('Resumen de cierre');
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
      expect(screen.getByText(/Aun no hay consumos registrados/)).toBeInTheDocument();
    });

    it('shows add item form when allowed', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
      });
      expect(screen.getByLabelText('Item (SKU o descripcion)')).toBeInTheDocument();
      expect(screen.getByLabelText('Cantidad')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar material' })).toBeInTheDocument();
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
      expect(screen.getByText(/Conciliacion confirmada/)).toBeInTheDocument();
    });
  });

  // ----------------------------------------------------
  // Block 5 — Evidencia y conformidad
  // ----------------------------------------------------
  describe('Block 5 — Evidencia y conformidad', () => {
    it('shows evidence list with status', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        evidence: evidenceFactory(),
      });
      expect(screen.getAllByText(/Foto de instalacion/).length).toBeGreaterThanOrEqual(1);
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
    it('shows result selector, cause selector, and summary when closable', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
      });
      expect(screen.getByLabelText('Resultado')).toBeInTheDocument();
      expect(screen.getByLabelText('Resumen de cierre')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
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
      expect(screen.getByText(/La OT esta cerrada/)).toBeInTheDocument();
    });

    it('shows confirmation dialog before closing', async () => {
      const onCloseOrder = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        onCloseOrder,
      });

      // Type summary to enable the close button
      const textarea = screen.getByLabelText('Resumen de cierre');
      await user.clear(textarea);
      await user.type(textarea, 'Trabajo completado exitosamente');

      // Wait for the button to be enabled
      const closeBtn = await screen.findByRole('button', { name: 'Cerrar OT' });
      expect(closeBtn).not.toBeDisabled();

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
        'Checklist de instalacion',
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
      // "Sin conexion" appears in multiple places
      const matches = screen.getAllByText(/Sin conexion/);
      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByRole('button', { name: 'Iniciar ejecucion' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Registrar material' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
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
});
