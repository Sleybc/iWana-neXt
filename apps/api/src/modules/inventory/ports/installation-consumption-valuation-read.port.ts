import { Injectable } from '@nestjs/common';
import type { CustomerSegment } from '@iwana/shared';

/**
 * Datos de un artículo de inventario para valorar el consumo de una instalación (spec MOD14
 * 2026-11-13 R2). MOD12 resuelve su vínculo con el producto comercial; el caller aplica la regla.
 */
export interface InventoryItemValuation {
  itemId: string;
  name: string;
  unitOfMeasure: string;
  /** Costo promedio de inventario en texto (numeric 14,5); null si es cero o no existe. */
  averageCost: string | null;
  /** Producto comercial vinculado (MOD06), si existe en el catálogo. */
  commercialProduct: {
    id: string;
    name: string;
    isLoan: boolean;
    /** Precio base vigente para el segmento pedido; null sin precio vigente. */
    currentBasePrice: string | null;
  } | null;
}

@Injectable()
export abstract class InstallationConsumptionValuationReadPort {
  /** Artículos pedidos del tenant actual; omite identificadores inexistentes o inválidos. */
  abstract describeItems(
    itemIds: string[],
    segment: CustomerSegment,
  ): Promise<InventoryItemValuation[]>;
}
