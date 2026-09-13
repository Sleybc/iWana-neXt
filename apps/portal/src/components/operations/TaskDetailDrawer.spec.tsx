// apps/portal/src/components/operations/TaskDetailDrawer.spec.tsx
// PROD-UX #1 (OLA 4.1): el detalle de tarea ofrece un control «Cerrar» visible
// con la primitive `DialogClose` y objetivo táctil ≥44 px (UX spec §8.2/§11.3).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskStatus } from '@iwana/shared';
import { TaskDetailDrawer } from './TaskDetailDrawer';

const TASK = {
  id: 'task-001',
  taskNumber: 'TSK-001',
  type: 'INTERNAL_OPERATION',
  status: TaskStatus.OPEN,
  priority: 'NORMAL',
  title: 'Revisar inventario',
  responsibleRefId: 'user-001',
  responsibleLabel: 'Laura Ruiz',
  recipientType: 'INTERNAL_AREA',
  recipientRefId: 'operations-area',
  recipientLabel: 'Operaciones',
  executionMode: 'IMMEDIATE',
  scheduledRequired: false,
  createdAt: '2026-09-13T10:00:00.000Z',
} as never;

describe('TaskDetailDrawer — cierre visible (OLA 4.1)', () => {
  it('expone «Cerrar» con nombre accesible y objetivo de 44 px', () => {
    render(
      <TaskDetailDrawer
        open
        task={TASK}
        timeline={[]}
        assignmentHistory={[]}
        onClose={jest.fn()}
      />,
    );

    const close = screen.getByRole('button', { name: 'Cerrar' });
    expect(close).toHaveClass('min-h-11', 'min-w-11');
  });

  it('el control «Cerrar» invoca onClose a través de DialogClose', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <TaskDetailDrawer open task={TASK} timeline={[]} assignmentHistory={[]} onClose={onClose} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
