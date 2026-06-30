/**
 * scheduling-task-orchestration.spec.ts
 *
 * Pruebas unitarias del orquestador Task -> Agenda -> OT.
 *
 * Patrón: mock completo de tasksApi y wfmApi antes de cada test.
 */

import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskType,
  WfmWorkType,
  WorkOrderPriority,
  WorkOrderSourceContext,
} from '@iwana/shared';
import { tasksApi, wfmApi } from '@/lib/api-client';
import type { CreateTaskSchedulingValues } from './CreateTaskSchedulingDialog';
import {
  buildOrchestrationFeedback,
  createTaskWithOptionalScheduling,
} from './scheduling-task-orchestration';

// ——— Mocks de módulo ———
jest.mock('@/lib/api-client', () => ({
  tasksApi: {
    create: jest.fn(),
    linkScheduleEvent: jest.fn(),
    linkWorkOrder: jest.fn(),
  },
  wfmApi: {
    events: {
      create: jest.fn(),
    },
  },
}));

// ——— Fixtures ———

function makeScheduledValues(
  overrides: Partial<CreateTaskSchedulingValues> = {},
): CreateTaskSchedulingValues {
  return {
    title: 'Instalación barrio norte',
    type: TaskType.INSTALLATION,
    priority: TaskPriority.HIGH,
    executionMode: TaskExecutionMode.SCHEDULED,
    dueAt: '',
    responsibleRefId: 'user-123',
    recipientType: TaskRecipientType.PROSPECT,
    recipientRefId: 'pros-1',
    recipientLabel: 'Cliente Demo',

    scheduleWorkType: WfmWorkType.INSTALLATION,
    scheduledDateLocal: '2026-06-24',
    scheduledStartTimeLocal: '09:00',
    durationMinutes: 120,
    agendaResponsibleRefId: '',
    address: 'Calle 1 #2-3',
    municipality: 'Bogotá',
    sector: 'Kennedy',
    coordinates: '',

    createWorkOrder: true,
    workOrderSummary: 'OT de instalación cliente Demo',
    workOrderNotes: 'Sin acceso por ascensor.',
    workOrderPriority: WorkOrderPriority.HIGH,
    workOrderType: WfmWorkType.INSTALLATION,
    workOrderSourceContext: WorkOrderSourceContext.CRM,
    workOrderSourceRef: 'exp-abc-123',
    ...overrides,
  };
}

function makeManualValues(
  overrides: Partial<CreateTaskSchedulingValues> = {},
): CreateTaskSchedulingValues {
  return {
    ...makeScheduledValues(),
    executionMode: TaskExecutionMode.IMMEDIATE,
    ...overrides,
  };
}

const MOCK_TASK = { id: 'task-001', taskNumber: 'TSK-001' } as any;
const MOCK_EVENT = { id: 'evt-001', workOrderId: 'wo-001' } as any;
const MOCK_EVENT_NO_WO = { id: 'evt-002', workOrderId: null } as any;

// ——— Suite ———

describe('createTaskWithOptionalScheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tasksApi.create as jest.Mock).mockResolvedValue(MOCK_TASK);
    (wfmApi.events.create as jest.Mock).mockResolvedValue(MOCK_EVENT);
    (tasksApi.linkScheduleEvent as jest.Mock).mockResolvedValue({});
    (tasksApi.linkWorkOrder as jest.Mock).mockResolvedValue({});
  });

  describe('flujo SCHEDULED', () => {
    it('crea la tarea primero y luego el evento de agenda', async () => {
      const values = makeScheduledValues();
      const result = await createTaskWithOptionalScheduling({ values });

      expect(tasksApi.create).toHaveBeenCalledTimes(1);
      expect(wfmApi.events.create).toHaveBeenCalledTimes(1);
      expect(result.task).toEqual(MOCK_TASK);
      expect(result.event).toEqual(MOCK_EVENT);
    });

    it('vincula el evento a la tarea con linkScheduleEvent', async () => {
      const values = makeScheduledValues();
      await createTaskWithOptionalScheduling({ values });

      expect(tasksApi.linkScheduleEvent).toHaveBeenCalledWith('task-001', {
        scheduleEventId: 'evt-001',
      });
    });

    it('vincula la OT a la tarea cuando el evento la incluye', async () => {
      const values = makeScheduledValues();
      await createTaskWithOptionalScheduling({ values });

      expect(tasksApi.linkWorkOrder).toHaveBeenCalledWith('task-001', {
        workOrderId: 'wo-001',
      });
    });

    it('NO vincula OT cuando el evento no genera workOrderId', async () => {
      (wfmApi.events.create as jest.Mock).mockResolvedValue(MOCK_EVENT_NO_WO);
      const values = makeScheduledValues({ createWorkOrder: false });
      await createTaskWithOptionalScheduling({ values });

      expect(tasksApi.linkWorkOrder).not.toHaveBeenCalled();
    });

    it('usa el agendaResponsibleRefId como assignedUserId cuando se especifica', async () => {
      const values = makeScheduledValues({ agendaResponsibleRefId: 'tech-456' });
      await createTaskWithOptionalScheduling({ values });

      const eventDto = (wfmApi.events.create as jest.Mock).mock.calls[0][0];
      expect(eventDto.assignedUserId).toBe('tech-456');
    });

    it('usa el responsibleRefId de la tarea como fallback de assignedUserId', async () => {
      const values = makeScheduledValues({ agendaResponsibleRefId: '' });
      await createTaskWithOptionalScheduling({ values });

      const eventDto = (wfmApi.events.create as jest.Mock).mock.calls[0][0];
      expect(eventDto.assignedUserId).toBe('user-123');
    });
  });

  describe('flujo IMMEDIATE (sin agenda)', () => {
    it('crea la tarea y NO crea evento ni vinculaciones', async () => {
      const values = makeManualValues();
      const result = await createTaskWithOptionalScheduling({ values });

      expect(tasksApi.create).toHaveBeenCalledTimes(1);
      expect(wfmApi.events.create).not.toHaveBeenCalled();
      expect(tasksApi.linkScheduleEvent).not.toHaveBeenCalled();
      expect(tasksApi.linkWorkOrder).not.toHaveBeenCalled();
      expect(result.event).toBeNull();
    });
  });

  describe('flujo FIELD_SERVICE', () => {
    it('crea tarea + evento porque FIELD_SERVICE exige agenda', async () => {
      const values = makeScheduledValues({ executionMode: TaskExecutionMode.FIELD_SERVICE });
      const result = await createTaskWithOptionalScheduling({ values });

      expect(wfmApi.events.create).toHaveBeenCalledTimes(1);
      expect(tasksApi.linkScheduleEvent).toHaveBeenCalledTimes(1);
      expect(result.event).not.toBeNull();
    });
  });

  describe('flujo DUE_DATE (sin agenda, con fecha objetivo)', () => {
    it('crea la tarea con dueAt y sin evento', async () => {
      const values = makeScheduledValues({
        executionMode: TaskExecutionMode.DUE_DATE,
        dueAt: '2026-07-01T10:00',
      });
      const result = await createTaskWithOptionalScheduling({ values });

      const taskDto = (tasksApi.create as jest.Mock).mock.calls[0][0];
      expect(taskDto.dueAt).toBeTruthy();
      expect(wfmApi.events.create).not.toHaveBeenCalled();
      expect(result.event).toBeNull();
    });
  });

  describe('contextos vinculados', () => {
    it('propaga linkedTicketId al task DTO y al event DTO', async () => {
      const values = makeScheduledValues();
      await createTaskWithOptionalScheduling({ values, linkedTicketId: 'ticket-999' });

      const taskDto = (tasksApi.create as jest.Mock).mock.calls[0][0];
      const eventDto = (wfmApi.events.create as jest.Mock).mock.calls[0][0];

      expect(taskDto.ticketId).toBe('ticket-999');
      expect(eventDto.ticketId).toBe('ticket-999');
    });

    it('propaga linkedExpedienteId al task DTO y al event DTO', async () => {
      const values = makeScheduledValues();
      await createTaskWithOptionalScheduling({ values, linkedExpedienteId: 'exp-xyz' });

      const taskDto = (tasksApi.create as jest.Mock).mock.calls[0][0];
      const eventDto = (wfmApi.events.create as jest.Mock).mock.calls[0][0];

      expect(taskDto.originRefId).toBe('exp-xyz');
      expect(eventDto.expedienteId).toBe('exp-xyz');
    });

    it('usa TaskOriginContext.MANUAL por defecto', async () => {
      const values = makeScheduledValues();
      await createTaskWithOptionalScheduling({ values });

      const taskDto = (tasksApi.create as jest.Mock).mock.calls[0][0];
      expect(taskDto.originContext).toBe(TaskOriginContext.MANUAL);
    });

    it('acepta TaskOriginContext.CRM como override', async () => {
      const values = makeScheduledValues();
      await createTaskWithOptionalScheduling({ values, sourceContext: TaskOriginContext.CRM });

      const taskDto = (tasksApi.create as jest.Mock).mock.calls[0][0];
      expect(taskDto.originContext).toBe(TaskOriginContext.CRM);
    });
  });

  describe('manejo de errores', () => {
    it('propaga el error de tasksApi.create al llamador', async () => {
      (tasksApi.create as jest.Mock).mockRejectedValue(new Error('API error'));
      const values = makeScheduledValues();

      await expect(createTaskWithOptionalScheduling({ values })).rejects.toThrow('API error');
    });

    it('propaga el error de wfmApi.events.create al llamador', async () => {
      (wfmApi.events.create as jest.Mock).mockRejectedValue(new Error('Schedule error'));
      const values = makeScheduledValues();

      await expect(createTaskWithOptionalScheduling({ values })).rejects.toThrow('Schedule error');
    });
  });
});

// ——— buildOrchestrationFeedback ———

describe('buildOrchestrationFeedback', () => {
  it('devuelve mensaje sin agenda cuando event es null', () => {
    const result = buildOrchestrationFeedback({
      task: MOCK_TASK,
      event: null,
    });
    expect(result).toContain('TSK-001');
    expect(result).toContain('sin agenda');
  });

  it('devuelve mensaje con agenda y OT cuando workOrderId existe', () => {
    const result = buildOrchestrationFeedback({
      task: MOCK_TASK,
      event: MOCK_EVENT,
    });
    expect(result).toContain('TSK-001');
    expect(result).toContain('agenda');
    expect(result).toContain('orden de trabajo');
  });

  it('devuelve mensaje con agenda pero sin OT cuando workOrderId es null', () => {
    const result = buildOrchestrationFeedback({
      task: MOCK_TASK,
      event: MOCK_EVENT_NO_WO,
    });
    expect(result).toContain('TSK-001');
    expect(result).not.toContain('orden de trabajo');
  });
});
