import { Module } from '@nestjs/common';
import { TaxDefinitionService } from './services/tax-definition.service';
import { TaxPresetsSeeder } from './services/tax-presets.seeder';
import { TaxCatalogReadAdapter } from './ports/tax-catalog-read.adapter';
import { TaxCatalogReadPort } from './ports/tax-catalog-read.port';
import { TaxationController } from './taxation.controller';

/**
 * Módulo Taxation (MOD07) — Catálogo unificado de impuestos por tenant.
 *
 * Exports:
 * - TaxCatalogReadPort: para consumo externo vía puerto (CommercialModule, futuros).
 * - TaxPresetsSeeder: para invocación desde TenantProvisioningProcessor.
 *
 * No exporta TaxDefinition ni TaxDefinitionService (boundary estricto).
 * ADR-029 — ningún módulo externo toca la tabla tax_definitions directamente.
 * Ref: HLD-MOD07 §3, §5
 */
@Module({
  controllers: [TaxationController],
  providers: [
    TaxDefinitionService,
    TaxPresetsSeeder,
    TaxCatalogReadAdapter,
    {
      provide: TaxCatalogReadPort,
      useExisting: TaxCatalogReadAdapter,
    },
  ],
  exports: [TaxCatalogReadPort, TaxPresetsSeeder],
})
export class TaxationModule {}
