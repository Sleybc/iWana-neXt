// C3 (OLA1): la lente de rol deriva solo de `allowedActions` y la alerta de
// inicio vive solo en pre-inicio para el observador sin supervisión.
import { ExecutionOrderStatus } from '@iwana/shared';
import type { ExecutionOrderAllowedAction } from '@iwana/shared';
import {
  BLOCKED_ALERT_TITLE,
  START_ALERT_TITLE,
  getBlockedCopy,
  getCommitmentLens,
  getInProgressHelp,
  getPreStartHelp,
  getStartAlertDescription,
  getTerminalHelp,
  isPreStartStatus,
  shouldRenderStartAlert,
} from './execution-order-commitment-copy';

const PRE_START = [
  ExecutionOrderStatus.CREATED,
  ExecutionOrderStatus.ASSIGNED,
  ExecutionOrderStatus.EN_ROUTE,
];
const POST_START = [
  ExecutionOrderStatus.IN_PROGRESS,
  ExecutionOrderStatus.BLOCKED,
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
];

describe('isPreStartStatus', () => {
  it.each(PRE_START)('considera pre-inicio %s', (status) => {
    expect(isPreStartStatus(status)).toBe(true);
  });

  it.each(POST_START)('no considera pre-inicio %s', (status) => {
    expect(isPreStartStatus(status)).toBe(false);
  });
});

describe('getCommitmentLens', () => {
  it('ejecutor cuando hay START, aunque haya acciones de supervisión', () => {
    expect(getCommitmentLens(['START', 'ASSIGN'])).toBe('executor');
  });

  it.each([['ASSIGN'], ['REASSIGN'], ['CREATE_FOLLOW_UP'], ['ASSIGN', 'CREATE_FOLLOW_UP']])(
    'supervisión con %s y sin START',
    (...actions) => {
      expect(getCommitmentLens(actions as ExecutionOrderAllowedAction[])).toBe('supervision');
    },
  );

  it('observador sin acciones de inicio ni supervisión', () => {
    expect(getCommitmentLens(['REGISTER_ACTIVITY', 'CLOSE'])).toBe('observer');
    expect(getCommitmentLens([])).toBe('observer');
    expect(getCommitmentLens(null)).toBe('observer');
    expect(getCommitmentLens(undefined)).toBe('observer');
  });
});

describe('shouldRenderStartAlert', () => {
  it.each(POST_START)('nunca en %s aunque no haya START (CA-03)', (status) => {
    expect(shouldRenderStartAlert({ status, allowedActions: [], assigneePresent: true })).toBe(
      false,
    );
  });

  it.each(PRE_START)('no en pre-inicio %s para el ejecutor', (status) => {
    expect(
      shouldRenderStartAlert({ status, allowedActions: ['START'], assigneePresent: true }),
    ).toBe(false);
  });

  it.each(PRE_START)('no en pre-inicio %s para supervisión (CA-04)', (status) => {
    expect(
      shouldRenderStartAlert({ status, allowedActions: ['ASSIGN'], assigneePresent: true }),
    ).toBe(false);
  });

  it.each(PRE_START)('sí en pre-inicio %s para el observador sin supervisión', (status) => {
    expect(shouldRenderStartAlert({ status, allowedActions: [], assigneePresent: false })).toBe(
      true,
    );
  });
});

describe('copy por rol y estado (verbatim tabla AI-PROD-UX)', () => {
  it('conserva el título de la alerta y nombra al técnico en campo sin mencionar sincronización', () => {
    expect(START_ALERT_TITLE).toBe('No puedes iniciar esta orden');
    for (const description of [getStartAlertDescription(true), getStartAlertDescription(false)]) {
      expect(description).toMatch(/técnico en campo/);
      expect(description.toLowerCase()).not.toContain('sincroniz');
      expect(description).not.toMatch(/permiso/i);
    }
  });

  it('pre-inicio ejecutor distingue asignado de pool', () => {
    expect(
      getPreStartHelp({
        status: ExecutionOrderStatus.ASSIGNED,
        allowedActions: ['START'],
        assigneePresent: true,
      }),
    ).toMatch(/asignada a ti/);
    expect(
      getPreStartHelp({
        status: ExecutionOrderStatus.ASSIGNED,
        allowedActions: ['START'],
        assigneePresent: false,
      }),
    ).toMatch(/no tiene responsable/);
  });

  it('pre-inicio supervisión enuncia sus acciones reales', () => {
    expect(
      getPreStartHelp({
        status: ExecutionOrderStatus.ASSIGNED,
        allowedActions: ['ASSIGN'],
        assigneePresent: true,
      }),
    ).toMatch(/asigna o reasigna/);
  });

  it('en progreso cada lente ve su copy', () => {
    expect(
      getInProgressHelp({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: ['REGISTER_ACTIVITY'],
        assigneePresent: true,
      }),
    ).toMatch(/Registra avances, evidencias y consumos/);
    expect(
      getInProgressHelp({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: ['CREATE_FOLLOW_UP'],
        assigneePresent: true,
      }),
    ).toMatch(/seguir el avance/);
    expect(
      getInProgressHelp({
        status: ExecutionOrderStatus.IN_PROGRESS,
        allowedActions: [],
        assigneePresent: true,
      }),
    ).toBeNull();
  });

  it('bloqueada avisa con título único y descripción por lente', () => {
    const assigned = getBlockedCopy({
      status: ExecutionOrderStatus.BLOCKED,
      allowedActions: ['REGISTER_ACTIVITY'],
      assigneePresent: true,
    });
    expect(assigned.title).toBe(BLOCKED_ALERT_TITLE);
    expect(assigned.description).toMatch(/retoma la ejecución desde esta pantalla/);
    const supervision = getBlockedCopy({
      status: ExecutionOrderStatus.BLOCKED,
      allowedActions: ['ASSIGN'],
      assigneePresent: true,
    });
    expect(supervision.description).toMatch(/equipo en campo/);
  });

  it('terminal ofrece solo lectura por lente', () => {
    expect(
      getTerminalHelp({
        status: ExecutionOrderStatus.COMPLETED,
        allowedActions: [],
        assigneePresent: true,
      }),
    ).toMatch(/resumen, los requisitos y el historial/);
    expect(
      getTerminalHelp({
        status: ExecutionOrderStatus.COMPLETED,
        allowedActions: ['CREATE_FOLLOW_UP'],
        assigneePresent: true,
      }),
    ).toMatch(/orden de seguimiento/);
  });
});
