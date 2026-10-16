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

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) => {
      const [dataSource, schemaName, callback] = args;
      return mockRunInTenantSchema(
        dataSource,
        schemaName,
        (queryRunner: { manager: Record<string, unknown> }) => {
          if (typeof queryRunner.manager['findOne'] !== 'function') {
            queryRunner.manager['findOne'] = async (
              _entity: unknown,
              options?: { where?: { id?: string } },
            ) => ({
              id: options?.where?.id ?? 'sub-1',
              tenantId: 'ten-1',
              personType: PersonType.NATURAL,
              partyId: 'party-test-uuid',
              expedienteId: 'exp-1',
              address: 'Dirección sintética',
              city: 'Bogotá',
              department: 'Cundinamarca',
              postalCode: null,
            });
          }
          if (typeof queryRunner.manager['find'] !== 'function') {
            queryRunner.manager['find'] = async () => [];
          }
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
    softDelete: jest.fn(),
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
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'STORAGE_DRIVER' ? 'minio' : fallback,
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    privacyMarksReadPort.activeMarks.mockResolvedValue({});
    configService.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'STORAGE_DRIVER' ? 'minio' : fallback,
    );
    mediaService.findOne.mockResolvedValue({ usage: MediaUsage.STRATUM_EVIDENCE });
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: DataSource, useValue: {} },
        { provide: CommercialCatalogReadPort, useValue: commercialCatalogPort },
        { provide: IInternetVatResolverPort, useValue: internetVatResolver },
        { provide: AuditService, useValue: auditService },
        { provide: MediaService, useValue: mediaService },
        { provide: ConfigService, useValue: configService },
        { provide: IPrivacyAuthorizationReadPort, useValue: privacyAuthorizationReadPort },
        { provide: IPrivacyMarksReadPort, useValue: privacyMarksReadPort },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
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
    it('requiere un archivo antes de cargar soporte o consultar el contrato', async () => {
      await expect(
        service.uploadStratumEvidence(
          'ctr-1',
          undefined as unknown as Express.Multer.File,
          'actor-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it.each([
      ['almacenamiento local', { STORAGE_DRIVER: 'local' }],
      ['bucket público', { STORAGE_DRIVER: 'minio', S3_BUCKET_PUBLIC: true }],
      [
        'bucket público desde configuración string',
        { STORAGE_DRIVER: 'minio', S3_BUCKET_PUBLIC: 'true' },
      ],
      [
        'base URL pública',
        { STORAGE_DRIVER: 'minio', S3_PUBLIC_BASE_URL: 'https://files.example' },
      ],
    ])('rechaza la carga antes de crear el asset cuando hay %s', async (_reason, values) => {
      const storageConfig = values as Record<string, unknown>;
      configService.get.mockImplementation((key: string, fallback?: unknown) =>
        Object.prototype.hasOwnProperty.call(storageConfig, key) ? storageConfig[key] : fallback,
      );
      const contract = buildContract({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
      });
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
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('reemplaza y limpia un soporte previo en un borrador sin recalcular IVA', async () => {
      const contract = buildContract({
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: 'asset-old',
      });
      mediaService.uploadStratumEvidence.mockResolvedValue({ id: 'asset-new' });
      mediaService.softDelete.mockResolvedValue(undefined);
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
      expect(mediaService.softDelete).toHaveBeenCalledWith('asset-old', 'tenant_test');
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
      mediaService.softDelete.mockResolvedValue(undefined);
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
      expect(mediaService.softDelete).toHaveBeenCalledWith('asset-old', 'tenant_test');
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
    it.each([
      ['almacenamiento local', { STORAGE_DRIVER: 'local' }],
      ['bucket público', { STORAGE_DRIVER: 'minio', S3_BUCKET_PUBLIC: true }],
      [
        'base URL pública',
        { STORAGE_DRIVER: 'minio', S3_PUBLIC_BASE_URL: 'https://files.example' },
      ],
    ])('no emite acceso cuando hay %s', async (_reason, values) => {
      const storageConfig = values as Record<string, unknown>;
      configService.get.mockImplementation((key: string, fallback?: unknown) =>
        Object.prototype.hasOwnProperty.call(storageConfig, key) ? storageConfig[key] : fallback,
      );
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({
          manager: {
            findOne: async () =>
              buildContract({
                stratumEvidenceMediaId: 'asset-1',
              }),
          },
        }),
      );

      await expect(service.getStratumEvidenceSignedUrl('ctr-1', 'actor-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mediaService.findOne).not.toHaveBeenCalled();
      expect(mediaService.getStratumEvidenceSignedUrl).not.toHaveBeenCalled();
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
      await expect(service.updateServicePoint('ctr-1', {}, 'actor-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mockRunInTenantSchema).not.toHaveBeenCalled();
    });

    it('rechaza el cambio dedicado cuando el contrato no está activo', async () => {
      mockRunInTenantSchema.mockReset();
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
      mockRunInTenantSchema.mockReset();
      const findOne = jest
        .fn()
        .mockResolvedValueOnce(buildContract({ status: ContractStatus.ACTIVE }))
        .mockResolvedValueOnce(null);
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
      expect(mediaService.softDelete).not.toHaveBeenCalled();
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
      expect(privacyAuthorizationReadPort.hasActive).toHaveBeenCalledWith(
        'party-test-uuid',
        'TRATAMIENTO_CONTRACTUAL',
      );
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
        installationCity: 'Medellín',
        installationAddress: 'Cll 50 #30-10',
      });

      expect(result.id).toBe('ctr-1');
      expect((result as unknown as Record<string, unknown>).alias).toMatch(/Servicio/);
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
        fiscalDocument: 'documento-hash-fixture',
      });
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
      );
      expect(auditService.log).toHaveBeenCalledWith({
        action: AuditAction.UPDATE,
        entityType: 'Contract',
        entityId: contract.id,
        userId: 'actor-1',
        oldValue: { status: ContractStatus.DRAFT },
        newValue: { status: ContractStatus.ACTIVE },
      });
    });

    it('lanza ConflictException si el contrato no está en DRAFT', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.activate('ctr-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('validación de activación', () => {
    it('responde 422 cuando falta el uso', async () => {
      const contract = buildContract({ serviceUsage: null });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
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
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.suspend('ctr-1');
      expect(result.status).toBe(ContractStatus.SUSPENDED);
    });
  });

  describe('reactivate', () => {
    it('transiciona SUSPENDED → ACTIVE', async () => {
      const contract = buildContract({
        status: ContractStatus.SUSPENDED,
        serviceUsage: ServiceUsage.NON_RESIDENTIAL,
      });
      commercialCatalogPort.getPlanById.mockResolvedValue({
        id: contract.planId,
        name: 'Plan',
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
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.reactivate('ctr-1');
      expect(result.status).toBe(ContractStatus.ACTIVE);
    });
  });

  describe('terminate', () => {
    it('transiciona ACTIVE → TERMINATED', async () => {
      const contract = buildContract({ status: ContractStatus.ACTIVE });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.terminate('ctr-1');
      expect(result.status).toBe(ContractStatus.TERMINATED);
    });

    it('transiciona SUSPENDED → TERMINATED', async () => {
      const contract = buildContract({ status: ContractStatus.SUSPENDED });
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { save: async (_e: unknown, e: Contract) => e } }),
        );

      const result = await service.terminate('ctr-1');
      expect(result.status).toBe(ContractStatus.TERMINATED);
    });
  });

  describe('archive', () => {
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
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
        cb({ manager: { findOne: async () => contract } }),
      );

      await expect(service.archive('ctr-1')).rejects.toThrow(ConflictException);
    });

    it('ARCHIVED no puede transicionar a ningún estado (estado final)', async () => {
      const contract = buildContract({ status: ContractStatus.ARCHIVED });
      mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, cb) =>
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
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { softDelete: softDeleteSpy } }),
        );

      await expect(service.remove('ctr-1', 'actor-1')).resolves.toBeUndefined();
      expect(softDeleteSpy).toHaveBeenCalledWith(expect.anything(), { id: 'ctr-1' });
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

    it('incluye titularAnonymizedAt en la respuesta al editar un contrato anonimizado', async () => {
      const contract = buildContract({ status: ContractStatus.DRAFT });
      const anonymizedAt = new Date('2026-10-15T12:00:00.000Z');
      mockRunInTenantSchema
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({ manager: { findOne: async () => contract } }),
        )
        .mockImplementationOnce(async (_ds, _schema, cb) =>
          cb({
            manager: {
              save: async (_entity: unknown, entity: Contract) => entity,
              find: async () => [{ id: 'sub-1', partyId: 'party-1', anonymizedAt }],
            },
          }),
        );
      privacyMarksReadPort.activeMarks.mockResolvedValueOnce({ 'party-1': [] });

      const result = await service.update('ctr-1', { alias: 'Alias corregido' }, 'actor-1');

      expect(result).toMatchObject({
        alias: 'Alias corregido',
        titularAnonymizedAt: anonymizedAt.toISOString(),
      });
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
      queueTransactions({
        findOne: async () => residentialContract({ status: ContractStatus.TERMINATED }),
      });

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
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => null },
      );

      await expect(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('rechaza el soporte en un punto no residencial con STRATUM_EVIDENCE_NOT_APPLICABLE', async () => {
      queueTransactions({
        findOne: async () =>
          buildContract({ serviceUsage: ServiceUsage.NON_RESIDENTIAL, installationStratum: null }),
      });

      const error = await errorOf(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'STRATUM_EVIDENCE_NOT_APPLICABLE' });
      expect(mediaService.uploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('borra el asset recién subido si el contrato deja de ser editable dentro de la transacción', async () => {
      mediaService.uploadStratumEvidence.mockResolvedValueOnce({ id: 'asset-race' });
      mediaService.softDelete.mockResolvedValueOnce(undefined);
      queueTransactions(
        { findOne: async () => residentialContract({ status: ContractStatus.DRAFT }) },
        { findOne: async () => subscriberOf() },
        { findOne: async () => residentialContract({ status: ContractStatus.TERMINATED }) },
      );

      const error = await errorOf(
        service.uploadStratumEvidence('ctr-1', {} as Express.Multer.File, 'actor-1'),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(mediaService.softDelete).toHaveBeenCalledWith('asset-race', 'tenant_test');
    });

    it('responde no encontrado al retirar soporte de un contrato inexistente', async () => {
      queueTransactions({ findOne: async () => null });

      await expect(service.removeStratumEvidence('ctr-x', 'actor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mediaService.softDelete).not.toHaveBeenCalled();
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
      mediaService.softDelete.mockRejectedValueOnce(new Error('almacenamiento no disponible'));
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
      mediaService.softDelete.mockResolvedValueOnce(undefined);
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
      expect(mediaService.softDelete).toHaveBeenCalledWith('asset-old', 'tenant_test');
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
      expect(mediaService.softDelete).not.toHaveBeenCalled();
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
      queueTransactions({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(
            buildContract({ status: ContractStatus.ACTIVE, serviceUsage: null }),
          )
          .mockResolvedValueOnce(subscriberOf()),
      });

      const error = await errorOf(
        service.updateServicePoint('ctr-1', { installationStratum: 2 }, 'actor-1'),
      );

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(responseOf(error)).toMatchObject({ code: 'SERVICE_USAGE_REQUIRED' });
    });

    it('exige estrato al cambiar un punto activo a residencial sin estrato', async () => {
      queueTransactions({
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
      });

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
});
