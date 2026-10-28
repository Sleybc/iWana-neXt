import type {
  CreateRouterInterfaceConversionResponseDto,
  RouterDetailDto,
  RouterDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
  RouterListDto,
} from '../../index';

type Assert<T extends true> = T;
type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;

type LegacyInterfaceCountRemainsOptional = Assert<IsOptional<RouterDto, 'interfaceCount'>>;
type LegacyInterfaceIdRemainsOptional = Assert<IsOptional<RouterDto, 'legacyLanInterfaceId'>>;
type ListInterfaceCountIsRequired = Assert<IsRequired<RouterListDto, 'interfaceCount'>>;
type ListInterfaceIdIsRequired = Assert<IsRequired<RouterListDto, 'legacyLanInterfaceId'>>;
type DetailExtendsList = Assert<RouterDetailDto extends RouterListDto ? true : false>;
type ConversionContainsTypedProjection = Assert<
  CreateRouterInterfaceConversionResponseDto extends {
    interface: RouterInterfaceDto;
    address: RouterInterfaceIpv4AddressDto | null;
    router: RouterDto;
  }
    ? true
    : false
>;

describe('network router DTO projections', () => {
  it('keeps legacy fields optional and requires them on list and detail projections', () => {
    const typeAssertions: [
      LegacyInterfaceCountRemainsOptional,
      LegacyInterfaceIdRemainsOptional,
      ListInterfaceCountIsRequired,
      ListInterfaceIdIsRequired,
      DetailExtendsList,
    ] = [true, true, true, true, true];

    const legacy: RouterDto = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Router demo',
      managementHost: '192.0.2.10',
      lanInterface: null,
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
      organizationSiteId: null,
      commercialNodeId: null,
      status: 'ACTIVE',
      notes: null,
      networkCount: 0,
      version: 1,
      createdAt: '2026-10-26T12:00:00.000Z',
      updatedAt: '2026-10-26T12:00:00.000Z',
    };
    const listRow: RouterListDto = {
      ...legacy,
      interfaceCount: 0,
      legacyLanInterfaceId: null,
    };
    const detail: RouterDetailDto = {
      ...listRow,
      organizationSite: null,
      commercialNode: null,
    };
    const conversionResponse: CreateRouterInterfaceConversionResponseDto = {
      interface: {
        id: '00000000-0000-4000-8000-000000000002',
        routerId: legacy.id,
        name: 'ether1',
        kind: 'PHYSICAL',
        notes: null,
        status: 'ACTIVE',
        ipv4AddressCount: 0,
        networkCount: 0,
        version: 1,
        createdAt: legacy.createdAt,
        updatedAt: legacy.updatedAt,
      },
      address: null,
      router: legacy,
    };

    const conversionTypeAssertion: ConversionContainsTypedProjection = true;
    expect(typeAssertions).toEqual([true, true, true, true, true]);
    expect(conversionTypeAssertion).toBe(true);
    expect(conversionResponse).toMatchObject({
      interface: { id: '00000000-0000-4000-8000-000000000002', name: 'ether1' },
      address: null,
      router: { id: legacy.id },
    });
    expect(legacy.interfaceCount).toBeUndefined();
    expect(listRow).toMatchObject({ interfaceCount: 0, legacyLanInterfaceId: null });
    expect(detail).toMatchObject({
      interfaceCount: 0,
      legacyLanInterfaceId: null,
      organizationSite: null,
      commercialNode: null,
    });
  });
});
