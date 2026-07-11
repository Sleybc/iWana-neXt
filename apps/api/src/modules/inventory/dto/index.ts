import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { z } from 'zod';
import {
  ExecutionOrderItemAction,
  GoodsReceiptStatus,
  InventoryDisposition,
  InventoryCategoryStatus,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestStatus,
  PurchaseRequestPriority,
  PurchaseRequestType,
  SerializedAssetStatus,
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
  WriteOffReason,
  PartyType,
  DocumentTypeParty,
  PartyContactType,
  SupplierProfileStatus,
} from '@iwana/shared';

const optionalTrimmedString = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().nullable();
const optionalUuidLike = (maxLength = 160) =>
  z.string().trim().min(1).max(maxLength).optional().nullable();
const positiveNumber = z.coerce.number().positive();
const nonNegativeNumber = z.coerce.number().min(0);

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
});

export type ListInventoryItemsQueryInput = z.infer<typeof ListInventoryItemsQuerySchema>;

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
  unitOfMeasure: z.string().trim().min(1).max(32),
  baseCost: nonNegativeNumber.default(0),
  minimumStock: nonNegativeNumber.default(0),
  purchasable: z.boolean().optional().default(true),
  inventoryControlled: z.boolean().optional().default(true),
  assetControlled: z.boolean().optional(),
  preferredSupplierRefId: z.string().uuid().optional().nullable(),
  supplierSku: optionalTrimmedString(80),
  purchaseUnitOfMeasure: optionalTrimmedString(32),
  purchaseToBaseUomFactor: positiveNumber.optional().nullable(),
  standardCost: nonNegativeNumber.optional().default(0),
  lastPurchaseCost: nonNegativeNumber.optional().nullable(),
  reorderPoint: nonNegativeNumber.optional().default(0),
  targetStock: nonNegativeNumber.optional().default(0),
  minimumOrderQty: positiveNumber.optional().nullable(),
  orderMultiple: positiveNumber.optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
  usefulLifeMonths: z.coerce.number().int().positive().optional().nullable(),
  commercialReferenceId: optionalTrimmedString(160),
  status: z.nativeEnum(InventoryItemStatus).optional().default(InventoryItemStatus.ACTIVE),
};

function refineInventoryItemMaster<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const input = value as {
      purchaseUnitOfMeasure?: string | null;
      purchaseToBaseUomFactor?: number | null;
      trackingMode: InventoryTrackingMode;
      assetControlled?: boolean;
      reorderPoint?: number;
    };

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
      reorderPoint: nonNegativeNumber.optional(),
      targetStock: nonNegativeNumber.optional(),
      minimumOrderQty: positiveNumber.optional().nullable(),
      orderMultiple: positiveNumber.optional().nullable(),
      leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
      usefulLifeMonths: z.coerce.number().int().positive().optional().nullable(),
      commercialReferenceId: inventoryItemMasterFields.commercialReferenceId,
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
});

export type ListInventoryCategoriesQueryInput = z.infer<typeof ListInventoryCategoriesQuerySchema>;

export class ListInventoryCategoriesQueryDto {
  @ApiPropertyOptional()
  @Allow()
  search?: string;

  @ApiPropertyOptional({ enum: InventoryCategoryStatus })
  @Allow()
  status?: InventoryCategoryStatus;
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
      'Codigo del producto. Si se omite o envia vacio, se autogenera como {prefijo-categoria}-NNNNNN.',
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

  @ApiProperty()
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

  @ApiPropertyOptional()
  @Allow()
  purchaseUnitOfMeasure?: string | null;

  @ApiPropertyOptional()
  @Allow()
  purchaseToBaseUomFactor?: number | null;

  @ApiPropertyOptional({ default: 0 })
  @Allow()
  standardCost?: number;

  @ApiPropertyOptional()
  @Allow()
  lastPurchaseCost?: number | null;

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

  @ApiPropertyOptional({ enum: InventoryItemStatus, default: InventoryItemStatus.ACTIVE })
  @Allow()
  status?: InventoryItemStatus;
}

export class UpdateInventoryItemDto extends CreateInventoryItemDto {}

export const ListStockLocationsQuerySchema = z.object({
  type: z.nativeEnum(StockLocationType).optional(),
  status: z.nativeEnum(StockLocationStatus).optional(),
  responsibleRefId: z.string().uuid().optional(),
});

export type ListStockLocationsQueryInput = z.infer<typeof ListStockLocationsQuerySchema>;

export class ListStockLocationsQueryDto {
  @ApiPropertyOptional({ enum: StockLocationType })
  @Allow()
  type?: StockLocationType;

  @ApiPropertyOptional({ enum: StockLocationStatus })
  @Allow()
  status?: StockLocationStatus;

  @ApiPropertyOptional()
  @Allow()
  responsibleRefId?: string;
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

export const ListSerializedAssetsQuerySchema = z.object({
  itemId: z.string().trim().min(1).max(160).optional(),
  status: z.nativeEnum(SerializedAssetStatus).optional(),
  locationId: z.string().trim().min(1).max(160).optional(),
  serialNumber: z.string().trim().min(1).max(160).optional(),
});

export type ListSerializedAssetsQueryInput = z.infer<typeof ListSerializedAssetsQuerySchema>;

export class ListSerializedAssetsQueryDto {
  @ApiPropertyOptional()
  @Allow()
  itemId?: string;

  @ApiPropertyOptional({ enum: SerializedAssetStatus })
  @Allow()
  status?: SerializedAssetStatus;

  @ApiPropertyOptional()
  @Allow()
  locationId?: string;

  @ApiPropertyOptional()
  @Allow()
  serialNumber?: string;
}

export const ListStockBalancesQuerySchema = z.object({
  itemId: z.string().trim().min(1).max(160).optional(),
  locationId: z.string().trim().min(1).max(160).optional(),
  condition: z.nativeEnum(StockBalanceCondition).optional(),
});

export type ListStockBalancesQueryInput = z.infer<typeof ListStockBalancesQuerySchema>;

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
}

const StockIssueLineSchema = z.object({
  itemId: z.string().uuid(),
  requestedQty: positiveNumber,
  lotId: z.string().uuid().optional().nullable(),
  serializedAssetId: z.string().uuid().optional().nullable(),
  condition: z.nativeEnum(StockBalanceCondition).optional().default(StockBalanceCondition.NEW),
});

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

  @ApiProperty({ description: 'Cantidad solicitada.' })
  @Allow()
  requestedQty!: number;

  @ApiPropertyOptional()
  @Allow()
  lotId?: string | null;

  @ApiPropertyOptional()
  @Allow()
  serializedAssetId?: string | null;

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

export const DispatchStockIssueSchema = z.object({
  handoffMethod: z.string().trim().min(1).max(32),
  handoffNotes: optionalTrimmedString(1000),
  handoffAttachments: z.array(z.unknown()).optional().default([]),
});

export type DispatchStockIssueInput = z.infer<typeof DispatchStockIssueSchema>;

export class DispatchStockIssueDto {
  @ApiProperty()
  @Allow()
  handoffMethod!: string;

  @ApiPropertyOptional()
  @Allow()
  handoffNotes?: string | null;

  @ApiPropertyOptional({ type: [Object], default: [] })
  @Allow()
  handoffAttachments?: unknown[];
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
});

export type ListStockIssuesQueryInput = z.infer<typeof ListStockIssuesQuerySchema>;

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
}

export const ListPurchaseRequestsQuerySchema = z.object({
  status: z.nativeEnum(PurchaseRequestStatus).optional(),
  requestType: z.nativeEnum(PurchaseRequestType).optional(),
  priority: z.nativeEnum(PurchaseRequestPriority).optional(),
  requestingArea: z.string().trim().min(1).max(120).optional(),
});

export type ListPurchaseRequestsQueryInput = z.infer<typeof ListPurchaseRequestsQuerySchema>;

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
}

export const ListPurchaseOrdersQuerySchema = z.object({
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  purchaseRequestId: z.string().trim().min(1).max(160).optional(),
});

export type ListPurchaseOrdersQueryInput = z.infer<typeof ListPurchaseOrdersQuerySchema>;

export class ListPurchaseOrdersQueryDto {
  @ApiPropertyOptional({ enum: PurchaseOrderStatus })
  @Allow()
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional()
  @Allow()
  purchaseRequestId?: string;
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
  neededByDate: z.string().date().optional().nullable(),
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
  lines!: PurchaseRequestLineDto[];
}

export const AddSupplierQuoteSchema = z.object({
  partyRefId: z.string().trim().min(1).max(160),
  quoteNumber: z.string().trim().min(1).max(60),
  amount: positiveNumber,
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  validUntil: z.string().date().optional().nullable(),
  notes: optionalTrimmedString(4000),
  rfqInvitationId: z.string().uuid().optional().nullable(),
});

export type AddSupplierQuoteInput = z.infer<typeof AddSupplierQuoteSchema>;

export class AddSupplierQuoteDto {
  @ApiProperty()
  @Allow()
  partyRefId!: string;

  @ApiProperty()
  @Allow()
  quoteNumber!: string;

  @ApiProperty()
  @Allow()
  amount!: number;

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
}

export const CreateRfqSchema = z.object({
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional()
    .default('COP'),
  responseDeadline: z.string().date().optional().nullable(),
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
  expectedDeliveryDate: z.string().date().optional().nullable(),
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
  lines!: PurchaseOrderLineDto[];
}

export const CreatePurchaseOrderSchema = z
  .object({
    purchaseRequestId: z.string().trim().min(1).max(160),
    partyRefId: z.string().trim().min(1).max(160).optional(),
    expectedDeliveryDate: z.string().date().optional().nullable(),
    notes: optionalTrimmedString(4000),
    lines: z.array(PurchaseOrderLineSchema).min(1).optional(),
    orders: z.array(PurchaseOrderBatchSchema).min(1).optional(),
    status: z.nativeEnum(PurchaseOrderStatus).optional().default(PurchaseOrderStatus.APPROVED),
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
  lines?: PurchaseOrderLineDto[];

  @ApiPropertyOptional({ type: [PurchaseOrderBatchDto] })
  @Allow()
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
  awards!: PurchaseRequestLineAwardDto[];
}

export const ReceivePurchaseOrderLineSchema = z.object({
  purchaseOrderLineId: z.string().trim().min(1).max(160),
  itemId: z.string().trim().min(1).max(160),
  quantityReceived: positiveNumber,
  quantityShortage: nonNegativeNumber.optional().default(0),
  quantityDamaged: nonNegativeNumber.optional().default(0),
  lotNumber: z.string().trim().min(1).max(80).optional().nullable(),
  expiryDate: z.string().date().optional().nullable(),
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

export const CreateCounterPurchaseSchema = z.object({
  partyRefId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(120),
  purchaseDate: z.string().date().optional().nullable(),
  destinationLocationId: z.string().uuid(),
  notes: optionalTrimmedString(4000),
  idempotencyKey: optionalTrimmedString(160),
  lines: z.array(CreateCounterPurchaseLineSchema).min(1),
});

export type CreateCounterPurchaseInput = z.infer<typeof CreateCounterPurchaseSchema>;

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
  lines!: CreateCounterPurchaseLineDto[];
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
  incoterm: optionalTrimmedString(10),
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
  ...supplierCommercialFields,
});

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

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

  @ApiPropertyOptional({ type: 'array', items: { type: 'object' } })
  @Allow()
  contacts?: Array<{
    type: PartyContactType;
    value: string;
    isPrimary?: boolean;
    metadata?: Record<string, unknown> | null;
  }>;

  @ApiPropertyOptional({ minimum: 0 })
  @Allow()
  paymentTermsDays?: number | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @Allow()
  currency?: string | null;

  @ApiPropertyOptional({ maxLength: 10 })
  @Allow()
  incoterm?: string | null;

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

export const UpdateSupplierSchema = z.object(supplierCommercialFields);

export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

export class UpdateSupplierDto {
  @ApiPropertyOptional({ minimum: 0 })
  @Allow()
  paymentTermsDays?: number | null;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @Allow()
  currency?: string | null;

  @ApiPropertyOptional({ maxLength: 10 })
  @Allow()
  incoterm?: string | null;

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

export class ListSuppliersQueryDto {
  @ApiPropertyOptional({ enum: SupplierProfileStatus })
  @Allow()
  status?: SupplierProfileStatus;

  @ApiPropertyOptional({ maxLength: 120 })
  @Allow()
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Allow()
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Allow()
  limit?: number;
}
