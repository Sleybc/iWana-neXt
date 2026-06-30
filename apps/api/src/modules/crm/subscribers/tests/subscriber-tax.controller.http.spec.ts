import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  TaxAssignmentStatus,
  TaxAssignmentRateSource,
  TaxProfileStatus,
  TaxTreatment,
  UserRole,
} from '@iwana/shared';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { SubscriberTaxController } from '../subscriber-tax.controller';
import { SubscriberTaxProfileService } from '../subscriber-tax-profile.service';

/**
 * Tests HTTP del SubscriberTaxController.
 * Se mockean los guards y el servicio para probar contratos HTTP,
 * validación de UUID y manejo de errores del controlador.
 */

const VALID_SUBSCRIBER_ID = '00000000-0000-0000-0000-000000000001';
const VALID_ASSIGNMENT_ID = '00000000-0000-0000-0000-000000000002';
const INVALID_UUID = 'not-a-uuid';

// Snapshot de perfil tributario de prueba
const mockProfile = {
  id: 'profile-001',
  subscriberId: VALID_SUBSCRIBER_ID,
  profileStatus: TaxProfileStatus.PENDING_REVIEW,
  assignments: [
    {
      id: 'assign-001',
      taxDefinitionId: 'taxdef-iva-001',
      taxDefinitionCode: 'IVA_19',
      taxDefinitionName: 'IVA 19%',
      status: TaxAssignmentStatus.SUGGESTED,
      treatment: TaxTreatment.STANDARD,
      rateSource: TaxAssignmentRateSource.CATALOG,
      appliedRate: 19,
      manualRate: null,
      updatedBy: null,
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:00:00.000Z',
    },
  ],
  createdAt: '2026-04-22T00:00:00.000Z',
  updatedAt: '2026-04-22T00:00:00.000Z',
};

describe('SubscriberTaxController (HTTP)', () => {
  let app: INestApplication;

  const serviceMock = {
    getOrCreateProfile: jest.fn(),
    saveAssignments: jest.fn(),
    updateAssignment: jest.fn(),
    suggestVatForSubscriber: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SubscriberTaxController],
      providers: [{ provide: SubscriberTaxProfileService, useValue: serviceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          // Inyectar usuario de prueba para que req.user.sub esté disponible en el controlador
          const req = context.switchToHttp().getRequest();
          req['user'] = {
            sub: 'user-test-001',
            role: UserRole.ADMIN,
            tenantId: 'tenant-test',
            schemaName: 'tenant_test',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /crm/subscribers/:subscriberId/tax-profile ────────────────────────────

  describe('GET /crm/subscribers/:subscriberId/tax-profile', () => {
    it('retorna 200 con el perfil tributario cuando el servicio resuelve', async () => {
      serviceMock.getOrCreateProfile.mockResolvedValue(mockProfile);

      await request(app.getHttpServer())
        .get(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe('profile-001');
          expect(body.data.subscriberId).toBe(VALID_SUBSCRIBER_ID);
          expect(body.data.profileStatus).toBe(TaxProfileStatus.PENDING_REVIEW);
          expect(body.data.assignments).toHaveLength(1);
          expect(body.data.assignments[0].status).toBe(TaxAssignmentStatus.SUGGESTED);
        });

      expect(serviceMock.getOrCreateProfile).toHaveBeenCalledWith(VALID_SUBSCRIBER_ID);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      serviceMock.getOrCreateProfile.mockRejectedValue(
        new NotFoundException(`Suscriptor ${VALID_SUBSCRIBER_ID} no encontrado.`),
      );

      await request(app.getHttpServer())
        .get(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile`)
        .expect(404);
    });

    it('retorna 400 para un subscriberId con UUID inválido', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/crm/subscribers/${INVALID_UUID}/tax-profile`)
        .expect(400);

      expect(serviceMock.getOrCreateProfile).not.toHaveBeenCalled();
    });
  });

  // ─── PUT /crm/subscribers/:subscriberId/tax-profile/assignments ───────────────

  describe('PUT /crm/subscribers/:subscriberId/tax-profile/assignments', () => {
    const validAssignment = {
      taxDefinitionId: '00000000-0000-0000-0000-000000000001',
      status: TaxAssignmentStatus.CONFIRMED,
      treatment: TaxTreatment.STANDARD,
      rateSource: TaxAssignmentRateSource.CATALOG,
    };

    it('retorna 200 con el perfil actualizado cuando el servicio resuelve', async () => {
      serviceMock.saveAssignments.mockResolvedValue(mockProfile);

      await request(app.getHttpServer())
        .put(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/assignments`)
        .send({ assignments: [validAssignment] })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe('profile-001');
          expect(body.data.assignments).toHaveLength(1);
        });

      // Verificar que el servicio fue invocado con el subscriber y usuario correctos.
      // Los items del array pueden transformarse por class-transformer (sin @Type en DTO).
      expect(serviceMock.saveAssignments).toHaveBeenCalledWith(
        VALID_SUBSCRIBER_ID,
        expect.any(Array),
        'user-test-001',
      );
    });

    it('retorna 200 con lista de asignaciones vacía', async () => {
      serviceMock.saveAssignments.mockResolvedValue({ ...mockProfile, assignments: [] });

      await request(app.getHttpServer())
        .put(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/assignments`)
        .send({ assignments: [] })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.assignments).toEqual([]);
        });
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      serviceMock.saveAssignments.mockRejectedValue(
        new NotFoundException(`Suscriptor ${VALID_SUBSCRIBER_ID} no encontrado.`),
      );

      await request(app.getHttpServer())
        .put(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/assignments`)
        .send({ assignments: [] })
        .expect(404);
    });

    it('retorna 400 para un subscriberId con UUID inválido', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/crm/subscribers/${INVALID_UUID}/tax-profile/assignments`)
        .send({ assignments: [] })
        .expect(400);

      expect(serviceMock.saveAssignments).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /crm/subscribers/:subscriberId/tax-profile/assignments/:assignmentId ─

  describe('PATCH /crm/subscribers/:subscriberId/tax-profile/assignments/:assignmentId', () => {
    const patchBody = {
      status: TaxAssignmentStatus.CONFIRMED,
      treatment: TaxTreatment.STANDARD,
      rateSource: TaxAssignmentRateSource.CATALOG,
    };

    it('retorna 200 con el perfil actualizado', async () => {
      serviceMock.updateAssignment.mockResolvedValue(mockProfile);

      await request(app.getHttpServer())
        .patch(
          `/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/assignments/${VALID_ASSIGNMENT_ID}`,
        )
        .send(patchBody)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe('profile-001');
        });

      expect(serviceMock.updateAssignment).toHaveBeenCalledWith(
        VALID_SUBSCRIBER_ID,
        VALID_ASSIGNMENT_ID,
        patchBody,
        'user-test-001',
      );
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      serviceMock.updateAssignment.mockRejectedValue(
        new NotFoundException(`Asignación ${VALID_ASSIGNMENT_ID} no encontrada.`),
      );

      await request(app.getHttpServer())
        .patch(
          `/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/assignments/${VALID_ASSIGNMENT_ID}`,
        )
        .send(patchBody)
        .expect(404);
    });

    it('retorna 400 para un assignmentId con UUID inválido', async () => {
      await request(app.getHttpServer())
        .patch(
          `/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/assignments/${INVALID_UUID}`,
        )
        .send(patchBody)
        .expect(400);

      expect(serviceMock.updateAssignment).not.toHaveBeenCalled();
    });

    it('retorna 400 para un subscriberId con UUID inválido', async () => {
      await request(app.getHttpServer())
        .patch(
          `/api/v1/crm/subscribers/${INVALID_UUID}/tax-profile/assignments/${VALID_ASSIGNMENT_ID}`,
        )
        .send(patchBody)
        .expect(400);

      expect(serviceMock.updateAssignment).not.toHaveBeenCalled();
    });
  });

  // ─── POST /crm/subscribers/:subscriberId/tax-profile/suggest-vat ─────────────

  describe('POST /crm/subscribers/:subscriberId/tax-profile/suggest-vat', () => {
    it('retorna 200 con el perfil actualizado tras recalcular IVA', async () => {
      serviceMock.suggestVatForSubscriber.mockResolvedValue(mockProfile);

      await request(app.getHttpServer())
        .post(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/suggest-vat`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe('profile-001');
          expect(body.data.profileStatus).toBe(TaxProfileStatus.PENDING_REVIEW);
        });

      expect(serviceMock.suggestVatForSubscriber).toHaveBeenCalledWith(VALID_SUBSCRIBER_ID);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      serviceMock.suggestVatForSubscriber.mockRejectedValue(
        new NotFoundException(`Suscriptor ${VALID_SUBSCRIBER_ID} no encontrado.`),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/crm/subscribers/${VALID_SUBSCRIBER_ID}/tax-profile/suggest-vat`)
        .expect(404);
    });
  });
});
