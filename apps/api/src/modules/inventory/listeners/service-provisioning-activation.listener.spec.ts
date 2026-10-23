import { TenantContext, runInTenantSchema } from '@iwana/db';
import { NetworkActivationListenerError } from '../../network/events/network-activation-listener.error';
import { ServiceProvisioningActivatedEvent } from '../../network/events/service-provisioning-activated.event';
import { ServiceProvisioningInventoryActivationListener } from './service-provisioning-activation.listener';

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: jest.fn(),
}));

const runInTenant = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

describe('ServiceProvisioningInventoryActivationListener', () => {
  const context = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    tenantSlug: 'mod13-inventory-test',
    schemaName: 'tenant_mod13_inventory_test',
  };
  const activation = (contractId: string | null, serial: string | null) =>
    new ServiceProvisioningActivatedEvent(
      context.tenantId,
      context.schemaName,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      null,
      contractId,
      '55555555-5555-4555-8555-555555555555',
      serial,
    );

  const query = jest.fn();
  const listener = new ServiceProvisioningInventoryActivationListener({} as never);

  beforeEach(() => {
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue(context);
    runInTenant.mockClear();
    query.mockReset().mockResolvedValue([]);
    runInTenant.mockImplementation(async (_source, _schema, operation) =>
      operation({ query } as never),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['sin contrato', null, 'SERIAL-TEST-001'],
    ['sin serial', '66666666-6666-4666-8666-666666666666', null],
  ])('no consulta inventario si queda %s', async (_label, contractId, serial) => {
    await listener.handle(activation(contractId, serial));

    expect(runInTenant).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('actualiza el activo serializado y el comodato abierto dentro del schema del evento', async () => {
    const event = activation('66666666-6666-4666-8666-666666666666', 'SERIAL-TEST-001');

    await listener.handle(event);

    expect(runInTenant).toHaveBeenCalledWith(
      expect.anything(),
      context.schemaName,
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual([
      event.contractId,
      event.tenantId,
      event.cpeSerialNumber,
      event.subscriberId,
    ]);
    expect(query.mock.calls[1]?.[1]).toEqual(query.mock.calls[0]?.[1]);
  });

  it('rechaza un contexto de tenant distinto antes de consultar inventario', async () => {
    const event = activation('66666666-6666-4666-8666-666666666666', 'SERIAL-TEST-001');
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({
      ...context,
      tenantId: '77777777-7777-4777-8777-777777777777',
    });

    await expect(listener.handle(event)).rejects.toMatchObject({
      code: 'INVENTORY_LISTENER_FAILED',
    });
    expect(runInTenant).not.toHaveBeenCalled();
  });

  it('envuelve errores de persistencia con el código del listener de inventario', async () => {
    runInTenant.mockRejectedValue(new Error('fixture failure'));
    const operation = listener.handle(
      activation('66666666-6666-4666-8666-666666666666', 'SERIAL-TEST-001'),
    );

    await expect(operation).rejects.toBeInstanceOf(NetworkActivationListenerError);
    await expect(operation).rejects.toMatchObject({ code: 'INVENTORY_LISTENER_FAILED' });
  });
});
