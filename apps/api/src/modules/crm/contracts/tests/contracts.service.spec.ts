import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MediaUsage } from '@iwana/db';
import {
  AuditAction,
  NetworkType,
  CustomerSegment,
  PersonType,
  ServiceUsage,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
  type LifecycleTerminateCommand,
} from '@iwana/shared';
import { ContractsService } from '../contracts.service';
import { CONTRACT_PLAN_ID_MAX_LENGTH } from '../utils/contract-plan-id.util';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Contract } from '../entities/contract.entity';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import { AuditService } from '../../../audit/audit.service';
import { MediaService } from '../../../media/media.service';
import { IPrivacyAuthorizationReadPort } from '../../../privacy/ports/privacy-authorization-read.port';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import { encryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../../subscribers/subscriber-lifecycle.service';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { ContractsTenantSettingsReadPort } from '../ports/contracts-tenant-settings-read.port';
import { BillingAccountReadPort } from '../../../billing/ports/billing-account-read.port';

const syntheticFiscalCryptoKey = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();
const mockContractQuery = jest.fn();
let mockLockedContractStatus = 'DRAFT';
let mockLockedContractBillingCycleDay: number | null = 1;
let mockLockedContractUpdatedAt = new Date('2026-04-24T00:00:00Z');
let mockAgendaRows: Array<Record<string, unknown>> | null = null;
let mockActiveBillingCycleExists = true;
let mockLockedSubscriber: Partial<Subscriber> | null;
let mockAnonymizedArchiveRows: Array<{ id: string }> | null = null;

function mockMutationPrecheck(): void {
  mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) => cb({ manager: {} }));
}

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) => {
      const [dataSource, schemaName, callback] = args;
      return mockRunInTenantSchema(
        dataSource,
        schemaName,
        (queryRunner: {
          manager: Record<string, unknown>;
          query?: (sql: string, parameters?: unknown[]) => Promise<unknown>;
        }) => {
          const originalFindOne = queryRunner.manager['findOne'] as
            | ((entity: unknown, options?: { where?: { id?: string } }) => Promise<unknown>)
            | undefined;
          queryRunner.manager['findOne'] = async (
            entity: unknown,
            options?: { where?: { id?: string } },
          ) => {
            const result = originalFindOne
              ? await originalFindOne(entity, options)
              : {
                  id: options?.where?.id ?? 'sub-1',
                  tenantId: 'ten-1',
                  personType: PersonType.NATURAL,
                  partyId: 'party-test-uuid',
                  expedienteId: 'exp-1',
                  address: 'Dirección sintética',
                  city: 'Bogotá',
                  department: 'Cundinamarca',
                  postalCode: null,
                };
            if (entity === Contract && result && typeof result === 'object') {
              const updatedAt = (result as { updatedAt?: Date }).updatedAt;
              if (updatedAt) mockLockedContractUpdatedAt = updatedAt;
              const status = (result as { status?: unknown }).status;
              if (typeof status === 'string') mockLockedContractStatus = status;
              const billingCycleDay = (result as { billingCycleDay?: unknown }).billingCycleDay;
              if (typeof billingCycleDay === 'number' || billingCycleDay === null) {
                mockLockedContractBillingCycleDay = billingCycleDay;
              }
            }
            if (!result || typeof result !== 'object') return result;
            if (entity !== Subscriber) return result;
            return {
              vatResponsibility: 'RESPONSABLE',
              rutResponsibilities: ['O-13'],
              legalRepresentativePartyId: null,
              nit: null,
              nitVerificationDigit: null,
              ...(result as Record<string, unknown>),
            };
          };
          if (typeof queryRunner.manager['find'] !== 'function') {
            queryRunner.manager['find'] = async () => [];
          }
          if (typeof queryRunner.manager['save'] !== 'function') {
            queryRunner.manager['save'] = async (_entity: unknown, entity: unknown) => entity;
          }
          if (typeof queryRunner.manager['create'] !== 'function') {
            queryRunner.manager['create'] = (_entity: unknown, entity: unknown) => entity;
          }
          queryRunner.query = async (sql: string, parameters?: unknown[]) => {
            mockContractQuery(sql, parameters);
            if (
              mockAnonymizedArchiveRows !== null &&
              sql.includes('SET status = $1, status_reason_code = NULL')
            ) {
              return mockAnonymizedArchiveRows;
            }
            if (sql.includes('FOR SHARE OF s')) {
              return mockLockedSubscriber ? [mockLockedSubscriber] : [];
            }
            if (sql.includes('SELECT updated_at AS "updatedAt"')) {
              return [{ updatedAt: mockLockedContractUpdatedAt }];
            }
            if (sql.includes('SELECT status::text AS status') && sql.includes('FROM contracts')) {
              return [
                {
                  status: mockLockedContractStatus,
                  billingCycleDay: mockLockedContractBillingCycleDay,
                },
              ];
            }
            if (sql.includes('SELECT id FROM subscribers')) {
              return [{ id: parameters?.[0] ?? 'sub-1' }];
            }
            if (
              sql.includes('SELECT cycle_day AS "cycleDay"') &&
              sql.includes('FROM crm_billing_cycles') &&
              sql.includes('ORDER BY cycle_day ASC')
            ) {
              return [{ cycleDay: 1, cutoffDay: 15, active: true }];
            }
            if (sql.includes('SELECT cycle_day AS "cycleDay", cutoff_day AS "cutoffDay"')) {
              return [{ cycleDay: 1, cutoffDay: 15 }];
            }
            if (mockAgendaRows !== null) {
              if (sql.includes('billing_cycle_day IS NULL')) return [{ total: 2 }];
              if (sql.includes('LIMIT $4')) return mockAgendaRows;
              if (sql.includes('COUNT(*)::int AS total')) {
                return [{ total: mockAgendaRows.length }];
              }
            }
            if (sql.includes('FROM crm_billing_cycles')) {
              if (sql.includes('active = true') && !mockActiveBillingCycleExists) return [];
              return [{ cycle_day: parameters?.[0] ?? 1 }];
            }
            if (sql.includes('FROM crm_lifecycle_changes')) return [];
            return [];
          };
          return callback(queryRunner);
        },
      );
    },
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

/** Factory de contrato mínimo para tests */
function buildContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'ctr-1',
    tenantId: 'ten-1',
    quoteId: null,
    subscriberId: 'sub-1',
    planId: 'plan-fibra-300',
    planSnapshotJson: { id: 'plan-fibra-300' },
    status: ContractStatus.DRAFT,
    alias: 'Servicio — Bogotá Cra 10',
    installationAddress: 'Cra 10 #23-45',
    installationCity: 'Bogotá',
    installationDepartment: 'Cundinamarca',
    installationPostalCode: '110111',
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: null,
    billingCycle: null,
    billingCycleDay: 1,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: new Date('2026-04-24T00:00:00Z'),
    updatedAt: new Date('2026-04-24T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as Contract;
}

describe('ContractsService', () => {
  let service: ContractsService;
  const commercialCatalogPort = { getPlanById: jest.fn() };
  const internetVatResolver = { resolve: jest.fn() };
  const auditService = { log: jest.fn(), logWithin: jest.fn().mockResolvedValue(undefined) };
  const mediaService = {
    findOne: jest.fn(),
    getSignedUrl: jest.fn(),
    getStratumEvidenceSignedUrl: jest.fn(),
    softDeleteStratumEvidence: jest.fn(),
    upload: jest.fn(),
    uploadStratumEvidence: jest.fn(),
  };
  const privacyAuthorizationReadPort = {
    hasActive: jest.fn().mockResolvedValue({
      active: true,
      authorizationId: 'authorization-1',
      legalTextVersion: 'legal-v1',
      legacyUnverified: false,
    }),
    listForParty: jest.fn(),
  };
  const privacyMarksReadPort = {
    activeMarks: jest.fn().mockResolvedValue({}),
    partyIdsWithActiveMark: jest.fn().mockResolvedValue([]),
  };
  const tenantSettingsReadPort = { getTimezone: jest.fn() };
  const billingAccountReadPort = { periodStates: jest.fn().mockResolvedValue({}) };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'STORAGE_DRIVER') return 'minio';
      if (key === 'PII_ENCRYPTION_KEY')
        return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      return fallback;
    }),
    getOrThrow: jest.fn(() => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  };
  const subscriberLifecycleService = {
    transitionContract: jest.fn().mockResolvedValue(undefined),
    preview: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
    terminate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRunInTenantSchema.mockReset();
    mockLockedContractStatus = ContractStatus.DRAFT;
    mockLockedContractBillingCycleDay = 1;
    mockAnonymizedArchiveRows = null;
    mockLockedSubscriber = {
      id: 'sub-1',
      tenantId: 'ten-1',
      partyId: 'party-test-uuid',
      personType: PersonType.NATURAL,
      anonymizedAt: null,
    };
    privacyMarksReadPort.activeMarks.mockResolvedValue({});
    tenantSettingsReadPort.getTimezone.mockResolvedValue('America/Bogota');
    billingAccountReadPort.periodStates.mockResolvedValue({});
    subscriberLifecycleService.transitionContract.mockResolvedValue(undefined);
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'STORAGE_DRIVER'
        ? 'minio'
        : key === 'PII_ENCRYPTION_KEY'
          ? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
          : fallback,
    );
    mediaService.findOne.mockResolvedValue({ usage: MediaUsage.STRATUM_EVIDENCE });
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        SubscriberFiscalCompletenessService,
        { provide: DataSource, useValue: {} },
        { provide: CommercialCatalogReadPort, useValue: commercialCatalogPort },
        { provide: IInternetVatResolverPort, useValue: internetVatResolver },
        { provide: AuditService, useValue: auditService },
        { provide: MediaService, useValue: mediaService },
        { provide: ConfigService, useValue: configService },
        { provide: IPrivacyAuthorizationReadPort, useValue: privacyAuthorizationReadPort },
        { provide: IPrivacyMarksReadPort, useValue: privacyMarksReadPort },
        { provide: ContractsTenantSettingsReadPort, useValue: tenantSettingsReadPort },
        { provide: BillingAccountReadPort, useValue: billingAccountReadPort },
        { provide: SubscriberLifecycleService, useValue: subscriberLifecycleService },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  describe('getActiveBillingCycles', () => {
    it('CA-CF-13: calcula el próximo corte con la fecha local del tenant', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-11-16T02:00:00.000Z')); // 21:00 del 15 en Bogotá
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: {} }),
      );

      try {
        await expect(service.getActiveBillingCycles()).resolves.toEqual([
          {
            cycleDay: 1,
            cutoffDay: 15,
            active: true,
            nextCutoffDate: '2026-11-15',
          },
        ]);
        expect(tenantSettingsReadPort.getTimezone).toHaveBeenCalledWith('ten-1');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getCutoffAgenda', () => {
    it('CA-CF-08: sin date usa la fecha de Bogotá a las 21:00, no la fecha UTC', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-11-16T02:00:00.000Z')); // 21:00 del 15 en Bogotá
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: {} }),
      );

      try {
        const result = await service.getCutoffAgenda({ page: 1, limit: 25 }, 'SALES');

        expect(result.date).toBe('2026-11-15');
        expect(tenantSettingsReadPort.getTimezone).toHaveBeenCalledWith('ten-1');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('findOneForRead', () => {
    it('redacta el contrato bloqueado y conserva el marcador de anonimización nulo', async () => {
      const contract = buildContract();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async (entity: unknown) => (entity === Contract ? contract : null),
            find: async () => [{ id: 'sub-1', partyId: 'party-1', anonymizedAt: null }],
          },
        }),
      );
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({
        'party-1': ['DATOS_BLOQUEADOS'],
      });

      const result = await service.findOneForRead('ctr-1', false);

      expect(result).toMatchObject({
        id: 'ctr-1',
        alias: 'Datos bloqueados',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        installationStratum: null,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        fiscalName: null,
        fiscalDocument: null,
        fiscalAddress: null,
        titularAnonymizedAt: null,
      });
    });

    it('redacta los datos del contrato anonimizado aunque el lector pueda ver datos bloqueados', async () => {
      const anonymizedAt = new Date('2026-10-15T12:00:00.000Z');
      const contract = buildContract({
        quoteId: 'quote-sensitive',
        planSnapshotJson: { name: 'Fibra segura' },
        status: ContractStatus.ACTIVE,
        statusReasonCode: 'SENSITIVE_REASON',
        statusChangedAt: new Date('2026-10-14T12:00:00.000Z'),
        alias: 'ALIAS_CENTINELA',
        installationAddress: 'DIRECCION_CENTINELA',
        installationCity: 'CIUDAD_CENTINELA',
        installationDepartment: 'DEPARTAMENTO_CENTINELA',
        installationPostalCode: 'CODIGO_POSTAL_CENTINELA',
        installationNotes: 'NOTAS_CENTINELA',
        customerSegment: CustomerSegment.PYME,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        installationStratum: 4,
        stratumEvidenceMediaId: 'evidence-sensitive',
        vatSnapshot: { treatment: 'STANDARD' } as Contract['vatSnapshot'],
        additionalProductIds: ['product-sensitive'],
        additionalServiceIds: ['service-sensitive'],
        paymentMethod: 'PAYMENT_CENTINELA',
        billingCycle: 'CYCLE_CENTINELA',
        fiscalName: 'RAZON_SOCIAL_CENTINELA',
        fiscalDocument: 'DOCUMENTO_FISCAL_CENTINELA',
        fiscalAddress: 'DIRECCION_FISCAL_CENTINELA',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => contract,
            find: async () => [{ id: 'sub-1', partyId: 'party-1', anonymizedAt }],
          },
        }),
      );
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({ 'party-1': [] });

      const result = await service.findOneForRead('ctr-1', true);

      expect(result).toMatchObject({
        planSnapshotJson: { name: 'Fibra segura' },
        status: ContractStatus.ACTIVE,
        titularAnonymizedAt: anonymizedAt.toISOString(),
        quoteId: null,
        statusReasonCode: null,
        statusChangedAt: null,
        alias: 'Anonimizado',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        customerSegment: null,
        serviceUsage: null,
        installationStratum: null,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: null,
        billingCycle: null,
        fiscalName: null,
        fiscalDocument: null,
        fiscalAddress: null,
        startDate: null,
        endDate: null,
      });
      expect(JSON.stringify(result)).not.toContain('CENTINELA');
      expect(JSON.stringify(result)).not.toContain('SENSITIVE_REASON');
    });

    it('descifra el documento fiscal al proyectar un contrato', async () => {
      const contract = buildContract();
      const encryptedDocument = encryptAes256Gcm(
        'synthetic-contract-fiscal-read',
        syntheticFiscalCryptoKey,
      );
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => contract,
            find: async () => [],
            query: async () => [
              {
                id: contract.id,
                fiscal_document: null,
                fiscal_document_encrypted: encryptedDocument,
                fiscal_document_hmac: 'synthetic-hmac',
              },
            ],
          },
        }),
      );

      const result = await service.findOneForRead(contract.id, false);

      expect(result.fiscalDocument).toBe('synthetic-contract-fiscal-read');
      expect(Reflect.get(result, 'fiscalDocumentEncrypted')).toBe(encryptedDocument);
      expect(JSON.stringify(result)).not.toContain(encryptedDocument);
    });

    it('audita el acceso privilegiado al contrato de un titular bloqueado', async () => {
      const contract = buildContract();
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async (entity: unknown) => (entity === Contract ? contract : null),
              find: async () => [{ id: 'sub-1', partyId: 'party-1', anonymizedAt: null }],
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => ({ id: 'sub-1', partyId: 'party-1', anonymizedAt: null }),
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) => callback({ manager: {} }));
      privacyMarksReadPort.activeMarks
        .mockResolvedValueOnce({ 'party-1': ['DATOS_BLOQUEADOS'] })
        .mockResolvedValueOnce({ 'party-1': ['DATOS_BLOQUEADOS'] });

      const result = await service.findOneForRead(
        'ctr-1',
        true,
        'actor-1',
        'CRM_BLOCKED_DATA_READ',
      );

      expect(result.alias).toBe(contract.alias);
      expect(auditService.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.RECORD_ACCESS,
          entityType: 'Contract',
          entityId: 'ctr-1',
          userId: 'actor-1',
          newValue: { privacyMark: 'DATOS_BLOQUEADOS', grantedBy: 'CRM_BLOCKED_DATA_READ' },
        }),
        expect.any(Object),
      );
    });

    it('no sirve un contrato bloqueado cuando no puede registrar la auditoría', async () => {
      const contract = buildContract();
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async (entity: unknown) => (entity === Contract ? contract : null),
              find: async () => [{ id: 'sub-1', partyId: 'party-1', anonymizedAt: null }],
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) =>
          callback({
            manager: {
              findOne: async () => ({ id: 'sub-1', partyId: 'party-1', anonymizedAt: null }),
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, callback) => callback({ manager: {} }));
      privacyMarksReadPort.activeMarks
        .mockResolvedValueOnce({ 'party-1': ['DATOS_BLOQUEADOS'] })
        .mockResolvedValueOnce({ 'party-1': ['DATOS_BLOQUEADOS'] });
      auditService.logWithin.mockRejectedValueOnce(new Error('synthetic audit failure'));

      await expect(
        service.findOneForRead('ctr-1', true, 'actor-1', 'CRM_BLOCKED_DATA_READ'),
      ).rejects.toMatchObject({
        status: 503,
        response: { code: 'PRIVACY_AUDIT_UNAVAILABLE' },
      });
    });
  });

  describe('uploadStratumEvidence', () => {
    it('requiere un archivo después de comprobar el titular y antes de cargar soporte', async () => {
      mockMutationPrecheck();
      await expect(
        service.uploadStratumEvidence(
          'ctr-1',
          undefined as unknown as Express.Multer.File,
          'actor-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('propaga el 503 de almacenamiento no privado sin tocar el contrato', async () => {
      const contract = buildContract({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
      });
      mediaService.uploadStratumEvidence.mockRejectedValue(
        new ServiceUnavailableException({ code: 'STRATUM_EVIDENCE_STORAGE_MUST_BE_PRIVATE' }),
      );
      mockMutationPrecheck();
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              findOne: async () => ({
                id: 'sub-1',
                tenantId: 'ten-1',
                personType: PersonType.NATURAL,
              }),
            },
          }),
        );

      await expect(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(3);
      expect(mediaService.softDeleteStratumEvidence).not.toHaveBeenCalled();
    });

    it('reemplaza y limpia un soporte previo en un borrador sin recalcular IVA', async () => {
      const contract = buildContract({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: 'asset-old',
      });
      mediaService.uploadStratumEvidence.mockResolvedValue({ id: 'asset-new' });
      mediaService.softDeleteStratumEvidence.mockResolvedValue(undefined);
      mockMutationPrecheck();
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              findOne: async () => ({
                id: 'sub-1',
                tenantId: 'ten-1',
                personType: PersonType.NATURAL,
              }),
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              findOne: async () => ({ ...contract }),
              save: async (_entity: unknown, entity: Contract) => entity,
            },
          }),
        );

      const result = await service.uploadStratumEvidence(
        'ctr-1',
        {} as Express.Multer.File,
        'actor-1',
      );

      expect(result.stratumEvidenceMediaId).toBe('asset-new');
      expect(internetVatResolver.resolve).not.toHaveBeenCalled();
      expect(mediaService.softDeleteStratumEvidence).toHaveBeenCalledWith(
        'asset-old',
        'tenant_test',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'ContractStratumEvidence',
          oldValue: { hasStratumEvidence: true },
          newValue: { hasStratumEvidence: true },
        }),
      );
    });

    it('reemplaza el soporte de un contrato activo y recalcula el snapshot', async () => {
      const contract = buildContract({
        status: ContractStatus.ACTIVE,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: 'asset-old',
        vatSnapshot: {
          treatment: VatTreatment.STANDARD,
          legalBasis: VatLegalBasis.ET_468,
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00.000Z',
        },
      });
      mediaService.uploadStratumEvidence.mockResolvedValue({ id: 'asset-new' });
      mediaService.findOne.mockResolvedValue({ usage: MediaUsage.STRATUM_EVIDENCE });
      mediaService.softDeleteStratumEvidence.mockResolvedValue(undefined);
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: contract.planId,
        name: 'Plan prueba',
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.FIXED,
      });
      internetVatResolver.resolve.mockReturnValue({
        status: 'RESOLVED',
        treatment: VatTreatment.EXEMPT,
        legalBasis: VatLegalBasis.ET_481_H,
        ratePercent: 0,
        requiresAccountantReview: false,
      });
      mockMutationPrecheck();
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              findOne: async () => ({
                id: 'sub-1',
                tenantId: 'ten-1',
                personType: PersonType.NATURAL,
              }),
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              findOne: async () => ({ ...contract }),
              save: async (_entity: unknown, entity: Contract) => entity,
            },
          }),
        );

      const result = await service.uploadStratumEvidence(
        'ctr-1',
        {} as Express.Multer.File,
        'actor-1',
      );

      expect(result.stratumEvidenceMediaId).toBe('asset-new');
      expect(result.vatSnapshot).toMatchObject({
        treatment: VatTreatment.EXEMPT,
        legalBasis: VatLegalBasis.ET_481_H,
        ratePercent: 0,
      });
      expect(mediaService.softDeleteStratumEvidence).toHaveBeenCalledWith(
        'asset-old',
        'tenant_test',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'ContractServicePoint',
          oldValue: { vatTreatment: VatTreatment.STANDARD },
          newValue: expect.objectContaining({
            changedFields: ['stratumEvidenceMediaId'],
            vatTreatment: VatTreatment.EXEMPT,
          }),
        }),
      );
    });
  });

  describe('getStratumEvidenceSignedUrl', () => {
    it('no audita acceso cuando media rechaza firmar por almacenamiento no privado', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => buildContract({ stratumEvidenceMediaId: 'asset-1' }),
          },
        }),
      );
      mediaService.findOne.mockResolvedValue({ usage: MediaUsage.STRATUM_EVIDENCE });
      mediaService.getStratumEvidenceSignedUrl.mockRejectedValue(
        new ServiceUnavailableException({ code: 'STRATUM_EVIDENCE_STORAGE_MUST_BE_PRIVATE' }),
      );

      await expect(service.getStratumEvidenceSignedUrl('ctr-1', 'actor-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('no crea acceso firmado cuando el contrato todavía no tiene soporte', async () => {
      mockRunInTenantSchema.mockReset();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => buildContract() } }),
      );

      await expect(service.getStratumEvidenceSignedUrl('ctr-1', 'actor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mediaService.findOne).not.toHaveBeenCalled();
      expect(mediaService.getStratumEvidenceSignedUrl).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('updateServicePoint', () => {
    it('exige al menos un campo del punto de servicio', async () => {
      mockMutationPrecheck();
      await expect(service.updateServicePoint('ctr-1', {}, 'actor-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
    });

    it('rechaza el cambio dedicado cuando el contrato no está activo', async () => {
      mockRunInTenantSchema.mockReset();
      mockMutationPrecheck();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => buildContract({ status: ContractStatus.DRAFT }) } }),
      );

      await expect(
        service.updateServicePoint(
          'ctr-1',
          { serviceUsage: ServiceUsage.NON_RESIDENTIAL },
          'actor-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('responde no encontrado si el contrato activo ya no tiene suscriptor', async () => {
      mockLockedSubscriber = null;
      mockRunInTenantSchema.mockReset();
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(buildContract({ status: ContractStatus.ACTIVE }))
        .mockResolvedValueOnce(null);
      mockMutationPrecheck();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne } }),
      );

      await expect(
        service.updateServicePoint(
          'ctr-1',
          { serviceUsage: ServiceUsage.NON_RESIDENTIAL },
          'actor-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('conserva el uso actual si solo se edita el estrato y audita campos sin PII', async () => {
      mockRunInTenantSchema.mockReset();
      const contract = buildContract({
        status: ContractStatus.ACTIVE,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        installationStratum: null,
        vatSnapshot: { treatment: VatTreatment.STANDARD } as Contract['vatSnapshot'],
      });
      const findOne = jest.fn().mockResolvedValueOnce(contract).mockResolvedValueOnce({
        id: 'sub-1',
        tenantId: 'ten-1',
        personType: PersonType.NATURAL,
      });
      const save = jest.fn(async (_entity: unknown, entity: Contract) => entity);
      mockMutationPrecheck();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne, save } }),
      );
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: contract.planId,
        name: 'Plan pyme',
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.FIXED,
      });
      internetVatResolver.resolve.mockReturnValue({
        status: 'RESOLVED',
        treatment: VatTreatment.STANDARD,
        legalBasis: VatLegalBasis.ET_468,
        ratePercent: 19,
        requiresAccountantReview: false,
      });

      const result = await service.updateServicePoint(
        'ctr-1',
        { installationStratum: null },
        'actor-1',
      );

      expect(result.serviceUsage).toBe(ServiceUsage.NON_RESIDENTIAL);
      expect(internetVatResolver.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ usage: ServiceUsage.NON_RESIDENTIAL }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'ContractServicePoint',
          oldValue: { vatTreatment: VatTreatment.STANDARD },
          newValue: expect.objectContaining({
            changedFields: ['installationStratum'],
            vatTreatment: VatTreatment.STANDARD,
          }),
        }),
      );
      expect(JSON.stringify(auditService.log.mock.calls[0]?.[0])).not.toContain(
        'installationAddress',
      );
    });

    it('audita tratamiento anterior nulo para un contrato activo heredado sin instantánea', async () => {
      mockRunInTenantSchema.mockReset();
      const contract = buildContract({
        status: ContractStatus.ACTIVE,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        vatSnapshot: null,
      });
      const findOne = jest.fn().mockResolvedValueOnce(contract).mockResolvedValueOnce({
        id: 'sub-1',
        tenantId: 'ten-1',
        personType: PersonType.NATURAL,
      });
      const save = jest.fn(async (_entity: unknown, entity: Contract) => entity);
      mockMutationPrecheck();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne, save } }),
      );
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: contract.planId,
        name: 'Plan pyme',
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.FIXED,
      });
      internetVatResolver.resolve.mockReturnValue({
        status: 'RESOLVED',
        treatment: VatTreatment.STANDARD,
        legalBasis: VatLegalBasis.ET_468,
        ratePercent: 19,
        requiresAccountantReview: false,
      });

      await service.updateServicePoint(
        'ctr-1',
        { serviceUsage: ServiceUsage.NON_RESIDENTIAL },
        'actor-1',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ oldValue: { vatTreatment: null } }),
      );
    });
  });

  describe('removeStratumEvidence', () => {
    it('es idempotente si el contrato borrador no tiene soporte', async () => {
      const contract = buildContract();
      mockRunInTenantSchema.mockReset();
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.removeStratumEvidence('ctr-1', 'actor-1')).resolves.toBe(contract);
      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.UPDATE,
        entityType: 'ContractStratumEvidence',
        entityId: 'ctr-1',
        userId: 'actor-1',
        oldValue: { hasStratumEvidence: false },
        newValue: { hasStratumEvidence: false },
      });
      expect(mediaService.softDeleteStratumEvidence).not.toHaveBeenCalled();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('rechaza el alta de contrato si falta autorización para el tratamiento contractual', async () => {
      const save = jest.fn();
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'sub-1',
          tenantId: 'ten-1',
          personType: PersonType.NATURAL,
          partyId: 'party-test-uuid',
        }),
        create: jest.fn(),
        save,
      };
      privacyAuthorizationReadPort.hasActive.mockResolvedValueOnce({
        active: false,
        authorizationId: null,
        legalTextVersion: null,
        legacyUnverified: false,
      });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager }),
      );

      await expect(
        service.create(
          { subscriberId: 'sub-1', planId: 'plan-1', planSnapshotJson: {} },
          'actor-1',
        ),
      ).rejects.toMatchObject({
        response: { code: 'CONTRACT_DATA_AUTHORIZATION_REQUIRED' },
        status: 422,
      });

      expect(save).not.toHaveBeenCalled();
      // D2/D3: el alta corre dentro de la transacción y pasa su manager al puerto.
      expect(privacyAuthorizationReadPort.hasActive).toHaveBeenCalledWith(
        'party-test-uuid',
        'TRATAMIENTO_CONTRACTUAL',
        expect.objectContaining({ manager: expect.anything() }),
      );
    });

    it('rechaza el alta de contrato cuando faltan responsabilidades fiscales', async () => {
      const save = jest.fn();
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 'sub-1',
          tenantId: 'ten-1',
          personType: PersonType.NATURAL,
          partyId: 'party-test-uuid',
          vatResponsibility: null,
          rutResponsibilities: [],
        }),
        create: jest.fn(),
        save,
      };
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager }),
      );

      await expect(
        service.create(
          { subscriberId: 'sub-1', planId: 'plan-1', planSnapshotJson: {} },
          'actor-1',
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'SUBSCRIBER_FISCAL_DATA_INCOMPLETE',
          missing: ['VAT_RESPONSIBILITY'],
        },
        status: 422,
      });
      expect(save).not.toHaveBeenCalled();
    });

    it('permite crear contrato para persona natural no responsable sin responsabilidades del RUT', async () => {
      const save = jest.fn(async (_entity: unknown, data: Record<string, unknown>) => ({
        ...data,
        id: 'ctr-natural-sin-rut',
      }));
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'sub-natural-sin-rut',
              tenantId: 'ten-1',
              status: 'PROSPECT',
              personType: PersonType.NATURAL,
              partyId: 'party-test-uuid',
              anonymizedAt: null,
              vatResponsibility: 'NO_RESPONSABLE',
              rutResponsibilities: [],
            }),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save,
          },
        }),
      );

      const result = await service.create(
        { subscriberId: 'sub-natural-sin-rut', planId: 'plan-1', planSnapshotJson: {} },
        'actor-1',
      );

      expect(result.id).toBe('ctr-natural-sin-rut');
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('rechaza crear contrato para jurídica sin RUT y enumera RUT como faltante', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'sub-juridica-sin-rut',
              tenantId: 'ten-1',
              status: 'PROSPECT',
              personType: PersonType.JURIDICA,
              partyId: 'party-test-uuid',
              anonymizedAt: null,
              vatResponsibility: 'RESPONSABLE',
              rutResponsibilities: [],
              nit: null,
              nitVerificationDigit: null,
              legalRepresentativePartyId: null,
            }),
            create: jest.fn(),
            save: jest.fn(),
          },
        }),
      );

      await expect(
        service.create(
          { subscriberId: 'sub-juridica-sin-rut', planId: 'plan-1', planSnapshotJson: {} },
          'actor-1',
        ),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          code: 'SUBSCRIBER_FISCAL_DATA_INCOMPLETE',
          missing: expect.arrayContaining(['RUT_RESPONSIBILITIES']),
        },
      });
    });

    it('audita la creación con IDs y estado, sin copiar valores fiscales ni notas', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async (_entity: unknown, data: Record<string, unknown>) => ({
              ...data,
              id: 'ctr-audit-create',
            }),
          },
        }),
      );

      await service.create(
        {
          subscriberId: 'sub-audit',
          planId: 'plan-audit',
          planSnapshotJson: {},
          fiscalName: 'synthetic-fiscal-name-marker',
          fiscalDocument: 'synthetic-fiscal-document-marker',
          installationNotes: 'synthetic-installation-notes-marker',
        },
        'actor-audit',
      );

      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.CREATE,
        entityType: 'Contract',
        entityId: 'ctr-audit-create',
        userId: 'actor-audit',
        newValue: {
          subscriberId: 'sub-audit',
          planId: 'plan-audit',
          status: ContractStatus.DRAFT,
          billingCycleDay: null,
        },
      });
      const entry = JSON.stringify(auditService.log.mock.calls[0]?.[0]);
      expect(entry).not.toContain('synthetic-fiscal-name-marker');
      expect(entry).not.toContain('synthetic-fiscal-document-marker');
      expect(entry).not.toContain('synthetic-installation-notes-marker');
      expect(entry).not.toContain('installationNotes');
    });

    it('recorta el planId y lo persiste sin espacios, también en la auditoría', async () => {
      let savedPlanId: unknown;
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async (_entity: unknown, data: Record<string, unknown>) => {
              savedPlanId = data['planId'];
              return { ...data, id: 'ctr-plan-trim' };
            },
          },
        }),
      );

      await service.create(
        { subscriberId: 'sub-1', planId: '  plan-fibra-300 ', planSnapshotJson: {} },
        'actor-1',
      );

      expect(savedPlanId).toBe('plan-fibra-300');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({ planId: 'plan-fibra-300' }),
        }),
      );
    });

    it.each([
      ['vacío', ''],
      ['formado solo por espacios', '   '],
      ['de más de 120 caracteres', 'p'.repeat(CONTRACT_PLAN_ID_MAX_LENGTH + 1)],
    ])('rechaza un planId %s antes de abrir la transacción', async (_motivo, planId) => {
      await expect(
        service.create({ subscriberId: 'sub-1', planId, planSnapshotJson: {} }, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('crea contrato con alias autogenerado cuando no se provee', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_e: unknown, data: Record<string, unknown>) => data,
            save: async (_e: unknown, data: Record<string, unknown>) => ({ ...data, id: 'ctr-1' }),
          },
        }),
      );

      const result = await service.create({
        subscriberId: 'sub-1',
        planId: 'plan-1',
        planSnapshotJson: {},
        installationCity: 'EL_COLEGIO',
        installationAddress: 'CR 2 2 02',
      });

      expect(result.id).toBe('ctr-1');
      expect((result as unknown as Record<string, unknown>).alias).toBe(
        'Servicio — El Colegio Cr 2 2 02',
      );
    });

    it('usa el alias provisto cuando viene en el DTO', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_e: unknown, data: Record<string, unknown>) => data,
            save: async (_e: unknown, data: Record<string, unknown>) => ({ ...data, id: 'ctr-2' }),
          },
        }),
      );

      const result = await service.create({
        subscriberId: 'sub-1',
        planId: 'plan-1',
        planSnapshotJson: {},
        alias: 'Mi alias personalizado',
      });

      expect((result as unknown as Record<string, unknown>).alias).toBe('Mi alias personalizado');
    });

    it('persiste quoteId null cuando no se proporciona', async () => {
      let savedData: Record<string, unknown> = {};
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            create: (_e: unknown, data: Record<string, unknown>) => data,
            save: async (_e: unknown, data: Record<string, unknown>) => {
              savedData = data;
              return { ...data, id: 'ctr-3' };
            },
          },
        }),
      );

      await service.create({ subscriberId: 'sub-1', planId: 'p-1', planSnapshotJson: {} });

      expect(savedData.quoteId).toBeNull();
    });

    it('crea un punto residencial con sus campos fiscales cuando el titular es persona natural', async () => {
      let savedData: Record<string, unknown> = {};
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: jest.fn().mockResolvedValue({
              id: 'sub-1',
              tenantId: 'ten-1',
              personType: PersonType.NATURAL,
              partyId: 'party-test-uuid',
            }),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async (_entity: unknown, data: Record<string, unknown>) => {
              savedData = data;
              return { ...data, id: 'ctr-residential' };
            },
          },
        }),
      );

      const result = await service.create({
        subscriberId: 'sub-1',
        planId: 'plan-fibra-300',
        planSnapshotJson: { id: 'plan-fibra-300' },
        quoteId: 'quote-1',
        alias: ' Punto principal ',
        installationAddress: 'Cra 10 #20-30',
        installationCity: 'Bogotá',
        installationDepartment: 'Cundinamarca',
        installationPostalCode: '110111',
        installationNotes: 'Torre 2',
        customerSegment: CustomerSegment.RESIDENTIAL,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        additionalProductIds: ['product-1'],
        additionalServiceIds: ['service-1'],
        paymentMethod: 'PSE',
        billingCycle: 'MONTHLY',
        fiscalName: 'Titular de prueba',
        fiscalDocument: 'documento-hash-fixture',
        fiscalAddress: 'Dirección fiscal de prueba',
        startDate: '2026-10-01',
        endDate: '2027-10-01',
      });

      expect(result.id).toBe('ctr-residential');
      expect(savedData).toMatchObject({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        additionalProductIds: ['product-1'],
        additionalServiceIds: ['service-1'],
        fiscalName: 'Titular de prueba',
        fiscalDocument: null,
      });
      expect(Reflect.get(savedData, 'fiscalDocumentEncrypted')).toBeDefined();
      expect(Reflect.get(savedData, 'fiscalDocumentHmac')).toHaveLength(64);
      expect(savedData.alias).toBe('Punto principal');
    });
  });

  it('rechaza la creación de contrato con 409 si el titular está bloqueado', async () => {
    mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => ({
            id: 'sub-1',
            tenantId: 'ten-1',
            personType: PersonType.NATURAL,
            partyId: 'party-1',
            anonymizedAt: null,
          }),
        },
      }),
    );
    privacyMarksReadPort.activeMarks.mockResolvedValueOnce({
      'party-1': ['DATOS_BLOQUEADOS'],
    });

    await expect(
      service.create({ subscriberId: 'sub-1', planId: 'plan-1', planSnapshotJson: {} }),
    ).rejects.toMatchObject({ response: { code: 'PRIVACY_DATA_BLOCKED' } });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  // ── createFromExpediente ──────────────────────────────────────────────────

  describe('createFromExpediente', () => {
    it('rechaza la creación desde expediente con 409 si el titular está bloqueado', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => ({
              id: 'sub-1',
              tenantId: 'ten-1',
              personType: PersonType.NATURAL,
              partyId: 'party-1',
              anonymizedAt: null,
            }),
          },
        }),
      );
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({
        'party-1': ['DATOS_BLOQUEADOS'],
      });

      await expect(service.createFromExpediente('sub-1', {})).rejects.toMatchObject({
        response: { code: 'PRIVACY_DATA_BLOCKED' },
      });
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('lanza NotFoundException cuando el subscriber no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(service.createFromExpediente('sub-x', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException cuando el expediente no existe', async () => {
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 'sub-1', partyId: 'party-test-uuid', expedienteId: 'exp-1' }) // subscriber
          .mockResolvedValueOnce(null), // expediente no encontrado
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      await expect(service.createFromExpediente('sub-1', {})).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException cuando el expediente no tiene planId', async () => {
      const mockManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ id: 'sub-1', partyId: 'party-test-uuid', expedienteId: 'exp-1' })
          .mockResolvedValueOnce({ id: 'exp-1', interestedPlanId: null }),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      await expect(service.createFromExpediente('sub-1', {})).rejects.toThrow(BadRequestException);
    });

    it('crea contrato DRAFT con datos del expediente', async () => {
      const subscriber = {
        id: 'sub-1',
        partyId: 'party-test-uuid',
        expedienteId: 'exp-1',
        address: 'Cra 7',
        city: 'Bogotá',
        department: null,
        postalCode: null,
        customerSegment: 'RESIDENTIAL',
      };
      const expediente = {
        id: 'exp-1',
        interestedPlanId: 'plan-fibra-100',
        additionalProductIds: ['prod-1'],
        additionalServiceIds: [],
        paymentMethod: 'PSE',
        billingCycle: 'MONTHLY',
        fiscalName: null,
        address: 'Cra 7 #10-20',
        stratum: 4,
        city: 'Bogotá',
        department: 'Cundinamarca',
        postalCode: '110010',
      };

      let savedEntity: Record<string, unknown> = {};
      const mockManager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
        create: (_e: unknown, data: Record<string, unknown>) => data,
        save: async (_e: unknown, data: Record<string, unknown>) => {
          savedEntity = data;
          return { ...data, id: 'ctr-4' };
        },
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      const result = await service.createFromExpediente('sub-1', {});

      expect(result.id).toBe('ctr-4');
      expect(savedEntity.planId).toBe('plan-fibra-100');
      expect(savedEntity.status).toBe(ContractStatus.DRAFT);
      expect(savedEntity.paymentMethod).toBe('PSE');
      expect(savedEntity.serviceUsage).toBeNull();
      expect(savedEntity.installationStratum).toBe(4);
      expect(Array.isArray(savedEntity.additionalProductIds)).toBe(true);
    });

    it('descifra el documento fiscal heredado/cifrado antes de cifrarlo en el contrato', async () => {
      const sourceDocument = 'synthetic-expediente-fiscal-read';
      const encryptedSourceDocument = encryptAes256Gcm(sourceDocument, syntheticFiscalCryptoKey);
      const subscriber = {
        id: 'sub-1',
        partyId: 'party-test-uuid',
        expedienteId: 'exp-1',
        address: 'Dirección sintética',
        city: 'Bogotá',
        department: null,
        postalCode: null,
        customerSegment: null,
      };
      const expediente = {
        id: 'exp-1',
        interestedPlanId: 'plan-fibra-100',
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: null,
        billingCycle: null,
        fiscalName: null,
        fiscalDocument: null,
        address: 'Dirección sintética',
        municipality: 'Bogotá',
        department: null,
        postalCode: null,
      };
      let savedEntity: Record<string, unknown> = {};
      const mockManager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
        find: jest.fn().mockResolvedValue([]),
        query: jest
          .fn()
          .mockResolvedValueOnce([
            {
              fiscal_document: null,
              fiscal_document_encrypted: encryptedSourceDocument,
              fiscal_document_hmac: 'synthetic-source-hmac',
            },
          ])
          .mockImplementationOnce(async () => [
            {
              id: 'ctr-fiscal-conversion',
              fiscal_document: null,
              fiscal_document_encrypted: Reflect.get(
                savedEntity,
                'fiscalDocumentEncrypted',
              ) as string,
              fiscal_document_hmac: Reflect.get(savedEntity, 'fiscalDocumentHmac') as string,
            },
          ]),
        create: (_entity: unknown, data: Record<string, unknown>) => data,
        save: async (_entity: unknown, data: Record<string, unknown>) => {
          savedEntity = data;
          return { ...data, id: 'ctr-fiscal-conversion' };
        },
      };
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: mockManager }),
      );

      const result = await service.createFromExpediente('sub-1', {});

      expect(savedEntity.fiscalDocument).toBeNull();
      expect(Reflect.get(savedEntity, 'fiscalDocumentEncrypted')).toBeDefined();
      expect(Reflect.get(savedEntity, 'fiscalDocumentHmac')).toHaveLength(64);
      expect(result.fiscalDocument).toBe(sourceDocument);
    });

    it('continúa la conversión si el SELECT fiscal secundario no devuelve fila', async () => {
      const subscriber = {
        id: 'sub-1',
        partyId: 'party-test-uuid',
        expedienteId: 'exp-1',
        address: null,
        city: null,
        department: null,
        postalCode: null,
        customerSegment: null,
      };
      const expediente = {
        id: 'exp-1',
        interestedPlanId: 'plan-fibra-100',
        additionalProductIds: [],
        additionalServiceIds: [],
        fiscalName: null,
        fiscalDocument: null,
        address: null,
        municipality: null,
        department: null,
        postalCode: null,
      };
      let savedEntity: Record<string, unknown> = {};
      const mockManager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
        find: jest.fn().mockResolvedValue([]),
        query: jest.fn().mockResolvedValue([]),
        create: (_entity: unknown, data: Record<string, unknown>) => data,
        save: async (_entity: unknown, data: Record<string, unknown>) => {
          savedEntity = data;
          return { ...data, id: 'ctr-without-fiscal-row' };
        },
      };
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: mockManager }),
      );

      const result = await service.createFromExpediente('sub-1', {});

      expect(result.id).toBe('ctr-without-fiscal-row');
      expect(savedEntity.fiscalDocument).toBeNull();
      expect(mockManager.query).toHaveBeenCalledTimes(2);
    });

    it('recorta el interés del expediente antes de usarlo como planId y en la instantánea', async () => {
      const subscriber = {
        id: 'sub-1',
        partyId: 'party-test-uuid',
        expedienteId: 'exp-1',
        address: null,
        city: null,
        department: null,
        postalCode: null,
        customerSegment: null,
      };
      const expediente = {
        id: 'exp-1',
        interestedPlanId: '  plan-fibra-100 ',
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: null,
        billingCycle: null,
        fiscalName: null,
        address: null,
        stratum: null,
        city: null,
        department: null,
        postalCode: null,
      };
      let savedEntity: Record<string, unknown> = {};
      const mockManager = {
        findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
        create: (_e: unknown, data: Record<string, unknown>) => data,
        save: async (_e: unknown, data: Record<string, unknown>) => {
          savedEntity = data;
          return { ...data, id: 'ctr-plan-trim-exp' };
        },
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: mockManager }),
      );

      await service.createFromExpediente('sub-1', {});

      expect(savedEntity.planId).toBe('plan-fibra-100');
      expect(savedEntity.planSnapshotJson).toEqual({ id: 'plan-fibra-100', source: 'expediente' });
    });

    it.each([
      ['vacío', ''],
      ['formado solo por espacios', '   '],
      ['de más de 120 caracteres', 'p'.repeat(CONTRACT_PLAN_ID_MAX_LENGTH + 1)],
    ])(
      'rechaza un plan de interés %s sin persistir el contrato',
      async (_motivo, interestedPlanId) => {
        const mockManager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'sub-1',
              partyId: 'party-test-uuid',
              expedienteId: 'exp-1',
            })
            .mockResolvedValueOnce({ id: 'exp-1', interestedPlanId }),
          create: jest.fn(),
          save: jest.fn(),
        };
        mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
          cb({ manager: mockManager }),
        );

        await expect(service.createFromExpediente('sub-1', {})).rejects.toThrow(
          BadRequestException,
        );
        expect(mockManager.save).not.toHaveBeenCalled();
        expect(auditService.log).not.toHaveBeenCalled();
      },
    );

    it('prioriza expediente y dirección recibidos y no hereda estrato de otro punto', async () => {
      const subscriber = {
        id: 'sub-1',
        partyId: 'party-test-uuid',
        expedienteId: 'exp-subscriber',
        address: 'Dirección anterior',
        city: 'Ciudad anterior',
        department: 'Departamento anterior',
        postalCode: '00000',
        customerSegment: CustomerSegment.RESIDENTIAL,
        personType: PersonType.NATURAL,
      };
      const expediente = {
        id: 'exp-explicit',
        interestedPlanId: 'plan-expediente',
        address: 'Dirección original',
        municipality: 'Municipio original',
        department: 'Departamento original',
        postalCode: '11111',
        stratum: 2,
        customerSegment: CustomerSegment.RESIDENTIAL,
        additionalProductIds: null,
        additionalServiceIds: null,
        paymentMethod: 'PSE',
        billingCycle: 'MONTHLY',
        fiscalName: 'Titular del expediente',
      };
      let savedData: Record<string, unknown> = {};
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async (_entity: unknown, data: Record<string, unknown>) => {
              savedData = data;
              return { ...data, id: 'ctr-explicit' };
            },
          },
        }),
      );

      await service.createFromExpediente('sub-1', {
        expedienteId: 'exp-explicit',
        installationAddress: 'Dirección del nuevo punto',
        installationCity: 'Nueva ciudad',
        installationDepartment: 'Nuevo departamento',
        installationPostalCode: '22222',
        installationNotes: 'Apto 3',
        customerSegment: CustomerSegment.PYME,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        paymentMethod: 'TRANSFER',
        billingCycle: 'QUARTERLY',
      });

      expect(savedData).toMatchObject({
        planId: 'plan-expediente',
        installationAddress: 'Dirección del nuevo punto',
        installationCity: 'Nueva ciudad',
        installationDepartment: 'Nuevo departamento',
        installationPostalCode: '22222',
        installationNotes: 'Apto 3',
        customerSegment: CustomerSegment.PYME,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        installationStratum: null,
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: 'TRANSFER',
        billingCycle: 'QUARTERLY',
        fiscalName: 'Titular del expediente',
      });
    });

    it('usa los datos del suscriptor cuando el expediente no los tiene y hereda estrato del mismo punto', async () => {
      const subscriber = {
        id: 'sub-1',
        partyId: 'party-test-uuid',
        expedienteId: null,
        address: 'Calle 12 #4-20',
        city: 'Cali',
        department: 'Valle del Cauca',
        postalCode: '760001',
        customerSegment: null,
        personType: PersonType.NATURAL,
      };
      const expediente = {
        id: 'exp-1',
        interestedPlanId: 'plan-1',
        address: 'Calle 12 #4-20',
        municipality: null,
        department: null,
        postalCode: null,
        stratum: 2,
        customerSegment: null,
        additionalProductIds: null,
        additionalServiceIds: undefined,
        paymentMethod: null,
        billingCycle: undefined,
        fiscalName: undefined,
      };
      let savedData: Record<string, unknown> = {};
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: jest.fn().mockResolvedValueOnce(subscriber).mockResolvedValueOnce(expediente),
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async (_entity: unknown, data: Record<string, unknown>) => {
              savedData = data;
              return { ...data, id: 'ctr-fallback' };
            },
          },
        }),
      );

      await service.createFromExpediente('sub-1', {
        expedienteId: 'exp-1',
        serviceUsage: ServiceUsage.RESIDENTIAL,
      });

      expect(savedData).toMatchObject({
        installationAddress: 'Calle 12 #4-20',
        installationCity: 'Cali',
        installationDepartment: 'Valle del Cauca',
        installationPostalCode: '760001',
        customerSegment: null,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: null,
        billingCycle: null,
        fiscalName: null,
      });
    });

    it('rechaza la creación si ni el DTO ni el suscriptor aportan expediente', async () => {
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => ({ id: 'sub-1', partyId: 'party-test-uuid', expedienteId: null }),
          },
        }),
      );

      await expect(service.createFromExpediente('sub-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('aplica los filtros de estado y plan al listado general', async () => {
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[buildContract()], 1]),
      };
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { createQueryBuilder: () => qb } }),
      );

      const result = await service.findAll({
        status: ContractStatus.DRAFT,
        planId: 'plan-fibra-300',
        page: 2,
        limit: 5,
      });

      expect(qb.andWhere).toHaveBeenNthCalledWith(1, 'c.status = :status', {
        status: ContractStatus.DRAFT,
      });
      expect(qb.andWhere).toHaveBeenNthCalledWith(2, 'c.planId = :planId', {
        planId: 'plan-fibra-300',
      });
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(result.data).toHaveLength(1);
    });

    it('resuelve el documento fiscal heredado y deja intactos contratos sin fila fiscal', async () => {
      const legacyContract = buildContract({ id: 'ctr-legacy' });
      const missingFiscalRow = buildContract({ id: 'ctr-no-fiscal' });
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[legacyContract, missingFiscalRow], 2]),
      };
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => qb,
            find: async () => [],
            query: async () => [
              {
                id: legacyContract.id,
                fiscal_document: 'synthetic-legacy-fiscal',
                fiscal_document_encrypted: null,
                fiscal_document_hmac: null,
              },
            ],
          },
        }),
      );

      const result = await service.findAll({ page: 1, limit: 5 });

      expect(result.data[0]?.fiscalDocument).toBe('synthetic-legacy-fiscal');
      expect(result.data[1]?.fiscalDocument).toBeNull();
    });

    it('audita filas bloqueadas servidas sin redacción a un usuario con permiso', async () => {
      const contract = buildContract();
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[contract], 1]),
      };
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              createQueryBuilder: () => qb,
              find: async () => [{ id: 'sub-1', partyId: 'party-1', anonymizedAt: null }],
            },
          }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) => cb({ manager: {} }));
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({
        'party-1': ['DATOS_BLOQUEADOS'],
      });

      const result = await service.findAll({}, true, 'actor-1');

      expect(result.data[0]?.alias).toBe(contract.alias);
      expect(result).not.toHaveProperty('blockedServed');
      expect(auditService.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LIST_ACCESS,
          entityType: 'ContractList',
          userId: 'actor-1',
          newValue: { totalServed: 1, totalAvailable: 1, blockedServed: 1 },
        }),
        expect.any(Object),
      );
    });
  });

  // ── findAllBySubscriber ───────────────────────────────────────────────────

  describe('findAllBySubscriber', () => {
    it('retorna lista de contratos del subscriber', async () => {
      const contracts = [buildContract(), buildContract({ id: 'ctr-2' })];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => ({
              where: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              addOrderBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([contracts, 2]),
            }),
          },
        }),
      );

      const result = await service.findAllBySubscriber('sub-1');

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.capabilities.sortableFields).toEqual([]);
    });
  });

  // ── Transiciones de estado ────────────────────────────────────────────────

  describe('activate', () => {
    it('activa y persiste la instantánea resuelta desde el catálogo y el puerto de Taxation', async () => {
      const contract = buildContract({
        status: ContractStatus.DRAFT,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: '00000000-0000-4000-8000-000000000002',
      });
      const savedSubscriber = { id: 'sub-1', tenantId: 'ten-1', personType: PersonType.NATURAL };
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: 'plan-fibra-300',
        name: 'Plan prueba',
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.FIXED,
      });
      internetVatResolver.resolve.mockReturnValue({
        status: 'RESOLVED',
        treatment: VatTreatment.EXEMPT,
        legalBasis: VatLegalBasis.ET_481_H,
        ratePercent: 0,
        requiresAccountantReview: false,
      });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => savedSubscriber } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.activate('ctr-1', 'actor-1');
      expect(result.status).toBe(ContractStatus.ACTIVE);
      expect(result.vatSnapshot).toMatchObject({
        treatment: VatTreatment.EXEMPT,
        legalBasis: VatLegalBasis.ET_481_H,
        ratePercent: 0,
      });
      expect(commercialCatalogPort.getPlanById).toHaveBeenCalledWith(
        'ten-1',
        'tenant_test',
        contract.planId,
        expect.objectContaining({ manager: expect.anything() }),
      );
      expect(auditService.logWithin).toHaveBeenCalledWith(
        {
          action: AuditAction.UPDATE,
          entityType: 'Contract',
          entityId: contract.id,
          userId: 'actor-1',
          oldValue: { status: ContractStatus.DRAFT, billingCycleDay: 1 },
          newValue: { status: ContractStatus.ACTIVE, billingCycleDay: 1 },
        },
        expect.any(Object),
      );
    });

    it('activa sobre la versión vigente releída bajo bloqueo, sin guardar una entidad previa', async () => {
      const previous = buildContract({ updatedAt: new Date('2026-04-24T00:00:00.000Z') });
      const locked = buildContract({
        updatedAt: new Date('2026-04-24T00:00:01.000Z'),
        alias: 'Alias vigente',
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
      });
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: locked.planId,
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.FIXED,
      });
      const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(previous);
      const readLocked = jest.fn().mockResolvedValue(locked);
      const save = jest.fn(async (_entity: unknown, entity: Contract) => entity);
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({ manager: { findOne: readLocked, save } }),
      );

      const result = await service.activate('ctr-1');

      expect(result.status).toBe(ContractStatus.ACTIVE);
      expect(result.alias).toBe('Alias vigente');
      expect(findOne).not.toHaveBeenCalled();
      expect(readLocked).toHaveBeenCalledWith(
        Contract,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(mockContractQuery.mock.calls[0][0]).toContain('FOR SHARE OF s');
      expect(save).toHaveBeenCalledWith(Contract, locked);
      expect(save).not.toHaveBeenCalledWith(Contract, previous);
    });

    it('lanza ConflictException si el contrato no está en DRAFT', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.activate('ctr-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('validación de activación', () => {
    it('responde 422 cuando falta el uso', async () => {
      const contract = buildContract({ serviceUsage: null });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );
      await expect(service.activate('ctr-1')).rejects.toThrow(UnprocessableEntityException);
      expect(commercialCatalogPort.getPlanById).not.toHaveBeenCalled();
    });

    it('responde 422 cuando el plan no tiene concepto fiscal', async () => {
      const contract = buildContract({ serviceUsage: ServiceUsage.NON_RESIDENTIAL });
      const subscriber = { id: 'sub-1', tenantId: 'ten-1', personType: PersonType.NATURAL };
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => subscriber } }),
        );
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: contract.planId,
        name: 'Legado',
        vatConcept: null,
        networkType: NetworkType.FIXED,
      });
      await expect(service.activate('ctr-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('rechaza persona jurídica con uso residencial con 422', async () => {
      const contract = buildContract({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
      });
      const subscriber = { id: 'sub-1', tenantId: 'ten-1', personType: PersonType.JURIDICA };
      mockLockedSubscriber = subscriber;
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => subscriber } }),
        );
      await expect(service.activate('ctr-1')).rejects.toThrow(UnprocessableEntityException);
      expect(commercialCatalogPort.getPlanById).not.toHaveBeenCalled();
    });
  });

  describe('suspend', () => {
    it('transiciona ACTIVE → SUSPENDED', async () => {
      const resultContract = buildContract({ status: ContractStatus.SUSPENDED });
      jest.spyOn(service, 'findOne').mockResolvedValue(resultContract);
      const result = await service.suspend('ctr-1', { reasonCode: 'MORA' }, 'actor-1');
      expect(subscriberLifecycleService.transitionContract).toHaveBeenCalledWith(
        'ctr-1',
        'SUSPEND',
        { reasonCode: 'MORA' },
        'actor-1',
        undefined,
      );
      expect(result).toBe(resultContract);
    });
  });

  describe('reactivate', () => {
    it('transiciona SUSPENDED → ACTIVE', async () => {
      const resultContract = buildContract({ status: ContractStatus.ACTIVE });
      jest.spyOn(service, 'findOne').mockResolvedValue(resultContract);
      const result = await service.reactivate(
        'ctr-1',
        { reasonCode: 'PAGO_REGISTRADO' },
        'actor-1',
      );
      expect(subscriberLifecycleService.transitionContract).toHaveBeenCalledWith(
        'ctr-1',
        'REACTIVATE',
        { reasonCode: 'PAGO_REGISTRADO' },
        'actor-1',
        undefined,
        expect.any(Function),
      );
      expect(result).toBe(resultContract);
    });
  });

  describe('terminate', () => {
    it('transiciona ACTIVE → TERMINATED', async () => {
      const resultContract = buildContract({ status: ContractStatus.TERMINATED });
      jest.spyOn(service, 'findOne').mockResolvedValue(resultContract);
      const command: LifecycleTerminateCommand = {
        reasonCode: 'SOLICITUD_TITULAR',
        contractIds: ['ctr-1'],
      };
      const result = await service.terminate('ctr-1', command, 'actor-1');
      expect(subscriberLifecycleService.transitionContract).toHaveBeenCalledWith(
        'ctr-1',
        'TERMINATE',
        command,
        'actor-1',
        undefined,
      );
      expect(result).toBe(resultContract);
    });

    it('transiciona SUSPENDED → TERMINATED', async () => {
      const resultContract = buildContract({ status: ContractStatus.TERMINATED });
      jest.spyOn(service, 'findOne').mockResolvedValue(resultContract);
      const command: LifecycleTerminateCommand = {
        reasonCode: 'SOLICITUD_TITULAR',
        contractIds: ['ctr-1'],
      };
      const result = await service.terminate('ctr-1', command, 'actor-1');
      expect(result).toBe(resultContract);
    });
  });

  describe('archive', () => {
    it.each([
      [ContractStatus.SUSPENDED, ContractStatus.ARCHIVED, null],
      [ContractStatus.TERMINATED, ContractStatus.ARCHIVED, new Date('2020-01-01T00:00:00Z')],
      [ContractStatus.ACTIVE, ContractStatus.TERMINATED, null],
    ])('ancla el fin inmutable de %s a %s', async (status, target, terminatedAt) => {
      const contract = buildContract({ status, terminatedAt });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );
      const result = await (
        service as unknown as {
          _transition(id: string, target: ContractStatus): Promise<Contract>;
        }
      )._transition('ctr-1', target);
      expect(result.terminatedAt).toEqual(terminatedAt ?? result.statusChangedAt);
      expect(result.terminatedAt).toBeInstanceOf(Date);
    });

    it('transiciona TERMINATED → ARCHIVED', async () => {
      const contract = buildContract({ status: ContractStatus.TERMINATED });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.archive('ctr-1');
      expect(result.status).toBe(ContractStatus.ARCHIVED);
    });

    it('lanza ConflictException al intentar archivar contrato ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.archive('ctr-1')).rejects.toThrow(ConflictException);
    });

    it('ARCHIVED no puede transicionar a ningún estado (estado final)', async () => {
      const contract = buildContract({ status: ContractStatus.ARCHIVED });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      // archive desde ARCHIVED intenta ARCHIVED → ARCHIVED, no está permitido
      await expect(service.archive('ctr-1')).rejects.toThrow(ConflictException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('elimina (soft-delete) un contrato en DRAFT', async () => {
      const contract = buildContract({ status: ContractStatus.DRAFT });
      const softDeleteSpy = jest.fn().mockResolvedValue(undefined);

      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract, softDelete: softDeleteSpy } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { softDelete: softDeleteSpy } }),
        );

      await expect(service.remove('ctr-1', 'actor-1')).resolves.toBeUndefined();
      expect(softDeleteSpy).toHaveBeenCalledWith(expect.anything(), {
        id: 'ctr-1',
        tenantId: 'ten-1',
      });
      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.DELETE,
        entityType: 'Contract',
        entityId: 'ctr-1',
        userId: 'actor-1',
        oldValue: { status: ContractStatus.DRAFT },
        newValue: { deleted: true },
      });
    });

    it('lanza BadRequestException al intentar eliminar un contrato ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.remove('ctr-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('audita nombres de campos permitidos y omite installationNotes y sus valores', async () => {
      const entity = buildContract({ status: ContractStatus.DRAFT });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => entity } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_entity: unknown, contract: Contract) => contract } }),
        );

      await service.update(
        'ctr-1',
        {
          fiscalName: 'synthetic-fiscal-name-marker',
          fiscalDocument: 'synthetic-fiscal-document-marker',
          installationNotes: 'synthetic-installation-notes-marker',
          alias: 'Nuevo alias',
        },
        'actor-1',
      );

      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.UPDATE,
        entityType: 'Contract',
        entityId: 'ctr-1',
        userId: 'actor-1',
        oldValue: { status: ContractStatus.DRAFT },
        newValue: { changedFields: ['fiscalName', 'fiscalDocument', 'alias'] },
      });
      const entry = JSON.stringify(auditService.log.mock.calls[0]?.[0]);
      expect(entry).not.toContain('synthetic-fiscal-name-marker');
      expect(entry).not.toContain('synthetic-fiscal-document-marker');
      expect(entry).not.toContain('synthetic-installation-notes-marker');
      expect(entry).not.toContain('installationNotes');
    });

    it('restringe los campos fiscales al estado DRAFT', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(
        service.update('ctr-1', { fiscalAddress: 'Dirección de prueba' }),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza ConflictException al intentar cambiar planSnapshotJson en contrato ACTIVE', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(
        service.update('ctr-1', { planSnapshotJson: { id: 'plan-nuevo' } }),
      ).rejects.toThrow(ConflictException);
    });

    it('actualiza alias sin problemas', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.update('ctr-1', { alias: 'Nuevo alias' });
      expect(result.alias).toBe('Nuevo alias');
    });

    it('rechaza editar un contrato anonimizado antes de escribir o proyectar la respuesta', async () => {
      const save = jest.fn();
      mockLockedSubscriber = {
        ...mockLockedSubscriber,
        anonymizedAt: new Date('2026-10-15T12:00:00.000Z'),
      };
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { save } }),
      );

      await expect(
        service.update('ctr-1', { alias: 'Alias corregido' }, 'actor-1'),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
      });
      expect(save).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('aplica los campos editables de un borrador y conserva los valores nulos explícitos', async () => {
      const contract = buildContract({ status: ContractStatus.DRAFT });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_entity: unknown, entity: Contract) => entity } }),
        );

      const patch = {
        alias: '  Alias actualizado  ',
        quoteId: null,
        installationAddress: null,
        installationCity: 'Cali',
        installationDepartment: null,
        installationPostalCode: '760001',
        installationNotes: 'Portería',
        customerSegment: CustomerSegment.PYME,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        installationStratum: null,
        additionalProductIds: ['product-2'],
        additionalServiceIds: ['service-2'],
        paymentMethod: null,
        billingCycle: 'MONTHLY',
        fiscalName: 'Razón social de prueba',
        fiscalDocument: null,
        fiscalAddress: 'Calle de prueba',
        startDate: '2026-10-01',
        endDate: null,
        planSnapshotJson: { id: 'plan-fibra-300', revision: 2 },
      };
      const result = await service.update('ctr-1', patch as never);

      expect(result).toMatchObject({
        alias: 'Alias actualizado',
        quoteId: null,
        installationAddress: null,
        installationCity: 'Cali',
        installationDepartment: null,
        installationPostalCode: '760001',
        customerSegment: CustomerSegment.PYME,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
        installationStratum: null,
        additionalProductIds: ['product-2'],
        additionalServiceIds: ['service-2'],
        paymentMethod: null,
        billingCycle: 'MONTHLY',
        fiscalName: 'Razón social de prueba',
        fiscalDocument: null,
        fiscalAddress: 'Calle de prueba',
        startDate: '2026-10-01',
        endDate: null,
        planSnapshotJson: { id: 'plan-fibra-300', revision: 2 },
      });
    });
  });

  // ── Cobertura: agenda de corte, guardas de titular y delegaciones de ciclo de vida ──
  describe('agenda de corte, guardas y delegaciones (cobertura unitaria)', () => {
    beforeEach(() => {
      // El arnés reemplaza query y manager del qr; solo hace falta un manager base.
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) => cb({ manager: {} }));
      // Vacía respuestas «Once» que otros bloques dejaron sin consumir.
      privacyMarksReadPort.activeMarks.mockReset();
      privacyMarksReadPort.activeMarks.mockResolvedValue({});
    });

    afterEach(() => {
      mockAgendaRows = null;
      mockActiveBillingCycleExists = true;
    });

    const agendaRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
      contract_id: 'ctr-1',
      subscriber_id: 'sub-1',
      billing_cycle_day: 1,
      plan_name: 'Fibra sintética 300',
      projected_subscriber_id: 'sub-1',
      subscriber_tenant_id: 'ten-1',
      party_id: 'party-1',
      user_id: null,
      subscriber_status: 'ACTIVE',
      person_type: PersonType.NATURAL,
      customer_segment: null,
      stratum: 3,
      vat_treatment: null,
      vat_responsibility: 'RESPONSABLE',
      rut_responsibilities: ['O-13'],
      legal_representative_party_id: null,
      tax_regime: null,
      expediente_id: 'exp-1',
      document_type: null,
      first_name: 'Ana',
      last_name: 'Pérez',
      business_name: null,
      commercial_name: null,
      anonymized_at: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z',
      ...overrides,
    });

    it('añade el estado de pago del periodo desde el puerto de Billing', async () => {
      mockAgendaRows = [agendaRow()];
      billingAccountReadPort.periodStates.mockResolvedValueOnce({
        'ctr-1': { state: 'PAGADO', paidAmount: '119.00', totalAmount: '119.00' },
      });

      const result = await service.getCutoffAgenda(
        { date: '2026-11-15', page: 1, limit: 25 },
        'SALES',
      );

      expect(billingAccountReadPort.periodStates).toHaveBeenCalledWith(['ctr-1'], '2026-11-15');
      expect(result.items[0]).toMatchObject({
        contractId: 'ctr-1',
        paymentState: 'PAGADO',
        paymentPaidAmount: '119.00',
        paymentTotalAmount: '119.00',
      });
      expect(
        mockContractQuery.mock.calls.some(([sql]) =>
          /UPDATE\s+(contracts|subscribers)/iu.test(String(sql)),
        ),
      ).toBe(false);
    });

    it('cuenta servicios, marca bloqueados atendidos y proyecta plan y nombre por tipo de titular', async () => {
      mockAgendaRows = [
        agendaRow(),
        agendaRow({
          contract_id: 'ctr-2',
          subscriber_id: 'sub-2',
          projected_subscriber_id: 'sub-2',
          party_id: 'party-2',
          person_type: PersonType.JURIDICA,
          business_name: 'Empresa Sintética',
          first_name: null,
          last_name: null,
          plan_name: null,
        }),
      ];
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({
        'party-2': ['DATOS_BLOQUEADOS'],
      });

      const result = await service.getCutoffAgenda(
        { date: '2026-11-15', page: 1, limit: 25 },
        'SALES',
        true,
        'actor-1',
      );

      expect(result.meta.total).toBe(2);
      expect(result.withoutCycleCount).toBe(2);
      expect(result).not.toHaveProperty('blockedServed');
      expect(result.items[0]).toMatchObject({
        contractId: 'ctr-1',
        subscriberId: 'sub-1',
        planName: 'Fibra sintética 300',
        billingCycleDay: 1,
        cutoffDate: '2026-11-15',
      });
      expect(result.items[1]).toMatchObject({ contractId: 'ctr-2', planName: null });
      // BR-8: la auditoría ocurre antes de responder y un fallo suyo es 503,
      // así que la agenda escribe con logWithin (transaccional), no con log.
      expect(auditService.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LIST_ACCESS,
          entityType: 'BillingCycleCutoffAgenda',
          entityId: 'N/A',
          userId: 'actor-1',
          newValue: {
            date: '2026-11-15',
            totalServed: 2,
            totalAvailable: 2,
            blockedServed: 1,
          },
        }),
        expect.anything(),
      );
    });

    it('usa «Anonimizado» cuando la fecha de anonimización llega como texto y no audita', async () => {
      mockAgendaRows = [agendaRow({ anonymized_at: '2026-03-01T00:00:00Z' })];

      const result = await service.getCutoffAgenda(
        { date: '2026-11-15', page: 1, limit: 25 },
        'SALES',
        true,
        'actor-1',
      );

      expect(result.items[0]?.subscriberDisplayName).toBe('Anonimizado');
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('delega suspender, terminar y previsualizar servicios del suscriptor en el ciclo de vida', async () => {
      const command = { reasonCode: 'MORA' } as never;
      subscriberLifecycleService.suspend.mockResolvedValueOnce({ affected: 1 });
      subscriberLifecycleService.terminate.mockResolvedValueOnce({ affected: 2 });
      subscriberLifecycleService.preview.mockResolvedValueOnce({ contracts: [] });

      await expect(
        service.suspendSubscriberServices('sub-1', command, 'actor-1', 'idem-1'),
      ).resolves.toEqual({ affected: 1 });
      expect(subscriberLifecycleService.suspend).toHaveBeenCalledWith(
        'sub-1',
        command,
        'actor-1',
        'idem-1',
      );
      await expect(
        service.terminateSubscriberServices('sub-1', command, 'actor-1', 'idem-terminate'),
      ).resolves.toEqual({ affected: 2 });
      expect(subscriberLifecycleService.terminate).toHaveBeenCalledWith(
        'sub-1',
        command,
        'actor-1',
        'idem-terminate',
      );
      const previewRequest = { action: 'SUSPEND' } as never;
      await expect(service.previewSubscriberServices('sub-1', previewRequest)).resolves.toEqual({
        contracts: [],
      });
      expect(subscriberLifecycleService.preview).toHaveBeenCalledWith('sub-1', previewRequest);
    });

    it('reactivar servicios pasa el preparador de activación al ciclo de vida', async () => {
      subscriberLifecycleService.reactivate.mockResolvedValueOnce({ affected: 1 });

      await expect(
        service.reactivateSubscriberServices('sub-1', {} as never, 'actor-1', 'idem-2'),
      ).resolves.toEqual({ affected: 1 });
      expect(subscriberLifecycleService.reactivate).toHaveBeenCalledWith(
        'sub-1',
        {},
        'actor-1',
        'idem-2',
        expect.any(Function),
      );
      const prepare = subscriberLifecycleService.reactivate.mock.calls[0]?.[4] as (
        qr: unknown,
        ids: readonly string[],
      ) => Promise<void>;
      await expect(
        prepare({ manager: { find: async () => [] } }, ['ctr-1']),
      ).resolves.toBeUndefined();
    });

    it('reactivar un contrato pasa el preparador y devuelve el contrato releído', async () => {
      const resultContract = buildContract({ status: ContractStatus.ACTIVE });
      const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(resultContract);

      const result = await service.reactivate('ctr-1', {} as never, 'actor-1');

      expect(result).toBe(resultContract);
      expect(subscriberLifecycleService.transitionContract).toHaveBeenCalledWith(
        'ctr-1',
        'REACTIVATE',
        {},
        'actor-1',
        undefined,
        expect.any(Function),
      );
      expect(findOne).toHaveBeenCalledWith('ctr-1');
      expect(
        subscriberLifecycleService.transitionContract.mock.invocationCallOrder.at(-1),
      ).toBeLessThan(findOne.mock.invocationCallOrder[0]!);
      const prepare = subscriberLifecycleService.transitionContract.mock.calls.at(-1)?.[5] as (
        qr: unknown,
        ids: readonly string[],
      ) => Promise<void>;
      await expect(
        prepare({ manager: { find: async () => [] } }, ['ctr-1']),
      ).resolves.toBeUndefined();
    });

    it('rechaza activar servicios de un suscriptor cancelado', async () => {
      const contract = buildContract({ status: ContractStatus.SUSPENDED });
      subscriberLifecycleService.reactivate.mockImplementationOnce(
        async (_id: string, _c: unknown, _a: string, _k: unknown, prepare: unknown) =>
          (prepare as (qr: unknown, ids: readonly string[]) => Promise<void>)(
            {
              manager: {
                find: async () => [contract],
                findOne: async () => ({
                  id: 'sub-1',
                  tenantId: 'ten-1',
                  status: 'CANCELLED' as Subscriber['status'],
                  personType: PersonType.NATURAL,
                }),
              },
              query: async () => [],
            },
            ['ctr-1'],
          ),
      );

      await expect(
        service.reactivateSubscriberServices('sub-1', {} as never, 'actor-1'),
      ).rejects.toMatchObject({ response: { code: 'SUBSCRIBER_CANCELLED' } });
    });

    it('bloquea la mutación cuando el titular tiene datos bloqueados por privacidad', async () => {
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({
        'party-test-uuid': ['DATOS_BLOQUEADOS'],
      });

      await expect(service.assertSubscriberNotBlockedForMutation('sub-1')).rejects.toMatchObject({
        response: { code: 'PRIVACY_DATA_BLOCKED' },
      });
    });

    it('permite la mutación de un titular sin marcas y valida el contrato antes de su subscriber', async () => {
      const readOrder: string[] = [];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => {
              readOrder.push('subscriber');
              return { id: 'sub-1', partyId: 'party-test-uuid', anonymizedAt: null };
            },
          },
        }),
      );
      const findOne = jest.spyOn(service, 'findOne').mockImplementationOnce(async () => {
        readOrder.push('contract');
        return buildContract({ subscriberId: 'sub-1' });
      });

      await expect(service.assertSubscriberNotBlockedForMutation('sub-1')).resolves.toBeUndefined();
      expect(readOrder).toEqual(['subscriber']);
      readOrder.length = 0;
      privacyMarksReadPort.activeMarks.mockClear();
      await expect(service.assertContractNotBlocked('ctr-1')).resolves.toBeUndefined();
      expect(readOrder).toEqual(['contract', 'subscriber']);
      expect(findOne).toHaveBeenCalledWith('ctr-1');
      // Fuera de transacción la guarda no pasa manager: el segundo argumento es undefined.
      expect(privacyMarksReadPort.activeMarks).toHaveBeenCalledWith(['party-test-uuid'], undefined);
      expect(findOne.mock.invocationCallOrder[0]!).toBeLessThan(
        privacyMarksReadPort.activeMarks.mock.invocationCallOrder[0]!,
      );
    });

    it('responde 422 BILLING_CYCLE_INVALID al cambiar a un ciclo inactivo', async () => {
      const entity = buildContract({ status: ContractStatus.DRAFT });
      mockActiveBillingCycleExists = false;
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => entity } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, c: Contract) => c } }),
        );

      await expect(
        service.update('ctr-1', { billingCycleDay: 15 }, 'actor-1'),
      ).rejects.toMatchObject({ response: { code: 'BILLING_CYCLE_INVALID' } });
    });
  });

  // ── Ramas de soporte de estrato, IVA y punto de servicio ──────────────────

  describe('ramas de soporte de estrato, IVA y punto de servicio', () => {
    const responseOf = (error: unknown): unknown =>
      error instanceof HttpException ? error.getResponse() : error;
    const errorOf = (promise: Promise<unknown>) =>
      promise.then(
        () => undefined,
        (error: unknown) => error,
      );
    const residentialContract = (overrides: Partial<Contract> = {}) =>
      buildContract({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        ...overrides,
      });
    const subscriberOf = (personType: PersonType = PersonType.NATURAL) => ({
      id: 'sub-1',
      tenantId: 'ten-1',
      personType,
    });
    const planWithConcept = () => ({
      id: 'plan-fibra-300',
      name: 'Plan prueba',
      vatConcept: VatConcept.INTERNET_ACCESS,
      networkType: NetworkType.FIXED,
    });
    /** Encola una transacción simulada por manager, en el orden en que el servicio las abre. */
    const queueTransactions = (...managers: Array<Record<string, unknown>>) => {
      mockRunInTenantSchema.mockReset();
      for (const manager of managers) {
        mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) => cb({ manager }));
      }
    };

    it('rechaza cargar soporte en un contrato terminado sin crear el asset', async () => {
      queueTransactions(
        {},
        {
          findOne: async () => residentialContract({ status: ContractStatus.TERMINATED }),
        },
      );

      const error = await errorOf(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)).toMatchObject({
        code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
      });
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('no carga soporte si el suscriptor del contrato ya no existe', async () => {
      queueTransactions(
        {},
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => null },
      );

      await expect(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('rechaza el soporte en un punto no residencial con STRATUM_EVIDENCE_NOT_APPLICABLE', async () => {
      queueTransactions(
        {},
        {
          findOne: async () =>
            buildContract({
              serviceUsage: ServiceUsage.NON_RESIDENTIAL,
              installationStratum: null,
            }),
        },
      );

      const error = await errorOf(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'STRATUM_EVIDENCE_NOT_APPLICABLE' });
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('borra el asset recién subido si el contrato deja de ser editable dentro de la transacción', async () => {
      mediaService.uploadStratumEvidence.mockResolvedValueOnce({ id: 'asset-race' });
      mediaService.softDeleteStratumEvidence.mockResolvedValueOnce(undefined);
      queueTransactions(
        {},
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => subscriberOf() },
        { findOne: async () => residentialContract({ status: ContractStatus.TERMINATED }) },
      );

      const error = await errorOf(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(mediaService.softDeleteStratumEvidence).toHaveBeenCalledWith(
        'asset-race',
        'tenant_test',
      );
    });

    it('responde no encontrado al retirar soporte de un contrato inexistente', async () => {
      queueTransactions({ findOne: async () => null });

      await expect(service.removeStratumEvidence('ctr-x', 'actor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mediaService.softDeleteStratumEvidence).not.toHaveBeenCalled();
    });

    it('no retira soporte de un contrato suspendido', async () => {
      queueTransactions({
        findOne: async () =>
          residentialContract({
            status: ContractStatus.SUSPENDED,
            stratumEvidenceMediaId: 'asset-old',
          }),
      });

      const error = await errorOf(service.removeStratumEvidence('ctr-1', 'actor-1'));

      expect(error).toBeInstanceOf(ConflictException);
      expect(responseOf(error)).toMatchObject({
        code: 'STRATUM_EVIDENCE_REQUIRES_EDITABLE_CONTRACT',
      });
    });

    it('propaga un error de borrado distinto de no encontrado al retirar el soporte', async () => {
      mediaService.softDeleteStratumEvidence.mockRejectedValueOnce(
        new Error('almacenamiento no disponible'),
      );
      queueTransactions({
        findOne: async () => residentialContract({ stratumEvidenceMediaId: 'asset-old' }),
        save: async (_entity: unknown, data: unknown) => data,
      });

      await expect(service.removeStratumEvidence('ctr-1', 'actor-1')).rejects.toThrow(
        'almacenamiento no disponible',
      );
    });

    it('retira el soporte de un contrato activo, recalcula el IVA y borra el asset anterior', async () => {
      const contract = residentialContract({
        status: ContractStatus.ACTIVE,
        stratumEvidenceMediaId: 'asset-old',
        vatSnapshot: {
          treatment: VatTreatment.EXEMPT,
          legalBasis: VatLegalBasis.ET_481_H,
          ratePercent: 0,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00.000Z',
        },
      });
      commercialCatalogPort.getPlanById.mockResolvedValueOnce(planWithConcept());
      internetVatResolver.resolve.mockReturnValueOnce({
        status: 'RESOLVED',
        treatment: VatTreatment.STANDARD,
        legalBasis: VatLegalBasis.ET_468,
        ratePercent: 19,
        requiresAccountantReview: false,
      });
      mediaService.softDeleteStratumEvidence.mockResolvedValueOnce(undefined);
      queueTransactions({
        findOne: async () => contract,
        save: async (_entity: unknown, data: unknown) => data,
      });

      const result = await service.removeStratumEvidence('ctr-1', 'actor-1');

      expect(result.stratumEvidenceMediaId).toBeNull();
      expect(result.vatSnapshot).toMatchObject({
        treatment: VatTreatment.STANDARD,
        ratePercent: 19,
      });
      expect(mediaService.softDeleteStratumEvidence).toHaveBeenCalledWith(
        'asset-old',
        'tenant_test',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'ContractServicePoint',
          oldValue: { vatTreatment: VatTreatment.EXEMPT },
          newValue: expect.objectContaining({
            changedFields: ['stratumEvidenceMediaId'],
            vatTreatment: VatTreatment.STANDARD,
          }),
        }),
      );
    });

    it('no recalcula el IVA de un contrato activo sin uso y responde SERVICE_USAGE_REQUIRED', async () => {
      commercialCatalogPort.getPlanById.mockResolvedValueOnce(planWithConcept());
      queueTransactions({
        findOne: async () =>
          buildContract({
            status: ContractStatus.ACTIVE,
            serviceUsage: null,
            stratumEvidenceMediaId: 'asset-old',
          }),
        save: async (_entity: unknown, data: unknown) => data,
      });

      const error = await errorOf(service.removeStratumEvidence('ctr-1', 'actor-1'));

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'SERVICE_USAGE_REQUIRED' });
      expect(mediaService.softDeleteStratumEvidence).not.toHaveBeenCalled();
    });

    it('entrega una URL firmada de 300 segundos y audita el acceso sin registrar la URL', async () => {
      const expiresAt = new Date('2026-10-12T00:05:00.000Z');
      queueTransactions({
        findOne: async () => buildContract({ stratumEvidenceMediaId: 'asset-1' }),
      });
      mediaService.getStratumEvidenceSignedUrl.mockResolvedValueOnce({
        signedUrl: 'https://files.example/signed',
        expiresAt,
      });

      await expect(service.getStratumEvidenceSignedUrl('ctr-1', 'actor-1')).resolves.toEqual({
        signedUrl: 'https://files.example/signed',
        expiresAt,
      });
      expect(mediaService.getStratumEvidenceSignedUrl).toHaveBeenCalledWith(
        'asset-1',
        'tenant_test',
      );
      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.RECORD_ACCESS,
        entityType: 'STRATUM_EVIDENCE_ACCESS',
        entityId: 'ctr-1',
        userId: 'actor-1',
        newValue: { resource: 'stratumEvidence' },
      });
      expect(JSON.stringify(auditService.log.mock.calls[0]?.[0])).not.toContain('https://');
    });

    it('responde no encontrado si el asset del contrato ya no existe en Media', async () => {
      queueTransactions({
        findOne: async () => buildContract({ stratumEvidenceMediaId: 'asset-gone' }),
      });
      mediaService.findOne.mockRejectedValueOnce(new NotFoundException('Asset no encontrado.'));

      await expect(service.getStratumEvidenceSignedUrl('ctr-1', 'actor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mediaService.getStratumEvidenceSignedUrl).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('propaga los errores de Media distintos de no encontrado al verificar el soporte', async () => {
      queueTransactions({
        findOne: async () => buildContract({ stratumEvidenceMediaId: 'asset-1' }),
      });
      mediaService.findOne.mockRejectedValueOnce(new Error('media no disponible'));

      await expect(service.getStratumEvidenceSignedUrl('ctr-1', 'actor-1')).rejects.toThrow(
        'media no disponible',
      );
    });

    it('no activa el contrato si el suscriptor ya no existe', async () => {
      mockLockedSubscriber = null;
      queueTransactions(
        {
          findOne: async () =>
            buildContract({
              status: ContractStatus.DRAFT,
              serviceUsage: ServiceUsage.NON_RESIDENTIAL,
            }),
        },
        { findOne: async () => null },
      );

      await expect(service.activate('ctr-1', 'actor-1')).rejects.toThrow(NotFoundException);
      expect(internetVatResolver.resolve).not.toHaveBeenCalled();
    });

    it('traduce un RangeError del resolvedor de IVA a STRATUM_REQUIRED', async () => {
      commercialCatalogPort.getPlanById.mockResolvedValueOnce(planWithConcept());
      internetVatResolver.resolve.mockImplementationOnce(() => {
        throw new RangeError('estrato fuera de rango');
      });
      queueTransactions(
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => subscriberOf() },
      );

      const error = await errorOf(service.activate('ctr-1', 'actor-1'));

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'STRATUM_REQUIRED' });
    });

    it('propaga los errores del resolvedor de IVA que no son de rango', async () => {
      commercialCatalogPort.getPlanById.mockResolvedValueOnce(planWithConcept());
      internetVatResolver.resolve.mockImplementationOnce(() => {
        throw new Error('fallo del resolvedor');
      });
      queueTransactions(
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => subscriberOf() },
      );

      await expect(service.activate('ctr-1', 'actor-1')).rejects.toThrow('fallo del resolvedor');
    });

    it('deja el snapshot de IVA en null cuando el resolvedor no encuentra tratamiento canónico', async () => {
      commercialCatalogPort.getPlanById.mockResolvedValueOnce(planWithConcept());
      internetVatResolver.resolve.mockReturnValueOnce({ status: 'NOT_CANONICAL' });
      queueTransactions(
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => subscriberOf() },
        { save: async (_entity: unknown, data: unknown) => data },
      );

      const result = await service.activate('ctr-1', 'actor-1');

      expect(result.vatSnapshot).toBeNull();
    });

    it('avisa y aplica el tratamiento estándar cuando el asset heredado tiene uso GENERAL', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        commercialCatalogPort.getPlanById.mockResolvedValueOnce(planWithConcept());
        mediaService.findOne.mockResolvedValueOnce({ usage: MediaUsage.GENERAL });
        internetVatResolver.resolve.mockReturnValueOnce({
          status: 'RESOLVED',
          treatment: VatTreatment.STANDARD,
          legalBasis: VatLegalBasis.ET_468,
          ratePercent: 19,
          requiresAccountantReview: false,
        });
        queueTransactions(
          {
            findOne: async () =>
              residentialContract({
                status: ContractStatus.DRAFT,
                stratumEvidenceMediaId: 'asset-legacy',
              }),
          },
          { findOne: async () => subscriberOf() },
          { save: async (_entity: unknown, data: unknown) => data },
        );

        const result = await service.activate('ctr-1', 'actor-1');

        expect(result.vatSnapshot).toMatchObject({
          treatment: VatTreatment.STANDARD,
          ratePercent: 19,
        });
        expect(internetVatResolver.resolve).toHaveBeenCalledWith(
          expect.objectContaining({ stratumEvidenceAvailable: false }),
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Soporte de estrato heredado'));
      } finally {
        warn.mockRestore();
      }
    });

    it('responde SERVICE_USAGE_REQUIRED al ajustar el estrato de un contrato activo sin uso', async () => {
      queueTransactions(
        {},
        {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(
              buildContract({ status: ContractStatus.ACTIVE, serviceUsage: null }),
            )
            .mockResolvedValueOnce(subscriberOf()),
        },
      );

      const error = await errorOf(
        service.updateServicePoint('ctr-1', { installationStratum: 2 }, 'actor-1'),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'SERVICE_USAGE_REQUIRED' });
    });

    it('exige estrato al cambiar un punto activo a residencial sin estrato', async () => {
      queueTransactions(
        {},
        {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(
              buildContract({
                status: ContractStatus.ACTIVE,
                serviceUsage: ServiceUsage.NON_RESIDENTIAL,
                installationStratum: null,
              }),
            )
            .mockResolvedValueOnce(subscriberOf()),
        },
      );

      const error = await errorOf(
        service.updateServicePoint(
          'ctr-1',
          { serviceUsage: ServiceUsage.RESIDENTIAL, installationStratum: null },
          'actor-1',
        ),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'STRATUM_REQUIRED' });
    });

    it('no crea un punto residencial si el suscriptor no existe', async () => {
      queueTransactions({ findOne: async () => null });

      await expect(
        service.create(
          {
            subscriberId: 'sub-x',
            planId: 'plan-fibra-300',
            planSnapshotJson: {},
            serviceUsage: ServiceUsage.RESIDENTIAL,
            installationStratum: 2,
          },
          'actor-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('responde no encontrado al consultar un contrato inexistente', async () => {
      queueTransactions({ findOne: async () => null });

      await expect(service.findOne('ctr-x')).rejects.toThrow(NotFoundException);
    });

    it('valida el punto residencial de un borrador contra el suscriptor antes de guardarlo', async () => {
      mockLockedSubscriber = null;
      queueTransactions(
        { findOne: async () => buildContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => null },
      );

      await expect(
        service.update(
          'ctr-1',
          { serviceUsage: ServiceUsage.RESIDENTIAL, installationStratum: 2 },
          'actor-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza un punto residencial en borrador si el titular es persona jurídica', async () => {
      mockLockedSubscriber = subscriberOf(PersonType.JURIDICA);
      queueTransactions(
        { findOne: async () => buildContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => subscriberOf(PersonType.JURIDICA) },
      );

      const error = await errorOf(
        service.update(
          'ctr-1',
          { serviceUsage: ServiceUsage.RESIDENTIAL, installationStratum: 2 },
          'actor-1',
        ),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'RESIDENTIAL_USAGE_NOT_ALLOWED' });
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  describe('B1-G: precedencia de anonimización frente al ciclo en las creaciones', () => {
    beforeEach(() => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => mockLockedSubscriber } }),
      );
      mockActiveBillingCycleExists = false;
    });

    afterEach(() => {
      mockActiveBillingCycleExists = true;
    });

    it.each(['create', 'createFromExpediente'] as const)(
      '%s: titular sano con ciclo inválido conserva 422 BILLING_CYCLE_INVALID',
      async (method) => {
        const operation =
          method === 'create'
            ? service.create({
                subscriberId: 'sub-1',
                planId: 'plan-1',
                planSnapshotJson: {},
                billingCycleDay: 15,
              })
            : service.createFromExpediente('sub-1', { billingCycleDay: 15 });
        await expect(operation).rejects.toMatchObject({
          status: 422,
          response: { code: 'BILLING_CYCLE_INVALID' },
        });
      },
    );

    it.each(['create', 'createFromExpediente'] as const)(
      '%s: titular anonimizado con ciclo inválido responde 409 antes del error de ciclo',
      async (method) => {
        mockLockedSubscriber = {
          ...mockLockedSubscriber,
          anonymizedAt: new Date('2026-11-01T00:00:00Z'),
        };
        const operation =
          method === 'create'
            ? service.create({
                subscriberId: 'sub-1',
                planId: 'plan-1',
                planSnapshotJson: {},
                billingCycleDay: 15,
              })
            : service.createFromExpediente('sub-1', { billingCycleDay: 15 });
        await expect(operation).rejects.toMatchObject({
          status: 409,
          response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
        });
      },
    );
  });

  describe('B1-R: ramas de _transition sobre titular anonimizado', () => {
    const transition = (target: ContractStatus) =>
      (
        service as unknown as {
          _transition(id: string, target: ContractStatus): Promise<Contract>;
        }
      )._transition('ctr-1', target);

    beforeEach(() => {
      mockLockedSubscriber = {
        ...mockLockedSubscriber,
        anonymizedAt: new Date('2026-10-15T12:00:00.000Z'),
      };
    });

    it('rechaza con 404 cuando el contrato bloqueado ya no existe', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => null } }),
      );

      await expect(transition(ContractStatus.ARCHIVED)).rejects.toThrow(NotFoundException);
    });

    it('responde 409 PRIVACY_TITULAR_ANONYMIZED a un contrato ACTIVE y no emite ningún UPDATE de archivo', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(transition(ContractStatus.TERMINATED)).rejects.toMatchObject({
        status: 409,
        response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
      });
      expect(mockContractQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1, status_reason_code = NULL'),
        expect.anything(),
      );
    });

    it('responde 409 PRIVACY_TITULAR_ANONYMIZED a una transición de titular anonimizado distinta de ARCHIVED', async () => {
      const contract = buildContract({
        status: ContractStatus.TERMINATED,
        terminatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(transition(ContractStatus.ACTIVE)).rejects.toMatchObject({
        status: 409,
        response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
      });
    });

    it('responde 409 a un contrato ya ARCHIVED de titular anonimizado sin registrar alerta', async () => {
      const contract = buildContract({
        status: ContractStatus.ARCHIVED,
        terminatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );
      const warn = jest.spyOn(
        (service as unknown as { logger: { warn: (message: string) => void } }).logger,
        'warn',
      );

      await expect(transition(ContractStatus.ARCHIVED)).rejects.toMatchObject({
        status: 409,
        response: { code: 'PRIVACY_TITULAR_ANONYMIZED' },
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('archiva un contrato TERMINATED de titular anonimizado y conserva terminated_at', async () => {
      const terminatedAt = new Date('2026-01-01T00:00:00Z');
      const contract = buildContract({ status: ContractStatus.TERMINATED, terminatedAt });
      const archived = { ...contract, status: ContractStatus.ARCHIVED };
      let lookups = 0;
      mockAnonymizedArchiveRows = [{ id: 'ctr-1' }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () => (++lookups === 1 ? contract : archived),
          },
        }),
      );

      const result = await transition(ContractStatus.ARCHIVED);

      expect(result.status).toBe(ContractStatus.ARCHIVED);
      expect(result.terminatedAt).toEqual(terminatedAt);
      // D-O1-1: la transición posterior no reescribe la fecha de terminación.
      const archiveUpdate = mockContractQuery.mock.calls.find(([sql]) =>
        String(sql).includes('SET status = $1, status_reason_code = NULL'),
      );
      expect(archiveUpdate?.[0]).not.toMatch(/terminated_at/u);
      expect(archiveUpdate?.[1]).toEqual([
        ContractStatus.ARCHIVED,
        'ctr-1',
        'ten-1',
        ContractStatus.TERMINATED,
      ]);
      expect(auditService.logWithin).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'Contract',
          entityId: 'ctr-1',
          oldValue: { status: ContractStatus.TERMINATED },
          newValue: { status: ContractStatus.ARCHIVED },
        }),
        expect.anything(),
      );
    });

    it('responde 409 CONTRACT_CHANGED si otra operación movió el contrato antes del archivo', async () => {
      const contract = buildContract({ status: ContractStatus.TERMINATED });
      mockAnonymizedArchiveRows = [];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(transition(ContractStatus.ARCHIVED)).rejects.toMatchObject({
        status: 409,
        response: { code: 'CONTRACT_CHANGED' },
      });
    });

    it('rechaza con 404 si el contrato desaparece justo después del archivo', async () => {
      const contract = buildContract({ status: ContractStatus.TERMINATED });
      let lookups = 0;
      mockAnonymizedArchiveRows = [{ id: 'ctr-1' }];
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => (++lookups === 1 ? contract : null) } }),
      );

      await expect(transition(ContractStatus.ARCHIVED)).rejects.toThrow(NotFoundException);
    });
  });
});
