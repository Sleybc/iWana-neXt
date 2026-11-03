import { BadRequestException, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { TenantContext } from '@iwana/db';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { PrivacyRequestsController } from './requests.controller';
import { PrivacyRequestsService } from './requests.service';
import * as tenantQuery from '../ports/privacy-tenant-query';

const requestId = '60000000-0000-4000-8000-000000000001';
const actorId = '60000000-0000-4000-8000-000000000002';
const taskId = '60000000-0000-4000-8000-000000000003';
const manager = { query: jest.fn() };
const auditService = { log: jest.fn(), logWithin: jest.fn() };
let canManage = true;

describe('PrivacyRequestsController HTTP', () => {
  let app: INestApplication;
  const requestsService = {
    getRequesterEvidence: jest.fn().mockResolvedValue({
      url: 'https://storage.invalid/request-evidence',
      expiresAt: '2026-10-14T16:00:00.000Z',
    }),
    completeTask: jest.fn(),
  };

  beforeAll(async () => {
    jest
      .spyOn(tenantQuery, 'withPrivacyTenant')
      .mockImplementation(async (_source, operation) => operation(manager as never));
    jest
      .spyOn(TenantContext, 'getOrThrow')
      .mockReturnValue({ schemaName: 'tenant_http_test' } as never);

    const realRequestsService = new PrivacyRequestsService(
      {} as DataSource,
      {
        getOrThrow: (key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') {
            return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          throw new Error('Clave de prueba no configurada.');
        },
      } as ConfigService,
      auditService as unknown as AuditService,
      { suspendForImpersonation: jest.fn() } as unknown as IContractImpersonationPort,
      { standing: jest.fn() } as unknown as IContractStandingReadPort,
      { findOne: jest.fn() } as unknown as MediaService,
    );
    requestsService.completeTask.mockImplementation(
      (id: string, idForTask: string, note: string, userId: string) =>
        realRequestsService.completeTask(id, idForTask, note, userId),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [PrivacyRequestsController],
      providers: [{ provide: PrivacyRequestsService, useValue: requestsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: actorId,
            type: 'tenant',
            role: 'AUDITOR',
          };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => canManage })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    canManage = true;
    jest.clearAllMocks();
    manager.query.mockReset().mockResolvedValue([]);
  });

  it('devuelve la evidencia dentro de data', async () => {
    const response = await request(app.getHttpServer())
      .get(`/privacy/requests/${requestId}/evidence`)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        url: 'https://storage.invalid/request-evidence',
        expiresAt: '2026-10-14T16:00:00.000Z',
      },
    });
    expect(requestsService.getRequesterEvidence).toHaveBeenCalledWith(requestId, actorId);
  });

  it('CA-DO-02 rechaza nota ausente, excesiva o con saltos y completa una nota válida', async () => {
    const endpoint = `/privacy/requests/${requestId}/tasks/${taskId}/complete`;
    await request(app.getHttpServer()).post(endpoint).send({}).expect(400);
    expect(manager.query).not.toHaveBeenCalled();

    const task = {
      id: taskId,
      kind: 'FORMULAR_DENUNCIA_OPERADOR',
      due_at: '2026-11-11',
      done_at: null,
      done_by: null,
      note: null,
      status: 'RADICADA',
    };
    manager.query.mockResolvedValueOnce([task]);
    await request(app.getHttpServer())
      .post(endpoint)
      .send({ note: 'x'.repeat(121) })
      .expect(400);
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();

    manager.query.mockReset().mockResolvedValueOnce([task]);
    await request(app.getHttpServer()).post(endpoint).send({ note: 'Radicado\n123' }).expect(400);
    expect(manager.query).toHaveBeenCalledTimes(1);

    manager.query
      .mockReset()
      .mockResolvedValueOnce([task])
      .mockResolvedValueOnce([{ id: taskId }])
      .mockResolvedValueOnce([]);
    const response = await request(app.getHttpServer())
      .post(endpoint)
      .send({ note: 'Radicado 123' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: taskId,
      kind: 'FORMULAR_DENUNCIA_OPERADOR',
      note: 'Radicado 123',
    });
    expect(manager.query.mock.calls[2]?.[1]).toEqual([
      requestId,
      'RADICADA',
      actorId,
      'TAREA_COMPLETADA:FORMULAR_DENUNCIA_OPERADOR',
    ]);
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('Radicado 123');
  });

  it('CA-DO-03 devuelve 403 sin privacy.manage', async () => {
    canManage = false;

    await request(app.getHttpServer())
      .post(`/privacy/requests/${requestId}/tasks/${taskId}/complete`)
      .send({ note: 'Radicado 123' })
      .expect(403);

    expect(requestsService.completeTask).not.toHaveBeenCalled();
  });

  it('publica el enum actualizado en la respuesta OpenAPI de completar tareas', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Privacy API').setVersion('1.0').build(),
    );
    const operation = document.paths['/privacy/requests/{id}/tasks/{taskId}/complete']
      ?.post as unknown as Record<string, unknown>;
    const responses = operation['responses'] as Record<string, unknown>;
    const response = responses['200'] as Record<string, unknown>;
    const content = response['content'] as Record<string, unknown>;
    const jsonContent = content['application/json'] as Record<string, unknown>;
    const schema = jsonContent['schema'] as Record<string, unknown>;
    const properties = schema['properties'] as Record<string, unknown>;
    const data = properties['data'] as Record<string, unknown>;
    const dataProperties = data['properties'] as Record<string, unknown>;
    const kind = dataProperties['kind'] as Record<string, unknown>;
    const requestBody = operation['requestBody'] as Record<string, unknown>;
    const bodyContent = requestBody['content'] as Record<string, unknown>;
    const bodyJson = bodyContent['application/json'] as Record<string, unknown>;
    const bodySchema = bodyJson['schema'] as Record<string, unknown>;
    const bodyProperties = bodySchema['properties'] as Record<string, unknown>;
    const note = bodyProperties['note'] as Record<string, unknown>;

    expect(kind['enum']).toEqual([
      'SUSPENDER_COBRO_EXTERNO',
      'ENTREGAR_COPIA_DOCUMENTOS',
      'FORMULAR_DENUNCIA_OPERADOR',
      'COMUNICAR_PLAZO_DENUNCIA',
    ]);
    expect(note).toMatchObject({ type: 'string', minLength: 1, maxLength: 1000 });
    expect(note['description']).toContain('1 a 120 caracteres');
  });
});
