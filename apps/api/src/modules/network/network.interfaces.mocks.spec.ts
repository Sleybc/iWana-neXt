import {
  AssistedCreateIpv4NetworkBodySchema,
  CorrectRouterInterfaceIpv4AddressBodySchema,
  CreateIpv4NetworkBodySchema,
  CreateRouterBodySchema,
  CreateRouterInterfaceBodySchema,
  CreateRouterInterfaceIpv4AddressBodySchema,
  UpdateIpv4NetworkBodySchema,
} from '@iwana/shared';
import {
  mockAssistedCreateIpv4NetworkBody,
  mockCatalogMeta,
  mockConvertedLegacyLanBody,
  mockCorrectRouterInterfaceIpv4AddressBody,
  mockCreateRouterInterfaceBody,
  mockCreateRouterInterfaceIpv4AddressBody,
  mockIpv4Network,
  mockLegacyCreateIpv4NetworkBody,
  mockLegacyCreateRouterBody,
  mockProvisioningMeta,
  mockRouterDetail,
  mockRouterInterface,
  mockRouterInterfaceAddress,
  mockRouterSiteOption,
  mockRouterWithUnresolvedAssociations,
  mockRouterWithoutAssociations,
  mockUpdateIpv4NetworkBody,
} from './network.mocks';

describe('MOD13 typed network contract fixtures', () => {
  it('keeps existing legacy request bodies parseable', () => {
    expect(CreateRouterBodySchema.safeParse(mockLegacyCreateRouterBody()).success).toBe(true);
    expect(CreateIpv4NetworkBodySchema.safeParse(mockLegacyCreateIpv4NetworkBody()).success).toBe(
      true,
    );
  });

  it('provides parseable fixtures for new interface, address, correction, and assisted network bodies', () => {
    expect(CreateRouterInterfaceBodySchema.safeParse(mockCreateRouterInterfaceBody()).success).toBe(
      true,
    );
    expect(CreateRouterInterfaceBodySchema.safeParse(mockConvertedLegacyLanBody()).success).toBe(
      true,
    );
    expect(
      CreateRouterInterfaceIpv4AddressBodySchema.safeParse(
        mockCreateRouterInterfaceIpv4AddressBody(),
      ).success,
    ).toBe(true);
    expect(
      CorrectRouterInterfaceIpv4AddressBodySchema.safeParse(
        mockCorrectRouterInterfaceIpv4AddressBody(),
      ).success,
    ).toBe(true);
    expect(
      AssistedCreateIpv4NetworkBodySchema.safeParse(mockAssistedCreateIpv4NetworkBody()).success,
    ).toBe(true);
    expect(UpdateIpv4NetworkBodySchema.safeParse(mockUpdateIpv4NetworkBody()).success).toBe(true);
  });

  it('covers D10 resolved, inactive, unassociated, and unresolved router summaries with an exact allowlist', () => {
    const router = mockRouterDetail();
    expect(Object.keys(router).sort()).toEqual(
      [
        'commercialNode',
        'commercialNodeId',
        'createdAt',
        'id',
        'interfaceCount',
        'lanInterface',
        'legacyLanInterfaceId',
        'managementHost',
        'name',
        'networkCount',
        'notes',
        'organizationSite',
        'organizationSiteId',
        'status',
        'supportedControlMethods',
        'updatedAt',
        'version',
      ].sort(),
    );
    expect(router.organizationSite).toMatchObject({ isActive: false });
    expect(router.commercialNode).toMatchObject({ isActive: false });

    const unassociated = mockRouterWithoutAssociations();
    expect(unassociated.organizationSiteId).toBeNull();
    expect(unassociated.organizationSite).toBeNull();
    expect(unassociated.commercialNodeId).toBeNull();
    expect(unassociated.commercialNode).toBeNull();

    const unresolved = mockRouterWithUnresolvedAssociations();
    expect(unresolved.organizationSiteId).toBeTruthy();
    expect(unresolved.commercialNodeId).toBeTruthy();
    expect(unresolved.organizationSite).toBeNull();
    expect(unresolved.commercialNode).toBeNull();
  });

  it('covers each reservation availability reason and the available state', () => {
    expect(mockIpv4Network().reservationAvailability).toEqual({
      available: false,
      reason: 'INTERFACE_INACTIVE',
    });
    expect(
      mockIpv4Network({
        reservationAvailability: { available: false, reason: 'ROUTER_INACTIVE' },
      }).reservationAvailability,
    ).toEqual({ available: false, reason: 'ROUTER_INACTIVE' });
    expect(
      mockIpv4Network({
        reservationAvailability: { available: false, reason: 'NETWORK_INACTIVE' },
      }).reservationAvailability,
    ).toEqual({ available: false, reason: 'NETWORK_INACTIVE' });
    expect(
      mockIpv4Network({ reservationAvailability: { available: true, reason: null } })
        .reservationAvailability,
    ).toEqual({ available: true, reason: null });
  });

  it('includes separately typed metadata and the remaining catalog DTO examples', () => {
    expect(mockCatalogMeta()).toEqual({ ipProtection: 'PENDING' });
    expect(mockProvisioningMeta()).toEqual({ reservationsPaused: false });
    expect(mockRouterSiteOption().isActive).toBe(false);
    expect(mockIpv4Network().interface?.status).toBe('INACTIVE');
    expect(mockRouterInterface().status).toBe('ACTIVE');
    expect(mockRouterInterfaceAddress().addressWithPrefix).toBe('192.0.2.10/24');
  });
});
