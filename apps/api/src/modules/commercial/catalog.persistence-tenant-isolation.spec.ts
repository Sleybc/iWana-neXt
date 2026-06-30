import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { CatalogItemType, CustomerSegment, InstallationRule } from '@iwana/shared';
import { CatalogService } from './services/catalog.service';
import { PriceHistoryService } from './services/price-history.service';
import { CatalogItem } from './entities/catalog-item.entity';
import { PlanDetail } from './entities/plan-detail.entity';
import { ProductDetail } from './entities/product-detail.entity';
import { ServiceDetail } from './entities/service-detail.entity';
import { CatalogPriceHistory } from './entities/catalog-price-history.entity';

type CatalogItemRecord = {
  id: string;
  tenantId: string;
  type: CatalogItemType;
  name: string;
  description: string | null;
  taxClassificationId: string | null;
  retentionApplicable: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type PlanDetailRecord = {
  id: string;
  itemId: string;
  downloadSpeedMbps: number;
  uploadSpeedMbps: number;
  technology: string;
  installationRule: InstallationRule;
};

type CatalogPriceHistoryRecord = {
  id: string;
  itemId: string;
  customerSegment: CustomerSegment;
  basePrice: string;
  installationFee: string;
  validFrom: Date;
  validTo: Date | null;
  isCurrent: boolean;
  createdBy: string;
  createdAt: Date;
};

type SchemaStore = {
  catalogItems: Map<string, CatalogItemRecord>;
  planDetails: Map<string, PlanDetailRecord>;
  productDetails: Map<string, Record<string, unknown>>;
  serviceDetails: Map<string, Record<string, unknown>>;
  priceHistory: Map<string, CatalogPriceHistoryRecord>;
};

type EntityCtor = { name: string };

function newSchemaStore(): SchemaStore {
  return {
    catalogItems: new Map(),
    planDetails: new Map(),
    productDetails: new Map(),
    serviceDetails: new Map(),
    priceHistory: new Map(),
  };
}

function cloneDate(value: Date | null): Date | null {
  return value ? new Date(value) : null;
}

function cloneCatalogItem(record: CatalogItemRecord): CatalogItemRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    deletedAt: cloneDate(record.deletedAt),
  };
}

function clonePlanDetail(record: PlanDetailRecord): PlanDetailRecord {
  return { ...record };
}

function clonePrice(record: CatalogPriceHistoryRecord): CatalogPriceHistoryRecord {
  return {
    ...record,
    validFrom: new Date(record.validFrom),
    validTo: cloneDate(record.validTo),
    createdAt: new Date(record.createdAt),
  };
}

function matchesWhere(record: Record<string, unknown>, where?: Record<string, unknown>): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, expected]) => {
    if (
      expected &&
      typeof expected === 'object' &&
      '_type' in expected &&
      (expected as { _type?: string })._type === 'isNull'
    ) {
      return record[key] == null;
    }

    return record[key] === expected;
  });
}

function buildInMemoryQueryRunner(
  schemaState: Map<string, SchemaStore>,
  idCounters: Map<string, number>,
) {
  let activeSchema: string | null = null;

  const getStore = (): SchemaStore => {
    if (!activeSchema) {
      throw new Error('Schema no inicializado en QueryRunner de prueba.');
    }

    const existing = schemaState.get(activeSchema);
    if (existing) {
      return existing;
    }

    const created = newSchemaStore();
    schemaState.set(activeSchema, created);
    return created;
  };

  const nextId = (prefix: string): string => {
    const current = idCounters.get(prefix) ?? 0;
    const next = current + 1;
    idCounters.set(prefix, next);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  };

  const saveEntity = async <T extends Record<string, unknown>>(
    entity: EntityCtor,
    payload: T,
  ): Promise<T> => {
    const store = getStore();

    if (entity.name === CatalogItem.name) {
      const now = new Date();
      const record: CatalogItemRecord = {
        id: (payload['id'] as string | undefined) ?? nextId('catalog-item'),
        tenantId: payload['tenantId'] as string,
        type: payload['type'] as CatalogItemType,
        name: payload['name'] as string,
        description: (payload['description'] as string | null | undefined) ?? null,
        taxClassificationId: (payload['taxClassificationId'] as string | null | undefined) ?? null,
        retentionApplicable: Boolean(payload['retentionApplicable']),
        isActive: payload['isActive'] !== false,
        createdAt: (payload['createdAt'] as Date | undefined) ?? now,
        updatedAt: now,
        deletedAt: (payload['deletedAt'] as Date | null | undefined) ?? null,
      };
      store.catalogItems.set(record.id, cloneCatalogItem(record));
      Object.assign(payload, cloneCatalogItem(record));
      return payload;
    }

    if (entity.name === PlanDetail.name) {
      const record: PlanDetailRecord = {
        id: (payload['id'] as string | undefined) ?? nextId('plan-detail'),
        itemId: payload['itemId'] as string,
        downloadSpeedMbps: Number(payload['downloadSpeedMbps']),
        uploadSpeedMbps: Number(payload['uploadSpeedMbps']),
        technology: payload['technology'] as string,
        installationRule: payload['installationRule'] as InstallationRule,
      };
      store.planDetails.set(record.itemId, clonePlanDetail(record));
      Object.assign(payload, clonePlanDetail(record));
      return payload;
    }

    if (entity.name === CatalogPriceHistory.name) {
      const record: CatalogPriceHistoryRecord = {
        id: (payload['id'] as string | undefined) ?? nextId('price-history'),
        itemId: payload['itemId'] as string,
        customerSegment: payload['customerSegment'] as CustomerSegment,
        basePrice: payload['basePrice'] as string,
        installationFee: payload['installationFee'] as string,
        validFrom: (payload['validFrom'] as Date | undefined) ?? new Date(),
        validTo: (payload['validTo'] as Date | null | undefined) ?? null,
        isCurrent: payload['isCurrent'] !== false,
        createdBy: payload['createdBy'] as string,
        createdAt: (payload['createdAt'] as Date | undefined) ?? new Date(),
      };
      store.priceHistory.set(record.id, clonePrice(record));
      Object.assign(payload, clonePrice(record));
      return payload;
    }

    if (entity.name === ProductDetail.name) {
      const current = (payload['itemId'] as string) ?? nextId('product-detail');
      store.productDetails.set(current, { ...payload });
      return payload;
    }

    if (entity.name === ServiceDetail.name) {
      const current = (payload['itemId'] as string) ?? nextId('service-detail');
      store.serviceDetails.set(current, { ...payload });
      return payload;
    }

    return payload;
  };

  const findOneEntity = async <T>(
    entity: EntityCtor,
    where?: Record<string, unknown>,
  ): Promise<T | null> => {
    const store = getStore();

    if (entity.name === CatalogItem.name) {
      for (const value of store.catalogItems.values()) {
        if (matchesWhere(value as unknown as Record<string, unknown>, where)) {
          return cloneCatalogItem(value) as T;
        }
      }
      return null;
    }

    if (entity.name === PlanDetail.name) {
      for (const value of store.planDetails.values()) {
        if (matchesWhere(value as unknown as Record<string, unknown>, where)) {
          return clonePlanDetail(value) as T;
        }
      }
      return null;
    }

    if (entity.name === CatalogPriceHistory.name) {
      for (const value of store.priceHistory.values()) {
        if (matchesWhere(value as unknown as Record<string, unknown>, where)) {
          return clonePrice(value) as T;
        }
      }
      return null;
    }

    if (entity.name === ProductDetail.name) {
      for (const value of store.productDetails.values()) {
        if (matchesWhere(value, where)) {
          return { ...value } as T;
        }
      }
      return null;
    }

    if (entity.name === ServiceDetail.name) {
      for (const value of store.serviceDetails.values()) {
        if (matchesWhere(value, where)) {
          return { ...value } as T;
        }
      }
      return null;
    }

    return null;
  };

  const updateEntity = async (
    entity: EntityCtor,
    where: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Promise<void> => {
    const store = getStore();

    if (entity.name === PlanDetail.name) {
      for (const [itemId, value] of store.planDetails.entries()) {
        if (matchesWhere(value as unknown as Record<string, unknown>, where)) {
          store.planDetails.set(itemId, {
            ...value,
            ...patch,
          });
        }
      }
      return;
    }

    if (entity.name === ProductDetail.name) {
      for (const [itemId, value] of store.productDetails.entries()) {
        if (matchesWhere(value, where)) {
          store.productDetails.set(itemId, { ...value, ...patch });
        }
      }
      return;
    }

    if (entity.name === ServiceDetail.name) {
      for (const [itemId, value] of store.serviceDetails.entries()) {
        if (matchesWhere(value, where)) {
          store.serviceDetails.set(itemId, { ...value, ...patch });
        }
      }
    }
  };

  return {
    connect: async () => Promise.resolve(),
    startTransaction: async () => Promise.resolve(),
    commitTransaction: async () => Promise.resolve(),
    rollbackTransaction: async () => Promise.resolve(),
    release: async () => Promise.resolve(),
    query: async (sql: string) => {
      const match = sql.match(/^SET LOCAL search_path TO "([a-z0-9_]+)"$/i);
      if (match) {
        activeSchema = match[1] ?? null;
      }
      return { raw: [], records: [] };
    },
    manager: {
      create: <T extends Record<string, unknown>>(_entity: EntityCtor, payload: Partial<T>) =>
        ({ ...payload }) as T,
      save: saveEntity,
      findOne: <T>(entity: EntityCtor, options?: { where?: Record<string, unknown> }) =>
        findOneEntity<T>(entity, options?.where),
      update: updateEntity,
    },
  } as unknown as { manager: DataSource['manager'] };
}

function buildStatefulDataSource() {
  const schemaState = new Map<string, SchemaStore>();
  const idCounters = new Map<string, number>();

  const dataSource = {
    createQueryRunner: jest.fn(() => buildInMemoryQueryRunner(schemaState, idCounters)),
  } as unknown as DataSource;

  return { dataSource, schemaState };
}

describe('CatalogService persistence tenant isolation', () => {
  let catalogService: CatalogService;
  let priceHistoryService: PriceHistoryService;
  let schemaState: Map<string, SchemaStore>;

  beforeEach(() => {
    const stateful = buildStatefulDataSource();
    schemaState = stateful.schemaState;

    const eventEmitter = { emit: jest.fn() } as unknown as EventEmitter2;
    catalogService = new CatalogService(stateful.dataSource, eventEmitter);
    priceHistoryService = new PriceHistoryService(stateful.dataSource, eventEmitter);
  });

  it('persiste catálogo y precio vigente sin contaminación entre tenant_a y tenant_b', async () => {
    const itemTenantA = await TenantContext.run(
      {
        tenantId: 'tenant-a-id',
        schemaName: 'tenant_a',
        tenantSlug: 'tenant-a',
      },
      async () => {
        const created = await catalogService.create({
          type: CatalogItemType.PLAN,
          name: 'Plan Fibra 300 A',
          technology: 'FTTH',
          downloadSpeedMbps: 300,
          uploadSpeedMbps: 300,
          installationRule: InstallationRule.ON_DEMAND,
        });

        await priceHistoryService.createPrice(
          created.id,
          {
            customerSegment: CustomerSegment.RESIDENTIAL,
            basePrice: '89900.00',
            installationFee: '0.00',
          },
          'actor-a',
        );

        return catalogService.findOne(created.id);
      },
    );

    const itemTenantB = await TenantContext.run(
      {
        tenantId: 'tenant-b-id',
        schemaName: 'tenant_b',
        tenantSlug: 'tenant-b',
      },
      async () => {
        const created = await catalogService.create({
          type: CatalogItemType.PLAN,
          name: 'Plan Fibra 600 B',
          technology: 'XGS-PON',
          downloadSpeedMbps: 600,
          uploadSpeedMbps: 600,
          installationRule: InstallationRule.ALWAYS,
        });

        await priceHistoryService.createPrice(
          created.id,
          {
            customerSegment: CustomerSegment.RESIDENTIAL,
            basePrice: '149900.00',
            installationFee: '50000.00',
          },
          'actor-b',
        );

        return catalogService.findOne(created.id);
      },
    );

    expect(itemTenantA.name).toBe('Plan Fibra 300 A');
    expect(itemTenantA.currentPrice).toBe('89900.00');
    expect(itemTenantA.installationFee).toBe('0.00');
    expect(itemTenantA.technology).toBe('FTTH');

    expect(itemTenantB.name).toBe('Plan Fibra 600 B');
    expect(itemTenantB.currentPrice).toBe('149900.00');
    expect(itemTenantB.installationFee).toBe('50000.00');
    expect(itemTenantB.technology).toBe('XGS-PON');

    expect(schemaState.get('tenant_a')?.catalogItems.size).toBe(1);
    expect(schemaState.get('tenant_b')?.catalogItems.size).toBe(1);
    expect(schemaState.get('tenant_a')?.priceHistory.size).toBe(1);
    expect(schemaState.get('tenant_b')?.priceHistory.size).toBe(1);

    await expect(
      TenantContext.run(
        {
          tenantId: 'tenant-a-id',
          schemaName: 'tenant_a',
          tenantSlug: 'tenant-a',
        },
        async () => catalogService.findOne(itemTenantB.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      TenantContext.run(
        {
          tenantId: 'tenant-b-id',
          schemaName: 'tenant_b',
          tenantSlug: 'tenant-b',
        },
        async () => catalogService.findOne(itemTenantA.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
