import { DropWfmTechnicianBusinessOverrides1748566800000 } from './041_drop_wfm_technician_business_overrides';
import { CreateWfmOperationalEventualities1748653200042 } from './042_create_wfm_operational_eventualities';
import { AddOrganizationSiteContactFields1748698800043 } from './043_add_organization_site_contact_fields';
import { DataSource, MigrationInterface } from 'typeorm';
import { InitialTenantSchema1700000000000 } from './000_initial_tenant_schema';
import { CreateExpedienteRecords1700000000001 } from './001_create_expediente_records';
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
import { AddCommercialRulesFields1700000000020 } from './020_add_commercial_rules_fields';
import { CreateTaxationModule1700000000021 } from './021_create_taxation_module';
import { CreatePartiesModule1700000000022 } from './022_create_parties_module';
import { CreateTaxRuleApplications1700000000023 } from './023_create_tax_rule_applications';
import { BackfillSubscribersPartyId1700000000024 } from './024_backfill_subscribers_party_id';
import { DeprecateLegacyTaxation1700000000025 } from './025_deprecate_legacy_taxation';
import { CreateSubscriberTaxProfiles1700000000026 } from './026_create_subscriber_tax_profiles';
import { AddAdditionalServiceIdsToExpediente1700000000027 } from './027_add_additional_service_ids_to_expediente';
import { CreateCrmQuotesAndContracts1700000000028 } from './028_create_crm_quotes_and_contracts';
import { ExtendContractsForServices1700000000029 } from './029_extend_contracts_for_services';
import { CreateWfmModule1700000000030 } from './030_create_wfm_module';
import { CreateAssuranceModule1700000000031 } from './031_create_assurance_module';
import { AddExpedienteToTicketSubjectType1700000000032 } from './032_add_expediente_to_ticket_subject_type';
import { CreateVisitRequests1700000000034 } from './034_create_visit_requests';
import { HardenVisitRequestsIndexes1700000000035 } from './035_harden_visit_requests_indexes';
import { CreateWfmOperatingHoursModule1700000000036 } from './036_create_wfm_operating_hours_module';
import { CreateConfigurationControlPlane1700000000037 } from './037_create_configuration_control_plane';
import { MapWfmOperatingSitesToOrganizationSites1700000000038 } from './038_map_wfm_operating_sites_to_organization_sites';
import { ReplaceWfmOperatingSitesWithOrganizationSites1700000000039 } from './039_replace_wfm_operating_sites_with_organization_sites';
import { Mod00HorarioBaseEmpresaExcepciones1748000000000 } from './040_add_organization_company_hours_and_exceptions';

const TENANT_MIGRATIONS: (new () => MigrationInterface)[] = [
  InitialTenantSchema1700000000000,
  CreateExpedienteRecords1700000000001,
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
  AddCommercialRulesFields1700000000020,
  CreateTaxationModule1700000000021,
  CreatePartiesModule1700000000022,
  CreateTaxRuleApplications1700000000023,
  BackfillSubscribersPartyId1700000000024,
  DeprecateLegacyTaxation1700000000025,
  CreateSubscriberTaxProfiles1700000000026,
  AddAdditionalServiceIdsToExpediente1700000000027,
  CreateCrmQuotesAndContracts1700000000028,
  ExtendContractsForServices1700000000029,
  CreateWfmModule1700000000030,
  CreateAssuranceModule1700000000031,
  AddExpedienteToTicketSubjectType1700000000032,
  CreateVisitRequests1700000000034,
  HardenVisitRequestsIndexes1700000000035,
  CreateWfmOperatingHoursModule1700000000036,
  CreateConfigurationControlPlane1700000000037,
  MapWfmOperatingSitesToOrganizationSites1700000000038,
  ReplaceWfmOperatingSitesWithOrganizationSites1700000000039,
  Mod00HorarioBaseEmpresaExcepciones1748000000000,
  DropWfmTechnicianBusinessOverrides1748566800000,
  CreateWfmOperationalEventualities1748653200042,
  AddOrganizationSiteContactFields1748698800043,
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
