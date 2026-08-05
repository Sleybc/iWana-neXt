import { DropWfmTechnicianBusinessOverrides1748566800000 } from './041_drop_wfm_technician_business_overrides';
import { CreateWfmOperationalEventualities1748653200042 } from './042_create_wfm_operational_eventualities';
import { AddOrganizationSiteContactFields1748698800043 } from './043_add_organization_site_contact_fields';
import { AddOperationalResourceToUsers1749733200044 } from './044_add_operational_resource_to_users';
import { CreateTasksModule0450000000000 } from './045_create_tasks_module';
import { CreateExecutionOrdersModule0460000000000 } from './046_create_execution_orders_module';
import { CreateInventoryScmModule0470000000000 } from './047_create_inventory_scm_module';
import { HardenInventoryWriteOffStatus0480000000000 } from './048_harden_inventory_write_off_status';
import { RefineInventoryPurchasingWorkspace0490000000000 } from './049_refine_inventory_purchasing_workspace';
import { ExtendGoodsReceiptStatusForPurchasing0500000000000 } from './050_extend_goods_receipt_status_for_purchasing';
import { ExpandInventoryItemMasterCatalog0510000000000 } from './051_expand_inventory_item_master_catalog';
import { CreateInventoryCategories0520000000000 } from './052_create_inventory_categories';
import { AddCategoryCodePrefix0530000000000 } from './053_add_category_code_prefix';
import { RepairCategoryCodePrefixLegible0540000000000 } from './054_repair_category_code_prefix_legible';
import { ShortenCategoryCodePrefix0550000000000 } from './055_shorten_category_code_prefix';
import { ExecutionOrderTraceabilityRefs0560000000000 } from './056_execution_order_traceability_refs';
import { CreateStockIssues0570000000000 } from './057_create_stock_issues';
import { AddCounterPurchaseOrigin0580000000000 } from './058_add_counter_purchase_origin';
import { CreatePurchaseRfq0590000000000 } from './059_create_purchase_rfq';
import { LinkSupplierQuotesToRfq0600000000000 } from './060_link_supplier_quotes_to_rfq';
import { AddPurchaseRfqActorRefs0610000000000 } from './061_add_purchase_rfq_actor_refs';
import { AddRfqInvitationInvitedBy0620000000000 } from './062_add_rfq_invitation_invited_by';
import { DropLegacyAdditionalProducts0630000000000 } from './063_drop_legacy_additional_products';
import { CreateSupplierProfiles0640000000000 } from './064_create_supplier_profiles';
import { AddPartyAddressFields0650000000000 } from './065_add_party_address_fields';
import { AddPartyCityDepartment0660000000000 } from './066_add_party_city_department';
import { AddPurchaseRequestResolution0670000000000 } from './067_add_purchase_request_resolution';
import { AddPurchaseOrderResolution0680000000000 } from './068_add_purchase_order_resolution';
import { CreateSupplierQuoteLines0690000000000 } from './069_create_supplier_quote_lines';
import { AddSupplierQuoteShippingCost0700000000000 } from './070_add_supplier_quote_shipping_cost';
import { CreateStockCounts0710000000000 } from './071_create_stock_counts';
import { ReconcileStockReservations0720000000000 } from './072_reconcile_stock_reservations';
import { AddStockBalanceReservationCheck0730000000000 } from './073_add_stock_balance_reservation_check';
import { RedactLeakedTemporaryPasswords0740000000000 } from './074_redact_leaked_temporary_passwords';
import { EnforceAuditImmutability0750000000000 } from './075_enforce_audit_immutability';
import { AddPasswordResetTokenExpiresAt0760000000000 } from './076_add_password_reset_token_expires_at';
import { RedactResidualAuditPii0770000000000 } from './077_redact_residual_audit_pii';
import { RedactAuditPiiSuffixGap0780000000000 } from './078_redact_audit_pii_suffix_gap';
import { AddInventoryItemAverageCost0800000000000 } from './080_add_inventory_item_average_cost';
import { LinkAssetLifecycleAndLoanIdempotency0810000000000 } from './081_link_asset_lifecycle_and_loan_idempotency';
import { ExtendInventoryWriteOffsPayload0820000000000 } from './082_extend_inventory_write_offs_payload';
import { AlignUsersEntityDdl0830000000000 } from './083_align_users_entity_ddl';
import { UsersSearchTrgmIndexes0840000000000 } from './084_users_search_trgm_indexes';
import { NarrowUsersRoleToTenantDomain0850000000000 } from './085_narrow_users_role_to_tenant_domain';
import { TaxRulesClassificationNullable0860000000000 } from './086_tax_rules_classification_nullable';
import { AddExpedienteDocumentNumberHash0870000000000 } from './087_add_expediente_document_number_hash';
import { BackfillExpedienteDocumentNumberHash0880000000000 } from './088_backfill_expediente_document_number_hash';
import { PaginationOrderingIndexes0890000000000 } from './089_pagination_ordering_indexes';
import { ExecutionOrderContractReliability0900000000000 } from './090_execution_order_contract_reliability';
import { ExecutionOrderScheduleUnique0910000000000 } from './091_execution_order_schedule_unique';
import { SeedExecutionOrderPermissions0920000000000 } from './092_seed_execution_order_permissions';
import { ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000 } from './093_extend_visit_request_status_and_outbox_occurred_at';
import { TemplateVersioningAndClosureGate0940000000000 } from './094_template_versioning_and_closure_gate';
import { CreateExecutionOrderEvidenceUploadIntents0950000000000 } from './095_create_execution_order_evidence_upload_intents';
import { AddExecutionOrderEvidenceCapturedAt0960000000000 } from './096_add_execution_order_evidence_captured_at';
import { ExecutionOrderItemUsageIntegerQuantity0970000000000 } from './097_execution_order_item_usage_integer_quantity';
import { ExecutionOrderServerScope0980000000000 } from './098_execution_order_server_scope';
import { ExtendEvidenceUploadIntentStatus0990000000000 } from './099_extend_evidence_upload_intent_status';
import { LinkExecutionOrderEvidenceIdempotency1000000000000 } from './100_link_execution_order_evidence_idempotency';
import { AlignExecutionOrderEvidenceIntentRetention1010000000000 } from './101_align_execution_order_evidence_intent_retention';
import { AddVisitRequestRetryCount102 } from './102_add_visit_request_retry_count';
import { CreateNonRealizationCauses103 } from './103_create_non_realization_causes';
import { AddNonRealizationFieldsToScheduleEvents104 } from './104_add_non_realization_fields_to_schedule_events';
import { AddVisitRequestAdditionalReason105 } from './105_add_visit_request_additional_reason';
import { AddScheduleEventReviewNotes106 } from './106_add_schedule_event_review_notes';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
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
import { AddScheduleEventSector1700000000033 } from './033_add_schedule_event_sector';
import { CreateVisitRequests1700000000034 } from './034_create_visit_requests';
import { HardenVisitRequestsIndexes1700000000035 } from './035_harden_visit_requests_indexes';
import { CreateWfmOperatingHoursModule1700000000036 } from './036_create_wfm_operating_hours_module';
import { CreateConfigurationControlPlane1700000000037 } from './037_create_configuration_control_plane';
import { MapWfmOperatingSitesToOrganizationSites1700000000038 } from './038_map_wfm_operating_sites_to_organization_sites';
import { ReplaceWfmOperatingSitesWithOrganizationSites1700000000039 } from './039_replace_wfm_operating_sites_with_organization_sites';
import { Mod00HorarioBaseEmpresaExcepciones1748000000000 } from './040_add_organization_company_hours_and_exceptions';

export const TENANT_MIGRATIONS: (new () => MigrationInterface)[] = [
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
  AddScheduleEventSector1700000000033,
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
  AddOperationalResourceToUsers1749733200044,
  CreateTasksModule0450000000000,
  CreateExecutionOrdersModule0460000000000,
  CreateInventoryScmModule0470000000000,
  HardenInventoryWriteOffStatus0480000000000,
  RefineInventoryPurchasingWorkspace0490000000000,
  ExtendGoodsReceiptStatusForPurchasing0500000000000,
  ExpandInventoryItemMasterCatalog0510000000000,
  CreateInventoryCategories0520000000000,
  AddCategoryCodePrefix0530000000000,
  RepairCategoryCodePrefixLegible0540000000000,
  ShortenCategoryCodePrefix0550000000000,
  ExecutionOrderTraceabilityRefs0560000000000,
  CreateStockIssues0570000000000,
  AddCounterPurchaseOrigin0580000000000,
  CreatePurchaseRfq0590000000000,
  LinkSupplierQuotesToRfq0600000000000,
  AddPurchaseRfqActorRefs0610000000000,
  AddRfqInvitationInvitedBy0620000000000,
  DropLegacyAdditionalProducts0630000000000,
  CreateSupplierProfiles0640000000000,
  AddPartyAddressFields0650000000000,
  AddPartyCityDepartment0660000000000,
  AddPurchaseRequestResolution0670000000000,
  AddPurchaseOrderResolution0680000000000,
  CreateSupplierQuoteLines0690000000000,
  AddSupplierQuoteShippingCost0700000000000,
  CreateStockCounts0710000000000,
  ReconcileStockReservations0720000000000,
  AddStockBalanceReservationCheck0730000000000,
  RedactLeakedTemporaryPasswords0740000000000,
  EnforceAuditImmutability0750000000000,
  AddPasswordResetTokenExpiresAt0760000000000,
  RedactResidualAuditPii0770000000000,
  RedactAuditPiiSuffixGap0780000000000,
  AddInventoryItemAverageCost0800000000000,
  LinkAssetLifecycleAndLoanIdempotency0810000000000,
  ExtendInventoryWriteOffsPayload0820000000000,
  AlignUsersEntityDdl0830000000000,
  UsersSearchTrgmIndexes0840000000000,
  NarrowUsersRoleToTenantDomain0850000000000,
  TaxRulesClassificationNullable0860000000000,
  AddExpedienteDocumentNumberHash0870000000000,
  BackfillExpedienteDocumentNumberHash0880000000000,
  PaginationOrderingIndexes0890000000000,
  ExecutionOrderContractReliability0900000000000,
  ExecutionOrderScheduleUnique0910000000000,
  SeedExecutionOrderPermissions0920000000000,
  ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000,
  TemplateVersioningAndClosureGate0940000000000,
  CreateExecutionOrderEvidenceUploadIntents0950000000000,
  AddExecutionOrderEvidenceCapturedAt0960000000000,
  ExecutionOrderItemUsageIntegerQuantity0970000000000,
  ExecutionOrderServerScope0980000000000,
  ExtendEvidenceUploadIntentStatus0990000000000,
  LinkExecutionOrderEvidenceIdempotency1000000000000,
  AlignExecutionOrderEvidenceIntentRetention1010000000000,
  AddVisitRequestRetryCount102,
  CreateNonRealizationCauses103,
  AddNonRealizationFieldsToScheduleEvents104,
  AddVisitRequestAdditionalReason105,
  AddScheduleEventReviewNotes106,
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

function extractMigrationTimestamp(name: string): number {
  const match = name.match(/(\d+)$/);
  if (!match) {
    throw new Error(`La migración "${name}" no tiene sufijo numérico de timestamp.`);
  }

  return Number(match[1]);
}

/**
 * Extensión local del contrato TypeORM (ADR-066).
 * TypeORM expone `transaction` en MigrationInterface; el runner tenant usa
 * `transactional` (nombre del ADR) para no acoplarse al modo nativo del CLI.
 */
export type TenantMigrationLike = MigrationInterface & {
  /** false = DDL fuera de TX (p. ej. CREATE INDEX CONCURRENTLY). Default true. */
  transactional?: boolean;
};

/** Default true: las migraciones existentes (000–086) siguen el camino atómico. */
export function isTenantMigrationTransactional(migration: TenantMigrationLike): boolean {
  return migration.transactional ?? true;
}

function wrapNonTransactionalFailure(migrationName: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  const wrapped = new Error(
    `La migración no transaccional "${migrationName}" falló. ` +
      `Verifique manualmente el estado del schema: el DDL pudo haberse aplicado parcialmente. ` +
      `Detalle: ${detail}`,
  );
  if (error instanceof Error) {
    wrapped.cause = error;
  }
  return wrapped;
}

/**
 * Aplica una migración tenant pendiente: camino transaccional (default) o
 * DDL fuera de TX + bookkeeping en TX (ADR-066). Exportada para tests unitarios.
 */
export async function applyTenantMigrationStep(
  queryRunner: QueryRunner,
  migration: TenantMigrationLike,
  migrationName: string,
): Promise<void> {
  const transactional = isTenantMigrationTransactional(migration);

  if (transactional) {
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
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
    return;
  }

  // DDL fuera de transacción; bookkeeping atómico aparte.
  try {
    await migration.up(queryRunner);
  } catch (error) {
    throw wrapNonTransactionalFailure(migrationName, error);
  }

  await queryRunner.startTransaction();
  try {
    await queryRunner.query(
      `
        INSERT INTO "typeorm_migrations" ("timestamp", "name")
        VALUES ($1, $2)
      `,
      [extractMigrationTimestamp(migrationName), migrationName],
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw wrapNonTransactionalFailure(migrationName, error);
  }
}

export async function ensureTenantMigrationsTable(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "typeorm_migrations" (
      "id" SERIAL NOT NULL,
      "timestamp" BIGINT NOT NULL,
      "name" character varying NOT NULL,
      CONSTRAINT "PK_typeorm_migrations_id" PRIMARY KEY ("id")
    )
  `);
}

async function getAppliedTenantMigrationNames(queryRunner: QueryRunner): Promise<Set<string>> {
  const rows = (await queryRunner.query(`
    SELECT "name"
    FROM "typeorm_migrations"
    ORDER BY "id" ASC
  `)) as Array<{ name: string }>;

  return new Set(rows.map((row) => row.name));
}

export async function applyTenantMigrationsInOrder(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await ensureTenantMigrationsTable(queryRunner);
    const appliedNames = await getAppliedTenantMigrationNames(queryRunner);

    for (const MigrationClass of TENANT_MIGRATIONS) {
      const migration = new MigrationClass() as TenantMigrationLike;
      const migrationName = migration.name ?? MigrationClass.name;

      if (appliedNames.has(migrationName)) {
        continue;
      }

      await applyTenantMigrationStep(queryRunner, migration, migrationName);
      appliedNames.add(migrationName);
    }
  } finally {
    await queryRunner.release();
  }
}

export interface TenantMigrationResult {
  schemaName: string;
  ok: boolean;
  elapsedMs: number;
  error?: string;
}

export async function runTenantMigrations(
  dataSource: DataSource,
): Promise<TenantMigrationResult[]> {
  const results: TenantMigrationResult[] = [];
  await acquireGlobalLock(dataSource);
  try {
    const tenants = await getActiveTenants(dataSource);
    const totalTenants = tenants.length;
    console.log(`[MIGRATOR] Starting migrations for ${totalTenants} tenant(s)`);
    for (const tenant of tenants) {
      console.log(`[MIGRATOR] Migrating ${tenant.schema_name}`);
      const startTime = Date.now();
      try {
        await runMigrationsForTenant(dataSource, tenant.schema_name);
        const elapsed = Date.now() - startTime;
        console.log(`[MIGRATOR] Done ${tenant.schema_name} in ${elapsed}ms`);
        results.push({ schemaName: tenant.schema_name, ok: true, elapsedMs: elapsed });
      } catch (err) {
        const elapsed = Date.now() - startTime;
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[MIGRATOR] Failed ${tenant.schema_name}`, err);
        results.push({
          schemaName: tenant.schema_name,
          ok: false,
          elapsedMs: elapsed,
          error: detail,
        });
      }
    }

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      const failedNames = failed.map((f) => f.schemaName).join(', ');
      console.error(
        `[MIGRATOR] ${failed.length} of ${totalTenants} tenant(s) failed migration: ${failedNames}`,
      );
      throw new Error(
        `Tenant migration failed for ${failed.length} schema(s): ${failedNames}. ` +
          `Los ${results.length - failed.length} restantes se completaron correctamente.`,
      );
    }
  } finally {
    await releaseGlobalLock(dataSource);
  }

  return results;
}

/**
 * Lock global de migración. Exportado para que la ruta de revert
 * (`./revert`) tome exactamente el mismo lock que la ruta de up: un proceso
 * migrando y otro revirtiendo al mismo tiempo es el escenario que queremos
 * imposibilitar.
 */
export async function acquireGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_lock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock acquired');
}

export async function releaseGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_unlock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock released');
}

async function getActiveTenants(dataSource: DataSource): Promise<Array<{ schema_name: string }>> {
  return dataSource.query(`SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`);
}

/**
 * Construye el DataSource apuntado al schema de un tenant.
 *
 * Extraído de `runMigrationsForTenant` sin cambiar ninguna opción para que la
 * ruta de revert (`./revert`) abra la conexión exactamente igual que la de up
 * — en particular el `search_path` por conexión, del que dependen todas las
 * migraciones tenant al no calificar schema en sus sentencias.
 *
 * `connectionName` se parametriza solo para evitar colisión de nombres cuando
 * up y revert coexisten en el mismo proceso (tests).
 */
export function createTenantDataSource(
  baseDataSource: DataSource,
  schemaName: string,
  connectionName = `tenant-${schemaName}`,
): DataSource {
  const baseOpts = baseDataSource.options as PostgresOptions;

  return new DataSource({
    type: 'postgres',
    host: baseOpts.host,
    port: baseOpts.port,
    username: baseOpts.username,
    password: baseOpts.password,
    database: baseOpts.database,
    schema: schemaName,
    name: connectionName,
    migrationsTableName: 'typeorm_migrations',
    migrations: TENANT_MIGRATIONS,
    synchronize: false,
    logging: ['error'],
    // Fuerza search_path para que las migraciones usen el schema correcto
    // sin necesidad de calificar cada tabla con schema explícito
    extra: { options: `-c search_path="${schemaName}"` },
  });
}

async function runMigrationsForTenant(
  baseDataSource: DataSource,
  schemaName: string,
): Promise<void> {
  let tenantDs: DataSource | null = null;
  try {
    tenantDs = createTenantDataSource(baseDataSource, schemaName);
    await tenantDs.initialize();
    await applyTenantMigrationsInOrder(tenantDs);
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
  }
}
