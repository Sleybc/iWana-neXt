// Spec MOD14 2026-11-12 «IVA por concepto y cortesías» (D1, D2, R1, R2): IVA por ítem del
// catálogo en CatalogService (creación, edición e hidratación).
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CatalogItemType, VatConcept, VatTreatment } from '@iwana/shared';
import { CatalogService, resolveItemVatInput } from '../services/catalog.service';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
    TenantContext: { getOrThrow: () => ({ tenantId: 'ten-1', schemaName: 'tenant_test' }) },
  };
});

function queryBuilder(rows: Record<string, unknown[]>) {
  return (_entity: unknown, alias?: string) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows[alias ?? ''] ?? []),
    };
    return qb;
  };
}

describe('resolveItemVatInput', () => {
  const none = { treatment: null, legalBasis: null };

  it('D2: sin datos ni valor previo deja STANDARD con ET_468', () => {
    expect(resolveItemVatInput(none, undefined, undefined, 'f')).toEqual({
      treatment: VatTreatment.STANDARD,
      legalBasis: 'ET_468',
    });
  });

  it('EXEMPT o EXCLUDED sin base legal responde 400 VAT_LEGAL_BASIS_REQUIRED', () => {
    for (const treatment of [VatTreatment.EXEMPT, VatTreatment.EXCLUDED]) {
      expect(() => resolveItemVatInput(none, treatment, undefined, 'vatLegalBasis')).toThrow(
        BadRequestException,
      );
      expect(() => resolveItemVatInput(none, treatment, null, 'vatLegalBasis')).toThrow(
        BadRequestException,
      );
    }
  });

  it('conserva la base legal si el tratamiento no cambia y la reemplaza al pasar a STANDARD', () => {
    const exempt = { treatment: VatTreatment.EXEMPT, legalBasis: 'ET_476_7' };
    expect(resolveItemVatInput(exempt, VatTreatment.EXEMPT, undefined, 'f')).toEqual(exempt);
    expect(resolveItemVatInput(exempt, undefined, undefined, 'f')).toEqual(exempt);
    expect(resolveItemVatInput(exempt, VatTreatment.STANDARD, undefined, 'f')).toEqual({
      treatment: VatTreatment.STANDARD,
      legalBasis: 'ET_468',
    });
    expect(resolveItemVatInput(exempt, undefined, 'ET_477', 'f')).toEqual({
      treatment: VatTreatment.EXEMPT,
      legalBasis: 'ET_477',
    });
    expect(() => resolveItemVatInput(exempt, undefined, null, 'f')).toThrow(BadRequestException);
  });
});

describe('CatalogService — IVA por ítem', () => {
  let service: CatalogService;

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: DataSource, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(CatalogService);
  });

  function captureCreate() {
    const created: Array<{ entity: unknown; data: Record<string, unknown> }> = [];
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({
        manager: {
          create: (entity: unknown, data: Record<string, unknown>) => {
            created.push({ entity, data });
            return { ...data, id: 'item-1' };
          },
          save: jest.fn().mockResolvedValue(undefined),
        },
      }),
    );
    return created;
  }

  it('R1/D2: un servicio sin tratamiento se crea con STANDARD 19 % y ET_468', async () => {
    const created = captureCreate();
    const result = await service.create({
      type: CatalogItemType.SERVICE,
      name: 'IP fija',
      vatConcept: VatConcept.INDEPENDENT_SERVICE,
      chargeType: 'RECURRING',
    } as never);

    expect(created[0]).toMatchObject({
      entity: CatalogItem,
      data: { vatTreatment: VatTreatment.STANDARD, vatLegalBasis: 'ET_468' },
    });
    expect(result).toMatchObject({
      vatTreatment: VatTreatment.STANDARD,
      installationVatTreatment: null,
    });
  });

  it('R1: un producto exento guarda su tratamiento y su base legal', async () => {
    const created = captureCreate();
    await service.create({
      type: CatalogItemType.PRODUCT,
      name: 'Equipo exento',
      vatConcept: VatConcept.EQUIPMENT_SALE,
      category: 'NETWORKING',
      vatTreatment: VatTreatment.EXEMPT,
      vatLegalBasis: 'ET_477',
    } as never);

    expect(created[0]!.data).toMatchObject({
      vatTreatment: VatTreatment.EXEMPT,
      vatLegalBasis: 'ET_477',
    });
  });

  it('R2: un plan deja su IVA propio en null y congela el de la instalación en el detalle', async () => {
    const created = captureCreate();
    const result = await service.create({
      type: CatalogItemType.PLAN,
      name: 'Plan 200',
      vatConcept: VatConcept.INTERNET_ACCESS,
      downloadSpeedMbps: 200,
      uploadSpeedMbps: 50,
      technology: 'FTTH',
    } as never);

    expect(created[0]!.data).toMatchObject({ vatTreatment: null, vatLegalBasis: null });
    expect(created[1]).toMatchObject({
      entity: PlanDetail,
      data: {
        installationVatTreatment: VatTreatment.STANDARD,
        installationVatLegalBasis: 'ET_468',
      },
    });
    expect(result).toMatchObject({
      vatTreatment: null,
      installationVatTreatment: VatTreatment.STANDARD,
      installationVatLegalBasis: 'ET_468',
    });
  });

  it('rechaza el IVA de producto en un plan y el de instalación en un producto', async () => {
    captureCreate();
    await expect(
      service.create({
        type: CatalogItemType.PLAN,
        name: 'Plan',
        vatConcept: VatConcept.INTERNET_ACCESS,
        downloadSpeedMbps: 1,
        uploadSpeedMbps: 1,
        technology: 'FTTH',
        vatTreatment: VatTreatment.STANDARD,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'VAT_TREATMENT_NOT_APPLICABLE' } });
    await expect(
      service.create({
        type: CatalogItemType.PRODUCT,
        name: 'Router',
        vatConcept: VatConcept.EQUIPMENT_SALE,
        category: 'NETWORKING',
        installationVatTreatment: VatTreatment.EXEMPT,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'INSTALLATION_VAT_NOT_APPLICABLE' } });
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('un exento sin base legal no llega a la base de datos', async () => {
    captureCreate();
    await expect(
      service.create({
        type: CatalogItemType.SERVICE,
        name: 'Soporte',
        vatConcept: VatConcept.INDEPENDENT_SERVICE,
        chargeType: 'RECURRING',
        vatTreatment: VatTreatment.EXCLUDED,
      } as never),
    ).rejects.toMatchObject({ response: { code: 'VAT_LEGAL_BASIS_REQUIRED' } });
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('editar el IVA de la instalación de un plan actualiza solo el detalle', async () => {
    const item = {
      id: 'plan-1',
      type: CatalogItemType.PLAN,
      name: 'Plan',
      vatConcept: VatConcept.INTERNET_ACCESS,
      vatTreatment: null,
      vatLegalBasis: null,
      isActive: true,
      tenantId: 'ten-1',
    };
    const update = jest.fn();
    const save = jest.fn(async (_entity: unknown, entity: unknown) => entity);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({
        manager: {
          findOne: async (entity: unknown) =>
            entity === PlanDetail
              ? { installationVatTreatment: 'STANDARD', installationVatLegalBasis: 'ET_468' }
              : item,
          save,
          update,
          createQueryBuilder: queryBuilder({
            pd: [
              {
                itemId: 'plan-1',
                installationVatTreatment: VatTreatment.EXCLUDED,
                installationVatLegalBasis: 'ET_476_7',
              },
            ],
          }),
        },
      }),
    );

    const result = await service.update('plan-1', {
      installationVatTreatment: VatTreatment.EXCLUDED,
      installationVatLegalBasis: 'ET_476_7',
    } as never);

    expect(update).toHaveBeenCalledWith(
      PlanDetail,
      { itemId: 'plan-1' },
      { installationVatTreatment: VatTreatment.EXCLUDED, installationVatLegalBasis: 'ET_476_7' },
    );
    expect(save).toHaveBeenCalledWith(
      CatalogItem,
      expect.objectContaining({ vatTreatment: null, vatLegalBasis: null }),
    );
    expect(result).toMatchObject({
      installationVatTreatment: VatTreatment.EXCLUDED,
      installationVatLegalBasis: 'ET_476_7',
      vatTreatment: null,
    });
  });

  it('editar el IVA de un servicio legado sin tratamiento lo deja explícito', async () => {
    const item = {
      id: 'svc-1',
      type: CatalogItemType.SERVICE,
      name: 'IP fija',
      vatConcept: VatConcept.INDEPENDENT_SERVICE,
      vatTreatment: null,
      vatLegalBasis: null,
      isActive: true,
      tenantId: 'ten-1',
    };
    const save = jest.fn(async (_entity: unknown, entity: unknown) => entity);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({
        manager: {
          findOne: async () => item,
          save,
          update: jest.fn(),
          createQueryBuilder: queryBuilder({}),
        },
      }),
    );

    const result = await service.update('svc-1', {
      vatTreatment: VatTreatment.EXEMPT,
      vatLegalBasis: 'ET_476_7',
    } as never);

    expect(save).toHaveBeenCalledWith(
      CatalogItem,
      expect.objectContaining({ vatTreatment: VatTreatment.EXEMPT, vatLegalBasis: 'ET_476_7' }),
    );
    expect(result).toMatchObject({
      vatTreatment: VatTreatment.EXEMPT,
      vatLegalBasis: 'ET_476_7',
      installationVatTreatment: null,
    });
  });

  it('la hidratación proyecta STANDARD/ET_468 para un producto legado sin tratamiento', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, cb) =>
      cb({
        manager: {
          findOne: async () => ({
            id: 'prod-legacy',
            type: CatalogItemType.PRODUCT,
            vatTreatment: null,
            vatLegalBasis: null,
          }),
          createQueryBuilder: queryBuilder({}),
        },
      }),
    );

    await expect(service.findOne('prod-legacy')).resolves.toMatchObject({
      vatTreatment: VatTreatment.STANDARD,
      vatLegalBasis: 'ET_468',
      installationVatTreatment: null,
      installationVatLegalBasis: null,
    });
  });
});
