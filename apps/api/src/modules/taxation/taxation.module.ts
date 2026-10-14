import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxDefinitionService } from './services/tax-definition.service';
import { TaxApplicationService } from './services/tax-application.service';
import { TaxPresetsSeeder } from './services/tax-presets.seeder';
import { TaxCatalogReadAdapter } from './ports/tax-catalog-read.adapter';
import { TaxCatalogReadPort } from './ports/tax-catalog-read.port';
import { TaxApplicationReadAdapter } from './ports/tax-application-read.adapter';
import { ITaxApplicationReadPort } from './ports/tax-application-read.port';
import { InternetVatResolverAdapter } from './ports/internet-vat-resolver.adapter';
import { IInternetVatResolverPort } from './ports/internet-vat-resolver.port';
import { TaxationController } from './taxation.controller';
import { TaxRulesController } from './tax-rules.controller';
import { CommercialTaxAliasController } from './commercial-tax-alias.controller';
import { TaxDefinition } from './entities/tax-definition.entity';
import { TaxRule } from './entities/tax-rule.entity';
import { TaxRuleApplication } from './entities/tax-rule-application.entity';

/**
 * Taxation (MOD07) — catálogo de impuestos y motor de reglas de aplicación.
 *
 * Exports:
 * - TaxCatalogReadPort
 * - ITaxApplicationReadPort
 * - IInternetVatResolverPort
 * - TaxPresetsSeeder
 *
 * ADR-029, ADR-082.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TaxDefinition, TaxRule, TaxRuleApplication])],
  controllers: [TaxationController, TaxRulesController, CommercialTaxAliasController],
  providers: [
    TaxDefinitionService,
    TaxApplicationService,
    TaxPresetsSeeder,
    TaxCatalogReadAdapter,
    TaxApplicationReadAdapter,
    InternetVatResolverAdapter,
    {
      provide: TaxCatalogReadPort,
      useExisting: TaxCatalogReadAdapter,
    },
    {
      provide: ITaxApplicationReadPort,
      useExisting: TaxApplicationReadAdapter,
    },
    {
      provide: IInternetVatResolverPort,
      useExisting: InternetVatResolverAdapter,
    },
  ],
  exports: [
    TaxCatalogReadPort,
    ITaxApplicationReadPort,
    IInternetVatResolverPort,
    TaxPresetsSeeder,
  ],
})
export class TaxationModule {}
