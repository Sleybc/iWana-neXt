import {
  PLATFORM_HEALTH_SAMPLER_QUEUE,
  TENANT_USAGE_SAMPLER_QUEUE,
  WORKER_QUEUE_NAMES,
  type WorkerQueueName,
} from '@iwana/shared';
import { CONTRACT_MEDIA_SWEEP_QUEUE } from './processors/contract-media-sweep.processor';
import { EVIDENCE_ANALYSIS_QUEUE } from './processors/evidence-analysis.processor';
import { EVIDENCE_ORPHAN_DETECTION_QUEUE } from './processors/evidence-orphan-detection.processor';

/**
 * Colas que registra el worker. La lista vive en `@iwana/shared` (F3-D5) para que la
 * web derive de ella los nombres visibles; aquí se reexporta para `WorkerModule` y
 * para el muestreador de salud.
 */
export { PLATFORM_HEALTH_SAMPLER_QUEUE, TENANT_USAGE_SAMPLER_QUEUE, WORKER_QUEUE_NAMES };
export type { WorkerQueueName };

/**
 * Las colas cuya constante vive en su procesador deben estar en la lista compartida:
 * si el literal del procesador cambia o la cola sale de la lista, esto no compila.
 */
export const WORKER_LOCAL_QUEUE_NAMES = [
  CONTRACT_MEDIA_SWEEP_QUEUE,
  EVIDENCE_ANALYSIS_QUEUE,
  EVIDENCE_ORPHAN_DETECTION_QUEUE,
] as const satisfies readonly WorkerQueueName[];
