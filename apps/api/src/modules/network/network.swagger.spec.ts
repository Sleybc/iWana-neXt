import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { NetworkCatalogController } from './network-catalog.controller';
import { NetworkCatalogService } from './network-catalog.service';
import { NetworkProvisioningController } from './network-provisioning.controller';
import { ServiceProvisioningService } from './service-provisioning.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantAwareThrottlerGuard } from '../tasks/guards/tenant-aware-throttler.guard';
import { NetworkTenantGuard } from './guards/network-tenant.guard';
import { NetworkInterfaceCatalogService } from './network-interface-catalog.service';

const snapshotPath = resolve(__dirname, '../../../openapi/network-catalog.v1.json');
const targetContractPath = resolve(__dirname, '../../../openapi/network-catalog.contract.v1.json');

interface ParityResponse {
  content?: Record<string, { schema?: unknown }>;
  'x-error-codes'?: string[];
}

interface ParityOperation {
  parameters?: Array<{
    name?: string;
    in?: string;
    required?: boolean;
    schema?: unknown;
  }>;
  requestBody?: { required?: boolean; content?: Record<string, { schema?: unknown }> };
  responses?: Record<string, ParityResponse>;
  'x-required-roles'?: unknown;
  'x-required-permissions'?: unknown;
  'x-conditional-permissions'?: unknown;
}

function normalizeParameters(parameters: ParityOperation['parameters']): unknown[] {
  return (parameters ?? [])
    .map((parameter) => ({
      name: parameter.name,
      in: parameter.in,
      required: parameter.required ?? false,
      schema: parameter.schema,
    }))
    .sort((left, right) => `${left.in}:${left.name}`.localeCompare(`${right.in}:${right.name}`));
}

function getNetworkDocument(document: OpenAPIObject): OpenAPIObject {
  const paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => path.startsWith('/network/')),
  );
  return { ...document, paths };
}

function getSchemaProperties(document: OpenAPIObject, schemaName: string): Record<string, unknown> {
  const schemas = document.components?.schemas as
    | Record<string, { properties?: Record<string, unknown> }>
    | undefined;
  return schemas?.[schemaName]?.properties ?? {};
}

function getRequiredPermissions(operation: object | undefined): unknown {
  return (operation as { 'x-required-permissions'?: unknown } | undefined)?.[
    'x-required-permissions'
  ];
}

function normalizeSchema(
  document: OpenAPIObject,
  schema: unknown,
  resolvedRefs = new Set<string>(),
): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const source = schema as Record<string, unknown>;
  if (typeof source['$ref'] === 'string') {
    if (!source['$ref'].startsWith('#/components/schemas/')) return source;
    const schemaName = source['$ref'].slice('#/components/schemas/'.length);
    const component = document.components?.schemas?.[schemaName];
    if (!component) throw new Error(`Unresolved OpenAPI schema reference ${source['$ref']}`);
    if (resolvedRefs.has(schemaName)) return { $ref: source['$ref'] };
    const nextResolvedRefs = new Set(resolvedRefs);
    nextResolvedRefs.add(schemaName);
    return normalizeSchema(document, component, nextResolvedRefs);
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'description') continue;
    if (key === 'required' && Array.isArray(value)) {
      normalized[key] = [...value].sort();
      continue;
    }
    if (key === 'allOf' && Array.isArray(value)) continue;
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) => normalizeSchema(document, item, resolvedRefs));
      continue;
    }
    if (value && typeof value === 'object') {
      normalized[key] = normalizeSchema(document, value, resolvedRefs);
      continue;
    }
    normalized[key] = value;
  }

  const allOf = source['allOf'];
  if (Array.isArray(allOf)) {
    for (const child of allOf) {
      const normalizedChild = normalizeSchema(document, child, resolvedRefs);
      if (!normalizedChild || typeof normalizedChild !== 'object') continue;
      const childSchema = normalizedChild as Record<string, unknown>;
      const currentProperties =
        (normalized['properties'] as Record<string, unknown> | undefined) ?? {};
      const childProperties =
        (childSchema['properties'] as Record<string, unknown> | undefined) ?? {};
      const mergedProperties = { ...currentProperties, ...childProperties };
      if (Object.keys(mergedProperties).length > 0) normalized['properties'] = mergedProperties;
      const mergedRequired = [
        ...new Set([
          ...((normalized['required'] as string[] | undefined) ?? []),
          ...((childSchema['required'] as string[] | undefined) ?? []),
        ]),
      ].sort();
      if (mergedRequired.length > 0) normalized['required'] = mergedRequired;
      for (const [key, value] of Object.entries(childSchema)) {
        if (key === 'properties' || key === 'required') continue;
        if (!(key in normalized)) normalized[key] = value;
      }
    }
  }
  return normalized;
}

function collectParityMismatch(
  mismatches: string[],
  label: string,
  runtimeValue: unknown,
  targetValue: unknown,
) {
  if (!isDeepStrictEqual(runtimeValue, targetValue)) mismatches.push(label);
}

function collectSchemaParityMismatch(
  mismatches: string[],
  path: string,
  method: string,
  part: string,
  runtimeDocument: OpenAPIObject,
  targetDocument: OpenAPIObject,
  runtimeSchema: unknown,
  targetSchema: unknown,
) {
  collectParityMismatch(
    mismatches,
    `${method.toUpperCase()} ${path} ${part}`,
    normalizeSchema(runtimeDocument, runtimeSchema),
    normalizeSchema(targetDocument, targetSchema),
  );
}

describe('MOD13 runtime OpenAPI contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NetworkCatalogController, NetworkProvisioningController],
      providers: [
        { provide: NetworkCatalogService, useValue: {} },
        { provide: NetworkInterfaceCatalogService, useValue: {} },
        { provide: ServiceProvisioningService, useValue: {} },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: NetworkTenantGuard, useValue: { canActivate: () => true } },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
        { provide: TenantAwareThrottlerGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('matches the committed network snapshot generated from SwaggerModule.createDocument', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('iWana neXt API')
        .setDescription('API REST del sistema ISP/OSS/BSS/NMS/EMS/ERP iWana neXt Colombia')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .build(),
    );
    const networkDocument = getNetworkDocument(document);

    if (process.env['UPDATE_NETWORK_OPENAPI_SNAPSHOT'] === '1') {
      mkdirSync(dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, `${JSON.stringify(networkDocument, null, 2)}\n`, 'utf8');
    }

    const publishedSnapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as OpenAPIObject;
    expect(networkDocument).toEqual(publishedSnapshot);
  });

  it('matches the target order-context 404 and pause 409 schemas and error conditions', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('iWana neXt API')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .build(),
    );
    const targetContract = JSON.parse(readFileSync(targetContractPath, 'utf8')) as OpenAPIObject;
    const path = '/network/provisioning/orders/{executionOrderId}/context';
    const runtimeResponse = document.paths[path]?.get?.responses['404'];
    const targetResponse = targetContract.paths[path]?.get?.responses['404'];
    const runtimePausedResponse = document.paths[path]?.get?.responses['409'];
    const targetPausedResponse = targetContract.paths[path]?.get?.responses['409'];

    expect(runtimeResponse).toEqual(targetResponse);
    expect(runtimeResponse).toMatchObject({
      description: 'La orden no existe o no est\u00e1 disponible para este \u00e1mbito.',
      'x-error-codes': ['RESOURCE_NOT_FOUND'],
      content: {
        'application/json': {
          schema: {
            allOf: expect.arrayContaining([
              { $ref: '#/components/schemas/NetworkErrorDto' },
              {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string', enum: ['RESOURCE_NOT_FOUND'] } },
              },
            ]),
          },
        },
      },
    });
    expect(runtimePausedResponse).toEqual(targetPausedResponse);
    expect(runtimePausedResponse).toMatchObject({
      description: 'La pausa activa impide reemitir instrucciones para el aprovisionamiento.',
      'x-error-codes': ['RESERVATIONS_PAUSED'],
      'x-error-conditions': {
        RESERVATIONS_PAUSED:
          'La pausa está activa y el contexto completo volvería a emitir instrucciones para una asignación no liberada; la proyección reducida del técnico no las emite.',
      },
    });
  });

  it('matches runtime metadata, error schemas, provisioning bodies, and response projections to the candidate target', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('iWana neXt API').setVersion('1.0').build(),
    );
    const targetContract = JSON.parse(readFileSync(targetContractPath, 'utf8')) as OpenAPIObject;
    const targetOperations = Object.entries(targetContract.paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem ?? {}).flatMap(([method, targetOperation]) => {
        if (!targetOperation || !['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
          return [];
        }
        return [{ path, method, targetOperation: targetOperation as ParityOperation }];
      }),
    );
    const parityMismatches: string[] = [];
    expect(targetOperations).toHaveLength(35);
    expect(
      targetOperations.filter(({ targetOperation }) => targetOperation.requestBody),
    ).toHaveLength(22);
    expect(
      targetOperations.reduce(
        (count, { targetOperation }) =>
          count +
          Object.keys(targetOperation.responses ?? {}).filter((status) => status.startsWith('2'))
            .length,
        0,
      ),
    ).toBe(35);

    for (const { path, method, targetOperation } of targetOperations) {
      const runtimeOperation = document.paths[path]?.[
        method as 'get' | 'post' | 'patch' | 'put' | 'delete'
      ] as ParityOperation | undefined;
      expect(runtimeOperation).toBeDefined();
      if (!runtimeOperation)
        throw new Error(`${method.toUpperCase()} ${path} is missing at runtime`);
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} parameters`,
        normalizeParameters(runtimeOperation.parameters),
        normalizeParameters(targetOperation.parameters),
      );
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} x-required-roles`,
        runtimeOperation['x-required-roles'],
        targetOperation['x-required-roles'],
      );
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} x-required-permissions`,
        runtimeOperation['x-required-permissions'],
        targetOperation['x-required-permissions'],
      );
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} x-conditional-permissions`,
        runtimeOperation['x-conditional-permissions'],
        targetOperation['x-conditional-permissions'],
      );

      const targetErrorStatuses = Object.keys(targetOperation.responses ?? {})
        .filter((status) => status.startsWith('4') || status.startsWith('5'))
        .sort();
      const runtimeErrorStatuses = Object.keys(runtimeOperation?.responses ?? {})
        .filter((status) => status.startsWith('4') || status.startsWith('5'))
        .sort();
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} error statuses`,
        runtimeErrorStatuses,
        targetErrorStatuses,
      );

      for (const status of targetErrorStatuses) {
        const targetResponse = targetOperation.responses?.[status];
        const runtimeResponse = runtimeOperation?.responses?.[status];
        collectParityMismatch(
          parityMismatches,
          `${method.toUpperCase()} ${path} ${status} x-error-codes`,
          runtimeResponse?.['x-error-codes'],
          targetResponse?.['x-error-codes'],
        );
        collectSchemaParityMismatch(
          parityMismatches,
          path,
          method,
          `error response ${status}`,
          document,
          targetContract,
          runtimeResponse?.content?.['application/json']?.schema,
          targetResponse?.content?.['application/json']?.schema,
        );
      }

      const targetRequestBody = targetOperation.requestBody;
      const runtimeRequestBody = runtimeOperation.requestBody;
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} request body presence`,
        Boolean(runtimeRequestBody),
        Boolean(targetRequestBody),
      );
      if (runtimeRequestBody && targetRequestBody) {
        collectParityMismatch(
          parityMismatches,
          `${method.toUpperCase()} ${path} request body required`,
          runtimeRequestBody.required,
          targetRequestBody.required,
        );
        const runtimeMediaTypes = Object.keys(runtimeRequestBody.content ?? {}).sort();
        const targetMediaTypes = Object.keys(targetRequestBody.content ?? {}).sort();
        collectParityMismatch(
          parityMismatches,
          `${method.toUpperCase()} ${path} request body media types`,
          runtimeMediaTypes,
          targetMediaTypes,
        );
        for (const mediaType of targetMediaTypes) {
          const runtimeSchema = runtimeRequestBody.content?.[mediaType]?.schema;
          const targetSchema = targetRequestBody.content?.[mediaType]?.schema;
          collectParityMismatch(
            parityMismatches,
            `${method.toUpperCase()} ${path} request schema presence ${mediaType}`,
            runtimeSchema !== undefined,
            targetSchema !== undefined,
          );
          collectSchemaParityMismatch(
            parityMismatches,
            path,
            method,
            `request body ${mediaType}`,
            document,
            targetContract,
            runtimeSchema,
            targetSchema,
          );
        }
      }

      const targetSuccessStatuses = Object.keys(targetOperation.responses ?? {})
        .filter((status) => status.startsWith('2'))
        .sort();
      const runtimeSuccessStatuses = Object.keys(runtimeOperation.responses ?? {})
        .filter((status) => status.startsWith('2'))
        .sort();
      collectParityMismatch(
        parityMismatches,
        `${method.toUpperCase()} ${path} success statuses`,
        runtimeSuccessStatuses,
        targetSuccessStatuses,
      );
      for (const status of targetSuccessStatuses) {
        const targetResponse = targetOperation.responses?.[status];
        const runtimeResponse = runtimeOperation.responses?.[status];
        const targetMediaTypes = Object.keys(targetResponse?.content ?? {}).sort();
        const runtimeMediaTypes = Object.keys(runtimeResponse?.content ?? {}).sort();
        collectParityMismatch(
          parityMismatches,
          `${method.toUpperCase()} ${path} response ${status} media types`,
          runtimeMediaTypes,
          targetMediaTypes,
        );
        for (const mediaType of targetMediaTypes) {
          const runtimeSchema = runtimeResponse?.content?.[mediaType]?.schema;
          const targetSchema = targetResponse?.content?.[mediaType]?.schema;
          collectParityMismatch(
            parityMismatches,
            `${method.toUpperCase()} ${path} response schema presence ${status} ${mediaType}`,
            runtimeSchema !== undefined,
            targetSchema !== undefined,
          );
          collectSchemaParityMismatch(
            parityMismatches,
            path,
            method,
            `response ${status} ${mediaType}`,
            document,
            targetContract,
            runtimeSchema,
            targetSchema,
          );
        }
      }
    }

    const runtimeRouterList = (
      document.components?.schemas as Record<string, unknown> | undefined
    )?.['RouterListDto'];
    const targetRouterList = targetContract.components?.schemas?.['RouterListDto'];
    collectParityMismatch(
      parityMismatches,
      'components RouterListDto',
      normalizeSchema(document, runtimeRouterList),
      normalizeSchema(targetContract, targetRouterList),
    );
    expect(parityMismatches).toEqual([]);
  });

  it('documents the allowlisted D10 detail shape and the source discriminator', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('iWana neXt API')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .build(),
    );
    const detailProperties = Object.keys(getSchemaProperties(document, 'RouterDetailDto')).sort();
    expect(detailProperties).toEqual(
      [
        'id',
        'name',
        'managementHost',
        'lanInterface',
        'supportedControlMethods',
        'organizationSiteId',
        'commercialNodeId',
        'organizationSite',
        'commercialNode',
        'status',
        'notes',
        'networkCount',
        'interfaceCount',
        'legacyLanInterfaceId',
        'version',
        'createdAt',
        'updatedAt',
      ].sort(),
    );

    const schemas = document.components?.schemas as
      | Record<
          string,
          {
            properties?: Record<
              string,
              {
                type?: string;
                format?: string;
                nullable?: boolean;
                enum?: unknown[];
                oneOf?: unknown[];
                discriminator?: unknown;
              }
            >;
            required?: string[];
          }
        >
      | undefined;
    const routerDetail = schemas?.['RouterDetailDto'];
    expect(routerDetail?.required?.sort()).toEqual(detailProperties);
    expect(routerDetail?.properties?.['organizationSite']).toMatchObject({ nullable: true });
    expect(routerDetail?.properties?.['commercialNode']).toMatchObject({ nullable: true });
    expect(routerDetail?.properties?.['organizationSiteId']).toMatchObject({
      type: 'string',
      format: 'uuid',
      nullable: true,
    });
    expect(routerDetail?.properties?.['legacyLanInterfaceId']).toMatchObject({
      type: 'string',
      format: 'uuid',
      nullable: true,
    });

    const updateRouter = schemas?.['UpdateRouterBody'];
    expect(updateRouter?.required).toEqual(['version']);
    expect(updateRouter?.properties?.['organizationSiteId']).toMatchObject({
      type: 'string',
      format: 'uuid',
      nullable: true,
    });
    expect(updateRouter?.properties?.['commercialNodeId']).toMatchObject({
      type: 'string',
      format: 'uuid',
      nullable: true,
    });

    const extendedNetworkProperties = Object.keys(
      getSchemaProperties(document, 'Ipv4NetworkExtendedDto'),
    ).sort();
    expect(extendedNetworkProperties).toEqual(
      [
        'id',
        'routerId',
        'routerName',
        'name',
        'cidr',
        'gateway',
        'assignableFrom',
        'assignableTo',
        'excludedIps',
        'interfaceId',
        'interface',
        'reservationAvailability',
        'defaultControlMethod',
        'status',
        'occupancy',
        'version',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    const extendedNetwork = schemas?.['Ipv4NetworkExtendedDto'];
    expect(extendedNetwork?.required).toEqual(
      expect.arrayContaining(['interfaceId', 'interface', 'reservationAvailability']),
    );

    const sourceSchema = schemas?.['AssistedCreateIpv4NetworkBody']?.properties?.['source'];
    expect(sourceSchema?.oneOf).toHaveLength(3);
    expect(sourceSchema?.discriminator).toEqual(expect.objectContaining({ propertyName: 'mode' }));
    const networkErrorCode = schemas?.['NetworkErrorDto']?.properties?.['code'];
    expect(networkErrorCode?.enum).toEqual(
      expect.arrayContaining(['RESOURCE_NOT_FOUND', 'IP_PROTECTED_BY_INFRASTRUCTURE', 'FORBIDDEN']),
    );

    expect(document.paths['/network/routers/{id}']?.patch?.requestBody).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/UpdateRouterBody' } },
      },
    });
    expect(document.paths['/network/routers/{id}']?.patch?.responses['200']).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/RouterDto' } },
      },
    });
    expect(document.paths['/network/routers']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/CreateRouterBody' } },
      },
    });
    expect(document.paths['/network/ipv4-networks']?.get?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              data: { items: { $ref: '#/components/schemas/Ipv4NetworkExtendedDto' } },
            },
          },
        },
      },
    });
  });

  it('documents the exact permissions of the existing runtime operations', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('iWana neXt API').setVersion('1.0').build(),
    );
    const checks = [
      {
        path: '/network/catalog-meta',
        method: 'get',
        value: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/router-site-options',
        method: 'get',
        value: { allOf: ['network.catalog.manage'] },
      },
      { path: '/network/routers', method: 'get', value: { allOf: ['network.catalog.read'] } },
      { path: '/network/routers', method: 'post', value: { allOf: ['network.catalog.manage'] } },
      {
        path: '/network/routers/{id}',
        method: 'patch',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/deactivate',
        method: 'post',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/routers/{id}/activate',
        method: 'post',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks',
        method: 'get',
        value: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/ipv4-networks',
        method: 'post',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks/{id}',
        method: 'patch',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks/{id}/deactivate',
        method: 'post',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/ipv4-networks/{id}/activate',
        method: 'post',
        value: { allOf: ['network.catalog.manage'] },
      },
      {
        path: '/network/plan-profiles',
        method: 'get',
        value: { allOf: ['network.catalog.read'] },
      },
      {
        path: '/network/plan-profiles/{planId}',
        method: 'put',
        value: { allOf: ['network.catalog.manage'] },
      },
      { path: '/network/settings', method: 'get', value: { allOf: ['network.catalog.read'] } },
      { path: '/network/settings', method: 'patch', value: { allOf: ['network.catalog.manage'] } },
      {
        path: '/network/provisioning/reserve',
        method: 'post',
        value: { allOf: ['network.provisioning.execute'] },
      },
      {
        path: '/network/provisioning/regularize',
        method: 'post',
        value: { allOf: ['network.provisioning.regularize'] },
      },
      {
        path: '/network/provisioning/{id}/certify',
        method: 'post',
        value: { allOf: ['network.provisioning.certify'] },
      },
      {
        path: '/network/provisioning/{id}/release',
        method: 'post',
        value: { allOf: ['network.provisioning.execute'] },
      },
      {
        path: '/network/provisioning/inbox',
        method: 'get',
        value: { allOf: ['network.provisioning.read'] },
      },
      {
        path: '/network/provisioning/subscribers/{subscriberId}',
        method: 'get',
        value: { allOf: ['network.provisioning.read'] },
      },
      {
        path: '/network/provisioning/orders/{executionOrderId}/context',
        method: 'get',
        value: {
          anyOf: ['network.provisioning.read', 'operations.execution_orders.read'],
        },
      },
    ] as const;

    for (const check of checks) {
      const operation = document.paths[check.path]?.[check.method];
      expect(getRequiredPermissions(operation)).toEqual(check.value);
    }
  });

  it('publishes all O2-H/O2-M catalog and pause-metadata handlers', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('iWana neXt API').setVersion('1.0').build(),
    );

    expect(document.paths['/network/catalog-meta']?.get).toBeDefined();
    const provisioningMeta = document.paths['/network/provisioning/meta']?.get;
    expect(provisioningMeta).toBeDefined();
    expect(getRequiredPermissions(provisioningMeta)).toEqual({
      allOf: ['network.provisioning.read'],
    });
    expect(provisioningMeta?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ProvisioningMetaDto' },
        },
      },
    });
    expect(provisioningMeta?.responses['403']).toMatchObject({
      'x-error-codes': ['FORBIDDEN'],
    });
    expect(document.paths['/network/router-site-options']?.get).toBeDefined();
    const networkListParameters = (document.paths['/network/ipv4-networks']?.get?.parameters ??
      []) as Array<{ name?: string; schema?: Record<string, unknown> }>;
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
      const parameters = (document.paths[path]?.get?.parameters ?? []) as Array<{
        name?: string;
        schema?: Record<string, unknown>;
      }>;
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
    expect(document.paths['/network/routers/{id}']?.get).toBeDefined();
    expect(document.paths['/network/routers/{id}/interfaces']?.get).toBeDefined();
    expect(document.paths['/network/routers/{id}/interfaces']?.post).toBeDefined();
    expect(
      document.paths['/network/routers/{id}/interfaces/{interfaceId}/ipv4-addresses']?.post,
    ).toBeDefined();
    expect(document.paths['/network/routers/{id}/ipv4-networks']?.post).toBeDefined();
  });
});
