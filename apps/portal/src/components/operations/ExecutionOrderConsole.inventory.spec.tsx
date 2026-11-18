// MOD11 · consola de la orden: densidad y enlaces · W0 · inventario de no regresión (CA-1, AI-SR-QA).
//
// Enumera, por cada momento de la spec vigente 2026-10-05 §4 (pre-inicio, en progreso,
// bloqueada, terminal), los datos, requisitos, acciones y avisos que la consola presenta
// HOY, para que el rediseño (spec 2026-11-18: cabecera compacta, un cuerpo de requisito a la
// vez, Aprovisionamiento dentro del índice) no pierda ninguno. Reglas de robustez:
// - Se afirma presencia en la consola, o accesibilidad a un clic desde el índice de
//   requisitos (`expectReachable`); nunca posición, orden ni número de repeticiones.
// - Se consulta por texto o por rol y nombre accesible; no por clases ni por estructura.
// - Datos ficticios, sin PII. Los mocks de contexto devuelven una referencia estable.
import { render, screen, waitFor, within, type Matcher } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ProvisioningOrderContextDto,
  ServiceProvisioningDto,
} from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { contractSigningApi, networkApi } from '@/lib/api-client';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import { selectRequirementLine } from './execution-order-index.test-helper';
import { installCanvasMocks, installPointerEvent } from './execution-order-canvas.test-helper';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_STATUS_LABELS,
  EXECUTION_ORDER_WORK_TYPE_LABELS,
} from './operations-labels';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: jest.fn(),
}));

// Referencia estable (jest-context-mocks-stable.structure.spec.ts).
const PERMISSIONS = { hasPermission: () => true };

const TECHNICIAN_ACTIONS: ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_ITEM_USAGE',
  'REGISTER_EVIDENCE',
  'BLOCK',
  'CLOSE',
];

const WINDOW = { startAt: '2026-11-11T14:00:00.000Z', endAt: '2026-11-11T16:00:00.000Z' };

const TEMPLATE = {
  id: 'tplv-inv',
  templateId: 'tpl-inv',
  key: 'INSTALACION_INV',
  version: 2,
  label: 'Instalación inventario',
  workType: WfmWorkType.INSTALLATION,
  status: 'PUBLISHED',
  requirements: [
    {
      key: 'CUSTOMER_SIGNATURE',
      label: 'Firma del cliente',
      required: true,
      kind: 'EVIDENCE',
      evidenceType: 'SIGNATURE',
    },
    {
      key: 'installation-activity',
      label: 'Actividad de instalación',
      required: true,
      kind: 'ACTIVITY',
      activityType: 'INSTALLATION',
    },
    {
      key: 'work-photo',
      label: 'Evidencia fotográfica',
      required: true,
      kind: 'EVIDENCE',
      evidenceType: 'PHOTO',
    },
  ],
  reasonCatalogs: [],
} as ExecutionOrderTemplateVersion;

const REQUIREMENT_LABELS = [
  'Firma del cliente',
  'Actividad de instalación',
  'Evidencia fotográfica',
];

function order(
  overrides: Partial<ExecutionOrderDetailResponse> = {},
): ExecutionOrderDetailResponse {
  return {
    id: 'eo-inv',
    number: 'OTE-INV-001',
    version: 1,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: {
      id: 'tpl-inv',
      key: 'INSTALACION_INV',
      version: 2,
      label: 'Instalación inventario',
    },
    schedule: { eventId: 'se-inv', window: WINDOW },
    assignee: { type: 'TECHNICIAN', id: 'tech-inv', displayLabel: 'Técnico ficticio' },
    site: { id: 'site-inv', label: 'Sitio ficticio' },
    completion: {
      progress: 0,
      requirements: TEMPLATE.requirements.map((requirement) => ({
        requirementId: requirement.key,
        label: requirement.label ?? requirement.key,
        kind: requirement.kind,
        satisfied: false,
      })),
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: TECHNICIAN_ACTIONS,
    createdAt: '2026-11-11T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
    ...overrides,
  };
}

function provisioningContext(
  status: ExecutionOrderStatus,
  serviceStatus: ServiceProvisioningDto['status'],
): ProvisioningOrderContextDto {
  return {
    executionOrder: {
      id: 'eo-inv',
      executionOrderNumber: 'OTE-INV-001',
      status,
      workType: WfmWorkType.INSTALLATION,
      assignedTechnician: { id: 'tech-inv', name: 'Técnico ficticio' },
      canCertify: false,
    },
    subscriber: { id: 'sub-inv', displayLabel: 'Titular Ficticio' },
    plan: { downloadMbps: 300, uploadMbps: 150 },
    contracts: [{ id: 'contract-inv', alias: 'Contrato ficticio', status: 'ACTIVE' }],
    cpe: { serialNumber: 'SN-FICTICIO-01', macAddress: null },
    evidences: [],
    provisioning: {
      id: 'service-inv',
      status: serviceStatus,
      origin: 'STANDARD',
      executionOrderId: 'eo-inv',
      executionOrderNumber: 'OTE-INV-001',
      subscriberId: 'sub-inv',
      contractId: 'contract-inv',
      router: { id: 'router-inv', name: 'Router ficticio' },
      network: { id: 'network-inv', name: 'Red ficticia', cidr: '192.0.2.0/24' },
      ip: '192.0.2.10',
      controlMethod: 'SIMPLE_QUEUE_STATIC_IP',
      controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'cola-inv' },
      plan: null,
      cpe: null,
      reservedBy: { id: 'user-inv', name: 'Reservador ficticio' },
      reservedAt: '2026-11-11T13:00:00.000Z',
      certifiedBy: null,
      certifiedAt: null,
      certificationEvidenceId: null,
      regularizedBy: null,
      regularizedAt: null,
      regularizationReason: null,
      activatedAt: null,
      releasedBy: null,
      releasedAt: null,
      releaseReason: null,
      failureReason: null,
      commercialActivation: { status: 'PENDING', detail: null },
      routerInstruction: null,
      version: 1,
      createdAt: '2026-11-11T11:00:00.000Z',
      updatedAt: '2026-11-11T12:00:00.000Z',
    } as unknown as ServiceProvisioningDto,
    suggestedQueueName: 'cola-inv',
  } as unknown as ProvisioningOrderContextDto;
}

type DrawerProps = Parameters<typeof ExecutionOrderDrawer>[0];

function renderConsole(props: Partial<DrawerProps> = {}) {
  return render(
    <ExecutionOrderDrawer
      open
      order={order()}
      activities={[]}
      itemUsage={[]}
      evidence={[]}
      template={TEMPLATE}
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
      itemOptions={[]}
      {...props}
    />,
  );
}

/**
 * Presencia en la consola, o a un clic desde el índice de requisitos.
 * Hoy Aprovisionamiento está siempre montado; tras el rediseño su cuerpo se monta al
 * elegir su fila del índice (spec 2026-11-18 bloque C). Ambas formas cumplen.
 */
async function expectReachable(matcher: Matcher, entry: RegExp = /aprovisionamiento/i) {
  if (screen.queryAllByText(matcher).length > 0) return;
  const index = screen.getByRole('region', { name: 'Requisitos' });
  const control =
    within(index).queryAllByRole('button', { name: entry })[0] ??
    within(index).queryAllByRole('tab', { name: entry })[0] ??
    within(index).queryAllByRole('link', { name: entry })[0];
  expect(control).toBeDefined();
  await userEvent.setup().click(control!);
  expect((await screen.findAllByText(matcher)).length).toBeGreaterThan(0);
}

function expectPresent(matcher: Matcher) {
  expect(screen.getAllByText(matcher).length).toBeGreaterThan(0);
}

function expectSummaryData(status: ExecutionOrderStatus, result?: ExecutionOrderResult) {
  // Los ocho datos del resumen: número, tipo, estado, resultado, sitio, ventana,
  // responsable y plantilla.
  expectPresent('OTE-INV-001');
  expectPresent(EXECUTION_ORDER_WORK_TYPE_LABELS[WfmWorkType.INSTALLATION]!);
  expectPresent(EXECUTION_ORDER_STATUS_LABELS[status]);
  if (result) expectPresent(EXECUTION_ORDER_RESULT_LABELS[result]);
  expectPresent('Sitio ficticio');
  const start = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(WINDOW.startAt));
  expectPresent(
    // El elemento más interno cuyo texto contiene el inicio de la ventana.
    (_, element) =>
      element?.textContent?.includes(start) === true &&
      Array.from(element.children).every((child) => !child.textContent?.includes(start)),
  );
  expectPresent('Técnico ficticio');
  expectPresent(/Instalación inventario/);
}

async function expectProvisioningData() {
  // Datos propios del panel: suscriptor, plan, contrato, equipo, router, red, método, reserva.
  await expectReachable('Titular Ficticio');
  await expectReachable(/300 \/ 150 Mbps/);
  await expectReachable('Contrato ficticio');
  await expectReachable(/SN-FICTICIO-01/);
  await expectReachable(/Router ficticio/);
  await expectReachable(/Red ficticia/);
  await expectReachable('Método');
  await expectReachable('Reservador ficticio');
}

function expectRequirements() {
  const index = screen.getByRole('region', { name: 'Requisitos' });
  for (const label of REQUIREMENT_LABELS) {
    expect(within(index).getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
  }
  // El requisito de aprovisionamiento certificado figura en el índice.
  // Hoy vive junto al índice (lista «Requisito de aprovisionamiento»); tras el rediseño, dentro.
  expect(screen.getAllByText(/Aprovisionamiento certificado/).length).toBeGreaterThan(0);
}

beforeAll(installPointerEvent);
beforeEach(() => {
  jest.restoreAllMocks();
  installCanvasMocks();
  (usePermissions as jest.Mock).mockReturnValue(PERMISSIONS);
  jest
    .spyOn(networkApi, 'getSettings')
    .mockResolvedValue({ enforceProvisioningOnInstallClose: true } as never);
  jest
    .spyOn(networkApi, 'getProvisioningMeta')
    .mockResolvedValue({ reservationsPaused: false } as never);
  jest.spyOn(networkApi, 'listRouters').mockResolvedValue({ data: [], meta: {} } as never);
  jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue({ data: [], meta: {} } as never);
  jest.spyOn(contractSigningApi, 'getLatestGeneration').mockResolvedValue(null);
  jest.spyOn(contractSigningApi, 'getExecutionOrderContract').mockResolvedValue(null);
});

function withProvisioning(status: ExecutionOrderStatus, service: ServiceProvisioningDto['status']) {
  jest
    .spyOn(networkApi, 'getProvisioningContext')
    .mockResolvedValue(provisioningContext(status, service));
}

async function settled() {
  await waitFor(() =>
    expect(screen.queryByText('Cargando aprovisionamiento de la orden')).toBeNull(),
  );
}

describe('CA-1 inventario — pre-inicio (ASSIGNED)', () => {
  it('datos, requisitos en lectura e inicio; sin captura', async () => {
    withProvisioning(ExecutionOrderStatus.ASSIGNED, 'RESERVED');
    renderConsole({
      order: order({ status: ExecutionOrderStatus.ASSIGNED, allowedActions: ['START'] }),
    });
    await settled();

    expectSummaryData(ExecutionOrderStatus.ASSIGNED);
    expectRequirements();
    await expectProvisioningData();
    expect(screen.getByRole('button', { name: 'Iniciar ejecución' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Registrar actividad/ })).toBeNull();
  });
});

describe('CA-1 inventario — en progreso (IN_PROGRESS)', () => {
  it('datos, requisitos, acciones de captura, gate de aprovisionamiento y cierre', async () => {
    withProvisioning(ExecutionOrderStatus.IN_PROGRESS, 'RESERVED');
    renderConsole();
    await settled();

    expectSummaryData(ExecutionOrderStatus.IN_PROGRESS);
    expectRequirements();
    await expectProvisioningData();
    const index = screen.getByRole('region', { name: 'Requisitos' });
    // Índice activo: cada acción de captura vive en el cuerpo de su línea.
    selectRequirementLine('Actividad de instalación');
    expect(within(index).getByRole('button', { name: /^Registrar actividad/ })).toBeInTheDocument();
    selectRequirementLine('Evidencia fotográfica');
    expect(
      within(index).getByRole('button', { name: /^Añadir fotos del trabajo/ }),
    ).toBeInTheDocument();
    selectRequirementLine('Firma del cliente');
    expect(
      within(index).getByRole('button', { name: /^Capturar firma del cliente/ }),
    ).toBeInTheDocument();
    // Gate de cierre: sin certificar, aviso y acceso a revisar aprovisionamiento.
    expectPresent('Aprovisionamiento certificado pendiente');
    expect(
      screen.getAllByRole('button', { name: 'Revisar aprovisionamiento' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Resumen de cierre' })).toBeInTheDocument();
  });

  it('con el servicio certificado el gate no avisa pendiente y el requisito se lee cumplido', async () => {
    withProvisioning(ExecutionOrderStatus.IN_PROGRESS, 'CERTIFIED');
    renderConsole();
    await settled();

    await waitFor(() =>
      expect(
        screen.getAllByLabelText(/Aprovisionamiento certificado: cumplido/).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByText('Aprovisionamiento certificado pendiente')).toBeNull();
  });

  it('avisos: sin conexión, sincronización, error, éxito y requisitos pendientes', async () => {
    withProvisioning(ExecutionOrderStatus.IN_PROGRESS, 'RESERVED');
    renderConsole({
      order: order({ syncState: 'FAILED' }),
      offline: true,
      error: 'Fallo ficticio de la operación',
      successMessage: 'Éxito ficticio de la operación',
      missingRequirements: [
        {
          requirementId: 'work-photo',
          label: 'Evidencia fotográfica',
          kind: 'EVIDENCE',
          reason: 'Falta la foto ficticia',
        },
      ] as never,
    });
    await settled();

    expectPresent('Sin conexión');
    expectPresent('Sincronización');
    expectPresent('Fallo ficticio de la operación');
    expectPresent('Éxito ficticio de la operación');
    const pending = screen.getByRole('alert', { name: 'Requisitos pendientes' });
    expect(within(pending).getByText('Falta la foto ficticia')).toBeInTheDocument();
  });
});

describe('CA-1 inventario — bloqueada (BLOCKED)', () => {
  it('datos, estado sin motivo, requisitos en lectura y sin captura', async () => {
    withProvisioning(ExecutionOrderStatus.BLOCKED, 'RESERVED');
    renderConsole({
      order: order({ status: ExecutionOrderStatus.BLOCKED, allowedActions: [] }),
    });
    await settled();

    expectSummaryData(ExecutionOrderStatus.BLOCKED);
    expectRequirements();
    await expectProvisioningData();
    expectPresent('Orden bloqueada');
    expect(screen.queryByRole('button', { name: /^Registrar actividad/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
  });
});

describe('CA-1 inventario — terminal (COMPLETED)', () => {
  it('datos con resultado, requisitos y expediente en lectura', async () => {
    withProvisioning(ExecutionOrderStatus.COMPLETED, 'CERTIFIED');
    renderConsole({
      order: order({
        status: ExecutionOrderStatus.COMPLETED,
        result: ExecutionOrderResult.EXECUTED,
        allowedActions: [],
      }),
    });
    await settled();

    expectSummaryData(ExecutionOrderStatus.COMPLETED, ExecutionOrderResult.EXECUTED);
    expectRequirements();
    await expectProvisioningData();
    expectPresent('La OT está cerrada y solo puede consultarse.');
    expect(screen.queryByRole('button', { name: 'Cerrar OT' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Capturar firma del cliente/ })).toBeNull();
  });
});
