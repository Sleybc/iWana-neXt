// B0 (Ola 2b) — momento de trabajo y autorización de la acción por requisito
// (UX v1.1 §4, CA-10). El momento fija la superficie máxima; la acción solo
// existe si `allowedActions` la autoriza y el momento admite captura.
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderAllowedAction, ExecutionOrderTemplateRequirement } from '@iwana/shared';
import {
  admitsCapture,
  canInteract,
  getExecutionOrderMoment,
  isTerminalStatus,
  resolveRequirementAction,
  type ExecutionOrderMoment,
} from './execution-order-moment';

const ALL_REGISTER: ExecutionOrderAllowedAction[] = [
  'REGISTER_ACTIVITY',
  'REGISTER_ITEM_USAGE',
  'REGISTER_EVIDENCE',
];

const REQUIREMENTS: Record<string, ExecutionOrderTemplateRequirement> = {
  activity: {
    key: 'installation-activity',
    label: 'Actividad',
    required: false,
    kind: 'ACTIVITY',
    activityType: 'INSTALLATION',
  },
  evidence: {
    key: 'service-test',
    label: 'Prueba',
    required: true,
    kind: 'EVIDENCE',
    evidenceType: 'PHOTO',
  },
  material: {
    key: 'installed-equipment',
    label: 'Equipos',
    required: true,
    kind: 'MATERIAL',
    itemCategory: 'CPE',
  },
  field: {
    key: 'field',
    label: 'Dato',
    required: true,
    kind: 'FIELD',
    fieldType: 'TEXT',
  },
  measurement: {
    key: 'speed',
    label: 'Velocidad',
    required: true,
    kind: 'MEASUREMENT',
    measurement: 'NUMBER',
  },
  compliance: {
    key: 'acceptance',
    label: 'Aceptación',
    required: true,
    kind: 'COMPLIANCE',
    policyKey: 'p',
  },
};

function orderOf(
  status: ExecutionOrderStatus,
  allowedActions: ExecutionOrderAllowedAction[] | null,
  syncState = 'IN_SYNC',
) {
  return { status, allowedActions, syncState } as Parameters<typeof admitsCapture>[0];
}

const MOMENT_BY_STATUS: Array<[ExecutionOrderStatus, ExecutionOrderMoment]> = [
  [ExecutionOrderStatus.CREATED, 'pre-start'],
  [ExecutionOrderStatus.ASSIGNED, 'pre-start'],
  [ExecutionOrderStatus.EN_ROUTE, 'pre-start'],
  [ExecutionOrderStatus.IN_PROGRESS, 'in-progress'],
  [ExecutionOrderStatus.BLOCKED, 'blocked'],
  [ExecutionOrderStatus.COMPLETED, 'terminal'],
  [ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS, 'terminal'],
  [ExecutionOrderStatus.NOT_EXECUTED, 'terminal'],
  [ExecutionOrderStatus.CANCELLED, 'terminal'],
];

describe('getExecutionOrderMoment', () => {
  it.each(MOMENT_BY_STATUS)('%s pertenece al momento %s', (status, moment) => {
    expect(getExecutionOrderMoment(status)).toBe(moment);
  });

  it('cubre todos los estados del contrato sin dejar ninguno fuera de la matriz', () => {
    expect(MOMENT_BY_STATUS.map(([status]) => status).sort()).toEqual(
      Object.values(ExecutionOrderStatus).sort(),
    );
  });

  it('solo los cuatro estados de cierre son terminales', () => {
    expect(
      Object.values(ExecutionOrderStatus).filter((status) => isTerminalStatus(status)),
    ).toEqual([
      ExecutionOrderStatus.COMPLETED,
      ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
      ExecutionOrderStatus.NOT_EXECUTED,
      ExecutionOrderStatus.CANCELLED,
    ]);
  });
});

describe('admitsCapture (CA-10)', () => {
  it.each(Object.values(ExecutionOrderStatus))(
    'con todos los registros permitidos, %s admite captura solo en progreso',
    (status) => {
      expect(admitsCapture(orderOf(status, ALL_REGISTER))).toBe(
        status === ExecutionOrderStatus.IN_PROGRESS,
      );
    },
  );

  it('no admite captura sin allowedActions publicado ni fuera de sincronía', () => {
    expect(admitsCapture(orderOf(ExecutionOrderStatus.IN_PROGRESS, null))).toBe(false);
    for (const syncState of ['PENDING', 'FAILED', 'DIVERGED']) {
      expect(
        admitsCapture(orderOf(ExecutionOrderStatus.IN_PROGRESS, ALL_REGISTER, syncState)),
      ).toBe(false);
    }
  });
});

describe('canInteract', () => {
  it('conserva la condición necesaria de la consola: no bloqueada, no terminal, en línea y en sincronía', () => {
    expect(canInteract(orderOf(ExecutionOrderStatus.ASSIGNED, ['START']), false)).toBe(true);
    expect(canInteract(orderOf(ExecutionOrderStatus.IN_PROGRESS, []), false)).toBe(true);
    expect(canInteract(orderOf(ExecutionOrderStatus.IN_PROGRESS, []), true)).toBe(false);
    expect(canInteract(orderOf(ExecutionOrderStatus.BLOCKED, ['UNBLOCK']), false)).toBe(false);
    expect(canInteract(orderOf(ExecutionOrderStatus.COMPLETED, []), false)).toBe(false);
    expect(canInteract(orderOf(ExecutionOrderStatus.IN_PROGRESS, null), false)).toBe(false);
    expect(canInteract(orderOf(ExecutionOrderStatus.IN_PROGRESS, [], 'PENDING'), false)).toBe(
      false,
    );
  });
});

describe('resolveRequirementAction: la acción nace del requisito y de allowedActions', () => {
  const inProgress = (allowed: ExecutionOrderAllowedAction[]) =>
    orderOf(ExecutionOrderStatus.IN_PROGRESS, allowed);

  it('ACTIVITY nace con su activityType preseleccionado', () => {
    expect(
      resolveRequirementAction(inProgress(['REGISTER_ACTIVITY']), REQUIREMENTS.activity!),
    ).toEqual({
      kind: 'activity',
      requirementKey: 'installation-activity',
      activityType: 'INSTALLATION',
      action: 'REGISTER_ACTIVITY',
    });
  });

  it('EVIDENCE conserva requirementKey y evidenceType; MATERIAL conserva categoría', () => {
    expect(
      resolveRequirementAction(inProgress(['REGISTER_EVIDENCE']), REQUIREMENTS.evidence!),
    ).toEqual({
      kind: 'evidence',
      requirementKey: 'service-test',
      evidenceType: 'PHOTO',
      action: 'REGISTER_EVIDENCE',
    });
    expect(
      resolveRequirementAction(inProgress(['REGISTER_ITEM_USAGE']), REQUIREMENTS.material!),
    ).toMatchObject({
      kind: 'consumption',
      requirementKey: 'installed-equipment',
      itemCategory: 'CPE',
    });
  });

  it('cada requisito exige su propia entrada en allowedActions, no la de otro tipo', () => {
    expect(
      resolveRequirementAction(inProgress(['REGISTER_EVIDENCE']), REQUIREMENTS.activity!),
    ).toBeUndefined();
    expect(
      resolveRequirementAction(inProgress(['REGISTER_ACTIVITY']), REQUIREMENTS.evidence!),
    ).toBeUndefined();
    expect(
      resolveRequirementAction(inProgress(['REGISTER_ACTIVITY']), REQUIREMENTS.material!),
    ).toBeUndefined();
    expect(resolveRequirementAction(inProgress([]), REQUIREMENTS.activity!)).toBeUndefined();
  });

  it('FIELD, MEASUREMENT y COMPLIANCE no reciben variante de captura', () => {
    for (const key of ['field', 'measurement', 'compliance']) {
      expect(
        resolveRequirementAction(inProgress(ALL_REGISTER), REQUIREMENTS[key]!),
      ).toBeUndefined();
    }
  });

  it.each([
    ExecutionOrderStatus.CREATED,
    ExecutionOrderStatus.ASSIGNED,
    ExecutionOrderStatus.EN_ROUTE,
    ExecutionOrderStatus.BLOCKED,
    ExecutionOrderStatus.COMPLETED,
    ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
    ExecutionOrderStatus.NOT_EXECUTED,
    ExecutionOrderStatus.CANCELLED,
  ])('en %s ningún requisito produce acción aunque allowedActions lo autorice', (status) => {
    for (const requirement of Object.values(REQUIREMENTS)) {
      expect(resolveRequirementAction(orderOf(status, ALL_REGISTER), requirement)).toBeUndefined();
    }
  });
});
