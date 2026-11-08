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

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Normaliza un ancla de retención a fecha civil de Bogotá (D-EXP-1).
 *
 * Acepta fechas civiles `YYYY-MM-DD` (columnas `date`) y las pasa intactas, y
 * convierte instantes (`timestamptz` en ISO) con `bogotaCivilDate`. Nunca
 * recorta un ISO UTC con `slice(0, 10)`: un instante de las 00:30 UTC es el
 * día anterior en Bogotá. Falla cerrado ante un valor inválido.
 */
export function toBogotaCivilDate(value: string): string {
  if (CIVIL_DATE_PATTERN.test(value)) {
    const probe = new Date(`${value}T12:00:00.000Z`);
    if (!Number.isFinite(probe.getTime()) || probe.toISOString().slice(0, 10) !== value) {
      throw new Error('El ancla de retención no es una fecha civil válida.');
    }
    return value;
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) {
    throw new Error('El ancla de retención no es una fecha válida.');
  }
  return bogotaCivilDate(instant);
}
