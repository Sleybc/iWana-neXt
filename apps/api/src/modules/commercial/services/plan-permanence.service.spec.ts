import { NotFoundException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { AuditAction, PlanPermanenceOfferSchema } from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { PlanPermanenceService, toPlanPermanenceOffer } from './plan-permanence.service';

const TENANT = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  schemaName: 'tenant_x',
  tenantSlug: 'x',
};
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';

function detail(overrides: Partial<PlanDetail> = {}): PlanDetail {
  return Object.assign(new PlanDetail(), {
    itemId: PLAN_ID,
    connectionFee: '150000.00',
    offersPermanence: false,
    permanenceMonths: null,
    permanenceDiscountedAmount: null,
    ...overrides,
  });
}

function build(found: { item: boolean; detail?: PlanDetail }) {
  const manager = {
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === CatalogItem) return found.item ? { id: PLAN_ID } : null;
      return found.detail ?? null;
    }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    createQueryRunner: () => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
      manager,
    }),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new PlanPermanenceService(dataSource as never, audit as never),
    manager,
    audit,
  };
}

const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run(TENANT, fn);

describe('PlanPermanenceService (bloque H)', () => {
  it('lee la oferta sin permanencia y cumple el esquema', async () => {
    const { service } = build({ item: true, detail: detail() });
    const offer = await inTenant(() => service.getOfferOrThrow(PLAN_ID));
    expect(offer).toEqual({
      connectionFee: 150_000,
      offersPermanence: false,
      months: null,
      discountedOrDeferredAmount: null,
    });
    expect(PlanPermanenceOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('lee la oferta con permanencia', () => {
    expect(
      toPlanPermanenceOffer(
        detail({
          offersPermanence: true,
          permanenceMonths: 6,
          permanenceDiscountedAmount: '90000.50',
        }),
      ),
    ).toEqual({
      connectionFee: 150_000,
      offersPermanence: true,
      months: 6,
      discountedOrDeferredAmount: 90_000.5,
    });
  });

  it('404 si el plan no está en el tenant', async () => {
    const { service } = build({ item: false });
    await expect(inTenant(() => service.getOfferOrThrow(PLAN_ID))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getOffer devuelve null si no hay plan', async () => {
    const { service } = build({ item: false });
    await expect(inTenant(() => service.getOffer(PLAN_ID))).resolves.toBeNull();
  });

  it('actualiza y audita con valor anterior y nuevo', async () => {
    const { service, manager, audit } = build({ item: true, detail: detail() });
    const offer = {
      connectionFee: 200_000,
      offersPermanence: true,
      months: 12,
      discountedOrDeferredAmount: 120_000,
    };
    await inTenant(() => service.updateOffer(PLAN_ID, offer, ACTOR));
    expect(manager.update).toHaveBeenCalledWith(
      PlanDetail,
      { itemId: PLAN_ID },
      {
        connectionFee: '200000.00',
        offersPermanence: true,
        permanenceMonths: 12,
        permanenceDiscountedAmount: '120000.00',
      },
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'PlanPermanenceOffer',
        entityId: PLAN_ID,
        userId: ACTOR,
        newValue: offer,
      }),
      manager,
    );
  });

  it('sin oferta guarda meses y valor en null', async () => {
    const { service, manager } = build({ item: true, detail: detail() });
    await inTenant(() =>
      service.updateOffer(
        PLAN_ID,
        {
          connectionFee: 0,
          offersPermanence: false,
          months: null,
          discountedOrDeferredAmount: null,
        },
        ACTOR,
      ),
    );
    expect(manager.update.mock.calls[0][2]).toMatchObject({
      permanenceMonths: null,
      permanenceDiscountedAmount: null,
    });
  });

  it('404 al actualizar un plan ajeno', async () => {
    const { service, audit } = build({ item: false });
    await expect(
      inTenant(() =>
        service.updateOffer(
          PLAN_ID,
          {
            connectionFee: 0,
            offersPermanence: false,
            months: null,
            discountedOrDeferredAmount: null,
          },
          ACTOR,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  describe('límites del esquema en el borde HTTP', () => {
    it.each([
      [{ connectionFee: 100, offersPermanence: true, months: 13, discountedOrDeferredAmount: 50 }],
      [{ connectionFee: 100, offersPermanence: true, months: 0, discountedOrDeferredAmount: 50 }],
      [{ connectionFee: 100, offersPermanence: true, months: 6, discountedOrDeferredAmount: 101 }],
      [{ connectionFee: 100, offersPermanence: true, months: 6, discountedOrDeferredAmount: 0 }],
      [
        {
          connectionFee: 100,
          offersPermanence: false,
          months: 6,
          discountedOrDeferredAmount: null,
        },
      ],
      [
        {
          connectionFee: -1,
          offersPermanence: false,
          months: null,
          discountedOrDeferredAmount: null,
        },
      ],
    ])('rechaza %j', (body) => {
      expect(PlanPermanenceOfferSchema.safeParse(body).success).toBe(false);
    });

    it('acepta 12 meses con valor igual al cargo', () => {
      expect(
        PlanPermanenceOfferSchema.safeParse({
          connectionFee: 100,
          offersPermanence: true,
          months: 12,
          discountedOrDeferredAmount: 100,
        }).success,
      ).toBe(true);
    });
  });
});
