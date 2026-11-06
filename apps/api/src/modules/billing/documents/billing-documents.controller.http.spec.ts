import { randomUUID } from 'node:crypto';
import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { BillingDocumentsController } from './billing-documents.controller';
import { BillingDocumentsService } from './billing-documents.service';
import { BillingGenerationService } from '../generation/billing-generation.service';

jest.mock('./billing-documents.pdf', () => ({
  renderBillingDocumentPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fixture')),
}));
describe('BR-2.13 HTTP documentos CA-FAC-11', () => {
  let app: INestApplication;
  const id = randomUUID(),
    actor = randomUUID();
  let grants: string[] = [];
  const documents = {
    list: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    findOne: jest.fn().mockResolvedValue({ id, status: 'EMITIDO' }),
    issue: jest.fn().mockResolvedValue([{ id }]),
    void: jest.fn(),
    discard: jest.fn(),
    pdfDocument: jest.fn().mockResolvedValue({ id, status: 'EMITIDO', number: 'DC-000001' }),
  };
  const generation = { generate: jest.fn().mockResolvedValue({ generated: 1, failed: 0 }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingDocumentsController],
      providers: [
        { provide: BillingDocumentsService, useValue: documents },
        { provide: BillingGenerationService, useValue: generation },
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
  it('requiere autenticación y permiso; lectura no concede escritura', async () => {
    await request(app.getHttpServer()).get('/api/v1/billing/documents').expect(401);
    grants = [];
    await request(app.getHttpServer())
      .get('/api/v1/billing/documents')
      .set('x-test-role', UserRole.ADMIN)
      .expect(403);
    grants = [AccessPermissionKey.BILLING_INVOICES_READ];
    await request(app.getHttpServer())
      .post('/api/v1/billing/documents/generate')
      .set('x-test-role', UserRole.ACCOUNTANT)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/billing/documents/generate')
      .set('x-test-role', UserRole.SUPPORT)
      .send({})
      .expect(403);
    expect(generation.generate).not.toHaveBeenCalled();
  });
  it('lista, detalle y PDF usan actor autenticado y validan identificadores', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/billing/documents?page=1&limit=25&status=EMITIDO')
      .set('x-test-role', UserRole.SUPPORT)
      .expect(200);
    expect(documents.list).toHaveBeenCalledWith({ page: 1, limit: 25, status: 'EMITIDO' }, actor);
    await request(app.getHttpServer())
      .get('/api/v1/billing/documents?limit=101')
      .set('x-test-role', UserRole.ADMIN)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/billing/documents/not-a-uuid')
      .set('x-test-role', UserRole.ADMIN)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/billing/documents/${id}`)
      .set('x-test-role', UserRole.SALES)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/billing/documents/${id}/pdf`)
      .set('x-test-role', UserRole.AUDITOR)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
    documents.pdfDocument.mockResolvedValueOnce({ id, status: 'BORRADOR', number: 'DC-000001' });
    await request(app.getHttpServer())
      .get(`/api/v1/billing/documents/${id}/pdf`)
      .set('x-test-role', UserRole.ADMIN)
      .expect(409);
  });
  it('genera, emite, anula y descarta con validación Zod y actor del JWT', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/billing/documents/generate')
      .set('x-test-role', UserRole.ADMIN)
      .send({ contractId: id, date: '2026-11-05' })
      .expect(200);
    expect(generation.generate).toHaveBeenCalledWith({
      contractId: id,
      date: '2026-11-05',
      actorId: actor,
    });
    await request(app.getHttpServer())
      .post('/api/v1/billing/documents/issue')
      .set('x-test-role', UserRole.ACCOUNTANT)
      .send({ documentIds: [id] })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/billing/documents/issue')
      .set('x-test-role', UserRole.ADMIN)
      .send({ documentIds: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/billing/documents/${id}/void`)
      .set('x-test-role', UserRole.ADMIN)
      .send({ reasonCode: 'ERROR_DE_VALOR' })
      .expect(200);
    expect(documents.void).toHaveBeenCalledWith(id, 'ERROR_DE_VALOR', undefined, actor);
    await request(app.getHttpServer())
      .delete(`/api/v1/billing/documents/${id}`)
      .set('x-test-role', UserRole.ADMIN)
      .expect(204);
    expect(documents.discard).toHaveBeenCalledWith(id, actor);
  });
});
