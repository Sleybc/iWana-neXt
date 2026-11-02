import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { EffectivePermissionsService } from '../../../access-control/services/effective-permissions.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { SubscriberTaxController } from '../subscriber-tax.controller';
import { SubscriberTaxProfileService } from '../subscriber-tax-profile.service';
import { SubscribersService } from '../subscribers.service';

describe('SubscriberTaxController: permisos efectivos y titular bloqueado', () => {
  let app: INestApplication;
  let grants: string[] = [];
  let blocked = false;
  const subscriberId = '00000000-0000-4000-8000-000000000001';
  const base = `/crm/subscribers/${subscriberId}/tax-profile`;
  const service = {
    getOrCreateProfile: jest.fn().mockResolvedValue({}),
    saveAssignments: jest.fn().mockResolvedValue({}),
    updateAssignment: jest.fn().mockResolvedValue({}),
    suggestVatForSubscriber: jest.fn().mockResolvedValue({}),
    confirmProfile: jest.fn().mockResolvedValue({}),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SubscriberTaxController],
      providers: [
        { provide: SubscriberTaxProfileService, useValue: service },
        {
          provide: EffectivePermissionsService,
          useValue: {
            getEffectivePermissionsForUser: async () => grants,
          },
        },
        {
          provide: SubscribersService,
          useValue: {
            findById: async () => ({ partyId: 'party-synthetic', anonymizedAt: null }),
          },
        },
        {
          provide: IPrivacyMarksReadPort,
          useValue: {
            activeMarks: async () => ({ 'party-synthetic': blocked ? ['DATOS_BLOQUEADOS'] : [] }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: import('@nestjs/common').ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ user: unknown }>().user = {
            sub: 'actor-synthetic',
            role: UserRole.ACCOUNTANT,
            type: 'tenant',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    grants = [];
    blocked = false;
    jest.clearAllMocks();
  });
  it.each([
    ['get', '', AccessPermissionKey.CRM_SUBSCRIBERS_READ],
    ['put', '/assignments', AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE],
    [
      'patch',
      '/assignments/00000000-0000-4000-8000-000000000002',
      AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE,
    ],
    ['post', '/suggest-vat', AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE],
    ['post', '/confirm', AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE],
  ] as const)(
    '%s %s rechaza sin permiso y admite la clave correspondiente',
    async (method, path, permission) => {
      const invoke = () =>
        request(app.getHttpServer())
          [method](base + path)
          .send({ assignments: [] });
      await invoke().expect(403);
      grants = [permission];
      await invoke().expect(200);
    },
  );
  it('confirm rechaza titular bloqueado antes de llamar al servicio', async () => {
    grants = [AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE];
    blocked = true;
    const response = await request(app.getHttpServer())
      .post(base + '/confirm')
      .expect(409);
    expect(response.body.code).toBe('PRIVACY_DATA_BLOCKED');
    expect(service.confirmProfile).not.toHaveBeenCalled();
  });
  it.each([
    ['put', '/assignments'],
    ['patch', '/assignments/00000000-0000-4000-8000-000000000002'],
    ['post', '/suggest-vat'],
    ['post', '/confirm'],
  ] as const)('%s %s rechaza READ sin MANAGE antes de mutar', async (method, path) => {
    grants = [AccessPermissionKey.CRM_SUBSCRIBERS_READ];
    await request(app.getHttpServer())
      [method](base + path)
      .send({ assignments: [] })
      .expect(403);
    expect(service.saveAssignments).not.toHaveBeenCalled();
    expect(service.updateAssignment).not.toHaveBeenCalled();
    expect(service.suggestVatForSubscriber).not.toHaveBeenCalled();
    expect(service.confirmProfile).not.toHaveBeenCalled();
  });
});
