import { ConflictException, Injectable } from '@nestjs/common';
import { QueryFailedError, type EntityManager } from 'typeorm';
import { StockLocation } from '@iwana/db';
import {
  StockLocationStatus,
  StockLocationType,
  resolveNextStockLocationCode,
} from '@iwana/shared';

const LOCATION_CODE_RETRY_LIMIT = 10;

function isUniqueViolation(
  error: unknown,
): error is QueryFailedError & { driverError?: { code?: string } } {
  return error instanceof QueryFailedError && error.driverError?.code === '23505';
}

@Injectable()
export class CustomerSiteLocationResolver {
  async resolveOrCreateWithManager(
    manager: EntityManager,
    tenantId: string,
    subscriberId: string,
    label?: string,
  ): Promise<string> {
    const existing = await manager.findOne(StockLocation, {
      where: {
        tenantId,
        type: StockLocationType.CUSTOMER_SITE,
        status: StockLocationStatus.ACTIVE,
        responsibleRefId: subscriberId,
      },
    });

    if (existing) {
      return existing.id;
    }

    const existingCodes = await this.loadTenantLocationCodes(manager, tenantId);
    const normalizedLabel = label?.trim();
    const name =
      normalizedLabel && normalizedLabel.length > 0
        ? normalizedLabel
        : `Sitio ${subscriberId.slice(0, 8)}`;

    for (let attempt = 0; attempt < LOCATION_CODE_RETRY_LIMIT; attempt += 1) {
      const code = resolveNextStockLocationCode(
        existingCodes,
        StockLocationType.CUSTOMER_SITE,
        attempt,
      );

      try {
        const created = await manager.save(
          StockLocation,
          manager.create(StockLocation, {
            tenantId,
            code,
            name,
            type: StockLocationType.CUSTOMER_SITE,
            status: StockLocationStatus.ACTIVE,
            responsibleRefId: subscriberId,
            maxCapacity: null,
          }),
        );

        return created.id;
      } catch (error) {
        const sameSubscriberLocation = await manager.findOne(StockLocation, {
          where: {
            tenantId,
            type: StockLocationType.CUSTOMER_SITE,
            status: StockLocationStatus.ACTIVE,
            responsibleRefId: subscriberId,
          },
        });

        if (sameSubscriberLocation) {
          return sameSubscriberLocation.id;
        }

        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }

    throw new ConflictException(
      'No fue posible resolver una ubicación CUSTOMER_SITE para el suscriptor.',
    );
  }

  private async loadTenantLocationCodes(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string[]> {
    const rows = await manager
      .createQueryBuilder(StockLocation, 'location')
      .select('location.code', 'code')
      .where('location.tenant_id = :tenantId', { tenantId })
      .getRawMany<{ code: string }>();

    return rows.map((row) => row.code);
  }
}
