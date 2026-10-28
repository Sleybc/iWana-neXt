jest.mock('../auth/auth.module', () => ({ AuthModule: class AuthModule {} }));
jest.mock('../access-control/access-control.module', () => ({
  AccessControlModule: class AccessControlModule {},
}));
jest.mock('../organization/organization.module', () => ({
  OrganizationModule: class OrganizationModule {},
}));
jest.mock('../tenant/tenant.module', () => ({
  TenantModule: class TenantModule {},
}));
jest.mock('../audit/audit.module', () => ({ AuditModule: class AuditModule {} }));
jest.mock('../tasks/execution-order-scheduling.module', () => ({
  ExecutionOrderSchedulingModule: class ExecutionOrderSchedulingModule {},
}));
jest.mock('../crm/subscribers/subscriber-service-context-read.module', () => ({
  SubscriberServiceContextReadModule: class SubscriberServiceContextReadModule {},
}));
jest.mock('../inventory/ports/installed-equipment-read.module', () => ({
  InstalledEquipmentReadModule: class InstalledEquipmentReadModule {},
}));

import { NetworkCatalogController } from './network-catalog.controller';
import { NetworkProvisioningController } from './network-provisioning.controller';
import { NetworkModule } from './network.module';
import { NetworkCommercialStatusModule } from './network-commercial-status.module';
import { NetworkProvisioningReadModule } from './network-provisioning-read.module';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('NetworkCatalogController', () => {
  const service = {
    listRouterSiteOptions: jest.fn(),
    getCatalogMeta: jest.fn(),
    listRouters: jest.fn(),
    createRouter: jest.fn(),
    updateRouter: jest.fn(),
    setRouterStatus: jest.fn(),
    listIpv4Networks: jest.fn(),
    createIpv4Network: jest.fn(),
    updateIpv4Network: jest.fn(),
    setIpv4NetworkStatus: jest.fn(),
    listPlanProfiles: jest.fn(),
    putPlanProfile: jest.fn(),
    getNetworkSettings: jest.fn(),
    updateNetworkSettings: jest.fn(),
  };
  const interfaceService = {
    listRouterInterfaces: jest.fn(),
    createRouterInterface: jest.fn(),
    updateRouterInterface: jest.fn(),
    setRouterInterfaceStatus: jest.fn(),
    listInterfaceIpv4Addresses: jest.fn(),
    createInterfaceIpv4Address: jest.fn(),
    updateInterfaceIpv4Address: jest.fn(),
    correctInterfaceIpv4Address: jest.fn(),
  };
  const controller = new NetworkCatalogController(service as never, interfaceService as never);
  const actor = { sub: 'actor-fixture' } as unknown as JwtPayload;
  const version = { version: 3 } as never;

  beforeEach(() => jest.clearAllMocks());

  it('delegates the router catalogue operations with the authenticated actor', () => {
    const query = { page: 1, limit: 20 } as never;
    const createBody = { name: 'Router' } as never;
    const updateBody = { version: 3 } as never;

    controller.listRouters(query, actor);
    controller.createRouter(createBody, actor);
    controller.updateRouter('router-id', updateBody, actor);
    controller.setRouterInactive('router-id', version, actor);
    controller.setRouterActive('router-id', version, actor);

    expect(service.listRouters).toHaveBeenCalledWith(query, actor.sub);
    expect(service.createRouter).toHaveBeenCalledWith(createBody, actor.sub);
    expect(service.updateRouter).toHaveBeenCalledWith('router-id', updateBody, actor.sub);
    expect(service.setRouterStatus).toHaveBeenNthCalledWith(
      1,
      'router-id',
      3,
      'INACTIVE',
      actor.sub,
    );
    expect(service.setRouterStatus).toHaveBeenNthCalledWith(2, 'router-id', 3, 'ACTIVE', actor.sub);
  });

  it('delegates the IPv4 network catalogue operations', () => {
    const query = { page: 2, limit: 10 } as never;
    const createBody = { routerId: 'router-id' } as never;
    const updateBody = { version: 4 } as never;
    const statusBody = { version: 4 } as never;

    controller.listIpv4Networks(query, actor);
    controller.createIpv4Network(createBody, actor);
    controller.updateIpv4Network('network-id', updateBody, actor);
    controller.setIpv4NetworkInactive('network-id', statusBody, actor);
    controller.setIpv4NetworkActive('network-id', statusBody, actor);

    expect(service.listIpv4Networks).toHaveBeenCalledWith(query, actor.sub);
    expect(service.createIpv4Network).toHaveBeenCalledWith(createBody, actor.sub);
    expect(service.updateIpv4Network).toHaveBeenCalledWith('network-id', updateBody, actor.sub);
    expect(service.setIpv4NetworkStatus).toHaveBeenNthCalledWith(
      1,
      'network-id',
      4,
      'INACTIVE',
      actor.sub,
    );
    expect(service.setIpv4NetworkStatus).toHaveBeenNthCalledWith(
      2,
      'network-id',
      4,
      'ACTIVE',
      actor.sub,
    );
  });

  it('delegates plan profile and settings reads and writes', () => {
    const body = { pcqAddressList: 'subscribers' } as never;
    const settings = { enforceProvisioningOnInstallClose: true } as never;

    controller.listPlanProfiles(actor);
    controller.putPlanProfile('plan-id', body, actor);
    controller.getNetworkSettings(actor);
    controller.updateNetworkSettings(settings, actor);

    expect(service.listPlanProfiles).toHaveBeenCalledWith(actor.sub);
    expect(service.putPlanProfile).toHaveBeenCalledWith('plan-id', 'subscribers', actor.sub);
    expect(service.getNetworkSettings).toHaveBeenCalledWith(actor.sub);
    expect(service.updateNetworkSettings).toHaveBeenCalledWith(true, actor.sub);
  });

  it('delega las opciones de sede y los metadatos con el actor autenticado', () => {
    const query = { page: 2, limit: 15 } as never;
    controller.listRouterSiteOptions(query, actor);
    controller.getCatalogMeta(actor);

    expect(service.listRouterSiteOptions).toHaveBeenCalledWith(query, actor.sub);
    expect(service.getCatalogMeta).toHaveBeenCalledWith(actor.sub);
  });
});

describe('NetworkProvisioningController', () => {
  const service = {
    reserve: jest.fn(),
    regularize: jest.fn(),
    certify: jest.fn(),
    release: jest.fn(),
    listInbox: jest.fn(),
    listSubscriberProvisionings: jest.fn(),
    getOrderContext: jest.fn(),
  };
  const controller = new NetworkProvisioningController(service as never);
  const actor = { sub: 'actor-fixture' } as unknown as JwtPayload;

  beforeEach(() => jest.clearAllMocks());

  it('delegates each provisioning route to its matching service operation', () => {
    const reserveBody = { executionOrderId: 'order-id' } as never;
    const regularizeBody = { executionOrderId: 'order-id', reason: 'fixture reason' } as never;
    const certifyBody = { evidenceId: 'evidence-id', version: 1 } as never;
    const releaseBody = { version: 1, reason: 'fixture reason' } as never;
    const inboxQuery = { queue: 'FAILED', page: 1, limit: 10 } as never;

    controller.reserve(reserveBody, actor);
    controller.regularize(regularizeBody, actor);
    controller.certify('service-id', certifyBody, actor);
    controller.release('service-id', releaseBody, actor);
    controller.listInbox(inboxQuery, actor);
    controller.listSubscriberProvisionings('subscriber-id', actor);
    controller.getOrderContext('order-id', actor);

    expect(service.reserve).toHaveBeenCalledWith(reserveBody, actor);
    expect(service.regularize).toHaveBeenCalledWith(regularizeBody, actor);
    expect(service.certify).toHaveBeenCalledWith('service-id', certifyBody, actor);
    expect(service.release).toHaveBeenCalledWith('service-id', releaseBody, actor);
    expect(service.listInbox).toHaveBeenCalledWith(inboxQuery, actor);
    expect(service.listSubscriberProvisionings).toHaveBeenCalledWith('subscriber-id', actor);
    expect(service.getOrderContext).toHaveBeenCalledWith('order-id', actor);
  });
});

describe('Network module providers', () => {
  it('exports the real controllers and registers the network services and adapters', () => {
    expect(NetworkModule).toBeDefined();
    expect(NetworkCommercialStatusModule).toBeDefined();
    expect(NetworkProvisioningReadModule).toBeDefined();
    expect(Reflect.getMetadata('controllers', NetworkModule)).toEqual(
      expect.arrayContaining([NetworkCatalogController, NetworkProvisioningController]),
    );
    expect(Reflect.getMetadata('providers', NetworkCommercialStatusModule)).toEqual(
      expect.arrayContaining([expect.objectContaining({ useExisting: expect.any(Function) })]),
    );
  });
});
