import { AuditService } from '../../../audit/audit.service';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
const auditMock = { logWithin: jest.fn().mockResolvedValue(undefined) };
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
    taxNameSnapshot: string;
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
    auditMock.logWithin.mockResolvedValue(undefined);

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
    taxCatalogPort.findById.mockResolvedValue(makeIvaDef());

    taxApplicationPort = {
      resolve: jest.fn().mockResolvedValue([]),
      hasActiveCoverage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriberTaxProfileService,
        { provide: AuditService, useValue: auditMock },
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

    it('crea un perfil nuevo y sugiere tributos no IVA, sin IVA por estrato', async () => {
      const newProfile = makeProfile({ assignments: [] });
      const ivaDefinition = makeIvaDef();
      const withholdingDefinition: TaxDefinitionSnapshot = {
        ...ivaDefinition,
        id: 'taxdef-withholding',
        code: 'WITHHOLDING',
        name: 'Retención',
        category: TaxCategory.WITHHOLDING,
      };
      const assignment = makeAssignment({
        taxDefinitionId: withholdingDefinition.id,
        taxNameSnapshot: withholdingDefinition.name,
        treatment: TaxTreatment.STANDARD,
      });
      const profileWithAssignment = makeProfile({ assignments: [assignment] });

      managerMock.findOne
        .mockResolvedValueOnce(makeSubscriber({ stratum: 2 }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(profileWithAssignment);
      managerMock.create.mockImplementation((_entity, values) => values);
      managerMock.save.mockImplementation(async (_entity, entity) => entity);
      taxApplicationPort.resolve.mockResolvedValueOnce([
        {
          taxDefinitionId: ivaDefinition.id,
          treatment: TaxTreatment.STANDARD,
          effectiveRate: 19,
          ruleId: 'vat-rule',
          priorityMatched: 1,
        },
        {
          taxDefinitionId: withholdingDefinition.id,
          treatment: TaxTreatment.STANDARD,
          effectiveRate: 2.5,
          ruleId: 'withholding-rule',
          priorityMatched: 2,
        },
      ]);
      taxCatalogPort.findById.mockImplementation(async (id) =>
        id === withholdingDefinition.id ? withholdingDefinition : ivaDefinition,
      );

      const result = await service.getOrCreateProfile('sub-001');

      expect(managerMock.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subscriberId: 'sub-001',
          profileStatus: TaxProfileStatus.PENDING_REVIEW,
        }),
      );
      expect(taxCatalogPort.findActiveByCode).not.toHaveBeenCalled();
      expect(taxApplicationPort.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          personType: PersonType.NATURAL,
          segment: CustomerSegment.RESIDENTIAL,
          stratum: 2,
        }),
      );
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0]).toMatchObject({
        taxDefinitionId: withholdingDefinition.id,
        taxCategory: TaxCategory.WITHHOLDING,
      });
      expect(managerMock.create).toHaveBeenCalledTimes(2);
    });
  });

  // ── saveAssignments ──────────────────────────────────────────────────────────

  describe('saveAssignments', () => {
    beforeEach(() => {
      // El escritor relee primero al suscriptor bajo bloqueo.
      managerMock.findOne.mockResolvedValueOnce(makeSubscriber());
    });

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

    it('actualiza el upsert existente y configura por ajuste manual confirmado', async () => {
      const assignment = makeAssignment({ status: TaxAssignmentStatus.SUGGESTED });
      const profile = makeProfile({ profileStatus: TaxProfileStatus.PENDING_REVIEW });
      const refreshed = makeProfile({ profileStatus: TaxProfileStatus.CONFIGURED });
      managerMock.findOne
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(assignment)
        .mockResolvedValueOnce(refreshed);
      managerMock.find.mockResolvedValueOnce([
        { ...assignment, status: TaxAssignmentStatus.MANUAL_ADJUSTMENT },
      ]);
      managerMock.save.mockImplementation(async (_entity, entity) => entity);
      taxCatalogPort.findById.mockResolvedValueOnce(makeIvaDef());

      const result = await service.saveAssignments(
        'sub-001',
        [
          {
            taxDefinitionId: assignment.taxDefinitionId,
            rateSource: TaxAssignmentRateSource.MANUAL,
            effectiveRate: 2.5,
            treatment: TaxTreatment.FIXED,
            status: TaxAssignmentStatus.MANUAL_ADJUSTMENT,
            reason: 'Ajuste manual de prueba',
          },
        ],
        'user-001',
      );

      expect(assignment).toMatchObject({
        effectiveRate: '2.5',
        rateSource: TaxAssignmentRateSource.MANUAL,
        treatment: TaxTreatment.FIXED,
        status: TaxAssignmentStatus.MANUAL_ADJUSTMENT,
        reason: 'Ajuste manual de prueba',
        taxNameSnapshot: 'IVA 19%',
      });
      expect(profile).toMatchObject({
        profileStatus: TaxProfileStatus.CONFIGURED,
        confirmedBy: 'user-001',
      });
      expect(result.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
      expect(managerMock.save).toHaveBeenCalledTimes(2);
    });

    it('crea una asignación con rateSource explícito y los valores tributarios predeterminados', async () => {
      const profile = makeProfile();
      const refreshed = makeProfile();
      const created: Record<string, unknown> = {};
      managerMock.findOne
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(refreshed);
      managerMock.find.mockResolvedValueOnce([]);
      managerMock.create.mockImplementation((_entity, values) => Object.assign(created, values));
      managerMock.save.mockImplementation(async (_entity, entity) => entity);
      taxCatalogPort.findById.mockResolvedValueOnce(makeIvaDef());

      await service.saveAssignments(
        'sub-001',
        [
          {
            taxDefinitionId: 'taxdef-iva-001',
            rateSource: TaxAssignmentRateSource.CATALOG,
            effectiveRate: null,
            treatment: null,
            reason: null,
          },
        ],
        'user-001',
      );

      expect(created).toMatchObject({
        effectiveRate: null,
        rateSource: TaxAssignmentRateSource.CATALOG,
        treatment: TaxTreatment.STANDARD,
        status: TaxAssignmentStatus.SUGGESTED,
        reason: null,
      });
      expect(managerMock.save).toHaveBeenCalledWith(expect.anything(), created);
    });
  });

  describe('updateAssignment', () => {
    beforeEach(() => {
      // El escritor relee primero al suscriptor bajo bloqueo.
      managerMock.findOne.mockResolvedValueOnce(makeSubscriber());
    });

    it('rechaza una asignación cuando el perfil tributario no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateAssignment(
          'sub-001',
          'assign-001',
          { status: TaxAssignmentStatus.CONFIRMED },
          'user-001',
        ),
      ).rejects.toThrow('Perfil tributario para suscriptor sub-001 no encontrado');
    });

    it('rechaza una asignación que no pertenece al perfil del suscriptor', async () => {
      managerMock.findOne.mockResolvedValueOnce(makeProfile()).mockResolvedValueOnce(null);

      await expect(
        service.updateAssignment('sub-001', 'assign-missing', {}, 'user-001'),
      ).rejects.toThrow('Asignación tributaria assign-missing no encontrada');
    });

    it('actualiza campos explícitos y configura el perfil al confirmar la asignación', async () => {
      const assignment = makeAssignment({ status: TaxAssignmentStatus.SUGGESTED });
      const profile = makeProfile({
        profileStatus: TaxProfileStatus.PENDING_REVIEW,
        assignments: [assignment],
      });
      managerMock.findOne
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(assignment)
        .mockResolvedValueOnce(profile);
      managerMock.find.mockResolvedValueOnce([assignment]);
      managerMock.save.mockImplementation(async (_entity, entity) => entity);

      const result = await service.updateAssignment(
        'sub-001',
        assignment.id,
        {
          effectiveRate: null,
          treatment: null,
          status: TaxAssignmentStatus.CONFIRMED,
          reason: null,
        },
        'user-001',
      );

      expect(assignment).toMatchObject({
        effectiveRate: null,
        rateSource: TaxAssignmentRateSource.MANUAL,
        treatment: null,
        status: TaxAssignmentStatus.CONFIRMED,
        reason: null,
      });
      expect(profile).toMatchObject({
        profileStatus: TaxProfileStatus.CONFIGURED,
        confirmedBy: 'user-001',
      });
      expect(result.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
      expect(managerMock.save).toHaveBeenCalledTimes(2);
    });

    it('conserva el estado del perfil cuando la asignación no está confirmada', async () => {
      const assignment = makeAssignment({ status: TaxAssignmentStatus.SUGGESTED });
      const profile = makeProfile({ assignments: [assignment] });
      managerMock.findOne
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(assignment)
        .mockResolvedValueOnce(profile);
      managerMock.find.mockResolvedValueOnce([assignment]);
      managerMock.save.mockImplementation(async (_entity, entity) => entity);

      const result = await service.updateAssignment('sub-001', assignment.id, {}, 'user-001');

      expect(result.profileStatus).toBe(TaxProfileStatus.PENDING_REVIEW);
      expect(managerMock.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('confirmProfile', () => {
    beforeEach(() => {
      // El escritor relee primero al suscriptor bajo bloqueo.
      managerMock.findOne.mockResolvedValueOnce(makeSubscriber());
    });

    it('propaga fallo de auditoría para abortar la transacción de confirmación', async () => {
      const profile = makeProfile();
      managerMock.findOne.mockResolvedValue(profile);
      managerMock.save.mockImplementation(async (_entity: unknown, value: unknown) => value);
      auditMock.logWithin.mockRejectedValueOnce(new Error('audit unavailable'));
      await expect(service.confirmProfile('sub-001', 'user-001')).rejects.toThrow(
        'audit unavailable',
      );
    });

    const otherTaxDef = (): TaxDefinitionSnapshot => ({
      ...makeIvaDef(),
      id: 'taxdef-ica-001',
      code: 'ICA',
      name: 'ICA sintético',
      category: TaxCategory.MUNICIPAL,
    });

    it('lanza NotFoundException si el perfil no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(null);
      await expect(service.confirmProfile('sub-001', 'user-001')).rejects.toThrow(
        NotFoundException,
      );
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('configura un perfil sin otros tributos y registra quién lo confirmó', async () => {
      managerMock.findOne.mockResolvedValueOnce(makeProfile({ assignments: [] }));
      managerMock.save.mockImplementation(async (_entity, value) => value);

      const result = await service.confirmProfile('sub-001', 'user-001');

      expect(result.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
      expect(result.confirmedBy).toBe('user-001');
      expect(result.confirmedAt).toEqual(expect.any(String));
      expect(managerMock.save).toHaveBeenCalledTimes(1);
      expect(managerMock.create).not.toHaveBeenCalled();
    });

    it('rechaza si quedan tributos distintos de IVA sugeridos sin confirmar', async () => {
      managerMock.findOne.mockResolvedValueOnce(
        makeProfile({
          assignments: [
            makeAssignment({
              taxDefinitionId: 'taxdef-ica-001',
              status: TaxAssignmentStatus.SUGGESTED,
            }),
          ],
        }),
      );
      taxCatalogPort.findById.mockResolvedValue(otherTaxDef());

      await expect(service.confirmProfile('sub-001', 'user-001')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TAX_PROFILE_HAS_PENDING_ASSIGNMENTS' }),
      });
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('ignora una sugerencia de IVA, que se resuelve por contrato', async () => {
      managerMock.findOne.mockResolvedValueOnce(
        makeProfile({ assignments: [makeAssignment({ status: TaxAssignmentStatus.SUGGESTED })] }),
      );
      managerMock.save.mockImplementation(async (_entity, value) => value);

      const result = await service.confirmProfile('sub-001', 'user-001');

      expect(result.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
    });

    it('es idempotente con un perfil ya configurado', async () => {
      managerMock.findOne.mockResolvedValueOnce(
        makeProfile({ profileStatus: TaxProfileStatus.CONFIGURED }),
      );

      const result = await service.confirmProfile('sub-001', 'user-001');

      expect(result.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
      expect(managerMock.save).not.toHaveBeenCalled();
    });
  });

  describe('suggestVatForSubscriber', () => {
    it('lanza NotFoundException si el suscriptor no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(null);
      await expect(service.suggestVatForSubscriber('sub-999')).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el perfil no existe', async () => {
      managerMock.findOne.mockResolvedValueOnce(makeSubscriber()).mockResolvedValueOnce(null);
      await expect(service.suggestVatForSubscriber('sub-001')).rejects.toThrow(NotFoundException);
    });

    it('no crea sugerencias IVA y conserva una asignación IVA existente sin modificarla', async () => {
      const existingVat = makeAssignment({ treatment: TaxTreatment.EXEMPT });
      const profile = makeProfile({ assignments: [existingVat] });
      managerMock.findOne
        .mockResolvedValueOnce(makeSubscriber({ stratum: 2 }))
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(profile);
      taxApplicationPort.resolve.mockResolvedValueOnce([
        {
          taxDefinitionId: existingVat.taxDefinitionId,
          treatment: TaxTreatment.STANDARD,
          effectiveRate: 19,
          ruleId: 'vat-rule',
          priorityMatched: 1,
        },
      ]);
      taxCatalogPort.findById.mockResolvedValue(makeIvaDef());

      const original = { ...existingVat };
      const result = await service.suggestVatForSubscriber('sub-001');

      expect(taxCatalogPort.findActiveByCode).not.toHaveBeenCalled();
      expect(managerMock.create).not.toHaveBeenCalled();
      expect(managerMock.save).not.toHaveBeenCalled();
      expect(existingVat).toEqual(original);
      expect(result.assignments[0]).toMatchObject({ taxCategory: TaxCategory.VAT });
    });

    it('sugiere tributos no IVA y filtra cualquier aplicación IVA', async () => {
      const profile = makeProfile({ assignments: [] });
      const vatDefinition = makeIvaDef();
      const withholdingDefinition: TaxDefinitionSnapshot = {
        ...vatDefinition,
        id: 'taxdef-withholding',
        code: 'WITHHOLDING',
        name: 'Retención',
        category: TaxCategory.WITHHOLDING,
      };
      managerMock.findOne
        .mockResolvedValueOnce(makeSubscriber({ stratum: 2 }))
        .mockResolvedValueOnce(profile)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeProfile({ assignments: [] }));
      taxApplicationPort.resolve.mockResolvedValueOnce([
        {
          taxDefinitionId: vatDefinition.id,
          treatment: TaxTreatment.STANDARD,
          effectiveRate: 19,
          ruleId: 'vat-rule',
          priorityMatched: 1,
        },
        {
          taxDefinitionId: withholdingDefinition.id,
          treatment: TaxTreatment.STANDARD,
          effectiveRate: 2.5,
          ruleId: 'withholding-rule',
          priorityMatched: 2,
        },
      ]);
      taxCatalogPort.findById
        .mockResolvedValueOnce(vatDefinition)
        .mockResolvedValueOnce(withholdingDefinition);
      const created: Array<Record<string, unknown>> = [];
      managerMock.create.mockImplementation((_entity, values) => {
        created.push(values as Record<string, unknown>);
        return values;
      });
      managerMock.save.mockImplementation(async (_entity, entity) => entity);

      await service.suggestVatForSubscriber('sub-001');

      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        taxDefinitionId: withholdingDefinition.id,
        status: TaxAssignmentStatus.SUGGESTED,
      });
      expect(taxCatalogPort.findActiveByCode).not.toHaveBeenCalled();
    });

    it('crea un perfil nuevo sin inventar IVA a partir del estrato', async () => {
      const profile = makeProfile({ assignments: [] });
      managerMock.findOne
        .mockResolvedValueOnce(makeSubscriber({ stratum: 2 }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(profile);
      managerMock.create.mockReturnValue(profile);
      managerMock.save.mockResolvedValue(profile);
      taxApplicationPort.resolve.mockResolvedValueOnce([]);

      const result = await service.getOrCreateProfile('sub-001');

      expect(result.assignments).toEqual([]);
      expect(taxApplicationPort.resolve).toHaveBeenCalled();
      expect(taxCatalogPort.findActiveByCode).not.toHaveBeenCalled();
      expect(managerMock.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('protección de anonimización y sugerencias no IVA', () => {
    it('rechaza al titular anonimizado antes de crear o confirmar el perfil', async () => {
      managerMock.findOne.mockResolvedValueOnce({
        ...makeSubscriber(),
        anonymizedAt: new Date('2026-11-01T00:00:00Z'),
      });

      await expect(service.getOrCreateProfile('sub-001')).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
      });
      expect(managerMock.findOne).toHaveBeenCalledTimes(1);
      expect(managerMock.save).not.toHaveBeenCalled();
      expect(taxApplicationPort.resolve).not.toHaveBeenCalled();
    });

    it.each([TaxTreatment.EXEMPT, TaxTreatment.EXCLUDED, TaxTreatment.FIXED])(
      'conserva el tratamiento %s y la tasa de catálogo cuando la regla no fija tasa',
      async (treatment) => {
        const profile = makeProfile();
        const definition = {
          ...makeIvaDef(),
          id: 'taxdef-local',
          category: TaxCategory.WITHHOLDING,
          baseRate: '2.0000',
        };
        const assignment = {
          ...makeAssignment(),
          taxDefinitionId: definition.id,
          treatment,
          effectiveRate: definition.baseRate,
        };
        managerMock.findOne
          .mockResolvedValueOnce(makeSubscriber({ stratum: null }))
          .mockResolvedValueOnce(profile)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...profile, assignments: [assignment] });
        managerMock.create.mockImplementation((_entity, values) => values);
        managerMock.save.mockImplementation(async (_entity, entity) => entity);
        taxCatalogPort.findById.mockResolvedValue(definition);
        taxApplicationPort.resolve.mockResolvedValueOnce([
          {
            taxDefinitionId: definition.id,
            treatment,
            effectiveRate: null,
            ruleId: 'local-rule',
            priorityMatched: 1,
          },
        ]);

        const result = await service.suggestVatForSubscriber('sub-001');

        expect(taxApplicationPort.resolve).toHaveBeenCalledWith({
          personType: PersonType.NATURAL,
          segment: CustomerSegment.RESIDENTIAL,
        });
        expect(managerMock.save).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            treatment,
            effectiveRate: '2.0000',
            taxDefinitionId: definition.id,
          }),
        );
        expect(result.assignments).toEqual([
          expect.objectContaining({
            treatment,
            effectiveRate: '2.0000',
            taxCategory: TaxCategory.WITHHOLDING,
          }),
        ]);
      },
    );
  });
});
