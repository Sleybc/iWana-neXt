import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxProfileStatus,
  TaxTreatment,
  TaxCategory,
  TaxContext,
  TaxOrigin,
  JurisdictionLevel,
  CustomerSegment,
  PersonType,
} from '@iwana/shared';
import { TaxDefinitionSnapshot } from '../../../taxation/ports/tax-catalog-read.port';
import { SubscriberTaxProfileService } from '../subscriber-tax-profile.service';
import { TaxCatalogReadPort } from '../../../taxation/ports/tax-catalog-read.port';
import { ITaxApplicationReadPort } from '../../../taxation/ports/tax-application-read.port';
import { VatTreatmentService } from '../vat-treatment.service';

// ── Mocks de @iwana/db ──────────────────────────────────────────────────────────
const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

// ── Factories de datos de prueba ─────────────────────────────────────────────────
const TENANT_CTX = { tenantId: 'tenant-001', schemaName: 'tenant_test' };

function makeSubscriber(
  overrides: Partial<{
    id: string;
    tenantId: string;
    personType: PersonType;
    stratum: number | null;
    customerSegment: CustomerSegment;
  }> = {},
) {
  return {
    id: 'sub-001',
    tenantId: TENANT_CTX.tenantId,
    personType: PersonType.NATURAL,
    stratum: 3,
    customerSegment: CustomerSegment.RESIDENTIAL,
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<{
    id: string;
    subscriberId: string;
    tenantId: string;
    profileStatus: TaxProfileStatus;
    assignments: unknown[];
  }> = {},
) {
  return {
    id: 'profile-001',
    subscriberId: 'sub-001',
    tenantId: TENANT_CTX.tenantId,
    segment: CustomerSegment.RESIDENTIAL,
    stratumAtSuggestion: 3,
    profileStatus: TaxProfileStatus.PENDING_REVIEW,
    confirmedAt: null,
    confirmedBy: null,
    updatedAt: new Date(),
    assignments: [],
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<{
    id: string;
    taxDefinitionId: string;
    status: TaxAssignmentStatus;
    treatment: TaxTreatment;
  }> = {},
) {
  return {
    id: 'assign-001',
    tenantId: TENANT_CTX.tenantId,
    profileId: 'profile-001',
    taxDefinitionId: 'taxdef-iva-001',
    taxNameSnapshot: 'IVA 19%',
    effectiveRate: null,
    rateSource: TaxAssignmentRateSource.CATALOG,
    treatment: TaxTreatment.EXCLUDED,
    status: TaxAssignmentStatus.SUGGESTED,
    reason: 'Estrato 3 — IVA excluido (Ley 1819/2016 Art. 477)',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeIvaDef(): TaxDefinitionSnapshot {
  return {
    id: 'taxdef-iva-001',
    code: 'IVA_19',
    name: 'IVA 19%',
    category: TaxCategory.VAT,
    treatment: TaxTreatment.STANDARD,
    baseRate: '19.0000',
    context: TaxContext.SALES,
    origin: TaxOrigin.SYSTEM,
    isActive: true,
    jurisdictionLevel: JurisdictionLevel.NATIONAL,
    municipalityCode: null,
    notes: null,
  };
}

describe('SubscriberTaxProfileService', () => {
  let service: SubscriberTaxProfileService;
  let taxCatalogPort: jest.Mocked<TaxCatalogReadPort>;
  let taxApplicationPort: { resolve: jest.Mock; hasActiveCoverage: jest.Mock };
  let managerMock: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Contexto tenant activo para todas las pruebas
    mockTenantContextGetOrThrow.mockReturnValue(TENANT_CTX);

    // Manager mock para simular TypeORM queries dentro de runInTenantSchema
    managerMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    // runInTenantSchema ejecuta el callback sincrónicamente en tests
    mockRunInTenantSchema.mockImplementation(
      (_ds: DataSource, _schema: string, cb: (qr: { manager: typeof managerMock }) => unknown) =>
        cb({ manager: managerMock }),
    );

    taxCatalogPort = {
      findById: jest.fn(),
      findActiveByCode: jest.fn(),
      listByContext: jest.fn(),
      resolveSystemPreset: jest.fn(),
    } as unknown as jest.Mocked<TaxCatalogReadPort>;

    taxApplicationPort = {
      resolve: jest.fn().mockResolvedValue([]),
      hasActiveCoverage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriberTaxProfileService,
        VatTreatmentService,
        { provide: DataSource, useValue: {} },
        { provide: TaxCatalogReadPort, useValue: taxCatalogPort },
        {
          provide: ITaxApplicationReadPort,
          useValue: taxApplicationPort,
        },
      ],
    }).compile();

    service = module.get<SubscriberTaxProfileService>(SubscriberTaxProfileService);
  });

  // ── getOrCreateProfile ────────────────────────────────────────────────────────

  describe('getOrCreateProfile', () => {
    it('lanza NotFoundException si el suscriptor no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(null); // subscriber not found

      await expect(service.getOrCreateProfile('sub-999')).rejects.toThrow(NotFoundException);
    });

    it('retorna el perfil existente si ya existe y tiene asignaciones', async () => {
      const subscriber = makeSubscriber();
      const existingAssignment = makeAssignment();
      const existingProfile = makeProfile({ assignments: [existingAssignment] });

      // findOne: subscriber → profile con assignments
      managerMock.findOne
        .mockResolvedValueOnce(subscriber) // subscriber
        .mockResolvedValueOnce(existingProfile); // profile with assignments

      const result = await service.getOrCreateProfile('sub-001');

      expect(result.id).toBe('profile-001');
      expect(result.assignments).toHaveLength(1);
      const firstAssignment = result.assignments[0];
      expect(firstAssignment).toBeDefined();
      expect(firstAssignment!.taxDefinitionId).toBe('taxdef-iva-001');
    });

    it('crea un perfil nuevo y sugiere IVA cuando el perfil no existe', async () => {
      const subscriber = makeSubscriber({ stratum: 2 }); // estrato 2 → EXEMPT
      const newProfile = makeProfile({ assignments: [] });
      const assignment = makeAssignment({ treatment: TaxTreatment.EXEMPT });
      const profileWithAssignment = makeProfile({ assignments: [assignment] });

      // Finder: subscriber, luego no profile, luego profile creado, luego profile refresh
      managerMock.findOne
        .mockResolvedValueOnce(subscriber) // subscriber exists
        .mockResolvedValueOnce(null) // no existing profile
        .mockResolvedValueOnce(profileWithAssignment) // refresh after suggest
        .mockResolvedValueOnce(null); // findOne(SubscriberTaxAssignment) in _suggestVatInSchema
      managerMock.create.mockReturnValue(newProfile);
      managerMock.save.mockResolvedValue(newProfile);

      taxCatalogPort.findActiveByCode.mockResolvedValueOnce(makeIvaDef()); // IVA_19 found

      // findOne para la asignación IVA existente (none)
      managerMock.findOne.mockResolvedValueOnce(null); // no existing IVA assignment

      const result = await service.getOrCreateProfile('sub-001');

      expect(managerMock.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subscriberId: 'sub-001',
          profileStatus: TaxProfileStatus.PENDING_REVIEW,
        }),
      );
      expect(taxCatalogPort.findActiveByCode).toHaveBeenCalledWith('IVA_19');
      expect(taxApplicationPort.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          personType: PersonType.NATURAL,
          segment: CustomerSegment.RESIDENTIAL,
          stratum: 2,
        }),
      );
      expect(result.id).toBe('profile-001');
    });
  });

  // ── saveAssignments ──────────────────────────────────────────────────────────

  describe('saveAssignments', () => {
    it('lanza NotFoundException si el perfil no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(null); // profile not found

      await expect(
        service.saveAssignments('sub-001', [{ taxDefinitionId: 'taxdef-001' }], 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si la definición tributaria no existe en el catálogo', async () => {
      const profile = makeProfile({ assignments: [] });
      managerMock.findOne.mockResolvedValueOnce(profile); // profile found
      taxCatalogPort.findById.mockResolvedValueOnce(null); // tax def NOT found

      await expect(
        service.saveAssignments('sub-001', [{ taxDefinitionId: 'taxdef-inexistente' }], 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('crea una nueva asignación cuando no existe una previa para ese taxDefinitionId', async () => {
      const profile = makeProfile({ assignments: [] });
      const ivaDef = makeIvaDef();
      const newAssignment = makeAssignment({ status: TaxAssignmentStatus.CONFIRMED });
      const refreshedProfile = makeProfile({ assignments: [newAssignment] });

      managerMock.findOne
        .mockResolvedValueOnce(profile) // profile exists
        .mockResolvedValueOnce(null); // no existing assignment for taxDefinitionId
      managerMock.find.mockResolvedValueOnce([newAssignment]); // allAssignments for status check
      managerMock.findOne.mockResolvedValueOnce(refreshedProfile); // refreshed profile at end
      managerMock.create.mockReturnValue(newAssignment);
      managerMock.save.mockResolvedValue(newAssignment);

      taxCatalogPort.findById.mockResolvedValueOnce(ivaDef);

      const result = await service.saveAssignments(
        'sub-001',
        [{ taxDefinitionId: ivaDef.id, status: TaxAssignmentStatus.CONFIRMED }],
        'user-001',
      );

      expect(managerMock.create).toHaveBeenCalled();
      expect(result.assignments).toHaveLength(1);
    });

    it('promueve profileStatus a CONFIGURED cuando hay una asignación CONFIRMED', async () => {
      const profile = makeProfile({
        assignments: [],
        profileStatus: TaxProfileStatus.PENDING_REVIEW,
      });
      const confirmedAssignment = makeAssignment({ status: TaxAssignmentStatus.CONFIRMED });
      const refreshedProfile = makeProfile({
        assignments: [confirmedAssignment],
        profileStatus: TaxProfileStatus.CONFIGURED,
      });

      managerMock.findOne.mockResolvedValueOnce(profile).mockResolvedValueOnce(null); // no existing assignment
      managerMock.find.mockResolvedValueOnce([confirmedAssignment]);
      managerMock.findOne.mockResolvedValueOnce(refreshedProfile);
      managerMock.create.mockReturnValue(confirmedAssignment);
      managerMock.save
        .mockResolvedValueOnce(confirmedAssignment)
        .mockResolvedValueOnce({ ...profile, profileStatus: TaxProfileStatus.CONFIGURED });

      taxCatalogPort.findById.mockResolvedValueOnce(makeIvaDef());

      const result = await service.saveAssignments(
        'sub-001',
        [{ taxDefinitionId: 'taxdef-iva-001', status: TaxAssignmentStatus.CONFIRMED }],
        'user-001',
      );

      expect(result.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
    });
  });

  // ── suggestVatForSubscriber ──────────────────────────────────────────────────

  describe('suggestVatForSubscriber', () => {
    it('lanza NotFoundException si el suscriptor no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(null); // subscriber not found

      await expect(service.suggestVatForSubscriber('sub-999')).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el perfil no existe', async () => {
      managerMock.findOne
        .mockResolvedValueOnce(makeSubscriber()) // subscriber found
        .mockResolvedValueOnce(null); // profile NOT found

      await expect(service.suggestVatForSubscriber('sub-001')).rejects.toThrow(NotFoundException);
    });

    it('no sobreescribe una asignación CONFIRMED al re-sugerir IVA', async () => {
      const subscriber = makeSubscriber({ stratum: 2 });
      const confirmedAssignment = makeAssignment({
        treatment: TaxTreatment.STANDARD,
        status: TaxAssignmentStatus.CONFIRMED,
      });
      const profile = makeProfile({ assignments: [confirmedAssignment] });

      managerMock.findOne
        .mockResolvedValueOnce(subscriber)
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(confirmedAssignment) // existing IVA assignment (CONFIRMED)
        .mockResolvedValueOnce(profile); // refreshed profile

      taxCatalogPort.findActiveByCode.mockResolvedValueOnce(makeIvaDef());

      await service.suggestVatForSubscriber('sub-001');

      // save NO debe haberse llamado para la asignación CONFIRMED
      expect(managerMock.save).not.toHaveBeenCalled();
    });
  });

  // ── _resolveVatTreatmentByStratum (via suggestVatForSubscriber) ──────────────

  describe('Política IVA por estrato', () => {
    const stratumCases: Array<{
      label: string;
      personType: PersonType;
      stratum: number | null;
      expectedTreatment: TaxTreatment | null;
    }> = [
      {
        label: 'Natural estrato 1 → EXEMPT',
        personType: PersonType.NATURAL,
        stratum: 1,
        expectedTreatment: TaxTreatment.EXEMPT,
      },
      {
        label: 'Natural estrato 2 → EXEMPT',
        personType: PersonType.NATURAL,
        stratum: 2,
        expectedTreatment: TaxTreatment.EXEMPT,
      },
      {
        label: 'Natural estrato 3 → EXCLUDED',
        personType: PersonType.NATURAL,
        stratum: 3,
        expectedTreatment: TaxTreatment.EXCLUDED,
      },
      {
        label: 'Natural estrato 4 → STANDARD',
        personType: PersonType.NATURAL,
        stratum: 4,
        expectedTreatment: TaxTreatment.STANDARD,
      },
      {
        label: 'Natural sin estrato → error',
        personType: PersonType.NATURAL,
        stratum: null,
        expectedTreatment: null,
      },
      {
        label: 'Jurídica estrato 1 → STANDARD',
        personType: PersonType.JURIDICA,
        stratum: 1,
        expectedTreatment: TaxTreatment.STANDARD,
      },
    ];

    test.each(stratumCases)('$label', async ({ personType, stratum, expectedTreatment }) => {
      const subscriber = makeSubscriber({ personType, stratum });
      const profile = makeProfile({ assignments: [] });
      const ivaDef = makeIvaDef();

      managerMock.findOne
        .mockResolvedValueOnce(subscriber)
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(null) // no existing IVA assignment
        .mockResolvedValueOnce(profile); // refreshed profile

      taxCatalogPort.findActiveByCode.mockResolvedValueOnce(ivaDef);

      const createdAssignments: unknown[] = [];
      managerMock.create.mockImplementation((_entity: unknown, data: unknown) => {
        createdAssignments.push(data);
        return data;
      });
      managerMock.save.mockResolvedValue({});

      if (expectedTreatment === null) {
        await expect(service.suggestVatForSubscriber('sub-001')).rejects.toThrow(
          BadRequestException,
        );
        return;
      }

      await service.suggestVatForSubscriber('sub-001');

      const created = createdAssignments[0] as { treatment: TaxTreatment };
      expect(created.treatment).toBe(expectedTreatment);
      expect(taxApplicationPort.resolve).toHaveBeenCalled();
    });

    it('sugiere tributos no IVA que devolvió ITaxApplicationReadPort', async () => {
      const subscriber = makeSubscriber({ stratum: 4 });
      const profile = makeProfile({ assignments: [] });
      const ivaDef = makeIvaDef();
      const reteDef: TaxDefinitionSnapshot = {
        ...makeIvaDef(),
        id: 'taxdef-rete-001',
        code: 'RETEFUENTE',
        name: 'Retención en la fuente',
        category: TaxCategory.WITHHOLDING,
      };

      taxApplicationPort.resolve.mockResolvedValueOnce([
        {
          taxDefinitionId: reteDef.id,
          treatment: TaxTreatment.STANDARD,
          effectiveRate: 2.5,
          ruleId: 'rule-1',
          priorityMatched: 10,
        },
      ]);

      managerMock.findOne
        .mockResolvedValueOnce(subscriber)
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(profile);

      taxCatalogPort.findActiveByCode.mockResolvedValueOnce(ivaDef);
      taxCatalogPort.findById.mockResolvedValueOnce(reteDef);

      const createdAssignments: Array<{ taxDefinitionId: string; reason: string | null }> = [];
      managerMock.create.mockImplementation(
        (_entity: unknown, data: { taxDefinitionId: string; reason: string | null }) => {
          createdAssignments.push(data);
          return data;
        },
      );
      managerMock.save.mockResolvedValue({});

      await service.suggestVatForSubscriber('sub-001');

      expect(createdAssignments.map((item) => item.taxDefinitionId)).toEqual([
        ivaDef.id,
        reteDef.id,
      ]);
      expect(createdAssignments[1]?.reason).toBe('Sugerido por reglas de aplicación tributaria');
    });
  });
});
