import { Injectable } from '@nestjs/common';
import { TaxApplicationSnapshot } from '@iwana/shared';
import {
  ITaxApplicationReadPort,
  type TaxApplicationResolveInput,
} from './tax-application-read.port';
import { TaxApplicationService } from '../services/tax-application.service';

@Injectable()
export class TaxApplicationReadAdapter extends ITaxApplicationReadPort {
  constructor(private readonly taxApplicationService: TaxApplicationService) {
    super();
  }

  resolve(input: TaxApplicationResolveInput): Promise<TaxApplicationSnapshot[]> {
    return this.taxApplicationService.resolve(input);
  }

  hasActiveCoverage(): Promise<boolean> {
    return this.taxApplicationService.hasActiveCoverage();
  }
}
