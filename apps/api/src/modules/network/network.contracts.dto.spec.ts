import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AssistedCreateIpv4NetworkBodySchema,
  CorrectRouterInterfaceIpv4AddressBodySchema,
  CreateIpv4NetworkBodySchema,
  CreateRouterBodySchema,
  CreateRouterInterfaceBodySchema,
  CreateRouterInterfaceIpv4AddressBodySchema,
  UpdateIpv4NetworkBodySchema,
  UpdateRouterBodySchema,
  UpdateRouterInterfaceBodySchema,
  UpdateRouterInterfaceIpv4AddressBodySchema,
} from '@iwana/shared';
import {
  AssistedCreateIpv4NetworkBodyDto,
  ConvertLegacyLanBodyDto,
  CorrectRouterInterfaceIpv4AddressBodyDto,
  CreateRouterInterfaceBaseBodyDto,
  CreateRouterInterfaceIpv4AddressBodyDto,
  UpdateIpv4NetworkBodyDto,
  UpdateRouterInterfaceBodyDto,
  UpdateRouterInterfaceIpv4AddressBodyDto,
} from './dto/network-interfaces.dto';
import {
  CreateIpv4NetworkDto,
  CreateRouterDto,
  UpdateIpv4NetworkDto,
  UpdateRouterDto,
} from './dto/network-catalog.dto';

function dtoHasNoValidationErrors<Dto extends object>(dto: new () => Dto, value: object): boolean {
  return validateSync(plainToInstance(dto, value)).length === 0;
}

describe('MOD13 Zod and Nest DTO contract parity', () => {
  it('accepts the base and legacy conversion interface bodies in both representations', () => {
    const baseBody = { name: ' WAN ', kind: 'PHYSICAL' };
    const conversionBody = {
      convertLegacyLan: true,
      routerVersion: 2,
      name: 'LAN anterior',
      kind: 'BRIDGE',
      address: { addressWithPrefix: '192.0.2.10/24' },
    };

    expect(CreateRouterInterfaceBodySchema.safeParse(baseBody).success).toBe(true);
    expect(dtoHasNoValidationErrors(CreateRouterInterfaceBaseBodyDto, baseBody)).toBe(true);
    expect(CreateRouterInterfaceBodySchema.safeParse(conversionBody).success).toBe(true);
    expect(dtoHasNoValidationErrors(ConvertLegacyLanBodyDto, conversionBody)).toBe(true);
  });

  it('accepts interface, address, correction, and assisted network bodies through Zod and DTOs', () => {
    const updateInterface = { notes: null, version: 2 };
    const createAddress = { addressWithPrefix: '192.0.2.10/24' };
    const updateAddress = { notes: 'Inventario verificado', version: 1 };
    const correction = {
      newAddress: '192.0.2.11/24',
      version: 1,
      reason: 'ERROR_DE_REGISTRO',
      confirmReleasedHost: true,
    };
    const assistedNetwork = {
      interfaceId: '00000000-0000-4000-8000-000000000001',
      interfaceVersion: 1,
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.240',
      excludedIps: ['192.0.2.20', '192.0.2.20'],
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
      source: { mode: 'MANUAL_CIDR', cidr: '192.0.2.0/24', gateway: '192.0.2.1' },
    };

    expect(UpdateRouterInterfaceBodySchema.safeParse(updateInterface).success).toBe(true);
    expect(dtoHasNoValidationErrors(UpdateRouterInterfaceBodyDto, updateInterface)).toBe(true);
    expect(CreateRouterInterfaceIpv4AddressBodySchema.safeParse(createAddress).success).toBe(true);
    expect(dtoHasNoValidationErrors(CreateRouterInterfaceIpv4AddressBodyDto, createAddress)).toBe(
      true,
    );
    expect(UpdateRouterInterfaceIpv4AddressBodySchema.safeParse(updateAddress).success).toBe(true);
    expect(dtoHasNoValidationErrors(UpdateRouterInterfaceIpv4AddressBodyDto, updateAddress)).toBe(
      true,
    );
    expect(CorrectRouterInterfaceIpv4AddressBodySchema.safeParse(correction).success).toBe(true);
    expect(dtoHasNoValidationErrors(CorrectRouterInterfaceIpv4AddressBodyDto, correction)).toBe(
      true,
    );
    expect(AssistedCreateIpv4NetworkBodySchema.safeParse(assistedNetwork).success).toBe(true);
    expect(dtoHasNoValidationErrors(AssistedCreateIpv4NetworkBodyDto, assistedNetwork)).toBe(true);

    const nullablePatch = { interfaceId: null, version: 3 };
    expect(UpdateIpv4NetworkBodySchema.safeParse(nullablePatch).success).toBe(true);
    expect(dtoHasNoValidationErrors(UpdateIpv4NetworkBodyDto, nullablePatch)).toBe(true);
  });

  it('preserves the legacy router and network request bodies', () => {
    const routerBody = {
      name: 'Router legado',
      managementHost: '192.0.2.1',
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
      lanInterface: 'bridge-clientes',
    };
    const networkBody = {
      routerId: '00000000-0000-4000-8000-000000000001',
      name: 'Red legada',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.240',
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
    };

    expect(CreateRouterBodySchema.safeParse(routerBody).success).toBe(true);
    expect(dtoHasNoValidationErrors(CreateRouterDto, routerBody)).toBe(true);
    expect(CreateIpv4NetworkBodySchema.safeParse(networkBody).success).toBe(true);
    expect(dtoHasNoValidationErrors(CreateIpv4NetworkDto, networkBody)).toBe(true);
  });

  it('keeps Zod and class-validator managementHost acceptance aligned', () => {
    const candidates = [
      '192.0.2.1',
      'router.example.test',
      'router.example.test.',
      'router',
      '999.0.2.1',
      '-router.example.test',
      'router..example.test',
      'router.123',
      `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`,
      `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`,
    ];

    for (const managementHost of candidates) {
      const value = {
        name: 'Router de prueba',
        managementHost,
        supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
      };
      const zodAccepts = CreateRouterBodySchema.safeParse(value).success;
      const dtoAccepts = dtoHasNoValidationErrors(CreateRouterDto, value);
      expect({ managementHost, dtoAccepts, zodAccepts }).toEqual({
        managementHost,
        dtoAccepts: zodAccepts,
        zodAccepts,
      });
    }
  });

  it('matches router and network name schemas to @Matches(/\\S/u) without trimming', () => {
    const routerBase = {
      name: 'Router',
      managementHost: '192.0.2.1',
      supportedControlMethods: ['SIMPLE_QUEUE_STATIC_IP'],
    };
    const networkBase = {
      routerId: '00000000-0000-4000-8000-000000000001',
      name: 'Red',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.240',
      defaultControlMethod: 'SIMPLE_QUEUE_STATIC_IP',
    };

    for (const name of ['   ', '\t \n', 'Router', ' Router ']) {
      const expectedAcceptance = /\S/u.test(name);
      const createRouter = CreateRouterBodySchema.safeParse({ ...routerBase, name });
      const updateRouter = UpdateRouterBodySchema.safeParse({ version: 1, name });
      const createNetwork = CreateIpv4NetworkBodySchema.safeParse({ ...networkBase, name });
      const updateNetwork = UpdateIpv4NetworkBodySchema.safeParse({ version: 1, name });

      expect(createRouter.success).toBe(expectedAcceptance);
      expect(updateRouter.success).toBe(expectedAcceptance);
      expect(createNetwork.success).toBe(expectedAcceptance);
      expect(updateNetwork.success).toBe(expectedAcceptance);
      expect(dtoHasNoValidationErrors(CreateRouterDto, { ...routerBase, name })).toBe(
        expectedAcceptance,
      );
      expect(dtoHasNoValidationErrors(UpdateRouterDto, { version: 1, name })).toBe(
        expectedAcceptance,
      );
      expect(dtoHasNoValidationErrors(CreateIpv4NetworkDto, { ...networkBase, name })).toBe(
        expectedAcceptance,
      );
      expect(dtoHasNoValidationErrors(UpdateIpv4NetworkDto, { version: 1, name })).toBe(
        expectedAcceptance,
      );

      if (expectedAcceptance) {
        expect(createRouter.success && createRouter.data.name).toBe(name);
        expect(createNetwork.success && createNetwork.data.name).toBe(name);
      }
    }
  });
});
