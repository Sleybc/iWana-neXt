import {
  EXECUTION_ORDER_NUMBER_SEARCH_MAX_LENGTH,
  EXECUTION_ORDER_QUEUES,
  EXECUTION_ORDER_TERMINAL_STATUSES,
  ExecutionOrderNumberSearchSchema,
  ExecutionOrderQueueSchema,
} from './execution-orders-list';
import * as shared from '../../index';

describe('execution-orders-list contrato v1.1 (spec 2026-11-19 MOD11 colas §3 H–J)', () => {
  it('congela los literales de cola en orden', () => {
    expect(EXECUTION_ORDER_QUEUES).toEqual([
      'ALL',
      'ACTIVE',
      'TO_SCHEDULE',
      'UNASSIGNED',
      'TODAY',
      'MINE',
    ]);
    for (const queue of EXECUTION_ORDER_QUEUES) {
      expect(ExecutionOrderQueueSchema.safeParse(queue).success).toBe(true);
    }
  });

  it('rechaza colas fuera de la lista y en minúsculas', () => {
    for (const bad of ['active', 'OVERDUE', '', 'ALL ']) {
      expect(ExecutionOrderQueueSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('los estados terminales son exactamente cuatro', () => {
    expect([...EXECUTION_ORDER_TERMINAL_STATUSES].sort()).toEqual(
      ['CANCELLED', 'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED'].sort(),
    );
  });

  it('number: acepta el juego permitido y recorta espacios', () => {
    expect(ExecutionOrderNumberSearchSchema.parse('  OTE-20261117/001_a.b  ')).toBe(
      'OTE-20261117/001_a.b',
    );
  });

  it('number: longitud 1 a 40', () => {
    expect(EXECUTION_ORDER_NUMBER_SEARCH_MAX_LENGTH).toBe(40);
    expect(ExecutionOrderNumberSearchSchema.safeParse('A'.repeat(40)).success).toBe(true);
    expect(ExecutionOrderNumberSearchSchema.safeParse('A'.repeat(41)).success).toBe(false);
    expect(ExecutionOrderNumberSearchSchema.safeParse('   ').success).toBe(false);
    expect(ExecutionOrderNumberSearchSchema.safeParse('').success).toBe(false);
  });

  it('number: rechaza comodines, espacios internos y caracteres fuera del regex', () => {
    for (const bad of ['OTE%', 'OTE_%', 'a b', "x'--", 'Ñandú', 'OTE*', 'a\b']) {
      expect(ExecutionOrderNumberSearchSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('se exporta desde el índice del paquete', () => {
    expect(shared.EXECUTION_ORDER_QUEUES).toBe(EXECUTION_ORDER_QUEUES);
    expect(shared.ExecutionOrderNumberSearchSchema).toBe(ExecutionOrderNumberSearchSchema);
  });
});
