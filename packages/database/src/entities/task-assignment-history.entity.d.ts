import { TaskResponsibleType } from '@iwana/shared';
/**
 * Entidad TaskAssignmentHistory — schema por tenant (dinamico via search_path).
 * Historial de handoff entre responsables activos.
 */
export declare class TaskAssignmentHistory {
    id: string;
    tenantId: string;
    taskId: string;
    previousResponsibleType: TaskResponsibleType;
    previousResponsibleRefId: string;
    newResponsibleType: TaskResponsibleType;
    newResponsibleRefId: string;
    reason: string | null;
    actorUserId: string | null;
    createdAt: Date;
}
//# sourceMappingURL=task-assignment-history.entity.d.ts.map