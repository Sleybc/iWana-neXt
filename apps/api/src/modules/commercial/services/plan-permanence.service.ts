import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AuditAction,
  CatalogItemType,
  CustomerSegment,
  type PlanPermanenceOffer,
  type PlanPermanenceOfferUpdate,
} from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { AuditService } from '../../audit/audit.service';
import { PlanPermanenceOfferReadPort } from '../ports/plan-permanence-offer-read.port';

export function toPlanPermanenceOffer(
  detail: PlanDetail,
  installationFee: number | null,
): PlanPermanenceOffer {
  return {
    installationFee,
    offersPermanence: detail.offersPermanence,
    months: detail.offersPermanence ? detail.permanenceMonths : null,
    discountedOrDeferredAmount:
      detail.offersPermanence && detail.permanenceDiscountedAmount !== null
        ? Number(detail.permanenceDiscountedAmount)
        : null,
  };
}

/**
 * Oferta de permanencia del plan (cierre de venta, bloque H; CA-13) sobre el cargo de
 * instalación oficial: `installation_fee` vigente del historial de precios (fase 2, D1).
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
    ctx?: { manager?: EntityManager; segment?: CustomerSegment | null },
  ): Promise<PlanPermanenceOffer | null> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const segment = ctx?.segment ?? CustomerSegment.RESIDENTIAL;
    const read = async (manager: EntityManager) => {
      const detail = await this.findPlanDetail(manager, tenantId, planId);
      if (!detail) return null;
      const fees = await this.currentInstallationFees(manager, tenantId, planId);
      return toPlanPermanenceOffer(detail, fees.get(segment) ?? null);
    };
    if (ctx?.manager) return read(ctx.manager);
    return runInTenantSchema(this.dataSource, schemaName, (qr) => read(qr.manager));
  }

  async getOfferOrThrow(planId: string): Promise<PlanPermanenceOffer> {
    const offer = await this.getOffer(planId);
    if (!offer) throw new NotFoundException(`Plan ${planId} no encontrado`);
    return offer;
  }

  /**
   * `offer` ya validado con PlanPermanenceOfferUpdateSchema en el borde HTTP. Con oferta, el
   * valor descontado no supera el `installation_fee` vigente de ningún segmento del plan.
   */
  async updateOffer(
    planId: string,
    offer: PlanPermanenceOfferUpdate,
    actorId: string,
  ): Promise<PlanPermanenceOffer> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const detail = await this.findPlanDetail(qr.manager, tenantId, planId);
      if (!detail) throw new NotFoundException(`Plan ${planId} no encontrado`);
      const fees = await this.currentInstallationFees(qr.manager, tenantId, planId);
      if (offer.offersPermanence && offer.discountedOrDeferredAmount !== null) {
        if (fees.size === 0) {
          throw new ConflictException({
            code: 'PLAN_INSTALLATION_FEE_REQUIRED',
            message: 'El plan no tiene un cargo de instalación vigente para ofrecer permanencia.',
          });
        }
        const cap = Math.min(...fees.values());
        if (offer.discountedOrDeferredAmount > cap) {
          throw new ConflictException({
            code: 'PERMANENCE_EXCEEDS_INSTALLATION_FEE',
            message: 'El valor descontado no supera el cargo de instalación vigente del plan.',
          });
        }
      }
      const residentialFee = fees.get(CustomerSegment.RESIDENTIAL) ?? null;
      const previous = toPlanPermanenceOffer(detail, residentialFee);
      await qr.manager.update(
        PlanDetail,
        { itemId: planId },
        {
          offersPermanence: offer.offersPermanence,
          permanenceMonths: offer.offersPermanence ? offer.months : null,
          permanenceDiscountedAmount:
            offer.offersPermanence && offer.discountedOrDeferredAmount !== null
              ? offer.discountedOrDeferredAmount.toFixed(2)
              : null,
        },
      );
      const next: PlanPermanenceOffer = {
        installationFee: residentialFee,
        offersPermanence: offer.offersPermanence,
        months: offer.offersPermanence ? offer.months : null,
        discountedOrDeferredAmount: offer.offersPermanence
          ? offer.discountedOrDeferredAmount
          : null,
      };
      await this.auditService.logWithin(
        {
          action: AuditAction.UPDATE,
          entityType: 'PlanPermanenceOffer',
          entityId: planId,
          userId: actorId,
          oldValue: { ...previous },
          newValue: { ...next },
        },
        qr.manager,
      );
      return next;
    });
  }

  /** `installation_fee` vigente por segmento (SCD2: una fila `is_current` por segmento). */
  private async currentInstallationFees(
    manager: EntityManager,
    tenantId: string,
    planId: string,
  ): Promise<Map<CustomerSegment, number>> {
    const rows = await manager.find(CatalogPriceHistory, {
      where: { itemId: planId, tenantId, isCurrent: true },
      select: { customerSegment: true, installationFee: true },
    });
    return new Map(rows.map((row) => [row.customerSegment, Number(row.installationFee)]));
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
