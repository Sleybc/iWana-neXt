import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface OpenApiSchema {
  $ref?: string;
  type?: string;
  format?: string;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  default?: number;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  uniqueItems?: boolean;
  additionalProperties?: boolean;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  not?: OpenApiSchema;
}

interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: OpenApiSchema }>;
  'x-error-codes'?: string[];
  'x-error-conditions'?: Record<string, string>;
}

interface OpenApiParameter {
  name: string;
  in: string;
  schema?: OpenApiSchema;
}

interface PermissionRequirements {
  allOf?: string[];
  anyOf?: string[];
}

interface RoleRequirements {
  anyOf: string[];
}

interface ConditionalPermissionRequirement {
  when: string;
  allOf: string[];
  reason: string;
}

interface PermissionCondition {
  permission: string;
  when: string;
  projection: string;
}

interface OpenApiOperation {
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  };
  responses?: Record<string, OpenApiResponse>;
  'x-required-permissions'?: PermissionRequirements;
  'x-required-roles'?: RoleRequirements;
  'x-conditional-permissions'?: ConditionalPermissionRequirement[];
  'x-permission-conditions'?: PermissionCondition[];
  'x-no-content-responses'?: string[];
}

interface OpenApiPathItem extends Partial<Record<Method, OpenApiOperation>> {}

interface OpenApiDocument {
  info: { title: string; description: string; version: string };
  paths: Record<string, OpenApiPathItem>;
  components: { schemas: Record<string, OpenApiSchema> };
  'x-contract-kind'?: string;
  'x-contract-status'?: string;
  'x-runtime-parity-status'?: string;
  'x-contract-source'?: string;
}

const contractPath = resolve(__dirname, '../../../openapi/network-catalog.contract.v1.json');
const runtimePath = resolve(__dirname, '../../../openapi/network-catalog.v1.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as OpenApiDocument;
const runtime = JSON.parse(readFileSync(runtimePath, 'utf8')) as OpenApiDocument;
const methods: Method[] = ['get', 'post', 'patch', 'put', 'delete'];

function operation(path: string, method: Method): OpenApiOperation {
  const result = contract.paths[path]?.[method];
  if (!result) throw new Error(`Falta la operación target ${method.toUpperCase()} ${path}`);
  return result;
}

function responseSchema(path: string, method: Method, status: string): OpenApiSchema | undefined {
  return operation(path, method).responses?.[status]?.content?.['application/json']?.schema;
}

function bodySchema(path: string, method: Method): OpenApiSchema | undefined {
  return operation(path, method).requestBody?.content?.['application/json']?.schema;
}

function resolveSchema(
  schema: OpenApiSchema | undefined,
  visited = new Set<string>(),
): OpenApiSchema {
  if (!schema) return {};
  if (schema.$ref) {
    const name = schema.$ref.split('/').at(-1);
    if (!name || visited.has(name)) return {};
    const nextVisited = new Set(visited);
    nextVisited.add(name);
    return resolveSchema(contract.components.schemas[name], nextVisited);
  }

  const properties = { ...(schema.properties ?? {}) };
  const required = [...(schema.required ?? [])];
  for (const child of schema.allOf ?? []) {
    const resolved = resolveSchema(child, visited);
    Object.assign(properties, resolved.properties ?? {});
    required.push(...(resolved.required ?? []));
  }
  return {
    ...schema,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(required.length > 0 ? { required: [...new Set(required)] } : {}),
  };
}

function errorCodes(path: string, method: Method, status: string): string[] | undefined {
  return operation(path, method).responses?.[status]?.['x-error-codes'];
}

function errorCodeEnums(response: OpenApiResponse): string[][] {
  const found: string[][] = [];
  const visit = (schema: OpenApiSchema | undefined): void => {
    if (!schema) return;
    const codeEnum = schema.properties?.code?.enum;
    if (codeEnum) found.push(codeEnum.map(String));
    for (const child of [
      ...(schema.allOf ?? []),
      ...(schema.oneOf ?? []),
      ...(schema.anyOf ?? []),
    ]) {
      visit(child);
    }
  };
  visit(response.content?.['application/json']?.schema);
  return found;
}

function operations(document: OpenApiDocument): Array<{ path: string; method: Method }> {
  const found: Array<{ path: string; method: Method }> = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of methods) {
      if (pathItem[method]) found.push({ path, method });
    }
  }
  return found;
}

describe('MOD13 target OpenAPI contract', () => {
  it('distinguishes the target contract from the active runtime snapshot', () => {
    expect(contract.info.version).toBe('1.16');
    expect(contract['x-contract-kind']).toBe('TARGET');
    expect(contract['x-contract-status']).toBe('FROZEN_BY_G4_RESYNC');
    expect(contract['x-runtime-parity-status']).toBe('VERIFIED_O2_M_RUNTIME_PARITY');
    expect(contract['x-contract-source']).toBe(
      'docs/specs/2026-10-26-mod13-interfaces-api.md v1.16 + re-sync runtime G4 v1.16',
    );
    expect(contract.info.description).toContain('congelado por G4');
    expect(contract.info.description).toContain('order-context carece de @Roles');
    expect(contract.info.description).not.toContain('Cada operación declara roles permitidos');
    expect(operations(contract)).toHaveLength(35);
  });

  it('models Nest and coded validation bodies without changing runtime behavior', () => {
    const nestBadRequest = contract.components.schemas.NestBadRequestDto;
    expect(nestBadRequest?.required).toEqual(['statusCode', 'message', 'error']);
    expect(nestBadRequest?.properties?.statusCode).toMatchObject({ type: 'number', enum: [400] });
    expect(nestBadRequest?.properties?.error).toMatchObject({ enum: ['Bad Request'] });

    const zodAndUuid = operation('/network/provisioning/{id}/certify', 'post').responses?.['400'];
    expect(zodAndUuid?.['x-error-codes']).toEqual(['VALIDATION_ERROR']);
    expect(zodAndUuid?.content?.['application/json']?.schema?.oneOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ $ref: '#/components/schemas/NestBadRequestDto' }),
      ]),
    );
    expect(
      operation('/network/provisioning/orders/{executionOrderId}/context', 'get').responses?.['400']
        ?.content?.['application/json']?.schema?.$ref,
    ).toBe('#/components/schemas/NestBadRequestDto');
  });

  it('documents a uniform 404 for an order context that is missing or outside scope', () => {
    const response = operation('/network/provisioning/orders/{executionOrderId}/context', 'get')
      .responses?.['404'];

    expect(response?.description).toBe('La orden no existe o no está disponible para este ámbito.');
    expect(response?.['x-error-codes']).toEqual(['RESOURCE_NOT_FOUND']);
    expect(response?.content?.['application/json']?.schema?.allOf?.[1]).toMatchObject({
      properties: { code: { enum: ['RESOURCE_NOT_FOUND'] } },
    });
  });

  it('links all 22 mutating operations to their expected request body schemas', () => {
    const expectedBodies: Array<{ path: string; method: Method; schema: string }> = [
      { path: '/network/routers', method: 'post', schema: 'CreateRouterBody' },
      { path: '/network/routers/{id}', method: 'patch', schema: 'UpdateRouterBody' },
      { path: '/network/routers/{id}/deactivate', method: 'post', schema: 'RouterStatusDto' },
      { path: '/network/routers/{id}/activate', method: 'post', schema: 'RouterStatusDto' },
      { path: '/network/ipv4-networks', method: 'post', schema: 'CreateIpv4NetworkBody' },
      { path: '/network/ipv4-networks/{id}', method: 'patch', schema: 'UpdateIpv4NetworkBody' },
      {
        path: '/network/ipv4-networks/{id}/deactivate',
        method: 'post',
        schema: 'RouterStatusDto',
      },
      {
        path: '/network/ipv4-networks/{id}/activate',
        method: 'post',
        schema: 'RouterStatusDto',
      },
      { path: '/network/plan-profiles/{planId}', method: 'put', schema: 'PutPlanProfileDto' },
      { path: '/network/settings', method: 'patch', schema: 'PatchNetworkSettingsDto' },
      {
        path: '/network/provisioning/reserve',
        method: 'post',
        schema: 'ReserveProvisioningBody',
      },
      {
        path: '/network/provisioning/regularize',
        method: 'post',
        schema: 'RegularizeProvisioningBody',
      },
      {
        path: '/network/provisioning/{id}/certify',
        method: 'post',
        schema: 'CertifyProvisioningBody',
      },
      {
        path: '/network/provisioning/{id}/release',
        method: 'post',
        schema: 'ReleaseProvisioningBody',
      },
      {
        path: '/network/routers/{id}/interfaces',
        method: 'post',
        schema: 'CreateRouterInterfaceBody',
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}',
        method: 'patch',
        schema: 'UpdateRouterInterfaceBody',
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/activate',
        method: 'post',
        schema: 'RouterStatusDto',
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/deactivate',
        method: 'post',
        schema: 'RouterStatusDto',
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses',
        method: 'post',
        schema: 'CreateRouterInterfaceIpv4AddressBody',
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}',
        method: 'patch',
        schema: 'UpdateRouterInterfaceIpv4AddressBody',
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}/correct',
        method: 'post',
        schema: 'CorrectRouterInterfaceIpv4AddressBody',
      },
      {
        path: '/network/routers/{id}/ipv4-networks',
        method: 'post',
        schema: 'AssistedCreateIpv4NetworkBody',
      },
    ];
    const expectedKeys = expectedBodies.map(({ path, method }) => `${method} ${path}`).sort();
    const mutatingKeys = operations(contract)
      .filter(({ method }) => method !== 'get')
      .map(({ path, method }) => `${method} ${path}`)
      .sort();

    expect(expectedBodies).toHaveLength(22);
    expect(mutatingKeys).toEqual(expectedKeys);
    for (const item of expectedBodies) {
      const body = operation(item.path, item.method).requestBody;
      expect(body?.required).toBe(true);
      expect(body).toMatchObject({
        required: true,
        content: {
          'application/json': { schema: { $ref: `#/components/schemas/${item.schema}` } },
        },
      });
    }
    for (const item of operations(contract).filter(({ method }) => method === 'get')) {
      expect(operation(item.path, item.method).requestBody).toBeUndefined();
    }
  });

  it('keeps all network body variants strict and documents Zod discriminators and relationships', () => {
    const strictBodySchemas = [
      'CreateRouterBody',
      'UpdateRouterBody',
      'RouterStatusDto',
      'CreateIpv4NetworkBody',
      'UpdateIpv4NetworkBody',
      'PutPlanProfileDto',
      'PatchNetworkSettingsDto',
      'ReserveProvisioningBody',
      'RegularizeProvisioningBody',
      'CertifyProvisioningBody',
      'ReleaseProvisioningBody',
      'CreateRouterInterfaceBaseBody',
      'ConvertLegacyLanBody',
      'ConvertLegacyLanAddressBody',
      'UpdateRouterInterfaceBody',
      'CreateRouterInterfaceIpv4AddressBody',
      'UpdateRouterInterfaceIpv4AddressBody',
      'CorrectRouterInterfaceIpv4AddressBody',
      'AssistedCreateIpv4NetworkBody',
      'ManualCidrSource',
      'IpPrefixSource',
      'InterfaceAddressSource',
    ];

    for (const schemaName of strictBodySchemas) {
      expect(contract.components.schemas[schemaName]?.additionalProperties).toBe(false);
    }
    expect(contract.components.schemas.CreateRouterBody?.properties?.name?.pattern).toBe('\\S');
    expect(
      contract.components.schemas.CreateRouterBody?.properties?.supportedControlMethods
        ?.uniqueItems,
    ).toBe(true);
    expect(
      contract.components.schemas.UpdateRouterBody?.properties?.supportedControlMethods,
    ).toMatchObject({ uniqueItems: true });
    expect(contract.components.schemas.RouterStatusDto?.properties?.version?.type).toBe('integer');

    const updateAssociation = contract.components.schemas.UpdateIpv4NetworkBody?.allOf?.find(
      (schema) => schema.oneOf,
    )?.oneOf;
    expect(updateAssociation).toHaveLength(3);
    expect(updateAssociation?.[1]).toMatchObject({
      required: ['interfaceId'],
      not: { required: ['interfaceVersion'] },
    });
    expect(updateAssociation?.[2]).toMatchObject({
      required: ['interfaceId', 'interfaceVersion'],
      properties: {
        interfaceVersion: { type: 'integer', minimum: 1 },
      },
    });

    const assisted = contract.components.schemas.AssistedCreateIpv4NetworkBody;
    const assistedRelationships = assisted?.allOf?.flatMap((schema) => schema.oneOf ?? []) ?? [];
    expect(assistedRelationships).toHaveLength(5);
    expect(assistedRelationships[4]).toMatchObject({
      required: ['source', 'interfaceId'],
      properties: {
        source: { required: ['mode'], properties: { mode: { enum: ['INTERFACE_ADDRESS'] } } },
        interfaceId: { type: 'string', format: 'uuid' },
      },
    });

    const interfaceCreate = bodySchema('/network/routers/{id}/interfaces', 'post');
    expect(interfaceCreate?.$ref).toBe('#/components/schemas/CreateRouterInterfaceBody');
    const convertBody = contract.components.schemas.ConvertLegacyLanBody;
    expect(convertBody?.properties?.convertLegacyLan).toMatchObject({
      type: 'boolean',
      enum: [true],
    });
    expect(convertBody?.required).toContain('routerVersion');
    const conversionAddress = resolveSchema(convertBody?.properties?.address);
    expect(conversionAddress.additionalProperties).toBe(false);
    expect(conversionAddress.required).toContain('addressWithPrefix');
  });

  it('uses nullable strings and integer, required response fields across router, network, interface, and address projections', () => {
    const router = resolveSchema(contract.components.schemas.RouterResponseDto);
    expect(router.properties?.lanInterface).toMatchObject({ type: 'string', nullable: true });
    expect(router.properties?.notes).toMatchObject({ type: 'string', nullable: true });
    expect(router.properties?.networkCount?.type).toBe('integer');
    expect(router.properties?.interfaceCount?.type).toBe('integer');
    expect(router.properties?.version?.type).toBe('integer');
    expect(router.required).toEqual(
      expect.arrayContaining(['lanInterface', 'notes', 'networkCount', 'version']),
    );

    const detail = resolveSchema(contract.components.schemas.RouterDetailDto);
    expect(detail.properties?.networkCount?.type).toBe('integer');
    expect(detail.properties?.interfaceCount?.type).toBe('integer');
    expect(detail.properties?.organizationSite?.nullable).toBe(true);
    expect(detail.properties?.commercialNode?.nullable).toBe(true);
    expect(detail.required).toEqual(
      expect.arrayContaining([
        'interfaceCount',
        'legacyLanInterfaceId',
        'organizationSite',
        'commercialNode',
      ]),
    );
    const routerList = resolveSchema(contract.components.schemas.RouterListDto);
    expect(routerList.properties?.interfaceCount?.type).toBe('integer');
    expect(routerList.properties?.legacyLanInterfaceId).toMatchObject({
      type: 'string',
      format: 'uuid',
      nullable: true,
    });
    expect(routerList.required).toEqual(
      expect.arrayContaining(['interfaceCount', 'legacyLanInterfaceId']),
    );

    const network = resolveSchema(contract.components.schemas.Ipv4NetworkExtendedDto);
    expect(network.properties?.version?.type).toBe('integer');
    expect(network.properties?.occupancy?.$ref).toBe(
      '#/components/schemas/NetworkOccupancyResponseDto',
    );
    const occupancy = resolveSchema(contract.components.schemas.NetworkOccupancyResponseDto);
    for (const key of ['total', 'reserved', 'active', 'free']) {
      expect(occupancy.properties?.[key]?.type).toBe('integer');
      expect(occupancy.required).toContain(key);
    }

    for (const schemaName of ['RouterInterfaceDto', 'RouterInterfaceIpv4AddressDto']) {
      const projection = resolveSchema(contract.components.schemas[schemaName]);
      expect(projection.properties?.version?.type).toBe('integer');
      expect(projection.required).toContain('version');
    }
    const correction = resolveSchema(
      contract.components.schemas.CorrectRouterInterfaceIpv4AddressResponseDto,
    );
    expect(correction.properties?.address?.$ref).toBe(
      '#/components/schemas/RouterInterfaceIpv4AddressDto',
    );
    expect(correction.required).toEqual(expect.arrayContaining(['address', 'releasedHost']));
  });

  it('models both runtime 401 shapes on every bearer-protected operation', () => {
    const protectedOperations = operations(contract).filter(({ path, method }) =>
      operation(path, method).security?.some((requirement) => 'access-token' in requirement),
    );
    const schema = contract.components.schemas.UnauthorizedResponseDto;

    expect(protectedOperations).toHaveLength(35);
    expect(schema?.type).toBe('object');
    expect(schema?.required).toEqual(['message']);
    expect(schema?.properties?.message?.type).toBe('string');
    expect(schema?.properties?.statusCode).toMatchObject({ type: 'number', enum: [401] });
    expect(schema?.properties?.error).toMatchObject({ type: 'string', enum: ['Unauthorized'] });
    expect(schema?.properties?.code).toBeUndefined();
    for (const { path, method } of protectedOperations) {
      expect(responseSchema(path, method, '401')?.$ref).toBe(
        '#/components/schemas/UnauthorizedResponseDto',
      );
    }
  });

  it('declares bearer auth and the approved permission requirement on every target operation', () => {
    const expected: Array<{
      path: string;
      method: Method;
      permission: PermissionRequirements;
    }> = [
      { path: '/network/routers', method: 'get', permission: { allOf: ['network.catalog.read'] } },
      {
        path: '/network/routers',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}',
        method: 'get',
        permission: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/routers/{id}',
        method: 'patch',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/activate',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/deactivate',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks',
        method: 'get',
        permission: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/ipv4-networks',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks/{id}',
        method: 'patch',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks/{id}/activate',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks/{id}/deactivate',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/catalog-meta',
        method: 'get',
        permission: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/provisioning/meta',
        method: 'get',
        permission: { allOf: ['network.provisioning.read'] },
      },
      {
        path: '/network/router-site-options',
        method: 'get',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces',
        method: 'get',
        permission: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/routers/{id}/interfaces',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}',
        method: 'patch',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/activate',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/deactivate',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses',
        method: 'get',
        permission: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}',
        method: 'patch',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}/correct',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/ipv4-networks',
        method: 'post',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/plan-profiles',
        method: 'get',
        permission: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/plan-profiles/{planId}',
        method: 'put',
        permission: { allOf: ['network.catalog.manage'] },
      },
      { path: '/network/settings', method: 'get', permission: { allOf: ['network.catalog.read'] } },
      {
        path: '/network/settings',
        method: 'patch',
        permission: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/provisioning/reserve',
        method: 'post',
        permission: { allOf: ['network.provisioning.execute'] },
      },
      {
        path: '/network/provisioning/regularize',
        method: 'post',
        permission: { allOf: ['network.provisioning.regularize'] },
      },
      {
        path: '/network/provisioning/{id}/certify',
        method: 'post',
        permission: { allOf: ['network.provisioning.certify'] },
      },
      {
        path: '/network/provisioning/{id}/release',
        method: 'post',
        permission: { allOf: ['network.provisioning.execute'] },
      },
      {
        path: '/network/provisioning/inbox',
        method: 'get',
        permission: { allOf: ['network.provisioning.read'] },
      },
      {
        path: '/network/provisioning/subscribers/{subscriberId}',
        method: 'get',
        permission: { allOf: ['network.provisioning.read'] },
      },
      {
        path: '/network/provisioning/orders/{executionOrderId}/context',
        method: 'get',
        permission: {
          anyOf: ['network.provisioning.read', 'operations.execution_orders.read'],
        },
      },
    ];

    expect(expected).toHaveLength(35);
    for (const item of expected) {
      const current = operation(item.path, item.method);
      expect(current.security).toEqual([{ 'access-token': [] }]);
      expect(current['x-required-permissions']).toEqual(item.permission);
      if (item.path === '/network/provisioning/orders/{executionOrderId}/context') {
        expect(current['x-required-roles']).toBeUndefined();
        expect(current['x-permission-conditions']).toEqual([
          {
            permission: 'operations.execution_orders.read',
            when: 'actor is assigned to the execution order',
            projection: 'TechnicianProvisioningViewDto',
          },
        ]);
      } else {
        expect(current['x-required-roles']).toEqual({ anyOf: ['ADMIN', 'NOC'] });
      }
      expect(current.responses).toBeDefined();
      expect(current.operationId).toBeTruthy();
    }
    expect(
      new Set(operations(contract).map(({ path, method }) => operation(path, method).operationId))
        .size,
    ).toBe(35);
  });

  it('binds the extended projections, filters, and Zod body shapes to their target routes', () => {
    expect(responseSchema('/network/routers', 'get', '200')?.properties?.data?.items?.$ref).toBe(
      '#/components/schemas/RouterListDto',
    );
    expect(responseSchema('/network/routers/{id}', 'get', '200')?.$ref).toBe(
      '#/components/schemas/RouterDetailDto',
    );
    expect(
      responseSchema('/network/ipv4-networks', 'get', '200')?.properties?.data?.items?.$ref,
    ).toBe('#/components/schemas/Ipv4NetworkExtendedDto');
    expect(
      operation('/network/ipv4-networks', 'get').parameters?.some(
        (parameter) => parameter.name === 'interfaceId' && parameter.in === 'query',
      ),
    ).toBe(true);
    const networkListParameters = operation('/network/ipv4-networks', 'get').parameters ?? [];
    const networkListParameter = (name: string) =>
      networkListParameters.find((parameter) => parameter.name === name)?.schema;
    expect(networkListParameter('q')).toMatchObject({ type: 'string', maxLength: 120 });
    expect(networkListParameter('routerId')).toMatchObject({ type: 'string', format: 'uuid' });
    expect(networkListParameter('interfaceId')).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    expect(networkListParameter('page')).toMatchObject({
      type: 'integer',
      minimum: 1,
      default: 1,
    });
    expect(networkListParameter('limit')).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
    });

    for (const path of [
      '/network/routers/{id}/interfaces',
      '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses',
    ]) {
      const parameters = operation(path, 'get').parameters ?? [];
      const parameter = (name: string) =>
        parameters.find((candidate) => candidate.name === name)?.schema;
      expect(parameter('page')).toMatchObject({ type: 'integer', minimum: 1, default: 1 });
      expect(parameter('limit')).toMatchObject({
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
      });
    }

    expect(bodySchema('/network/routers/{id}', 'patch')?.$ref).toBe(
      '#/components/schemas/UpdateRouterBody',
    );
    expect(bodySchema('/network/ipv4-networks/{id}', 'patch')?.$ref).toBe(
      '#/components/schemas/UpdateIpv4NetworkBody',
    );
    expect(bodySchema('/network/routers/{id}/interfaces', 'post')?.$ref).toBe(
      '#/components/schemas/CreateRouterInterfaceBody',
    );
    expect(
      contract.components.schemas.CreateRouterInterfaceBody?.oneOf?.map((schema) => schema.$ref),
    ).toEqual([
      '#/components/schemas/CreateRouterInterfaceBaseBody',
      '#/components/schemas/ConvertLegacyLanBody',
    ]);
    expect(
      contract.components.schemas.CreateRouterInterfaceBody?.oneOf?.map((schema) => schema.$ref),
    ).toEqual([
      '#/components/schemas/CreateRouterInterfaceBaseBody',
      '#/components/schemas/ConvertLegacyLanBody',
    ]);
    expect(
      bodySchema(
        '/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}/correct',
        'post',
      )?.$ref,
    ).toBe('#/components/schemas/CorrectRouterInterfaceIpv4AddressBody');
    expect(bodySchema('/network/routers/{id}/ipv4-networks', 'post')?.$ref).toBe(
      '#/components/schemas/AssistedCreateIpv4NetworkBody',
    );

    const legacyRouterDto = contract.components.schemas.RouterDto;
    expect(legacyRouterDto?.required).not.toEqual(
      expect.arrayContaining(['interfaceCount', 'legacyLanInterfaceId']),
    );
    expect(legacyRouterDto?.properties?.interfaceCount).toBeDefined();
    expect(legacyRouterDto?.properties?.legacyLanInterfaceId?.nullable).toBe(true);
    const routerListDto = resolveSchema(contract.components.schemas.RouterListDto);
    expect(routerListDto.required).toEqual(
      expect.arrayContaining(['interfaceCount', 'legacyLanInterfaceId']),
    );
    expect(resolveSchema(contract.components.schemas.RouterDetailDto).required).toEqual(
      expect.arrayContaining(['interfaceCount', 'legacyLanInterfaceId']),
    );
    expect(contract.components.schemas.Ipv4NetworkExtendedDto?.required).toEqual(
      expect.arrayContaining(['interfaceId', 'interface', 'reservationAvailability']),
    );
    expect(
      contract.components.schemas.UpdateRouterBody?.properties?.supportedControlMethods
        ?.uniqueItems,
    ).toBe(true);

    expect(
      operation('/network/routers/{id}/ipv4-networks', 'post')['x-conditional-permissions'],
    ).toEqual({
      when: "body.source.mode == 'INTERFACE_ADDRESS'",
      allOf: ['network.catalog.read'],
      reason:
        'Leer y validar la dirección candidata elegida; network.catalog.manage sigue siendo obligatorio.',
    });
  });

  it('models integer version fields and supported-control-method uniqueness', () => {
    const versionSchemas = [
      'Ipv4NetworkResponseDto',
      'Ipv4NetworkExtendedDto',
      'RouterResponseDto',
      'RouterInterfaceDto',
      'RouterInterfaceIpv4AddressDto',
      'UpdateRouterInterfaceBody',
      'UpdateRouterInterfaceIpv4AddressBody',
      'CorrectRouterInterfaceIpv4AddressBody',
      'UpdateIpv4NetworkBody',
      'UpdateRouterBody',
      'RouterStatusDto',
    ];

    expect(versionSchemas).toHaveLength(11);
    for (const schemaName of versionSchemas) {
      expect(contract.components.schemas[schemaName]?.properties?.version).toMatchObject({
        type: 'integer',
        minimum: 1,
      });
    }
    expect(
      contract.components.schemas.UpdateRouterBody?.properties?.supportedControlMethods
        ?.uniqueItems,
    ).toBe(true);
  });

  it('models conditional interface-version and candidate-association constraints', () => {
    const associationConstraint = (schema: OpenApiSchema | undefined) =>
      schema?.allOf?.find((constraint) => constraint.oneOf?.length === 3)?.oneOf;
    const assertAssociationConstraint = (schema: OpenApiSchema | undefined) => {
      const branches = associationConstraint(schema);
      expect(branches).toHaveLength(3);
      expect(branches?.[0]?.not?.anyOf).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ required: ['interfaceId'] }),
          expect.objectContaining({ required: ['interfaceVersion'] }),
        ]),
      );
      expect(branches?.[1]).toMatchObject({
        properties: { interfaceId: { type: 'string', nullable: true, enum: [null] } },
        required: ['interfaceId'],
        not: { required: ['interfaceVersion'] },
      });
      expect(branches?.[2]).toMatchObject({
        properties: {
          interfaceId: { type: 'string', format: 'uuid' },
          interfaceVersion: { type: 'integer', minimum: 1 },
        },
        required: ['interfaceId', 'interfaceVersion'],
      });
    };

    assertAssociationConstraint(contract.components.schemas.UpdateIpv4NetworkBody);
    const assisted = contract.components.schemas.AssistedCreateIpv4NetworkBody;
    assertAssociationConstraint(assisted);
    const sourceConstraint = assisted?.allOf?.find((constraint) => constraint.oneOf?.length === 2);
    expect(sourceConstraint?.oneOf?.[0]).toMatchObject({
      required: ['source'],
      properties: {
        source: {
          not: { required: ['mode'], properties: { mode: { enum: ['INTERFACE_ADDRESS'] } } },
        },
      },
    });
    expect(sourceConstraint?.oneOf?.[1]).toMatchObject({
      required: ['source', 'interfaceId'],
      properties: {
        source: { required: ['mode'], properties: { mode: { enum: ['INTERFACE_ADDRESS'] } } },
        interfaceId: { type: 'string', format: 'uuid' },
      },
    });
  });

  it('uses integer minimums for every *Version property reachable from assisted creation', () => {
    const refsFrom = (value: unknown, refs: Set<string>): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach((item) => refsFrom(item, refs));
        return;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.$ref === 'string') {
        const match = record.$ref.match(/^#\/components\/schemas\/(.+)$/);
        if (match?.[1]) refs.add(match[1]);
      }
      Object.values(record).forEach((item) => refsFrom(item, refs));
    };

    const reachable = new Set<string>();
    const pending = ['AssistedCreateIpv4NetworkBody'];
    while (pending.length > 0) {
      const schemaName = pending.pop();
      if (!schemaName || reachable.has(schemaName)) continue;
      reachable.add(schemaName);
      const refs = new Set<string>();
      refsFrom(contract.components.schemas[schemaName], refs);
      for (const ref of refs) {
        if (!reachable.has(ref)) pending.push(ref);
      }
    }

    const versionProperties: Array<{ path: string; schema: OpenApiSchema }> = [];
    const collectVersionProperties = (value: unknown, path: string): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => collectVersionProperties(item, `${path}[${index}]`));
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        const itemPath = `${path}.${key}`;
        if (key.endsWith('Version') && item && typeof item === 'object' && !Array.isArray(item)) {
          versionProperties.push({ path: itemPath, schema: item as OpenApiSchema });
        }
        collectVersionProperties(item, itemPath);
      }
    };
    for (const schemaName of reachable) {
      collectVersionProperties(
        contract.components.schemas[schemaName],
        `components.schemas.${schemaName}`,
      );
    }

    expect(reachable.has('InterfaceAddressSource')).toBe(true);
    expect(versionProperties.map(({ path }) => path)).toContain(
      'components.schemas.InterfaceAddressSource.properties.interfaceAddressVersion',
    );
    expect(contract.components.schemas.InterfaceAddressSource?.required).toContain(
      'interfaceAddressVersion',
    );
    expect(versionProperties.length).toBeGreaterThan(0);
    for (const { schema } of versionProperties) {
      expect(schema).toMatchObject({ type: 'integer', minimum: 1 });
    }
  });

  it('associates both provisioning request bodies and 201 responses with shared schemas', () => {
    expect(bodySchema('/network/provisioning/reserve', 'post')?.$ref).toBe(
      '#/components/schemas/ReserveProvisioningBody',
    );
    expect(responseSchema('/network/provisioning/reserve', 'post', '201')?.$ref).toBe(
      '#/components/schemas/ServiceProvisioningDto',
    );
    expect(bodySchema('/network/provisioning/regularize', 'post')?.$ref).toBe(
      '#/components/schemas/RegularizeProvisioningBody',
    );
    expect(responseSchema('/network/provisioning/regularize', 'post', '201')?.$ref).toBe(
      '#/components/schemas/ServiceProvisioningDto',
    );
    expect(responseSchema('/network/provisioning/{id}/certify', 'post', '200')?.$ref).toBe(
      '#/components/schemas/ServiceProvisioningDto',
    );
    expect(responseSchema('/network/provisioning/{id}/release', 'post', '200')?.$ref).toBe(
      '#/components/schemas/ServiceProvisioningDto',
    );
    expect(bodySchema('/network/provisioning/{id}/certify', 'post')?.$ref).toBe(
      '#/components/schemas/CertifyProvisioningBody',
    );
    expect(bodySchema('/network/provisioning/{id}/release', 'post')?.$ref).toBe(
      '#/components/schemas/ReleaseProvisioningBody',
    );
    expect(responseSchema('/network/provisioning/inbox', 'get', '200')?.$ref).toBe(
      '#/components/schemas/ProvisioningInboxListResponseDto',
    );
    expect(
      responseSchema('/network/provisioning/subscribers/{subscriberId}', 'get', '200')?.items?.$ref,
    ).toBe('#/components/schemas/ServiceProvisioningDto');
    expect(
      responseSchema(
        '/network/provisioning/orders/{executionOrderId}/context',
        'get',
        '200',
      )?.oneOf?.map((schema) => schema.$ref),
    ).toEqual([
      '#/components/schemas/ProvisioningOrderContextDto',
      '#/components/schemas/TechnicianProvisioningViewDto',
    ]);

    const reserve = contract.components.schemas.ReserveProvisioningBody;
    expect(reserve?.required).toEqual([
      'executionOrderId',
      'routerId',
      'ipv4NetworkId',
      'controlParams',
    ]);
    expect(reserve?.additionalProperties).toBe(false);
    expect(reserve?.properties?.requestedIp?.format).toBe('ipv4');

    const certify = contract.components.schemas.CertifyProvisioningBody;
    expect(certify?.required).toEqual(['evidenceId', 'version']);
    expect(certify?.properties?.evidenceId).toMatchObject({ type: 'string', format: 'uuid' });
    expect(certify?.properties?.version).toMatchObject({ type: 'integer', minimum: 1 });
    expect(certify?.additionalProperties).toBe(false);

    const release = contract.components.schemas.ReleaseProvisioningBody;
    expect(release?.required).toEqual(['version', 'reason']);
    expect(release?.properties?.version).toMatchObject({ type: 'integer', minimum: 1 });
    expect(release?.properties?.reason).toMatchObject({
      type: 'string',
      minLength: 10,
      maxLength: 500,
    });
    expect(release?.additionalProperties).toBe(false);
    expect(reserve?.properties?.controlParams?.$ref).toBe('#/components/schemas/ControlParams');
    expect(reserve?.properties?.contractId?.format).toBe('uuid');
    expect(reserve?.required).not.toContain('requestedIp');
    expect(reserve?.required).not.toContain('contractId');

    const regularize = contract.components.schemas.RegularizeProvisioningBody;
    expect(regularize?.required).toEqual([
      'executionOrderId',
      'routerId',
      'ipv4NetworkId',
      'controlParams',
      'reason',
    ]);
    expect(regularize?.additionalProperties).toBe(false);
    expect(regularize?.properties?.reason?.minLength).toBe(10);
    expect(regularize?.properties?.reason?.maxLength).toBe(500);
    expect(regularize?.properties?.requestedIp?.format).toBe('ipv4');
    expect(regularize?.properties?.contractId?.format).toBe('uuid');

    expect(contract.components.schemas.ControlParams?.oneOf?.map((schema) => schema.$ref)).toEqual([
      '#/components/schemas/SimpleQueueControlParamsDto',
      '#/components/schemas/PcqAddressListControlParamsDto',
    ]);
    expect(contract.components.schemas.SimpleQueueControlParamsDto?.additionalProperties).toBe(
      false,
    );
    expect(contract.components.schemas.PcqAddressListControlParamsDto?.additionalProperties).toBe(
      false,
    );

    const provisioning = contract.components.schemas.ServiceProvisioningDto;
    expect(provisioning?.required).toEqual([
      'id',
      'status',
      'origin',
      'executionOrderId',
      'executionOrderNumber',
      'subscriberId',
      'contractId',
      'router',
      'network',
      'ip',
      'controlMethod',
      'controlParams',
      'plan',
      'cpe',
      'reservedBy',
      'reservedAt',
      'certifiedBy',
      'certifiedAt',
      'certificationEvidenceId',
      'regularizedBy',
      'regularizedAt',
      'regularizationReason',
      'activatedAt',
      'releasedBy',
      'releasedAt',
      'releaseReason',
      'failureReason',
      'commercialActivation',
      'routerInstruction',
      'version',
      'createdAt',
      'updatedAt',
    ]);
    expect(provisioning?.properties?.status?.enum).toEqual([
      'RESERVED',
      'CERTIFIED',
      'ACTIVE',
      'FAILED',
      'RELEASED',
    ]);
    expect(provisioning?.properties?.origin?.enum).toEqual(['NORMAL', 'REGULARIZED']);
    for (const nullableField of [
      'contractId',
      'ip',
      'plan',
      'cpe',
      'reservedBy',
      'reservedAt',
      'certifiedBy',
      'certifiedAt',
      'certificationEvidenceId',
      'regularizedBy',
      'regularizedAt',
      'regularizationReason',
      'activatedAt',
      'releasedBy',
      'releasedAt',
      'releaseReason',
      'failureReason',
      'routerInstruction',
    ]) {
      expect(provisioning?.properties?.[nullableField]?.nullable).toBe(true);
    }
    expect(provisioning?.properties?.releaseReason?.enum).toEqual([
      'NOT_EXECUTED',
      'CANCELLED',
      'ANNULLED',
      'REPLACED',
      'MANUAL',
      'RECONCILED',
      null,
    ]);
    expect(provisioning?.properties?.failureReason?.enum).toEqual([
      'CLOSED_WITHOUT_CERTIFICATION',
      null,
    ]);
    expect(provisioning?.properties?.controlParams?.$ref).toBe(
      '#/components/schemas/ControlParams',
    );
    expect(provisioning?.properties?.controlMethod?.enum).toEqual([
      'SIMPLE_QUEUE_STATIC_IP',
      'PCQ_ADDRESS_LIST',
    ]);
    const commercialActivation = resolveSchema(provisioning?.properties?.commercialActivation);
    expect(commercialActivation.properties?.status?.enum).toEqual([
      'NOT_APPLICABLE',
      'PENDING',
      'DONE',
      'BLOCKED',
    ]);
    expect(commercialActivation.properties?.detail?.enum).toEqual([
      'CONTACT_REQUIRED',
      'FISCAL_INCOMPLETE',
      'NO_EXPEDIENTE',
      null,
    ]);
    expect(
      provisioning?.properties?.routerInstruction?.oneOf?.map((schema) => schema.$ref),
    ).toEqual([
      '#/components/schemas/ManualRouterInstructionDto',
      '#/components/schemas/AppliedRouterInstructionDto',
    ]);

    const inboxRow = contract.components.schemas.ProvisioningInboxRowDto;
    expect(inboxRow?.required).toEqual([
      'queue',
      'executionOrderId',
      'executionOrderNumber',
      'executionOrderStatus',
      'subscriberId',
      'subscriberDisplayLabel',
      'assignedTechnician',
      'serviceProvisioningId',
      'provisioningStatus',
      'ip',
      'failureReason',
      'closedAt',
      'updatedAt',
    ]);
    expect(inboxRow?.properties?.queue?.enum).toEqual([
      'IN_EXECUTION',
      'FAILED',
      'CLOSED_UNPROVISIONED',
    ]);
    expect(inboxRow?.properties?.executionOrderStatus?.enum).toEqual([
      'CREATED',
      'ASSIGNED',
      'EN_ROUTE',
      'IN_PROGRESS',
      'BLOCKED',
      'COMPLETED',
      'COMPLETED_WITH_OBSERVATIONS',
      'NOT_EXECUTED',
      'CANCELLED',
    ]);
    expect(inboxRow?.properties?.subscriberId?.nullable).toBe(true);
    expect(inboxRow?.properties?.assignedTechnician?.nullable).toBe(true);
    expect(inboxRow?.properties?.provisioningStatus?.nullable).toBe(true);
    expect(contract.components.schemas.ProvisioningInboxListResponseDto?.required).toEqual([
      'data',
      'meta',
    ]);
    expect(contract.components.schemas.ListMetaDto?.required).toEqual([
      'nextCursor',
      'total',
      'totalIsEstimate',
      'page',
      'limit',
      'totalPages',
      'hasMore',
      'mode',
      'capabilities',
      'sort',
    ]);

    const context = contract.components.schemas.ProvisioningOrderContextDto;
    expect(context?.required).toEqual([
      'executionOrder',
      'subscriber',
      'plan',
      'contracts',
      'cpe',
      'evidences',
      'provisioning',
      'suggestedQueueName',
    ]);
    const executionOrder = resolveSchema(context?.properties?.executionOrder);
    expect(executionOrder.properties?.status?.enum).toEqual([
      'CREATED',
      'ASSIGNED',
      'EN_ROUTE',
      'IN_PROGRESS',
      'BLOCKED',
      'COMPLETED',
      'COMPLETED_WITH_OBSERVATIONS',
      'NOT_EXECUTED',
      'CANCELLED',
    ]);
    expect(executionOrder.properties?.workType?.enum).toEqual([
      'INSTALLATION',
      'SUPPORT',
      'TECHNICAL_VISIT',
      'RETIREMENT',
      'MAINTENANCE',
    ]);
    expect(context?.properties?.plan?.nullable).toBe(true);
    expect(context?.properties?.cpe?.nullable).toBe(true);
    expect(context?.properties?.provisioning?.nullable).toBe(true);
    expect(contract.components.schemas.TechnicianProvisioningViewDto?.required).toEqual([
      'executionOrderId',
      'status',
      'ip',
      'certified',
      'updatedAt',
    ]);
    expect(
      contract.components.schemas.TechnicianProvisioningViewDto?.properties?.status?.nullable,
    ).toBe(true);
  });

  it('declares a JSON schema for every successful response unless explicitly bodyless', () => {
    for (const { path, method } of operations(contract)) {
      const current = operation(path, method);
      for (const [status, response] of Object.entries(current.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        if (current['x-no-content-responses']?.includes(status)) {
          expect(response.content).toBeUndefined();
          continue;
        }
        expect([
          method.toUpperCase(),
          path,
          status,
          response.content?.['application/json']?.schema,
        ]).toEqual([method.toUpperCase(), path, status, expect.any(Object)]);
      }
    }
  });

  it('binds domain errors to the operation and HTTP status that emits them', () => {
    const declaredErrorCodes = new Set(
      contract.components.schemas.NetworkErrorDto?.properties?.code?.enum?.map(String),
    );
    const expectedByOperation: Record<string, Record<string, string[]>> = {
      'GET /network/routers': { '403': ['FORBIDDEN'] },
      'POST /network/routers': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['ROUTER_NAME_IN_USE', 'SITE_OR_NODE_INACTIVE'],
      },
      'PATCH /network/routers/{id}': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'VERSION_CONFLICT',
          'ROUTER_NAME_IN_USE',
          'CONTROL_METHOD_IN_USE',
          'SITE_OR_NODE_INACTIVE',
        ],
      },
      'GET /network/routers/{id}': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
      },
      'POST /network/routers/{id}/deactivate': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'POST /network/routers/{id}/activate': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'GET /network/ipv4-networks': { '403': ['FORBIDDEN'] },
      'POST /network/ipv4-networks': {
        '400': ['VALIDATION_ERROR', 'EXCLUDED_IP_OUTSIDE_BLOCK'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['NETWORK_OVERLAP', 'CONTROL_METHOD_NOT_SUPPORTED'],
      },
      'PATCH /network/ipv4-networks/{id}': {
        '400': ['VALIDATION_ERROR', 'EXCLUDED_IP_OUTSIDE_BLOCK'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT', 'IP_IN_USE', 'EXCLUDED_IP_IN_USE', 'INTERFACE_NOT_AVAILABLE'],
      },
      'POST /network/ipv4-networks/{id}/deactivate': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'POST /network/ipv4-networks/{id}/activate': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'GET /network/plan-profiles': { '403': ['FORBIDDEN'] },
      'PUT /network/plan-profiles/{planId}': { '403': ['FORBIDDEN'] },
      'GET /network/settings': { '403': ['FORBIDDEN'] },
      'PATCH /network/settings': { '403': ['FORBIDDEN'] },
      'GET /network/catalog-meta': { '403': ['FORBIDDEN'] },
      'GET /network/provisioning/meta': { '403': ['FORBIDDEN'] },
      'GET /network/router-site-options': { '403': ['FORBIDDEN'] },
      'GET /network/routers/{id}/interfaces': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
      },
      'POST /network/routers/{id}/interfaces': {
        '400': ['VALIDATION_ERROR', 'ADDRESS_NOT_USABLE'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'CATALOG_REFERENCE_INACTIVE',
          'INTERFACE_NAME_IN_USE',
          'LEGACY_LAN_NOT_AVAILABLE',
          'LEGACY_LAN_ALREADY_CONVERTED',
          'VERSION_CONFLICT',
          'IP_IN_USE',
          'IP_PROTECTION_PENDING',
          'INTERFACE_ADDRESS_DUPLICATED',
        ],
      },
      'PATCH /network/routers/{id}/interfaces/{interfaceId}': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT', 'INTERFACE_NAME_IN_USE'],
      },
      'POST /network/routers/{id}/interfaces/{interfaceId}/activate': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'POST /network/routers/{id}/interfaces/{interfaceId}/deactivate': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'GET /network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
      },
      'POST /network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses': {
        '400': ['VALIDATION_ERROR', 'ADDRESS_NOT_USABLE'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'IP_PROTECTION_PENDING',
          'INTERFACE_NOT_AVAILABLE',
          'IP_IN_USE',
          'INTERFACE_ADDRESS_DUPLICATED',
        ],
      },
      'PATCH /network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT'],
      },
      'POST /network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses/{addressId}/correct': {
        '400': ['VALIDATION_ERROR', 'ADDRESS_NOT_USABLE', 'ADDRESS_RELEASE_CONFIRMATION_REQUIRED'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'IP_PROTECTION_PENDING',
          'VERSION_CONFLICT',
          'INTERFACE_NOT_AVAILABLE',
          'IP_IN_USE',
          'INTERFACE_ADDRESS_IS_GATEWAY',
          'INTERFACE_ADDRESS_DUPLICATED',
        ],
      },
      'POST /network/routers/{id}/ipv4-networks': {
        '400': [
          'VALIDATION_ERROR',
          'NETWORK_PREFIX_NOT_ASSIGNABLE',
          'NETWORK_CONFIRMATION_MISMATCH',
          'EXCLUDED_IP_OUTSIDE_BLOCK',
        ],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'VERSION_CONFLICT',
          'CATALOG_REFERENCE_INACTIVE',
          'SITE_OR_NODE_INACTIVE',
          'INTERFACE_NOT_AVAILABLE',
          'CONTROL_METHOD_NOT_SUPPORTED',
          'NETWORK_OVERLAP',
        ],
      },
      'POST /network/provisioning/reserve': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'RESERVATIONS_PAUSED',
          'NETWORK_POOL_EXHAUSTED',
          'IP_OUTSIDE_RANGE',
          'IP_IS_GATEWAY',
          'IP_EXCLUDED',
          'IP_PROTECTED_BY_INFRASTRUCTURE',
          'IP_IN_USE',
          'CONTROL_METHOD_NOT_SUPPORTED',
        ],
        '422': [
          'PROVISIONING_ORDER_NOT_ELIGIBLE',
          'PROVISIONING_TECHNICIAN_REQUIRED',
          'CONTRACT_NOT_OF_SUBSCRIBER',
          'NETWORK_NOT_IN_ROUTER',
        ],
      },
      'POST /network/provisioning/regularize': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN', 'PROVISIONING_CERTIFIER_IS_EXECUTOR'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': [
          'RESERVATIONS_PAUSED',
          'PROVISIONING_ALREADY_ACTIVE',
          'PROVISIONING_STATE_INVALID',
          'IP_PROTECTED_BY_INFRASTRUCTURE',
          'CONTROL_METHOD_NOT_SUPPORTED',
          'IP_IN_USE',
        ],
        '422': [
          'PROVISIONING_ORDER_NOT_ELIGIBLE',
          'PROVISIONING_TECHNICIAN_REQUIRED',
          'CONTRACT_NOT_OF_SUBSCRIBER',
          'NETWORK_NOT_IN_ROUTER',
        ],
      },
      'POST /network/provisioning/{id}/certify': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN', 'PROVISIONING_CERTIFIER_IS_EXECUTOR'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT', 'PROVISIONING_STATE_INVALID'],
        '422': [
          'PROVISIONING_ORDER_NOT_ELIGIBLE',
          'PROVISIONING_TECHNICIAN_REQUIRED',
          'PROVISIONING_EVIDENCE_REQUIRED',
        ],
      },
      'POST /network/provisioning/{id}/release': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['VERSION_CONFLICT', 'PROVISIONING_STATE_INVALID'],
        '422': ['PROVISIONING_ORDER_NOT_ELIGIBLE', 'NETWORK_NOT_IN_ROUTER'],
      },
      'GET /network/provisioning/inbox': {
        '400': ['VALIDATION_ERROR'],
        '403': ['FORBIDDEN'],
      },
      'GET /network/provisioning/subscribers/{subscriberId}': { '403': ['FORBIDDEN'] },
      'GET /network/provisioning/orders/{executionOrderId}/context': {
        '403': ['FORBIDDEN'],
        '404': ['RESOURCE_NOT_FOUND'],
        '409': ['RESERVATIONS_PAUSED'],
      },
    };

    const actualByOperation: Record<string, Record<string, string[]>> = {};
    for (const { path, method } of operations(contract)) {
      for (const [status, response] of Object.entries(operation(path, method).responses ?? {})) {
        if (!response['x-error-codes']) continue;
        const key = `${method.toUpperCase()} ${path}`;
        actualByOperation[key] ??= {};
        actualByOperation[key][status] = response['x-error-codes'];
        expect([key, status, errorCodeEnums(response)]).toEqual([
          key,
          status,
          [response['x-error-codes']],
        ]);
        expect(response['x-error-codes'].every((code) => declaredErrorCodes.has(code))).toBe(true);
      }
    }
    expect(actualByOperation).toEqual(expectedByOperation);

    expect(
      operation('/network/provisioning/reserve', 'post').responses?.['409']?.['x-error-conditions'],
    ).toEqual({
      RESERVATIONS_PAUSED:
        'Flag activo: rechaza nuevas reservas y replays que volverían a emitir instrucciones; no muta asignaciones ni reemite instrucciones.',
      IP_PROTECTED_BY_INFRASTRUCTURE: 'Solo reserva manual de una IP local protegida por ADR-101.',
    });
    expect(
      operation('/network/provisioning/regularize', 'post').responses?.['409']?.[
        'x-error-conditions'
      ],
    ).toEqual({
      RESERVATIONS_PAUSED:
        'La pausa aplica a toda regularización; no muta asignaciones ni emite instrucciones.',
      IP_PROTECTED_BY_INFRASTRUCTURE:
        'Solo si requestedIp solicita una IP nueva y el flujo llega a reserveIp; no aplica a asignación automática, replay idempotente ni reutilización de una asignación fallida.',
    });
    expect(errorCodes('/network/provisioning/regularize', 'post', '409')).toContain(
      'RESERVATIONS_PAUSED',
    );
    expect(errorCodes('/network/provisioning/regularize', 'post', '409')).toContain(
      'IP_PROTECTED_BY_INFRASTRUCTURE',
    );
    for (const item of [
      { path: '/network/provisioning/{id}/release', method: 'post' as const },
      { path: '/network/provisioning/orders/{executionOrderId}/context', method: 'get' as const },
    ]) {
      const forbiddenResponse = operation(item.path, item.method).responses?.['403'];
      expect(forbiddenResponse?.['x-error-codes']).toEqual(['FORBIDDEN']);
      expect(forbiddenResponse && errorCodeEnums(forbiddenResponse)).toEqual([['FORBIDDEN']]);
    }
    expect(errorCodes('/network/provisioning/{id}/release', 'post', '409') ?? []).not.toContain(
      'RESERVATIONS_PAUSED',
    );
    expect(errorCodes('/network/provisioning/{id}/certify', 'post', '409') ?? []).not.toContain(
      'RESERVATIONS_PAUSED',
    );

    for (const { path, method } of operations(contract)) {
      for (const [status, response] of Object.entries(operation(path, method).responses ?? {})) {
        if (!response['x-error-codes']) continue;
        expect([method.toUpperCase(), path, status, errorCodeEnums(response)]).toEqual([
          method.toUpperCase(),
          path,
          status,
          [response['x-error-codes']],
        ]);
      }
    }
  });

  it('publishes the infrastructure-IP protection errors and synthetic examples', () => {
    const networkErrorCodes = contract.components.schemas.NetworkErrorDto?.properties?.code?.enum;
    expect(networkErrorCodes).toEqual(
      expect.arrayContaining(['IP_PROTECTED_BY_INFRASTRUCTURE', 'IP_PROTECTION_PENDING']),
    );
    const encodedContract = JSON.stringify(contract);
    expect(encodedContract).toContain('192.0.2.7/24');
    expect(encodedContract).not.toMatch(/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(encodedContract).not.toMatch(/\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    expect(encodedContract).not.toMatch(/\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/);
  });

  it('tracks the O2-H/O2-M handlers and the separately authorized pause metadata', () => {
    expect(runtime.paths['/network/catalog-meta']?.get).toBeDefined();
    expect(runtime.paths['/network/router-site-options']?.get).toBeDefined();
    expect(runtime.paths['/network/routers/{id}']?.get).toBeDefined();
    expect(runtime.paths['/network/routers/{id}/interfaces']?.get).toBeDefined();
    expect(
      runtime.paths['/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses']?.post,
    ).toBeDefined();
    expect(runtime.paths['/network/provisioning/meta']?.get).toBeDefined();
  });

  it('matches the complete target runtime operation set', () => {
    expect(operation('/network/provisioning/meta', 'get')).toBeDefined();
    expect(
      operations(runtime).sort((a, b) =>
        `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`),
      ),
    ).toEqual(
      operations(contract).sort((a, b) =>
        `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`),
      ),
    );
    expect(operations(runtime)).toHaveLength(35);
    expect(operations(contract)).toHaveLength(35);
  });
});
