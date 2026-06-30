import { Injectable } from '@nestjs/common';

export interface ReplacementRule {
  targetItemId: string;
  targetItemName: string;
  effectiveFrom: Date | null;
  note: string | null;
}

/**
 * Puerto de lectura de compatibilidad comercial.
 * CRM lo consume para mostrar el banner de sustitución al cotizar.
 * CommercialModule implementa este puerto vía CompatibilityService.
 */
@Injectable()
export abstract class CommercialCompatibilityReadPort {
  abstract getReplacementFor(sourceItemId: string): Promise<ReplacementRule | null>;
}
