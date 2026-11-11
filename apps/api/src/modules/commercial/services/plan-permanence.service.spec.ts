import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import {
  AuditAction,
  CustomerSegment,
  PlanPermanenceOfferSchema,
  PlanPermanenceOfferUpdateSchema,
} from '@iwana/shared';
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
    offersPermanence: false,
    permanenceMonths: null,
    permanenceDiscountedAmount: null,
    ...overrides,
  });
}

type PriceRow = { customerSegment: CustomerSegment; installationFee: string };
const DEFAULT_PRICES: PriceRow[] = [
  { customerSegment: CustomerSegment.RESIDENTIAL, installationFee: '150000.00' },
  { customerSegment: CustomerSegment.PYME, installationFee: '200000.00' },
];

function build(found: { item: boolean; detail?: PlanDetail; prices?: PriceRow[] }) {
  const manager = {
    findOne: jest.fn(async (entity: unknown) => {
      if (entity === CatalogItem) return found.item ? { id: PLAN_ID } : null;
      return found.detail ?? null;
    }),
    find: jest.fn(async () => found.prices ?? DEFAULT_PRICES),
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
const NO_OFFER = { offersPermanence: false, months: null, discountedOrDeferredAmount: null };

describe('PlanPermanenceService (bloque H; fase 2 D1: installation_fee)', () => {
  it('lee la oferta con el installation_fee vigente RESIDENTIAL y cumple el esquema', async () => {
    const { service } = build({ item: true, detail: detail() });
    const offer = await inTenant(() => service.getOfferOrThrow(PLAN_ID));
    expect(offer).toEqual({ installationFee: 150_000, ...NO_OFFER });
    expect(PlanPermanenceOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('lee el installation_fee del segmento pedido', async () => {
    const { service } = build({ item: true, detail: detail() });
    const offer = await inTenant(() =>
      service.getOffer(PLAN_ID, { segment: CustomerSegment.PYME }),
    );
    expect(offer?.installationFee).toBe(200_000);
  });

  it('sin precio vigente para el segmento, installationFee null', async () => {
    const { service } = build({ item: true, detail: detail(), prices: [] });
    const offer = await inTenant(() => service.getOffer(PLAN_ID));
    expect(offer?.installationFee).toBeNull();
  });

  it('reutiliza el manager del llamante', async () => {
    const { service, manager } = build({ item: true, detail: detail() });
    const offer = await inTenant(() => service.getOffer(PLAN_ID, { manager: manager as never }));
    expect(offer?.installationFee).toBe(150_000);
    expect(manager.find).toHaveBeenCalled();
  });

  it('lee la oferta con permanencia', () => {
    expect(
      toPlanPermanenceOffer(
        detail({
          offersPermanence: true,
          permanenceMonths: 6,
          permanenceDiscountedAmount: '90000.50',
        }),
        150_000,
      ),
    ).toEqual({
      installationFee: 150_000,
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

  it('actualiza sin tocar el cargo y audita con valor anterior y nuevo', async () => {
    const { service, manager, audit } = build({ item: true, detail: detail() });
    const offer = { offersPermanence: true, months: 12, discountedOrDeferredAmount: 120_000 };
    const result = await inTenant(() => service.updateOffer(PLAN_ID, offer, ACTOR));
    expect(result).toEqual({ installationFee: 150_000, ...offer });
    expect(manager.update).toHaveBeenCalledWith(
      PlanDetail,
      { itemId: PLAN_ID },
      { offersPermanence: true, permanenceMonths: 12, permanenceDiscountedAmount: '120000.00' },
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'PlanPermanenceOffer',
        entityId: PLAN_ID,
        userId: ACTOR,
        oldValue: { installationFee: 150_000, ...NO_OFFER },
        newValue: { installationFee: 150_000, ...offer },
      }),
      manager,
    );
  });

  it('acepta el valor igual al menor installation_fee vigente', async () => {
    const { service } = build({ item: true, detail: detail() });
    await expect(
      inTenant(() =>
        service.updateOffer(
          PLAN_ID,
          { offersPermanence: true, months: 6, discountedOrDeferredAmount: 150_000 },
          ACTOR,
        ),
      ),
    ).resolves.toMatchObject({ discountedOrDeferredAmount: 150_000 });
  });

  it('409 si el valor supera el installation_fee vigente de algún segmento', async () => {
    const { service, manager, audit } = build({ item: true, detail: detail() });
    const error = await inTenant(() =>
      service.updateOffer(
        PLAN_ID,
        { offersPermanence: true, months: 6, discountedOrDeferredAmount: 150_000.01 },
        ACTOR,
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PERMANENCE_EXCEEDS_INSTALLATION_FEE',
    });
    expect(manager.update).not.toHaveBeenCalled();
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('409 si el plan no tiene installation_fee vigente y ofrece permanencia', async () => {
    const { service } = build({ item: true, detail: detail(), prices: [] });
    const error = await inTenant(() =>
      service.updateOffer(
        PLAN_ID,
        { offersPermanence: true, months: 6, discountedOrDeferredAmount: 1 },
        ACTOR,
      ),
    ).catch((caught: unknown) => caught);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PLAN_INSTALLATION_FEE_REQUIRED',
    });
  });

  it('sin oferta guarda meses y valor en null aunque no haya precio vigente', async () => {
    const { service, manager } = build({ item: true, detail: detail(), prices: [] });
    await inTenant(() => service.updateOffer(PLAN_ID, NO_OFFER, ACTOR));
    expect(manager.update.mock.calls[0][2]).toEqual({
      offersPermanence: false,
      permanenceMonths: null,
      permanenceDiscountedAmount: null,
    });
  });

  it('404 al actualizar un plan ajeno', async () => {
    const { service, audit } = build({ item: false });
    await expect(
      inTenant(() => service.updateOffer(PLAN_ID, NO_OFFER, ACTOR)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  describe('límites del esquema de edición en el borde HTTP', () => {
    it.each([
      [{ offersPermanence: true, months: 13, discountedOrDeferredAmount: 50 }],
      [{ offersPermanence: true, months: 0, discountedOrDeferredAmount: 50 }],
      [{ offersPermanence: true, months: 6, discountedOrDeferredAmount: 0 }],
      [{ offersPermanence: false, months: 6, discountedOrDeferredAmount: null }],
      [{ connectionFee: 100, ...NO_OFFER }],
      [{ installationFee: 100, ...NO_OFFER }],
    ])('rechaza %j', (body) => {
      expect(PlanPermanenceOfferUpdateSchema.safeParse(body).success).toBe(false);
    });

    it('acepta 12 meses con valor', () => {
      expect(
        PlanPermanenceOfferUpdateSchema.safeParse({
          offersPermanence: true,
          months: 12,
          discountedOrDeferredAmount: 100,
        }).success,
      ).toBe(true);
    });
  });
});
