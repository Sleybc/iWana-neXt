import { Module } from '@nestjs/common';
import { CommercialCatalogReadModule } from '../../commercial/ports/commercial-catalog-read.module';
import { InstallationConsumptionValuationReadAdapter } from './installation-consumption-valuation-read.adapter';
import { InstallationConsumptionValuationReadPort } from './installation-consumption-valuation-read.port';

/**
 * Módulo fino de MOD12: valoración del consumo de la instalación para MOD14. Importa solo el
 * módulo fino del puerto de catálogo de MOD06 (M3), no CommercialModule, y no vuelve a registrar
 * adaptadores de InventoryModule.
 */
@Module({
  imports: [CommercialCatalogReadModule],
  providers: [
    InstallationConsumptionValuationReadAdapter,
    {
      provide: InstallationConsumptionValuationReadPort,
      useExisting: InstallationConsumptionValuationReadAdapter,
    },
  ],
  exports: [InstallationConsumptionValuationReadPort],
})
export class InstallationConsumptionValuationReadModule {}
