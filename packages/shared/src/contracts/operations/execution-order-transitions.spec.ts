import { ExecutionOrderStatus } from '../../enums/operations';
import {
  deriveBlockedMs,
  deriveElapsedMs,
  EXECUTION_ORDER_TRANSITIONS_CONTRACT_VERSION,
  type ExecutionOrderTransitionEntry,
  type RecordExecutionOrderTransitionInput,
} from './execution-order-transitions';

const entry = (
  overrides: Partial<ExecutionOrderTransitionEntry> & {
    fromStatus: ExecutionOrderTransitionEntry['fromStatus'];
    toStatus: ExecutionOrderTransitionEntry['toStatus'];
    changedAt: string;
  },
): ExecutionOrderTransitionEntry => ({
  id: '00000000-0000-4000-8000-000000000001',
  executionOrderId: '11111111-1111-4111-8111-111111111111',
  changedBy: '22222222-2222-4222-8222-222222222222',
  reason: null,
  createdAt: '2026-09-14T10:00:00.000Z',
  ...overrides,
});

describe('execution-order transitions contract v2 (adenda B1c, aditivo sobre v1)', () => {
  it('congela la versión del contrato en v2', () => {
    expect(EXECUTION_ORDER_TRANSITIONS_CONTRACT_VERSION).toBe('2');
  });

  it('v2 aditivo: correctionOfId es opcional; ausente/null = asiento original (B1)', () => {
    const withoutField: RecordExecutionOrderTransitionInput = {
      executionOrderId: '11111111-1111-4111-8111-111111111111',
      fromStatus: ExecutionOrderStatus.IN_PROGRESS,
      toStatus: ExecutionOrderStatus.BLOCKED,
      changedAt: '2026-09-14T11:00:00.000Z',
      changedBy: '22222222-2222-4222-8222-222222222222',
    };
    const asOriginal: RecordExecutionOrderTransitionInput = {
      ...withoutField,
      correctionOfId: null,
    };
    const asCorrection: RecordExecutionOrderTransitionInput = {
      ...withoutField,
      correctionOfId: '00000000-0000-4000-8000-000000000001',
    };

    expect('correctionOfId' in withoutField).toBe(false);
    expect(asOriginal.correctionOfId).toBeNull();
    expect(asCorrection.correctionOfId).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('v2 aditivo: el asiento modela correctionOfId sin tocar los campos v1', () => {
    const seat: ExecutionOrderTransitionEntry = entry({
      fromStatus: ExecutionOrderStatus.BLOCKED,
      toStatus: ExecutionOrderStatus.IN_PROGRESS,
      changedAt: '2026-09-14T12:30:00.000Z',
      correctionOfId: null,
    });

    expect(seat.fromStatus).toBe(ExecutionOrderStatus.BLOCKED);
    expect(seat.correctionOfId).toBeNull();
  });

  it('modela el asiento con origen, destino, instante, actor y motivo opcional', () => {
    const input: RecordExecutionOrderTransitionInput = {
      executionOrderId: '11111111-1111-4111-8111-111111111111',
      fromStatus: ExecutionOrderStatus.IN_PROGRESS,
      toStatus: ExecutionOrderStatus.BLOCKED,
      changedAt: '2026-09-14T11:00:00.000Z',
      changedBy: '22222222-2222-4222-8222-222222222222',
      reason: 'ESPERA_MATERIAL',
    };

    expect(input.fromStatus).toBe(ExecutionOrderStatus.IN_PROGRESS);
    expect(input.toStatus).toBe(ExecutionOrderStatus.BLOCKED);
    expect(input.reason).toBe('ESPERA_MATERIAL');
  });

  it('CA-03: el tiempo bloqueado es derivable sin persistirlo', () => {
    const transitions = [
      entry({
        fromStatus: ExecutionOrderStatus.ASSIGNED,
        toStatus: ExecutionOrderStatus.IN_PROGRESS,
        changedAt: '2026-09-14T10:00:00.000Z',
      }),
      entry({
        fromStatus: ExecutionOrderStatus.IN_PROGRESS,
        toStatus: ExecutionOrderStatus.BLOCKED,
        changedAt: '2026-09-14T11:00:00.000Z',
      }),
      entry({
        fromStatus: ExecutionOrderStatus.BLOCKED,
        toStatus: ExecutionOrderStatus.IN_PROGRESS,
        changedAt: '2026-09-14T12:30:00.000Z',
      }),
    ];

    expect(deriveBlockedMs(transitions)).toBe(90 * 60 * 1000);
  });

  it('CA-02: varios ciclos de bloqueo se suman todos (A1 descartada)', () => {
    const transitions = [
      entry({
        fromStatus: ExecutionOrderStatus.ASSIGNED,
        toStatus: ExecutionOrderStatus.IN_PROGRESS,
        changedAt: '2026-09-14T10:00:00.000Z',
      }),
      entry({
        fromStatus: ExecutionOrderStatus.IN_PROGRESS,
        toStatus: ExecutionOrderStatus.BLOCKED,
        changedAt: '2026-09-14T11:00:00.000Z',
      }),
      entry({
        fromStatus: ExecutionOrderStatus.BLOCKED,
        toStatus: ExecutionOrderStatus.IN_PROGRESS,
        changedAt: '2026-09-14T11:30:00.000Z',
      }),
      entry({
        fromStatus: ExecutionOrderStatus.IN_PROGRESS,
        toStatus: ExecutionOrderStatus.BLOCKED,
        changedAt: '2026-09-14T13:00:00.000Z',
      }),
      entry({
        fromStatus: ExecutionOrderStatus.BLOCKED,
        toStatus: ExecutionOrderStatus.IN_PROGRESS,
        changedAt: '2026-09-14T14:00:00.000Z',
      }),
    ];

    // 30 min + 60 min: un campo suelto solo recordaría el último ciclo.
    expect(deriveBlockedMs(transitions)).toBe(90 * 60 * 1000);
  });

  it('CA-03: el total sin descontar sigue siendo obtenible y convive con el bloqueado', () => {
    expect(deriveElapsedMs('2026-09-14T10:00:00.000Z', '2026-09-14T15:00:00.000Z')).toBe(
      5 * 60 * 60 * 1000,
    );
  });

  it('deriveElapsedMs retorna null sin ambos instantes (CA-06: sin línea no hay lectura)', () => {
    expect(deriveElapsedMs(null, '2026-09-14T15:00:00.000Z')).toBeNull();
    expect(deriveElapsedMs('2026-09-14T10:00:00.000Z', null)).toBeNull();
    expect(deriveElapsedMs('no-fecha', '2026-09-14T15:00:00.000Z')).toBeNull();
  });
});
