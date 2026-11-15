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
  /**
   * HMAC → id del suscriptor vigente (sin baja ni anonimización) que coincide. Solo
   * suscriptores, nunca expedientes; con varios, el más antiguo.
   */
  subscriberIdByHmac: Map<string, string>;
  /** Candidatos de `subscriberIdByHmac` con datos bloqueados (`DATOS_BLOQUEADOS` vigente). */
  restrictedSubscriberIds: Set<string>;
  /** `external_id` actual de cada candidato de `subscriberIdByHmac` (`null` si no tiene). */
  externalIdBySubscriber: Map<string, string | null>;
}

/** Suscriptor destino de una equivalencia `TITULAR` (spec 2026-11-15 §2.1). */
export interface MigrationTitularTarget {
  subscriberId: string;
  externalId: string | null;
  /** Datos bloqueados por privacidad (`privacyRestricted` de CRM). */
  restricted: boolean;
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
   * Suscriptor vigente (sin baja ni anonimización) destino de una equivalencia `TITULAR`;
   * `null` si no existe en el tenant.
   */
  abstract titularTarget(
    qr: QueryRunner,
    subscriberId: string,
  ): Promise<MigrationTitularTarget | null>;

  /**
   * Días de ciclo activos en `crm_billing_cycles` (ADR-102). La simulación los usa para
   * anticipar `CICLO_SIN_EQUIVALENCIA` con la misma condición que aplica la promoción.
   */
  abstract activeBillingCycleDays(qr: QueryRunner): Promise<Set<number>>;
}
