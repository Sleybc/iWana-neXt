import { Injectable } from '@nestjs/common';
import {
  CommercialCompatibilityReadPort,
  ReplacementRule,
} from './commercial-compatibility-read.port';
import { CompatibilityService } from '../services/compatibility.service';

/**
 * Adaptador que conecta CommercialCompatibilityReadPort con CompatibilityService.
 */
@Injectable()
export class CommercialCompatibilityReadAdapter implements CommercialCompatibilityReadPort {
  constructor(private readonly compatibilityService: CompatibilityService) {}

  async getReplacementFor(sourceItemId: string): Promise<ReplacementRule | null> {
    return this.compatibilityService.getReplacementFor(sourceItemId);
  }
}
