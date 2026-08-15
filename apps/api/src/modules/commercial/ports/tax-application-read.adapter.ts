import { Injectable } from '@nestjs/common';
import { CustomerSegment, TaxApplicationSnapshot } from '@iwana/shared';
import { ITaxApplicationReadPort } from './tax-application-read.port';
import { TaxApplicationService } from '../services/tax-application.service';

/**
 * Adaptador de solo lectura del motor tributario comercial.
 * Evita exportar TaxApplicationService (CUD) como token de puerto.
 */
@Injectable()
export class TaxApplicationReadAdapter extends ITaxApplicationReadPort {
  constructor(private readonly taxApplicationService: TaxApplicationService) {
    super();
  }

  resolve(
    segment: CustomerSegment,
    stratum?: number,
    municipalityCode?: string,
  ): Promise<TaxApplicationSnapshot[]> {
    return this.taxApplicationService.resolve(segment, stratum, municipalityCode);
  }
}
