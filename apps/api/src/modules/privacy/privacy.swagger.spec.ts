import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { erasureCategorySchema } from '@iwana/shared';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { AuthorizationsController } from './authorizations/authorizations.controller';
import { AuthorizationsService } from './authorizations/authorizations.service';
import { IncidentsController } from './incidents/incidents.controller';
import { IncidentsService } from './incidents/incidents.service';
import { LegalTextsController } from './legal-texts/legal-texts.controller';
import { LegalTextsService } from './legal-texts/legal-texts.service';
import { MarksController } from './marks/marks.controller';
import { MarksService } from './marks/marks.service';
import { RetentionController } from './retention/retention.controller';
import { RetentionService } from './retention/retention.service';
import { PrivacyInventoryController } from './inventory/inventory.controller';
import { PrivacyInventoryService } from './inventory/inventory.service';
import { PrivacyRequestsController } from './requests/requests.controller';
import { PrivacyRequestsService } from './requests/requests.service';
import { PrivacyEvidenceController } from './evidence/privacy-evidence.controller';
import { MediaService } from '../media/media.service';
import { AuditService } from '../audit/audit.service';

type SwaggerOperation = Record<string, unknown>;

function getBodySchema(
  operation: SwaggerOperation | undefined,
): Record<string, unknown> | undefined {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const json = content?.['application/json'] as Record<string, unknown> | undefined;
  return json?.schema as Record<string, unknown> | undefined;
}

function getResponseSchema(
  operation: SwaggerOperation | undefined,
  status: string,
): Record<string, unknown> | undefined {
  const responses = operation?.responses as Record<string, unknown> | undefined;
  const response = responses?.[status] as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, unknown> | undefined;
  const json = content?.['application/json'] as Record<string, unknown> | undefined;
  return json?.schema as Record<string, unknown> | undefined;
}

describe('Privacy OpenAPI', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthorizationsController,
        LegalTextsController,
        MarksController,
        RetentionController,
        IncidentsController,
        PrivacyInventoryController,
        PrivacyRequestsController,
        PrivacyEvidenceController,
      ],
      providers: [
        { provide: AuthorizationsService, useValue: {} },
        { provide: LegalTextsService, useValue: {} },
        { provide: MarksService, useValue: {} },
        { provide: RetentionService, useValue: {} },
        { provide: IncidentsService, useValue: {} },
        { provide: PrivacyInventoryService, useValue: {} },
        { provide: PrivacyRequestsService, useValue: {} },
        { provide: MediaService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: PermissionsGuard, useValue: { canActivate: () => true } },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function document() {
    return SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Privacy API').setVersion('1.0').build(),
    );
  }

  it('publica las operaciones de privacy con bearer auth', () => {
    const paths = document().paths;
    const requiredOperations: Array<[string, string]> = [
      ['/privacy/authorizations', 'post'],
      ['/privacy/parties/{partyId}/authorizations', 'get'],
      ['/privacy/parties/{partyId}/authorizations/{id}/proof', 'get'],
      ['/privacy/legal-texts', 'get'],
      ['/privacy/legal-texts/current', 'get'],
      ['/privacy/legal-texts', 'post'],
      ['/privacy/parties/{partyId}/marks', 'get'],
      ['/privacy/retention-policies', 'get'],
      ['/privacy/retention-policies', 'patch'],
      ['/privacy/incidents', 'get'],
      ['/privacy/incidents', 'post'],
      ['/privacy/incidents/{id}/reported', 'post'],
      ['/privacy/inventory', 'get'],
      ['/privacy/evidence', 'post'],
      ['/privacy/requests', 'get'],
      ['/privacy/requests', 'post'],
      ['/privacy/requests/{id}', 'get'],
      ['/privacy/requests/{id}/require-info', 'post'],
      ['/privacy/requests/{id}/complete', 'post'],
      ['/privacy/requests/{id}/extend', 'post'],
      ['/privacy/requests/{id}/resolve', 'post'],
      ['/privacy/requests/{id}/erasure-preview', 'get'],
      ['/privacy/requests/{id}/reject', 'post'],
      ['/privacy/requests/{id}/transfer', 'post'],
      ['/privacy/requests/{id}/tasks/{taskId}/complete', 'post'],
      ['/privacy/requests/{id}/evidence', 'get'],
      ['/privacy/requests/{id}/verify-identity', 'post'],
    ];

    for (const [path, method] of requiredOperations) {
      const operation = paths[path]?.[method as keyof (typeof paths)[string]] as
        | Record<string, unknown>
        | undefined;
      expect(operation).toBeDefined();
      expect(operation?.security).toEqual([{ 'access-token': [] }]);
    }
  });

  it('documenta el body de autorización sin aceptar IP ni user agent del cliente', () => {
    const operation = document().paths['/privacy/authorizations']?.post as
      | SwaggerOperation
      | undefined;
    const schema = getBodySchema(operation);
    const properties = schema?.properties as Record<string, unknown> | undefined;

    expect(schema?.required).toEqual(['partyId', 'purpose', 'granted', 'channel', 'legalTextId']);
    expect(schema?.additionalProperties).toBe(false);
    expect(properties?.evidenceMediaId).toBeDefined();
    expect(properties?.ip).toBeUndefined();
    expect(properties?.userAgent).toBeUndefined();
    expect(getResponseSchema(operation, '201')).toMatchObject({
      type: 'object',
      required: ['data'],
    });
  });

  it('documenta los contratos de textos, retención e incidentes', () => {
    const paths = document().paths;
    const legalTextCreate = paths['/privacy/legal-texts']?.post as SwaggerOperation | undefined;
    const retentionUpdate = paths['/privacy/retention-policies']?.patch as
      | SwaggerOperation
      | undefined;
    const incidentCreate = paths['/privacy/incidents']?.post as SwaggerOperation | undefined;

    expect(getBodySchema(legalTextCreate)?.required).toEqual(['type', 'version', 'content']);
    expect(getBodySchema(retentionUpdate)?.required).toEqual(['category', 'years']);
    expect(getBodySchema(incidentCreate)?.required).toEqual(['description', 'affectedCategories']);
    expect(getResponseSchema(legalTextCreate, '201')).toBeDefined();
    expect(getResponseSchema(retentionUpdate, '200')).toBeDefined();
    expect(getResponseSchema(incidentCreate, '201')).toBeDefined();
  });

  it('documenta evidencia e inventario con la envoltura data y sin conteos', () => {
    const paths = document().paths;
    const evidenceOperation = paths['/privacy/requests/{id}/evidence']?.get as
      | SwaggerOperation
      | undefined;
    const evidenceSchema = getResponseSchema(evidenceOperation, '200');
    const evidenceProperties = evidenceSchema?.properties as Record<string, unknown> | undefined;

    expect(evidenceSchema?.required).toEqual(['data']);
    expect(evidenceProperties?.data).toMatchObject({
      type: 'object',
      required: ['url', 'expiresAt'],
    });

    const operation = document().paths['/privacy/inventory']?.get as SwaggerOperation | undefined;
    const schema = getResponseSchema(operation, '200');
    const properties = schema?.properties as Record<string, unknown> | undefined;

    expect(schema?.required).toEqual(['data']);
    expect(schema?.additionalProperties).toBe(false);
    expect(properties?.data).toMatchObject({
      type: 'object',
      required: ['generatedAt', 'databases'],
    });
  });

  it('documenta la vista previa y el cuerpo de supresión sin PII', () => {
    const paths = document().paths;
    const preview = paths['/privacy/requests/{id}/erasure-preview']?.get as
      | SwaggerOperation
      | undefined;
    const previewSchema = getResponseSchema(preview, '200');
    const previewData = (previewSchema?.properties as Record<string, unknown> | undefined)?.data as
      | Record<string, unknown>
      | undefined;
    const previewProperties = previewData?.properties as Record<string, unknown> | undefined;

    expect(previewSchema?.required).toEqual(['data']);
    expect(previewData?.required).toEqual([
      'eligible',
      'blockers',
      'candidateExpedienteIds',
      'counts',
      'categories',
    ]);
    expect(previewProperties?.candidateExpedienteIds).toBeDefined();
    expect(
      (previewProperties?.candidateExpedienteIds as Record<string, unknown> | undefined)?.maxItems,
    ).toBe(500);
    const countsSchema = previewProperties?.counts as Record<string, unknown> | undefined;
    const countsProperties = countsSchema?.properties as Record<string, unknown> | undefined;
    expect(countsSchema?.additionalProperties).toBe(false);
    expect(countsSchema?.required).toEqual([]);
    expect(Object.keys(countsProperties ?? {}).sort()).toEqual(
      [...erasureCategorySchema.options].sort(),
    );
    for (const category of erasureCategorySchema.options) {
      expect(countsProperties?.[category]).toMatchObject({ type: 'integer', minimum: 0 });
    }

    const resolve = paths['/privacy/requests/{id}/resolve']?.post as SwaggerOperation | undefined;
    const resolveBody = getBodySchema(resolve);
    const resolveProperties = resolveBody?.properties as Record<string, unknown> | undefined;

    expect(resolveBody?.required).toEqual(['responseText', 'responseChannel']);
    expect(resolveProperties?.erasure).toBeDefined();
    const erasureProperties = (resolveProperties?.erasure as Record<string, unknown> | undefined)
      ?.properties as Record<string, unknown> | undefined;
    expect(
      (erasureProperties?.expedienteIds as Record<string, unknown> | undefined)?.maxItems,
    ).toBe(500);
    const blockerItems = (previewProperties?.blockers as Record<string, unknown> | undefined)
      ?.items as Record<string, unknown> | undefined;
    expect(blockerItems?.enum).toContain('TOO_MANY_CANDIDATES');
  });
});
