/**
 * Pruebas de boundary MOD11 (tasks).
 *
 * Verifican que el módulo tasks no viola los boundaries del modulith
 * importando entidades de otros módulos directamente.
 *
 * ADR-068 — Sincronización de OT de ejecución y proyecciones operativas
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { ExecutionOrderStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExecutionOrdersService } from '../services/execution-orders.service';

// requireActual conserva el resto de exports reales de @iwana/db (enums y
// entidades que la cadena de imports del servicio consume, p. ej. MediaUsage);
// solo se parchea el contexto de tenant y el runner de schema.
jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  TenantContext: {
    getOrThrow: jest.fn().mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    }),
  },
  runInTenantSchema: jest.fn(),
}));

function readTasksSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readTasksSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [readFileSync(path, 'utf8')]
      : [];
  });
}

describe('TasksModule — Boundaries (P0-3)', () => {
  it('rechaza imports, repositorios y entidades de Inventory dentro de Tasks', () => {
    const sources = readTasksSources(join(__dirname, '..'));
    const source = sources.join('\n');

    expect(source).not.toMatch(
      /from\s+['"][^'"]+\/inventory\/(?!ports\/|inventory\.module)[^'"]+['"]|import\s*\{[^}]*\bInventory(?:Item|Category|Movement|Repository)\b[^}]*\}\s*from\s*['"]@iwana\/db['"]/s,
    );
    expect(source).not.toMatch(/@InjectRepository\s*\(\s*Inventory/);
    expect(source).not.toMatch(/Repository\s*<\s*Inventory/);
  });

  it('EvidenceAssetProvider usa DataSource en vez de InjectRepository', () => {
    // EvidenceAssetProvider debe usar @InjectDataSource() para obtener
    // el repositorio de MediaAsset, no @InjectRepository(), para no
    // requerir que MediaAsset esté registrado en TypeOrmModule.forFeature
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../media/evidence-asset.provider.ts'),
      'utf8',
    );

    // Debe usar InjectDataSource, no InjectRepository
    expect(source).toContain('InjectDataSource');
    // El import de MediaAsset como type está permitido (el adapter conoce la entidad)
    expect(source).not.toContain("from '@nestjs/typeorm';\nimport { Repository }");
  });

  it('tasks.module.ts no registra MediaAsset en TypeOrmModule.forFeature', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../tasks.module.ts'),
      'utf8',
    );

    // MediaAsset no debe aparecer en TypeOrmModule.forFeature del módulo tasks
    const forFeatureMatch = source.match(/TypeOrmModule\.forFeature\(\[([^\]]+)\]\)/);
    expect(forFeatureMatch).not.toBeNull();
    const entitiesInForFeature = forFeatureMatch![1];
    expect(entitiesInForFeature).not.toContain('MediaAsset');
  });
});

/**
 * BOLA sobre el listado de OT (MOD11 F1, stop/go bloqueante).
 *
 * El scoping vive en el `WHERE` de `ExecutionOrdersService.list()`, nunca en
 * el guard (`@ExecutionOrderTenantScoped()` desactiva el ABAC del guard: R1).
 * Estos casos fijan la semántica D1 (v1 sin cuadrilla) a nivel de predicado y
 * verifican comportamiento con la base simulando el WHERE scopeado.
 */
describe('ExecutionOrders list — BOLA por actor (F1)', () => {
  let service: ExecutionOrdersService;
  let mockRunInTenantSchema: jest.MockedFunction<typeof runInTenantSchema>;

  const baseActor: JwtPayload = {
    sub: 'admin-001',
    email: 'admin@example.test',
    role: UserRole.ADMIN,
    tenantId: 'tenant-001',
    schemaName: 'tenant_001',
    jti: 'jti-001',
    type: 'tenant',
  };
  const techActor: JwtPayload = { ...baseActor, sub: 'tech-001', role: UserRole.TECHNICIAN };
  const otherTechActor: JwtPayload = {
    ...baseActor,
    sub: 'tech-002',
    role: UserRole.TECHNICIAN,
  };

  type CapturedQb = {
    predicates: string[];
    params: Record<string, unknown>;
    orderBy: Array<[string, string]>;
  };

  /**
   * QB fake que captura el WHERE y responde como lo haría PostgreSQL
   * honrando ese WHERE: filtra las filas en memoria con la misma regla D1.
   * Así el caso verifica predicado Y comportamiento, no solo uno.
   */
  const buildScopedQb = (rows: Array<Record<string, unknown>>, captured: CapturedQb) => {
    const qb: Record<string, jest.Mock> = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest
        .fn()
        .mockImplementation((predicate: string, params?: Record<string, unknown>) => {
          captured.predicates.push(predicate);
          Object.assign(captured.params, params ?? {});
          return qb;
        }),
      orderBy: jest.fn().mockImplementation((column: string, dir: string) => {
        captured.orderBy.push([column, dir]);
        return qb;
      }),
      addOrderBy: jest.fn().mockImplementation((column: string, dir: string) => {
        captured.orderBy.push([column, dir]);
        return qb;
      }),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockImplementation(async () => {
        const actorSub = captured.params['actorSub'] as string | undefined;
        const scoped =
          actorSub === undefined
            ? rows
            : rows.filter((row) => {
                if (row['assignedTechnicianId'] === actorSub) return true;
                return (
                  row['assignedTechnicianId'] == null &&
                  row['assignedCrewId'] == null &&
                  row['status'] !== ExecutionOrderStatus.CREATED
                );
              });
        return [scoped, scoped.length];
      }),
    };
    return qb;
  };

  const runList = async (
    actor: JwtPayload,
    rows: Array<Record<string, unknown>>,
  ): Promise<{
    captured: CapturedQb;
    body: Awaited<ReturnType<ExecutionOrdersService['list']>>;
    qb: Record<string, jest.Mock>;
  }> => {
    const captured: CapturedQb = { predicates: [], params: {}, orderBy: [] };
    const qb = buildScopedQb(rows, captured);
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) =>
      fn({
        manager: { createQueryBuilder: jest.fn().mockReturnValue(qb) },
      } as never),
    );
    const body = await service.list({}, actor);
    return { captured, body, qb };
  };

  const buildRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: '11111111-1111-4111-8111-111111111111',
    executionOrderNumber: 'OTE-20260913-001',
    status: ExecutionOrderStatus.ASSIGNED,
    result: null,
    workType: WfmWorkType.INSTALLATION,
    scheduleEventId: '33333333-3333-4333-8333-333333333333',
    plannedWindowStartAt: new Date('2026-09-13T14:00:00.000Z'),
    plannedWindowEndAt: new Date('2026-09-13T16:00:00.000Z'),
    assignedTechnicianId: 'tech-001',
    assignedCrewId: null,
    customerDisplayLabel: 'Cliente ejemplo',
    municipality: 'Bogotá',
    ticketId: null,
    taskId: null,
    visitRequestId: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-13T10:00:00.000Z'),
    ...overrides,
  });

  /** Regla D1 en JS puro: lo mismo que el WHERE debe garantizar. */
  const isReadable = (row: Record<string, unknown>, actorSub: string): boolean => {
    if (row['assignedTechnicianId'] === actorSub) return true;
    return (
      row['assignedTechnicianId'] == null &&
      row['assignedCrewId'] == null &&
      row['status'] !== ExecutionOrderStatus.CREATED
    );
  };

  beforeEach(() => {
    mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;
    service = new ExecutionOrdersService({} as DataSource);
    jest.clearAllMocks();
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-001',
      schemaName: 'tenant_001',
    });
  });

  it('un TECHNICIAN no ve OT asignadas a otro técnico (BOLA)', async () => {
    const rows = [
      buildRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      buildRow({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: 'tech-002',
      }),
      buildRow({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        executionOrderNumber: 'OTE-20260913-003',
        assignedTechnicianId: null,
        assignedCrewId: null,
        status: ExecutionOrderStatus.ASSIGNED,
      }),
      buildRow({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        executionOrderNumber: 'OTE-20260913-004',
        assignedTechnicianId: null,
        assignedCrewId: null,
        status: ExecutionOrderStatus.CREATED,
      }),
      buildRow({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        executionOrderNumber: 'OTE-20260913-005',
        assignedTechnicianId: null,
        assignedCrewId: 'crew-001',
        status: ExecutionOrderStatus.ASSIGNED,
      }),
    ];

    const { captured, body } = await runList(techActor, rows);

    // Predicado de scoping presente y parametrizado (sin concatenar el sub).
    expect(
      captured.predicates.some((p) => p.includes('order.assigned_technician_id = :actorSub')),
    ).toBe(true);
    expect(captured.params['actorSub']).toBe('tech-001');
    expect(JSON.stringify(captured.predicates)).not.toContain('tech-001');

    // Comportamiento: solo la propia + el pool reclamable (≠ CREATED).
    expect(body.data.map((row) => row.id).sort()).toEqual(
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'].sort(),
    );
    expect(body.meta.total).toBe(2);

    // Consistencia bandeja↔detalle: ninguna fila listada daría 404 al abrirse.
    for (const row of body.data) {
      const source = rows.find((candidate) => candidate['id'] === row.id);
      expect(isReadable(source as Record<string, unknown>, 'tech-001')).toBe(true);
    }
  });

  it('dos técnicos ven conjuntos distintos con el mismo predicado parametrizado', async () => {
    const rows = [
      buildRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      buildRow({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: 'tech-002',
      }),
    ];

    const first = await runList(techActor, rows);
    const second = await runList(otherTechActor, rows);

    expect(first.body.data.map((row) => row.id)).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    expect(second.body.data.map((row) => row.id)).toEqual(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    expect(first.captured.params['actorSub']).toBe('tech-001');
    expect(second.captured.params['actorSub']).toBe('tech-002');
  });

  it('un CONTRACTOR queda dentro del scoping restringido (SEC-D1): no ve la OT de un técnico', async () => {
    // SEC-D1 (dictamen SEC-ENG OLA2 §4.3): el rol CONTRACTOR comparte rama con
    // TECHNICIAN en LIST_RESTRICTED_ROLES. Sin este caso, retirar CONTRACTOR
    // del array no rompería ninguna prueba y la bandeja completa del tenant
    // quedaría expuesta a contractors — regresión silenciosa de autorización.
    const contractorActor: JwtPayload = {
      ...baseActor,
      sub: 'contractor-001',
      role: UserRole.CONTRACTOR,
    };
    const rows = [
      buildRow({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        assignedTechnicianId: 'contractor-001',
      }),
      buildRow({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: 'tech-001',
      }),
      buildRow({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        executionOrderNumber: 'OTE-20260913-003',
        assignedTechnicianId: null,
        assignedCrewId: null,
        status: ExecutionOrderStatus.ASSIGNED,
      }),
    ];

    const { captured, body } = await runList(contractorActor, rows);

    // Predicado de scoping presente y parametrizado con el sub del contractor.
    expect(
      captured.predicates.some((p) => p.includes('order.assigned_technician_id = :actorSub')),
    ).toBe(true);
    expect(captured.params['actorSub']).toBe('contractor-001');
    expect(JSON.stringify(captured.predicates)).not.toContain('contractor-001');

    // Comportamiento: ve la propia + el pool reclamable; nunca la de un técnico.
    expect(body.data.map((row) => row.id).sort()).toEqual(
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'].sort(),
    );
    expect(body.meta.total).toBe(2);
    expect(body.data.map((row) => row.id)).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    // Consistencia bandeja↔detalle para el rol contractor.
    for (const row of body.data) {
      const source = rows.find((candidate) => candidate['id'] === row.id);
      expect(isReadable(source as Record<string, unknown>, 'contractor-001')).toBe(true);
    }
  });

  it('ADMIN ve el tenant sin predicado de actor y el total es el del tenant (ADR-065 §15)', async () => {
    const rows = [
      buildRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      buildRow({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        executionOrderNumber: 'OTE-20260913-002',
        assignedTechnicianId: 'tech-002',
      }),
      buildRow({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        executionOrderNumber: 'OTE-20260913-005',
        assignedTechnicianId: null,
        assignedCrewId: 'crew-001',
      }),
    ];

    const admin = await runList(baseActor, rows);
    const tech = await runList(techActor, rows);

    // El supervisor no lleva scoping de actor: ve las 3 (incluida la de cuadrilla).
    expect(admin.captured.predicates.some((p) => p.includes(':actorSub'))).toBe(false);
    expect(admin.body.meta.total).toBe(3);

    // El técnico ve su alcance (1): el `total` del pie no revela el total del tenant.
    expect(tech.body.meta.total).toBe(1);
    expect(tech.body.meta.total).toBeLessThan(admin.body.meta.total);

    // Estructural D2: datos y conteo salen de una sola query sobre el QB ya
    // scopeado (un único getManyAndCount por listado: el `total` no puede
    // venir de un conteo sin scopear).
    expect(admin.qb['getManyAndCount']).toHaveBeenCalledTimes(1);
    expect(tech.qb['getManyAndCount']).toHaveBeenCalledTimes(1);
  });
});
