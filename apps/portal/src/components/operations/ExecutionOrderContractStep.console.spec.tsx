// Cierre de venta · bloque C · el paso «Contrato» dentro de la consola de OT (CA-1).
// Verifica la habilitación por aprovisionamiento y que el acta y el cierre siguen igual.
// Datos ficticios, sin PII.
import { render, screen, within } from '@testing-library/react';
import { ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  ExecutionOrderAllowedAction,
  ExecutionOrderTemplateVersion,
  ProvisioningOrderContextDto,
  ServiceProvisioningDto,
  TechnicianProvisioningViewDto,
} from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { contractSigningApi, networkApi } from '@/lib/api-client';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import { CONTRACT_STEP_COPY } from './execution-order-contract-signing';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: jest.fn(),
}));

const ACTIONS: ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_EVIDENCE',
  'BLOCK',
  'CLOSE',
];

const TEMPLATE = {
  id: 'tplv-c',
  templateId: 'tpl-c',
  key: 'INSTALACION_C',
  version: 1,
  label: 'Instalación C',
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
  ],
  reasonCatalogs: [],
} as ExecutionOrderTemplateVersion;

function order(): ExecutionOrderDetailResponse {
  return {
    id: 'eo-c',
    number: 'OTE-C-001',
    version: 1,
    status: ExecutionOrderStatus.IN_PROGRESS,
    annulled: false,
    workType: WfmWorkType.INSTALLATION,
    template: { id: 'tpl-c', key: 'INSTALACION_C', version: 1, label: 'Instalación C' },
    schedule: {
      eventId: 'se-c',
      window: { startAt: '2026-11-11T14:00:00.000Z', endAt: '2026-11-11T16:00:00.000Z' },
    },
    assignee: { type: 'TECHNICIAN', id: 'tech-c', displayLabel: 'Técnico ficticio' },
    site: { id: 'site-c', label: 'Sitio ficticio' },
    completion: {
      progress: 0,
      requirements: [
        {
          requirementId: 'CUSTOMER_SIGNATURE',
          label: 'Firma del cliente',
          kind: 'EVIDENCE',
          satisfied: false,
        },
      ],
    },
    syncState: 'IN_SYNC',
    inventoryReconciliation: 'NOT_REQUIRED',
    allowedActions: ACTIONS,
    createdAt: '2026-11-11T12:00:00.000Z',
    updatedAt: '2026-11-11T12:00:00.000Z',
  };
}

function context(
  provisioningStatus: ServiceProvisioningDto['status'] | null,
  contractStatus = 'DRAFT',
): ProvisioningOrderContextDto {
  return {
    executionOrder: {
      id: 'eo-c',
      executionOrderNumber: 'OTE-C-001',
      status: ExecutionOrderStatus.IN_PROGRESS,
      workType: WfmWorkType.INSTALLATION,
      assignedTechnician: { id: 'tech-c', name: 'Técnico ficticio' },
      canCertify: false,
    },
    subscriber: { id: 'sub-c', displayLabel: 'Titular Ficticio' },
    plan: null,
    contracts: [{ id: 'contract-c', alias: null, status: contractStatus }],
    cpe: null,
    evidences: [],
    provisioning:
      provisioningStatus === null
        ? null
        : ({
            id: 'service-c',
            status: provisioningStatus,
            origin: 'STANDARD',
            executionOrderId: 'eo-c',
            executionOrderNumber: 'OTE-C-001',
            subscriberId: 'sub-c',
            contractId: 'contract-c',
            router: { id: 'router-c', name: 'Router ficticio' },
            network: { id: 'network-c', name: 'Red ficticia', cidr: '192.0.2.0/24' },
            ip: '192.0.2.10',
            controlMethod: 'SIMPLE_QUEUE_STATIC_IP',
            controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'cola-c' },
            plan: null,
            cpe: null,
            reservedBy: null,
            reservedAt: null,
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
          } as unknown as ServiceProvisioningDto),
    suggestedQueueName: 'cola-c',
  };
}

function renderConsole() {
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
    />,
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
  (usePermissions as jest.Mock).mockReturnValue({ hasPermission: () => true });
  jest
    .spyOn(networkApi, 'getSettings')
    .mockResolvedValue({ enforceProvisioningOnInstallClose: true } as never);
  jest.spyOn(networkApi, 'getProvisioningMeta').mockResolvedValue({
    reservationsPaused: false,
  } as never);
  jest.spyOn(networkApi, 'listRouters').mockResolvedValue({ data: [], meta: {} } as never);
  jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue({ data: [], meta: {} } as never);
  jest.spyOn(contractSigningApi, 'getLatestGeneration').mockResolvedValue(null);
  jest.spyOn(contractSigningApi, 'getExecutionOrderContract').mockResolvedValue(null);
});

describe('consola de OT — paso «Contrato»', () => {
  it('con el servicio certificado y contrato en borrador ofrece generar el contrato', async () => {
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(context('CERTIFIED'));
    renderConsole();

    const step = await screen.findByRole('region', { name: 'Contrato' });
    expect(await within(step).findByRole('button', { name: 'Generar contrato' })).toBeEnabled();
    expect(contractSigningApi.getLatestGeneration).toHaveBeenCalledWith('contract-c', 'eo-c');
    // El acta de conformidad y el cierre siguen en su lugar.
    expect(screen.getByRole('button', { name: /^Capturar firma del cliente/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar OT' })).toBeInTheDocument();
  });

  it('sin aprovisionamiento certificado queda deshabilitado con el motivo visible', async () => {
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(context('RESERVED'));
    renderConsole();

    const step = await screen.findByRole('region', { name: 'Contrato' });
    expect(within(step).getByText(CONTRACT_STEP_COPY.disabledProvisioning)).toBeInTheDocument();
    expect(within(step).queryByRole('button', { name: 'Generar contrato' })).toBeNull();
    expect(contractSigningApi.getLatestGeneration).not.toHaveBeenCalled();
  });

  it('sin contrato en borrador no muestra el paso', async () => {
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(context('ACTIVE', 'ACTIVE'));
    renderConsole();

    await screen.findAllByText('Titular Ficticio');
    expect(screen.queryByRole('region', { name: 'Contrato' })).toBeNull();
  });

  it('vista reducida del técnico sin contrato de la OT: no muestra el paso', async () => {
    (usePermissions as jest.Mock).mockReturnValue({
      hasPermission: (key: string) => key !== 'network.provisioning.read',
    });
    const view: TechnicianProvisioningViewDto = {
      executionOrderId: 'eo-c',
      status: 'CERTIFIED',
      ip: null,
      certified: true,
      updatedAt: '2026-11-11T12:00:00.000Z',
    };
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(view);
    renderConsole();

    await screen.findByRole('button', { name: /^Capturar firma del cliente/ });
    expect(contractSigningApi.getExecutionOrderContract).toHaveBeenCalledWith('eo-c');
    expect(screen.queryByRole('region', { name: 'Contrato' })).toBeNull();
  });

  it('vista reducida del técnico con contrato de la OT: muestra el paso y lo habilita', async () => {
    (usePermissions as jest.Mock).mockReturnValue({
      hasPermission: (key: string) => key !== 'network.provisioning.read',
    });
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue({
      executionOrderId: 'eo-c',
      status: 'CERTIFIED',
      ip: null,
      certified: true,
      updatedAt: '2026-11-11T12:00:00.000Z',
    } satisfies TechnicianProvisioningViewDto);
    jest.spyOn(contractSigningApi, 'getExecutionOrderContract').mockResolvedValue({
      contractId: 'contract-c',
      status: 'DRAFT',
      holder: { fullName: 'Titular Ficticio', documentType: 'CC', documentNumber: '1000000001' },
    });
    renderConsole();

    const step = await screen.findByRole('region', { name: 'Contrato' });
    expect(await within(step).findByRole('button', { name: 'Generar contrato' })).toBeEnabled();
    expect(contractSigningApi.getLatestGeneration).toHaveBeenCalledWith('contract-c', 'eo-c');
  });
});
