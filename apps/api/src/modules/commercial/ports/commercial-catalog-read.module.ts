import { Module } from '@nestjs/common';
import { CommercialCatalogReadAdapter } from './commercial-catalog-read.adapter';
import { CommercialCatalogReadPort } from './commercial-catalog-read.port';

/**
 * Módulo fino de MOD06: solo el puerto de lectura del catálogo comercial. Lo importan los
 * consumidores que no necesitan CommercialModule completo (spec MOD14 2026-11-13, boundary M3).
 * CommercialModule lo importa y lo reexporta: hay una sola instancia del adaptador.
 */
@Module({
  providers: [
    CommercialCatalogReadAdapter,
    { provide: CommercialCatalogReadPort, useExisting: CommercialCatalogReadAdapter },
  ],
  exports: [CommercialCatalogReadPort],
})
export class CommercialCatalogReadModule {}
