import { DataSource, MigrationInterface } from 'typeorm';
import { InitialTenantSchema1700000000000 } from './000_initial_tenant_schema';
import { AddExpedienteTechnicalViabilityFields1700000000006 } from './006_add_expediente_technical_viability_fields';
import { AddAcquisitionChannelAndSalesAttributions1700000000007 } from './007_add_acquisition_channel_and_sales_attributions';
import { AddAdditionalProducts1700000000008 } from './008_add_additional_products';
import { AddCurrentResponsibleFieldsAndOperationalHistory1700000000009 } from './009_add_current_responsible_fields_and_operational_history';
import { AddPostalCodeToExpedienteRecords1700000000010 } from './010_add_postal_code_to_expediente_records';
import { AddDocumentSupportsToExpedienteRecords1700000000011 } from './011_add_document_supports_to_expediente_records';
import { AddSubscribersTable1700000000012 } from './012_add_subscribers';
import { ConsolidateExpedientePipeline1700000000013 } from './013_consolidate_expediente_pipeline';
import { AddSubscriberHashColumns1700000000014 } from './014_add_subscriber_hash_columns';
import { AddSubscriberConversionFields1700000000015 } from './015_add_subscriber_conversion_fields';
import { AddSubscriberAlternateContactFields1700000000016 } from './016_add_subscriber_alternate_contact_fields';
import { CreateCommercialModule1700000000017 } from './017_create_commercial_module';
import { MigrateCatalogData1700000000018 } from './018_migrate_catalog_data';
import { SeedCommercialDefaultTaxRules1700000000019 } from './019_seed_commercial_default_tax_rules';

const TENANT_MIGRATIONS: (new () => MigrationInterface)[] = [
  InitialTenantSchema1700000000000,
  AddExpedienteTechnicalViabilityFields1700000000006,
  AddAcquisitionChannelAndSalesAttributions1700000000007,
  AddAdditionalProducts1700000000008,
  AddCurrentResponsibleFieldsAndOperationalHistory1700000000009,
  AddPostalCodeToExpedienteRecords1700000000010,
  AddDocumentSupportsToExpedienteRecords1700000000011,
  AddSubscribersTable1700000000012,
  ConsolidateExpedientePipeline1700000000013,
  AddSubscriberHashColumns1700000000014,
  AddSubscriberConversionFields1700000000015,
  AddSubscriberAlternateContactFields1700000000016,
  CreateCommercialModule1700000000017,
  MigrateCatalogData1700000000018,
  SeedCommercialDefaultTaxRules1700000000019,
];

const MIGRATION_LOCK_NAMESPACE = 42;
const MIGRATION_LOCK_RESOURCE = 1001;

interface PostgresOptions {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export async function runTenantMigrations(dataSource: DataSource): Promise<void> {
  await acquireGlobalLock(dataSource);
  try {
    const tenants = await getActiveTenants(dataSource);
    console.log(`[MIGRATOR] Starting migrations for ${tenants.length} tenant(s)`);
    for (const tenant of tenants) {
      console.log(`[MIGRATOR] Migrating ${tenant.schema_name}`);
      const startTime = Date.now();
      try {
        await runMigrationsForTenant(dataSource, tenant.schema_name);
        console.log(`[MIGRATOR] Done ${tenant.schema_name} in ${Date.now() - startTime}ms`);
      } catch (err) {
        console.error(`[MIGRATOR] Failed ${tenant.schema_name}`, err);
        throw err;
      }
    }
  } finally {
    await releaseGlobalLock(dataSource);
  }
}

async function acquireGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_lock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock acquired');
}

async function releaseGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_unlock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock released');
}

async function getActiveTenants(dataSource: DataSource): Promise<Array<{ schema_name: string }>> {
  return dataSource.query(`SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`);
}

async function runMigrationsForTenant(
  baseDataSource: DataSource,
  schemaName: string,
): Promise<void> {
  let tenantDs: DataSource | null = null;
  const baseOpts = baseDataSource.options as PostgresOptions;
  try {
    tenantDs = new DataSource({
      type: 'postgres',
      host: baseOpts.host,
      port: baseOpts.port,
      username: baseOpts.username,
      password: baseOpts.password,
      database: baseOpts.database,
      schema: schemaName,
      name: `tenant-${schemaName}`,
      migrationsTableName: 'typeorm_migrations',
      migrations: TENANT_MIGRATIONS,
      synchronize: false,
      logging: ['error'],
      // Fuerza search_path para que las migraciones usen el schema correcto
      // sin necesidad de calificar cada tabla con schema explícito
      extra: { options: `-c search_path="${schemaName}"` },
    });
    await tenantDs.initialize();
    await tenantDs.runMigrations();
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
  }
}
