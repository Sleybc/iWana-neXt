/**
 * MOD11 · El ETag de la OT debe identificar la representación (2026-09-14).
 *
 * Hallazgo de campo: el ETag era `"<version>"` (contador de concurrencia
 * optimista), así que tras ampliar el contrato a v1.1 los navegadores seguían
 * revalidando con `If-None-Match` y recibiendo 304 con el cuerpo viejo.
 *
 * Fija los cuatro casos del prompt
 * `PROMPT-MOD11-CONSOLA-OT-ETAG-REPRESENTACION-v1.0.md` §5 (pasos 5-7):
 *  1. Regresión del incidente: misma `version`, distinta versión de contrato
 *     ⇒ ETags distintos.
 *  2. Concurrencia intacta: `If-Match` numérico funciona; versión distinta ⇒
 *     `VERSION_CONFLICT` (409).
 *  3. Formato inválido: el ETag completo como `If-Match` ⇒ error de formato
 *     (400 `VALIDATION_ERROR`), NO `VERSION_CONFLICT` engañoso.
 *  4. El caso E2E `execution-orders-operational.spec.ts:282` se reescribe en el
 *     archivo E2E (afirma la regla nueva); aquí queda la contrapartida unitaria.
 *
 * Sin PII real: UUIDs sintéticos y correos del dominio de ejemplo.
 */

import { BadRequestException, ConflictException, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { DataSource } from 'typeorm';
import { ExecutionOrderResult, ExecutionOrderStatus, UserRole } from '@iwana/shared';
import { runInTenantSchema } from '@iwana/db';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  EXECUTION_ORDER_CONTRACT_VERSION,
  ExecutionOrderResponseHeadersInterceptor,
  buildExecutionOrderETag,
  isExecutionOrderRepresentation,
} from '../interceptors/execution-order-response-headers.interceptor';
import { ExecutionOrdersService } from '../services/execution-orders.service';

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
  ExecutionOrderOutboxEvent: class ExecutionOrderOutboxEvent {},
  ExecutionOrderIdempotencyRecord: class ExecutionOrderIdempotencyRecord {},
  ExecutionOrderAuditIntent: class ExecutionOrderAuditIntent {},
}));

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

function supervisorActor(): JwtPayload {
  return {
    sub: 'sup-001',
    email: 'sup-001@example.test',
    role: UserRole.NOC,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-sup-001',
    type: 'tenant',
  };
}

function mockExecutionContext(headers: Record<string, string | undefined> = {}): {
  context: ExecutionContext;
  setHeader: jest.Mock;
} {
  const setHeader = jest.fn();
  const context = {
    switchToHttp: () => ({
      getResponse: () => ({ setHeader }),
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

async function emitThroughInterceptor(body: unknown): Promise<jest.Mock> {
  const interceptor = new ExecutionOrderResponseHeadersInterceptor();
  const { context, setHeader } = mockExecutionContext();
  await lastValueFrom(interceptor.intercept(context, { handle: () => of(body) }));
  return setHeader;
}

function errorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'getResponse' in error &&
    typeof (error as { getResponse: unknown }).getResponse === 'function'
  ) {
    const response = (error as { getResponse: () => unknown }).getResponse();
    if (response && typeof response === 'object' && 'code' in response)
      return String((response as { code: unknown }).code);
  }
  return undefined;
}

// ─── Paso 5: regresión del incidente ─────────────────────────────────────────

describe('ETag de la OT identifica la representación (paso 5)', () => {
  it('misma version con distinta versión de contrato ⇒ ETags distintos', () => {
    expect(buildExecutionOrderETag(7, '1.1')).not.toBe(buildExecutionOrderETag(7, '1.2'));
  });

  it('la versión del contrato sale de la constante declarada, no de un literal', () => {
    // MOD11 E2: el contrato shared pasa a v1.3 (schedule nulable). La constante
    // sigue la regla de su propio comentario: versionar el contrato invalida
    // toda caché HTTP existente.
    expect(EXECUTION_ORDER_CONTRACT_VERSION).toBe('1.3');
    expect(buildExecutionOrderETag(7)).toBe(`"${EXECUTION_ORDER_CONTRACT_VERSION}-7"`);
  });

  it('el interceptor emite el ETag ligado a la representación en el detalle', async () => {
    const setHeader = await emitThroughInterceptor({
      id: 'eo-001',
      number: 'OTE-20260828-001',
      version: 4,
      status: ExecutionOrderStatus.ASSIGNED,
    });
    expect(setHeader).toHaveBeenCalledWith('ETag', '"1.3-4"');
  });

  it('el interceptor emite el ETag ligado a la representación en la entidad de un comando', async () => {
    const setHeader = await emitThroughInterceptor({
      id: 'eo-001',
      executionOrderNumber: 'OTE-20260828-001',
      version: 5,
      status: ExecutionOrderStatus.IN_PROGRESS,
    });
    expect(setHeader).toHaveBeenCalledWith('ETag', '"1.3-5"');
  });

  it('las vistas de plantillas conservan el ETag heredado (otro dominio de representación)', async () => {
    const templateView = {
      id: 'version-001',
      templateId: 'template-001',
      key: 'instalacion-ftth',
      version: 3,
    };
    expect(isExecutionOrderRepresentation(templateView)).toBe(false);
    const setHeader = await emitThroughInterceptor(templateView);
    expect(setHeader).toHaveBeenCalledWith('ETag', '"3"');
  });

  it('los cuerpos sin versión no emiten ETag', async () => {
    const setHeader = await emitThroughInterceptor({ data: [], meta: {} });
    expect(setHeader).not.toHaveBeenCalledWith('ETag', expect.anything());
  });
});

// ─── Paso 6: concurrencia intacta ────────────────────────────────────────────

describe('If-Match numérico sigue gobernando la concurrencia (paso 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('If-Match con el número de versión ⇒ comando exitoso', async () => {
    const service = new ExecutionOrdersService({} as DataSource);
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 2,
        startedAt: null,
        closedAt: null,
        result: null,
        closeNotes: null,
        updatedByUserId: null,
        templateRequirementsSnapshot: [],
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.close(
      'eo-001',
      { result: ExecutionOrderResult.EXECUTED, summary: 'Cierre correcto' },
      supervisorActor(),
      {
        ifMatch: '2',
        idempotencyKey: 'close-etag-key-001',
        correlationId: '00000000-0000-4000-8000-000000000001',
      },
    );

    expect(result.version).toBe(3);
  });

  it('If-Match con versión distinta ⇒ 409 VERSION_CONFLICT (conflicto real)', async () => {
    const service = new ExecutionOrdersService({} as DataSource);
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 5,
      }),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const error = await service
      .close(
        'eo-001',
        { result: ExecutionOrderResult.EXECUTED, summary: 'Cierre con versión vieja' },
        supervisorActor(),
        {
          ifMatch: '3',
          idempotencyKey: 'close-etag-key-002',
          correlationId: '00000000-0000-4000-8000-000000000002',
        },
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(errorCode(error)).toBe('VERSION_CONFLICT');
  });
});

// ─── Paso 7: formato inválido ≠ conflicto ────────────────────────────────────

describe('If-Match mal formado da error de formato, no conflicto (paso 7)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockOrderAtVersion(version: number): void {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version,
      }),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
  }

  it.each([['"1.3-7"'], ['W/"1.3-7"'], ['1.3-7']])(
    'el ETag completo %s como If-Match ⇒ 400 VALIDATION_ERROR',
    async (ifMatch) => {
      const service = new ExecutionOrdersService({} as DataSource);
      mockOrderAtVersion(7);

      const error = await service
        .close(
          'eo-001',
          { result: ExecutionOrderResult.EXECUTED, summary: 'If-Match con ETag' },
          supervisorActor(),
          {
            ifMatch,
            idempotencyKey: `close-etag-key-${ifMatch.length}`,
            correlationId: '00000000-0000-4000-8000-000000000003',
          },
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).not.toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe('VALIDATION_ERROR');
    },
  );

  it.each([['abc'], ['2.5'], ['2x'], [' 2'], ['2 '], ['--3']])(
    'If-Match no entero %s ⇒ 400 VALIDATION_ERROR',
    async (ifMatch) => {
      const service = new ExecutionOrdersService({} as DataSource);
      mockOrderAtVersion(2);

      const error = await service
        .close(
          'eo-001',
          { result: ExecutionOrderResult.EXECUTED, summary: 'If-Match no entero' },
          supervisorActor(),
          {
            ifMatch,
            idempotencyKey: `close-etag-key-n-${ifMatch.length}-${ifMatch.trim().length}`,
            correlationId: '00000000-0000-4000-8000-000000000004',
          },
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).not.toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe('VALIDATION_ERROR');
    },
  );

  it('el número entrecomillado ("2", W/"2") sigue aceptado: es cita HTTP válida', async () => {
    const service = new ExecutionOrdersService({} as DataSource);
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'eo-001',
        tenantId: 'tenant-001',
        status: ExecutionOrderStatus.IN_PROGRESS,
        version: 2,
        startedAt: null,
        closedAt: null,
        result: null,
        closeNotes: null,
        updatedByUserId: null,
        templateRequirementsSnapshot: [],
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
      save: jest.fn().mockImplementation(async (_entity, payload) => payload),
      create: jest.fn((_entity, payload) => payload),
    };
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));

    const result = await service.close(
      'eo-001',
      { result: ExecutionOrderResult.EXECUTED, summary: 'Cierre con If-Match entrecomillado' },
      supervisorActor(),
      {
        ifMatch: '"2"',
        idempotencyKey: 'close-etag-key-005',
        correlationId: '00000000-0000-4000-8000-000000000005',
      },
    );

    expect(result.version).toBe(3);
  });
});
