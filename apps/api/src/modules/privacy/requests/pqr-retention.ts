import type { EntityManager } from 'typeorm';
import { addCalendarMonths } from '@iwana/shared';
import { toBogotaCivilDate } from '../ports/privacy-tenant-query';
import { IPqrRetentionReadPort, type PqrRetentionScope } from './ports/pqr-retention-read.port';

export async function hasPqrConservationDuty(
  port: IPqrRetentionReadPort | undefined,
  scope: PqrRetentionScope,
  manager: EntityManager,
  today: string,
): Promise<boolean> {
  if (!scope.subscriberIds.length && !scope.contractIds.length && !scope.expedienteIds.length)
    return false;
  if (!port) throw new Error('PQR retention port is not registered');
  const standing = await port.read(scope, { manager });
  if (standing.hasUnanswered) return true;
  if (!standing.lastResponseAt) return false;
  const rows = (await manager.query('SELECT years FROM retention_policies WHERE category = $1', [
    'PQR_SOPORTES',
  ])) as Array<{ years: number }>;
  const years = Number(rows[0]?.years ?? 0);
  if (!years) throw new Error('Missing retention policy: PQR_SOPORTES');
  return addCalendarMonths(toBogotaCivilDate(standing.lastResponseAt), years * 12) > today;
}
