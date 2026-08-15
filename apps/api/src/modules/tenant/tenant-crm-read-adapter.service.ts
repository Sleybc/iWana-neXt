import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema } from '@iwana/db';
import { CoverageReadPort, type CoverageNode } from '../crm/ports/coverage-read.port';
import {
  PlanCatalogReadPort,
  type PlanCatalogItem,
  type PlanSnapshot,
} from '../crm/ports/plan-catalog-read.port';
import { CommercialNode } from './entities/commercial-node.entity';
import { CoverageZone } from './entities/coverage-zone.entity';
import { PlanCatalogItem as TenantPlanCatalogItem } from './entities/plan-catalog-item.entity';

@Injectable()
export class TenantCoverageReadAdapter extends CoverageReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async checkAvailability(
    tenantId: string,
    schemaName: string,
    address: string,
    coordinates?: { lat: number; lng: number },
  ): Promise<{ available: boolean; nodes: CoverageNode[] }> {
    const nodes = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const commercialNodes = await qr.manager.find(CommercialNode, {
        where: { tenantId, isActive: true },
      });
      const coverageZones = await qr.manager.find(CoverageZone, {
        where: { tenantId, isActive: true },
      });

      const mappedNodes: CoverageNode[] = commercialNodes.map((item) => ({
        id: item.id,
        name: item.name,
        type: 'NODE',
        available: true,
      }));

      const mappedZones: CoverageNode[] = coverageZones.map((item) => ({
        id: item.id,
        name: item.name,
        type: 'ZONE',
        available: true,
      }));

      if (!coordinates) {
        return [...mappedNodes, ...mappedZones];
      }

      return [...mappedNodes, ...mappedZones].filter((item) => item.available);
    });

    return {
      available: nodes.length > 0,
      nodes,
    };
  }
}

@Injectable()
export class TenantPlanCatalogReadAdapter extends PlanCatalogReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getActivePlans(tenantId: string, schemaName: string): Promise<PlanCatalogItem[]> {
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const items = await qr.manager.find(TenantPlanCatalogItem, {
        where: { tenantId, isActive: true },
        order: { createdAt: 'DESC' },
      });

      return items.map((item) => ({
        id: item.id,
        name: item.name,
        technology: item.technology,
        downloadSpeedMbps: item.downloadSpeedMbps,
        uploadSpeedMbps: item.uploadSpeedMbps,
        basePrice: Number(item.basePrice),
        installationFee: Number(item.installationFee),
        isActive: item.isActive,
      }));
    });
  }

  async getPlanById(
    tenantId: string,
    schemaName: string,
    planId: string,
  ): Promise<PlanCatalogItem | null> {
    const plans = await this.getActivePlans(tenantId, schemaName);
    return plans.find((item) => item.id === planId) ?? null;
  }

  async createSnapshot(
    tenantId: string,
    schemaName: string,
    planId: string,
  ): Promise<PlanSnapshot> {
    const selectedPlan = await this.getPlanById(tenantId, schemaName, planId);
    if (!selectedPlan) {
      throw new Error('No existen planes activos para crear snapshot.');
    }

    return {
      planId: selectedPlan.id,
      name: selectedPlan.name,
      downloadSpeed: selectedPlan.downloadSpeedMbps,
      uploadSpeed: selectedPlan.uploadSpeedMbps,
      monthlyPrice: selectedPlan.basePrice,
      installationFee: selectedPlan.installationFee,
      technology: selectedPlan.technology,
      snapshotAt: new Date(),
    };
  }
}
