import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import { PlanCatalogReadPort } from '../../commercial/ports/plan-catalog-read.port';
import { Contract } from '../contracts/entities/contract.entity';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { Subscriber } from './entities/subscriber.entity';
import {
  SubscriberServiceContextReadPort,
  type SubscriberServiceContext,
  type SubscriberServiceContractRef,
} from '../ports/subscriber-service-context-read.port';

@Injectable()
export class SubscriberServiceContextReadAdapter extends SubscriberServiceContextReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly planCatalogReadPort: PlanCatalogReadPort,
  ) {
    super();
  }

  async getForSubscriber(subscriberId: string): Promise<SubscriberServiceContext | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const base = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const subscriber = await qr.manager.findOne(Subscriber, {
        where: { id: subscriberId, tenantId },
        select: ['id', 'expedienteId'],
      });
      if (!subscriber) return null;

      const contracts = await qr.manager.find(Contract, {
        where: { tenantId, subscriberId },
        select: ['id', 'alias', 'status', 'planId', 'createdAt'],
        order: { createdAt: 'DESC' },
      });
      const expediente = subscriber.expedienteId
        ? await qr.manager.findOne(ExpedienteRecord, {
            where: { id: subscriber.expedienteId, tenantId },
            select: ['id', 'interestedPlanId'],
          })
        : null;
      const planId =
        expediente?.interestedPlanId ??
        contracts.find((contract) => contract.status === 'ACTIVE')?.planId ??
        contracts[0]?.planId ??
        null;

      return {
        expedienteId: subscriber.expedienteId,
        planId,
        contracts: contracts.map(
          (contract): SubscriberServiceContractRef => ({
            id: contract.id,
            alias: contract.alias,
            status: contract.status,
            planId: contract.planId,
          }),
        ),
      };
    });
    if (!base) return null;

    const plan = base.planId
      ? await this.planCatalogReadPort.getPlanById(tenantId, schemaName, base.planId)
      : null;
    return {
      ...base,
      downloadMbps: plan?.downloadSpeedMbps ?? null,
      uploadMbps: plan?.uploadSpeedMbps ?? null,
    };
  }
}
