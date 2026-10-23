jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({
    generate: jest.fn(),
    verify: jest.fn(),
  })),
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

import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { REDIS_CLIENT } from './modules/redis/redis.module';

describe('AppModule boot', () => {
  const syntheticEnv: Record<string, string> = {
    JWT_PRIVATE_KEY: 'synthetic-boot-test-private-key',
    JWT_PUBLIC_KEY: 'synthetic-boot-test-public-key',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
    MFA_ENCRYPTION_KEY: 'a3d9f1c7b5e20846'.repeat(4),
    PII_ENCRYPTION_KEY: '4f8a2c1e9b7d3065'.repeat(4),
    PII_HASH_KEY: 'f'.repeat(64),
  };
  const previousEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const [key, value] of Object.entries(syntheticEnv)) {
      previousEnv.set(key, process.env[key]);
      process.env[key] ??= value;
    }
  });

  afterAll(() => {
    for (const [key, value] of previousEnv) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('compila el grafo completo sin dependencias sin resolver', async () => {
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(dataSourceStub)
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .compile();

    expect(moduleRef.get(AppModule)).toBeDefined();
    await moduleRef.close();
  }, 120_000);
});
