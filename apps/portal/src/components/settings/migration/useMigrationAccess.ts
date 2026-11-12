import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePermissions } from '@/components/access-control/permissions-context';

/** La importación exige ADMIN con migration.import.manage (ADR-110), igual que el API. */
export function useMigrationAccess(): { ready: boolean; allowed: boolean } {
  const { user, isLoading } = useAuth();
  const { hasPermission } = usePermissions();
  return {
    ready: !isLoading,
    allowed:
      user?.role === UserRole.ADMIN && hasPermission(AccessPermissionKey.MIGRATION_IMPORT_MANAGE),
  };
}

/** Intervalo de refresco mientras un lote procesa o se promueve. */
export const MIGRATION_POLL_INTERVAL_MS = 4_000;
