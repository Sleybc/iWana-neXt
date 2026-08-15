import { Injectable } from '@nestjs/common';
import { CustomerSegment } from '@iwana/shared';

export interface PlanSnapshot {
  planId: string;
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  monthlyPrice: number;
  installationFee: number;
  technology: string;
  snapshotAt: Date;
}

export interface PlanCatalogItem {
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
 * Token de lectura de planes. Owner: CommercialModule.
 * CRM re-exporta este archivo para no romper imports existentes.
 */
@Injectable()
export abstract class PlanCatalogReadPort {
  abstract getActivePlans(tenantId: string, schemaName: string): Promise<PlanCatalogItem[]>;

  abstract getPlanById(
    tenantId: string,
    schemaName: string,
    planId: string,
  ): Promise<PlanCatalogItem | null>;

  abstract createSnapshot(
    tenantId: string,
    schemaName: string,
    planId: string,
    /** Aditivo. Default documentado: RESIDENTIAL. */
    segment?: CustomerSegment,
  ): Promise<PlanSnapshot>;
}
