import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessPermissionKey } from '@iwana/shared';
import { EffectivePermissionScopePort } from '../../access-control/ports/effective-permission-scope.port';
import { NetworkAuthorizationFacade } from './network-authorization.facade';

describe('NetworkAuthorizationFacade', () => {
  const port = {
    authorizeTenantWide: jest.fn(),
    evaluateSite: jest.fn(),
    listAuthorizedSiteScope: jest.fn(),
  };
  let facade: NetworkAuthorizationFacade;

  beforeEach(() => {
    jest.clearAllMocks();
    facade = new NetworkAuthorizationFacade(port as unknown as EffectivePermissionScopePort);
  });

  it('maps an out-of-scope site to the same not-found response used for missing resources', async () => {
    port.evaluateSite.mockResolvedValue('OUT_OF_SCOPE');

    await expect(
      facade.requireSiteAction('actor-id', 'site-id', AccessPermissionKey.NETWORK_CATALOG_READ),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'La referencia no está disponible para esta operación.',
      },
    });
  });

  it('returns a bounded forbidden response when the site is visible but the action is absent', async () => {
    port.evaluateSite.mockResolvedValue('IN_SCOPE_NO_ACTION');

    await expect(
      facade.requireSiteAction('actor-id', 'site-id', AccessPermissionKey.NETWORK_CATALOG_MANAGE),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses only the persisted site decision and permits the requested action when allowed', async () => {
    port.evaluateSite.mockResolvedValue('ALLOWED');

    await expect(
      facade.requireSiteAction(
        'actor-id',
        'persisted-site-id',
        AccessPermissionKey.NETWORK_CATALOG_READ,
      ),
    ).resolves.toBeUndefined();

    expect(port.evaluateSite).toHaveBeenCalledWith({
      actorId: 'actor-id',
      siteId: 'persisted-site-id',
      permissionKey: AccessPermissionKey.NETWORK_CATALOG_READ,
    });
  });

  it('requires tenant-wide permission for site-less resources and hides those outside scope', async () => {
    port.authorizeTenantWide.mockResolvedValue(false);

    await expect(
      facade.requireSiteOrTenantWideAction(
        'actor-id',
        null,
        AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(port.authorizeTenantWide).toHaveBeenCalledWith({
      actorId: 'actor-id',
      permissionKey: AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    });
  });

  it('uses tenant-wide authorization for metadata and returns forbidden when absent', async () => {
    port.authorizeTenantWide.mockResolvedValue(false);

    await expect(
      facade.requireTenantWideAction('actor-id', AccessPermissionKey.NETWORK_CATALOG_READ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
