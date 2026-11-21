/**
 * Muestreador de salud contra PostgreSQL y Redis reales (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3 §A).
 *
 * - Retención: borra las muestras de más de 35 días y conserva la del día 34.
 * - Colas: una cola con un trabajo en espera reporta conteo y antigüedad; una cola sin trabajos
 *   reporta 0 y antigüedad null. Las colas usan un prefijo efímero: no tocan las del worker.
 *
 * Todo lo escrito en PostgreSQL vive en una transacción que se revierte.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/worker exec jest \
 *     --config jest.integration.config.js platform-health-sampler
 */
import { randomBytes } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, type QueryRunner } from 'typeorm';
import { PlatformHealthSample, resolveMigrationDbCredentials } from '@iwana/db';
import { WORKER_QUEUE_NAMES } from '../worker-queues';
import { PlatformHealthSamplerProcessor } from './platform-health-sampler.processor';

const { loadWorkspaceEnv } = require('../../../../packages/database/test/integration-db-probe');

loadWorkspaceEnv();

const available = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithInfra = available ? describe : describe.skip;
const PREFIX = `itest-phs-${randomBytes(4).toString('hex')}`;
const DAY_MS = 24 * 60 * 60 * 1000;

describeWithInfra('PlatformHealthSamplerProcessor — PostgreSQL y Redis reales', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  const queues = new Map<string, Queue>();
  const busyName = WORKER_QUEUE_NAMES[0] as string;
  const idleName = WORKER_QUEUE_NAMES[1] as string;
  let processor: PlatformHealthSamplerProcessor;

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [PlatformHealthSample],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const connection = {
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      password: process.env['REDIS_PASSWORD'],
      db: Number.parseInt(process.env['REDIS_DB'] ?? '0', 10),
    };
    for (const name of [busyName, idleName]) {
      queues.set(name, new Queue(name, { connection, prefix: PREFIX }));
    }
    await queues.get(busyName)!.add('sintetico', {}, { timestamp: Date.now() - 120_000 });
    // Más reciente: la antigüedad debe salir del más viejo, no del último encolado.
    await queues.get(busyName)!.add('sintetico', {}, { timestamp: Date.now() - 10_000 });

    const ownQueue = queues.get(idleName)!;
    processor = new PlatformHealthSamplerProcessor(
      // El EntityManager de la transacción expone query, getRepository y createQueryBuilder.
      queryRunner.manager as never,
      ownQueue,
      {
        get: (token: string) => {
          const name = [busyName, idleName].find((queue) => getQueueToken(queue) === token);
          if (!name) throw new Error('cola no registrada en la prueba');
          return queues.get(name);
        },
      } as never,
      { get: () => undefined } as never,
    );
  });

  afterAll(async () => {
    for (const queue of queues.values()) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction();
    await queryRunner?.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('guarda la muestra con colas reales y API no medido', async () => {
    const now = new Date();
    const result = await processor.sample(now);

    expect(result).toEqual(expect.objectContaining({ apiOk: null, dbOk: true, redisOk: true }));
    const [row] = (await queryRunner.query(
      `SELECT api_ok, db_ok, redis_ok, queues FROM public.platform_health_samples
        WHERE sampled_at = $1`,
      [now],
    )) as Array<{ api_ok: boolean | null; db_ok: boolean; redis_ok: boolean; queues: unknown }>;
    expect(row).toEqual(expect.objectContaining({ api_ok: null, db_ok: true, redis_ok: true }));
    const sampled = row?.queues as Array<Record<string, unknown>>;
    const busy = sampled.find((queue) => queue['name'] === busyName);
    expect(busy).toEqual(expect.objectContaining({ waiting: 2, failed: 0 }));
    expect(busy?.['oldestWaitingSeconds']).toBeGreaterThanOrEqual(119);
    // Cola sin trabajos.
    expect(sampled.find((queue) => queue['name'] === idleName)).toEqual({
      name: idleName,
      waiting: 0,
      failed: 0,
      oldestWaitingSeconds: null,
    });
  });

  it('retención: borra las muestras de más de 35 días y conserva la de 34', async () => {
    const now = new Date();
    const repo = queryRunner.manager.getRepository(PlatformHealthSample);
    const base = { apiOk: null, dbOk: true, redisOk: true, queues: [] };
    await repo.insert([
      { ...base, sampledAt: new Date(now.getTime() - 36 * DAY_MS) },
      { ...base, sampledAt: new Date(now.getTime() - 35 * DAY_MS - 1_000) },
      { ...base, sampledAt: new Date(now.getTime() - 34 * DAY_MS) },
    ]);

    const pruned = await processor.prune(now);

    expect(pruned).toBeGreaterThanOrEqual(2);
    const [old] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM public.platform_health_samples
        WHERE sampled_at < $1`,
      [new Date(now.getTime() - 35 * DAY_MS)],
    )) as Array<{ n: number }>;
    expect(old?.n).toBe(0);
    const [kept] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS n FROM public.platform_health_samples WHERE sampled_at = $1`,
      [new Date(now.getTime() - 34 * DAY_MS)],
    )) as Array<{ n: number }>;
    expect(kept?.n).toBe(1);
  });
});
