// Spec 2026-11-11 «Contrato activo sin cobros» · CA-4 (403 sin permiso) y contrato HTTP/OpenAPI
// de POST /api/v1/billing/documents/generate-first-charge con los guards reales de rol y permiso.
import { randomUUID } from 'node:crypto';
import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AccessPermissionKey, BillingFirstChargeResultSchema, UserRole } from '@iwana/shared';
import { PERMISSIONS_KEY } from '../../access-control/decorators/permissions.decorator';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { BillingFirstChargeService } from '../generation/billing-first-charge.service';
import { BillingGenerationService } from '../generation/billing-generation.service';
import { BillingDocumentsController } from './billing-documents.controller';
import { BillingDocumentsService } from './billing-documents.service';

jest.mock('./billing-documents.pdf', () => ({
  renderBillingDocumentPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fixture')),
}));

const ROUTE = '/api/v1/billing/documents/generate-first-charge';

describe('POST billing/documents/generate-first-charge (CA-4)', () => {
  let app: INestApplication;
  const contractId = randomUUID();
  const actor = randomUUID();
  let grants: string[] = [];
  const result = BillingFirstChargeResultSchema.parse({
    contractId,
    anchorDate: '2026-10-30',
    anchorSource: 'STATUS_CHANGED_AT',
    installationFee: { outcome: 'FROZEN', amount: '50000.00' },
    fiscalData: { outcome: 'FROZEN', frozenFields: ['DOCUMENT'], missingFields: [] },
    regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    summary: {
      generated: 2,
      failed: 0,
      notDue: 0,
      existing: 0,
      omittedImpersonation: 0,
      omittedTermination: 0,
      blocked: 0,
      withoutCycle: 0,
      unbilledAdditionalDocuments: 0,
    },
  });
  const firstCharge = { generateFirstCharge: jest.fn().mockResolvedValue(result) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingDocumentsController],
      providers: [
        { provide: BillingDocumentsService, useValue: {} },
        { provide: BillingGenerationService, useValue: { generate: jest.fn() } },
        { provide: BillingFirstChargeService, useValue: firstCharge },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: async () => grants },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: ExecutionContext) {
          const req = ctx
            .switchToHttp()
            .getRequest<{ headers: Record<string, string>; user: unknown }>();
          if (!req.headers['x-test-role']) throw new UnauthorizedException();
          req.user = { sub: actor, role: req.headers['x-test-role'], type: 'tenant' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    grants = [
      AccessPermissionKey.BILLING_INVOICES_READ,
      AccessPermissionKey.BILLING_INVOICES_MANAGE,
    ];
  });

  it('exige sesión, rol ADMIN/ACCOUNTANT y billing.invoices.manage', async () => {
    await request(app.getHttpServer()).post(ROUTE).send({ contractId }).expect(401);
    for (const role of [UserRole.SUPPORT, UserRole.SALES, UserRole.AUDITOR]) {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-test-role', role)
        .send({ contractId })
        .expect(403);
    }
    grants = [AccessPermissionKey.BILLING_INVOICES_READ];
    for (const role of [UserRole.ADMIN, UserRole.ACCOUNTANT]) {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-test-role', role)
        .send({ contractId })
        .expect(403);
    }
    expect(firstCharge.generateFirstCharge).not.toHaveBeenCalled();
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        BillingDocumentsController.prototype.generateFirstCharge,
      ),
    ).toEqual([AccessPermissionKey.BILLING_INVOICES_MANAGE]);
  });

  it('valida el cuerpo con Zod y usa el actor del JWT', async () => {
    for (const body of [{}, { contractId: 'no-uuid' }, { contractId, date: '2026-10-30' }]) {
      await request(app.getHttpServer())
        .post(ROUTE)
        .set('x-test-role', UserRole.ADMIN)
        .send(body)
        .expect(400);
    }
    const response = await request(app.getHttpServer())
      .post(ROUTE)
      .set('x-test-role', UserRole.ACCOUNTANT)
      .send({ contractId })
      .expect(200);
    expect(response.body).toEqual({ data: result });
    expect(firstCharge.generateFirstCharge).toHaveBeenCalledWith({ contractId, actorId: actor });
  });

  it('publica la operación en OpenAPI con cuerpo, resultado y errores', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
    const operation = document.paths['/api/v1/billing/documents/generate-first-charge']?.post;
    expect(operation).toBeDefined();
    const body = (
      operation?.requestBody as { content: Record<string, { schema: Record<string, unknown> }> }
    ).content['application/json']?.schema;
    expect(body).toMatchObject({
      required: ['contractId'],
      additionalProperties: false,
      properties: { contractId: { type: 'string', format: 'uuid' } },
    });
    const ok = (
      operation?.responses['200'] as {
        content: Record<string, { schema: { properties: Record<string, unknown> } }>;
      }
    ).content['application/json']?.schema.properties['data'] as {
      required: string[];
      properties: Record<string, { enum?: string[]; nullable?: boolean }>;
    };
    expect(ok.required).toEqual([
      'contractId',
      'anchorDate',
      'anchorSource',
      'installationFee',
      'fiscalData',
      'summary',
      'regularizedDrafts',
    ]);
    expect(ok.properties['anchorSource']?.enum).toEqual([
      'ACTIVATION_EVENT',
      'START_DATE',
      'STATUS_CHANGED_AT',
    ]);
    expect(Object.keys(operation?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404', '409', '422']),
    );
  });
});
