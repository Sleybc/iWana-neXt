import { Injectable } from '@nestjs/common';
import { CustomerSegment } from '@iwana/shared';

/**
 * Snapshot inmutable del catálogo comercial consumido por CRM.
 * En la versión actual el contrato se centra en planes para mantener
 * compatibilidad con Quotes, Potentials y Prospects mientras el puerto
 * legacy queda como alias de transición.
 */
export interface CommercialItemSnapshot {
  planId: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  technology: string;
  /** Precio mensual vigente para el segmento consultado */
  monthlyPrice: number;
  installationFee: number;
  snapshotAt: Date;
}

export interface CommercialCatalogItem {
  id: string;
  name: string;
  technology: string;
  downloadSpeedMbps: number;
  uploadSpeedMbps: number;
  basePrice: number;
  installationFee: number;
  isActive: boolean;
}

/**
 * Puerto de lectura del catálogo comercial.
 *
 * Implementado por CommercialCatalogReadAdapter en CommercialModule.
 * Consumido por CrmModule (Quotes, Potentials, Contracts).
 *
 * BOUNDARY: CRM no importa servicios de Commercial directamente —
 * solo consume este puerto registrado como provider.
 */
@Injectable()
export abstract class CommercialCatalogReadPort {
  /**
   * Retorna los planes activos del tenant.
   * Compatibilidad hacia atrás con PlanCatalogReadPort.
   */
  abstract getActivePlans(tenantId: string, schemaName: string): Promise<CommercialCatalogItem[]>;

  /**
   * Crea un snapshot inmutable del ítem para ser guardado en cotizaciones/contratos.
   */
  abstract createSnapshot(
    tenantId: string,
    schemaName: string,
    itemId: string,
    segment?: CustomerSegment,
  ): Promise<CommercialItemSnapshot>;
}
