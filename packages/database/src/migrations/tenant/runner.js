'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TENANT_MIGRATIONS = void 0;
exports.applyTenantMigrationsInOrder = applyTenantMigrationsInOrder;
exports.runTenantMigrations = runTenantMigrations;
const _041_drop_wfm_technician_business_overrides_1 = require('./041_drop_wfm_technician_business_overrides');
const _042_create_wfm_operational_eventualities_1 = require('./042_create_wfm_operational_eventualities');
const _043_add_organization_site_contact_fields_1 = require('./043_add_organization_site_contact_fields');
const _044_add_operational_resource_to_users_1 = require('./044_add_operational_resource_to_users');
const _045_create_tasks_module_1 = require('./045_create_tasks_module');
const _046_create_execution_orders_module_1 = require('./046_create_execution_orders_module');
const _047_create_inventory_scm_module_1 = require('./047_create_inventory_scm_module');
const _048_harden_inventory_write_off_status_1 = require('./048_harden_inventory_write_off_status');
const _049_refine_inventory_purchasing_workspace_1 = require('./049_refine_inventory_purchasing_workspace');
const _050_extend_goods_receipt_status_for_purchasing_1 = require('./050_extend_goods_receipt_status_for_purchasing');
const _051_expand_inventory_item_master_catalog_1 = require('./051_expand_inventory_item_master_catalog');
const _052_create_inventory_categories_1 = require('./052_create_inventory_categories');
const typeorm_1 = require('typeorm');
const _000_initial_tenant_schema_1 = require('./000_initial_tenant_schema');
const _001_create_expediente_records_1 = require('./001_create_expediente_records');
const _006_add_expediente_technical_viability_fields_1 = require('./006_add_expediente_technical_viability_fields');
const _007_add_acquisition_channel_and_sales_attributions_1 = require('./007_add_acquisition_channel_and_sales_attributions');
const _008_add_additional_products_1 = require('./008_add_additional_products');
const _009_add_current_responsible_fields_and_operational_history_1 = require('./009_add_current_responsible_fields_and_operational_history');
const _010_add_postal_code_to_expediente_records_1 = require('./010_add_postal_code_to_expediente_records');
const _011_add_document_supports_to_expediente_records_1 = require('./011_add_document_supports_to_expediente_records');
const _012_add_subscribers_1 = require('./012_add_subscribers');
const _013_consolidate_expediente_pipeline_1 = require('./013_consolidate_expediente_pipeline');
const _014_add_subscriber_hash_columns_1 = require('./014_add_subscriber_hash_columns');
const _015_add_subscriber_conversion_fields_1 = require('./015_add_subscriber_conversion_fields');
const _016_add_subscriber_alternate_contact_fields_1 = require('./016_add_subscriber_alternate_contact_fields');
const _017_create_commercial_module_1 = require('./017_create_commercial_module');
const _018_migrate_catalog_data_1 = require('./018_migrate_catalog_data');
const _019_seed_commercial_default_tax_rules_1 = require('./019_seed_commercial_default_tax_rules');
const _020_add_commercial_rules_fields_1 = require('./020_add_commercial_rules_fields');
const _021_create_taxation_module_1 = require('./021_create_taxation_module');
const _022_create_parties_module_1 = require('./022_create_parties_module');
const _023_create_tax_rule_applications_1 = require('./023_create_tax_rule_applications');
const _024_backfill_subscribers_party_id_1 = require('./024_backfill_subscribers_party_id');
const _025_deprecate_legacy_taxation_1 = require('./025_deprecate_legacy_taxation');
const _026_create_subscriber_tax_profiles_1 = require('./026_create_subscriber_tax_profiles');
const _027_add_additional_service_ids_to_expediente_1 = require('./027_add_additional_service_ids_to_expediente');
const _028_create_crm_quotes_and_contracts_1 = require('./028_create_crm_quotes_and_contracts');
const _029_extend_contracts_for_services_1 = require('./029_extend_contracts_for_services');
const _030_create_wfm_module_1 = require('./030_create_wfm_module');
const _031_create_assurance_module_1 = require('./031_create_assurance_module');
const _032_add_expediente_to_ticket_subject_type_1 = require('./032_add_expediente_to_ticket_subject_type');
const _034_create_visit_requests_1 = require('./034_create_visit_requests');
const _035_harden_visit_requests_indexes_1 = require('./035_harden_visit_requests_indexes');
const _036_create_wfm_operating_hours_module_1 = require('./036_create_wfm_operating_hours_module');
const _037_create_configuration_control_plane_1 = require('./037_create_configuration_control_plane');
const _038_map_wfm_operating_sites_to_organization_sites_1 = require('./038_map_wfm_operating_sites_to_organization_sites');
const _039_replace_wfm_operating_sites_with_organization_sites_1 = require('./039_replace_wfm_operating_sites_with_organization_sites');
const _040_add_organization_company_hours_and_exceptions_1 = require('./040_add_organization_company_hours_and_exceptions');
exports.TENANT_MIGRATIONS = [
  _000_initial_tenant_schema_1.InitialTenantSchema1700000000000,
  _001_create_expediente_records_1.CreateExpedienteRecords1700000000001,
  _006_add_expediente_technical_viability_fields_1.AddExpedienteTechnicalViabilityFields1700000000006,
  _007_add_acquisition_channel_and_sales_attributions_1.AddAcquisitionChannelAndSalesAttributions1700000000007,
  _008_add_additional_products_1.AddAdditionalProducts1700000000008,
  _009_add_current_responsible_fields_and_operational_history_1.AddCurrentResponsibleFieldsAndOperationalHistory1700000000009,
  _010_add_postal_code_to_expediente_records_1.AddPostalCodeToExpedienteRecords1700000000010,
  _011_add_document_supports_to_expediente_records_1.AddDocumentSupportsToExpedienteRecords1700000000011,
  _012_add_subscribers_1.AddSubscribersTable1700000000012,
  _013_consolidate_expediente_pipeline_1.ConsolidateExpedientePipeline1700000000013,
  _014_add_subscriber_hash_columns_1.AddSubscriberHashColumns1700000000014,
  _015_add_subscriber_conversion_fields_1.AddSubscriberConversionFields1700000000015,
  _016_add_subscriber_alternate_contact_fields_1.AddSubscriberAlternateContactFields1700000000016,
  _017_create_commercial_module_1.CreateCommercialModule1700000000017,
  _018_migrate_catalog_data_1.MigrateCatalogData1700000000018,
  _019_seed_commercial_default_tax_rules_1.SeedCommercialDefaultTaxRules1700000000019,
  _020_add_commercial_rules_fields_1.AddCommercialRulesFields1700000000020,
  _021_create_taxation_module_1.CreateTaxationModule1700000000021,
  _022_create_parties_module_1.CreatePartiesModule1700000000022,
  _023_create_tax_rule_applications_1.CreateTaxRuleApplications1700000000023,
  _024_backfill_subscribers_party_id_1.BackfillSubscribersPartyId1700000000024,
  _025_deprecate_legacy_taxation_1.DeprecateLegacyTaxation1700000000025,
  _026_create_subscriber_tax_profiles_1.CreateSubscriberTaxProfiles1700000000026,
  _027_add_additional_service_ids_to_expediente_1.AddAdditionalServiceIdsToExpediente1700000000027,
  _028_create_crm_quotes_and_contracts_1.CreateCrmQuotesAndContracts1700000000028,
  _029_extend_contracts_for_services_1.ExtendContractsForServices1700000000029,
  _030_create_wfm_module_1.CreateWfmModule1700000000030,
  _031_create_assurance_module_1.CreateAssuranceModule1700000000031,
  _032_add_expediente_to_ticket_subject_type_1.AddExpedienteToTicketSubjectType1700000000032,
  _034_create_visit_requests_1.CreateVisitRequests1700000000034,
  _035_harden_visit_requests_indexes_1.HardenVisitRequestsIndexes1700000000035,
  _036_create_wfm_operating_hours_module_1.CreateWfmOperatingHoursModule1700000000036,
  _037_create_configuration_control_plane_1.CreateConfigurationControlPlane1700000000037,
  _038_map_wfm_operating_sites_to_organization_sites_1.MapWfmOperatingSitesToOrganizationSites1700000000038,
  _039_replace_wfm_operating_sites_with_organization_sites_1.ReplaceWfmOperatingSitesWithOrganizationSites1700000000039,
  _040_add_organization_company_hours_and_exceptions_1.Mod00HorarioBaseEmpresaExcepciones1748000000000,
  _041_drop_wfm_technician_business_overrides_1.DropWfmTechnicianBusinessOverrides1748566800000,
  _042_create_wfm_operational_eventualities_1.CreateWfmOperationalEventualities1748653200042,
  _043_add_organization_site_contact_fields_1.AddOrganizationSiteContactFields1748698800043,
  _044_add_operational_resource_to_users_1.AddOperationalResourceToUsers1749733200044,
  _045_create_tasks_module_1.CreateTasksModule0450000000000,
  _046_create_execution_orders_module_1.CreateExecutionOrdersModule0460000000000,
  _047_create_inventory_scm_module_1.CreateInventoryScmModule0470000000000,
  _048_harden_inventory_write_off_status_1.HardenInventoryWriteOffStatus0480000000000,
  _049_refine_inventory_purchasing_workspace_1.RefineInventoryPurchasingWorkspace0490000000000,
  _050_extend_goods_receipt_status_for_purchasing_1.ExtendGoodsReceiptStatusForPurchasing0500000000000,
  _051_expand_inventory_item_master_catalog_1.ExpandInventoryItemMasterCatalog0510000000000,
  _052_create_inventory_categories_1.CreateInventoryCategories0520000000000,
];
const MIGRATION_LOCK_NAMESPACE = 42;
const MIGRATION_LOCK_RESOURCE = 1001;
function extractMigrationTimestamp(name) {
  const match = name.match(/(\d+)$/);
  if (!match) {
    throw new Error(`La migración "${name}" no tiene sufijo numérico de timestamp.`);
  }
  return Number(match[1]);
}
async function ensureTenantMigrationsTable(queryRunner) {
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
      "id" SERIAL NOT NULL,
      "timestamp" BIGINT NOT NULL,
      "name" character varying NOT NULL,
      CONSTRAINT "PK_typeorm_migrations_id" PRIMARY KEY ("id")
    )
  `);
}
async function getAppliedTenantMigrationNames(queryRunner) {
  const rows = await queryRunner.query(`
    SELECT "name"
    FROM "typeorm_migrations"
    ORDER BY "id" ASC
  `);
  return new Set(rows.map((row) => row.name));
}
async function applyTenantMigrationsInOrder(dataSource) {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await ensureTenantMigrationsTable(queryRunner);
    const appliedNames = await getAppliedTenantMigrationNames(queryRunner);
    for (const MigrationClass of exports.TENANT_MIGRATIONS) {
      const migration = new MigrationClass();
      const migrationName = migration.name ?? MigrationClass.name;
      if (appliedNames.has(migrationName)) {
        continue;
      }
      await queryRunner.startTransaction();
      try {
        await migration.up(queryRunner);
        await queryRunner.query(
          `
            INSERT INTO "typeorm_migrations" ("timestamp", "name")
            VALUES ($1, $2)
          `,
          [extractMigrationTimestamp(migrationName), migrationName],
        );
        await queryRunner.commitTransaction();
        appliedNames.add(migrationName);
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    }
  } finally {
    await queryRunner.release();
  }
}
async function runTenantMigrations(dataSource) {
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
async function acquireGlobalLock(dataSource) {
  await dataSource.query(`SELECT pg_advisory_lock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock acquired');
}
async function releaseGlobalLock(dataSource) {
  await dataSource.query(`SELECT pg_advisory_unlock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock released');
}
async function getActiveTenants(dataSource) {
  return dataSource.query(`SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`);
}
async function runMigrationsForTenant(baseDataSource, schemaName) {
  let tenantDs = null;
  const baseOpts = baseDataSource.options;
  try {
    tenantDs = new typeorm_1.DataSource({
      type: 'postgres',
      host: baseOpts.host,
      port: baseOpts.port,
      username: baseOpts.username,
      password: baseOpts.password,
      database: baseOpts.database,
      schema: schemaName,
      name: `tenant-${schemaName}`,
      migrationsTableName: 'typeorm_migrations',
      migrations: exports.TENANT_MIGRATIONS,
      synchronize: false,
      logging: ['error'],
      // Fuerza search_path para que las migraciones usen el schema correcto
      // sin necesidad de calificar cada tabla con schema explícito
      extra: { options: `-c search_path="${schemaName}"` },
    });
    await tenantDs.initialize();
    await applyTenantMigrationsInOrder(tenantDs);
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
  }
}
//# sourceMappingURL=runner.js.map
