/**
 * Ola E de MOD04 — cobertura del flujo asincrono de alta masiva de usuarios.
 *
 * Cubre `bulkCreate`, `getBulkJobStatus`, `claimBulkJobResult` y
 * `executeBulkCreateJob` (`users.service.ts`), el tramo mas nuevo del modulo y
 * el unico que entrega contrasenas temporales en claro.
 *
 * Decisiones de montaje:
 * - `TenantContext` es el real (AsyncLocalStorage). Mockearlo escondería justo
 *   lo que hay que probar: que el job NO depende del contexto ambiente sino del
 *   payload, porque ALS no propaga a BullMQ.
 * - `runInTenantSchema` tambien es el real, contra un `DataSource` falso. Asi la
 *   asercion de aislamiento se hace sobre el `SET LOCAL search_path` que se
 *   emite de verdad, y no sobre un doble que reimplemente la regla.
 * - Redis y la cola son dobles con estado en memoria: la unicidad del reclamo
 *   depende de que el store persista entre llamadas.
 *
 * SEGURIDAD: sin PII real. Emails de dominio `.test` y contrasenas sinteticas.
 */

jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (value: string) => `hashed:${value}`),
  compare: jest.fn(),
}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext, User } from '@iwana/db';
import {
  DocumentType,
  USERS_BULK_CREATE_JOB,
  USERS_BULK_CREATE_QUEUE,
  UserRole,
  type UsersBulkCreateJobPayload,
} from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { AuditService } from '../../audit/audit.service';
import { MailerService } from '../../mailer/mailer.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { SearchQueueService } from '../../search/search-queue.service';
import { TenantService } from '../../tenant/tenant.service';
import { UsersService } from '../users.service';
import type { BulkCreateUserItem } from '../dto/bulk-create-users.dto';

const TENANT_A = {
  tenantId: 'ten-00000000-0000-4000-a000-00000000000a',
  schemaName: 'tenant_alfa',
  tenantSlug: 'alfa',
};

const TENANT_B = {
  tenantId: 'ten-00000000-0000-4000-a000-00000000000b',
  schemaName: 'tenant_beta',
  tenantSlug: 'beta',
};

/** Registro autoritativo tenantId → (schemaName, slug), como `public.tenants`. */
const TENANTS_REGISTRADOS = new Map<string, { id: string; schemaName: string; slug: string }>([
  [
    TENANT_A.tenantId,
    { id: TENANT_A.tenantId, schemaName: TENANT_A.schemaName, slug: TENANT_A.tenantSlug },
  ],
  [
    TENANT_B.tenantId,
    { id: TENANT_B.tenantId, schemaName: TENANT_B.schemaName, slug: TENANT_B.tenantSlug },
  ],
]);

const ACTOR_ID = 'usr-00000000-0000-4000-a000-000000000099';
const IDEMPOTENCY_KEY = 'lote-2026-07-22-001';

type JobState = 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'paused';

interface FakeJob {
  id: string;
  name: string;
  data: UsersBulkCreateJobPayload;
  state: JobState;
  failedReason?: string;
  getState: () => Promise<JobState>;
}

/**
 * Doble de Redis con estado real: el claim one-time depende de que persista.
 *
 * Honra `NX` porque la marca de reclamo atómica (Ola F, D-1) depende de esa
 * semántica; un doble que siempre devuelve `OK` haría pasar un `SET NX` roto.
 */
class FakeRedis {
  readonly store = new Map<string, string>();

  get = jest.fn(async (key: string): Promise<string | null> => this.store.get(key) ?? null);

  set = jest.fn(async (key: string, value: string, ...rest: unknown[]): Promise<string | null> => {
    if (rest.includes('NX') && this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK';
  });
}

/** Doble de la cola BullMQ: `add` deduplica por `jobId`, como el real. */
class FakeQueue {
  readonly jobs = new Map<string, FakeJob>();

  add = jest.fn(
    async (
      name: string,
      data: UsersBulkCreateJobPayload,
      opts: { jobId: string },
    ): Promise<FakeJob> => {
      const existing = this.jobs.get(opts.jobId);
      if (existing) return existing;
      const job: FakeJob = {
        id: opts.jobId,
        name,
        data,
        state: 'waiting',
        getState: async (): Promise<JobState> => job.state,
      };
      this.jobs.set(opts.jobId, job);
      return job;
    },
  );

  getJob = jest.fn(async (jobId: string): Promise<FakeJob | null> => this.jobs.get(jobId) ?? null);

  /** Siembra un job ya existente (estados intermedios y jobs de otro tenant). */
  seed(jobId: string, data: UsersBulkCreateJobPayload, state: JobState, failedReason?: string) {
    const job: FakeJob = {
      id: jobId,
      name: USERS_BULK_CREATE_JOB,
      data,
      state,
      getState: async (): Promise<JobState> => job.state,
    };
    if (failedReason !== undefined) job.failedReason = failedReason;
    this.jobs.set(jobId, job);
    return job;
  }
}

function buildItem(overrides: Partial<BulkCreateUserItem> = {}): BulkCreateUserItem {
  return {
    email: 'tecnico.uno@empresa-demo.test',
    role: UserRole.TECHNICIAN,
    firstName: 'Nombre',
    lastName: 'Apellido',
    ...overrides,
  } as BulkCreateUserItem;
}

function buildPayload(
  tenant: { tenantId: string; schemaName: string; tenantSlug: string },
  emails: string[],
): UsersBulkCreateJobPayload {
  return {
    tenantId: tenant.tenantId,
    schemaName: tenant.schemaName,
    tenantSlug: tenant.tenantSlug,
    actorUserId: ACTOR_ID,
    ipAddress: 'unknown',
    idempotencyKey: IDEMPOTENCY_KEY,
    users: emails.map((email) => ({ email, role: UserRole.TECHNICIAN })),
  };
}

describe('UsersService — flujo asincrono de bulkCreate (Ola E)', () => {
  let service: UsersService;
  let redis: FakeRedis;
  let queue: FakeQueue;

  /** SQL emitido por el QueryRunner falso: incluye el SET LOCAL search_path. */
  let emittedSql: string[];
  /** Filas realmente persistidas, en orden. */
  let savedUsers: Record<string, unknown>[];
  /** Emails que `findOne` debe reportar como ya existentes (conflicto). */
  let existingEmails: Set<string>;
  /** Emails para los que la capa de datos lanza algo que NO es un Error. */
  let rawThrowEmails: Set<string>;
  /** Si es true, el registro persistido devuelve `createdAt` como texto. */
  let createdAtComoTexto: boolean;

  const savedEmails = (): string[] => savedUsers.map((u) => u['email'] as string);

  beforeEach(async () => {
    redis = new FakeRedis();
    queue = new FakeQueue();
    emittedSql = [];
    savedUsers = [];
    existingEmails = new Set<string>();
    rawThrowEmails = new Set<string>();
    createdAtComoTexto = false;

    let sequence = 0;
    const managerMock = {
      findOne: jest.fn(async (_entity: unknown, options: { where: { email: string } }) => {
        if (rawThrowEmails.has(options.where.email)) {
          // Un driver puede rechazar con algo que no hereda de Error.
          return Promise.reject('fallo-crudo-del-driver');
        }
        return existingEmails.has(options.where.email)
          ? ({
              id: `usr-existente-${options.where.email}`,
              email: options.where.email,
              deletedAt: null,
            } as unknown as User)
          : null;
      }),
      create: jest.fn((_entity: unknown, state: Record<string, unknown>) => ({
        ...state,
        id: `usr-generado-${++sequence}`,
        createdAt: createdAtComoTexto
          ? '2026-07-22T10:00:00.000Z'
          : new Date('2026-07-22T10:00:00.000Z'),
        updatedAt: new Date('2026-07-22T10:00:00.000Z'),
        deletedAt: null,
      })),
      save: jest.fn(async (_entity: unknown, value: Record<string, unknown>) => {
        savedUsers.push(value);
        return value;
      }),
      restore: jest.fn(),
    };

    const queryRunnerMock = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        emittedSql.push(sql);
        return [];
      }),
      manager: managerMock,
    };

    const dataSourceMock = { createQueryRunner: jest.fn(() => queryRunnerMock) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: dataSourceMock },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: TenantService,
          useValue: {
            getPrincipalAdminUserId: jest.fn().mockResolvedValue(null),
            setPrincipalAdminUserId: jest.fn(),
            updateTenantSelfProfile: jest.fn(),
            // El job verifica que el schema del payload sea de verdad el del
            // tenant antes de escribir (Ola F, D-5): este es el registro
            // autoritativo contra el que se contrasta.
            findById: jest.fn(async (id: string) => TENANTS_REGISTRADOS.get(id) ?? null),
          },
        },
        {
          provide: SearchQueueService,
          useValue: {
            enqueueUserUpsert: jest.fn().mockResolvedValue(undefined),
            enqueueUserDelete: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EffectivePermissionsService,
          useValue: { invalidateUserPermissions: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MailerService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              if (key === 'FRONTEND_URL') return 'http://localhost:3001';
              return def;
            }),
          },
        },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken(USERS_BULK_CREATE_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ---------------------------------------------------------------------------
  // bulkCreate — encolado, idempotencia y contexto explicito
  // ---------------------------------------------------------------------------
  describe('bulkCreate()', () => {
    it('invariante: sin Idempotency-Key el lote no se encola', async () => {
      await expect(
        TenantContext.run(TENANT_A, () => service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1')),
      ).rejects.toThrow(BadRequestException);

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('invariante: el payload encolado lleva el tenant explicito (ALS no propaga a BullMQ)', async () => {
      const accepted = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      expect(accepted).toEqual({
        jobId: `users-bulk-${TENANT_A.tenantId}-${IDEMPOTENCY_KEY}`,
        status: 'queued',
      });

      const [, payload] = queue.add.mock.calls[0]!;
      expect(payload.tenantId).toBe(TENANT_A.tenantId);
      expect(payload.schemaName).toBe(TENANT_A.schemaName);
      expect(payload.tenantSlug).toBe(TENANT_A.tenantSlug);
      expect(payload.actorUserId).toBe(ACTOR_ID);
      expect(payload.ipAddress).toBe('10.0.0.1');
    });

    it('invariante: el mismo lote reenviado con la misma clave no duplica el job', async () => {
      const primero = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );
      const segundo = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      expect(segundo.jobId).toBe(primero.jobId);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('invariante: la misma clave con un lote distinto es conflicto, no un alta silenciosa', async () => {
      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      await expect(
        TenantContext.run(TENANT_A, () =>
          service.bulkCreate(
            [buildItem({ email: 'otro.tecnico@empresa-demo.test' })],
            ACTOR_ID,
            '10.0.0.1',
            IDEMPOTENCY_KEY,
          ),
        ),
      ).rejects.toThrow(ConflictException);

      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['active' as JobState, 'active'],
      ['waiting' as JobState, 'queued'],
      ['delayed' as JobState, 'queued'],
      ['completed' as JobState, 'completed'],
    ])('reintento con job en estado %s reporta %s', async (state, esperado) => {
      const primero = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );
      queue.jobs.get(primero.jobId)!.state = state;

      const reintento = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      expect(reintento.status).toBe(esperado);
    });

    it('invariante: el rastro de idempotencia esta namespaced por tenant', async () => {
      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      expect([...redis.store.keys()]).toContain(
        `users:bulk-create:${TENANT_A.tenantId}:${IDEMPOTENCY_KEY}`,
      );
    });

    it('propaga los campos opcionales declarados y omite los ausentes', async () => {
      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [buildItem({ jobTitle: 'Tecnico de campo', isOperationalResource: true })],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );

      const [, payload] = queue.add.mock.calls[0]!;
      const item = payload.users[0]!;
      expect(item.jobTitle).toBe('Tecnico de campo');
      expect(item.isOperationalResource).toBe(true);
      expect(item.phone).toBeUndefined();
      expect(item.documentNumber).toBeUndefined();
    });

    it('propaga el item completo sin perder ningun campo opcional', async () => {
      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [
            buildItem({
              phone: '+573001234567',
              jobTitle: 'Tecnico de campo',
              documentType: DocumentType.CC,
              documentNumber: '00000000',
              isOperationalResource: false,
            }),
          ],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );

      const [, payload] = queue.add.mock.calls[0]!;
      expect(payload.users[0]).toEqual({
        email: 'tecnico.uno@empresa-demo.test',
        role: UserRole.TECHNICIAN,
        firstName: 'Nombre',
        lastName: 'Apellido',
        phone: '+573001234567',
        jobTitle: 'Tecnico de campo',
        documentType: DocumentType.CC,
        documentNumber: '00000000',
        isOperationalResource: false,
      });
    });

    it('deriva el slug del schema cuando el contexto no lo trae', async () => {
      // `tenantSlug` es obligatorio por tipo, asi que este caso solo llega en
      // runtime (contexto construido fuera de TenantMiddleware). El fallback del
      // servicio existe para eso; el cast reproduce esa entrada.
      const contextoSinSlug = {
        tenantId: TENANT_A.tenantId,
        schemaName: 'tenant_alfa',
      } as unknown as typeof TENANT_A;

      await TenantContext.run(contextoSinSlug, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      const [, payload] = queue.add.mock.calls[0]!;
      expect(payload.tenantSlug).toBe('alfa');
    });

    it('una IP vacia se registra como desconocida, no como cadena vacia', async () => {
      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '', IDEMPOTENCY_KEY),
      );

      const [, payload] = queue.add.mock.calls[0]!;
      expect(payload.ipAddress).toBe('unknown');
    });

    it('sin IP explicita el payload usa el valor por defecto', async () => {
      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, undefined, IDEMPOTENCY_KEY),
      );

      const [, payload] = queue.add.mock.calls[0]!;
      expect(payload.ipAddress).toBe('unknown');
    });

    it('un rastro de idempotencia sin jobId no impide encolar el lote', async () => {
      // Estado posible si el proceso murio entre el rastro y el `add`.
      redis.store.set(
        `users:bulk-create:${TENANT_A.tenantId}:${IDEMPOTENCY_KEY}`,
        JSON.stringify({
          fingerprint: await (async () => {
            await TenantContext.run(TENANT_A, () =>
              service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', 'clave-auxiliar'),
            );
            const guardado = redis.store.get(
              `users:bulk-create:${TENANT_A.tenantId}:clave-auxiliar`,
            )!;
            return (JSON.parse(guardado) as { fingerprint: string }).fingerprint;
          })(),
        }),
      );
      queue.add.mockClear();

      const respuesta = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      expect(respuesta.status).toBe('queued');
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('un rastro que apunta a un job ya desaparecido vuelve a encolar', async () => {
      const primero = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );
      queue.jobs.delete(primero.jobId);
      queue.add.mockClear();

      const reintento = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate([buildItem()], ACTOR_ID, '10.0.0.1', IDEMPOTENCY_KEY),
      );

      expect(reintento.jobId).toBe(primero.jobId);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getBulkJobStatus — estados y aislamiento
  // ---------------------------------------------------------------------------
  describe('getBulkJobStatus()', () => {
    const JOB_ID = 'users-bulk-job-estado';

    it('invariante: un jobId inexistente es 404, no un estado vacio', async () => {
      await expect(
        TenantContext.run(TENANT_A, () => service.getBulkJobStatus('no-existe')),
      ).rejects.toThrow(NotFoundException);
    });

    it('invariante de aislamiento: el job de otro tenant es 404, no legible', async () => {
      queue.seed(JOB_ID, buildPayload(TENANT_B, ['ajeno@empresa-demo.test']), 'completed');

      await expect(
        TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID)),
      ).rejects.toThrow(NotFoundException);
    });

    it.each([
      ['waiting' as JobState, 'queued'],
      ['delayed' as JobState, 'queued'],
      ['active' as JobState, 'active'],
      ['completed' as JobState, 'completed'],
    ])('mapea el estado %s de la cola a %s', async (state, esperado) => {
      queue.seed(JOB_ID, buildPayload(TENANT_A, ['a@empresa-demo.test']), state);

      const respuesta = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));

      expect(respuesta.status).toBe(esperado);
      expect(respuesta.jobId).toBe(JOB_ID);
    });

    it('un job fallido expone el motivo de fallo', async () => {
      queue.seed(
        JOB_ID,
        buildPayload(TENANT_A, ['a@empresa-demo.test']),
        'failed',
        'Conexion perdida con la base de datos',
      );

      const respuesta = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));

      expect(respuesta.status).toBe('failed');
      expect(respuesta.errorMessage).toBe('Conexion perdida con la base de datos');
      expect(respuesta.summary).toBeNull();
    });

    it('un job fallido sin motivo declarado recibe un mensaje generico', async () => {
      queue.seed(JOB_ID, buildPayload(TENANT_A, ['a@empresa-demo.test']), 'failed');

      const respuesta = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));

      expect(respuesta.errorMessage).toBe('Error en la importación');
    });

    it('un estado de cola no contemplado se reporta como desconocido', async () => {
      queue.seed(JOB_ID, buildPayload(TENANT_A, ['a@empresa-demo.test']), 'paused');

      const respuesta = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));

      expect(respuesta.status).toBe('unknown');
      expect(respuesta.failed).toEqual([]);
    });

    it('invariante: el estado nunca incluye contrasenas temporales', async () => {
      const payload = buildPayload(TENANT_A, ['a@empresa-demo.test']);
      queue.seed(JOB_ID, payload, 'completed');
      await service.executeBulkCreateJob(payload, JOB_ID);

      const respuesta = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));

      expect(respuesta.summary).toEqual({ total: 1, succeeded: 1, failed: 0 });
      expect(respuesta.credentialsClaimed).toBe(false);
      expect(JSON.stringify(respuesta)).not.toContain('temporaryPassword');
    });
  });

  // ---------------------------------------------------------------------------
  // claimBulkJobResult — unicidad del reclamo de credenciales
  // ---------------------------------------------------------------------------
  describe('claimBulkJobResult()', () => {
    const JOB_ID = 'users-bulk-job-claim';

    async function prepararLoteCompletado(emails: string[]): Promise<void> {
      const payload = buildPayload(TENANT_A, emails);
      queue.seed(JOB_ID, payload, 'completed');
      await service.executeBulkCreateJob(payload, JOB_ID);
    }

    it('invariante: no se entregan credenciales de un job que aun no termino', async () => {
      queue.seed(JOB_ID, buildPayload(TENANT_A, ['a@empresa-demo.test']), 'active');

      await expect(
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
      ).rejects.toThrow(BadRequestException);
    });

    it('invariante de aislamiento: no se reclaman credenciales de un job de otro tenant', async () => {
      const payload = buildPayload(TENANT_B, ['ajeno@empresa-demo.test']);
      queue.seed(JOB_ID, payload, 'completed');
      await service.executeBulkCreateJob(payload, JOB_ID);

      await expect(
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
      ).rejects.toThrow(NotFoundException);
    });

    it('un job completado sin resultado almacenado es 404', async () => {
      queue.seed(JOB_ID, buildPayload(TENANT_A, ['a@empresa-demo.test']), 'completed');

      await expect(
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
      ).rejects.toThrow(NotFoundException);
    });

    it('el primer reclamo entrega las contrasenas temporales', async () => {
      await prepararLoteCompletado(['a@empresa-demo.test', 'b@empresa-demo.test']);

      const primero = await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));

      expect(primero.status).toBe('completed');
      expect(primero.summary).toEqual({ total: 2, succeeded: 2, failed: 0 });
      expect(primero.succeeded).toHaveLength(2);
      for (const item of primero.succeeded) {
        expect(typeof item.temporaryPassword).toBe('string');
        expect(item.temporaryPassword).toHaveLength(32);
      }
      expect(primero.credentialsClaimed).toBe(true);
    });

    it('INVARIANTE DE SEGURIDAD: un segundo reclamo NO vuelve a entregar las contrasenas', async () => {
      await prepararLoteCompletado(['a@empresa-demo.test', 'b@empresa-demo.test']);

      const primero = await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));
      const segundo = await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));

      // El primero si las entrego — el contraste es lo que da valor a la asercion.
      expect(primero.succeeded.every((s) => Boolean(s.temporaryPassword))).toBe(true);

      // El segundo devuelve el mismo resumen, pero sin ningun secreto.
      expect(segundo.summary).toEqual(primero.summary);
      expect(segundo.succeeded).toHaveLength(2);
      expect(segundo.succeeded.every((s) => s.temporaryPassword === undefined)).toBe(true);
      expect(Object.keys(segundo.succeeded[0]!)).not.toContain('temporaryPassword');
      expect(JSON.stringify(segundo)).not.toContain(primero.succeeded[0]!.temporaryPassword);
      expect(segundo.credentialsClaimed).toBe(true);
    });

    it('INVARIANTE DE SEGURIDAD: el tercer reclamo tampoco las recupera', async () => {
      await prepararLoteCompletado(['a@empresa-demo.test']);

      await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));
      await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));
      const tercero = await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));

      expect(tercero.succeeded[0]!.temporaryPassword).toBeUndefined();
    });

    it('tras el reclamo, el estado del job lo declara consumido', async () => {
      await prepararLoteCompletado(['a@empresa-demo.test']);

      await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));
      const estado = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));

      expect(estado.credentialsClaimed).toBe(true);
    });

    it('el reclamo conserva las filas fallidas junto a las exitosas', async () => {
      existingEmails.add('duplicado@empresa-demo.test');
      const payload = buildPayload(TENANT_A, [
        'a@empresa-demo.test',
        'duplicado@empresa-demo.test',
      ]);
      queue.seed(JOB_ID, payload, 'completed');
      await service.executeBulkCreateJob(payload, JOB_ID);

      const resultado = await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));

      expect(resultado.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
      expect(resultado.failed[0]!.rowIndex).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // executeBulkCreateJob — ejecucion en el worker
  // ---------------------------------------------------------------------------
  describe('executeBulkCreateJob()', () => {
    const JOB_ID = 'users-bulk-job-exec';

    it('INVARIANTE MULTI-TENANT: escribe en el schema del payload, no en el contexto ambiente', async () => {
      const payload = buildPayload(TENANT_A, ['a@empresa-demo.test']);

      // Contexto ambiente de OTRO tenant: si el job lo tomara, el aislamiento
      // por schema quedaria roto en un camino que no pasa por TenantMiddleware.
      await TenantContext.run(TENANT_B, () => service.executeBulkCreateJob(payload, JOB_ID));

      const setSearchPath = emittedSql.filter((sql) => sql.startsWith('SET LOCAL search_path'));
      expect(setSearchPath).toEqual([`SET LOCAL search_path TO "${TENANT_A.schemaName}"`]);
      expect(setSearchPath.join()).not.toContain(TENANT_B.schemaName);
    });

    it('INVARIANTE MULTI-TENANT: el resultado se guarda bajo el tenant del payload', async () => {
      const payload = buildPayload(TENANT_A, ['a@empresa-demo.test']);

      await TenantContext.run(TENANT_B, () => service.executeBulkCreateJob(payload, JOB_ID));

      // La asercion original enumeraba el keyspace completo con `toEqual`. El
      // job escribe ahora tambien rastros de idempotencia por fila (Ola F, D-2),
      // igualmente namespaced por tenant, asi que se conserva el invariante
      // —todo lo escrito cuelga del tenant del payload— reforzandolo: ninguna
      // clave puede mencionar al tenant ambiente.
      const claves = [...redis.store.keys()];
      expect(claves).toContain(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`);
      expect(claves.every((k) => k.includes(TENANT_A.tenantId))).toBe(true);
      expect(claves.some((k) => k.includes(TENANT_B.tenantId))).toBe(false);
    });

    it('no deja contexto de tenant residual tras terminar', async () => {
      const payload = buildPayload(TENANT_A, ['a@empresa-demo.test']);

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(TenantContext.get()).toBeUndefined();
    });

    it('INVARIANTE: un schemaName invalido en el payload no escribe ninguna fila', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, ['a@empresa-demo.test', 'b@empresa-demo.test']),
        schemaName: 'public',
      };

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(savedEmails()).toEqual([]);
      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as { summary: { total: number; succeeded: number; failed: number } };
      expect(store.summary).toEqual({ total: 2, succeeded: 0, failed: 2 });
    });

    it('INVARIANTE: un fallo parcial no revierte las filas ya creadas', async () => {
      existingEmails.add('duplicado@empresa-demo.test');
      const payload = buildPayload(TENANT_A, [
        'primera@empresa-demo.test',
        'duplicado@empresa-demo.test',
        'tercera@empresa-demo.test',
      ]);

      await service.executeBulkCreateJob(payload, JOB_ID);

      // Las filas 1 y 3 entraron pese al fallo de la 2 (transaccion por fila).
      expect(savedEmails()).toEqual(['primera@empresa-demo.test', 'tercera@empresa-demo.test']);

      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as {
        summary: { total: number; succeeded: number; failed: number };
        succeeded: { email: string; temporaryPassword: string }[];
        failed: { rowIndex: number; email: string; reason: string }[];
        credentialsClaimed: boolean;
      };

      expect(store.summary).toEqual({ total: 3, succeeded: 2, failed: 1 });
      expect(store.succeeded.map((s) => s.email)).toEqual([
        'primera@empresa-demo.test',
        'tercera@empresa-demo.test',
      ]);
      expect(store.failed).toEqual([
        {
          rowIndex: 2,
          email: 'duplicado@empresa-demo.test',
          reason: 'El email ya existe en este tenant.',
        },
      ]);
      expect(store.credentialsClaimed).toBe(false);
    });

    it('INVARIANTE: el rowIndex del fallo apunta a la fila del lote, en base 1', async () => {
      existingEmails.add('duplicado@empresa-demo.test');
      const payload = buildPayload(TENANT_A, [
        'a@empresa-demo.test',
        'b@empresa-demo.test',
        'c@empresa-demo.test',
        'duplicado@empresa-demo.test',
      ]);

      await service.executeBulkCreateJob(payload, JOB_ID);

      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as { failed: { rowIndex: number }[] };
      expect(store.failed[0]!.rowIndex).toBe(4);
    });

    it('cada fila exitosa recibe una contrasena temporal distinta', async () => {
      const payload = buildPayload(TENANT_A, [
        'a@empresa-demo.test',
        'b@empresa-demo.test',
        'c@empresa-demo.test',
      ]);

      await service.executeBulkCreateJob(payload, JOB_ID);

      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as { succeeded: { temporaryPassword: string; createdAt: string }[] };

      const passwords = store.succeeded.map((s) => s.temporaryPassword);
      expect(new Set(passwords).size).toBe(3);
      expect(passwords.every((p) => /^[0-9a-f]{32}$/.test(p))).toBe(true);
      expect(store.succeeded[0]!.createdAt).toBe('2026-07-22T10:00:00.000Z');
    });

    it('traslada al alta todos los campos opcionales del item del lote', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, []),
        users: [
          {
            email: 'tecnica.completa@empresa-demo.test',
            role: UserRole.TECHNICIAN,
            firstName: 'Nombre',
            lastName: 'Apellido',
            phone: '+573001234567',
            jobTitle: 'Tecnico de campo',
            documentType: DocumentType.CC,
            documentNumber: '00000000',
            isOperationalResource: false,
          },
        ],
      };

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(savedUsers[0]).toMatchObject({
        email: 'tecnica.completa@empresa-demo.test',
        role: UserRole.TECHNICIAN,
        firstName: 'Nombre',
        lastName: 'Apellido',
        phone: '+573001234567',
        jobTitle: 'Tecnico de campo',
        documentType: DocumentType.CC,
        documentNumber: '00000000',
        // Se respeta el valor explicito aunque el rol implicaria `true`.
        isOperationalResource: false,
      });
    });

    it('INVARIANTE: un fallo que no es un Error no rompe el lote ni filtra el objeto crudo', async () => {
      rawThrowEmails.add('driver-roto@empresa-demo.test');
      const payload = buildPayload(TENANT_A, [
        'driver-roto@empresa-demo.test',
        'segunda@empresa-demo.test',
      ]);

      await service.executeBulkCreateJob(payload, JOB_ID);

      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as {
        summary: { total: number; succeeded: number; failed: number };
        failed: { rowIndex: number; email: string; reason: string }[];
      };

      expect(store.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
      expect(store.failed[0]).toEqual({
        rowIndex: 1,
        email: 'driver-roto@empresa-demo.test',
        reason: 'Error desconocido al crear el usuario.',
      });
      expect(savedEmails()).toEqual(['segunda@empresa-demo.test']);
    });

    it('normaliza a texto un createdAt que la capa de datos no devuelve como Date', async () => {
      createdAtComoTexto = true;
      const payload = buildPayload(TENANT_A, ['a@empresa-demo.test']);

      await service.executeBulkCreateJob(payload, JOB_ID);

      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as { succeeded: { createdAt: string }[] };
      expect(store.succeeded[0]!.createdAt).toBe('2026-07-22T10:00:00.000Z');
    });

    it('un lote vacio produce un resumen en cero sin tocar la base', async () => {
      const payload = buildPayload(TENANT_A, []);

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(savedEmails()).toEqual([]);
      const store = JSON.parse(
        redis.store.get(`users:bulk-result:${TENANT_A.tenantId}:${JOB_ID}`)!,
      ) as { summary: { total: number } };
      expect(store.summary.total).toBe(0);
    });
  });
});
