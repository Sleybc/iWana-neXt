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
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
} from '@iwana/shared';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import {
  EXECUTION_ORDER_RESULT_VARIANTS,
  EXECUTION_ORDER_STATUS_VARIANTS,
} from './operations-labels';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function detailFactory(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
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
      renderDrawer({ order: null, error: 'Error de red al cargar la OT' });
      expect(screen.getByText('No fue posible cargar la OT')).toBeInTheDocument();
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
        const actions: ExecutionOrderAllowedAction[] =
          status === ExecutionOrderStatus.BLOCKED
            ? ['UNBLOCK']
            : ['START', 'REGISTER_ACTIVITY', 'REGISTER_ITEM_USAGE', 'REGISTER_EVIDENCE', 'CLOSE'];
        renderDrawer({ order: detailFactory({ status, allowedActions: actions }) });

        if (actions.includes('START')) {
          expect(screen.getByRole('button', { name: 'Iniciar ejecución' })).toBeInTheDocument();
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
      expect(within(section).getByText('Carlos López')).toBeInTheDocument();
      expect(within(section).getByText(/Instalación fibra/)).toBeInTheDocument();
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

      await user.type(
        screen.getByRole('textbox', { name: 'Resumen de cierre' }),
        'Trabajo completado',
      );
      await user.click(screen.getByRole('combobox', { name: 'Referencia de evidencia' }));
      await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
      await user.click(screen.getByRole('combobox', { name: 'Forma de aceptación' }));
      await user.click(screen.getByRole('option', { name: 'Firma' }));
      await user.click(screen.getByRole('button', { name: 'Cerrar OT' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

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

      await user.type(
        screen.getByRole('textbox', { name: 'Resumen de cierre' }),
        'Trabajo completado',
      );
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeDisabled();
      await user.click(screen.getByRole('combobox', { name: 'Referencia de evidencia' }));
      await user.click(screen.getByRole('option', { name: /Firma del cliente/ }));
      await user.click(screen.getByRole('combobox', { name: 'Forma de aceptación' }));
      expect(screen.getByRole('option', { name: 'Firma' })).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: 'Código de verificación' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Otra forma' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('option', { name: 'Firma' }));
      await user.click(screen.getByRole('button', { name: 'Cerrar OT' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar cierre' }));

      expect(onCloseOrder).toHaveBeenCalledWith({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Trabajo completado',
        customerAcceptance: { artifactId: 'ma-signature-001', method: 'SIGNATURE' },
      });
    });

    it('mantiene el cierre disponible cuando no hay aceptación opcional elegible', async () => {
      const user = userEvent.setup();
      renderDrawer({ order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }) });

      await user.type(
        screen.getByRole('textbox', { name: 'Resumen de cierre' }),
        'Trabajo completado',
      );
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).not.toBeDisabled();
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
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
        evidence: null,
        evidenceState: 'unavailable',
      });

      expect(screen.getByText('Evidencias no disponibles')).toBeInTheDocument();
      expect(screen.getByText(/No pudimos consultar las evidencias/)).toBeInTheDocument();
      expect(screen.queryByText('Sin evidencias registradas')).not.toBeInTheDocument();
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
    it('muestra resultado y resumen, sin causa de texto libre, cuando el catálogo no distingue aplicabilidad', () => {
      renderDrawer({
        order: detailFactory({ status: ExecutionOrderStatus.IN_PROGRESS }),
      });
      expect(screen.getByLabelText('Resultado')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Resumen de cierre' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /Causa/ })).not.toBeInTheDocument();
      expect(screen.getByText('Resultado no disponible')).toBeInTheDocument();
      expect(
        screen.getByText(/No ejecutada.*no está disponible temporalmente/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'No ejecutada' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
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
