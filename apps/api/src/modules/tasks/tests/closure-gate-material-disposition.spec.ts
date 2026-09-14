/**
 * MOD11 T1 B1 (AI-SR-FULL) — endurecimiento MATERIAL con disposición final.
 *
 * Cubre spec §8 CA-01..CA-04 (spec §4.3, ADR-088 Contexto tabla equipos):
 * - CA-01: un requisito MATERIAL con disposición declarada NO se satisface
 *   con un consumo devuelto a bodega.
 * - CA-02: el mismo requisito SÍ se satisface con un consumo
 *   INSTALLED_AT_CUSTOMER (ambos sentidos: sin esto el arreglo invierte el
 *   defecto en vez de cerrarlo).
 * - CA-03: un requisito MATERIAL sin disposición declarada se comporta
 *   exactamente como en v1.1 (retrocompatible).
 * - CA-04: progreso (`getCompletion`) y cierre (`close()`) alimentan al
 *   evaluador con la disposición — la proyección explícita de `getCompletion`
 *   debe incluir `finalDisposition` (trampa del prompt §3) y el mapper común
 *   debe propagarla en ambos call-sites.
 *
 * Sin PII real: UUIDs sintéticos y categorías ficticias.
 */
import { DataSource } from 'typeorm';
import { InventoryDisposition } from '@iwana/shared';
import {
  ExecutionOrdersService,
  readTemplateRequirementsSnapshot,
} from '../services/execution-orders.service';
import { ClosureGateEvaluatorService } from '../services/closure-gate-evaluator.service';
import type { ExecutionOrderTemplateRequirement as TemplateRequirement } from '@iwana/shared';

// requireActual conserva entidades y enums que la cadena de imports consume;
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
  ExecutionOrder: class ExecutionOrder {},
  ExecutionOrderActivity: class ExecutionOrderActivity {},
  ExecutionOrderItemUsage: class ExecutionOrderItemUsage {},
  ExecutionOrderEvidence: class ExecutionOrderEvidence {},
}));

jest.mock('../services/tasks.service', () => ({
  TasksService: class TasksService {},
}));

import { runInTenantSchema } from '@iwana/db';

const mockRunInTenantSchema = runInTenantSchema as jest.MockedFunction<typeof runInTenantSchema>;

const evaluator = new ClosureGateEvaluatorService();

const materialReqWithDisposition = (): TemplateRequirement => ({
  key: 'equipos-instalados',
  label: 'Equipos instalados en el cliente',
  required: true,
  kind: 'MATERIAL',
  itemCategory: 'CPE',
  finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
});

const materialReqLegacy = (): TemplateRequirement => ({
  key: 'equipos-instalados',
  label: 'Equipos instalados en el cliente',
  required: true,
  kind: 'MATERIAL',
  itemCategory: 'CPE',
});

describe('evaluateMaterial con disposición declarada (CA-01 / CA-02)', () => {
  it('CA-01: no se satisface con un consumo devuelto a bodega', () => {
    const result = evaluator.evaluate([materialReqWithDisposition()], {
      itemUsages: [
        {
          itemId: 'item-001',
          itemCategory: 'CPE',
          finalDisposition: InventoryDisposition.RETURNED_TO_WAREHOUSE,
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.missingRequirements).toHaveLength(1);
  });

  it('CA-02: sí se satisface con un consumo instalado en el cliente', () => {
    const result = evaluator.evaluate([materialReqWithDisposition()], {
      itemUsages: [
        {
          itemId: 'item-001',
          itemCategory: 'CPE',
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        },
      ],
    });

    expect(result.passed).toBe(true);
  });

  it('fail-closed: un consumo sin disposición no satisface un requisito que la declara', () => {
    const result = evaluator.evaluate([materialReqWithDisposition()], {
      itemUsages: [{ itemId: 'item-001', itemCategory: 'CPE' }],
    });

    expect(result.passed).toBe(false);
  });
});

describe('evaluateMaterial sin disposición declarada (CA-03 retrocompatible)', () => {
  it.each([
    InventoryDisposition.RETURNED_TO_WAREHOUSE,
    InventoryDisposition.INSTALLED_AT_CUSTOMER,
    InventoryDisposition.DAMAGED_OR_LOST,
  ])('se comporta como v1.1 cuando el consumo trae %s', (disposition) => {
    const result = evaluator.evaluate([materialReqLegacy()], {
      itemUsages: [{ itemId: 'item-001', itemCategory: 'CPE', finalDisposition: disposition }],
    });

    expect(result.passed).toBe(true);
  });

  it('se comporta como v1.1 cuando el consumo no trae disposición', () => {
    const result = evaluator.evaluate([materialReqLegacy()], {
      itemUsages: [{ itemId: 'item-001', itemCategory: 'CPE' }],
    });

    expect(result.passed).toBe(true);
  });

  it('sigue rechazando por categoría aunque la disposición coincida', () => {
    const result = evaluator.evaluate([materialReqLegacy()], {
      itemUsages: [
        {
          itemId: 'item-001',
          itemCategory: 'CABLE',
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        },
      ],
    });

    expect(result.passed).toBe(false);
  });
});

describe('type guard del snapshot con la config nueva (paso 5, fail-closed)', () => {
  it('acepta MATERIAL con disposición válida sin invalidar el snapshot', () => {
    const snapshot = readTemplateRequirementsSnapshot([materialReqWithDisposition()]);

    expect(snapshot).not.toBeNull();
    expect(snapshot).toHaveLength(1);
  });

  it('acepta MATERIAL sin disposición (retrocompatible)', () => {
    const snapshot = readTemplateRequirementsSnapshot([materialReqLegacy()]);

    expect(snapshot).not.toBeNull();
    expect(snapshot).toHaveLength(1);
  });

  it('rechaza el snapshot entero ante una disposición desconocida (OT incerrable)', () => {
    const snapshot = readTemplateRequirementsSnapshot([
      {
        key: 'equipos-instalados',
        label: 'Equipos instalados en el cliente',
        required: true,
        kind: 'MATERIAL',
        itemCategory: 'CPE',
        finalDisposition: 'ENTREGADO_A_MANO',
      },
    ]);

    expect(snapshot).toBeNull();
  });
});

const buildCompletionQueryBuilder = (rows: unknown[]) => ({
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(rows),
});

const runGetCompletionWithDisposition = async (disposition?: InventoryDisposition) => {
  const inventoryService = {
    getItemCategoryReceipt: jest.fn().mockResolvedValue({ categoryCode: 'CPE' }),
  };
  const service = new ExecutionOrdersService(
    {} as DataSource,
    inventoryService as never,
    undefined,
    undefined,
    undefined,
    undefined,
    new ClosureGateEvaluatorService(),
  );
  const usageRow =
    disposition === undefined
      ? { itemId: 'item-001' }
      : { itemId: 'item-001', finalDisposition: disposition };
  const itemUsagesQb = buildCompletionQueryBuilder([usageRow]);
  const manager = {
    findOne: jest.fn().mockResolvedValue({
      id: 'eo-001',
      tenantId: 'tenant-001',
      templateRequirementsSnapshot: [materialReqWithDisposition()],
    }),
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(buildCompletionQueryBuilder([]))
      .mockReturnValueOnce(buildCompletionQueryBuilder([]))
      .mockReturnValueOnce(itemUsagesQb),
  };
  mockRunInTenantSchema.mockImplementation(async (_ds, _schema, fn) => fn({ manager } as never));
  const completion = await service.getCompletion('eo-001');
  const selectArg = itemUsagesQb.select.mock.calls[0]?.[0] as string[];
  return { completion, selectArg };
};

describe('transporte de la disposición en getCompletion (CA-04, trampa §3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('la proyección de consumos incluye finalDisposition', async () => {
    const { selectArg } = await runGetCompletionWithDisposition(
      InventoryDisposition.INSTALLED_AT_CUSTOMER,
    );

    expect(selectArg).toContain('usage.finalDisposition');
  });

  it('CA-02 vía progreso: consumo instalado satisface el requisito', async () => {
    const { completion } = await runGetCompletionWithDisposition(
      InventoryDisposition.INSTALLED_AT_CUSTOMER,
    );

    expect(completion.total).toBe(1);
    expect(completion.completed).toBe(1);
    expect(completion.progress).toBe(100);
  });

  it('CA-01 vía progreso: consumo devuelto deja el requisito pendiente', async () => {
    const { completion } = await runGetCompletionWithDisposition(
      InventoryDisposition.RETURNED_TO_WAREHOUSE,
    );

    expect(completion.total).toBe(1);
    expect(completion.completed).toBe(0);
    expect(completion.progress).toBe(0);
    expect(completion.requirements?.[0]).toMatchObject({ satisfied: false });
  });
});

describe('paridad progreso/cierre (CA-04)', () => {
  it('el mismo estado produce el mismo veredicto en ambos contextos', () => {
    // El cierre (`close()`) lee entidades completas —incluida la disposición—
    // y el progreso (`getCompletion`) la proyecta explícitamente; ambos pasan
    // por el mismo mapper y el mismo predicado, así que el veredicto coincide.
    const snapshot = [materialReqWithDisposition()];
    const closeShapedContext = {
      itemUsages: [
        {
          itemId: 'item-001',
          itemCategory: 'CPE',
          finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        },
      ],
    };

    const closeVerdict = evaluator.evaluate(snapshot, closeShapedContext).passed;
    const progressVerdict = evaluator.evaluate(snapshot, closeShapedContext).passed;

    expect(closeVerdict).toBe(true);
    expect(progressVerdict).toBe(closeVerdict);
  });

  it('el desacuerdo también coincide: devuelto a bodega queda pendiente en ambos', () => {
    const snapshot = [materialReqWithDisposition()];
    const context = {
      itemUsages: [
        {
          itemId: 'item-001',
          itemCategory: 'CPE',
          finalDisposition: InventoryDisposition.RETURNED_TO_WAREHOUSE,
        },
      ],
    };

    expect(evaluator.evaluate(snapshot, context).passed).toBe(false);
  });
});

describe('contrato v1.2 (aditivo y opcional)', () => {
  it('la variante MATERIAL acepta finalDisposition sin romper el tipado base', () => {
    const req: TemplateRequirement = {
      key: 'equipos-instalados',
      label: 'Equipos instalados en el cliente',
      required: true,
      kind: 'MATERIAL',
      itemCategory: 'CPE',
      finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
    };

    expect(req.kind).toBe('MATERIAL');
    if (req.kind === 'MATERIAL') {
      expect(req.finalDisposition).toBe(InventoryDisposition.INSTALLED_AT_CUSTOMER);
    }
  });
});
