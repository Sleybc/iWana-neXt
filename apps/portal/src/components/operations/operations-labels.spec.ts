import {
  TaskExecutionMode,
  TaskOriginContext,
  TaskPriority,
  TaskRecipientType,
  TaskResponsibleType,
  TaskStatus,
  TaskType,
} from '@iwana/shared';
import { getTaskStatusLabel, getTaskTypeLabel, TASK_PRIORITY_LABELS } from './operations-labels';

describe('operations-labels', () => {
  it('renders task type and status labels in spanish', () => {
    expect(getTaskTypeLabel(TaskType.INTERNAL_OPERATION)).toBe('Operación interna');
    expect(getTaskStatusLabel(TaskStatus.IN_PROGRESS)).toBe('En progreso');
  });

  it('maps priority labels without raw enums', () => {
    expect(TASK_PRIORITY_LABELS[TaskPriority.NORMAL]).toBe('Normal');
    expect(TASK_PRIORITY_LABELS[TaskPriority.URGENT]).toBe('Urgente');
  });

  it('exposes execution and origin labels for forms', () => {
    expect(TaskOriginContext.MANUAL).toBe('MANUAL');
    expect(TaskExecutionMode.IMMEDIATE).toBe('IMMEDIATE');
    expect(TaskResponsibleType.USER).toBe('USER');
    expect(TaskRecipientType.INTERNAL_AREA).toBe('INTERNAL_AREA');
  });
});
