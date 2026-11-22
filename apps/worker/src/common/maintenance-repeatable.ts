import type { Queue, RepeatOptions } from 'bullmq';
import { MAINTENANCE_JOB_RETENTION } from '@iwana/shared';

/**
 * Registra un trabajo repetible de mantenimiento (familia M de B(b)) con su retención.
 *
 * Cada ejecución de un repetible hereda las opciones de la anterior: sin retirarlo antes, un
 * repetible ya programado seguiría con la retención vieja (o sin ninguna). Por eso primero
 * `removeRepeatable` y después `add`. No se migra a `upsertJobScheduler`: el repetible heredado
 * seguiría vivo junto al programador nuevo y el trabajo correría dos veces.
 */
export async function registerMaintenanceRepeatable(
  queue: Pick<Queue, 'add' | 'removeRepeatable'>,
  name: string,
  repeat: Omit<RepeatOptions, 'key'>,
  jobId: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  await queue.removeRepeatable(name, repeat, jobId);
  await queue.add(name, data, { repeat, jobId, ...MAINTENANCE_JOB_RETENTION });
}
