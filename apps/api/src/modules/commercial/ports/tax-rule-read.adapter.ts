import { Injectable } from '@nestjs/common';
import { CustomerSegment } from '@iwana/shared';
import { TaxRuleReadPort, TaxClassificationSnapshot } from './tax-rule-read.port';
import { TaxClassificationService } from '../services/tax-classification.service';

/**
 * Adaptador que conecta TaxRuleReadPort con TaxClassificationService.
 */
@Injectable()
export class TaxRuleReadAdapter implements TaxRuleReadPort {
  constructor(private readonly taxClassificationService: TaxClassificationService) {}

  async resolve(segment: CustomerSegment, stratum?: number): Promise<TaxClassificationSnapshot> {
    const classification = await this.taxClassificationService.resolveClassification(
      segment,
      stratum,
    );
    return {
      id: classification.id,
      name: classification.name,
      appliesIva: classification.appliesIva,
      appliesRetefuente: classification.appliesRetefuente,
      appliesReteIca: classification.appliesReteIca,
      appliesEstampillas: classification.appliesEstampillas,
    };
  }
}
