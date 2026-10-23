import { TenantContext, runInTenantSchema, ServiceProvisioning } from '@iwana/db';
import { ManualRouterProvisioningAdapter } from './adapters/manual-router-provisioning.adapter';
import { ServiceProvisioningCommercialStatusAdapter } from './adapters/service-provisioning-commercial-status.adapter';
import { ServiceProvisioningReadAdapter } from './adapters/service-provisioning-read.adapter';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    ...jest.requireActual('@iwana/db').TenantContext,
    getOrThrow: jest.fn(),
  },
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
const context = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  tenantSlug: 'mod13-adapters-test',
  schemaName: 'tenant_mod13_adapters_test',
};

describe('Network service-provisioning adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
  });

  afterEach(() => jest.restoreAllMocks());

  it('proyecta el estado por defecto del gate cuando faltan configuración y servicio', async () => {
    const manager = { findOne: jest.fn().mockResolvedValue(null) };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const adapter = new ServiceProvisioningReadAdapter({} as never);

    await expect(adapter.getGateStatus('order-fixture')).resolves.toEqual({
      enforced: false,
      status: null,
    });
    expect(manager.findOne).toHaveBeenCalledTimes(2);
  });

  it('lee la guarda y el estado de aprovisionamiento existentes', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ enforceProvisioningOnInstallClose: true })
        .mockResolvedValueOnce({ status: 'CERTIFIED' }),
    };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const adapter = new ServiceProvisioningReadAdapter({} as never);

    await expect(adapter.getGateStatus('order-fixture')).resolves.toEqual({
      enforced: true,
      status: 'CERTIFIED',
    });
    expect(manager.findOne).toHaveBeenNthCalledWith(
      2,
      ServiceProvisioning,
      expect.objectContaining({
        where: { tenantId: context.tenantId, executionOrderId: 'order-fixture' },
      }),
    );
  });

  it('omite la auditoría si el estado comercial ya coincide', async () => {
    const service = {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: context.tenantId,
      commercialActivationStatus: 'DONE',
      commercialActivationDetail: null,
      version: 4,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(service),
      save: jest.fn(),
    };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const auditService = { logWithin: jest.fn() };
    const adapter = new ServiceProvisioningCommercialStatusAdapter(
      {} as never,
      auditService as never,
    );

    await adapter.record(service.id, 'DONE', null);

    expect(manager.save).not.toHaveBeenCalled();
    expect(auditService.logWithin).not.toHaveBeenCalled();
  });

  it('actualiza y audita el estado comercial, y falla si el servicio no existe', async () => {
    const service = {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: context.tenantId,
      commercialActivationStatus: 'PENDING',
      commercialActivationDetail: null,
      version: 1,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(service).mockResolvedValueOnce(null),
      save: jest.fn().mockImplementation(async (_entity, value) => value),
    };
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ manager } as never),
    );
    const auditService = { logWithin: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ServiceProvisioningCommercialStatusAdapter(
      {} as never,
      auditService as never,
    );

    await adapter.record(service.id, 'BLOCKED', 'CONTACT_REQUIRED');
    expect(service).toMatchObject({
      commercialActivationStatus: 'BLOCKED',
      commercialActivationDetail: 'CONTACT_REQUIRED',
      version: 2,
    });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: { action: 'COMMERCIAL_STATUS', status: 'BLOCKED', detail: 'CONTACT_REQUIRED' },
      }),
      manager,
    );
    await expect(adapter.record(service.id, 'DONE', null)).rejects.toThrow(
      'No se encontró el aprovisionamiento activado.',
    );
  });
});

describe('ManualRouterProvisioningAdapter', () => {
  const adapter = new ManualRouterProvisioningAdapter();
  const base = { routerId: 'router-fixture', ip: '192.0.2.10' };

  it('genera los pasos de aplicación para PCQ y para una cola con velocidades', async () => {
    await expect(
      adapter.apply({
        ...base,
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'customers' },
      }),
    ).resolves.toEqual({
      mode: 'MANUAL',
      steps: ['/ip firewall address-list add list=customers address=192.0.2.10'],
    });
    await expect(
      adapter.apply({
        ...base,
        controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'subscriber-1' },
        downloadMbps: 300,
        uploadMbps: 100,
      }),
    ).resolves.toEqual({
      mode: 'MANUAL',
      steps: ['/queue simple add name=subscriber-1 target=192.0.2.10/32 max-limit=100M/300M'],
    });
  });

  it('usa instrucción genérica de cola si falta una velocidad', async () => {
    await expect(
      adapter.apply({
        ...base,
        controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP', queueName: 'subscriber-1' },
        downloadMbps: 300,
      }),
    ).resolves.toMatchObject({
      steps: ['Configurar la cola subscriber-1 para 192.0.2.10/32 con los límites del plan.'],
    });
  });

  it('genera instrucciones de retiro, suspensión y sincronización no soportada', async () => {
    const queue = {
      ...base,
      controlParams: { method: 'SIMPLE_QUEUE_STATIC_IP' as const, queueName: 'subscriber-1' },
    };
    await expect(adapter.remove(queue)).resolves.toMatchObject({
      steps: ['/queue simple remove [find name=subscriber-1 target=192.0.2.10/32]'],
    });
    await expect(adapter.suspend(queue)).resolves.toEqual(await adapter.remove(queue));
    await expect(
      adapter.remove({
        ...base,
        controlParams: { method: 'PCQ_ADDRESS_LIST', addressList: 'customers' },
      }),
    ).resolves.toMatchObject({
      steps: ['/ip firewall address-list remove [find list=customers address=192.0.2.10]'],
    });
    await expect(adapter.sync('router-fixture')).resolves.toEqual({ supported: false });
  });
});
