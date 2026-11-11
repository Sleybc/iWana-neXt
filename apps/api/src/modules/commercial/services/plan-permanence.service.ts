import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { AuditAction, CatalogItemType, type PlanPermanenceOffer } from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { AuditService } from '../../audit/audit.service';
import { PlanPermanenceOfferReadPort } from '../ports/plan-permanence-offer-read.port';

export function toPlanPermanenceOffer(detail: PlanDetail): PlanPermanenceOffer {
  return {
    connectionFee: Number(detail.connectionFee),
    offersPermanence: detail.offersPermanence,
    months: detail.offersPermanence ? detail.permanenceMonths : null,
    discountedOrDeferredAmount:
      detail.offersPermanence && detail.permanenceDiscountedAmount !== null
        ? Number(detail.permanenceDiscountedAmount)
        : null,
  };
}

/**
 * Cargo por conexión y oferta de permanencia del plan (cierre de venta, bloque H; CA-13).
 * La opción sin permanencia siempre existe: la oferta solo habilita aceptarla en el contrato.
 */
@Injectable()
export class PlanPermanenceService extends PlanPermanenceOfferReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async getOffer(
    planId: string,
    ctx?: { manager: EntityManager },
  ): Promise<PlanPermanenceOffer | null> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const read = async (manager: EntityManager) => {
      const detail = await this.findPlanDetail(manager, tenantId, planId);
      return detail ? toPlanPermanenceOffer(detail) : null;
    };
    if (ctx) return read(ctx.manager);
    return runInTenantSchema(this.dataSource, schemaName, (qr) => read(qr.manager));
  }

  async getOfferOrThrow(planId: string): Promise<PlanPermanenceOffer> {
    const offer = await this.getOffer(planId);
    if (!offer) throw new NotFoundException(`Plan ${planId} no encontrado`);
    return offer;
  }

  /** `offer` ya validado con PlanPermanenceOfferSchema en el borde HTTP. */
  async updateOffer(
    planId: string,
    offer: PlanPermanenceOffer,
    actorId: string,
  ): Promise<PlanPermanenceOffer> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const detail = await this.findPlanDetail(qr.manager, tenantId, planId);
      if (!detail) throw new NotFoundException(`Plan ${planId} no encontrado`);
      const previous = toPlanPermanenceOffer(detail);
      await qr.manager.update(
        PlanDetail,
        { itemId: planId },
        {
          connectionFee: offer.connectionFee.toFixed(2),
          offersPermanence: offer.offersPermanence,
          permanenceMonths: offer.offersPermanence ? offer.months : null,
          permanenceDiscountedAmount:
            offer.offersPermanence && offer.discountedOrDeferredAmount !== null
              ? offer.discountedOrDeferredAmount.toFixed(2)
              : null,
        },
      );
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'PlanPermanenceOffer',
          entityId: planId,
          userId: actorId,
          oldValue: { ...previous },
          newValue: { ...offer },
        },
        qr.manager,
      );
      return offer;
    });
  }

  private async findPlanDetail(
    manager: EntityManager,
    tenantId: string,
    planId: string,
  ): Promise<PlanDetail | null> {
    const item = await manager.findOne(CatalogItem, {
      where: { id: planId, tenantId, type: CatalogItemType.PLAN, deletedAt: IsNull() },
      select: { id: true },
    });
    if (!item) return null;
    return manager.findOne(PlanDetail, { where: { itemId: planId } });
  }
}
