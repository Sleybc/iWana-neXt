import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import {
  AccessPermissionKey,
  BILLING_COURTESY_REASONS,
  BillingCourtesyResponseSchema,
  UserRole,
} from '@iwana/shared';
import { PERMISSIONS_KEY } from '../../access-control/decorators/permissions.decorator';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  BillingCourtesiesController,
  COURTESY_RESPONSE_SCHEMA,
} from './billing-courtesies.controller';
import { BillingCourtesiesService } from './billing-courtesies.service';

describe('OpenAPI de cortesías (contrato spec MOD14 2026-11-12)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingCourtesiesController],
      providers: [{ provide: BillingCourtesiesService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('publica los dos endpoints con 201/200 y los errores del contrato', () => {
    const grant = document.paths['/api/v1/billing/documents/{id}/courtesies']?.post;
    const voidOp = document.paths['/api/v1/billing/courtesies/{id}/void']?.post;
    expect(Object.keys(grant?.responses ?? {}).sort()).toEqual(
      ['201', '400', '401', '403', '404', '409', '422'].sort(),
    );
    expect(Object.keys(voidOp?.responses ?? {}).sort()).toEqual(
      ['200', '400', '401', '403', '404', '409', '422'].sort(),
    );
    // Idempotencia como el registro de pagos: cabecera obligatoria en ambos.
    for (const operation of [grant, voidOp]) {
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
        ]),
      );
    }
    const body = (grant?.requestBody as { content: Record<string, { schema: unknown }> }).content[
      'application/json'
    ]?.schema as { properties: Record<string, { enum?: string[] }>; required: string[] };
    expect(body.required).toEqual(['target', 'reasonCode']);
    expect(body.properties['reasonCode']?.enum).toEqual([...BILLING_COURTESY_REASONS]);
  });

  it('el esquema de respuesta coincide campo a campo con el Zod de @iwana/shared', () => {
    expect([...COURTESY_RESPONSE_SCHEMA.required].sort()).toEqual(
      Object.keys(BillingCourtesyResponseSchema.shape).sort(),
    );
    expect(Object.keys(COURTESY_RESPONSE_SCHEMA.properties).sort()).toEqual(
      Object.keys(BillingCourtesyResponseSchema.shape).sort(),
    );
  });

  it.each(['grant', 'void'] as const)(
    '%s exige ADMIN/ACCOUNTANT y billing.courtesies.manage',
    (m) => {
      const handler = BillingCourtesiesController.prototype[m];
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        UserRole.ADMIN,
        UserRole.ACCOUNTANT,
      ]);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
        AccessPermissionKey.BILLING_COURTESIES_MANAGE,
      ]);
    },
  );
});
