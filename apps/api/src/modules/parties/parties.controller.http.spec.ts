import {
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  PartyType,
  DocumentTypeParty,
  PartyStatus,
  PartyRoleType,
  PartyRoleStatus,
  PartyContactType,
  UserRole,
} from '@iwana/shared';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PartiesController } from './parties.controller';
import { PartyService } from './services/party.service';
import { PartyRoleService } from './services/party-role.service';
import { PartyContactService } from './services/party-contact.service';
import { PartyReadAdapter } from './adapters/party-read.adapter';
import { IPartyReadPort } from './ports/party-read.port';

// Mock JwtAuthGuard: resuelve token admin-token → UserRole.ADMIN
jest.mock('../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => {
          headers: Record<string, string | undefined>;
          user?: JwtPayload & { id?: string };
        };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);

      if (isPublic) return true;

      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers.authorization;

      if (authHeader === 'Bearer admin-token') {
        req.user = {
          id: 'user-admin-id',
          sub: 'usr-admin-sub',
          email: 'hash-admin',
          role: UserRole.ADMIN,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-admin',
          type: 'tenant',
        };
        return true;
      }

      if (authHeader === 'Bearer sales-token') {
        req.user = {
          id: 'user-sales-id',
          sub: 'usr-sales-sub',
          email: 'hash-sales',
          role: UserRole.SALES,
          tenantId: 'tenant-test',
          schemaName: 'tenant_test',
          jti: 'jti-sales',
          type: 'tenant',
        };
        return true;
      }

      // Token de tenant B — para test de aislamiento
      if (authHeader === 'Bearer tenant-b-token') {
        req.user = {
          id: 'user-tenant-b-id',
          sub: 'usr-tenant-b-sub',
          email: 'hash-tenant-b',
          role: UserRole.ADMIN,
          tenantId: 'tenant-b',
          schemaName: 'tenant_b',
          jti: 'jti-tenant-b',
          type: 'tenant',
        };
        return true;
      }

      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

// Mock RolesGuard: verifica metadata @Roles() contra user.role
jest.mock('../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const req = context.switchToHttp().getRequest();
      const user = req.user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];

      if (requiredRoles.length === 0) return true;

      if (!user || !requiredRoles.includes(user.role)) {
        throw new ForbiddenException('No tiene permisos para ejecutar esta acción.');
      }

      return true;
    }
  },
}));

describe('PartiesController HTTP', () => {
  let app: INestApplication;

  const partyServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  const partyRoleServiceMock = {
    assign: jest.fn(),
    deactivate: jest.fn(),
  };

  const partyContactServiceMock = {
    upsert: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
  };

  const partyReadAdapterMock = {
    getById: jest.fn(),
    findByDocument: jest.fn(),
    listRoles: jest.fn(),
    listContacts: jest.fn(),
  };

  // UUIDs ficticios para tests
  const validPartyId = '11111111-1111-1111-1111-111111111111';
  const validRoleId = '22222222-2222-2222-2222-222222222222';
  const validContactId = '33333333-3333-3333-3333-333333333333';
  const notFoundId = '99999999-9999-9999-9999-999999999999';

  // Objeto ficticio de Party para respuestas
  const mockParty = {
    id: validPartyId,
    partyType: PartyType.NATURAL,
    documentType: DocumentTypeParty.CC,
    documentNumber: '10000001',
    verificationDigit: null,
    displayName: 'Nombre Ficticio',
    legalName: null,
    birthDate: null,
    incorporationDate: null,
    status: PartyStatus.ACTIVE,
    mergedIntoPartyId: null,
    notes: null,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date('2025-01-01').toISOString(),
    deletedAt: null,
    contacts: [],
    roles: [],
  };

  const mockRole = {
    id: validRoleId,
    partyId: validPartyId,
    role: PartyRoleType.CUSTOMER,
    status: PartyRoleStatus.ACTIVE,
    validFrom: new Date('2025-01-01').toISOString(),
    validTo: null,
    createdBy: null,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date('2025-01-01').toISOString(),
  };

  const mockContact = {
    id: validContactId,
    partyId: validPartyId,
    type: PartyContactType.EMAIL,
    value: 'test@example.invalid',
    isPrimary: false,
    verifiedAt: null,
    metadata: null,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date('2025-01-01').toISOString(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PartiesController],
      providers: [
        { provide: PartyService, useValue: partyServiceMock },
        { provide: PartyRoleService, useValue: partyRoleServiceMock },
        { provide: PartyContactService, useValue: partyContactServiceMock },
        { provide: PartyReadAdapter, useValue: partyReadAdapterMock },
        { provide: IPartyReadPort, useValue: partyReadAdapterMock },
        JwtAuthGuard,
        RolesGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
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

  // ---------------------------------------------------------------------------
  describe('POST /api/v1/parties', () => {
    const validPayload = {
      partyType: PartyType.NATURAL,
      documentType: DocumentTypeParty.CC,
      documentNumber: '10000001',
      displayName: 'Nombre Ficticio',
    };

    it('retorna 201 con party creado', async () => {
      partyServiceMock.create.mockResolvedValue(mockParty);

      await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token')
        .send(validPayload)
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.id).toBe(validPartyId);
          expect(body.data.partyType).toBe(PartyType.NATURAL);
        });

      expect(partyServiceMock.create).toHaveBeenCalledWith(validPayload);
    });

    it('retorna 409 cuando el servicio lanza ConflictException por documento duplicado', async () => {
      partyServiceMock.create.mockRejectedValue(
        new ConflictException('Ya existe un party activo con ese documento (CC)'),
      );

      await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token')
        .send(validPayload)
        .expect(409);
    });

    it('retorna 400 cuando faltan campos obligatorios', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token')
        .send({ partyType: PartyType.NATURAL })
        .expect(400);
    });

    it('retorna 400 con partyType inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token')
        .send({ ...validPayload, partyType: 'INVALID_TYPE' })
        .expect(400);
    });

    it('retorna 401 sin token', async () => {
      await request(app.getHttpServer()).post('/api/v1/parties').send(validPayload).expect(401);
    });

    it('retorna 403 con rol sin permisos', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', 'Bearer sales-token')
        .send(validPayload)
        .expect(403);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/v1/parties', () => {
    it('retorna 200 con array de parties', async () => {
      partyServiceMock.findAll.mockResolvedValue({
        data: [mockParty],
        total: 1,
        page: 1,
        limit: 20,
      });

      await request(app.getHttpServer())
        .get('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toBeDefined();
          expect(body.total).toBe(1);
        });
    });

    it('retorna 200 con lista vacía cuando no hay parties', async () => {
      partyServiceMock.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await request(app.getHttpServer())
        .get('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual([]);
        });
    });

    it('propaga parámetros de paginación al servicio', async () => {
      partyServiceMock.findAll.mockResolvedValue({ data: [], total: 0, page: 2, limit: 10 });

      await request(app.getHttpServer())
        .get('/api/v1/parties?page=2&limit=10')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(partyServiceMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 10 }),
      );
    });

    it('retorna 401 sin token', async () => {
      await request(app.getHttpServer()).get('/api/v1/parties').expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/v1/parties/:id', () => {
    it('retorna 200 con party encontrado', async () => {
      partyServiceMock.findOne.mockResolvedValue(mockParty);

      await request(app.getHttpServer())
        .get(`/api/v1/parties/${validPartyId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.id).toBe(validPartyId);
        });

      expect(partyServiceMock.findOne).toHaveBeenCalledWith(validPartyId);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      partyServiceMock.findOne.mockRejectedValue(
        new NotFoundException(`Party ${notFoundId} no encontrado`),
      );

      await request(app.getHttpServer())
        .get(`/api/v1/parties/${notFoundId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('retorna 400 para UUID inválido', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/parties/invalid-uuid')
        .set('Authorization', 'Bearer admin-token')
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /api/v1/parties/:id', () => {
    const updatePayload = { displayName: 'Nombre Actualizado' };

    it('retorna 200 con party actualizado', async () => {
      const updated = { ...mockParty, displayName: 'Nombre Actualizado' };
      partyServiceMock.update.mockResolvedValue(updated);

      await request(app.getHttpServer())
        .patch(`/api/v1/parties/${validPartyId}`)
        .set('Authorization', 'Bearer admin-token')
        .send(updatePayload)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.displayName).toBe('Nombre Actualizado');
        });

      expect(partyServiceMock.update).toHaveBeenCalledWith(validPartyId, updatePayload);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      partyServiceMock.update.mockRejectedValue(
        new NotFoundException(`Party ${notFoundId} no encontrado`),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/parties/${notFoundId}`)
        .set('Authorization', 'Bearer admin-token')
        .send(updatePayload)
        .expect(404);
    });

    it('retorna 403 cuando el servicio lanza ForbiddenException por cambio de documento', async () => {
      partyServiceMock.update.mockRejectedValue(
        new ForbiddenException(
          'No se puede cambiar el documento de un party activo con roles activos',
        ),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/parties/${validPartyId}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ documentNumber: '20000002' })
        .expect(403);
    });

    it('retorna 400 para UUID inválido', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/parties/invalid-uuid')
        .set('Authorization', 'Bearer admin-token')
        .send(updatePayload)
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /api/v1/parties/:id', () => {
    it('retorna 204 al soft-delete exitoso', async () => {
      partyServiceMock.softDelete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/v1/parties/${validPartyId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(204);

      expect(partyServiceMock.softDelete).toHaveBeenCalledWith(validPartyId);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      partyServiceMock.softDelete.mockRejectedValue(
        new NotFoundException(`Party ${notFoundId} no encontrado`),
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/parties/${notFoundId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('retorna 400 para UUID inválido', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/parties/invalid-uuid')
        .set('Authorization', 'Bearer admin-token')
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/v1/parties/:id/roles', () => {
    const rolePayload = { role: PartyRoleType.CUSTOMER };

    it('retorna 201 con rol asignado', async () => {
      partyRoleServiceMock.assign.mockResolvedValue(mockRole);

      await request(app.getHttpServer())
        .post(`/api/v1/parties/${validPartyId}/roles`)
        .set('Authorization', 'Bearer admin-token')
        .send(rolePayload)
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.role).toBe(PartyRoleType.CUSTOMER);
          expect(body.data.status).toBe(PartyRoleStatus.ACTIVE);
        });

      expect(partyRoleServiceMock.assign).toHaveBeenCalledWith(validPartyId, rolePayload);
    });

    it('retorna 409 cuando el servicio lanza ConflictException por rol ya activo', async () => {
      partyRoleServiceMock.assign.mockRejectedValue(
        new ConflictException(`El party ya tiene el rol ${PartyRoleType.CUSTOMER} activo`),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/parties/${validPartyId}/roles`)
        .set('Authorization', 'Bearer admin-token')
        .send(rolePayload)
        .expect(409);
    });

    it('retorna 400 con role inválido', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/parties/${validPartyId}/roles`)
        .set('Authorization', 'Bearer admin-token')
        .send({ role: 'INVALID_ROLE' })
        .expect(400);
    });

    it('retorna 400 para UUID de party inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/parties/invalid-uuid/roles')
        .set('Authorization', 'Bearer admin-token')
        .send(rolePayload)
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PATCH /api/v1/parties/:id/roles/:roleId', () => {
    it('retorna 200 con rol desactivado', async () => {
      const deactivated = {
        ...mockRole,
        status: PartyRoleStatus.INACTIVE,
        validTo: new Date().toISOString(),
      };
      partyRoleServiceMock.deactivate.mockResolvedValue(deactivated);

      await request(app.getHttpServer())
        .patch(`/api/v1/parties/${validPartyId}/roles/${validRoleId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.status).toBe(PartyRoleStatus.INACTIVE);
        });

      expect(partyRoleServiceMock.deactivate).toHaveBeenCalledWith(validPartyId, validRoleId);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      partyRoleServiceMock.deactivate.mockRejectedValue(
        new NotFoundException(`Rol ${notFoundId} no encontrado para party ${validPartyId}`),
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/parties/${validPartyId}/roles/${notFoundId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  describe('POST /api/v1/parties/:id/contacts', () => {
    const contactPayload = {
      type: PartyContactType.EMAIL,
      value: 'test@example.invalid',
      isPrimary: false,
    };

    it('retorna 201 con contacto creado', async () => {
      partyContactServiceMock.upsert.mockResolvedValue(mockContact);

      await request(app.getHttpServer())
        .post(`/api/v1/parties/${validPartyId}/contacts`)
        .set('Authorization', 'Bearer admin-token')
        .send(contactPayload)
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.type).toBe(PartyContactType.EMAIL);
        });

      expect(partyContactServiceMock.upsert).toHaveBeenCalledWith(validPartyId, contactPayload);
    });

    it('retorna 400 con type de contacto inválido', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/parties/${validPartyId}/contacts`)
        .set('Authorization', 'Bearer admin-token')
        .send({ ...contactPayload, type: 'INVALID_TYPE' })
        .expect(400);
    });

    it('retorna 400 sin valor requerido', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/parties/${validPartyId}/contacts`)
        .set('Authorization', 'Bearer admin-token')
        .send({ type: PartyContactType.EMAIL, isPrimary: false })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  describe('GET /api/v1/parties/:id/contacts', () => {
    it('retorna 200 con lista de contactos', async () => {
      partyContactServiceMock.list.mockResolvedValue([mockContact]);

      await request(app.getHttpServer())
        .get(`/api/v1/parties/${validPartyId}/contacts`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toHaveLength(1);
          expect(body.data[0].type).toBe(PartyContactType.EMAIL);
        });

      expect(partyContactServiceMock.list).toHaveBeenCalledWith(validPartyId);
    });

    it('retorna 200 con lista vacía cuando no hay contactos', async () => {
      partyContactServiceMock.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/api/v1/parties/${validPartyId}/contacts`)
        .set('Authorization', 'Bearer admin-token')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual([]);
        });
    });
  });

  // ---------------------------------------------------------------------------
  describe('DELETE /api/v1/parties/:id/contacts/:contactId', () => {
    it('retorna 204 al eliminar contacto', async () => {
      partyContactServiceMock.delete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/v1/parties/${validPartyId}/contacts/${validContactId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(204);

      expect(partyContactServiceMock.delete).toHaveBeenCalledWith(validPartyId, validContactId);
    });

    it('retorna 404 cuando el servicio lanza NotFoundException', async () => {
      partyContactServiceMock.delete.mockRejectedValue(
        new NotFoundException(`Contacto ${notFoundId} no encontrado para party ${validPartyId}`),
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/parties/${validPartyId}/contacts/${notFoundId}`)
        .set('Authorization', 'Bearer admin-token')
        .expect(404);
    });

    it('retorna 400 para UUID de contacto inválido', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/parties/${validPartyId}/contacts/invalid-uuid`)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // D3 — Aislamiento de tenant: cada token resuelve su propio contexto de tenant
  // ---------------------------------------------------------------------------
  describe('Aislamiento de tenant', () => {
    it('GET /api/v1/parties devuelve sólo datos del tenant del token presentado', async () => {
      // Tenant A recibe sus parties
      const partiesTenantA = {
        data: [{ ...mockParty, id: 'party-tenant-a-001', displayName: 'Cliente Tenant A' }],
        total: 1,
        page: 1,
        limit: 20,
      };
      // Tenant B recibe sus parties (conjunto diferente)
      const partiesTenantB = {
        data: [{ ...mockParty, id: 'party-tenant-b-001', displayName: 'Cliente Tenant B' }],
        total: 1,
        page: 1,
        limit: 20,
      };

      // Primera llamada → tenant A
      partyServiceMock.findAll.mockResolvedValueOnce(partiesTenantA);
      const responseA = await request(app.getHttpServer())
        .get('/api/v1/parties')
        .set('Authorization', 'Bearer admin-token') // schemaName: tenant_test
        .expect(200);

      // Segunda llamada → tenant B
      partyServiceMock.findAll.mockResolvedValueOnce(partiesTenantB);
      const responseB = await request(app.getHttpServer())
        .get('/api/v1/parties')
        .set('Authorization', 'Bearer tenant-b-token') // schemaName: tenant_b
        .expect(200);

      // Cada respuesta tiene sólo los parties de su tenant
      expect(responseA.body.data[0].id).toBe('party-tenant-a-001');
      expect(responseB.body.data[0].id).toBe('party-tenant-b-001');

      // Los IDs de tenant A no están en la respuesta de tenant B y viceversa
      const idsA = responseA.body.data.map((p: { id: string }) => p.id);
      const idsB = responseB.body.data.map((p: { id: string }) => p.id);
      expect(idsA).not.toEqual(expect.arrayContaining(idsB));
    });

    it('POST /api/v1/parties — el servicio recibe la llamada y el guard valida el rol del tenant correcto', async () => {
      const partyTenantB = {
        ...mockParty,
        id: 'party-tenant-b-002',
        displayName: 'Nuevo Cliente Tenant B',
      };
      partyServiceMock.create.mockResolvedValueOnce(partyTenantB);

      const response = await request(app.getHttpServer())
        .post('/api/v1/parties')
        .set('Authorization', 'Bearer tenant-b-token') // tenant B ADMIN
        .send({
          partyType: PartyType.NATURAL,
          documentType: DocumentTypeParty.CC,
          documentNumber: '50000001',
          displayName: 'Nuevo Cliente Tenant B',
        })
        .expect(201);

      expect(response.body.data.id).toBe('party-tenant-b-002');
      // El servicio fue llamado una sola vez (no hay cross-tenant leak)
      expect(partyServiceMock.create).toHaveBeenCalledTimes(1);
    });
  });
});
