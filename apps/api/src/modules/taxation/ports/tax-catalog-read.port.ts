import { Injectable } from '@nestjs/common';
import { TaxDefinition } from '../entities/tax-definition.entity';

/**
 * Puerto de lectura del catálogo de impuestos.
 * Permite a módulos externos (Commercial, CRM, etc.) leer definiciones
 * de impuestos sin acoplarse a la implementación interna de Taxation.
 * Ref: HLD-MOD07 §5, ADR-030
 */
@Injectable()
export abstract class ITaxCatalogReadPort {
  /** Busca una definición activa por su código único. Retorna null si no existe. */
  abstract findActiveByCode(code: string): Promise<TaxDefinition | null>;

  /** Lista todas las definiciones activas del catálogo del tenant. */
  abstract findAllActive(): Promise<TaxDefinition[]>;
}
