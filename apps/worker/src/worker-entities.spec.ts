import { DataSource } from 'typeorm';
import { User, VisitRequest } from '@iwana/db';
import { WORKER_ENTITIES } from './worker-entities';

/**
 * Cada entidad que un procesador del worker usa por clase (`manager.create`,
 * `createQueryBuilder(Entidad)`) debe estar registrada; si no, el job falla con
 * EntityMetadataNotFoundError (caso real: «Solicitar visita» sin visita, 2026-11-17).
 */
describe('WORKER_ENTITIES', () => {
  it('registra las entidades que usan los procesadores', async () => {
    const dataSource = new DataSource({ type: 'postgres', entities: WORKER_ENTITIES });
    // buildMetadatas no abre conexión.
    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    expect(dataSource.hasMetadata(VisitRequest)).toBe(true);
    expect(dataSource.hasMetadata(User)).toBe(true);
  });
});
