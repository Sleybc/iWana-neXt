import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CustomerSegment } from '@iwana/shared';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { CreatePriceDto } from '../dto/create-price.dto';
import { COMMERCIAL_EVENTS } from '../events/commercial.events';
import { isPostgresUniqueViolation } from '../utils/postgres-unique';

function sameMoney(left: string, right: string): boolean {
  return Number.parseFloat(left) === Number.parseFloat(right);
}

@Injectable()
export class PriceHistoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getCurrentPrice(itemId: string, segment: CustomerSegment): Promise<CatalogPriceHistory> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const price = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(CatalogPriceHistory, {
        where: { itemId, tenantId, customerSegment: segment, isCurrent: true },
      }),
    );
    if (!price) {
      throw new NotFoundException(
        `No hay precio vigente para item ${itemId} en segmento ${segment}`,
      );
    }
    return price;
  }

  async getPriceHistory(itemId: string): Promise<CatalogPriceHistory[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(CatalogPriceHistory, {
        where: { itemId, tenantId },
        order: { validFrom: 'DESC' },
      }),
    );
  }

  async createPrice(
    itemId: string,
    dto: CreatePriceDto,
    createdBy: string,
  ): Promise<CatalogPriceHistory> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    let previousPrice: string | null = null;

    try {
      const newPrice = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const now = new Date();

        const previous = await qr.manager
          .createQueryBuilder(CatalogPriceHistory, 'ph')
          .setLock('pessimistic_write')
          .where('ph.item_id = :itemId', { itemId })
          .andWhere('ph.customer_segment = :segment', { segment: dto.customerSegment })
          .andWhere('ph.is_current = true')
          .andWhere('ph.tenant_id = :tenantId', { tenantId })
          .getOne();

        if (
          previous &&
          sameMoney(previous.basePrice, dto.basePrice) &&
          sameMoney(previous.installationFee, dto.installationFee)
        ) {
          throw new ConflictException(
            `Ya existe un precio vigente idéntico para item ${itemId} en segmento ${dto.customerSegment}`,
          );
        }

        if (previous) {
          previous.isCurrent = false;
          previous.validTo = now;
          await qr.manager.save(CatalogPriceHistory, previous);
          previousPrice = previous.basePrice;
        }

        const created = qr.manager.create(CatalogPriceHistory, {
          itemId,
          tenantId,
          customerSegment: dto.customerSegment,
          basePrice: dto.basePrice,
          installationFee: dto.installationFee,
          validFrom: now,
          validTo: null,
          isCurrent: true,
          createdBy,
          createdAt: now,
        });
        await qr.manager.save(CatalogPriceHistory, created);
        return created;
      });

      this.eventEmitter.emit(COMMERCIAL_EVENTS.PRICE_UPDATED, {
        itemId,
        segment: dto.customerSegment,
        oldPrice: previousPrice,
        newPrice: dto.basePrice,
        changedBy: createdBy,
        tenantId,
      });

      return newPrice;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException(
          `Ya existe un precio vigente para item ${itemId} en segmento ${dto.customerSegment}`,
        );
      }
      throw error;
    }
  }
}
