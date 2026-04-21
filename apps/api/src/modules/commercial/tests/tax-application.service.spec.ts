import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CustomerSegment } from '@iwana/shared';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import { TaxApplicationService } from '../services/tax-application.service';
import { ITaxApplicationReadPort } from '../ports/tax-application-read.port';

// ─── Mocks de módulos ────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Crea un mock de QueryBuilder encadenable con getOne() configurable. */
function createMockQueryBuilder(getOneResult: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(getOneResult),
  };
}

/** Snapshot mínimo de TaxDefinition del catálogo. */
function makeTaxDefSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tax-def-id',
    code: 'IVA_19',
    name: 'IVA 19%',
    category: 'VAT',
    jurisdictionLevel: 'NATIONAL',
    municipalityCode: null,
    baseRate: '19.0000',
    treatment: 'STANDARD',
    context: 'BOTH',
    origin: 'SYSTEM',
    isActive: true,
    notes: null,
    ...overrides,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('TaxApplicationService', () => {
  let service: TaxApplicationService;

  const tenantCtx = { tenantId: 'ten-test', schemaName: 'tenant_test' };

  const mockTaxCatalogPort = {
    findById: jest.fn(),
    findActiveByCode: jest.fn(),
    listByContext: jest.fn(),
    resolveSystemPreset: jest.fn(),
  };

  beforeEach(async () => {
    mockTenantContextGetOrThrow.mockReturnValue(tenantCtx);
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxApplicationService,
        { provide: DataSource, useValue: {} },
        { provide: TaxCatalogReadPort, useValue: mockTaxCatalogPort },
      ],
    }).compile();

    service = module.get<TaxApplicationService>(TaxApplicationService);
  });

  // ─── Test 1: Residencial estrato 2 → IVA EXEMPT ─────────────────────────

  describe('resolve — Residencial estrato 2 (IVA exento)', () => {
    it('retorna TaxApplicationSnapshot con treatment=EXEMPT y effectiveRate=null', async () => {
      const mockRule = {
        id: 'rule-residential-id',
        priority: 10,
        customerSegment: CustomerSegment.RESIDENTIAL,
        tenantId: tenantCtx.tenantId,
        isActive: true,
      };
      const mockApplication = {
        taxRuleId: 'rule-residential-id',
        taxDefinitionId: 'td-iva-exento',
        treatment: 'EXEMPT' as const,
        rateOverride: null,
        isActive: true,
      };
      const mockTaxDef = makeTaxDefSnapshot({
        id: 'td-iva-exento',
        code: 'IVA_EXENTO',
        name: 'IVA exento (0%)',
        baseRate: '0.0000',
        treatment: 'EXEMPT',
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => createMockQueryBuilder(mockRule),
            find: jest.fn().mockResolvedValue([mockApplication]),
          },
        }),
      );
      mockTaxCatalogPort.findById.mockResolvedValue(mockTaxDef);

      const result = await service.resolve(CustomerSegment.RESIDENTIAL, 2);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        taxDefinitionId: 'td-iva-exento',
        treatment: 'EXEMPT',
        effectiveRate: null,
        ruleId: 'rule-residential-id',
        priorityMatched: 10,
      });
      expect(mockTaxCatalogPort.findById).toHaveBeenCalledWith('td-iva-exento');
    });
  });

  // ─── Test 2: SOHO estrato 3 → IVA STANDARD 19% ──────────────────────────

  describe('resolve — SOHO estrato 3 (IVA standard)', () => {
    it('retorna TaxApplicationSnapshot con treatment=STANDARD y effectiveRate=19', async () => {
      const mockRule = {
        id: 'rule-soho-id',
        priority: 5,
        customerSegment: CustomerSegment.SOHO,
        tenantId: tenantCtx.tenantId,
        isActive: true,
      };
      const mockApplication = {
        taxRuleId: 'rule-soho-id',
        taxDefinitionId: 'td-iva-19',
        treatment: 'STANDARD' as const,
        rateOverride: null,
        isActive: true,
      };
      const mockTaxDef = makeTaxDefSnapshot({
        id: 'td-iva-19',
        baseRate: '19.0000',
        treatment: 'STANDARD',
      });

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => createMockQueryBuilder(mockRule),
            find: jest.fn().mockResolvedValue([mockApplication]),
          },
        }),
      );
      mockTaxCatalogPort.findById.mockResolvedValue(mockTaxDef);

      const result = await service.resolve(CustomerSegment.SOHO, 3);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        taxDefinitionId: 'td-iva-19',
        treatment: 'STANDARD',
        effectiveRate: 19,
        ruleId: 'rule-soho-id',
        priorityMatched: 5,
      });
    });
  });

  // ─── Test 3: Gobierno → IVA + Retefuente + ICA municipal ────────────────

  describe('resolve — Gobierno con municipalityCode (IVA + RFTE + ICA)', () => {
    it('retorna 3 snapshots: IVA, Retefuente e ICA para el municipio', async () => {
      const mockRule = {
        id: 'rule-govt-id',
        priority: 8,
        customerSegment: CustomerSegment.GOVERNMENT,
        tenantId: tenantCtx.tenantId,
        isActive: true,
      };
      const mockApplications = [
        {
          taxRuleId: 'rule-govt-id',
          taxDefinitionId: 'td-iva',
          treatment: 'STANDARD' as const,
          rateOverride: null,
          isActive: true,
        },
        {
          taxRuleId: 'rule-govt-id',
          taxDefinitionId: 'td-rfte',
          treatment: 'STANDARD' as const,
          rateOverride: null,
          isActive: true,
        },
        {
          taxRuleId: 'rule-govt-id',
          taxDefinitionId: 'td-ica',
          treatment: 'STANDARD' as const,
          rateOverride: null,
          isActive: true,
        },
      ];

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => createMockQueryBuilder(mockRule),
            find: jest.fn().mockResolvedValue(mockApplications),
          },
        }),
      );

      mockTaxCatalogPort.findById
        .mockResolvedValueOnce(
          makeTaxDefSnapshot({ id: 'td-iva', baseRate: '19.0000', treatment: 'STANDARD' }),
        )
        .mockResolvedValueOnce(
          makeTaxDefSnapshot({
            id: 'td-rfte',
            code: 'RETE_FUENTE_SERVICIOS',
            baseRate: '4.0000',
            treatment: 'STANDARD',
          }),
        )
        .mockResolvedValueOnce(
          makeTaxDefSnapshot({
            id: 'td-ica',
            code: 'RETE_ICA',
            baseRate: '0.4140',
            treatment: 'STANDARD',
          }),
        );

      const result = await service.resolve(CustomerSegment.GOVERNMENT, undefined, '11001');

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        taxDefinitionId: 'td-iva',
        treatment: 'STANDARD',
        effectiveRate: 19,
      });
      expect(result[1]).toMatchObject({
        taxDefinitionId: 'td-rfte',
        treatment: 'STANDARD',
        effectiveRate: 4,
      });
      expect(result[2]).toMatchObject({
        taxDefinitionId: 'td-ica',
        treatment: 'STANDARD',
        effectiveRate: expect.closeTo(0.414, 2),
      });
      expect(result.every((s) => s.ruleId === 'rule-govt-id')).toBe(true);
      expect(result.every((s) => s.priorityMatched === 8)).toBe(true);
    });
  });

  // ─── Test 4: Aislamiento de tenant ──────────────────────────────────────

  describe('resolve — aislamiento de tenant', () => {
    it('usa schemaName del contexto del request y filtra por tenantId correcto', async () => {
      const tenantA = { tenantId: 'ten-A', schemaName: 'tenant_a' };
      mockTenantContextGetOrThrow.mockReturnValue(tenantA);

      let capturedTenantId: string | undefined;
      let capturedSchema: string | undefined;

      mockRunInTenantSchema.mockImplementation(
        async (_ds: unknown, schema: string, cb: (m: unknown) => unknown) => {
          capturedSchema = schema;
          let qb!: { where: jest.Mock; andWhere: jest.Mock; orderBy: jest.Mock; getOne: jest.Mock };
          qb = {
            where: jest.fn((_q: string, params: Record<string, string>) => {
              if (params?.tenantId) capturedTenantId = params.tenantId;
              return qb;
            }),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            // Sin regla → retorna [] directamente (motor catálogo, sin legacy)
            getOne: jest.fn().mockResolvedValue(null),
          };
          return cb({
            manager: { createQueryBuilder: () => qb, find: jest.fn().mockResolvedValue([]) },
          });
        },
      );

      const result = await service.resolve(CustomerSegment.RESIDENTIAL);

      expect(result).toEqual([]);
      expect(capturedSchema).toBe('tenant_a');
      expect(capturedTenantId).toBe('ten-A');
    });
  });

  // ─── Test 5: Simulador ───────────────────────────────────────────────────

  describe('simulate', () => {
    it('retorna winnerRuleId y reason con las aplicaciones resueltas', async () => {
      const mockRule = {
        id: 'rule-sim-id',
        priority: 7,
        customerSegment: CustomerSegment.PYME,
        tenantId: tenantCtx.tenantId,
        isActive: true,
      };
      const mockApplication = {
        taxRuleId: 'rule-sim-id',
        taxDefinitionId: 'td-iva-std',
        treatment: 'STANDARD' as const,
        rateOverride: null,
        isActive: true,
      };

      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => createMockQueryBuilder(mockRule),
            find: jest.fn().mockResolvedValue([mockApplication]),
          },
        }),
      );
      mockTaxCatalogPort.findById.mockResolvedValue(
        makeTaxDefSnapshot({ id: 'td-iva-std', baseRate: '19.0000', treatment: 'STANDARD' }),
      );

      const result = await service.simulate(CustomerSegment.PYME, 4);

      expect(result.winnerRuleId).toBe('rule-sim-id');
      expect(result.applications).toHaveLength(1);
      const firstApp = result.applications[0];
      expect(firstApp).toBeDefined();
      expect(firstApp?.effectiveRate).toBe(19);
      expect(result.reason).toContain('prioridad 7');
    });

    it('retorna reason explicativo cuando no hay regla', async () => {
      mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
        cb({
          manager: {
            createQueryBuilder: () => createMockQueryBuilder(null),
            find: jest.fn().mockResolvedValue([]),
          },
        }),
      );

      const result = await service.simulate(CustomerSegment.WHOLESALE);

      expect(result.winnerRuleId).toBeNull();
      expect(result.applications).toEqual([]);
      expect(result.reason).toContain('No se encontró');
    });
  });

  // ─── Test 6: Puerto correcto vía DI ─────────────────────────────────────

  describe('ITaxApplicationReadPort token', () => {
    it('TaxApplicationService es inyectable como ITaxApplicationReadPort', () => {
      expect(service).toBeInstanceOf(ITaxApplicationReadPort);
      expect(typeof service.resolve).toBe('function');
    });
  });
});
