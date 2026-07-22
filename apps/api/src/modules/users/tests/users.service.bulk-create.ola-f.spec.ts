/**
 * Ola F de MOD04 — regresiones de los cinco defectos del flujo asincrono de
 * alta masiva destapados por la cobertura de la Ola E.
 *
 * D-1 (seguridad): la marca de reclamo one-time debe ser atomica. Se ejercita
 *     con concurrencia real (`Promise.all` sobre el mismo jobId), no solo con
 *     el caso secuencial que ya cubria la Ola E.
 * D-2 (correccion): un reintento del job reconoce las filas que el intento
 *     anterior si creo, y conserva sus contrasenas temporales.
 * D-3 (contrato): un lote que agoto sus reintentos se anuncia `failed`, no
 *     `queued`, y no se reencola bajo la misma clave.
 * D-4 (fuga): el motivo de una fila fallida es accionable; el detalle tecnico
 *     no viaja al cliente.
 * D-5 (defensa en profundidad): el job valida que el schema del payload sea de
 *     verdad el del tenant antes de escribir nada.
 *
 * Los dobles de Redis honran `NX` — sin esa semantica un `SET NX` roto pasaria
 * desapercibido, que es justo el defecto D-1.
 *
 * SEGURIDAD: sin PII real. Emails de dominio `.test` y contrasenas sinteticas.
 */

import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TenantContext, User } from '@iwana/db';
import {
  USERS_BULK_CREATE_JOB,
  USERS_BULK_CREATE_QUEUE,
  UserRole,
  type UsersBulkCreateJobPayload,
} from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { SearchQueueService } from '../../search/search-queue.service';
import { TenantService } from '../../tenant/tenant.service';
import { UsersService } from '../users.service';

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
const TENANTS_REGISTRADOS = new Map([
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
const IDEMPOTENCY_KEY = 'lote-ola-f-001';

type JobState = 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'paused';

interface FakeJob {
  id: string;
  name: string;
  data: UsersBulkCreateJobPayload;
  state: JobState;
  failedReason?: string;
  getState: () => Promise<JobState>;
}

/** Doble de Redis con estado real y semantica `NX` (la marca one-time depende de ella). */
class FakeRedis {
  readonly store = new Map<string, string>();
  /** Fuerza que todas las lecturas concurrentes ocurran antes que las escrituras. */
  demoraLectura = false;

  get = jest.fn(async (key: string): Promise<string | null> => {
    // El valor se toma AL entrar y se devuelve tras ceder el turno: asi todas
    // las lecturas concurrentes ven el mismo estado inicial, que es lo que pasa
    // cuando cuatro peticiones consultan Redis antes de que ninguna escriba.
    const valor = this.store.get(key) ?? null;
    if (this.demoraLectura) await new Promise((resolve) => setImmediate(resolve));
    return valor;
  });

  set = jest.fn(async (key: string, value: string, ...rest: unknown[]): Promise<string | null> => {
    if (rest.includes('NX') && this.store.has(key)) return null;
    this.store.set(key, value);
    return 'OK';
  });
}

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

function buildPayload(
  tenant: { tenantId: string; schemaName: string; tenantSlug: string },
  emails: string[],
  idempotencyKey: string = IDEMPOTENCY_KEY,
): UsersBulkCreateJobPayload {
  return {
    tenantId: tenant.tenantId,
    schemaName: tenant.schemaName,
    tenantSlug: tenant.tenantSlug,
    actorUserId: ACTOR_ID,
    ipAddress: 'unknown',
    idempotencyKey,
    users: emails.map((email) => ({ email, role: UserRole.TECHNICIAN })),
  };
}

interface StoreLeido {
  summary: { total: number; succeeded: number; failed: number };
  succeeded: { email: string; temporaryPassword?: string }[];
  failed: { rowIndex: number; email: string; reason: string }[];
  credentialsClaimed: boolean;
}

describe('UsersService — regresiones de la Ola F (bulkCreate async)', () => {
  let service: UsersService;
  let redis: FakeRedis;
  let queue: FakeQueue;

  /** SQL emitido por el QueryRunner falso, incluido el SET LOCAL search_path. */
  let emittedSql: string[];
  /** Tabla en memoria del tenant: el reintento debe verla poblada. */
  let tabla: Map<string, Record<string, unknown>>;
  /** Filas realmente insertadas, en orden (no crece en un reintento idempotente). */
  let savedUsers: Record<string, unknown>[];
  /** Emails que fallan una sola vez, para simular la muerte del intento 1. */
  let fallosTransitorios: Set<string>;
  /** Emails para los que la capa de datos lanza un error con detalle interno. */
  let fallosInternos: Map<string, string>;

  const leerStore = (tenantId: string, jobId: string): StoreLeido =>
    JSON.parse(redis.store.get(`users:bulk-result:${tenantId}:${jobId}`)!) as StoreLeido;

  beforeEach(async () => {
    redis = new FakeRedis();
    queue = new FakeQueue();
    emittedSql = [];
    tabla = new Map();
    savedUsers = [];
    fallosTransitorios = new Set();
    fallosInternos = new Map();

    let sequence = 0;
    const managerMock = {
      findOne: jest.fn(
        async (_entity: unknown, options: { where: { email?: string; id?: string } }) => {
          const { email, id } = options.where;
          if (email !== undefined) {
            const detalle = fallosInternos.get(email);
            if (detalle) throw new Error(detalle);
            if (fallosTransitorios.has(email)) {
              fallosTransitorios.delete(email);
              throw new Error('Conexion perdida con la base de datos');
            }
            return (tabla.get(email) ?? null) as unknown as User | null;
          }
          const porId = [...tabla.values()].find((u) => u['id'] === id);
          return (porId ?? null) as unknown as User | null;
        },
      ),
      create: jest.fn((_entity: unknown, state: Record<string, unknown>) => ({
        ...state,
        id: `usr-generado-${++sequence}`,
        createdAt: new Date('2026-07-22T10:00:00.000Z'),
        updatedAt: new Date('2026-07-22T10:00:00.000Z'),
        deletedAt: null,
      })),
      save: jest.fn(async (_entity: unknown, value: Record<string, unknown>) => {
        savedUsers.push(value);
        tabla.set(value['email'] as string, value);
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
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: getQueueToken(USERS_BULK_CREATE_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ---------------------------------------------------------------------------
  // D-1 — el reclamo one-time es atomico
  // ---------------------------------------------------------------------------
  describe('D-1 · reclamo one-time de credenciales', () => {
    const JOB_ID = 'users-bulk-ola-f-claim';

    async function prepararLoteCompletado(emails: string[]): Promise<void> {
      const payload = buildPayload(TENANT_A, emails);
      queue.seed(JOB_ID, payload, 'completed');
      await service.executeBulkCreateJob(payload, JOB_ID);
    }

    it('INVARIANTE DE SEGURIDAD: cuatro reclamos concurrentes revelan las contrasenas una sola vez', async () => {
      await prepararLoteCompletado([
        'concurrente.uno@empresa-demo.test',
        'concurrente.dos@empresa-demo.test',
      ]);

      // Todas las llamadas leen el store antes de que ninguna escriba: es
      // exactamente la ventana que abria el read-modify-write anterior.
      redis.demoraLectura = true;
      const respuestas = await Promise.all([
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
        TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
      ]);
      redis.demoraLectura = false;

      const conSecretos = respuestas.filter((r) =>
        r.succeeded.some((s) => s.temporaryPassword !== undefined),
      );
      expect(conSecretos).toHaveLength(1);

      // Las tres perdedoras no traen ningun secreto, ni siquiera parcial.
      const revelados = conSecretos[0]!.succeeded.map((s) => s.temporaryPassword!);
      expect(revelados).toHaveLength(2);
      for (const respuesta of respuestas.filter((r) => r !== conSecretos[0])) {
        expect(respuesta.credentialsClaimed).toBe(true);
        expect(respuesta.succeeded.every((s) => s.temporaryPassword === undefined)).toBe(true);
        const serializada = JSON.stringify(respuesta);
        for (const secreto of revelados) {
          expect(serializada).not.toContain(secreto);
        }
      }
    });

    it('INVARIANTE DE SEGURIDAD: diez reclamos concurrentes tampoco duplican la revelacion', async () => {
      await prepararLoteCompletado(['carga.uno@empresa-demo.test']);

      redis.demoraLectura = true;
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, () =>
          TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID)),
        ),
      );
      redis.demoraLectura = false;

      const revelaciones = respuestas.filter((r) =>
        r.succeeded.some((s) => s.temporaryPassword !== undefined),
      );
      expect(revelaciones).toHaveLength(1);
    });

    it('la marca de reclamo vive en su propia clave, no solo en el store', async () => {
      await prepararLoteCompletado(['marca@empresa-demo.test']);
      await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));

      expect([...redis.store.keys()]).toContain(`users:bulk-claim:${TENANT_A.tenantId}:${JOB_ID}`);
    });

    it('INVARIANTE DE SEGURIDAD: reejecutar el job no des-reclama credenciales ya entregadas', async () => {
      const payload = buildPayload(TENANT_A, ['reintento.tras.claim@empresa-demo.test']);
      queue.seed(JOB_ID, payload, 'completed');
      await service.executeBulkCreateJob(payload, JOB_ID);
      await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));

      // El reintento reescribe el store; la marca no puede perderse con el.
      await service.executeBulkCreateJob(payload, JOB_ID);

      const posterior = await TenantContext.run(TENANT_A, () => service.claimBulkJobResult(JOB_ID));
      expect(posterior.succeeded.every((s) => s.temporaryPassword === undefined)).toBe(true);

      const estado = await TenantContext.run(TENANT_A, () => service.getBulkJobStatus(JOB_ID));
      expect(estado.credentialsClaimed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // D-2 — el reintento del job no pierde ni duplica filas
  // ---------------------------------------------------------------------------
  describe('D-2 · reintento del job', () => {
    const JOB_ID = 'users-bulk-ola-f-reintento';
    const EMAILS = [
      'reintento.uno@empresa-demo.test',
      'reintento.dos@empresa-demo.test',
      'reintento.tres@empresa-demo.test',
    ];

    it('las filas creadas en el intento previo se reconocen como exitosas, no como duplicadas', async () => {
      const payload = buildPayload(TENANT_A, EMAILS);
      // El intento 1 muere en la fila 3 tras crear las dos primeras.
      fallosTransitorios.add(EMAILS[2]!);
      await service.executeBulkCreateJob(payload, JOB_ID);

      const intento1 = leerStore(TENANT_A.tenantId, JOB_ID);
      expect(intento1.summary).toEqual({ total: 3, succeeded: 2, failed: 1 });

      await service.executeBulkCreateJob(payload, JOB_ID);

      const intento2 = leerStore(TENANT_A.tenantId, JOB_ID);
      expect(intento2.summary).toEqual({ total: 3, succeeded: 3, failed: 0 });
      expect(intento2.failed).toEqual([]);
      // Tres altas reales en total: el reintento no reinserto las dos primeras.
      expect(savedUsers).toHaveLength(3);
    });

    it('el reintento conserva las contrasenas temporales del intento anterior', async () => {
      const payload = buildPayload(TENANT_A, EMAILS);
      fallosTransitorios.add(EMAILS[2]!);
      await service.executeBulkCreateJob(payload, JOB_ID);
      const previas = new Map(
        leerStore(TENANT_A.tenantId, JOB_ID).succeeded.map((s) => [s.email, s.temporaryPassword]),
      );

      await service.executeBulkCreateJob(payload, JOB_ID);

      const posterior = leerStore(TENANT_A.tenantId, JOB_ID);
      expect(posterior.succeeded).toHaveLength(3);
      for (const fila of posterior.succeeded) {
        expect(fila.temporaryPassword).toMatch(/^[0-9a-f]{32}$/);
      }
      expect(posterior.succeeded.find((s) => s.email === EMAILS[0])!.temporaryPassword).toBe(
        previas.get(EMAILS[0]!),
      );
      expect(posterior.succeeded.find((s) => s.email === EMAILS[1])!.temporaryPassword).toBe(
        previas.get(EMAILS[1]!),
      );
    });

    it('CONTRASTE: sin la clave del lote las mismas filas si chocarian como duplicadas', async () => {
      await service.executeBulkCreateJob(buildPayload(TENANT_A, EMAILS), JOB_ID);

      // Otro lote, otra clave: la idempotencia por fila ya no aplica y la tabla
      // del tenant devuelve el conflicto real. Esto prueba que el caso anterior
      // no pasa por casualidad.
      const otroJob = 'users-bulk-ola-f-otro-lote';
      await service.executeBulkCreateJob(buildPayload(TENANT_A, EMAILS, 'lote-distinto'), otroJob);

      const store = leerStore(TENANT_A.tenantId, otroJob);
      expect(store.summary).toEqual({ total: 3, succeeded: 0, failed: 3 });
      expect(store.failed.map((f) => f.reason)).toEqual([
        'El email ya existe en este tenant.',
        'El email ya existe en este tenant.',
        'El email ya existe en este tenant.',
      ]);
    });

    it('dos filas distintas del mismo lote no comparten clave de idempotencia', async () => {
      await service.executeBulkCreateJob(buildPayload(TENANT_A, EMAILS), JOB_ID);

      const clavesDeFila = [...redis.store.keys()].filter((k) =>
        k.startsWith(`users:create:${TENANT_A.tenantId}:bulk:${IDEMPOTENCY_KEY}:`),
      );
      expect(clavesDeFila).toHaveLength(3);
      expect(new Set(clavesDeFila).size).toBe(3);
      // Las tres altas ocurrieron: ninguna fila se reconocio como otra.
      expect(savedUsers).toHaveLength(3);
    });

    it('la clave de fila queda namespaced bajo el tenant del payload', async () => {
      await TenantContext.run(TENANT_B, () =>
        service.executeBulkCreateJob(buildPayload(TENANT_A, [EMAILS[0]!]), JOB_ID),
      );

      const claves = [...redis.store.keys()];
      expect(claves.every((k) => k.includes(TENANT_A.tenantId))).toBe(true);
      expect(claves.some((k) => k.includes(TENANT_B.tenantId))).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // D-3 — un lote fallido se anuncia como fallido
  // ---------------------------------------------------------------------------
  describe('D-3 · estado de un lote que agoto sus reintentos', () => {
    it('INVARIANTE DE CONTRATO: reenviar el lote de un job fallido devuelve failed, no queued', async () => {
      const aceptado = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );
      queue.jobs.get(aceptado.jobId)!.state = 'failed';
      queue.add.mockClear();

      const reenvio = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );

      expect(reenvio.status).toBe('failed');
      expect(reenvio.jobId).toBe(aceptado.jobId);
    });

    it('el lote fallido no se reencola bajo la misma clave', async () => {
      const aceptado = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );
      queue.jobs.get(aceptado.jobId)!.state = 'failed';
      queue.add.mockClear();

      await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );

      expect(queue.add).not.toHaveBeenCalled();
      expect(queue.jobs.get(aceptado.jobId)!.state).toBe('failed');
    });

    it('las dos rutas coinciden: aceptacion y estado reportan lo mismo', async () => {
      const aceptado = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );
      queue.jobs.get(aceptado.jobId)!.state = 'failed';

      const reenvio = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );
      const estado = await TenantContext.run(TENANT_A, () =>
        service.getBulkJobStatus(aceptado.jobId),
      );

      expect(reenvio.status).toBe(estado.status);
      expect(estado.status).toBe('failed');
    });

    it('una clave nueva si abre un lote nuevo tras el fallo', async () => {
      const aceptado = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          IDEMPOTENCY_KEY,
        ),
      );
      queue.jobs.get(aceptado.jobId)!.state = 'failed';

      const nuevo = await TenantContext.run(TENANT_A, () =>
        service.bulkCreate(
          [{ email: 'fallido@empresa-demo.test', role: UserRole.TECHNICIAN }],
          ACTOR_ID,
          '10.0.0.1',
          'lote-ola-f-002',
        ),
      );

      expect(nuevo.status).toBe('queued');
      expect(nuevo.jobId).not.toBe(aceptado.jobId);
    });
  });

  // ---------------------------------------------------------------------------
  // D-4 — el motivo del fallo no filtra detalle interno
  // ---------------------------------------------------------------------------
  describe('D-4 · motivo de fallo devuelto al cliente', () => {
    const JOB_ID = 'users-bulk-ola-f-motivo';

    it('INVARIANTE: un error interno no expone su mensaje tecnico en la respuesta', async () => {
      fallosInternos.set(
        'con-detalle@empresa-demo.test',
        'Schema name invalido: "public". Solo se aceptan schemas tenant_*.',
      );
      const payload = buildPayload(TENANT_A, ['con-detalle@empresa-demo.test']);

      await service.executeBulkCreateJob(payload, JOB_ID);

      const store = leerStore(TENANT_A.tenantId, JOB_ID);
      expect(store.failed[0]!.reason).toBe('Error desconocido al crear el usuario.');
      const serializado = JSON.stringify(store);
      expect(serializado).not.toContain('Schema name invalido');
      expect(serializado).not.toContain('tenant_*');
    });

    it('el detalle tecnico si queda registrado en el log del servidor', async () => {
      const logError = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      fallosInternos.set('con-detalle@empresa-demo.test', 'Detalle interno de infraestructura');

      await service.executeBulkCreateJob(
        buildPayload(TENANT_A, ['con-detalle@empresa-demo.test']),
        JOB_ID,
      );

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Detalle interno de infraestructura'),
      );
      logError.mockRestore();
    });

    it('un conflicto de email conserva su motivo accionable', async () => {
      tabla.set('ya-existe@empresa-demo.test', {
        id: 'usr-previo',
        email: 'ya-existe@empresa-demo.test',
        deletedAt: null,
      });

      await service.executeBulkCreateJob(
        buildPayload(TENANT_A, ['ya-existe@empresa-demo.test']),
        JOB_ID,
      );

      expect(leerStore(TENANT_A.tenantId, JOB_ID).failed[0]!.reason).toBe(
        'El email ya existe en este tenant.',
      );
    });

    it('una validacion de negocio conserva su mensaje: es accionable para el operador', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, []),
        // Rol de plataforma: `create` lo rechaza en la frontera de roles.
        users: [{ email: 'rol-invalido@empresa-demo.test', role: 'SYSTEM_ADMIN' as UserRole }],
      };

      await service.executeBulkCreateJob(payload, JOB_ID);

      const motivo = leerStore(TENANT_A.tenantId, JOB_ID).failed[0]!.reason;
      expect(motivo).not.toBe('Error desconocido al crear el usuario.');
      expect(motivo.length).toBeGreaterThan(0);
      expect(motivo).not.toContain('tenant_');
    });
  });

  // ---------------------------------------------------------------------------
  // D-5 — el job valida la coherencia del contexto que recibe
  // ---------------------------------------------------------------------------
  describe('D-5 · coherencia del contexto del job', () => {
    const JOB_ID = 'users-bulk-ola-f-contexto';

    it('INVARIANTE MULTI-TENANT: un payload con tenant de A y schema de B no escribe nada', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, [
          'cruzado.uno@empresa-demo.test',
          'cruzado.dos@empresa-demo.test',
        ]),
        schemaName: TENANT_B.schemaName,
      };

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(savedUsers).toEqual([]);
      expect(emittedSql.filter((sql) => sql.startsWith('SET LOCAL search_path'))).toEqual([]);
    });

    it('el lote incoherente se cierra con todas las filas fallidas y sin credenciales', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, [
          'cruzado.uno@empresa-demo.test',
          'cruzado.dos@empresa-demo.test',
        ]),
        schemaName: TENANT_B.schemaName,
      };

      await service.executeBulkCreateJob(payload, JOB_ID);

      const store = leerStore(TENANT_A.tenantId, JOB_ID);
      expect(store.summary).toEqual({ total: 2, succeeded: 0, failed: 2 });
      expect(store.succeeded).toEqual([]);
      expect(store.failed.map((f) => f.rowIndex)).toEqual([1, 2]);
      expect(JSON.stringify(store)).not.toContain(TENANT_B.schemaName);
    });

    it('un tenantId que no existe en el registro autoritativo se rechaza', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, ['fantasma@empresa-demo.test']),
        tenantId: 'ten-00000000-0000-4000-a000-0000000000ff',
      };

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(savedUsers).toEqual([]);
      const store = leerStore('ten-00000000-0000-4000-a000-0000000000ff', JOB_ID);
      expect(store.summary.failed).toBe(1);
    });

    it('el job toma el slug del registro autoritativo, no el derivado del payload', async () => {
      const payload: UsersBulkCreateJobPayload = {
        ...buildPayload(TENANT_A, ['slug@empresa-demo.test']),
        // Valor que produciria el fallback cuando el contexto no trae slug.
        tenantSlug: 'valor-derivado-incorrecto',
      };

      let slugEnEjecucion: string | undefined;
      const enqueueSpy = jest
        .spyOn(service['searchQueueService'], 'enqueueUserUpsert')
        .mockImplementation(async () => {
          slugEnEjecucion = TenantContext.get()?.tenantSlug;
        });

      await service.executeBulkCreateJob(payload, JOB_ID);

      expect(slugEnEjecucion).toBe(TENANT_A.tenantSlug);
      enqueueSpy.mockRestore();
    });

    it('un payload coherente sigue ejecutandose con normalidad', async () => {
      await service.executeBulkCreateJob(
        buildPayload(TENANT_A, ['coherente@empresa-demo.test']),
        JOB_ID,
      );

      expect(emittedSql).toContain(`SET LOCAL search_path TO "${TENANT_A.schemaName}"`);
      expect(leerStore(TENANT_A.tenantId, JOB_ID).summary).toEqual({
        total: 1,
        succeeded: 1,
        failed: 0,
      });
    });
  });
});
