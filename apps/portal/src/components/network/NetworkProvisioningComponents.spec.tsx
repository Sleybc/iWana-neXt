import { render, screen } from '@testing-library/react';
import { AccessPermissionKey } from '@iwana/shared';
import type {
  ProvisioningInboxRowDto,
  ServiceProvisioningDto,
  TechnicianProvisioningViewDto,
} from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { SubscriberTechnicalServiceSection } from '@/components/crm/subscribers/SubscriberTechnicalServiceSection';
import { ExecutionOrderProvisioningPanel } from '@/components/operations/ExecutionOrderProvisioningPanel';
import { NetworkProvisioningInboxClient } from './NetworkProvisioningInboxClient';
import { NetworkSettingsClient } from './NetworkSettingsClient';
import { ApiError, commercialApi, networkApi } from '@/lib/api-client';
import { emptyPageListMeta } from '@/lib/list-meta';
import {
  portalModuleTabTriggerClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';

const mockHasPermission = jest.fn<boolean, [AccessPermissionKey]>();
let mockSearchParams = new URLSearchParams();
const mockRouterReplace = jest.fn();

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/network/provisioning',
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => mockSearchParams,
}));

const provisioningService = {
  id: 'service-1',
  status: 'ACTIVE',
  origin: 'REGULARIZED',
  executionOrderId: 'order-1',
  executionOrderNumber: 'OT-1001',
  subscriberId: 'subscriber-1',
  contractId: null,
  router: { id: 'router-1', name: 'Router Centro' },
  network: { id: 'network-1', name: 'Red clientes', cidr: '192.0.2.0/24' },
  ip: '192.0.2.10',
  controlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'plan-10' },
  plan: null,
  cpe: null,
  reservedBy: null,
  reservedAt: null,
  certifiedBy: null,
  certifiedAt: null,
  certificationEvidenceId: null,
  regularizedBy: { id: 'operator-1', name: null },
  regularizedAt: '2026-10-22T12:00:00.000Z',
  regularizationReason: 'Se completó la revisión técnica.',
  activatedAt: null,
  releasedBy: null,
  releasedAt: null,
  releaseReason: null,
  failureReason: null,
  commercialActivation: { status: 'BLOCKED', detail: 'FISCAL_INCOMPLETE' },
  routerInstruction: null,
  version: 1,
  createdAt: '2026-10-22T11:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
} as ServiceProvisioningDto;

const inboxRow = {
  queue: 'CLOSED_UNPROVISIONED',
  executionOrderId: 'order-1',
  executionOrderNumber: 'OT-1001',
  executionOrderStatus: 'COMPLETED',
  subscriberId: 'subscriber-1',
  subscriberDisplayLabel: 'Cuenta de prueba',
  assignedTechnician: { id: 'tech-1', name: 'Técnica de campo' },
  serviceProvisioningId: null,
  provisioningStatus: null,
  ip: null,
  failureReason: 'CLOSED_WITHOUT_CERTIFICATION',
  closedAt: '2026-10-21T12:00:00.000Z',
  updatedAt: '2026-10-21T12:00:00.000Z',
} as ProvisioningInboxRowDto;

const technicianView = {
  executionOrderId: 'order-1',
  status: 'RESERVED',
  ip: '192.0.2.10',
  certified: false,
  updatedAt: '2026-10-22T12:00:00.000Z',
} as TechnicianProvisioningViewDto;

describe('network provisioning portal surfaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockImplementation(() => true);
    (usePermissions as jest.Mock).mockReturnValue({ hasPermission: mockHasPermission });
    mockSearchParams = new URLSearchParams('queue=CLOSED_UNPROVISIONED');
    jest.spyOn(networkApi, 'listProvisioningInbox').mockResolvedValue({
      data: [inboxRow],
      meta: emptyPageListMeta({ page: 1, total: 1, totalPages: 1 }, 20),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('muestra la acción de regularizar solo con permiso en la lista de órdenes cerradas', async () => {
    mockHasPermission.mockImplementation(
      (key) => key === AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    );
    render(<NetworkProvisioningInboxClient />);

    expect(await screen.findByText('OT-1001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regularizar' })).toBeInTheDocument();
    expect(networkApi.listProvisioningInbox).toHaveBeenCalledWith({
      queue: 'CLOSED_UNPROVISIONED',
      page: 1,
      limit: 20,
    });
  });

  it('oculta regularizar sin permiso y conserva el acceso de lectura a la orden', async () => {
    mockHasPermission.mockReturnValue(false);
    render(<NetworkProvisioningInboxClient />);

    expect(await screen.findByText('OT-1001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regularizar' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir OT/ })).toHaveAttribute(
      'href',
      '/dashboard/operations/execution-orders?executionOrderId=order-1',
    );
  });

  it('usa la receta compartida para las pestañas de la bandeja', async () => {
    render(<NetworkProvisioningInboxClient />);

    const tablist = await screen.findByRole('tablist', { name: 'Listas de aprovisionamiento' });
    const tab = screen.getByRole('tab', { name: 'Cerradas sin aprovisionar' });

    expect(tablist.className).toBe(portalModuleTabsTrackClassName);
    expect(tablist.parentElement?.className).toBe(portalModuleTabsShellClassName);
    for (const className of portalModuleTabTriggerClassName.split(/\s+/u)) {
      expect(tab.classList.contains(className)).toBe(true);
    }
  });

  it('presenta el servicio técnico y la activación comercial sin exponer identificadores internos', async () => {
    jest.spyOn(networkApi, 'listSubscriberProvisioning').mockResolvedValue([provisioningService]);
    render(<SubscriberTechnicalServiceSection subscriberId="subscriber-1" />);

    expect(await screen.findByText('Regularizado')).toBeInTheDocument();
    expect(screen.getByText('Router Centro')).toBeInTheDocument();
    expect(screen.getByText('Nombre no disponible')).toBeInTheDocument();
    expect(screen.getByText('Faltan datos fiscales')).toBeInTheDocument();
    expect(screen.queryByText('operator-1')).not.toBeInTheDocument();
  });

  it('limita la vista técnica de la OT a estado e IP y no muestra controles de ejecución', async () => {
    mockHasPermission.mockImplementation(
      (key) => key === AccessPermissionKey.NETWORK_PROVISIONING_READ,
    );
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(technicianView);
    render(<ExecutionOrderProvisioningPanel executionOrderId="order-1" />);

    expect(await screen.findByText('192.0.2.10')).toBeInTheDocument();
    expect(screen.getByText('Reservado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reservar dirección IP' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dirección de gestión')).not.toBeInTheDocument();
  });

  it('solicita y muestra la proyección técnica con lectura de órdenes, aunque falte lectura de red', async () => {
    mockHasPermission.mockImplementation(
      (key) => key === AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    );
    const getContext = jest
      .spyOn(networkApi, 'getProvisioningContext')
      .mockResolvedValue(technicianView);

    render(<ExecutionOrderProvisioningPanel executionOrderId="order-1" />);

    expect(await screen.findByText('192.0.2.10')).toBeInTheDocument();
    expect(screen.getByText('Reservado')).toBeInTheDocument();
    expect(getContext).toHaveBeenCalledWith('order-1');
    expect(screen.queryByRole('button', { name: 'Reservar dirección IP' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dirección de gestión')).not.toBeInTheDocument();
  });

  it('muestra sin acceso cuando la API deniega el contexto del técnico', async () => {
    mockHasPermission.mockImplementation(
      (key) => key === AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    );
    const getContext = jest
      .spyOn(networkApi, 'getProvisioningContext')
      .mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'denegado'));

    render(<ExecutionOrderProvisioningPanel executionOrderId="order-1" />);

    expect(
      await screen.findByText('No tienes acceso al aprovisionamiento de esta orden.'),
    ).toBeInTheDocument();
    expect(getContext).toHaveBeenCalledWith('order-1');
  });

  it('mantiene los ajustes de red en solo lectura cuando falta el permiso de gestión', async () => {
    mockHasPermission.mockReturnValue(false);
    const plan = { id: 'plan-1', name: 'Fibra 100' };
    jest.spyOn(commercialApi, 'getPlans').mockResolvedValue({
      data: [plan] as Awaited<ReturnType<typeof commercialApi.getPlans>>['data'],
      meta: emptyPageListMeta({ page: 1, total: 1, totalPages: 1 }, 100),
    } as Awaited<ReturnType<typeof commercialApi.getPlans>>);
    jest.spyOn(networkApi, 'listPlanProfiles').mockResolvedValue([]);
    jest.spyOn(networkApi, 'getSettings').mockResolvedValue({
      enforceProvisioningOnInstallClose: true,
      updatedAt: '2026-10-22T12:00:00.000Z',
      updatedBy: { id: 'operator-1', name: null },
    });
    render(<NetworkSettingsClient />);

    expect(await screen.findByText('Fibra 100')).toBeInTheDocument();
    expect(screen.getByText('Activado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lista/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
