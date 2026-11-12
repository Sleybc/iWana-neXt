import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';

export interface MigrationTitularLookupInput {
  /** HMAC (PII_HASH_KEY) de los documentos normalizados del lote. */
  documentHmacs: string[];
  /** `external_id` `uisp:client:<id>` del lote. */
  externalIds: string[];
}

export interface MigrationTitularLookupResult {
  /** HMAC que ya corresponde a un titular vigente (suscriptor o expediente). */
  existingHmacs: Set<string>;
  /** `external_id` de suscriptores anonimizados. */
  anonymizedExternalIds: Set<string>;
  /** `external_id` de suscriptores vigentes ya importados. */
  importedExternalIds: Set<string>;
}

/**
 * Puerto del módulo de migración hacia CRM (ADR-110 D11): consulta, dentro de la transacción
 * tenant del llamador, si un titular ya existe o fue anonimizado. Lo implementa CRM; la
 * migración nunca lee sus tablas.
 */
@Injectable()
export abstract class MigrationTitularLookupPort {
  abstract lookup(
    qr: QueryRunner,
    input: MigrationTitularLookupInput,
  ): Promise<MigrationTitularLookupResult>;

  /**
   * Días de ciclo activos en `crm_billing_cycles` (ADR-102). La simulación los usa para
   * anticipar `CICLO_SIN_EQUIVALENCIA` con la misma condición que aplica la promoción.
   */
  abstract activeBillingCycleDays(qr: QueryRunner): Promise<Set<number>>;
}
