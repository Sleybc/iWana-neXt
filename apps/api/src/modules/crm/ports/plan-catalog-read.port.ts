import { Injectable } from '@nestjs/common';

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

@Injectable()
export abstract class PlanCatalogReadPort {
  abstract getActivePlans(tenantId: string, schemaName: string): Promise<PlanCatalogItem[]>;

  abstract createSnapshot(
    tenantId: string,
    schemaName: string,
    planId: string,
  ): Promise<PlanSnapshot>;
}
