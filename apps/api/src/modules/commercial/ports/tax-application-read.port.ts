import { Injectable } from '@nestjs/common';
import { CustomerSegment } from '@iwana/shared';
import { TaxApplicationSnapshot } from '@iwana/shared';

/**
 * Puerto de lectura de aplicaciones tributarias resueltas.
 * Expuesto por CommercialModule hacia CrmModule y BillingModule (futuro).
 *
 * Los consumidores inyectan este token para obtener la lista de impuestos
 * aplicables a un cliente sin acoplarse a la implementación interna de Commercial.
 *
 * Implementado por TaxApplicationService.
 * Ref: HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum §3, ADR-031 §D3
 */
@Injectable()
export abstract class ITaxApplicationReadPort {
  /**
   * Resuelve los impuestos aplicables dado un segmento, estrato y municipio.
   * El feature flag TAXATION_USE_CATALOG controla si usa el nuevo motor
   * de catálogo (TaxationModule) o el motor legacy (TaxClassificationService).
   */
  abstract resolve(
    segment: CustomerSegment,
    stratum?: number,
    municipalityCode?: string,
  ): Promise<TaxApplicationSnapshot[]>;
}
