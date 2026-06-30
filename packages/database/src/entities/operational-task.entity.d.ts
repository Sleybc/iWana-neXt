import { TaskExecutionMode, TaskOriginContext, TaskPriority, TaskRecipientType, TaskResponsibleType, TaskStatus, TaskType } from '@iwana/shared';
/**
 * Entidad OperationalTask — schema por tenant (dinamico via search_path).
 * Owner MOD11: trabajo ejecutable transversal con responsable y destinatario explicitos.
 */
export declare class OperationalTask {
    id: string;
    tenantId: string;
    taskNumber: string;
    type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    title: string;
    description: string | null;
    originContext: TaskOriginContext;
    originRefId: string | null;
    ticketId: string | null;
    responsibleType: TaskResponsibleType;
    responsibleRefId: string;
    recipientType: TaskRecipientType;
    recipientRefId: string | null;
    recipientLabel: string | null;
    queueName: string | null;
    executionMode: TaskExecutionMode;
    dueAt: Date | null;
    scheduledRequired: boolean;
    scheduleEventId: string | null;
    workOrderId: string | null;
    createdByUserId: string | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=operational-task.entity.d.ts.map