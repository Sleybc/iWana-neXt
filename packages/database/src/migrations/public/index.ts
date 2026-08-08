import type { MigrationInterface } from 'typeorm';

import {
  describeDeferredMigration,
  isMigrationDeferred,
  type DeferrableMigration,
} from '../shared/deferred-migration.util';
import { CreatePublicSchema1741766400000 } from './001_create_public_schema';
import { AddPlatformUserProfile1742100000000 } from './002_add_platform_user_profile';
import { AddTenantBusinessFields1742200000000 } from './003_add_tenant_business_fields';
import { ReplaceDisplayNameWithFirstLastName1742300000000 } from './004_replace_display_name_with_first_last_name';
import { AddTenantBrandingColumns1742350000000 } from './005_add_tenant_branding_columns';
import { SoftDeleteTenantsAndPhoneLength1742400000000 } from './006_soft_delete_tenants_and_phone_length';
import { TenantLifecyclePurgeAndNullableLimits1742400001000 } from './007_tenant_lifecycle_purge_and_nullable_limits';
import { CreateMediaAssetsTable1746000001000 } from './008_create_media_assets_table';
import { ExtendTenantBrandingV21746164500000 } from './009_extend_tenant_branding_v2';
import { CreatePlatformBrandingSettings1746164700000 } from './010_create_platform_branding_settings';
import { AddTenantBrandingMetadata1746164800000 } from './011_add_tenant_branding_metadata';
import { RedactLeakedTemporaryPasswords1784419201000 } from './012_redact_leaked_temporary_passwords';
import { AddTenantAdminEmail1784419202000 } from './013_add_tenant_admin_email';
import { EnforcePlatformAuditImmutability1784419203000 } from './014_enforce_platform_audit_immutability';
import { AuditOwnerLeastPrivilege1784419204000 } from './015_audit_owner_least_privilege';
import { RedactResidualAuditPii1784419205000 } from './016_redact_residual_audit_pii';
import { RedactAuditPiiSuffixGap1784419206000 } from './017_redact_audit_pii_suffix_gap';
import { EnablePgTrgm1784419207000 } from './018_enable_pg_trgm';
import { AddTenantPrincipalAdmin1784419207000 } from './019_add_tenant_principal_admin';
import { AddMediaAssetStatusAndClaim1784419208000 } from './020_add_media_asset_status_and_claim';
import { PlatformUsersEmailHmac1784419209000 } from './021_platform_users_email_hmac';
import { DropPlatformUsersEmailHash1784419210000 } from './022_drop_platform_users_email_hash';
import { PruneOrphanMigrationRegistryRows1784419211000 } from './023_prune_orphan_migration_registry_rows';
import { HardenPlatformAuditMaintenanceGuard1784419212000 } from './024_harden_platform_audit_maintenance_guard';

/**
 * Migraciones del schema público, en orden.
 *
 * Sustituye al glob `dist/migrations/public/*.js` por dos motivos:
 *
 * 1. El glob dejaba el orden en manos del sufijo numérico de cada clase, que
 *    TypeORM interpreta como timestamp. Un sufijo mal formado mandaba la
 *    migración al principio de la cola y rompía el bootstrap limpio (le pasó a
 *    la 020 y a la 021). `migration-order.spec.ts` verifica que esta lista y los
 *    sufijos digan lo mismo, y que ningún archivo del directorio quede fuera.
 * 2. Permite excluir migraciones diferidas (`deferredBy`) antes de que TypeORM
 *    las vea: el CLI aplica todo lo pendiente, no tiene forma de saltarse una.
 */
export const PUBLIC_MIGRATIONS: (new () => MigrationInterface)[] = [
  CreatePublicSchema1741766400000,
  AddPlatformUserProfile1742100000000,
  AddTenantBusinessFields1742200000000,
  ReplaceDisplayNameWithFirstLastName1742300000000,
  AddTenantBrandingColumns1742350000000,
  SoftDeleteTenantsAndPhoneLength1742400000000,
  TenantLifecyclePurgeAndNullableLimits1742400001000,
  CreateMediaAssetsTable1746000001000,
  ExtendTenantBrandingV21746164500000,
  CreatePlatformBrandingSettings1746164700000,
  AddTenantBrandingMetadata1746164800000,
  RedactLeakedTemporaryPasswords1784419201000,
  AddTenantAdminEmail1784419202000,
  EnforcePlatformAuditImmutability1784419203000,
  AuditOwnerLeastPrivilege1784419204000,
  RedactResidualAuditPii1784419205000,
  RedactAuditPiiSuffixGap1784419206000,
  EnablePgTrgm1784419207000,
  AddTenantPrincipalAdmin1784419207000,
  AddMediaAssetStatusAndClaim1784419208000,
  PlatformUsersEmailHmac1784419209000,
  DropPlatformUsersEmailHash1784419210000,
  PruneOrphanMigrationRegistryRows1784419211000,
  HardenPlatformAuditMaintenanceGuard1784419212000,
];

/**
 * Las que deben aplicarse en esta corrida: retira las diferidas cuya variable de
 * entorno no esté activa.
 *
 * No avisa por defecto: esto se evalúa al cargar el DataSource, y eso ocurre en
 * cada arranque de la API y del worker, no solo al migrar. El aviso lo emite
 * `listDeferredMigrations` desde el CLI de migración, que es donde el operador
 * puede hacer algo con él.
 */
export function resolvePublicMigrations(
  env: NodeJS.ProcessEnv = process.env,
  log: (message: string) => void = () => undefined,
): (new () => MigrationInterface)[] {
  return PUBLIC_MIGRATIONS.filter((MigrationClass) => {
    const migration = new MigrationClass() as MigrationInterface & DeferrableMigration;

    if (!isMigrationDeferred(migration, env)) {
      return true;
    }

    log(
      describeDeferredMigration(
        migration.name ?? MigrationClass.name,
        migration.deferredBy as string,
      ),
    );

    return false;
  });
}
