import { Injectable } from '@nestjs/common';
import { JurisdictionLevel, TaxCategory, TaxContext, TaxOrigin, TaxTreatment } from '@iwana/shared';

/**
 * Snapshot inmutable del catálogo de impuestos expuesto a módulos externos.
 * No expone la entidad TypeORM interna ni sus decoradores.
 * Ref: HLD-MOD07 §5, ADR-029 §D4
 */
export type TaxDefinitionSnapshot = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: TaxCategory;
  readonly jurisdictionLevel: JurisdictionLevel;
  readonly municipalityCode: string | null;
  readonly baseRate: string | null;
  readonly treatment: TaxTreatment;
  readonly context: TaxContext;
  readonly origin: TaxOrigin;
  readonly isActive: boolean;
  readonly notes: string | null;
};

/**
 * Puerto de lectura del catálogo de impuestos.
 * Permite a módulos externos (Commercial, CRM, etc.) consultar definiciones
 * sin acoplarse a la implementación interna ni a la entidad TypeORM de Taxation.
 * Ref: HLD-MOD07 §5, ADR-029
 */
@Injectable()
export abstract class TaxCatalogReadPort {
  /** Busca una definición activa por código único. Retorna null si no existe. */
  abstract findActiveByCode(code: string): Promise<TaxDefinitionSnapshot | null>;

  /**
   * Lista definiciones activas filtrando por contexto de uso.
   * Incluye automáticamente definiciones con context=BOTH.
   */
  abstract listByContext(context: TaxContext): Promise<TaxDefinitionSnapshot[]>;

  /** Resuelve un preset SYSTEM por código (sin filtro isActive). */
  abstract resolveSystemPreset(code: string): Promise<TaxDefinitionSnapshot | null>;

  /**
   * Busca una definición activa por UUID.
   * Usado por TaxApplicationService para enriquecer los snapshots
   * de tax_rule_applications sin cruzar el boundary de entidades.
   * Retorna null si no existe o está inactiva.
   */
  abstract findById(id: string): Promise<TaxDefinitionSnapshot | null>;
}
