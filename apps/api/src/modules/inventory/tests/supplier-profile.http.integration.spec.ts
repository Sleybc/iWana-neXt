import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { DocumentTypeParty, PartyType, SupplierProfileStatus, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { PartyReadAdapter } from '../../parties/adapters/party-read.adapter';
import { PartyWriteAdapter } from '../../parties/adapters/party-write.adapter';
import { PurchasingController } from '../purchasing.controller';
import { GoodsReceiptService } from '../services/goods-receipt.service';
import { PurchasingQueryService } from '../services/purchasing-query.service';
import { PurchasingService } from '../services/purchasing.service';
import { RfqPdfService } from '../services/rfq-pdf.service';
import { RfqService } from '../services/rfq.service';
import { SupplierProfileService } from '../services/supplier-profile.service';
import { SupplierPartyPortAdapter } from '../ports/supplier-party.port';
import { InMemoryTenantStore } from './support/in-memory-tenant-store';

/**
 * Integracion HTTP REAL (remediacion A3/C2): ejercita PurchasingController -> SupplierProfileService
 * -> PartyWriteAdapter/PartyReadAdapter -> store en memoria que modela las restricciones de Postgres.
 * NO se mockea SupplierProfileService. Cubre alta nueva (con `party` poblado), alta reutilizando
 * documento existente y 409 por restriccion UNICA real.
 */

const CURRENT_TENANT = { tenantId: 'tenant-001', schemaName: 'tenant_001' };
const store = new InMemoryTenantStore();

jest.mock('@iwana/db', () => ({
  SupplierProfile: class SupplierProfile {},
  TenantContext: {
    getOrThrow: jest.fn(() => CURRENT_TENANT),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as {
  runInTenantSchema: jest.Mock;
  TenantContext: { getOrThrow: jest.Mock };
};

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {
    canActivate(context: {
      getHandler: () => unknown;
      getClass: () => unknown;
      switchToHttp: () => {
        getRequest: () => { headers: Record<string, string | undefined>; user?: JwtPayload };
      };
    }): boolean {
      const handler = context.getHandler() as object;
      const classRef = context.getClass() as object;
      const isPublic =
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) ?? Reflect.getMetadata(IS_PUBLIC_KEY, classRef);
      if (isPublic) {
        return true;
      }
      const req = context.switchToHttp().getRequest();
      if (req.headers.authorization === 'Bearer support-token') {
        req.user = {
          sub: 'support-001',
          email: 'support@example.test',
          role: UserRole.SUPPORT,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-support',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      if (req.headers.authorization === 'Bearer viewer-token') {
        req.user = {
          sub: 'viewer-001',
          email: 'viewer@example.test',
          role: UserRole.SUBSCRIBER,
          tenantId: 'tenant-001',
          schemaName: 'tenant_001',
          jti: 'jti-viewer',
          type: 'tenant',
        } as JwtPayload;
        return true;
      }
      throw new UnauthorizedException('Token de acceso invalido o expirado.');
    }
  },
}));

jest.mock('../../auth/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
      getHandler: () => unknown;
      getClass: () => unknown;
    }): boolean {
      const user = context.switchToHttp().getRequest().user;
      const requiredRoles: string[] =
        Reflect.getMetadata('roles', context.getHandler() as object) ??
        Reflect.getMetadata('roles', context.getClass() as object) ??
        [];
      if (requiredRoles.length === 0 || (user && requiredRoles.includes(user.role))) {
        return true;
      }
      throw new ForbiddenException('No tiene permisos para ejecutar esta accion.');
    }
  },
}));

describe('Supplier profile HTTP integration (service + adapter + DB en memoria)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) =>
        cb({ manager: store.managerFor(schemaName) }),
    );

    const partyReadAdapter = new PartyReadAdapter({} as DataSource);
    const partyWriteAdapter = new PartyWriteAdapter();
    const supplierPartyPort = new SupplierPartyPortAdapter(partyReadAdapter);
    const supplierProfileService = new SupplierProfileService(
      {} as DataSource,
      partyWriteAdapter,
      supplierPartyPort,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PurchasingController],
      providers: [
        { provide: PurchasingService, useValue: {} },
        { provide: PurchasingQueryService, useValue: {} },
        { provide: GoodsReceiptService, useValue: {} },
        { provide: RfqService, useValue: {} },
        { provide: RfqPdfService, useValue: {} },
        { provide: SupplierProfileService, useValue: supplierProfileService },
        JwtAuthGuard,
        RolesGuard,
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /purchasing/suppliers crea proveedor nuevo con `party` poblado (A1)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '900123456',
        displayName: 'Proveedor Alfa',
        legalName: 'Proveedor Alfa S.A.S.',
        contacts: [
          { type: 'EMAIL', value: 'compras@alfa.test', isPrimary: true },
          { type: 'PHONE', value: '3001112233' },
        ],
        paymentTermsDays: 30,
        currency: 'cop',
      })
      .expect(201);

    expect(response.body.supplierCode).toMatch(/^PROV-\d{6}$/);
    expect(response.body.currency).toBe('COP');
    // A1: el resumen de identidad viaja en el response del alta (antes era siempre null).
    expect(response.body.party).not.toBeNull();
    expect(response.body.party.displayName).toBe('Proveedor Alfa');
    expect(response.body.party.email).toBe('compras@alfa.test');
    expect(response.body.party.phone).toBe('3001112233');
  });

  it('POST /purchasing/suppliers reutiliza el tercero existente por documento', async () => {
    // Un cliente ya existente en el maestro (mismo documento) que ahora sera tambien proveedor.
    store.seedParty('tenant_001', {
      id: 'party-existing-001',
      partyType: PartyType.ORGANIZATION,
      documentType: DocumentTypeParty.NIT,
      documentNumber: '800200300',
      displayName: 'Cliente que tambien vende',
      legalName: 'CQTV S.A.S.',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '800200300',
        displayName: 'Cliente que tambien vende',
      })
      .expect(201);

    expect(response.body.partyRefId).toBe('party-existing-001');
    expect(response.body.party.displayName).toBe('Cliente que tambien vende');
    // No se creo un Party duplicado para el mismo documento.
    const partiesWithDoc = store
      .parties('tenant_001')
      .filter((row) => row.documentNumber === '800200300');
    expect(partiesWithDoc).toHaveLength(1);
  });

  it('POST /purchasing/suppliers responde 409 por unico real (perfil ya existe para el tercero)', async () => {
    const payload = {
      partyType: PartyType.ORGANIZATION,
      documentType: DocumentTypeParty.NIT,
      documentNumber: '901999888',
      displayName: 'Proveedor Duplicado',
    };

    await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send(payload)
      .expect(201);

    // Segundo alta con el MISMO documento -> mismo Party -> viola uq_supplier_profiles_tenant_party_ref.
    await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send(payload)
      .expect(409);
  });

  it('GET /purchasing/suppliers/lookup encuentra el tercero por documento (A2)', async () => {
    store.seedParty('tenant_001', {
      id: 'party-lookup-001',
      partyType: PartyType.ORGANIZATION,
      documentType: DocumentTypeParty.NIT,
      documentNumber: '700100100',
      displayName: 'Tercero Buscable',
      legalName: 'Buscable Ltda',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/purchasing/suppliers/lookup')
      .query({ documentType: DocumentTypeParty.NIT, documentNumber: '700100100' })
      .set('Authorization', 'Bearer support-token')
      .expect(200);

    expect(response.body.match).not.toBeNull();
    expect(response.body.match.partyRefId).toBe('party-lookup-001');
    expect(response.body.match.legalName).toBe('Buscable Ltda');
    expect(response.body.hasSupplierProfile).toBe(false);
  });

  it('POST /purchasing/suppliers reintenta el supplier_code ante colision concurrente (M2)', async () => {
    store.injectConcurrentCodeCollisionOnce('tenant_001');

    const response = await request(app.getHttpServer())
      .post('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer support-token')
      .send({
        partyType: PartyType.ORGANIZATION,
        documentType: DocumentTypeParty.NIT,
        documentNumber: '600500400',
        displayName: 'Proveedor Concurrente',
      })
      .expect(201);

    // El alta sobrevive a la colision de codigo (reintento con el siguiente numero libre).
    expect(response.body.supplierCode).toMatch(/^PROV-\d{6}$/);
    expect(response.body.partyRefId).toBeDefined();
  });

  it('rechaza acceso sin token con 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/purchasing/suppliers').expect(401);
  });

  it('rechaza rol no autorizado con 403', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/purchasing/suppliers')
      .set('Authorization', 'Bearer viewer-token')
      .expect(403);
  });
});
