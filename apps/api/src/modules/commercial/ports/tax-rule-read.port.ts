import { Injectable } from '@nestjs/common';
import { CustomerSegment } from '@iwana/shared';

export interface TaxClassificationSnapshot {
  id: string;
  name: string;
  appliesIva: boolean;
  appliesRetefuente: boolean;
  appliesReteIca: boolean;
  appliesEstampillas: boolean;
}

/**
 * Puerto de lectura de reglas tributarias.
 * Billing (módulo futuro) lo consume para calcular montos.
 * CommercialModule implementa este puerto vía TaxClassificationService.
 */
@Injectable()
export abstract class TaxRuleReadPort {
  abstract resolve(segment: CustomerSegment, stratum?: number): Promise<TaxClassificationSnapshot>;
}
