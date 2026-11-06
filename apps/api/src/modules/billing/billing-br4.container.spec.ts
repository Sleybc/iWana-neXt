jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({ generate: jest.fn(), verify: jest.fn() })),
  NobleCryptoPlugin: jest.fn(),
  ScureBase32Plugin: jest.fn(),
}));

jest.mock('bullmq', () => {
  class FakeBullQueue {
    async close(): Promise<void> {}
    async disconnect(): Promise<void> {}
    async add(): Promise<Record<string, never>> {
      return {};
    }
    async addBulk(): Promise<unknown[]> {
      return [];
    }
    async obliterate(): Promise<void> {}
    on(): this {
      return this;
    }
    once(): this {
      return this;
    }
    emit(): boolean {
      return false;
    }
  }
  class FakeBullWorker extends FakeBullQueue {}
  class FakeBullFlowProducer extends FakeBullQueue {}
  class FakeBullQueueEvents extends FakeBullQueue {}
  class FakeUnrecoverableError extends Error {}
  return {
    Queue: FakeBullQueue,
    Worker: FakeBullWorker,
    FlowProducer: FakeBullFlowProducer,
    QueueEvents: FakeBullQueueEvents,
    UnrecoverableError: FakeUnrecoverableError,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { ContractsService } from '../crm/contracts/contracts.service';
import { PrivacyModule } from '../privacy/privacy.module';
import { IBillingStandingReadPort } from '../privacy/requests/ports/billing-standing-read.port';
import { PrivacyRequestsService } from '../privacy/requests/requests.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingStandingReadAdapter } from './privacy/billing-standing-read.adapter';

/**
 * BR-4.11 y BR-4.6: los consumidores marcan estos puertos como opcionales o los reciben por
 * módulos que solo reexportan; un cableado roto no falla al compilar, el puerto llega vacío.
 * Se verifica el contenedor real del AppModule, no solo los metadatos de los módulos.
 */
describe('BR-4 contenedor del AppModule', () => {
  const syntheticEnv: Record<string, string> = {
    JWT_PRIVATE_KEY: 'synthetic-boot-test-private-key',
    JWT_PUBLIC_KEY: 'synthetic-boot-test-public-key',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
    MFA_ENCRYPTION_KEY: 'a3d9f1c7b5e20846'.repeat(4),
    PII_ENCRYPTION_KEY: '4f8a2c1e9b7d3065'.repeat(4),
    PII_HASH_KEY: 'f'.repeat(64),
  };
  const previousEnv = new Map<string, string | undefined>();
  let moduleRef: TestingModule;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(syntheticEnv)) {
      previousEnv.set(key, process.env[key]);
      process.env[key] ??= value;
    }
    const repositoryStub = {};
    const dataSourceStub = {
      isInitialized: true,
      options: { type: 'postgres' },
      entityMetadatas: [],
      subscribers: [],
      getRepository: jest.fn(() => repositoryStub),
      getTreeRepository: jest.fn(() => repositoryStub),
      getMongoRepository: jest.fn(() => repositoryStub),
      destroy: jest.fn(async () => undefined),
    };
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(dataSourceStub)
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .compile();
  }, 120_000);

  afterAll(async () => {
    await moduleRef?.close();
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('IBillingStandingReadPort se resuelve en PrivacyModule con el adaptador de Billing', () => {
    const requests = moduleRef.select(PrivacyModule).get(PrivacyRequestsService);
    const injected = (requests as unknown as { billingStandingPort?: IBillingStandingReadPort })
      .billingStandingPort;
    expect(injected).toBeInstanceOf(BillingStandingReadAdapter);
    expect(moduleRef.get(IBillingStandingReadPort, { strict: false })).toBe(injected);
  });

  it('la agenda de CRM recibe el puerto real de Billing por BillingAccountReadModule', () => {
    const contracts = moduleRef.get(ContractsService, { strict: false });
    const injected = (contracts as unknown as { billingAccountReadPort?: unknown })
      .billingAccountReadPort;
    expect(injected).toBeInstanceOf(BillingPaymentsService);
  });
});
