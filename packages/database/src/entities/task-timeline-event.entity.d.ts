import { TaskTimelineEventType } from '@iwana/shared';
/**
 * Entidad TaskTimelineEvent — schema por tenant (dinamico via search_path).
 * Registro append-only del ciclo de vida de una tarea operativa.
 */
export declare class TaskTimelineEvent {
    id: string;
    taskId: string;
    tenantId: string;
    eventType: TaskTimelineEventType;
    payload: Record<string, unknown>;
    actorUserId: string | null;
    occurredAt: Date;
}
//# sourceMappingURL=task-timeline-event.entity.d.ts.map