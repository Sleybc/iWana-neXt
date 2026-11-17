import type { EntitySchema } from 'typeorm';
import { dataSourceOptions, VisitRequest } from '@iwana/db';

type EntityTarget = Function | string | EntitySchema;

/**
 * Entidades de TypeORM del worker: las de `dataSourceOptions` más las tenant que
 * sus procesadores usan por clase. La API registra las suyas con `forFeature`
 * en cada módulo; el worker no, así que van aquí.
 */
export const WORKER_ENTITIES: EntityTarget[] = [
  ...Object.values(dataSourceOptions.entities ?? {}),
  // assurance-field-service.processor: crea la solicitud de visita de un ticket.
  VisitRequest,
];
