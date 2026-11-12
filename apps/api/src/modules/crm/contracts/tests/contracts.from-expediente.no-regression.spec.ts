// MOD05 Cierre de venta fase 2 · W0 · Inventario de no regresión (AI-SR-QA).
//
// Fija sobre el código ACTUAL la creación manual del contrato desde la ficha
// (`POST crm/subscribers/:subscriberId/contracts/from-expediente`) y la activación manual
// sin firma (`POST crm/contracts/:id/activate-manual`). `/activate` ya lo fija
// `contracts.activate.no-regression.spec.ts`.
//
// Robustez frente a A+B: el inventario afirma que la creación manual SIGUE existiendo y
// conserva su contrato (roles, permiso, guardas, ciclo), nunca que no exista la creación
// automática. Si A+B cambia a propósito algo de lo fijado aquí, el ajuste pasa por
// `test-change-reviewer`.
import 'reflect-metadata';
import { RequestMethod, UnprocessableEntityException, ConflictException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AccessPermissionKey,
  ManualContractActivationSchema,
  NetworkType,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
  PersonType,
  PlatformRole,
  ServiceUsage,
  SubscriberStatus,
  UserRole,
} from '@iwana/shared';
import { ContractsController } from '../contracts.controller';
import { ContractsService } from '../contracts.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Contract } from '../entities/contract.entity';
import { CreateContractFromExpedienteDto } from '../dto/create-contract-from-expediente.dto';
import { ContractsBlockedTitularGuard } from '../guards/contracts-blocked-titular.guard';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../../access-control/decorators/permissions.decorator';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import { AuditService } from '../../../audit/audit.service';
import { MediaService } from '../../../media/media.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { IPrivacyAuthorizationReadPort } from '../../../privacy/ports/privacy-authorization-read.port';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../../subscribers/subscriber-lifecycle.service';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';

const TENANT = { tenantId: 'ten-w0f2', schemaName: 'tenant_w0f2' };
const SYNTHETIC_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

let lockedContract: Contract | null;
let lockedSubscriber: Record<string, unknown> | null;
let expediente: Record<string, unknown> | null;
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
          if (sql.includes('FROM crm_billing_cycles') && sql.includes('active = true')) {
            return activeCycleDays.includes(params[0] as number) ? [{ cycle_day: params[0] }] : [];
          }
          if (sql.includes('FROM subscribers')) {
            return lockedSubscriber
              ? [
                  {
                    ...lockedSubscriber,
                    tenantId: TENANT.tenantId,
                    status: lockedSubscriber['status'],
                  },
                ]
              : [];
          }
          return [];
        },
        manager: {
          findOne: async (entity: unknown) => {
            if (entity === Contract) return lockedContract;
            if (entity === Subscriber) return lockedSubscriber;
            if (entity === ExpedienteRecord) return expediente;
            return null;
          },
          find: async () => [],
          query: async () => [],
          create: (_entity: unknown, value: Record<string, unknown>) =>
            Object.assign(Object.create(Contract.prototype) as Contract, value),
          save: async (_entity: unknown, value: Contract) => {
            const row = Object.assign(Object.create(Contract.prototype) as Contract, {
              ...value,
              id: value.id ?? 'ctr-w0f2-new',
            });
            saved.push(row);
            return row;
          },
        },
      }),
  };
});

function subscriber(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub-w0f2',
    tenantId: TENANT.tenantId,
    status: SubscriberStatus.PROSPECT,
    personType: PersonType.NATURAL,
    partyId: 'party-w0f2',
    anonymizedAt: null,
    expedienteId: 'exp-w0f2',
    address: 'Dirección sintética 1',
    city: 'Ciudad sintética',
    department: 'Departamento sintético',
    postalCode: null,
    customerSegment: null,
    ...overrides,
  };
}

function draft(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'ctr-w0f2',
    tenantId: TENANT.tenantId,
    subscriberId: 'sub-w0f2',
    planId: '00000000-0000-4000-8000-00000000f002',
    planSnapshotJson: { id: '00000000-0000-4000-8000-00000000f002' },
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

// ── Contrato HTTP de la creación manual desde la ficha ──────────────────────────────

describe('W0 F2 creación manual desde la ficha — contrato HTTP', () => {
  const handler = ContractsController.prototype.createFromExpediente;

  it('sigue expuesta como POST crm/subscribers/:subscriberId/contracts/from-expediente', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'crm/subscribers/:subscriberId/contracts/from-expediente',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });

  it('la permiten ADMIN, SALES, SUPPORT y SYSTEM_ADMIN con CRM_EXPEDIENTES_MANAGE', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    expect([...roles].sort()).toEqual(
      [UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN].sort(),
    );
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
    ]);
  });

  it('no la abre a roles de solo lectura (AUDITOR)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    expect(roles).not.toContain(UserRole.AUDITOR);
  });

  it('protege al titular bloqueado con ContractsBlockedTitularGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(ContractsBlockedTitularGuard);
  });

  it('delega en ContractsService.createFromExpediente con el actor y devuelve { data }', async () => {
    const created = draft({ status: ContractStatus.DRAFT });
    const service = { createFromExpediente: jest.fn().mockResolvedValue(created) };
    const controller = new ContractsController(service as unknown as ContractsService, {} as never);

    const result = await controller.createFromExpediente('sub-w0f2', { billingCycleDay: 15 }, {
      sub: 'actor-w0f2',
    } as never);

    expect(service.createFromExpediente).toHaveBeenCalledWith(
      'sub-w0f2',
      { billingCycleDay: 15 },
      'actor-w0f2',
    );
    expect(result).toEqual({ data: created });
  });
});

describe('W0 F2 creación manual — validación de billingCycleDay en el DTO', () => {
  const errorsFor = async (body: Record<string, unknown>) =>
    validate(plainToInstance(CreateContractFromExpedienteDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it.each([1, 15, 28])('acepta el día de ciclo %s', async (day) => {
    expect(await errorsFor({ billingCycleDay: day })).toHaveLength(0);
  });

  it.each([0, 29, 15.5])('rechaza el día de ciclo fuera de rango o no entero (%s)', async (day) => {
    const errors = await errorsFor({ billingCycleDay: day });
    expect(errors.map((error) => error.property)).toContain('billingCycleDay');
  });

  it('el ciclo es opcional al crear: el DRAFT sin ciclo pasa la validación', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });
});

// ── Servicio: creación manual y activación manual ──────────────────────────────────

describe('W0 F2 creación manual y activación manual — servicio', () => {
  let service: ContractsService;
  const auditService = { log: jest.fn(), logWithin: jest.fn().mockResolvedValue(undefined) };
  const authorization = {
    hasActive: jest.fn().mockResolvedValue({ active: true, legacyUnverified: false }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    saved.length = 0;
    lockedContract = draft();
    lockedSubscriber = subscriber();
    expediente = {
      id: 'exp-w0f2',
      interestedPlanId: '00000000-0000-4000-8000-00000000f002',
      additionalProductIds: [],
      additionalServiceIds: [],
      paymentMethod: null,
      billingCycle: null,
      fiscalName: null,
      fiscalDocument: null,
      address: 'Dirección sintética 1',
      municipality: 'Ciudad sintética',
      department: 'Departamento sintético',
      postalCode: null,
      stratum: null,
      customerSegment: null,
    };
    activeCycleDays = [5, 15];
    const module = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: DataSource, useValue: {} },
        {
          provide: CommercialCatalogReadPort,
          useValue: {
            createSnapshot: jest
              .fn()
              .mockImplementation(async (_tenantId: string, _schema: string, planId: string) => ({
                planId,
                name: 'Plan sintético',
                downloadSpeed: 100,
                uploadSpeed: 50,
                technology: 'FTTH',
                monthlyPrice: 80000,
                installationFee: 50000,
                vatConcept: VatConcept.INTERNET_ACCESS,
                networkType: NetworkType.FIXED,
                snapshotAt: new Date('2026-11-11T00:00:00Z'),
              })),
            getItemVatTreatments: jest.fn().mockResolvedValue([]),
            getPlanById: jest.fn().mockResolvedValue({
              id: '00000000-0000-4000-8000-00000000f002',
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
        { provide: SubscriberFiscalCompletenessService, useValue: { assertComplete: jest.fn() } },
        { provide: SubscriberLifecycleService, useValue: {} },
        { provide: IPrivacyAuthorizationReadPort, useValue: authorization },
        {
          provide: IPrivacyMarksReadPort,
          useValue: { activeMarks: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();
    service = module.get(ContractsService);
  });

  describe('createFromExpediente (creación manual desde la ficha)', () => {
    it('crea un contrato DRAFT con el plan del expediente y el ciclo confirmado', async () => {
      const result = await service.createFromExpediente(
        'sub-w0f2',
        { billingCycleDay: 15 },
        'actor-w0f2',
      );

      expect(result.status).toBe(ContractStatus.DRAFT);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({
        subscriberId: 'sub-w0f2',
        planId: '00000000-0000-4000-8000-00000000f002',
        status: ContractStatus.DRAFT,
        billingCycleDay: 15,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Contract',
          userId: 'actor-w0f2',
          newValue: expect.objectContaining({ status: ContractStatus.DRAFT, billingCycleDay: 15 }),
        }),
      );
    });

    it('sin billingCycleDay crea el DRAFT sin ciclo (el ciclo se exige al activar)', async () => {
      const result = await service.createFromExpediente('sub-w0f2', {}, 'actor-w0f2');

      expect(result.status).toBe(ContractStatus.DRAFT);
      expect(saved).toHaveLength(1);
      expect(saved[0]?.billingCycleDay ?? null).toBeNull();
    });

    it('rechaza un ciclo no disponible con 422 BILLING_CYCLE_INVALID y no persiste', async () => {
      const error = await service
        .createFromExpediente('sub-w0f2', { billingCycleDay: 27 }, 'actor-w0f2')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'BILLING_CYCLE_INVALID',
      });
      expect(saved).toHaveLength(0);
    });

    it('exige autorización contractual vigente del titular (422) y no persiste', async () => {
      authorization.hasActive.mockResolvedValueOnce({ active: false, legacyUnverified: false });

      const error = await service
        .createFromExpediente('sub-w0f2', { billingCycleDay: 15 }, 'actor-w0f2')
        .catch((e: unknown) => e);

      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'CONTRACT_DATA_AUTHORIZATION_REQUIRED',
      });
      expect(saved).toHaveLength(0);
    });

    it('rechaza al suscriptor cancelado con 409 y no persiste', async () => {
      lockedSubscriber = subscriber({ status: SubscriberStatus.CANCELLED });

      await expect(
        service.createFromExpediente('sub-w0f2', { billingCycleDay: 15 }, 'actor-w0f2'),
      ).rejects.toThrow(ConflictException);
      expect(saved).toHaveLength(0);
    });
  });

  describe('activateManual (activación sin firma con motivo)', () => {
    it('pasa DRAFT → ACTIVE con el ciclo guardado y audita el motivo', async () => {
      const result = await service.activateManual('ctr-w0f2', 'actor-w0f2', {
        reason: 'Cliente firmó en papel en la visita',
      });

      expect(result.status).toBe(ContractStatus.ACTIVE);
      expect(result.billingCycleDay).toBe(5);
      expect(saved).toHaveLength(1);
      expect(auditService.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'ctr-w0f2',
          userId: 'actor-w0f2',
          newValue: expect.objectContaining({
            status: ContractStatus.ACTIVE,
            activation: 'MANUAL',
            reason: 'Cliente firmó en papel en la visita',
          }),
        }),
        expect.anything(),
      );
    });

    it('exige billingCycleDay: sin ciclo guardado ni enviado responde 422 BILLING_CYCLE_REQUIRED', async () => {
      lockedContract = draft({ billingCycleDay: null });

      const error = await service
        .activateManual('ctr-w0f2', 'actor-w0f2', { reason: 'Motivo sintético suficiente' })
        .catch((e: unknown) => e);

      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'BILLING_CYCLE_REQUIRED',
      });
      expect(saved).toHaveLength(0);
    });

    it('acepta un ciclo activo enviado en el cuerpo', async () => {
      lockedContract = draft({ billingCycleDay: null });

      const result = await service.activateManual('ctr-w0f2', 'actor-w0f2', {
        billingCycleDay: 15,
        reason: 'Motivo sintético suficiente',
      });

      expect(result.status).toBe(ContractStatus.ACTIVE);
      expect(result.billingCycleDay).toBe(15);
    });

    it.each([ContractStatus.ACTIVE, ContractStatus.SUSPENDED, ContractStatus.TERMINATED])(
      'solo activa desde DRAFT: desde %s responde 409 y no persiste',
      async (status) => {
        lockedContract = draft({ status });

        await expect(
          service.activateManual('ctr-w0f2', 'actor-w0f2', {
            reason: 'Motivo sintético suficiente',
          }),
        ).rejects.toThrow(ConflictException);
        expect(saved).toHaveLength(0);
      },
    );
  });
});

// ── Contrato HTTP de la activación manual y publicación del evento ─────────────────

describe('W0 F2 activación manual — contrato HTTP', () => {
  const handler = ContractsController.prototype.activateManual;

  it('sigue expuesta como POST crm/contracts/:id/activate-manual', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('crm/contracts/:id/activate-manual');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });

  it('la reservan ADMIN y SYSTEM_ADMIN con CRM_EXPEDIENTES_MANAGE', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
    expect([...roles].sort()).toEqual([UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN].sort());
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      AccessPermissionKey.CRM_EXPEDIENTES_MANAGE,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(ContractsBlockedTitularGuard);
  });

  it('el cuerpo exige un motivo de al menos 10 caracteres y no admite campos extra', () => {
    expect(ManualContractActivationSchema.safeParse({ reason: 'corto' }).success).toBe(false);
    expect(ManualContractActivationSchema.safeParse({}).success).toBe(false);
    expect(
      ManualContractActivationSchema.safeParse({ reason: 'Motivo suficiente', extra: 1 }).success,
    ).toBe(false);
    expect(
      ManualContractActivationSchema.safeParse({ reason: 'Motivo suficiente', billingCycleDay: 29 })
        .success,
    ).toBe(false);
    expect(
      ManualContractActivationSchema.safeParse({ reason: 'Motivo suficiente', billingCycleDay: 15 })
        .success,
    ).toBe(true);
  });

  it.each(['activate', 'activateManual'] as const)(
    '%s publica crm.contract.activated tras activar (alimenta el primer cobro de MOD14)',
    async (method) => {
      const activated = draft({ status: ContractStatus.ACTIVE });
      const service = {
        activate: jest.fn().mockResolvedValue(activated),
        activateManual: jest.fn().mockResolvedValue(activated),
      };
      const publisher = { publishForContract: jest.fn().mockResolvedValue(undefined) };
      const controller = new ContractsController(
        service as unknown as ContractsService,
        {} as never,
        publisher as never,
      );
      const actor = { sub: 'actor-w0f2' } as never;

      const result =
        method === 'activate'
          ? await controller.activate('ctr-w0f2', undefined, actor)
          : await controller.activateManual(
              'ctr-w0f2',
              { reason: 'Motivo sintético suficiente' },
              actor,
            );

      expect(result).toEqual({ data: activated });
      expect(publisher.publishForContract).toHaveBeenCalledWith('ctr-w0f2');
    },
  );
});
