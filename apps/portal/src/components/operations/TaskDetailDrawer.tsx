'use client';

import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@iwana/ui';
import { TaskStatus } from '@iwana/shared';
import type {
  OperationalTaskAssignmentHistoryRecord,
  OperationalTaskRecord,
  OperationalTaskTimelineEvent,
} from '@/lib/api-client';
import {
  formatTaskDateTime,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  getTaskTypeLabel,
  TASK_STATUS_VARIANTS,
} from './operations-labels';
import { TaskAssignmentHistory } from './TaskAssignmentHistory';
import { TaskTimeline } from './TaskTimeline';

export interface TaskDetailDrawerProps {
  open: boolean;
  task: OperationalTaskRecord | null;
  timeline: OperationalTaskTimelineEvent[];
  assignmentHistory: OperationalTaskAssignmentHistoryRecord[];
  onClose: () => void;
  onTransition?: (status: TaskStatus) => Promise<void>;
  isTransitioning?: boolean;
  isLoadingDetails?: boolean;
  error?: string | null;
  resolveResponsibleLabel?: (value: string | null | undefined) => string;
}

export function TaskDetailDrawer({
  open,
  task,
  timeline,
  assignmentHistory,
  onClose,
  onTransition,
  isTransitioning = false,
  isLoadingDetails = false,
  error,
  resolveResponsibleLabel,
}: TaskDetailDrawerProps) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{task.taskNumber}</Badge>
            <Badge variant={TASK_STATUS_VARIANTS[task.status]}>
              {getTaskStatusLabel(task.status)}
            </Badge>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {getTaskTypeLabel(task.type)}
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Prioridad: {getTaskPriorityLabel(task.priority)}
            </span>
          </div>

          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Responsable</dt>
              <dd className="font-medium text-gray-950 dark:text-white">
                {resolveResponsibleLabel?.(task.responsibleRefId) ?? task.responsibleRefId}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Destinatario</dt>
              <dd className="font-medium text-gray-950 dark:text-white">
                {task.recipientLabel ?? task.recipientRefId ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Creada</dt>
              <dd>{formatTaskDateTime(task.createdAt)}</dd>
            </div>
            {task.ticketId && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Ticket vinculado</dt>
                <dd>{task.ticketId}</dd>
              </div>
            )}
          </dl>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {isLoadingDetails && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Cargando trazabilidad de la tarea...
            </p>
          )}

          {onTransition &&
            task.status !== TaskStatus.RESOLVED &&
            task.status !== TaskStatus.CANCELLED && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isTransitioning}
                  onClick={() => void onTransition(TaskStatus.IN_PROGRESS)}
                >
                  Marcar en progreso
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isTransitioning}
                  onClick={() => void onTransition(TaskStatus.RESOLVED)}
                >
                  Resolver
                </Button>
              </div>
            )}

          <TaskTimeline events={timeline} />
          <TaskAssignmentHistory
            records={assignmentHistory}
            resolveResponsibleLabel={resolveResponsibleLabel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
