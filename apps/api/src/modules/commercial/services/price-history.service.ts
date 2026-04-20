import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CustomerSegment } from '@iwana/shared';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { CreatePriceDto } from '../dto/create-price.dto';
import { COMMERCIAL_EVENTS } from '../events/commercial.events';

@Injectable()
export class PriceHistoryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Retorna el precio vigente para un ítem y segmento.
   * Lanza NotFoundException si no hay precio configurado.
   */
  async getCurrentPrice(itemId: string, segment: CustomerSegment): Promise<CatalogPriceHistory> {
    const { schemaName } = TenantContext.getOrThrow();
    const price = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(CatalogPriceHistory, {
        where: { itemId, customerSegment: segment, isCurrent: true },
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
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(CatalogPriceHistory, {
        where: { itemId },
        order: { validFrom: 'DESC' },
      }),
    );
  }

  /**
   * Crea un nuevo registro de precio (SCD Tipo 2).
   * Dentro de una transacción:
   *   1. Cierra el precio anterior (valid_to = NOW, is_current = false)
   *   2. Inserta el nuevo (valid_from = NOW, is_current = true)
   *   3. Emite evento commercial.price.updated
   *
   * El unique partial index (item_id, customer_segment) WHERE is_current=true
   * actúa como guardia de concurrencia a nivel de BD.
   */
  async createPrice(
    itemId: string,
    dto: CreatePriceDto,
    createdBy: string,
  ): Promise<CatalogPriceHistory> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const now = new Date();

      // Obtener precio anterior (puede no existir)
      const previous = await qr.manager.findOne(CatalogPriceHistory, {
        where: { itemId, customerSegment: dto.customerSegment, isCurrent: true },
      });

      // Si ya existe un precio idéntico, lanzar conflicto en lugar de crear duplicado
      if (
        previous &&
        previous.basePrice === dto.basePrice &&
        previous.installationFee === dto.installationFee
      ) {
        throw new ConflictException(
          `Ya existe un precio vigente idéntico para item ${itemId} en segmento ${dto.customerSegment}`,
        );
      }

      // Cerrar precio anterior
      if (previous) {
        previous.isCurrent = false;
        previous.validTo = now;
        await qr.manager.save(CatalogPriceHistory, previous);
      }

      // Crear nuevo precio vigente
      const newPrice = qr.manager.create(CatalogPriceHistory, {
        itemId,
        customerSegment: dto.customerSegment,
        basePrice: dto.basePrice,
        installationFee: dto.installationFee,
        validFrom: now,
        validTo: null,
        isCurrent: true,
        createdBy,
        createdAt: now,
      });
      await qr.manager.save(CatalogPriceHistory, newPrice);

      // Emitir evento de precio actualizado
      this.eventEmitter.emit(COMMERCIAL_EVENTS.PRICE_UPDATED, {
        itemId,
        segment: dto.customerSegment,
        oldPrice: previous?.basePrice ?? null,
        newPrice: dto.basePrice,
        changedBy: createdBy,
        tenantId,
      });

      return newPrice;
    });
  }
}
