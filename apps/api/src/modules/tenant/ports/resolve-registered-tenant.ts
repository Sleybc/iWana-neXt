import { TenantStatus } from '@iwana/shared';
import { UnrecoverableError } from 'bullmq';
import type {
  TenantLifecycleReadPort,
  TenantLifecycleSnapshot,
} from './tenant-lifecycle-read.port';

/**
 * Contexto tenant de un job desde el registro de tenants (SEC-7): el tenant debe existir,
 * estar ACTIVE y sin borrar, y el schema y el slug del payload, si vienen, deben coincidir con
 * el registro. Cualquier discrepancia es definitiva (UnrecoverableError).
 */
export async function resolveRegisteredTenant(
  tenants: TenantLifecycleReadPort,
  claimed: { tenantId: string; schemaName?: string; tenantSlug?: string },
): Promise<TenantLifecycleSnapshot> {
  const tenant = await tenants.findTenantLifecycleById(claimed.tenantId);
  if (
    !tenant ||
    tenant.status !== TenantStatus.ACTIVE ||
    tenant.deletedAt ||
    (claimed.schemaName !== undefined && claimed.schemaName !== tenant.schemaName) ||
    (claimed.tenantSlug !== undefined && claimed.tenantSlug !== tenant.slug)
  ) {
    throw new UnrecoverableError('El tenant del trabajo no coincide con el registro de tenants.');
  }
  return tenant;
}
