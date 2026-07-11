import { Injectable } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import {
  CommercialCatalogReadPort,
  CommercialProductReference,
} from '../../commercial/ports/commercial-catalog-read.port';

/**
 * Puerto de lectura de referencias comerciales consumido por MOD12 Inventario.
 * Delega en CommercialCatalogReadPort sin acceder a tablas de MOD06.
 */
@Injectable()
export abstract class CommercialProductReferencePort {
  abstract getActiveProducts(): Promise<CommercialProductReference[]>;

  abstract resolveProductReference(productId: string): Promise<CommercialProductReference | null>;
}

@Injectable()
export class CommercialProductReferencePortAdapter extends CommercialProductReferencePort {
  constructor(private readonly commercialCatalogReadPort: CommercialCatalogReadPort) {
    super();
  }

  async getActiveProducts(): Promise<CommercialProductReference[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return this.commercialCatalogReadPort.getActiveProducts(tenantId, schemaName);
  }

  async resolveProductReference(productId: string): Promise<CommercialProductReference | null> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    return this.commercialCatalogReadPort.resolveProductReference(tenantId, schemaName, productId);
  }
}
