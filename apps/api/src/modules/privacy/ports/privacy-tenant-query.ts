import { DataSource, EntityManager } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';

/** Ejecuta cada consulta con SET LOCAL search_path dentro de su propia transacción. */
export function withPrivacyTenant<T>(
  dataSource: DataSource,
  operation: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const { schemaName } = TenantContext.getOrThrow();
  return runInTenantSchema(dataSource, schemaName, (queryRunner) => operation(queryRunner.manager));
}

/** Fecha civil de hoy en la zona colombiana, sin convertirla a una fecha UTC. */
export function bogotaCivilDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
