import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, ValidateNested } from 'class-validator';
import { z } from 'zod';
import {
  ExecutionOrderItemAction,
  GoodsReceiptStatus,
  InventoryBarcodeType,
  InventoryDisposition,
  InventoryCategoryStatus,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  PurchaseOrderStatus,
  PurchaseRequestFulfillmentStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestStatus,
  PurchaseRequestPriority,
  PurchaseRequestType,
  SerializedAssetStatus,
  StockAdjustmentReason,
  StockBalanceCondition,
  StockCountStatus,
  StockIssueStatus,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
  StockMovementOrigin,
  WriteOffReason,
  WriteOffStatus,
  PartyType,
  DocumentTypeParty,
  PartyContactType,
  SupplierProfileStatus,
  IncotermCode,
  TaxQuoteEffect,
  QuoteShippingArrangement,
  INVENTORY_UNIT_OF_MEASURE_CODES,
  INVENTORY_UNITS_OF_MEASURE,
  areInventoryUnitsDimensionallyCompatible,
  buildDimensionalMismatchMessage,
  isInventoryUnitOfMeasureCode,
  validateBarcodeValue,
  INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
} from '@iwana/shared';
import type { InventoryUnitOfMeasureCode } from '@iwana/shared';
import {
  INVENTORY_LIST_DEFAULT_LIMIT,
  INVENTORY_LIST_MAX_LIMIT,
  inventoryHybridPaginationZod,
  inventoryListPaginationZod,
} from '../../../common/pagination';

const emptyStringToNull = (value: unknown) => (value === '' ? null : value);

/** Meta de listado paginado cursor (ADR-064) — documentado en OpenAPI. */
export class InventoryListMetaDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Cursor para la siguiente página; null si no hay más resultados',
    example: null,
  })
  nextCursor!: string | null;

  @ApiProperty({
    description: 'Total del conjunto filtrado (sin aplicar cursor)',
    example: 128,
  })
  total!: number;
}

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(emptyStringToNull, z.string().trim().max(maxLength).optional().nullable());

/**
 * Código de barras (MOD12 · F4 · PRD §11 regla 1): cadena vacía o compuesta
 * solo por blancos equivale a ausencia (convención `emptyStringToNull` del
 * módulo); si hay valor se recorta y se limita a 64 caracteres. La regla
 * «van juntos» y la validación por formato viven en `refineInventoryItemMaster`.
 */
const optionalBarcodeSchema = z.preprocess((value: unknown) => {
  if (value === '') {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  return value;
}, z.string().trim().max(64).optional().nullable());
const optionalUuidLike = (maxLength = 160) =>
  z.preprocess(emptyStringToNull, z.string().trim().min(1).max(maxLength).optional().nullable());
const optionalDateString = z.preprocess(emptyStringToNull, z.string().date().optional().nullable());
const positiveNumber = z.coerce.number().positive();
const nonNegativeNumber = z.coerce.number().min(0);

/**
 * Pertenencia al catálogo canónico de unidades (ADR-085 D1 · F5a).
 * La validación dimensional entre unidad base y de compra (D2) es F5b:
 * aquí solo se exige que cada valor exista en el catálogo.
 */
const INVENTORY_UOM_CATALOG_OPTIONS = INVENTORY_UNITS_OF_MEASURE.map(
  (unit) => `${unit.code} (${unit.label})`,
).join(', ');
const INVALID_UNIT_OF_MEASURE_MESSAGE =
  `La unidad de medida no pertenece al catálogo canónico. ` +
  `Usa una de: ${INVENTORY_UOM_CATALOG_OPTIONS}.`;
const INVALID_PURCHASE_UNIT_OF_MEASURE_MESSAGE =
  `La unidad de compra no pertenece al catálogo canónico. ` +
  `Usa una de: ${INVENTORY_UOM_CATALOG_OPTIONS}.`;

const inventoryUnitOfMeasureSchema = z
  .string()
  .trim()
  .max(32)
  .refine((value): value is InventoryUnitOfMeasureCode => isInventoryUnitOfMeasureCode(value), {
    message: INVALID_UNIT_OF_MEASURE_MESSAGE,
  });

/** Blanco o vacío equivale a ausencia, como antes; si hay valor debe ser del catálogo. */
const optionalInventoryUnitOfMeasureSchema = z.preprocess(
  (value: unknown) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  },
  z
    .string()
    .max(32)
    .refine((value): value is InventoryUnitOfMeasureCode => isInventoryUnitOfMeasureCode(value), {
      message: INVALID_PURCHASE_UNIT_OF_MEASURE_MESSAGE,
    })
    .optional()
    .nullable(),
);

const optionalQueryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
  .optional();

export const ListInventoryItemsQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  category: z.nativeEnum(InventoryItemCategory).optional(),
  itemKind: z.nativeEnum(InventoryItemKind).optional(),
  trackingMode: z.nativeEnum(InventoryTrackingMode).optional(),
  status: z.nativeEnum(InventoryItemStatus).optional(),
  purchasable: optionalQueryBoolean,
  preferredSupplierRefId: z.string().uuid().optional(),
  commercialReferenceId: z.string().uuid().optional(),
  /** ADR-065 Ola 6: equivalentes a «solo bajo mínimo» del overview (agotado ∪ bajo mínimo). */
  belowMinimum: optionalQueryBoolean,
  /** Alcance de agregación de saldos para `belowMinimum` (bodega opcional). */
  stockLocationId: z.string().uuid().optional(),
  ...inventoryHybridPaginationZod,
});

export type ListInventoryItemsQueryInput = z.input<typeof ListInventoryItemsQuerySchema>;

/** Query E-4 typeahead — máx. 20; FE mapea a SearchablePickerSearchResult. */
export const InventoryPickerSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(20).optional().default(20),
  ),
  status: z.nativeEnum(InventoryItemStatus).optional(),
});

export type InventoryPickerSearchQueryInput = z.input<typeof InventoryPickerSearchQuerySchema>;

export class InventoryPickerSearchQueryDto {
  @ApiPropertyOptional({ description: 'Texto typeahead (nombre / SKU / marca / modelo)' })
  @Allow()
  q?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 20 })
  @Allow()
  limit?: number;

  @ApiPropertyOptional({ enum: InventoryItemStatus })
  @Allow()
  status?: InventoryItemStatus;
}

export class ListInventoryItemsQueryDto {
  @ApiPropertyOptional()
  @Allow()
  search?: string;

  @ApiPropertyOptional()
  @Allow()
  categoryId?: string;

  @ApiPropertyOptional({ enum: InventoryItemCategory })
  @Allow()
  category?: InventoryItemCategory;

  @ApiPropertyOptional({ enum: InventoryItemKind })
  @Allow()
  itemKind?: InventoryItemKind;

  @ApiPropertyOptional({ enum: InventoryTrackingMode })
  @Allow()
  trackingMode?: InventoryTrackingMode;

  @ApiPropertyOptional({ enum: InventoryItemStatus })
  @Allow()
  status?: InventoryItemStatus;

  @ApiPropertyOptional()
  @Allow()
  purchasable?: boolean;

  @ApiPropertyOptional()
  @Allow()
  preferredSupplierRefId?: string;

  @ApiPropertyOptional({ description: 'UUID de producto adicional comercial (MOD06)' })
  @Allow()
  commercialReferenceId?: string;

  @ApiPropertyOptional({
    description:
      'Si true, solo ítems con disponible ≤ 0 o disponible < minimumStock (agregado de saldos). ' +
      'Desbloquea StockByProductTable sin filtrar en cliente sobre buffer paginado (ADR-065 Ola 6).',
  })
  @Allow()
  belowMinimum?: boolean;

  @ApiPropertyOptional({
    description: 'Bodega para agregar saldos al evaluar `belowMinimum` (opcional).',
    format: 'uuid',
  })
  @Allow()
  stockLocationId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Página 1-based (ADR-065 Ola 6). Excluyente con `cursor`. Sin `page` ni `cursor` = primera página keyset.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

const inventoryItemMasterFields = {
  sku: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: optionalTrimmedString(2000),
  brand: optionalTrimmedString(120),
  model: optionalTrimmedString(120),
  itemKind: z.nativeEnum(InventoryItemKind).optional().default(InventoryItemKind.STOCK),
  categoryId: z.string().uuid().optional(),
  category: z.nativeEnum(InventoryItemCategory).optional(),
  trackingMode: z.nativeEnum(InventoryTrackingMode),
  unitOfMeasure: inventoryUnitOfMeasureSchema,
  baseCost: nonNegativeNumber.default(0),
  minimumStock: nonNegativeNumber.default(0),
  purchasable: z.boolean().optional().default(true),
  inventoryControlled: z.boolean().optional().default(true),
  assetControlled: z.boolean().optional(),
  preferredSupplierRefId: z.string().uuid().optional().nullable(),
  supplierSku: optionalTrimmedString(80),
  purchaseUnitOfMeasure: optionalInventoryUnitOfMeasureSchema,
  purchaseToBaseUomFactor: positiveNumber.optional().nullable(),
  standardCost: nonNegativeNumber.optional().default(0),
  lastPurchaseCost: nonNegativeNumber.optional().nullable(),
  averageCost: nonNegativeNumber.optional().default(0),
  reorderPoint: nonNegativeNumber.optional().default(0),
  targetStock: nonNegativeNumber.optional().default(0),
  minimumOrderQty: positiveNumber.optional().nullable(),
  orderMultiple: positiveNumber.optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  usefulLifeMonths: z.coerce.number().int().positive().optional().nullable(),
  commercialReferenceId: optionalTrimmedString(160),
  /**
   * Código de barras del artículo (MOD12 · F4 · PRD §11). Opcional y editable.
   * La validación por formato (dígito de control EAN13/UPCA) y la regla de
   * consistencia «barcode y barcode_type van juntos» viven en
   * `refineInventoryItemMaster`: la barrera es el backend.
   */
  barcode: optionalBarcodeSchema,
  barcodeType: z.nativeEnum(InventoryBarcodeType).optional().nullable(),
  status: z.nativeEnum(InventoryItemStatus).optional().default(InventoryItemStatus.ACTIVE),
};

/**
 * Fase S2 · CA-S2-01 (copy aprobado G1, spec §A5.1): nombra los campos como los
 * ve el operador — nunca los enums crudos. Fuente única en `@iwana/shared`
 * (`inventory/inventory-item-kind-tracking.ts`); el portal la re-exporta desde
 * `inventory-labels.ts`.
 */

function refineInventoryItemMaster<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const input = value as {
      unitOfMeasure?: string | null;
      purchaseUnitOfMeasure?: string | null;
      purchaseToBaseUomFactor?: number | null;
      itemKind?: InventoryItemKind;
      trackingMode: InventoryTrackingMode;
      assetControlled?: boolean;
      reorderPoint?: number;
      /** MOD12 · F4: `barcode` y `barcodeType` van JUNTOS (PRD §11, CA-F4-08). */
      barcode?: string | null;
      barcodeType?: InventoryBarcodeType | null;
    };

    /**
     * Consistencia barcode/barcodeType: la regla se evalúa sobre lo que ENVÍA
     * el cliente (`!== undefined`), no sobre el valor semántico, para que en
     * `update` limpiar ambos campos (`null`/`null`) sea válido y enviar solo
     * uno se rechace (CA-F4-08). Además la pareja debe ser consistente en
     * valor: mitad en `null` con la otra mitad con valor también se rechaza
     * (un formato sin código —o un código sin formato— no identifica nada).
     */
    const barcodeMentioned = input.barcode !== undefined;
    const barcodeTypeMentioned = input.barcodeType !== undefined;
    const hasBarcodeValue = typeof input.barcode === 'string' && input.barcode.length > 0;
    const hasBarcodeTypeValue = input.barcodeType !== undefined && input.barcodeType !== null;

    if (barcodeMentioned && !barcodeTypeMentioned) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Indica el formato del código de barras (EAN13, UPCA, CODE128 u OTHER): el formato va junto al código.',
        path: ['barcodeType'],
      });
    }

    if (!barcodeMentioned && barcodeTypeMentioned) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'El formato del código de barras va junto al código: indica el valor del código o limpia ambos campos.',
        path: ['barcode'],
      });
    }

    if (barcodeMentioned && barcodeTypeMentioned && hasBarcodeValue !== hasBarcodeTypeValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: hasBarcodeValue
          ? 'Indica el formato del código de barras (EAN13, UPCA, CODE128 u OTHER): el formato va junto al código.'
          : 'El formato del código de barras va junto al código: indica el valor del código o limpia ambos campos.',
        path: [hasBarcodeValue ? 'barcodeType' : 'barcode'],
      });
    }

    /**
     * Validación por formato declarado (PRD §11 regla 4), autoritativa en
     * backend: dígito de control módulo 10 GS1 para EAN13/UPCA; longitud y
     * caracteres para CODE128/OTHER. El cliente puede replicarla para dar
     * respuesta inmediata, pero no es la barrera.
     */
    if (hasBarcodeValue && hasBarcodeTypeValue && input.barcodeType) {
      const barcodeCheck = validateBarcodeValue(input.barcodeType, input.barcode as string);
      if (!barcodeCheck.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: barcodeCheck.message,
          path: ['barcode'],
        });
      }
    }

    if (
      input.purchaseUnitOfMeasure &&
      (!input.purchaseToBaseUomFactor || input.purchaseToBaseUomFactor <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'El factor de conversion de compra debe ser mayor que cero cuando hay unidad de compra.',
        path: ['purchaseToBaseUomFactor'],
      });
    }

    /**
     * Validación dimensional (ADR-085 D2 · F5b), autoritativa en backend.
     * Solo se pronuncia cuando el payload trae ambas unidades: en `update`
     * parcial la visión completa la revalida `InventoryItemService.update`
     * contra el esquema de creación con los valores fusionados.
     */
    if (input.unitOfMeasure && input.purchaseUnitOfMeasure) {
      const baseCode = input.unitOfMeasure;
      const purchaseCode = input.purchaseUnitOfMeasure;

      if (baseCode === purchaseCode) {
        const factor = input.purchaseToBaseUomFactor;
        if (factor !== undefined && factor !== null && Number(factor) !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Cuando la unidad de compra coincide con la unidad base, el factor de conversion debe ser 1.',
            path: ['purchaseToBaseUomFactor'],
          });
        }
      } else if (
        isInventoryUnitOfMeasureCode(baseCode) &&
        isInventoryUnitOfMeasureCode(purchaseCode) &&
        !areInventoryUnitsDimensionallyCompatible(baseCode, purchaseCode)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: buildDimensionalMismatchMessage(baseCode, purchaseCode),
          path: ['purchaseUnitOfMeasure'],
        });
      }
    }

    if ((input.reorderPoint ?? 0) < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El punto de reorden no puede ser negativo.',
        path: ['reorderPoint'],
      });
    }

    const requiresAssetControl =
      input.trackingMode === InventoryTrackingMode.SERIALIZED ||
      input.trackingMode === InventoryTrackingMode.FIXED_ASSET;

    const assetControlled = input.assetControlled ?? (requiresAssetControl ? true : false);

    if (requiresAssetControl && assetControlled === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Los articulos serializados o de activo fijo requieren control de activo.',
        path: ['assetControlled'],
      });
    }

    /**
     * Coherencia del maestro (Fase S2 · CA-S2-01): un producto «Con serial» es
     * serializado de punta a punta, así que `itemKind` y `trackingMode` no
     * pueden contradecirse. En creación ambos campos están presentes; en
     * edición parcial solo se pronuncia cuando la contradicción viaja explícita
     * en el payload — el estado fusionado lo revalida `InventoryItemService.update`
     * contra el esquema de creación con `itemKind` incluido.
     */
    const itemKindSerialized = input.itemKind === InventoryItemKind.SERIALIZED;
    const itemKindMentioned = input.itemKind !== undefined;
    const trackingModeMentioned = input.trackingMode !== undefined;

    const contradiction =
      (itemKindSerialized && trackingModeMentioned && !requiresAssetControl) ||
      (requiresAssetControl && itemKindMentioned && !itemKindSerialized);

    if (contradiction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
        path: ['trackingMode'],
      });
    }
  });
}

export const CreateInventoryItemSchema = refineInventoryItemMaster(
  z
    .object({
      ...inventoryItemMasterFields,
      sku: z.string().trim().max(60).optional().default(''),
    })
    .superRefine((value, ctx) => {
      if (!value.categoryId && !value.category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debe indicar una categoria para el producto.',
          path: ['categoryId'],
        });
      }
    }),
);

export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

export const UpdateInventoryItemSchema = refineInventoryItemMaster(
  z
    .object({
      name: inventoryItemMasterFields.name.optional(),
      description: inventoryItemMasterFields.description,
      brand: inventoryItemMasterFields.brand,
      model: inventoryItemMasterFields.model,
      itemKind: z.nativeEnum(InventoryItemKind).optional(),
      categoryId: z.string().uuid().optional(),
      category: z.nativeEnum(InventoryItemCategory).optional(),
      trackingMode: z.nativeEnum(InventoryTrackingMode).optional(),
      unitOfMeasure: inventoryItemMasterFields.unitOfMeasure.optional(),
      baseCost: nonNegativeNumber.optional(),
      minimumStock: nonNegativeNumber.optional(),
      purchasable: z.boolean().optional(),
      inventoryControlled: z.boolean().optional(),
      assetControlled: z.boolean().optional(),
      preferredSupplierRefId: z.string().uuid().optional().nullable(),
      supplierSku: inventoryItemMasterFields.supplierSku,
      purchaseUnitOfMeasure: inventoryItemMasterFields.purchaseUnitOfMeasure,
      purchaseToBaseUomFactor: positiveNumber.optional().nullable(),
      standardCost: nonNegativeNumber.optional(),
      lastPurchaseCost: nonNegativeNumber.optional().nullable(),
      averageCost: nonNegativeNumber.optional(),
      reorderPoint: nonNegativeNumber.optional(),
      targetStock: nonNegativeNumber.optional(),
      minimumOrderQty: positiveNumber.optional().nullable(),
      orderMultiple: positiveNumber.optional().nullable(),
      leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
      usefulLifeMonths: z.coerce.number().int().positive().optional().nullable(),
      commercialReferenceId: inventoryItemMasterFields.commercialReferenceId,
      barcode: inventoryItemMasterFields.barcode,
      barcodeType: inventoryItemMasterFields.barcodeType,
      status: z.nativeEnum(InventoryItemStatus).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Debe enviar al menos un campo para actualizar.',
    }),
);

export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;

export const ListCatalogOptionsQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListCatalogOptionsQueryInput = z.infer<typeof ListCatalogOptionsQuerySchema>;

export class ListCatalogOptionsQueryDto {
  @ApiPropertyOptional()
  @Allow()
  search?: string;
}

export const ListInventoryCategoriesQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  status: z.nativeEnum(InventoryCategoryStatus).optional(),
  ...inventoryListPaginationZod,
});

export type ListInventoryCategoriesQueryInput = z.input<typeof ListInventoryCategoriesQuerySchema>;

export class ListInventoryCategoriesQueryDto {
  @ApiPropertyOptional()
  @Allow()
  search?: string;

  @ApiPropertyOptional({ enum: InventoryCategoryStatus })
  @Allow()
  status?: InventoryCategoryStatus;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Tamaño de página (default 20, max 100)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Allow()
  limit?: number;
}

export const CreateInventoryCategorySchema = z.object({
  code: z.string().trim().min(1).max(80),
  codePrefix: z
    .string()
    .trim()
    .regex(
      /^[A-Z0-9]{2,3}$/,
      'El prefijo debe tener entre 2 y 3 caracteres alfanumericos en mayuscula.',
    ),
  name: z.string().trim().min(1).max(160),
  description: optionalTrimmedString(2000),
  status: z.nativeEnum(InventoryCategoryStatus).optional().default(InventoryCategoryStatus.ACTIVE),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

export type CreateInventoryCategoryInput = z.infer<typeof CreateInventoryCategorySchema>;

export const UpdateInventoryCategorySchema = z
  .object({
    code: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    description: optionalTrimmedString(2000),
    status: z.nativeEnum(InventoryCategoryStatus).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar.',
  });

export type UpdateInventoryCategoryInput = z.infer<typeof UpdateInventoryCategorySchema>;

export class CreateInventoryCategoryDto {
  @ApiProperty()
  @Allow()
  code!: string;

  @ApiProperty({
    description:
      'Prefijo corto (2-3 caracteres alfanumericos en mayuscula) usado para autogenerar SKU de productos. Inmutable tras la creacion.',
    example: 'CFO',
  })
  @Allow()
  codePrefix!: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiPropertyOptional({ enum: InventoryCategoryStatus, default: InventoryCategoryStatus.ACTIVE })
  @Allow()
  status?: InventoryCategoryStatus;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  sortOrder?: number;
}

export class UpdateInventoryCategoryDto {
  @ApiPropertyOptional()
  @Allow()
  code?: string;

  @ApiPropertyOptional()
  @Allow()
  name?: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiPropertyOptional({ enum: InventoryCategoryStatus })
  @Allow()
  status?: InventoryCategoryStatus;

  @ApiPropertyOptional()
  @Allow()
  sortOrder?: number;
}

export const SuggestInventoryCategoryPrefixQuerySchema = z.object({
  name: z.string().trim().min(1).max(160),
  codePrefix: z.string().trim().max(3).optional(),
  excludeCategoryId: z.string().uuid().optional(),
});

export type SuggestInventoryCategoryPrefixQueryInput = z.infer<
  typeof SuggestInventoryCategoryPrefixQuerySchema
>;

export class SuggestInventoryCategoryPrefixQueryDto {
  @ApiProperty({ description: 'Nombre de la categoria para derivar codigo y prefijo.' })
  @Allow()
  name!: string;

  @ApiPropertyOptional({
    description: 'Prefijo manual opcional. Si colisiona, el servicio devuelve una variante unica.',
  })
  @Allow()
  codePrefix?: string;

  @ApiPropertyOptional({ description: 'Categoria a excluir al calcular unicidad (edicion).' })
  @Allow()
  excludeCategoryId?: string;
}

export class SuggestInventoryCategoryPrefixResponseDto {
  @ApiProperty()
  @Allow()
  code!: string;

  @ApiProperty()
  @Allow()
  codePrefix!: string;

  @ApiProperty()
  @Allow()
  sortOrder!: number;
}

export class CreateInventoryItemDto {
  @ApiPropertyOptional({
    description:
      'Codigo del producto. Si se omite o envia vacio, se autogenera con el formato compuesto {CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}; MARCA y MODELO se omiten si no estan disponibles. Ante colision se reintenta con sufijo -001 o -002; si persiste, la operacion devuelve 409. No se puede modificar despues de crear el producto.',
  })
  @Allow()
  sku?: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiPropertyOptional()
  @Allow()
  description?: string | null;

  @ApiPropertyOptional()
  @Allow()
  brand?: string | null;

  @ApiPropertyOptional()
  @Allow()
  model?: string | null;

  @ApiPropertyOptional({ enum: InventoryItemKind, default: InventoryItemKind.STOCK })
  @Allow()
  itemKind?: InventoryItemKind;

  @ApiPropertyOptional()
  @Allow()
  categoryId?: string;

  @ApiPropertyOptional({ enum: InventoryItemCategory })
  @Allow()
  category?: InventoryItemCategory;

  @ApiProperty({ enum: InventoryTrackingMode })
  @Allow()
  trackingMode!: InventoryTrackingMode;

  @ApiProperty({
    enum: [...INVENTORY_UNIT_OF_MEASURE_CODES],
    description: 'Código del catálogo canónico de unidades (ADR-085 D1). Ej. UNIT, BOX, METER.',
  })
  @Allow()
  unitOfMeasure!: string;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  baseCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  minimumStock?: number;

  @ApiPropertyOptional({ default: true })
  @Allow()
  purchasable?: boolean;

  @ApiPropertyOptional({ default: true })
  @Allow()
  inventoryControlled?: boolean;

  @ApiPropertyOptional({ default: false })
  @Allow()
  assetControlled?: boolean;

  @ApiPropertyOptional()
  @Allow()
  preferredSupplierRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  supplierSku?: string | null;

  @ApiPropertyOptional({
    enum: [...INVENTORY_UNIT_OF_MEASURE_CODES],
    description:
      'Código del catálogo canónico de unidades para la compra (opcional). ' +
      'Debe compartir dimensión con la unidad base (ADR-085 D2); COUNT admite empaque (caja → unidad).',
  })
  @Allow()
  purchaseUnitOfMeasure?: string | null;

  @ApiPropertyOptional({
    description:
      'Cuántas unidades base contiene una unidad de compra (numeric(12,4)). ' +
      'Se aplica en la recepción hacia adelante: el ledger opera siempre en unidad base (ADR-085 D3).',
  })
  @Allow()
  purchaseToBaseUomFactor?: number | null;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  standardCost?: number;

  @ApiPropertyOptional()
  @Allow()
  lastPurchaseCost?: number | null;

  @ApiPropertyOptional({
    default: 0,
    description:
      'Costo promedio móvil del ítem (valoración operativa). Se actualiza en recepción; no es claim fiscal.',
  })
  @Allow()
  averageCost?: number;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  reorderPoint?: number;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  targetStock?: number;

  @ApiPropertyOptional()
  @Allow()
  minimumOrderQty?: number | null;

  @ApiPropertyOptional()
  @Allow()
  orderMultiple?: number | null;

  @ApiPropertyOptional()
  @Allow()
  leadTimeDays?: number | null;

  @ApiPropertyOptional()
  @Allow()
  usefulLifeMonths?: number | null;

  @ApiPropertyOptional()
  @Allow()
  commercialReferenceId?: string | null;

  @ApiPropertyOptional({
    description:
      'Código de barras del artículo (opcional, editable tras la creación). Único por tenant; se envía SIEMPRE junto a barcodeType. No sustituye al SKU.',
    maxLength: 64,
    example: '8412345678905',
  })
  @Allow()
  barcode?: string | null;

  @ApiPropertyOptional({
    enum: InventoryBarcodeType,
    description:
      'Formato declarado del código de barras; obligatorio junto a barcode (uno sin el otro se rechaza). EAN13 y UPCA validan dígito de control.',
  })
  @Allow()
  barcodeType?: InventoryBarcodeType | null;

  @ApiPropertyOptional({ enum: InventoryItemStatus, default: InventoryItemStatus.ACTIVE })
  @Allow()
  status?: InventoryItemStatus;
}

export class UpdateInventoryItemDto extends CreateInventoryItemDto {}

export const ListStockLocationsQuerySchema = z.object({
  type: z.nativeEnum(StockLocationType).optional(),
  status: z.nativeEnum(StockLocationStatus).optional(),
  /** Grupo INACTIVE + ARCHIVED (matriz de ubicaciones). Excluyente con `status` puntual. */
  statusGroup: z.enum(['inactive_group']).optional(),
  responsibleRefId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  /** Solo ubicaciones móviles (técnico / cuadrilla). */
  custody: z.enum(['mobile']).optional(),
  /** Solo ubicaciones con quantity_on_hand > 0 en algún saldo. */
  withStock: optionalQueryBoolean,
  ...inventoryListPaginationZod,
});

export type ListStockLocationsQueryInput = z.input<typeof ListStockLocationsQuerySchema>;

export const StockLocationPickerSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(20).optional().default(20),
  ),
  status: z.nativeEnum(StockLocationStatus).optional(),
});

export type StockLocationPickerSearchQueryInput = z.input<
  typeof StockLocationPickerSearchQuerySchema
>;

export class StockLocationPickerSearchQueryDto {
  @ApiPropertyOptional({ description: 'Texto typeahead (nombre / código)' })
  @Allow()
  q?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 20 })
  @Allow()
  limit?: number;

  @ApiPropertyOptional({ enum: StockLocationStatus })
  @Allow()
  status?: StockLocationStatus;
}

export class ListStockLocationsQueryDto {
  @ApiPropertyOptional({ enum: StockLocationType })
  @Allow()
  type?: StockLocationType;

  @ApiPropertyOptional({ enum: StockLocationStatus })
  @Allow()
  status?: StockLocationStatus;

  @ApiPropertyOptional({
    enum: ['inactive_group'],
    description: 'Filtra INACTIVE ∪ ARCHIVED. Si se envía, prevalece sobre `status`.',
  })
  @Allow()
  statusGroup?: 'inactive_group';

  @ApiPropertyOptional()
  @Allow()
  responsibleRefId?: string;

  @ApiPropertyOptional({
    description: 'Busca por nombre, código o responsibleRefId (ADR-065 Ola 6 · matriz).',
  })
  @Allow()
  search?: string;

  @ApiPropertyOptional({
    enum: ['mobile'],
    description: 'Solo MOBILE_TECHNICIAN / MOBILE_CREW.',
  })
  @Allow()
  custody?: 'mobile';

  @ApiPropertyOptional({
    description: 'Si true, solo ubicaciones con saldo on-hand > 0.',
  })
  @Allow()
  withStock?: boolean;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

export const CreateStockLocationSchema = z.object({
  code: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(200),
  type: z.nativeEnum(StockLocationType),
  status: z.nativeEnum(StockLocationStatus).optional().default(StockLocationStatus.ACTIVE),
  responsibleRefId: z.string().uuid().optional().nullable(),
  maxCapacity: nonNegativeNumber.optional().nullable(),
});

export type CreateStockLocationInput = z.infer<typeof CreateStockLocationSchema>;

export class CreateStockLocationDto {
  @ApiPropertyOptional({
    description: 'Si se omite, el servicio genera un código único por tipo (ej. BOD-001).',
  })
  @Allow()
  code?: string;

  @ApiProperty()
  @Allow()
  name!: string;

  @ApiProperty({ enum: StockLocationType })
  @Allow()
  type!: StockLocationType;

  @ApiPropertyOptional({ enum: StockLocationStatus, default: StockLocationStatus.ACTIVE })
  @Allow()
  status?: StockLocationStatus;

  @ApiPropertyOptional()
  @Allow()
  responsibleRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  maxCapacity?: number | null;
}

export const UpdateStockLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.nativeEnum(StockLocationStatus).optional(),
    responsibleRefId: z.string().uuid().optional().nullable(),
    maxCapacity: nonNegativeNumber.optional().nullable(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.status !== undefined ||
      value.responsibleRefId !== undefined ||
      value.maxCapacity !== undefined,
    {
      message: 'Debes enviar al menos un campo para actualizar la ubicación.',
    },
  );

export type UpdateStockLocationInput = z.infer<typeof UpdateStockLocationSchema>;

export class UpdateStockLocationDto {
  @ApiPropertyOptional()
  @Allow()
  name?: string;

  @ApiPropertyOptional({ enum: StockLocationStatus })
  @Allow()
  status?: StockLocationStatus;

  @ApiPropertyOptional()
  @Allow()
  responsibleRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  maxCapacity?: number | null;
}

const SERIALIZED_ASSET_STATUS_LIST_ERROR =
  'El estado del activo no es válido. Usa uno o varios valores separados por comas (p. ej. AVAILABLE,AVAILABLE_REFURBISHED).';

/**
 * MOD12 S1 · B2: `status` acepta un valor único (`?status=AVAILABLE`) o una
 * lista separada por comas (`?status=AVAILABLE,AVAILABLE_REFURBISHED`).
 * El preproceso normaliza ambas formas a `SerializedAssetStatus[]`; el valor
 * único sigue vigente. Tokens inválidos → 400 en español vía ZodValidationPipe.
 */
function parseSerializedAssetStatusList(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : [value];
  const tokens: string[] = [];

  for (const raw of rawValues) {
    if (typeof raw !== 'string') {
      return value;
    }

    for (const part of raw.split(',')) {
      const token = part.trim();
      if (token.length > 0) {
        tokens.push(token);
      }
    }
  }

  return tokens;
}

export const ListSerializedAssetsQuerySchema = z.object({
  itemId: z.string().trim().min(1).max(160).optional(),
  status: z.preprocess(
    parseSerializedAssetStatusList,
    z
      .array(
        z.nativeEnum(SerializedAssetStatus, {
          errorMap: () => ({ message: SERIALIZED_ASSET_STATUS_LIST_ERROR }),
        }),
      )
      .min(1, 'Debe indicar al menos un estado de activo válido.')
      .optional(),
  ),
  locationId: z.string().trim().min(1).max(160).optional(),
  serialNumber: z.string().trim().min(1).max(160).optional(),
  ...inventoryHybridPaginationZod,
});

export type ListSerializedAssetsQueryInput = z.input<typeof ListSerializedAssetsQuerySchema>;

export const SerializedAssetPickerSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).max(20).optional().default(20),
  ),
});

export type SerializedAssetPickerSearchQueryInput = z.input<
  typeof SerializedAssetPickerSearchQuerySchema
>;

export class SerializedAssetPickerSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Texto typeahead (serial / asset tag / MAC)',
  })
  @Allow()
  q?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 20 })
  @Allow()
  limit?: number;
}

export class ListSerializedAssetsQueryDto {
  @ApiPropertyOptional()
  @Allow()
  itemId?: string;

  @ApiPropertyOptional({
    enum: SerializedAssetStatus,
    description:
      'Estado o lista separada por comas (p. ej. AVAILABLE,AVAILABLE_REFURBISHED). El valor único sigue vigente.',
    example: 'AVAILABLE,AVAILABLE_REFURBISHED',
  })
  @Allow()
  status?: string;

  @ApiPropertyOptional()
  @Allow()
  locationId?: string;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Página 1-based (ADR-065 Ola 6). Excluyente con `cursor`. Sin `page` ni `cursor` = primera página keyset.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

export const GetSerializedAssetDetailQuerySchema = z.object({
  lifecyclePage: z.coerce.number().int().min(1).optional().default(1),
  lifecycleLimit: z.coerce.number().int().min(1).max(100).optional().default(20),
  movementsPage: z.coerce.number().int().min(1).optional().default(1),
  movementsLimit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type GetSerializedAssetDetailQueryInput = z.infer<
  typeof GetSerializedAssetDetailQuerySchema
>;

export class GetSerializedAssetDetailQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Página del timeline de ciclo de vida',
  })
  @Allow()
  lifecyclePage?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Límite del timeline de ciclo de vida',
  })
  @Allow()
  lifecycleLimit?: number;

  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Página de movimientos del activo' })
  @Allow()
  movementsPage?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Límite de movimientos del activo',
  })
  @Allow()
  movementsLimit?: number;
}

export const ListUsefulLifeAlertsQuerySchema = z.object({
  /** Si se omite, incluye `por-vencer` y `vencida` (filtro «all» del portal). */
  status: z.enum(['por-vencer', 'vencida']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ListUsefulLifeAlertsQueryInput = z.infer<typeof ListUsefulLifeAlertsQuerySchema>;

export class ListUsefulLifeAlertsQueryDto {
  @ApiPropertyOptional({
    enum: ['por-vencer', 'vencida'],
    description: 'Estado de alerta; omitir para por vencer y vencida',
  })
  @Allow()
  status?: 'por-vencer' | 'vencida';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Allow()
  pageSize?: number;
}

export const ListStockBalancesQuerySchema = z.object({
  itemId: z.string().trim().min(1).max(160).optional(),
  locationId: z.string().trim().min(1).max(160).optional(),
  condition: z.nativeEnum(StockBalanceCondition).optional(),
  ...inventoryListPaginationZod,
});

export type ListStockBalancesQueryInput = z.input<typeof ListStockBalancesQuerySchema>;

export class ListStockBalancesQueryDto {
  @ApiPropertyOptional()
  @Allow()
  itemId?: string;

  @ApiPropertyOptional()
  @Allow()
  locationId?: string;

  @ApiPropertyOptional({ enum: StockBalanceCondition })
  @Allow()
  condition?: StockBalanceCondition;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

export const ListExecutorCustodyQuerySchema = z.object({
  /** ID del responsable (usuario técnico o cuadrilla) cuya custodia se consulta. */
  responsibleRefId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export type ListExecutorCustodyQueryInput = z.input<typeof ListExecutorCustodyQuerySchema>;

export class ListExecutorCustodyQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'ID del responsable (técnico o cuadrilla) cuya custodia activa se consulta.',
  })
  @Allow()
  responsibleRefId!: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Página 1-based compartida por ambas colecciones.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    default: 25,
    minimum: 1,
    maximum: 100,
    description: 'Tamaño de página compartido por ambas colecciones (default 25, max 100).',
  })
  @Allow()
  limit?: number;
}

/** Grupo de seriales de una línea (MOD12 S2 · D2): uuids, no vacío y sin repetidos. */
const serializedAssetIdsSchema = z
  .array(z.string().uuid())
  .min(1, 'Si se envía serializedAssetIds debe incluir al menos un serial.')
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Los seriales no deben repetirse dentro de la línea.',
  });

/**
 * Línea de salida (MOD12 S2 · D2): acepta `serializedAssetIds` como grupo de
 * seriales y mantiene `serializedAssetId` singular por compatibilidad S1; el
 * borde del schema normaliza el singular a un arreglo de un elemento. La
 * coherencia cantidad ↔ número de seriales se valida en el servicio (B3).
 */
const StockIssueLineSchema = z
  .object({
    itemId: z.string().uuid(),
    requestedQty: positiveNumber,
    lotId: z.string().uuid().optional().nullable(),
    serializedAssetId: z.string().uuid().optional().nullable(),
    serializedAssetIds: serializedAssetIdsSchema.optional(),
    condition: z.nativeEnum(StockBalanceCondition).optional().default(StockBalanceCondition.NEW),
  })
  .superRefine((line, ctx) => {
    // Ambos campos serial a la vez: el singular se ignoraba en silencio y el
    // cliente nunca sabía cuál ganó. Se rechaza en el borde con 400.
    if (line.serializedAssetId != null && line.serializedAssetIds !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Si envía seriales, envíe solo uno de los dos campos: serializedAssetId o serializedAssetIds, no ambos.',
        path: ['serializedAssetId'],
      });
    }
    // S2.1 · B2 (CA-S2.1-BE04): con grupo de seriales la cantidad se rechaza
    // en el borde si es fraccionaria o distinta del tamaño del grupo. Sin
    // grupo no hay nada que exigir (línea no serializada). El servicio
    // revalida con SKU (defensa en profundidad).
    const group =
      line.serializedAssetIds ?? (line.serializedAssetId ? [line.serializedAssetId] : []);
    if (group.length > 0) {
      const quantity =
        typeof line.requestedQty === 'number' ? line.requestedQty : Number(line.requestedQty);
      if (!Number.isInteger(quantity)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La cantidad solicitada de una línea con seriales debe ser un número entero.',
          path: ['requestedQty'],
        });
      } else if (quantity !== group.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `La cantidad solicitada debe coincidir con el número de seriales ` +
            `seleccionados (${group.length} seriales).`,
          path: ['requestedQty'],
        });
      }
    }
  })
  .transform((line) =>
    line.serializedAssetIds === undefined && line.serializedAssetId
      ? { ...line, serializedAssetIds: [line.serializedAssetId] }
      : line,
  );

const STOCK_ISSUE_TYPES_WITHOUT_DESTINATION = new Set<StockIssueType>([
  StockIssueType.SALE_DISPATCH,
  StockIssueType.INTERNAL_CONSUMPTION,
]);

const STOCK_ISSUE_TYPES_REQUIRING_DESTINATION = new Set<StockIssueType>([
  StockIssueType.TECHNICIAN_CUSTODY,
  StockIssueType.CREW_CUSTODY,
  StockIssueType.OFFICE_REPLENISHMENT,
  StockIssueType.NODE_REPLENISHMENT,
  StockIssueType.WAREHOUSE_TO_WAREHOUSE,
]);

function refineStockIssueDestinationRules(
  value: {
    type: StockIssueType;
    sourceLocationId?: string | undefined;
    destinationLocationId?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  const { type, sourceLocationId, destinationLocationId } = value;

  if (STOCK_ISSUE_TYPES_WITHOUT_DESTINATION.has(type)) {
    if (destinationLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Este tipo de salida no permite destinationLocationId.',
        path: ['destinationLocationId'],
      });
    }
    return;
  }

  if (STOCK_ISSUE_TYPES_REQUIRING_DESTINATION.has(type) && !destinationLocationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Este tipo de salida requiere destinationLocationId.',
      path: ['destinationLocationId'],
    });
  }

  if (sourceLocationId && destinationLocationId && sourceLocationId === destinationLocationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La ubicación destino debe ser distinta del origen.',
      path: ['destinationLocationId'],
    });
  }
}

export const CreateStockIssueSchema = z
  .object({
    type: z.nativeEnum(StockIssueType),
    sourceLocationId: z.string().uuid(),
    destinationLocationId: z.string().uuid().optional().nullable(),
    destinationRefId: optionalTrimmedString(160),
    originRefId: optionalTrimmedString(160),
    commercialRefId: optionalTrimmedString(160),
    reason: optionalTrimmedString(2000),
    costCenter: optionalTrimmedString(80),
    lines: z.array(StockIssueLineSchema).min(1, 'Debe enviar al menos una línea.'),
  })
  .superRefine((value, ctx) => {
    if (value.type === StockIssueType.SALE_DISPATCH) {
      if (!value.originRefId?.trim() && !value.commercialRefId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Una salida por venta requiere originRefId o commercialRefId.',
          path: ['commercialRefId'],
        });
      }
    }

    if (value.type === StockIssueType.INTERNAL_CONSUMPTION) {
      if (!value.costCenter?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El consumo interno requiere costCenter.',
          path: ['costCenter'],
        });
      }

      if (!value.reason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El consumo interno requiere reason.',
          path: ['reason'],
        });
      }
    }

    refineStockIssueDestinationRules(
      {
        type: value.type,
        sourceLocationId: value.sourceLocationId,
        destinationLocationId: value.destinationLocationId,
      },
      ctx,
    );
  });

export type CreateStockIssueInput = z.infer<typeof CreateStockIssueSchema>;

export class StockIssueLineDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty({
    description:
      'Cantidad solicitada. Acepta número o cadena decimal (el API la normaliza a número con z.coerce.number()).',
  })
  @Allow()
  requestedQty!: number;

  @ApiPropertyOptional({ description: 'Lote de la línea.' })
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional({
    description:
      'Serial único de la línea (compatibilidad MOD12 S1). El API lo normaliza a serializedAssetIds de un elemento; no enviar junto al arreglo.',
  })
  @Allow()
  serializedAssetId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Grupo de seriales de la línea (MOD12 S2 · D2): uuids únicos, arreglo no vacío. Para ítems con seguimiento serializado la cantidad debe coincidir con el número de seriales.',
    items: { type: 'string', format: 'uuid' },
  })
  @Allow()
  serializedAssetIds?: string[];

  @ApiPropertyOptional({ enum: StockBalanceCondition, default: StockBalanceCondition.NEW })
  @Allow()
  condition?: StockBalanceCondition;
}

export class CreateStockIssueDto {
  @ApiProperty({ enum: StockIssueType })
  @Allow()
  type!: StockIssueType;

  @ApiProperty()
  @Allow()
  sourceLocationId!: string;

  @ApiPropertyOptional()
  @Allow()
  destinationLocationId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  destinationRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  originRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  commercialRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  reason?: string | null;

  @ApiPropertyOptional()
  @Allow()
  costCenter?: string | null;

  @ApiProperty({ type: [StockIssueLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => StockIssueLineDto)
  lines!: StockIssueLineDto[];
}

export const UpdateStockIssueSchema = z
  .object({
    type: z.nativeEnum(StockIssueType).optional(),
    status: z
      .nativeEnum(StockIssueStatus)
      .optional()
      .refine(
        (value) =>
          value !== StockIssueStatus.DISPATCHED &&
          value !== StockIssueStatus.RECEIVED &&
          value !== StockIssueStatus.CANCELLED,
        {
          message:
            'No se puede establecer un estado terminal por este endpoint. Use el despacho o cancelación.',
        },
      ),
    sourceLocationId: z.string().uuid().optional(),
    destinationLocationId: z.string().uuid().optional().nullable(),
    destinationRefId: optionalTrimmedString(160),
    originRefId: optionalTrimmedString(160),
    commercialRefId: optionalTrimmedString(160),
    reason: optionalTrimmedString(2000),
    costCenter: optionalTrimmedString(80),
    lines: z.array(StockIssueLineSchema).min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar.',
  })
  .superRefine((value, ctx) => {
    const type = value.type;

    if (type === StockIssueType.SALE_DISPATCH) {
      if (!value.originRefId?.trim() && !value.commercialRefId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Una salida por venta requiere originRefId o commercialRefId.',
          path: ['commercialRefId'],
        });
      }
    }

    if (type === StockIssueType.INTERNAL_CONSUMPTION) {
      if (!value.costCenter?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El consumo interno requiere costCenter.',
          path: ['costCenter'],
        });
      }

      if (!value.reason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El consumo interno requiere reason.',
          path: ['reason'],
        });
      }
    }

    if (type !== undefined) {
      refineStockIssueDestinationRules(
        {
          type,
          sourceLocationId: value.sourceLocationId,
          destinationLocationId: value.destinationLocationId,
        },
        ctx,
      );
    }
  });

export type UpdateStockIssueInput = z.infer<typeof UpdateStockIssueSchema>;

export class UpdateStockIssueDto extends CreateStockIssueDto {
  @ApiPropertyOptional({ enum: StockIssueStatus })
  @Allow()
  status?: StockIssueStatus;
}

/**
 * Adjunto de entrega del despacho (MOD12 S2.1 · B3): schema cerrado — antes
 * `z.unknown()` aceptaba cualquier forma y la columna `jsonb` la guardaba sin
 * validar. Solo metadatos (nombre + ubicación opcional); el binario vive en
 * el storage del módulo, no en este payload.
 */
const HandoffAttachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    url: z.string().trim().max(500).optional(),
    mimeType: z.string().trim().max(100).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .strict();

export const DispatchStockIssueSchema = z.object({
  handoffMethod: z.string().trim().min(1).max(32),
  handoffNotes: optionalTrimmedString(1000),
  handoffAttachments: z.array(HandoffAttachmentSchema).optional().default([]),
});

export type DispatchStockIssueInput = z.infer<typeof DispatchStockIssueSchema>;

export class HandoffAttachmentDto {
  @ApiProperty({ description: 'Nombre del adjunto de entrega.' })
  @Allow()
  name!: string;

  @ApiPropertyOptional({ description: 'Ubicación del adjunto (ruta o URL).' })
  @Allow()
  url?: string;

  @ApiPropertyOptional({ description: 'Tipo de contenido del adjunto.' })
  @Allow()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Tamaño del adjunto en bytes.' })
  @Allow()
  sizeBytes?: number;
}

export class DispatchStockIssueDto {
  @ApiProperty()
  @Allow()
  handoffMethod!: string;

  @ApiPropertyOptional()
  @Allow()
  handoffNotes?: string | null;

  @ApiPropertyOptional({ type: [HandoffAttachmentDto], default: [] })
  @Allow()
  handoffAttachments?: HandoffAttachmentDto[];
}

export const CancelStockIssueSchema = z.object({
  reason: optionalTrimmedString(2000),
});

export type CancelStockIssueInput = z.infer<typeof CancelStockIssueSchema>;

export class CancelStockIssueDto {
  @ApiPropertyOptional()
  @Allow()
  reason?: string | null;
}

export const ListStockIssuesQuerySchema = z.object({
  type: z.nativeEnum(StockIssueType).optional(),
  status: z.nativeEnum(StockIssueStatus).optional(),
  sourceLocationId: z.string().uuid().optional(),
  destinationLocationId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  ...inventoryHybridPaginationZod,
});

export type ListStockIssuesQueryInput = z.input<typeof ListStockIssuesQuerySchema>;

export class ListStockIssuesQueryDto {
  @ApiPropertyOptional({ enum: StockIssueType })
  @Allow()
  type?: StockIssueType;

  @ApiPropertyOptional({ enum: StockIssueStatus })
  @Allow()
  status?: StockIssueStatus;

  @ApiPropertyOptional()
  @Allow()
  sourceLocationId?: string;

  @ApiPropertyOptional()
  @Allow()
  destinationLocationId?: string;

  @ApiPropertyOptional({
    description:
      'Busca por id, nombre de bodega origen/destino, destinationRefId, originRefId, commercialRefId o costCenter.',
  })
  @Allow()
  search?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Página 1-based (ADR-065 Ola 6). Excluyente con `cursor`. Sin `page` ni `cursor` = primera página keyset.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

/**
 * Límite por defecto del listado de elegibles para salida (MOD12 S1 · B1).
 * D1 exige precarga inmediata al elegir bodega: 25 filas por página.
 */
export const STOCK_ISSUE_PICKABLE_ITEMS_DEFAULT_LIMIT = 25;

/**
 * Query de `GET /inventory/issues/pickable-items` (MOD12 S1 · B1).
 *
 * Decisión de paginación (review G1): solo modo `page`. El orden canónico
 * (`totalAvailable DESC, name ASC`) se calcula sobre el agregado por ítem y
 * no admite cursor keyset; `cursor` se rechaza con 400 en español en el
 * servicio. `q` vacía = sin filtro (precarga D1), a diferencia del picker
 * genérico que retorna vacío sin `q`.
 */
export const ListStockIssuePickableItemsQuerySchema = z.object({
  sourceLocationId: z.string().uuid(),
  q: z.string().trim().max(200).optional(),
  scope: z.enum(['with-stock', 'catalog']).optional().default('with-stock'),
  ...inventoryHybridPaginationZod,
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(1)
      .max(INVENTORY_LIST_MAX_LIMIT)
      .optional()
      .default(STOCK_ISSUE_PICKABLE_ITEMS_DEFAULT_LIMIT),
  ),
});

export type ListStockIssuePickableItemsQueryInput = z.input<
  typeof ListStockIssuePickableItemsQuerySchema
>;

export class ListStockIssuePickableItemsQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Bodega de origen desde la que se prepara la salida.',
  })
  @Allow()
  sourceLocationId!: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Búsqueda por SKU, nombre, marca, modelo o código de barras. Vacía = sin filtro (precarga de la pestaña Con material).',
  })
  @Allow()
  q?: string;

  @ApiPropertyOptional({
    enum: ['with-stock', 'catalog'],
    default: 'with-stock',
    description:
      'with-stock: solo ítems con disponible > 0 en la bodega. catalog: catálogo completo (sin saldo = totalAvailable 0).',
  })
  @Allow()
  scope?: 'with-stock' | 'catalog';

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Página 1-based. Excluyente con cursor. El orden por disponible calculado solo admite modo page.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    description:
      'No disponible en este listado: el orden por disponible calculado no admite cursor keyset. Enviarlo responde 400; usa page.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: STOCK_ISSUE_PICKABLE_ITEMS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${STOCK_ISSUE_PICKABLE_ITEMS_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

/** Presets KPI del workspace de compras (paridad con portal purchase-filters). */
export const PurchaseRequestKpiPresetSchema = z.enum([
  'pendingQuotes',
  'pendingApproval',
  'readyForPo',
  'pendingReceipt',
  'urgent',
  'overdue',
]);

export type PurchaseRequestKpiPreset = z.infer<typeof PurchaseRequestKpiPresetSchema>;

export const ListPurchaseRequestsQuerySchema = z.object({
  status: z.nativeEnum(PurchaseRequestStatus).optional(),
  requestType: z.nativeEnum(PurchaseRequestType).optional(),
  priority: z.nativeEnum(PurchaseRequestPriority).optional(),
  requestingArea: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  kpiPreset: PurchaseRequestKpiPresetSchema.optional(),
  ...inventoryHybridPaginationZod,
});

export type ListPurchaseRequestsQueryInput = z.input<typeof ListPurchaseRequestsQuerySchema>;

export class ListPurchaseRequestsQueryDto {
  @ApiPropertyOptional({ enum: PurchaseRequestStatus })
  @Allow()
  status?: PurchaseRequestStatus;

  @ApiPropertyOptional({ enum: PurchaseRequestType })
  @Allow()
  requestType?: PurchaseRequestType;

  @ApiPropertyOptional({ enum: PurchaseRequestPriority })
  @Allow()
  priority?: PurchaseRequestPriority;

  @ApiPropertyOptional()
  @Allow()
  requestingArea?: string;

  @ApiPropertyOptional({
    description: 'Busca por número, título o área solicitante.',
  })
  @Allow()
  search?: string;

  @ApiPropertyOptional({
    enum: ['pendingQuotes', 'pendingApproval', 'readyForPo', 'pendingReceipt', 'urgent', 'overdue'],
    description:
      'Preset KPI operativo. `pendingQuotes` = DRAFT∪PENDING_QUOTES; `pendingReceipt` = CONVERTED_TO_PO con órdenes en APPROVED/PARTIALLY_RECEIVED (excluye totalmente recibidas); `overdue` = neededByDate vencida y no terminal.',
  })
  @Allow()
  kpiPreset?: PurchaseRequestKpiPreset;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Página 1-based (ADR-065 Ola 6). Excluyente con `cursor`.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

export const ListPurchaseOrdersQuerySchema = z.object({
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  purchaseRequestId: z.string().trim().min(1).max(160).optional(),
  page: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(1).optional(),
  ),
  limit: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(1)
      .max(INVENTORY_LIST_MAX_LIMIT)
      .optional()
      .default(INVENTORY_LIST_DEFAULT_LIMIT),
  ),
});

export type ListPurchaseOrdersQueryInput = z.infer<typeof ListPurchaseOrdersQuerySchema>;

export class ListPurchaseOrdersQueryDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @Allow()
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional()
  @Allow()
  purchaseRequestId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description: 'Página 1-based (ADR-065 Ola 7). Default 1.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

export const SearchSuppliersQuerySchema = z.object({
  search: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(120).optional()),
  page: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional().default(1),
  ),
});

export type SearchSuppliersQueryInput = z.infer<typeof SearchSuppliersQuerySchema>;

export class SearchSuppliersQueryDto {
  @ApiPropertyOptional()
  @Allow()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Allow()
  page?: number;
}

export const PurchaseRequestLineSchema = z
  .object({
    sourceKind: z.nativeEnum(PurchaseRequestLineSourceKind),
    inventoryItemId: optionalUuidLike(),
    freeTextDescription: optionalTrimmedString(500),
    quantityRequested: positiveNumber,
    // TODO(F5b/D2): exigir catálogo canónico ADR-085; hoy texto libre mientras el ítem exige catálogo.
    unitOfMeasure: z.string().trim().min(1).max(32),
    suggestedPartyRefId: optionalUuidLike(),
    notes: optionalTrimmedString(4000),
  })
  .superRefine((value, context) => {
    if (
      value.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT &&
      !value.freeTextDescription?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['freeTextDescription'],
        message: 'Debe describir la línea libre.',
      });
    }

    if (
      value.sourceKind !== PurchaseRequestLineSourceKind.FREE_TEXT &&
      !value.inventoryItemId?.trim()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inventoryItemId'],
        message: 'Debe seleccionar un item de inventario para esta línea.',
      });
    }
  });

export type PurchaseRequestLineInput = z.infer<typeof PurchaseRequestLineSchema>;

export class PurchaseRequestLineDto {
  @ApiProperty({ enum: PurchaseRequestLineSourceKind })
  @Allow()
  sourceKind!: PurchaseRequestLineSourceKind;

  @ApiPropertyOptional()
  @Allow()
  inventoryItemId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  freeTextDescription?: string | null;

  @ApiProperty()
  @Allow()
  quantityRequested!: number;

  @ApiProperty()
  @Allow()
  unitOfMeasure!: string;

  @ApiPropertyOptional()
  @Allow()
  suggestedPartyRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

export const CreatePurchaseRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  requestType: z.nativeEnum(PurchaseRequestType),
  priority: z
    .nativeEnum(PurchaseRequestPriority)
    .optional()
    .default(PurchaseRequestPriority.NORMAL),
  requestingArea: z.string().trim().min(1).max(120),
  justification: z.string().trim().min(10).max(4000),
  operationalRefType: z.string().trim().min(1).max(60).optional().nullable(),
  operationalRefId: z.string().trim().min(1).max(160).optional().nullable(),
  neededByDate: optionalDateString,
  notes: optionalTrimmedString(4000),
  lines: z.array(PurchaseRequestLineSchema).min(1),
});

export type CreatePurchaseRequestInput = z.infer<typeof CreatePurchaseRequestSchema>;

export class CreatePurchaseRequestDto {
  @ApiProperty()
  @Allow()
  title!: string;

  @ApiProperty({ enum: PurchaseRequestType })
  @Allow()
  requestType!: PurchaseRequestType;

  @ApiPropertyOptional({ enum: PurchaseRequestPriority, default: PurchaseRequestPriority.NORMAL })
  @Allow()
  priority?: PurchaseRequestPriority;

  @ApiProperty()
  @Allow()
  requestingArea!: string;

  @ApiProperty()
  @Allow()
  justification!: string;

  @ApiPropertyOptional()
  @Allow()
  operationalRefType?: string | null;

  @ApiPropertyOptional()
  @Allow()
  operationalRefId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  neededByDate?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiProperty({ type: [PurchaseRequestLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines!: PurchaseRequestLineDto[];
}

export const AddSupplierQuoteLineSchema = z.object({
  purchaseRequestLineId: z.string().uuid(),
  unitCost: positiveNumber,
});

export const AddSupplierQuoteTaxSchema = z.object({
  code: z.string().trim().min(2).max(40),
  applies: z.boolean(),
  rate: z.coerce.number().min(0).max(100).optional(),
});

export const AddSupplierQuoteSchema = z
  .object({
    partyRefId: z.string().trim().min(1).max(160),
    quoteNumber: z.string().trim().min(1).max(60),
    amount: positiveNumber.optional(),
    shippingCost: nonNegativeNumber.default(0),
    shippingArrangement: z
      .nativeEnum(QuoteShippingArrangement)
      .default(QuoteShippingArrangement.ON_INVOICE),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    validUntil: optionalDateString,
    notes: optionalTrimmedString(4000),
    rfqInvitationId: z.string().uuid().optional().nullable(),
    lines: z.array(AddSupplierQuoteLineSchema).min(1).optional(),
    taxes: z.array(AddSupplierQuoteTaxSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if ((!value.lines || value.lines.length === 0) && value.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indica el monto total o al menos una línea de cotización.',
        path: ['amount'],
      });
    }

    if (!value.taxes?.length) {
      return;
    }

    const seenCodes = new Set<string>();
    value.taxes.forEach((tax, index) => {
      if (seenCodes.has(tax.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Hay códigos de tributo duplicados en la cotización.',
          path: ['taxes', index, 'code'],
        });
      }
      seenCodes.add(tax.code);
    });
  });

export type AddSupplierQuoteInput = z.input<typeof AddSupplierQuoteSchema>;
export type AddSupplierQuoteLineInput = z.infer<typeof AddSupplierQuoteLineSchema>;
export type AddSupplierQuoteTaxInput = z.infer<typeof AddSupplierQuoteTaxSchema>;

export const UpdateSupplierQuoteSchema = z
  .object({
    quoteNumber: z.string().trim().min(1).max(60),
    amount: positiveNumber.optional(),
    shippingCost: nonNegativeNumber.default(0),
    shippingArrangement: z
      .nativeEnum(QuoteShippingArrangement)
      .default(QuoteShippingArrangement.ON_INVOICE),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    validUntil: optionalDateString,
    notes: optionalTrimmedString(4000),
    lines: z.array(AddSupplierQuoteLineSchema).min(1).optional(),
    taxes: z.array(AddSupplierQuoteTaxSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if ((!value.lines || value.lines.length === 0) && value.amount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Indica el monto total o al menos una línea de cotización.',
        path: ['amount'],
      });
    }

    if (!value.taxes?.length) {
      return;
    }

    const seenCodes = new Set<string>();
    value.taxes.forEach((tax, index) => {
      if (seenCodes.has(tax.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Hay códigos de tributo duplicados en la cotización.',
          path: ['taxes', index, 'code'],
        });
      }
      seenCodes.add(tax.code);
    });
  });

export type UpdateSupplierQuoteInput = z.input<typeof UpdateSupplierQuoteSchema>;

export class AddSupplierQuoteLineDto {
  @ApiProperty()
  @Allow()
  purchaseRequestLineId!: string;

  @ApiProperty()
  @Allow()
  unitCost!: number;
}

export class AddSupplierQuoteTaxDto {
  @ApiProperty({ minLength: 2, maxLength: 40, example: 'IVA_19' })
  @Allow()
  code!: string;

  @ApiProperty({ description: 'Solo se persisten filas con applies=true' })
  @Allow()
  applies!: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'Tasa 0–100. Si se omite, el servidor usa la tasa del catálogo.',
  })
  @Allow()
  rate?: number;
}

export class SupplierQuoteTaxSnapshotDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ enum: TaxQuoteEffect })
  effect!: TaxQuoteEffect;

  @ApiProperty({ example: true })
  applies!: true;

  @ApiProperty({ description: 'Tasa persistida con hasta 4 decimales' })
  rate!: string;

  @ApiProperty()
  baseAmount!: string;

  @ApiProperty()
  taxAmount!: string;
}

export class PurchaseTaxPresetDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ nullable: true, type: Number })
  baseRate!: number | null;

  @ApiProperty()
  treatment!: string;

  @ApiProperty()
  context!: string;
}

/**
 * Eje derivado de abastecimiento de una solicitud de compra (no persistido).
 * Se documenta como modelo aparte porque viaja embebido en cada fila del
 * listado `GET /purchasing/requests` y en el `request` del detalle.
 */
export class PurchaseRequestFulfillmentDto {
  @ApiProperty({
    enum: PurchaseRequestFulfillmentStatus,
    enumName: 'PurchaseRequestFulfillmentStatus',
    description:
      'Estado de abastecimiento derivado en servidor de las órdenes de compra vivas ' +
      '(se ignoran las CANCELLED). Complementa a status, que se detiene en CONVERTED_TO_PO: ' +
      'PARTIALLY_RECEIVED si alguna orden lo está; si no, PENDING_RECEIPT con alguna APPROVED; ' +
      'si no, RECEIVED con alguna FULLY_RECEIVED o CLOSED; en cualquier otro caso NOT_ORDERED.',
  })
  fulfillmentStatus!: PurchaseRequestFulfillmentStatus;
}

export class AddSupplierQuoteDto {
  @ApiProperty()
  @Allow()
  partyRefId!: string;

  @ApiProperty()
  @Allow()
  quoteNumber!: string;

  @ApiPropertyOptional({
    description: 'Monto total (legacy si la solicitud no tiene líneas; derivado si hay lines)',
  })
  @Allow()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Monto del flete. Cero si es gratis. No forma parte del amount de productos.',
    default: 0,
  })
  @Allow()
  shippingCost?: number;

  @ApiPropertyOptional({
    enum: QuoteShippingArrangement,
    default: QuoteShippingArrangement.ON_INVOICE,
    description:
      'Cómo se cubre el envío: FREE, ON_INVOICE (entra al neto) o PAY_CARRIER (no entra al neto).',
  })
  @Allow()
  shippingArrangement?: QuoteShippingArrangement;

  @ApiProperty({ minLength: 3, maxLength: 3 })
  @Allow()
  currency!: string;

  @ApiPropertyOptional()
  @Allow()
  validUntil?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Invitación RFQ a la que vincular la cotización' })
  @Allow()
  rfqInvitationId?: string | null;

  @ApiPropertyOptional({ type: [AddSupplierQuoteLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => AddSupplierQuoteLineDto)
  lines?: AddSupplierQuoteLineDto[];

  @ApiPropertyOptional({
    type: [AddSupplierQuoteTaxDto],
    description:
      'Tributos opcionales (IVA, retención en la fuente, Rete ICA, Rete IVA). El servidor calcula montos.',
  })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => AddSupplierQuoteTaxDto)
  taxes?: AddSupplierQuoteTaxDto[];
}

export class UpdateSupplierQuoteDto {
  @ApiProperty()
  @Allow()
  quoteNumber!: string;

  @ApiPropertyOptional({
    description: 'Monto total (legacy si la solicitud no tiene líneas; derivado si hay lines)',
  })
  @Allow()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Monto del flete. Cero si es gratis. No forma parte del amount de productos.',
    default: 0,
  })
  @Allow()
  shippingCost?: number;

  @ApiPropertyOptional({
    enum: QuoteShippingArrangement,
    default: QuoteShippingArrangement.ON_INVOICE,
  })
  @Allow()
  shippingArrangement?: QuoteShippingArrangement;

  @ApiProperty({ minLength: 3, maxLength: 3 })
  @Allow()
  currency!: string;

  @ApiPropertyOptional()
  @Allow()
  validUntil?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional({ type: [AddSupplierQuoteLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => AddSupplierQuoteLineDto)
  lines?: AddSupplierQuoteLineDto[];

  @ApiPropertyOptional({ type: [AddSupplierQuoteTaxDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => AddSupplierQuoteTaxDto)
  taxes?: AddSupplierQuoteTaxDto[];
}

export const CreateRfqSchema = z.object({
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional()
    .default('COP'),
  responseDeadline: optionalDateString,
  notes: optionalTrimmedString(4000),
});

export type CreateRfqInput = z.infer<typeof CreateRfqSchema>;

export class CreateRfqDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 3, default: 'COP' })
  @Allow()
  currency?: string;

  @ApiPropertyOptional({ description: 'Fecha límite de respuesta (YYYY-MM-DD)' })
  @Allow()
  responseDeadline?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;
}

export const InviteSuppliersSchema = z.object({
  partyRefIds: z.array(z.string().uuid()).min(1),
});

export type InviteSuppliersInput = z.infer<typeof InviteSuppliersSchema>;

export class InviteSuppliersDto {
  @ApiProperty({ type: [String], description: 'Referencias de proveedores (MOD08 Parties)' })
  @Allow()
  partyRefIds!: string[];
}

export const DeclineInvitationSchema = z.object({
  declineReason: optionalTrimmedString(4000),
});

export type DeclineInvitationInput = z.infer<typeof DeclineInvitationSchema>;

export class DeclineInvitationDto {
  @ApiPropertyOptional()
  @Allow()
  declineReason?: string | null;
}

export const ApprovePurchaseRequestSchema = z.object({
  notes: optionalTrimmedString(4000),
  exceptionReason: optionalTrimmedString(4000),
});

export type ApprovePurchaseRequestInput = z.infer<typeof ApprovePurchaseRequestSchema>;

export class ApprovePurchaseRequestDto {
  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  exceptionReason?: string | null;
}

export const UpdatePurchaseRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priority: z.nativeEnum(PurchaseRequestPriority).optional(),
  requestingArea: z.string().trim().min(1).max(120).optional(),
  justification: z.string().trim().min(10).max(4000).optional(),
  neededByDate: optionalDateString,
  notes: optionalTrimmedString(4000),
  lines: z.array(PurchaseRequestLineSchema).min(1).optional(),
});

export type UpdatePurchaseRequestInput = z.infer<typeof UpdatePurchaseRequestSchema>;

export class UpdatePurchaseRequestDto {
  @ApiPropertyOptional()
  @Allow()
  title?: string;

  @ApiPropertyOptional({ enum: PurchaseRequestPriority })
  @Allow()
  priority?: PurchaseRequestPriority;

  @ApiPropertyOptional()
  @Allow()
  requestingArea?: string;

  @ApiPropertyOptional()
  @Allow()
  justification?: string;

  @ApiPropertyOptional()
  @Allow()
  neededByDate?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional({ type: [PurchaseRequestLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineDto)
  lines?: PurchaseRequestLineDto[];
}

export const RejectPurchaseRequestSchema = z.object({
  reason: z.string().trim().min(10).max(4000),
});

export type RejectPurchaseRequestInput = z.infer<typeof RejectPurchaseRequestSchema>;

export class RejectPurchaseRequestDto {
  @ApiProperty()
  @Allow()
  reason!: string;
}

export const CancelPurchaseRequestSchema = z.object({
  reason: z.string().trim().min(5).max(4000),
});

export const CancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().min(5).max(4000),
});

export type CancelPurchaseOrderInput = z.infer<typeof CancelPurchaseOrderSchema>;

export class CancelPurchaseOrderDto {
  @ApiProperty()
  @Allow()
  reason!: string;
}

export type CancelPurchaseRequestInput = z.infer<typeof CancelPurchaseRequestSchema>;

export class CancelPurchaseRequestDto {
  @ApiProperty()
  @Allow()
  reason!: string;
}

export const PurchaseOrderLineSchema = z.object({
  purchaseRequestLineId: optionalUuidLike(),
  itemId: z.string().trim().min(1).max(160),
  quantity: positiveNumber,
  unitCost: nonNegativeNumber,
});

export type PurchaseOrderLineInput = z.infer<typeof PurchaseOrderLineSchema>;

export class PurchaseOrderLineDto {
  @ApiPropertyOptional()
  @Allow()
  purchaseRequestLineId?: string | null;

  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  quantity!: number;

  @ApiProperty()
  @Allow()
  unitCost!: number;
}

export const PurchaseOrderBatchSchema = z.object({
  partyRefId: z.string().trim().min(1).max(160),
  expectedDeliveryDate: optionalDateString,
  notes: optionalTrimmedString(4000),
  lines: z.array(PurchaseOrderLineSchema).min(1),
});

export type PurchaseOrderBatchInput = z.infer<typeof PurchaseOrderBatchSchema>;

export class PurchaseOrderBatchDto {
  @ApiProperty()
  @Allow()
  partyRefId!: string;

  @ApiPropertyOptional()
  @Allow()
  expectedDeliveryDate?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}

export const CreatePurchaseOrderSchema = z
  .object({
    purchaseRequestId: z.string().trim().min(1).max(160),
    partyRefId: z.string().trim().min(1).max(160).optional(),
    expectedDeliveryDate: optionalDateString,
    notes: optionalTrimmedString(4000),
    lines: z.array(PurchaseOrderLineSchema).min(1).optional(),
    orders: z.array(PurchaseOrderBatchSchema).min(1).optional(),
    status: z
      .enum([PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.PENDING_APPROVAL] as [
        PurchaseOrderStatus,
        PurchaseOrderStatus,
      ])
      .optional()
      .default(PurchaseOrderStatus.APPROVED),
  })
  .superRefine((value, context) => {
    const isLegacyMode = Boolean(value.partyRefId && value.lines?.length);
    const isBatchMode = Boolean(value.orders?.length);

    if (!isLegacyMode && !isBatchMode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orders'],
        message:
          'Debe enviar partyRefId + lines para modo legado o orders para generar múltiples OCs.',
      });
    }
  });

export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @Allow()
  purchaseRequestId!: string;

  @ApiPropertyOptional()
  @Allow()
  partyRefId?: string;

  @ApiPropertyOptional()
  @Allow()
  expectedDeliveryDate?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional({ type: [PurchaseOrderLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];

  @ApiPropertyOptional({ type: [PurchaseOrderBatchDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderBatchDto)
  orders?: PurchaseOrderBatchDto[];

  @ApiPropertyOptional({ enum: PurchaseOrderStatus, default: PurchaseOrderStatus.APPROVED })
  @Allow()
  status?: PurchaseOrderStatus;
}

export const PurchaseRequestLineAwardSchema = z.object({
  purchaseRequestLineId: z.string().trim().min(1).max(160),
  supplierQuoteId: optionalUuidLike(),
  awardedPartyRefId: z.string().trim().min(1).max(160),
  awardedQuantity: positiveNumber,
  awardNotes: optionalTrimmedString(4000),
});

export type PurchaseRequestLineAwardInput = z.infer<typeof PurchaseRequestLineAwardSchema>;

export class PurchaseRequestLineAwardDto {
  @ApiProperty()
  @Allow()
  purchaseRequestLineId!: string;

  @ApiPropertyOptional()
  @Allow()
  supplierQuoteId?: string | null;

  @ApiProperty()
  @Allow()
  awardedPartyRefId!: string;

  @ApiProperty()
  @Allow()
  awardedQuantity!: number;

  @ApiPropertyOptional()
  @Allow()
  awardNotes?: string | null;
}

export const CreatePurchaseRequestAwardsSchema = z.object({
  awards: z.array(PurchaseRequestLineAwardSchema).min(1),
});

export type CreatePurchaseRequestAwardsInput = z.infer<typeof CreatePurchaseRequestAwardsSchema>;

export class CreatePurchaseRequestAwardsDto {
  @ApiProperty({ type: [PurchaseRequestLineAwardDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestLineAwardDto)
  awards!: PurchaseRequestLineAwardDto[];
}

export const ReceivePurchaseOrderLineSchema = z.object({
  purchaseOrderLineId: z.string().trim().min(1).max(160),
  itemId: z.string().trim().min(1).max(160),
  quantityReceived: positiveNumber,
  quantityShortage: nonNegativeNumber.optional().default(0),
  quantityDamaged: nonNegativeNumber.optional().default(0),
  lotNumber: z.string().trim().min(1).max(80).optional().nullable(),
  expiryDate: optionalDateString,
  serialNumbers: z.array(z.string().trim().min(1).max(160)).optional().default([]),
  unitCost: nonNegativeNumber.optional().nullable(),
  condition: z.nativeEnum(StockBalanceCondition).optional().default(StockBalanceCondition.NEW),
});

export type ReceivePurchaseOrderLineInput = z.infer<typeof ReceivePurchaseOrderLineSchema>;

export class ReceivePurchaseOrderLineDto {
  @ApiProperty()
  @Allow()
  purchaseOrderLineId!: string;

  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  quantityReceived!: number;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  quantityShortage?: number;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  quantityDamaged?: number;

  @ApiPropertyOptional()
  @Allow()
  lotNumber?: string | null;

  @ApiPropertyOptional()
  @Allow()
  expiryDate?: string | null;

  @ApiPropertyOptional({ type: [String], default: [] })
  @Allow()
  serialNumbers?: string[];

  @ApiPropertyOptional()
  @Allow()
  unitCost?: number | null;

  @ApiPropertyOptional({ enum: StockBalanceCondition, default: StockBalanceCondition.NEW })
  @Allow()
  condition?: StockBalanceCondition;
}

export const ReceivePurchaseOrderSchema = z.object({
  destinationLocationId: z.string().trim().min(1).max(160),
  receivedAt: z.string().datetime().optional().nullable(),
  notes: optionalTrimmedString(4000),
  lines: z.array(ReceivePurchaseOrderLineSchema).min(1),
  status: z.nativeEnum(GoodsReceiptStatus).optional(),
});

export type ReceivePurchaseOrderInput = z.infer<typeof ReceivePurchaseOrderSchema>;

export class ReceivePurchaseOrderDto {
  @ApiProperty()
  @Allow()
  destinationLocationId!: string;

  @ApiPropertyOptional()
  @Allow()
  receivedAt?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiProperty({ type: [ReceivePurchaseOrderLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines!: ReceivePurchaseOrderLineDto[];

  @ApiPropertyOptional({ enum: GoodsReceiptStatus, default: GoodsReceiptStatus.COMPLETED })
  @Allow()
  status?: GoodsReceiptStatus;
}

export const TransferStockSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  sourceLocationId: z.string().trim().min(1).max(160),
  destinationLocationId: z.string().trim().min(1).max(160),
  quantity: positiveNumber,
  lotId: optionalUuidLike(),
  serializedAssetId: optionalUuidLike(),
  serialNumber: optionalTrimmedString(160),
  condition: z.nativeEnum(StockBalanceCondition).optional().default(StockBalanceCondition.NEW),
  handoffReference: z.string().trim().min(1).max(160),
  handoffNotes: optionalTrimmedString(1000),
  notes: optionalTrimmedString(4000),
  idempotencyKey: optionalTrimmedString(160),
});

export type TransferStockInput = z.infer<typeof TransferStockSchema>;

export class TransferStockDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  sourceLocationId!: string;

  @ApiProperty()
  @Allow()
  destinationLocationId!: string;

  @ApiProperty()
  @Allow()
  quantity!: number;

  @ApiPropertyOptional()
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  serializedAssetId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiPropertyOptional({ enum: StockBalanceCondition, default: StockBalanceCondition.NEW })
  @Allow()
  condition?: StockBalanceCondition;

  @ApiProperty()
  @Allow()
  handoffReference!: string;

  @ApiPropertyOptional()
  @Allow()
  handoffNotes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;
}

export const ExecutionOrderMovementSchema = z.object({
  executionOrderId: z.string().trim().min(1).max(160),
  itemId: z.string().trim().min(1).max(160),
  technicianCustodyId: z.string().trim().min(1).max(160),
  quantity: positiveNumber.default(1),
  serialNumber: optionalTrimmedString(160),
  customerSiteLocationId: optionalTrimmedString(160),
  subscriberId: optionalTrimmedString(160),
  contractRefId: optionalUuidLike(),
  action: z.nativeEnum(ExecutionOrderItemAction),
  finalDisposition: z.nativeEnum(InventoryDisposition),
  idempotencyKey: optionalTrimmedString(160),
});

export type ExecutionOrderMovementInput = z.infer<typeof ExecutionOrderMovementSchema>;

export class ExecutionOrderMovementDto {
  @ApiProperty()
  @Allow()
  executionOrderId!: string;

  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  technicianCustodyId!: string;

  @ApiPropertyOptional({ default: 1 })
  @Allow()
  quantity?: number;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @Allow()
  customerSiteLocationId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  subscriberId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  contractRefId?: string | null;

  @ApiProperty({ enum: ExecutionOrderItemAction })
  @Allow()
  action!: ExecutionOrderItemAction;

  @ApiProperty({ enum: InventoryDisposition })
  @Allow()
  finalDisposition!: InventoryDisposition;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;
}

export const SaleMovementSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  locationId: z.string().trim().min(1).max(160),
  quantity: positiveNumber,
  commercialRefId: z.string().trim().min(1).max(160),
  serializedAssetId: optionalUuidLike(),
  serialNumber: optionalTrimmedString(160),
  lotId: optionalUuidLike(),
  notes: optionalTrimmedString(4000),
  idempotencyKey: optionalTrimmedString(160),
});

export type SaleMovementInput = z.infer<typeof SaleMovementSchema>;

export class SaleMovementDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  locationId!: string;

  @ApiProperty()
  @Allow()
  quantity!: number;

  @ApiProperty()
  @Allow()
  commercialRefId!: string;

  @ApiPropertyOptional()
  @Allow()
  serializedAssetId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;
}

export const InternalConsumptionSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  locationId: z.string().trim().min(1).max(160),
  quantity: positiveNumber,
  costCenterRefId: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(200),
  serializedAssetId: optionalUuidLike(),
  serialNumber: optionalTrimmedString(160),
  lotId: optionalUuidLike(),
  notes: optionalTrimmedString(4000),
  idempotencyKey: optionalTrimmedString(160),
});

export type InternalConsumptionInput = z.infer<typeof InternalConsumptionSchema>;

export class InternalConsumptionDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  locationId!: string;

  @ApiProperty()
  @Allow()
  quantity!: number;

  @ApiProperty()
  @Allow()
  costCenterRefId!: string;

  @ApiProperty()
  @Allow()
  reason!: string;

  @ApiPropertyOptional()
  @Allow()
  serializedAssetId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;
}

export const ALLOWED_RETURN_TARGET_STATUSES = [
  SerializedAssetStatus.IN_TRANSIT,
  SerializedAssetStatus.IN_TESTING,
] as const;

export const ReturnAssetSchema = z.object({
  itemId: z.string().trim().min(1).max(160),
  sourceLocationId: z.string().trim().min(1).max(160),
  destinationLocationId: z.string().trim().min(1).max(160),
  quantity: positiveNumber.default(1),
  serializedAssetId: optionalUuidLike(),
  serialNumber: optionalTrimmedString(160),
  lotId: optionalUuidLike(),
  targetStatus: z.enum(ALLOWED_RETURN_TARGET_STATUSES),
  notes: optionalTrimmedString(4000),
  idempotencyKey: optionalTrimmedString(160),
});

export type ReturnAssetInput = z.infer<typeof ReturnAssetSchema>;

export class ReturnAssetDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  sourceLocationId!: string;

  @ApiProperty()
  @Allow()
  destinationLocationId!: string;

  @ApiPropertyOptional({ default: 1 })
  @Allow()
  quantity?: number;

  @ApiPropertyOptional()
  @Allow()
  serializedAssetId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string | null;

  @ApiPropertyOptional()
  @Allow()
  lotId?: string | null;

  @ApiProperty({ enum: SerializedAssetStatus })
  @Allow()
  targetStatus!: SerializedAssetStatus;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;
}

export const CreateCounterPurchaseLineSchema = z.object({
  itemId: z.string().uuid(),
  quantityReceived: positiveNumber,
  unitCost: nonNegativeNumber,
  lotNumber: z.string().trim().min(1).max(80).optional().nullable(),
  serialNumbers: z.array(z.string().trim().min(1).max(160)).optional().default([]),
  condition: z.nativeEnum(StockBalanceCondition).optional().default(StockBalanceCondition.NEW),
});

export type CreateCounterPurchaseLineInput = z.infer<typeof CreateCounterPurchaseLineSchema>;

export class CreateCounterPurchaseLineDto {
  @ApiProperty()
  @Allow()
  itemId!: string;

  @ApiProperty()
  @Allow()
  quantityReceived!: number;

  @ApiProperty()
  @Allow()
  unitCost!: number;

  @ApiPropertyOptional()
  @Allow()
  lotNumber?: string | null;

  @ApiPropertyOptional({ type: [String], default: [] })
  @Allow()
  serialNumbers?: string[];

  @ApiPropertyOptional({ enum: StockBalanceCondition, default: StockBalanceCondition.NEW })
  @Allow()
  condition?: StockBalanceCondition;
}

export const AddCounterPurchaseTaxSchema = z.object({
  code: z.string().trim().min(2).max(40),
  applies: z.boolean(),
  rate: z.coerce.number().min(0).max(100).optional(),
});

export type AddCounterPurchaseTaxInput = z.infer<typeof AddCounterPurchaseTaxSchema>;

export const CreateCounterPurchaseSchema = z
  .object({
    partyRefId: z.string().uuid(),
    invoiceNumber: z.string().trim().min(1).max(120),
    purchaseDate: optionalDateString,
    destinationLocationId: z.string().uuid(),
    notes: optionalTrimmedString(4000),
    idempotencyKey: optionalTrimmedString(160),
    lines: z.array(CreateCounterPurchaseLineSchema).min(1),
    taxes: z.array(AddCounterPurchaseTaxSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.taxes?.length) {
      return;
    }

    const seenCodes = new Set<string>();
    value.taxes.forEach((tax, index) => {
      if (seenCodes.has(tax.code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Hay códigos de tributo duplicados en la cotización.',
          path: ['taxes', index, 'code'],
        });
      }
      seenCodes.add(tax.code);
    });
  });

export type CreateCounterPurchaseInput = z.infer<typeof CreateCounterPurchaseSchema>;

export class AddCounterPurchaseTaxDto {
  @ApiProperty({ minLength: 2, maxLength: 40, example: 'IVA_19' })
  @Allow()
  code!: string;

  @ApiProperty({ description: 'Solo se persisten filas con applies=true' })
  @Allow()
  applies!: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'Tasa 0–100. Si se omite, el servidor usa la tasa del catálogo.',
  })
  @Allow()
  rate?: number;
}

export class CreateCounterPurchaseDto {
  @ApiProperty({ description: 'Referencia al proveedor en MOD08 Parties' })
  @Allow()
  partyRefId!: string;

  @ApiProperty({ description: 'Número de factura o soporte de compra' })
  @Allow()
  invoiceNumber!: string;

  @ApiPropertyOptional({ description: 'Fecha de la compra (YYYY-MM-DD)' })
  @Allow()
  purchaseDate?: string | null;

  @ApiProperty()
  @Allow()
  destinationLocationId!: string;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;

  @ApiProperty({ type: [CreateCounterPurchaseLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => CreateCounterPurchaseLineDto)
  lines!: CreateCounterPurchaseLineDto[];

  @ApiPropertyOptional({ type: [AddCounterPurchaseTaxDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => AddCounterPurchaseTaxDto)
  taxes?: AddCounterPurchaseTaxDto[];
}

export const WriteOffAssetSchema = z
  .object({
    serializedAssetId: optionalUuidLike(),
    itemId: optionalUuidLike(),
    locationId: optionalUuidLike(),
    quantity: positiveNumber.default(1),
    reason: z.nativeEnum(WriteOffReason),
    notes: optionalTrimmedString(4000),
    idempotencyKey: optionalTrimmedString(160),
  })
  .refine((value) => Boolean(value.serializedAssetId || value.itemId), {
    message: 'Debe enviar serializedAssetId o itemId.',
    path: ['serializedAssetId'],
  });

export type WriteOffAssetInput = z.infer<typeof WriteOffAssetSchema>;

export class WriteOffAssetDto {
  @ApiPropertyOptional()
  @Allow()
  serializedAssetId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  itemId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  locationId?: string | null;

  @ApiPropertyOptional({ default: 1 })
  @Allow()
  quantity?: number;

  @ApiProperty({ enum: WriteOffReason })
  @Allow()
  reason!: WriteOffReason;

  @ApiPropertyOptional()
  @Allow()
  notes?: string | null;

  @ApiPropertyOptional()
  @Allow()
  idempotencyKey?: string | null;
}

const supplierContactSchema = z.object({
  type: z.nativeEnum(PartyContactType),
  value: z.string().trim().min(1).max(500),
  isPrimary: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const supplierCommercialFields = {
  paymentTermsDays: z.coerce.number().int().min(0).optional().nullable(),
  currency: z
    .string()
    .trim()
    .length(3)
    .optional()
    .nullable()
    .transform((value) => (value ? value.toUpperCase() : value)),
  incoterm: z.nativeEnum(IncotermCode).optional().nullable(),
  defaultLeadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  purchasingContactName: optionalTrimmedString(200),
  purchasingContactEmail: optionalTrimmedString(255),
  purchasingContactPhone: optionalTrimmedString(32),
  notes: optionalTrimmedString(4000),
};

export const CreateSupplierSchema = z.object({
  partyType: z.nativeEnum(PartyType),
  documentType: z.nativeEnum(DocumentTypeParty),
  documentNumber: z.string().trim().min(1).max(500),
  displayName: z.string().trim().min(1).max(160),
  legalName: optionalTrimmedString(200),
  contacts: z.array(supplierContactSchema).optional(),
  address: optionalTrimmedString(255),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  city: optionalTrimmedString(120),
  department: optionalTrimmedString(120),
  ...supplierCommercialFields,
});

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

/** DTO anidado: evita que enableImplicitConversion vacíe `contacts` a `[]`. */
export class SupplierContactDto {
  @ApiProperty({ enum: PartyContactType })
  @Allow()
  type!: PartyContactType;

  @ApiProperty({ maxLength: 500 })
  @Allow()
  value!: string;

  @ApiPropertyOptional()
  @Allow()
  isPrimary?: boolean;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @Allow()
  metadata?: Record<string, unknown> | null;
}

export class CreateSupplierDto {
  @ApiProperty({ enum: PartyType })
  @Allow()
  partyType!: PartyType;

  @ApiProperty({ enum: DocumentTypeParty })
  @Allow()
  documentType!: DocumentTypeParty;

  @ApiProperty({ maxLength: 500 })
  @Allow()
  documentNumber!: string;

  @ApiProperty({ maxLength: 160 })
  @Allow()
  displayName!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @Allow()
  legalName?: string | null;

  @ApiPropertyOptional({ type: [SupplierContactDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => SupplierContactDto)
  contacts?: SupplierContactDto[];

  @ApiPropertyOptional({ maxLength: 255 })
  @Allow()
  address?: string | null;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @Allow()
  latitude?: number | null;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @Allow()
  longitude?: number | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @Allow()
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @Allow()
  department?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @Allow()
  paymentTermsDays?: number | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @Allow()
  currency?: string | null;

  @ApiPropertyOptional({ enum: IncotermCode })
  @Allow()
  incoterm?: IncotermCode | null;

  @ApiPropertyOptional({ minimum: 0 })
  @Allow()
  defaultLeadTimeDays?: number | null;

  @ApiPropertyOptional({ maxLength: 200 })
  @Allow()
  purchasingContactName?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @Allow()
  purchasingContactEmail?: string | null;

  @ApiPropertyOptional({ maxLength: 32 })
  @Allow()
  purchasingContactPhone?: string | null;

  @ApiPropertyOptional({ maxLength: 4000 })
  @Allow()
  notes?: string | null;
}

export const UpdateSupplierSchema = z
  .object(supplierCommercialFields)
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'Debe enviar al menos un campo para actualizar el proveedor.',
  });

export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

export class UpdateSupplierDto {
  @ApiPropertyOptional({ minimum: 0 })
  @Allow()
  paymentTermsDays?: number | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @Allow()
  currency?: string | null;

  @ApiPropertyOptional({ enum: IncotermCode })
  @Allow()
  incoterm?: IncotermCode | null;

  @ApiPropertyOptional({ minimum: 0 })
  @Allow()
  defaultLeadTimeDays?: number | null;

  @ApiPropertyOptional({ maxLength: 200 })
  @Allow()
  purchasingContactName?: string | null;

  @ApiPropertyOptional({ maxLength: 255 })
  @Allow()
  purchasingContactEmail?: string | null;

  @ApiPropertyOptional({ maxLength: 32 })
  @Allow()
  purchasingContactPhone?: string | null;

  @ApiPropertyOptional({ maxLength: 4000 })
  @Allow()
  notes?: string | null;
}

export const LookupSupplierDocumentSchema = z.object({
  documentType: z.nativeEnum(DocumentTypeParty),
  documentNumber: z.string().trim().min(1).max(500),
});

export type LookupSupplierDocumentInput = z.infer<typeof LookupSupplierDocumentSchema>;

export class LookupSupplierDocumentQueryDto {
  @ApiProperty({ enum: DocumentTypeParty })
  @Allow()
  documentType!: DocumentTypeParty;

  @ApiProperty({ maxLength: 500 })
  @Allow()
  documentNumber!: string;
}

export const SetSupplierStatusSchema = z.object({
  status: z.nativeEnum(SupplierProfileStatus),
});

export type SetSupplierStatusInput = z.infer<typeof SetSupplierStatusSchema>;

export class SetSupplierStatusDto {
  @ApiProperty({ enum: SupplierProfileStatus })
  @Allow()
  status!: SupplierProfileStatus;
}

export const ListSuppliersQuerySchema = z.object({
  status: z.nativeEnum(SupplierProfileStatus).optional(),
  search: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(120).optional()),
  page: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional().default(1),
  ),
  limit: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(100).optional().default(20),
  ),
});

export type ListSuppliersQueryInput = z.infer<typeof ListSuppliersQuerySchema>;

export const ListLoansQuerySchema = z.object({
  status: z.enum(['abierto', 'cerrado']).optional(),
  subscriberRefId: z.string().uuid().optional(),
  contractRefId: z.string().uuid().optional(),
  serializedAssetId: z.string().uuid().optional(),
  page: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional().default(1),
  ),
  limit: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(100).optional().default(20),
  ),
});

export type ListLoansQueryInput = z.infer<typeof ListLoansQuerySchema>;

export class ListLoansQueryDto {
  @ApiPropertyOptional({ enum: ['abierto', 'cerrado'] })
  @Allow()
  status?: 'abierto' | 'cerrado';

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  subscriberRefId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  contractRefId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  serializedAssetId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Allow()
  limit?: number;
}

export class ListSuppliersQueryDto {
  @ApiPropertyOptional({ enum: SupplierProfileStatus })
  @Allow()
  status?: SupplierProfileStatus;

  @ApiPropertyOptional({
    maxLength: 120,
    description:
      'Busca por código de proveedor, nombre de party (port) o contacto de compras (nombre/email).',
  })
  @Allow()
  search?: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description:
      'Página 1-based (ADR-065). Dual-emit: `meta` ListMeta + campos planos legacy `page`/`total`/`limit`.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Allow()
  limit?: number;
}

export const ListStockMovementsQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  serializedAssetId: z.string().uuid().optional(),
  origin: z.nativeEnum(StockMovementOrigin).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().max(40).optional()),
  page: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional().default(1),
  ),
  limit: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(100).optional().default(20),
  ),
});

export type ListStockMovementsQueryInput = z.infer<typeof ListStockMovementsQuerySchema>;

export class ListStockMovementsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  itemId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  locationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra movimientos cuyas líneas tocan el activo serializado',
  })
  @Allow()
  serializedAssetId?: string;

  @ApiPropertyOptional({ enum: StockMovementOrigin })
  @Allow()
  origin?: StockMovementOrigin;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Allow()
  dateFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @Allow()
  dateTo?: Date;

  @ApiPropertyOptional({ maxLength: 40, description: 'Busca por número de movimiento' })
  @Allow()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Allow()
  limit?: number;
}

export const CreateStockAdjustmentSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  lotId: optionalUuidLike(),
  condition: z.nativeEnum(StockBalanceCondition).optional(),
  quantityDelta: z.coerce
    .number()
    .refine((value) => value !== 0, { message: 'La cantidad del ajuste no puede ser cero.' }),
  reason: z.nativeEnum(StockAdjustmentReason),
  notes: optionalTrimmedString(4000),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export type CreateStockAdjustmentInput = z.infer<typeof CreateStockAdjustmentSchema>;

export class CreateStockAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  @Allow()
  locationId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional({ enum: StockBalanceCondition })
  @Allow()
  condition?: StockBalanceCondition;

  @ApiProperty({ description: 'Delta con signo; no puede ser cero' })
  @Allow()
  quantityDelta!: number;

  @ApiProperty({ enum: StockAdjustmentReason })
  @Allow()
  reason!: StockAdjustmentReason;

  @ApiPropertyOptional({ maxLength: 4000, nullable: true })
  @Allow()
  notes?: string | null;

  @ApiProperty({ minLength: 8, maxLength: 160 })
  @Allow()
  idempotencyKey!: string;
}

export const CreateStockCountSchema = z.object({
  locationId: z.string().uuid(),
  categoryId: z.string().uuid().optional().nullable(),
  notes: optionalTrimmedString(4000),
});

export type CreateStockCountInput = z.infer<typeof CreateStockCountSchema>;

export class CreateStockCountDto {
  @ApiProperty({ format: 'uuid' })
  @Allow()
  locationId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Allow()
  categoryId?: string | null;

  @ApiPropertyOptional({ maxLength: 4000, nullable: true })
  @Allow()
  notes?: string | null;
}

export const UpdateStockCountLineSchema = z.object({
  id: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  lotId: optionalUuidLike(),
  condition: z.nativeEnum(StockBalanceCondition).optional(),
  expectedQty: nonNegativeNumber.optional(),
  countedQty: nonNegativeNumber,
});

export const UpdateStockCountSchema = z.object({
  lines: z.array(UpdateStockCountLineSchema).min(1, 'Debe enviar al menos una línea.'),
});

export type UpdateStockCountInput = z.infer<typeof UpdateStockCountSchema>;

export class UpdateStockCountLineDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  itemId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional({ enum: StockBalanceCondition })
  @Allow()
  condition?: StockBalanceCondition;

  @ApiPropertyOptional()
  @Allow()
  expectedQty?: number;

  @ApiProperty({ description: 'Cantidad contada (no negativa).' })
  @Allow()
  countedQty!: number;
}

export class UpdateStockCountDto {
  @ApiProperty({ type: [UpdateStockCountLineDto] })
  @Allow()
  @ValidateNested({ each: true })
  @Type(() => UpdateStockCountLineDto)
  lines!: UpdateStockCountLineDto[];
}

export const CloseStockCountSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160).optional(),
});

export type CloseStockCountInput = z.infer<typeof CloseStockCountSchema>;

export class CloseStockCountDto {
  @ApiPropertyOptional({ minLength: 8, maxLength: 160 })
  @Allow()
  idempotencyKey?: string;
}

export const ListStockCountsQuerySchema = z.object({
  status: z.nativeEnum(StockCountStatus).optional(),
  locationId: z.string().uuid().optional(),
  ...inventoryHybridPaginationZod,
});

export type ListStockCountsQueryInput = z.input<typeof ListStockCountsQuerySchema>;

export class ListStockCountsQueryDto {
  @ApiPropertyOptional({
    enum: StockCountStatus,
    description: 'Filtro por estado (ADR-065 Ola 6 — no filtrar en cliente sobre buffer paginado).',
  })
  @Allow()
  status?: StockCountStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  locationId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Página 1-based (ADR-065 Ola 6). Excluyente con `cursor`. Sin `page` ni `cursor` = primera página keyset.',
  })
  @Allow()
  page?: number;

  @ApiPropertyOptional({
    description:
      'Cursor opaco de la página anterior (`meta.nextCursor`). Omitir en la primera página.',
  })
  @Allow()
  cursor?: string;

  @ApiPropertyOptional({
    default: INVENTORY_LIST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: INVENTORY_LIST_MAX_LIMIT,
    description: `Tamaño de página (default ${INVENTORY_LIST_DEFAULT_LIMIT}, max ${INVENTORY_LIST_MAX_LIMIT})`,
  })
  @Allow()
  limit?: number;
}

export const ListWriteOffsQuerySchema = z.object({
  status: z.nativeEnum(WriteOffStatus).optional(),
  reason: z.nativeEnum(WriteOffReason).optional(),
  itemId: z.string().uuid().optional(),
  serializedAssetId: z.string().uuid().optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  page: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional().default(1),
  ),
  limit: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(100).optional().default(20),
  ),
});

export type ListWriteOffsQueryInput = z.infer<typeof ListWriteOffsQuerySchema>;

export class ListWriteOffsQueryDto {
  @ApiPropertyOptional({ enum: WriteOffStatus })
  @Allow()
  status?: WriteOffStatus;

  @ApiPropertyOptional({ enum: WriteOffReason })
  @Allow()
  reason?: WriteOffReason;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  itemId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Allow()
  serializedAssetId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @Allow()
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @Allow()
  createdTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Allow()
  limit?: number;
}

export const RejectWriteOffSchema = z.object({
  notes: optionalTrimmedString(4000),
});

export type RejectWriteOffInput = z.infer<typeof RejectWriteOffSchema>;

export class RejectWriteOffDto {
  @ApiPropertyOptional({ maxLength: 4000 })
  @Allow()
  notes?: string | null;
}

export const ApproveWriteOffSchema = z.object({});

export type ApproveWriteOffInput = z.infer<typeof ApproveWriteOffSchema>;

export class ApproveWriteOffDto {}
