import { Injectable } from '@nestjs/common';
import { CustomerSegment, PersonType, TaxApplicationSnapshot } from '@iwana/shared';

export interface TaxApplicationResolveInput {
  personType: PersonType;
  segment: CustomerSegment;
  stratum?: number;
  municipalityCode?: string;
}

/**
 * Puerto de lectura de aplicaciones tributarias resueltas.
 * Lo exporta TaxationModule hacia CRM, Billing e Inventory.
 *
 * Ref: ADR-082, ADR-031 D3
 */
@Injectable()
export abstract class ITaxApplicationReadPort {
  abstract resolve(input: TaxApplicationResolveInput): Promise<TaxApplicationSnapshot[]>;

  /** True si existe al menos una regla vigente con aplicación activa. */
  abstract hasActiveCoverage(): Promise<boolean>;
}
