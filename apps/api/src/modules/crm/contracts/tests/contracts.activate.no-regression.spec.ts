// MOD05 Cierre de venta · W0 · Inventario de no regresión de la activación manual (AI-SR-QA).
//
// Fija el comportamiento ACTUAL de `POST crm/contracts/:id/activate` (spec H2, §0
// «complementar sin retroceso»): la activación manual DRAFT → ACTIVE se conserva cuando
// el bloque D agregue la firma. Si D cambia a propósito roles, permiso o cuerpo, este
// inventario lo hace visible y el ajuste pasa por `test-change-reviewer`.
import { ConflictException, RequestMethod, UnprocessableEntityException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  AccessPermissionKey,
  NetworkType,
  PlatformRole,
  UserRole,
  PersonType,
  ServiceUsage,
  SubscriberStatus,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import { ContractsController } from '../contracts.controller';
import { ContractsService } from '../contracts.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Contract } from '../entities/contract.entity';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../../access-control/decorators/permissions.decorator';
import { ContractsBlockedTitularGuard } from '../guards/contracts-blocked-titular.guard';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import { AuditService } from '../../../audit/audit.service';
import { MediaService } from '../../../media/media.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../../subscribers/subscriber-lifecycle.service';

const TENANT = { tenantId: 'ten-w0', schemaName: 'tenant_w0' };
const SYNTHETIC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let lockedContract: Contract;
let activeCycleDays: number[];
const saved: Contract[] = [];

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: { getOrThrow: () => TENANT },
    runInTenantSchema: async (
      _ds: unknown,
      _schema: string,
      callback: (qr: unknown) => Promise<unknown>,
    ) =>
      callback({
        query: async (sql: string, params: unknown[] = []) => {
          if (sql.includes('FOR SHARE OF s')) {
            return [
              {
                id: 'sub-w0',
                tenantId: TENANT.tenantId,
                partyId: null,
                anonymizedAt: null,
                personType: PersonType.NATURAL,
                status: SubscriberStatus.ACTIVE,
              },
            ];
          }
          if (sql.includes('FROM crm_billing_cycles') && sql.includes('active = true')) {
            return activeCycleDays.includes(params[0] as number) ? [{ cycle_day: params[0] }] : [];
          }
          return [];
        },
        manager: {
          findOne: async (entity: unknown) => (entity === Contract ? lockedContract : null),
          find: async () => [],
          query: async () => [],
          save: async (_entity: unknown, value: Contract) => {
            saved.push(Object.assign(Object.create(Contract.prototype) as Contract, value));
            return value;
          },
        },
      }),
  };
});

function draft(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'ctr-w0',
    tenantId: TENANT.tenantId,
    subscriberId: 'sub-w0',
    planId: 'plan-w0',
    planSnapshotJson: { id: 'plan-w0' },
    status: ContractStatus.DRAFT,
    alias: 'Servicio ficticio',
    serviceUsage: ServiceUsage.NON_RESIDENTIAL,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    billingCycleDay: 5,
    fiscalDocument: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Contract;
}

describe('W0 activación manual — contrato HTTP', () => {
  const handler = ContractsController.prototype.activate;

  it('expone POST crm/contracts/:id/activate', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('crm/contracts/:id/activate');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });

  it('la permiten ADMIN, SALES, SUPPORT y SYSTEM_ADMIN con el permiso CRM_EXPEDIENTES_MANAGE', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    expect([...roles].sort()).toEqual(
      [UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN].sort(),
    );
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
    ]);
  });

  it('protege al titular bloqueado con ContractsBlockedTitularGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(ContractsBlockedTitularGuard);
  });
});

describe('W0 activación manual — servicio', () => {
  let service: ContractsService;
  const auditService = { log: jest.fn(), logWithin: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    saved.length = 0;
    lockedContract = draft();
    activeCycleDays = [5, 15];
    const module = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: DataSource, useValue: {} },
        {
          provide: CommercialCatalogReadPort,
          useValue: {
            getPlanById: jest.fn().mockResolvedValue({
              id: 'plan-w0',
              vatConcept: VatConcept.INTERNET_ACCESS,
              networkType: NetworkType.FIXED,
            }),
          },
        },
        {
          provide: IInternetVatResolverPort,
          useValue: {
            resolve: jest.fn().mockReturnValue({
              status: 'RESOLVED',
              treatment: VatTreatment.EXEMPT,
              legalBasis: VatLegalBasis.ET_481_H,
              ratePercent: 0,
              requiresAccountantReview: false,
            }),
          },
        },
        { provide: AuditService, useValue: auditService },
        { provide: MediaService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) =>
              key === 'PII_ENCRYPTION_KEY' ? SYNTHETIC_KEY : fallback,
            getOrThrow: () => SYNTHETIC_KEY,
          },
        },
        { provide: SubscriberFiscalCompletenessService, useValue: {} },
        { provide: SubscriberLifecycleService, useValue: {} },
        {
          provide: IPrivacyMarksReadPort,
          useValue: { activeMarks: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();
    service = module.get(ContractsService);
  });

  it('pasa DRAFT → ACTIVE con el ciclo guardado y audita el cambio de estado', async () => {
    const result = await service.activate('ctr-w0', 'actor-w0');

    expect(result.status).toBe(ContractStatus.ACTIVE);
    expect(result.billingCycleDay).toBe(5);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ status: ContractStatus.ACTIVE, statusReasonCode: null });
    expect(auditService.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'ctr-w0',
        userId: 'actor-w0',
        oldValue: { status: ContractStatus.DRAFT, billingCycleDay: 5 },
        newValue: { status: ContractStatus.ACTIVE, billingCycleDay: 5 },
      }),
      expect.anything(),
    );
  });

  it('acepta un billingCycleDay activo enviado en el cuerpo', async () => {
    const result = await service.activate('ctr-w0', 'actor-w0', { billingCycleDay: 15 });

    expect(result.status).toBe(ContractStatus.ACTIVE);
    expect(result.billingCycleDay).toBe(15);
  });

  it('exige billingCycleDay: sin ciclo guardado ni enviado responde 422 BILLING_CYCLE_REQUIRED', async () => {
    lockedContract = draft({ billingCycleDay: null });

    const error = await service.activate('ctr-w0', 'actor-w0').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'BILLING_CYCLE_REQUIRED',
    });
    expect(saved).toHaveLength(0);
  });

  it('rechaza un ciclo no disponible con 422 BILLING_CYCLE_INVALID', async () => {
    const error = await service
      .activate('ctr-w0', 'actor-w0', { billingCycleDay: 27 })
      .catch((e: unknown) => e);

    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'BILLING_CYCLE_INVALID',
    });
    expect(saved).toHaveLength(0);
  });

  it.each([ContractStatus.ACTIVE, ContractStatus.TERMINATED, ContractStatus.ARCHIVED])(
    'desde %s no activa: 409 INVALID_STATE_TRANSITION',
    async (status) => {
      lockedContract = draft({ status });

      await expect(service.activate('ctr-w0', 'actor-w0')).rejects.toThrow(ConflictException);
      expect(saved).toHaveLength(0);
    },
  );

  // Hecho observado en W0 (no está en la spec H2): ALLOWED_TRANSITIONS permite
  // SUSPENDED → ACTIVE, así que este endpoint también reactiva un contrato suspendido sin
  // pasar por `reactivate`. Se fija tal cual para que un cambio sea deliberado y visible.
  it('desde SUSPENDED hoy también activa (comportamiento heredado, escalado en W0)', async () => {
    lockedContract = draft({ status: ContractStatus.SUSPENDED });

    const result = await service.activate('ctr-w0', 'actor-w0');

    expect(result.status).toBe(ContractStatus.ACTIVE);
    expect(saved).toHaveLength(1);
  });
});
