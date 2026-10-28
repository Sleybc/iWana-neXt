import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccessPermissionKey, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type {
  Ipv4NetworkExtendedDto,
  ProvisioningOrderContextDto,
  ProvisioningInboxRowDto,
  RouterListDto,
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
import { getProvisioningErrorMessage } from './network-provisioning-labels';
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

const executionOrderContext: ProvisioningOrderContextDto = {
  executionOrder: {
    id: 'order-1',
    executionOrderNumber: 'OT-1001',
    status: ExecutionOrderStatus.IN_PROGRESS,
    workType: WfmWorkType.INSTALLATION,
    assignedTechnician: { id: 'tech-1', name: 'Técnica de campo' },
    canCertify: false,
  },
  subscriber: { id: 'subscriber-1', displayLabel: 'Cuenta de prueba' },
  plan: null,
  contracts: [],
  cpe: null,
  evidences: [],
  provisioning: null,
  suggestedQueueName: 'cola-ot-1001',
};

const router: RouterListDto = {
  id: 'router-1',
  name: 'Router Centro',
  managementHost: '192.0.2.1',
  lanInterface: null,
  supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
  organizationSiteId: null,
  commercialNodeId: null,
  status: 'ACTIVE',
  notes: null,
  networkCount: 1,
  interfaceCount: 0,
  legacyLanInterfaceId: null,
  version: 1,
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
};

const ipv4Network: Ipv4NetworkExtendedDto = {
  id: 'network-1',
  routerId: router.id,
  routerName: router.name,
  name: 'Red clientes',
  cidr: '192.0.2.0/24',
  gateway: '192.0.2.1',
  assignableFrom: '192.0.2.2',
  assignableTo: '192.0.2.254',
  excludedIps: [],
  interfaceId: null,
  interface: null,
  reservationAvailability: { available: true, reason: null },
  defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
  status: 'ACTIVE',
  occupancy: { total: 253, reserved: 0, active: 0, free: 253 },
  version: 1,
  createdAt: '2026-10-22T12:00:00.000Z',
  updatedAt: '2026-10-22T12:00:00.000Z',
};

function listPage<T>(data: T[]) {
  return {
    data,
    meta: emptyPageListMeta({ page: 1, total: data.length, totalPages: data.length ? 1 : 0 }, 100),
  };
}

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

  it('deshabilita la regularización cuando el metadato autorizado indica pausa', async () => {
    mockHasPermission.mockReturnValue(true);
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(executionOrderContext);
    jest.spyOn(networkApi, 'getProvisioningMeta').mockResolvedValue({ reservationsPaused: true });
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue(listPage([router]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(listPage([ipv4Network]));
    render(<NetworkProvisioningInboxClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Regularizar' }));
    expect(
      await screen.findByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar regularización' })).toBeDisabled();
  });

  it('usa el 409 de pausa si quien regulariza no tiene permiso para leer el metadato', async () => {
    mockHasPermission.mockImplementation(
      (key) => key === AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    );
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(executionOrderContext);
    const getPauseMetadata = jest
      .spyOn(networkApi, 'getProvisioningMeta')
      .mockResolvedValue({ reservationsPaused: false });
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue(listPage([router]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(listPage([ipv4Network]));
    const regularize = jest
      .spyOn(networkApi, 'regularizeProvisioning')
      .mockRejectedValue(new ApiError(409, 'RESERVATIONS_PAUSED', 'Pausa vigente'));
    render(<NetworkProvisioningInboxClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Regularizar' }));
    const reason = await screen.findByLabelText('Motivo de regularización');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Router' })).toHaveTextContent(router.name),
    );
    fireEvent.change(reason, { target: { value: 'Revisión técnica completada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar regularización' }));

    expect(
      await screen.findByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();
    expect(getPauseMetadata).not.toHaveBeenCalled();
    expect(regularize).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Guardar regularización' })).toBeDisabled();
  });

  it('conserva la pausa autoritativa si falla una consulta de metadatos anterior', async () => {
    mockHasPermission.mockReturnValue(true);
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(executionOrderContext);
    let rejectMetadata: (cause: Error) => void = () => undefined;
    jest.spyOn(networkApi, 'getProvisioningMeta').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectMetadata = reject;
        }),
    );
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue(listPage([router]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(listPage([ipv4Network]));
    jest
      .spyOn(networkApi, 'regularizeProvisioning')
      .mockRejectedValue(new ApiError(409, 'RESERVATIONS_PAUSED', 'Pausa vigente'));
    render(<NetworkProvisioningInboxClient />);

    fireEvent.click(await screen.findByRole('button', { name: 'Regularizar' }));
    const reason = await screen.findByLabelText('Motivo de regularización');
    fireEvent.change(reason, { target: { value: 'Revisión técnica completada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar regularización' }));
    expect(
      await screen.findByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();

    await act(async () => rejectMetadata(new Error('No fue posible leer el estado.')));
    expect(screen.getByRole('button', { name: 'Guardar regularización' })).toBeDisabled();
    expect(
      screen.getByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();
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

  it('deshabilita una reserva nueva cuando el metadato autorizado indica pausa', async () => {
    mockHasPermission.mockReturnValue(true);
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(executionOrderContext);
    jest.spyOn(networkApi, 'getSettings').mockResolvedValue({
      enforceProvisioningOnInstallClose: true,
      updatedAt: '2026-10-22T12:00:00.000Z',
      updatedBy: { id: 'operator-1', name: null },
    });
    jest.spyOn(networkApi, 'getProvisioningMeta').mockResolvedValue({ reservationsPaused: true });
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue(listPage([router]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(listPage([ipv4Network]));
    const reserve = jest.spyOn(networkApi, 'reserveProvisioning');
    render(<ExecutionOrderProvisioningPanel executionOrderId="order-1" />);

    expect(
      await screen.findByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar dirección IP' })).toBeDisabled();
    expect(networkApi.getProvisioningMeta).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
  });

  it('trata el 409 de pausa como estado autoritativo y no muestra éxito', async () => {
    mockHasPermission.mockReturnValue(true);
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(executionOrderContext);
    jest.spyOn(networkApi, 'getSettings').mockResolvedValue({
      enforceProvisioningOnInstallClose: true,
      updatedAt: '2026-10-22T12:00:00.000Z',
      updatedBy: { id: 'operator-1', name: null },
    });
    jest.spyOn(networkApi, 'getProvisioningMeta').mockResolvedValue({ reservationsPaused: false });
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue(listPage([router]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(listPage([ipv4Network]));
    const reserve = jest
      .spyOn(networkApi, 'reserveProvisioning')
      .mockRejectedValue(new ApiError(409, 'RESERVATIONS_PAUSED', 'Pausa vigente'));
    render(<ExecutionOrderProvisioningPanel executionOrderId="order-1" />);

    const reserveButton = await screen.findByRole('button', { name: 'Reservar dirección IP' });
    await waitFor(() => expect(reserveButton).toBeEnabled());
    fireEvent.click(reserveButton);

    expect(
      await screen.findByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();
    expect(reserveButton).toBeDisabled();
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Aprovisionamiento actualizado')).not.toBeInTheDocument();
  });

  it('mantiene disponibles certificación y liberación mientras la pausa bloquea reservas nuevas', async () => {
    mockHasPermission.mockReturnValue(true);
    const reservedContext: ProvisioningOrderContextDto = {
      ...executionOrderContext,
      executionOrder: { ...executionOrderContext.executionOrder, canCertify: true },
      evidences: [
        {
          id: 'evidence-1',
          evidenceType: 'PHOTO',
          requirementKey: null,
          createdAt: '2026-10-22T12:00:00.000Z',
        },
      ],
      provisioning: { ...provisioningService, status: 'RESERVED' },
    };
    jest.spyOn(networkApi, 'getProvisioningContext').mockResolvedValue(reservedContext);
    jest.spyOn(networkApi, 'getSettings').mockResolvedValue({
      enforceProvisioningOnInstallClose: true,
      updatedAt: '2026-10-22T12:00:00.000Z',
      updatedBy: { id: 'operator-1', name: null },
    });
    jest.spyOn(networkApi, 'getProvisioningMeta').mockResolvedValue({ reservationsPaused: true });
    jest.spyOn(networkApi, 'listRouters').mockResolvedValue(listPage([router]));
    jest.spyOn(networkApi, 'listIpv4Networks').mockResolvedValue(listPage([ipv4Network]));
    render(<ExecutionOrderProvisioningPanel executionOrderId="order-1" />);

    expect(await screen.findByRole('button', { name: 'Liberar servicio' })).toBeEnabled();
    fireEvent.click(screen.getByRole('combobox', { name: 'Foto o documento para certificar' }));
    fireEvent.click(await screen.findByRole('option', { name: /Foto ·/ }));
    expect(screen.getByRole('button', { name: 'Certificar aprovisionamiento' })).toBeEnabled();
    expect(
      screen.getByText('Las reservas están pausadas temporalmente. Inténtalo más tarde.'),
    ).toBeInTheDocument();
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

describe('network provisioning errors', () => {
  it('explains an infrastructure conflict without exposing the IP or infrastructure details', () => {
    expect(
      getProvisioningErrorMessage(new ApiError(409, 'IP_PROTECTED_BY_INFRASTRUCTURE', 'conflicto')),
    ).toBe(
      'Esta dirección corresponde a infraestructura registrada y no se puede asignar a un servicio. Elige otra dirección.',
    );
  });

  it('explains the reservation pause and gives a retry path', () => {
    expect(getProvisioningErrorMessage(new ApiError(409, 'RESERVATIONS_PAUSED', 'pausa'))).toBe(
      'Las reservas están pausadas temporalmente. Inténtalo más tarde.',
    );
  });
});
