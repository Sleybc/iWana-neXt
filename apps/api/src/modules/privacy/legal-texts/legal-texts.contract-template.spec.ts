import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, LEGAL_APPROVAL_DECLARATION, UserRole } from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import * as tenantQuery from '../ports/privacy-tenant-query';
import { LegalTextsController } from './legal-texts.controller';
import { LegalTextsService } from './legal-texts.service';

const PUBLISHER_ID = '76000000-0000-4000-8000-000000000002';
const HTML =
  '<!DOCTYPE html><html><body><p>Contrato sintético {{contratoNumero}}</p></body></html>';

function serviceWithRepository() {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: '10000000-0000-4000-8000-000000000001' })),
  };
  const manager = { getRepository: jest.fn(() => repository) };
  jest
    .spyOn(tenantQuery, 'withPrivacyTenant')
    .mockImplementation(async (_source, operation) => operation(manager as never));
  const audit = { log: jest.fn() };
  return { service: new LegalTextsService({} as never, audit as never), repository, audit };
}

const contract = {
  type: 'CONTRATO_SERVICIO' as const,
  version: '1.0',
  content: HTML,
  format: 'HTML' as const,
};

describe('LegalTextsService — plantilla de contrato (bloque A, G2)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('publica con la declaración, el usuario del JWT y la fecha del servidor', async () => {
    const { service, repository, audit } = serviceWithRepository();
    const before = Date.now();

    const saved = await service.create(
      { ...contract, legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION },
      { userId: PUBLISHER_ID },
    );

    const row = repository.create.mock.calls[0]?.[0] as { approvedAt: Date };
    expect(row).toMatchObject({
      type: 'CONTRATO_SERVICIO',
      format: 'HTML',
      legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION,
      approvedByUserId: PUBLISHER_ID,
    });
    expect(row.approvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.legalApproval).toEqual({
      declaration: LEGAL_APPROVAL_DECLARATION,
      approvedByUserId: PUBLISHER_ID,
      approvedAt: row.approvedAt.toISOString(),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PUBLISHER_ID,
        newValue: expect.objectContaining({ legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION }),
      }),
    );
  });

  it('rechaza publicar el contrato sin declaración o sin quien publica', async () => {
    const { service, repository } = serviceWithRepository();

    await expect(service.create(contract, { userId: PUBLISHER_ID })).rejects.toMatchObject({
      status: 400,
      response: { code: 'PRIVACY_LEGAL_TEXT_APPROVAL_REQUIRED' },
    });
    await expect(
      service.create({ ...contract, legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    ['script', '<p>x</p><script>alert(1)</script>'],
    ['manejador de evento', '<img src="x" onerror="alert(1)">'],
    ['javascript:', '<a href="javascript:alert(1)">x</a>'],
    ['iframe', '<iframe src="https://example.invalid"></iframe>'],
  ])('rechaza HTML activo (%s)', async (_label, content) => {
    const { service, repository } = serviceWithRepository();
    await expect(
      service.create(
        { ...contract, content, legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION },
        { userId: PUBLISHER_ID },
      ),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_LEGAL_TEXT_UNSAFE_HTML' } });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('los tipos anteriores se publican igual que antes, sin aprobación', async () => {
    const { service, repository } = serviceWithRepository();
    const saved = await service.create(
      { type: 'AUTORIZACION', version: '9', content: 'Texto', format: 'PLAIN' },
      { userId: PUBLISHER_ID },
    );
    expect(repository.create.mock.calls[0]?.[0]).toMatchObject({
      legalApprovalDeclaration: null,
      approvedByUserId: null,
      approvedAt: null,
    });
    expect(saved).not.toHaveProperty('legalApproval');
  });
});

describe('POST /privacy/legal-texts — plantilla de contrato por HTTP', () => {
  let app: INestApplication;
  const service = { create: jest.fn(), list: jest.fn(), getCurrent: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LegalTextsController],
      providers: [
        { provide: LegalTextsService, useValue: service },
        {
          provide: EffectivePermissionsService,
          useValue: {
            getEffectivePermissionsForUser: jest
              .fn()
              .mockResolvedValue([
                AccessPermissionKey.PRIVACY_READ,
                AccessPermissionKey.PRIVACY_MANAGE,
              ]),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = {
            sub: PUBLISHER_ID,
            type: 'tenant',
            role: UserRole.ADMIN,
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('400 sin la declaración de aprobación jurídica', async () => {
    await request(app.getHttpServer()).post('/privacy/legal-texts').send(contract).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('400 si el cuerpo intenta fijar quién aprobó o cuándo', async () => {
    await request(app.getHttpServer())
      .post('/privacy/legal-texts')
      .send({
        ...contract,
        legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION,
        approvedByUserId: '76000000-0000-4000-8000-000000000099',
      })
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('201 con la declaración; quien publica sale del JWT', async () => {
    service.create.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
      ...contract,
      sha256: 'a'.repeat(64),
      publishedAt: '2026-11-11T12:00:00.000Z',
      url: null,
      isCurrent: true,
      legalApproval: {
        declaration: LEGAL_APPROVAL_DECLARATION,
        approvedByUserId: PUBLISHER_ID,
        approvedAt: '2026-11-11T12:00:00.000Z',
      },
    });
    const response = await request(app.getHttpServer())
      .post('/privacy/legal-texts')
      .send({ ...contract, legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ legalApprovalDeclaration: LEGAL_APPROVAL_DECLARATION }),
      { userId: PUBLISHER_ID },
    );
    expect(response.body.data.legalApproval.approvedByUserId).toBe(PUBLISHER_ID);
  });

  it('400 si se intenta publicar HTML en un tipo que no es el contrato', async () => {
    await request(app.getHttpServer())
      .post('/privacy/legal-texts')
      .send({ type: 'AUTORIZACION', version: '3', content: '<p>x</p>', format: 'HTML' })
      .expect(400);
  });
});
