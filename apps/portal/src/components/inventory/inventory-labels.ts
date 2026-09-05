'use client';

import {
  AssetLifecycleEventType,
  GoodsReceiptStatus,
  INVENTORY_UNITS_OF_MEASURE,
  InventoryBarcodeType,
  InventoryItemCategory,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryResponsibleType,
  InventoryTrackingMode,
  PartyStatus,
  PurchaseOrderStatus,
  PurchaseRequestLineSourceKind,
  PurchaseRequestLineStatus,
  PurchaseRequestPriority,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRfqInvitationStatus,
  PurchaseRfqStatus,
  SerializedAssetStatus,
  StockAdjustmentReason,
  StockBalanceCondition,
  StockCountStatus,
  StockIssueStatus,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
  StockMovementOrigin,
  SupplierProfileStatus,
  WriteOffReason,
  WriteOffStatus,
} from '@iwana/shared';
import {
  isPurchaseRequestFullyReceived,
  type PurchaseRequestFulfillmentSource,
} from './purchase-filters';

function resolveLabel<T extends string>(value: T, labels: Record<T, string>): string {
  return labels[value] ?? value;
}

export const INVENTORY_ITEM_KIND_LABELS: Record<InventoryItemKind, string> = {
  [InventoryItemKind.STOCK]: 'Almacenable',
  [InventoryItemKind.CONSUMABLE]: 'Consumible',
  [InventoryItemKind.SERIALIZED]: 'Con serial',
  [InventoryItemKind.SERVICE]: 'Servicio',
};

export const INVENTORY_ITEM_CATEGORY_LABELS: Record<InventoryItemCategory, string> = {
  [InventoryItemCategory.CPE]: 'Equipos de cliente',
  [InventoryItemCategory.NETWORKING]: 'Networking',
  [InventoryItemCategory.MATERIALS]: 'Materiales',
  [InventoryItemCategory.TOOLS]: 'Herramientas',
  [InventoryItemCategory.CONSUMABLES]: 'Consumibles',
  [InventoryItemCategory.OTHER]: 'Otro',
};

export const INVENTORY_ITEM_STATUS_LABELS: Record<InventoryItemStatus, string> = {
  [InventoryItemStatus.ACTIVE]: 'Activo',
  [InventoryItemStatus.INACTIVE]: 'Inactivo',
  [InventoryItemStatus.DISCONTINUED]: 'Descontinuado',
};

export const INVENTORY_TRACKING_MODE_LABELS: Record<InventoryTrackingMode, string> = {
  [InventoryTrackingMode.CONSUMABLE]: 'Consumible',
  [InventoryTrackingMode.SERIALIZED]: 'Con serial',
  [InventoryTrackingMode.FIXED_ASSET]: 'Activo fijo',
};

export const CUSTOMER_SITE_TRANSFER_BLOCKED_MESSAGE =
  'La carga en sitio del cliente se registra al cerrar la orden de trabajo con firma.';

export const STOCK_LOCATION_TYPE_LABELS: Record<StockLocationType, string> = {
  [StockLocationType.MAIN_WAREHOUSE]: 'Bodega principal',
  [StockLocationType.MOBILE_TECHNICIAN]: 'Técnico en campo',
  [StockLocationType.MOBILE_CREW]: 'Cuadrilla en campo',
  [StockLocationType.CUSTOMER_SITE]: 'Sitio del cliente',
  [StockLocationType.OFFICE_STOCK]: 'Bodega de oficina',
  [StockLocationType.NODE_STOCK]: 'Bodega de nodo',
  [StockLocationType.QUARANTINE]: 'En revisión',
  [StockLocationType.REPAIR]: 'Reparación',
  [StockLocationType.SCRAP]: 'Para descarte',
  [StockLocationType.INTERNAL_CONSUMPTION]: 'Consumo interno',
};

export const STOCK_LOCATION_STATUS_LABELS: Record<StockLocationStatus, string> = {
  [StockLocationStatus.ACTIVE]: 'Activa',
  [StockLocationStatus.INACTIVE]: 'Inactiva',
  [StockLocationStatus.ARCHIVED]: 'Archivada',
};

export const PARTY_STATUS_LABELS: Record<PartyStatus, string> = {
  [PartyStatus.ACTIVE]: 'Activo',
  [PartyStatus.INACTIVE]: 'Inactivo',
  [PartyStatus.MERGED]: 'Fusionado',
};

export const SUPPLIER_STATUS_LABELS: Record<SupplierProfileStatus, string> = {
  [SupplierProfileStatus.ACTIVE]: 'Activo',
  [SupplierProfileStatus.INACTIVE]: 'Inactivo',
  [SupplierProfileStatus.BLOCKED]: 'Bloqueado',
};

export const STOCK_BALANCE_CONDITION_LABELS: Record<StockBalanceCondition, string> = {
  [StockBalanceCondition.NEW]: 'Nuevo',
  [StockBalanceCondition.REFURBISHED]: 'Reacondicionado',
  [StockBalanceCondition.DAMAGED]: 'Dañado',
};

export const SERIALIZED_ASSET_STATUS_LABELS: Record<SerializedAssetStatus, string> = {
  [SerializedAssetStatus.ORDERED]: 'Ordenado',
  [SerializedAssetStatus.IN_RECEIVING]: 'En recepción',
  [SerializedAssetStatus.AVAILABLE]: 'Disponible',
  [SerializedAssetStatus.ASSIGNED_TO_TECHNICIAN]: 'Asignado a técnico',
  [SerializedAssetStatus.INSTALLED_COMODATO]: 'Instalado en comodato',
  [SerializedAssetStatus.IN_TRANSIT]: 'En tránsito',
  [SerializedAssetStatus.IN_TESTING]: 'En pruebas',
  [SerializedAssetStatus.AVAILABLE_REFURBISHED]: 'Disponible reacondicionado',
  [SerializedAssetStatus.IN_REPAIR]: 'En reparación',
  [SerializedAssetStatus.SOLD]: 'Vendido',
  [SerializedAssetStatus.INTERNAL_CONSUMED]: 'Consumo interno',
  [SerializedAssetStatus.WRITTEN_OFF]: 'Dado de baja',
  [SerializedAssetStatus.LOST]: 'Perdido',
};

export const PURCHASE_CURRENCY_OPTIONS = ['COP', 'USD', 'EUR'] as const;

export type PurchaseCurrencyOption = (typeof PURCHASE_CURRENCY_OPTIONS)[number];

export const PURCHASE_REQUEST_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  [PurchaseRequestStatus.DRAFT]: 'Borrador',
  [PurchaseRequestStatus.PENDING_QUOTES]: 'Pendiente de cotizaciones',
  [PurchaseRequestStatus.PENDING_APPROVAL]: 'Pendiente de aprobación',
  [PurchaseRequestStatus.APPROVED]: 'Aprobada',
  [PurchaseRequestStatus.REJECTED]: 'Rechazada',
  [PurchaseRequestStatus.CONVERTED_TO_PO]: 'Convertida en orden de compra',
  [PurchaseRequestStatus.CANCELLED]: 'Cancelada',
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: 'Borrador',
  [PurchaseOrderStatus.PENDING_APPROVAL]: 'Pendiente de aprobación',
  [PurchaseOrderStatus.APPROVED]: 'Aprobada',
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: 'Recepción parcial',
  [PurchaseOrderStatus.FULLY_RECEIVED]: 'Recibida completa',
  [PurchaseOrderStatus.CANCELLED]: 'Cancelada',
  [PurchaseOrderStatus.CLOSED]: 'Cerrada',
};

export const PURCHASE_RFQ_STATUS_LABELS: Record<PurchaseRfqStatus, string> = {
  [PurchaseRfqStatus.DRAFT]: 'Borrador',
  [PurchaseRfqStatus.SENT]: 'Enviada',
  [PurchaseRfqStatus.RECEIVING]: 'Recibiendo respuestas',
  [PurchaseRfqStatus.CLOSED]: 'Cerrada',
  [PurchaseRfqStatus.CANCELLED]: 'Cancelada',
};

export const RFQ_INVITATION_STATUS_LABELS: Record<PurchaseRfqInvitationStatus, string> = {
  [PurchaseRfqInvitationStatus.INVITED]: 'Invitado',
  [PurchaseRfqInvitationStatus.RESPONDED]: 'Respondió',
  [PurchaseRfqInvitationStatus.DECLINED]: 'Declinó',
  [PurchaseRfqInvitationStatus.EXPIRED]: 'Vencido',
  [PurchaseRfqInvitationStatus.CANCELLED]: 'Cancelado',
};

export const GOODS_RECEIPT_STATUS_LABELS: Record<GoodsReceiptStatus, string> = {
  [GoodsReceiptStatus.DRAFT]: 'Borrador',
  [GoodsReceiptStatus.IN_PROGRESS]: 'En proceso',
  [GoodsReceiptStatus.COMPLETED]: 'Completada',
  [GoodsReceiptStatus.PARTIAL]: 'Parcial',
  [GoodsReceiptStatus.WITH_SHORTAGES]: 'Con faltantes',
  [GoodsReceiptStatus.WITH_DAMAGES]: 'Con daños',
  [GoodsReceiptStatus.REJECTED]: 'Rechazada',
  [GoodsReceiptStatus.CANCELLED]: 'Cancelada',
};

export const PURCHASE_REQUEST_TYPE_LABELS: Record<PurchaseRequestType, string> = {
  [PurchaseRequestType.REPLENISHMENT]: 'Compra para bodega',
  [PurchaseRequestType.URGENT_OPERATION]: 'Compra urgente',
  [PurchaseRequestType.PROJECT]: 'Proyecto',
  [PurchaseRequestType.FREE_PURCHASE]: 'Compra abierta',
};

export type ReplenishmentCriticalityLabel = 'out' | 'below-minimum' | 'below-reorder';

export const REPLENISHMENT_CRITICALITY_LABELS: Record<ReplenishmentCriticalityLabel, string> = {
  out: 'Agotado',
  'below-minimum': 'Bajo mínimo',
  'below-reorder': 'Bajo reorden',
};

export const PURCHASE_REQUEST_TYPE_HELPER_LABELS: Record<PurchaseRequestType, string> = {
  [PurchaseRequestType.REPLENISHMENT]:
    'Pedido habitual para reponer materiales y mantener la bodega al día.',
  [PurchaseRequestType.URGENT_OPERATION]:
    'Necesidad inmediata por falla, rotura o consumo crítico en operación.',
  [PurchaseRequestType.PROJECT]: 'Materiales para un proyecto o ampliación planificada.',
  [PurchaseRequestType.FREE_PURCHASE]: 'Compra que no parte del catálogo habitual de bodega.',
};

export const PURCHASE_REQUEST_PRIORITY_LABELS: Record<PurchaseRequestPriority, string> = {
  [PurchaseRequestPriority.LOW]: 'Baja',
  [PurchaseRequestPriority.NORMAL]: 'Normal',
  [PurchaseRequestPriority.HIGH]: 'Alta',
  [PurchaseRequestPriority.URGENT]: 'Urgente',
};

export const PURCHASE_REQUEST_LINE_STATUS_LABELS: Record<PurchaseRequestLineStatus, string> = {
  [PurchaseRequestLineStatus.OPEN]: 'Abierta',
  [PurchaseRequestLineStatus.PENDING_QUOTE]: 'Pendiente de cotización',
  [PurchaseRequestLineStatus.AWARDED]: 'Adjudicada',
  [PurchaseRequestLineStatus.ORDERED]: 'Ordenada',
  [PurchaseRequestLineStatus.PARTIALLY_RECEIVED]: 'Recepción parcial',
  [PurchaseRequestLineStatus.RECEIVED]: 'Recibida',
  [PurchaseRequestLineStatus.CANCELLED]: 'Cancelada',
  [PurchaseRequestLineStatus.REJECTED]: 'Rechazada',
};

export const PURCHASE_REQUEST_LINE_SOURCE_LABELS: Record<PurchaseRequestLineSourceKind, string> = {
  [PurchaseRequestLineSourceKind.INVENTORY_ITEM]: 'Del catálogo',
  [PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION]: 'Sugerencia',
  [PurchaseRequestLineSourceKind.FREE_TEXT]: 'Texto manual',
};

export const PURCHASE_REQUEST_LINE_SOURCE_HELPER_LABELS: Record<
  PurchaseRequestLineSourceKind,
  string
> = {
  [PurchaseRequestLineSourceKind.INVENTORY_ITEM]: 'Elige un producto ya registrado en bodega.',
  [PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION]:
    'Usa una recomendación del sistema según el material disponible.',
  [PurchaseRequestLineSourceKind.FREE_TEXT]: 'Escribe qué necesitas sin buscar en catálogo.',
};

export const INVENTORY_RESPONSIBLE_TYPE_LABELS: Record<InventoryResponsibleType, string> = {
  [InventoryResponsibleType.NONE]: 'Sin responsable',
  [InventoryResponsibleType.WAREHOUSE]: 'Bodega',
  [InventoryResponsibleType.TECHNICIAN]: 'Técnico',
  [InventoryResponsibleType.CREW]: 'Cuadrilla',
  [InventoryResponsibleType.CUSTOMER]: 'Cliente',
};

export const STOCK_MOVEMENT_ORIGIN_LABELS: Record<StockMovementOrigin, string> = {
  [StockMovementOrigin.PURCHASE_RECEIPT]: 'Recepción de compra',
  [StockMovementOrigin.TRANSFER]: 'Transferencia',
  [StockMovementOrigin.EXECUTION_ORDER]: 'Orden de trabajo',
  [StockMovementOrigin.SALE]: 'Venta',
  [StockMovementOrigin.INTERNAL_CONSUMPTION]: 'Consumo interno',
  [StockMovementOrigin.RETURN]: 'Retorno',
  [StockMovementOrigin.REFURBISH]: 'Reacondicionamiento',
  [StockMovementOrigin.ADJUSTMENT]: 'Ajuste',
  [StockMovementOrigin.WRITE_OFF]: 'Baja',
  [StockMovementOrigin.COUNTER_PURCHASE]: 'Compra de mostrador',
};

export const STOCK_ADJUSTMENT_REASON_LABELS: Record<StockAdjustmentReason, string> = {
  [StockAdjustmentReason.CYCLE_COUNT]: 'Conteo físico',
  [StockAdjustmentReason.DAMAGE]: 'Daño o deterioro',
  [StockAdjustmentReason.INITIAL_LOAD]: 'Carga inicial',
  [StockAdjustmentReason.CORRECTION]: 'Corrección de registro',
  [StockAdjustmentReason.LOSS]: 'Pérdida o faltante',
  [StockAdjustmentReason.FOUND]: 'Sobrante encontrado',
  [StockAdjustmentReason.OTHER]: 'Otro',
};

export const WRITE_OFF_REASON_LABELS: Record<WriteOffReason, string> = {
  [WriteOffReason.DAMAGED]: 'Daño',
  [WriteOffReason.OBSOLETE]: 'Obsolescencia',
  [WriteOffReason.LOST]: 'Pérdida',
  [WriteOffReason.STOLEN]: 'Hurto',
  [WriteOffReason.EXPIRED]: 'Vencimiento',
  [WriteOffReason.OTHER]: 'Otro',
};

export const WRITE_OFF_STATUS_LABELS: Record<WriteOffStatus, string> = {
  [WriteOffStatus.REQUESTED]: 'Solicitada',
  [WriteOffStatus.PENDING_APPROVAL]: 'Pendiente de aprobación',
  [WriteOffStatus.APPROVED]: 'Aprobada',
  [WriteOffStatus.REJECTED]: 'Rechazada',
  [WriteOffStatus.COMPLETED]: 'Completada',
};

export const STOCK_ISSUE_TYPE_LABELS: Record<StockIssueType, string> = {
  [StockIssueType.TECHNICIAN_CUSTODY]: 'Entrega a técnico',
  [StockIssueType.CREW_CUSTODY]: 'Entrega a cuadrilla',
  [StockIssueType.OFFICE_REPLENISHMENT]: 'Reposición oficina',
  [StockIssueType.NODE_REPLENISHMENT]: 'Reposición nodo',
  [StockIssueType.SALE_DISPATCH]: 'Salida por venta',
  [StockIssueType.INTERNAL_CONSUMPTION]: 'Consumo interno',
  [StockIssueType.WAREHOUSE_TO_WAREHOUSE]: 'Entre bodegas',
};

export const STOCK_ISSUE_TYPE_HELPER_LABELS: Record<StockIssueType, string> = {
  [StockIssueType.TECHNICIAN_CUSTODY]: 'Entrega material a un técnico que trabajará en campo.',
  [StockIssueType.CREW_CUSTODY]: 'Entrega material a una cuadrilla que trabajará en campo.',
  [StockIssueType.OFFICE_REPLENISHMENT]: 'Reposición de bodega de oficina desde bodega principal.',
  [StockIssueType.NODE_REPLENISHMENT]: 'Reposición de bodega de nodo desde bodega principal.',
  [StockIssueType.SALE_DISPATCH]: 'Salida vinculada a una venta o referencia comercial.',
  [StockIssueType.INTERNAL_CONSUMPTION]:
    'Consumo interno con centro de costo y motivo obligatorios.',
  [StockIssueType.WAREHOUSE_TO_WAREHOUSE]: 'Traslado entre bodegas internas.',
};

export const STOCK_ISSUE_STATUS_LABELS: Record<StockIssueStatus, string> = {
  [StockIssueStatus.DRAFT]: 'Borrador',
  [StockIssueStatus.REQUESTED]: 'Solicitada',
  [StockIssueStatus.APPROVED]: 'Aprobada',
  [StockIssueStatus.PICKING]: 'En preparación',
  [StockIssueStatus.READY_TO_DISPATCH]: 'Lista para despacho',
  [StockIssueStatus.DISPATCHED]: 'Despachada',
  [StockIssueStatus.RECEIVED]: 'Recibida',
  [StockIssueStatus.CANCELLED]: 'Cancelada',
};

export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  [StockCountStatus.OPEN]: 'Abierto',
  [StockCountStatus.COUNTING]: 'En conteo',
  [StockCountStatus.CLOSED]: 'Cerrado',
  [StockCountStatus.CANCELLED]: 'Cancelado',
};

export const STOCK_ISSUE_HANDOFF_METHOD_OPTIONS = [
  { value: 'ACTA', label: 'Acta de entrega' },
  { value: 'FIRMA', label: 'Entrega firmada' },
  { value: 'GUIA', label: 'Guía de despacho' },
  { value: 'CORREO', label: 'Constancia por correo' },
] as const;

export function getStockIssueHandoffMethodLabel(value: string): string {
  const match = STOCK_ISSUE_HANDOFF_METHOD_OPTIONS.find((option) => option.value === value);
  return match?.label ?? value;
}

export function getWriteOffStatusLabel(value: WriteOffStatus): string {
  return resolveLabel(value, WRITE_OFF_STATUS_LABELS);
}

export function getInventoryItemKindLabel(value: InventoryItemKind): string {
  return resolveLabel(value, INVENTORY_ITEM_KIND_LABELS);
}

export function getInventoryItemCategoryLabel(value: InventoryItemCategory): string {
  return resolveLabel(value, INVENTORY_ITEM_CATEGORY_LABELS);
}

export function getInventoryItemStatusLabel(value: InventoryItemStatus): string {
  return resolveLabel(value, INVENTORY_ITEM_STATUS_LABELS);
}

export type InventoryBadgeVariant = 'neutral' | 'primary' | 'warning' | 'error' | 'success';

export function getInventoryItemStatusBadgeVariant(
  value: InventoryItemStatus,
): InventoryBadgeVariant {
  switch (value) {
    case InventoryItemStatus.ACTIVE:
      return 'success';
    case InventoryItemStatus.INACTIVE:
      return 'neutral';
    case InventoryItemStatus.DISCONTINUED:
      return 'warning';
    default:
      return 'neutral';
  }
}

export function getInventoryTrackingModeLabel(value: InventoryTrackingMode): string {
  return resolveLabel(value, INVENTORY_TRACKING_MODE_LABELS);
}

/* ————————————————————————————————————————————————————————————————
 * Código de barras (MOD12 · F4 · PRD §11 delta v1.1).
 * Etiquetas en español para el Select de formato: nunca el enum crudo en
 * vistas finales (system-vocabulary-review). La validación por formato vive
 * en `@iwana/shared` (`validateBarcodeValue`); el backend es autoritativo.
 * ———————————————————————————————————————————————————————————————— */

export const INVENTORY_BARCODE_TYPE_LABELS: Record<InventoryBarcodeType, string> = {
  [InventoryBarcodeType.EAN13]: 'EAN-13',
  [InventoryBarcodeType.UPCA]: 'UPC-A',
  [InventoryBarcodeType.CODE128]: 'Code 128',
  [InventoryBarcodeType.OTHER]: 'Otro',
};

export function getInventoryBarcodeTypeLabel(value: InventoryBarcodeType): string {
  return resolveLabel(value, INVENTORY_BARCODE_TYPE_LABELS);
}

/** Opciones del Select de formato, derivadas del enum canónico (nunca hardcodeadas). */
export const INVENTORY_BARCODE_TYPE_OPTIONS: ReadonlyArray<{
  value: InventoryBarcodeType;
  label: string;
}> = Object.values(InventoryBarcodeType).map((value) => ({
  value,
  label: getInventoryBarcodeTypeLabel(value),
}));

/** Etiqueta del campo de captura (alta, edición y flujos con el producto en la mano). */
export const INVENTORY_BARCODE_LABEL = 'Código de barras';
/** Etiqueta del Select de formato junto al valor (regla «van juntos», CA-F4-08). */
export const INVENTORY_BARCODE_TYPE_LABEL = 'Formato del código';
/** Opción vacía del Select de formato: sin código no hay formato. */
export const INVENTORY_BARCODE_NO_CODE_LABEL = 'Sin código de barras';
/** Ayuda en el alta: opcional (regla 1) y fuera de la identidad del SKU (regla 5). */
export const INVENTORY_BARCODE_CREATE_HELP_TEXT =
  'Opcional. Sirve para identificar el producto al recibir, contar y despachar. No forma parte del código del producto.';
/** Ayuda en edición: editable tras crear (regla 6), a diferencia del código. */
export const INVENTORY_BARCODE_EDIT_HELP_TEXT =
  'Opcional. Se puede corregir después, a diferencia del código. Para quitarlo, deja vacíos el código y el formato.';
/** Mitad de la pareja sin formato (espejo cliente de CA-F4-08; el backend decide). */
export const INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE =
  'Indica el formato del código: el formato va junto al código.';
/** Mitad de la pareja sin valor (espejo cliente de CA-F4-08; el backend decide). */
export const INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE =
  'Indica el código junto al formato, o deja ambos vacíos.';

/**
 * Opciones de unidad base desde el catálogo canónico (ADR-085 D1 · F5a).
 * Derivadas de la única fuente en `@iwana/shared`: el usuario solo ve la
 * etiqueta en español (system-vocabulary-review: sin códigos crudos); el código
 * viaja como valor del Select y lo valida el backend.
 */
export const INVENTORY_UNIT_OF_MEASURE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = INVENTORY_UNITS_OF_MEASURE.map(({ code, label }) => ({ value: code, label }));

export function getStockLocationTypeLabel(value: StockLocationType): string {
  return resolveLabel(value, STOCK_LOCATION_TYPE_LABELS);
}

export function getStockLocationStatusLabel(value: StockLocationStatus): string {
  return resolveLabel(value, STOCK_LOCATION_STATUS_LABELS);
}

export function getStockLocationStatusBadgeVariant(
  value: StockLocationStatus,
): InventoryBadgeVariant {
  switch (value) {
    case StockLocationStatus.ACTIVE:
      return 'success';
    case StockLocationStatus.INACTIVE:
      return 'warning';
    case StockLocationStatus.ARCHIVED:
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function getStockLocationTypeBadgeVariant(value: StockLocationType): InventoryBadgeVariant {
  switch (value) {
    case StockLocationType.MOBILE_TECHNICIAN:
    case StockLocationType.MOBILE_CREW:
      return 'primary';
    case StockLocationType.QUARANTINE:
    case StockLocationType.REPAIR:
    case StockLocationType.SCRAP:
      return 'warning';
    default:
      return 'neutral';
  }
}

export function getStockBalanceConditionLabel(value: StockBalanceCondition): string {
  return resolveLabel(value, STOCK_BALANCE_CONDITION_LABELS);
}

export function getSerializedAssetStatusLabel(value: SerializedAssetStatus): string {
  return resolveLabel(value, SERIALIZED_ASSET_STATUS_LABELS);
}

export const ASSET_LIFECYCLE_EVENT_TYPE_LABELS: Record<AssetLifecycleEventType, string> = {
  [AssetLifecycleEventType.RECEIVED]: 'Recepción',
  [AssetLifecycleEventType.TRANSFERRED]: 'Transferencia',
  [AssetLifecycleEventType.INSTALLED]: 'Instalación',
  [AssetLifecycleEventType.RETURNED]: 'Retorno',
  [AssetLifecycleEventType.REPAIRED]: 'Reparación',
  [AssetLifecycleEventType.REFURBISHED]: 'Reacondicionamiento',
  [AssetLifecycleEventType.SOLD]: 'Venta',
  [AssetLifecycleEventType.CONSUMED]: 'Consumo interno',
  [AssetLifecycleEventType.WRITTEN_OFF]: 'Baja',
  [AssetLifecycleEventType.STATUS_CHANGED]: 'Cambio de estado',
};

export type UsefulLifeStatusLabel = 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';

export const USEFUL_LIFE_STATUS_LABELS: Record<UsefulLifeStatusLabel, string> = {
  'sin-dato': 'Sin dato',
  vigente: 'Vigente',
  'por-vencer': 'Por vencer',
  vencida: 'Vencida',
};

export type AssetLoanStatusLabel = 'abierto' | 'cerrado';

export const ASSET_LOAN_STATUS_LABELS: Record<AssetLoanStatusLabel, string> = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
};

export const INVENTORY_OPAQUE_REF_TYPE_LABELS = {
  subscriber: 'Suscriptor',
  contract: 'Contrato',
  technician: 'Técnico',
  executionOrder: 'Orden de trabajo',
  actor: 'Usuario',
} as const;

export type InventoryOpaqueRefType = keyof typeof INVENTORY_OPAQUE_REF_TYPE_LABELS;

export function formatInventoryOpaqueRef(
  type: InventoryOpaqueRefType,
  refId: string | null | undefined,
): string {
  const label = INVENTORY_OPAQUE_REF_TYPE_LABELS[type];
  const normalized = refId?.trim();
  if (!normalized) {
    return `${label} · sin referencia`;
  }

  const compact = normalized.replace(/-/g, '');
  if (compact.length <= 8) {
    return `${label} · ${compact.toLowerCase()}`;
  }

  const abbreviated = `${compact.slice(0, 4).toLowerCase()}…${compact.slice(-4).toLowerCase()}`;
  return `${label} · ${abbreviated}`;
}

export function getAssetLifecycleEventTypeLabel(value: AssetLifecycleEventType): string {
  return resolveLabel(value, ASSET_LIFECYCLE_EVENT_TYPE_LABELS);
}

export function getUsefulLifeStatusLabel(value: UsefulLifeStatusLabel): string {
  return resolveLabel(value, USEFUL_LIFE_STATUS_LABELS);
}

export function getAssetLoanStatusLabel(value: AssetLoanStatusLabel): string {
  return resolveLabel(value, ASSET_LOAN_STATUS_LABELS);
}

export function getWarrantyCoverageLabel(warrantyUntil: string | null | undefined): string {
  if (!warrantyUntil?.trim()) {
    return 'Sin fecha de garantía';
  }

  const end = new Date(warrantyUntil);
  if (Number.isNaN(end.getTime())) {
    return 'Sin fecha de garantía';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end >= today ? 'Garantía vigente' : 'Garantía vencida';
}

export function getPurchaseRequestStatusLabel(value: PurchaseRequestStatus): string {
  return resolveLabel(value, PURCHASE_REQUEST_STATUS_LABELS);
}

/**
 * Etiqueta del estado administrativo cuando la mercancía ya entró a bodega.
 *
 * `PurchaseRequestStatus` se detiene en `CONVERTED_TO_PO` por diseño del
 * dominio, así que sin este matiz una solicitud ya recibida se seguiría leyendo
 * como si la orden estuviera en curso.
 */
export const PURCHASE_REQUEST_RECEIVED_STATUS_LABEL = 'Recibida y cerrada';

export function getPurchaseRequestTypeLabel(value: PurchaseRequestType): string {
  return resolveLabel(value, PURCHASE_REQUEST_TYPE_LABELS);
}

export function getReplenishmentCriticalityLabel(value: ReplenishmentCriticalityLabel): string {
  return resolveLabel(value, REPLENISHMENT_CRITICALITY_LABELS);
}

export function getPurchaseRequestTypeHelperLabel(value: PurchaseRequestType): string {
  return resolveLabel(value, PURCHASE_REQUEST_TYPE_HELPER_LABELS);
}

export function getPurchaseRequestPriorityLabel(value: PurchaseRequestPriority): string {
  return resolveLabel(value, PURCHASE_REQUEST_PRIORITY_LABELS);
}

export function getPurchaseRequestLineStatusLabel(value: PurchaseRequestLineStatus): string {
  return resolveLabel(value, PURCHASE_REQUEST_LINE_STATUS_LABELS);
}

export function getPurchaseRequestLineSourceLabel(value: PurchaseRequestLineSourceKind): string {
  return resolveLabel(value, PURCHASE_REQUEST_LINE_SOURCE_LABELS);
}

export function getPurchaseRequestLineSourceHelperLabel(
  value: PurchaseRequestLineSourceKind,
): string {
  return resolveLabel(value, PURCHASE_REQUEST_LINE_SOURCE_HELPER_LABELS);
}

export function getPurchaseOrderStatusLabel(value: PurchaseOrderStatus): string {
  return resolveLabel(value, PURCHASE_ORDER_STATUS_LABELS);
}

export function getPurchaseRfqStatusLabel(value: PurchaseRfqStatus): string {
  return resolveLabel(value, PURCHASE_RFQ_STATUS_LABELS);
}

export function getPurchaseRfqInvitationStatusLabel(value: PurchaseRfqInvitationStatus): string {
  return resolveLabel(value, RFQ_INVITATION_STATUS_LABELS);
}

export function getPurchaseRfqInvitationStatusBadgeVariant(
  value: PurchaseRfqInvitationStatus,
): 'primary' | 'neutral' | 'success' | 'warning' | 'error' {
  const variants: Record<
    PurchaseRfqInvitationStatus,
    'primary' | 'neutral' | 'success' | 'warning' | 'error'
  > = {
    [PurchaseRfqInvitationStatus.INVITED]: 'primary',
    [PurchaseRfqInvitationStatus.RESPONDED]: 'success',
    [PurchaseRfqInvitationStatus.DECLINED]: 'warning',
    [PurchaseRfqInvitationStatus.EXPIRED]: 'neutral',
    [PurchaseRfqInvitationStatus.CANCELLED]: 'error',
  };

  return variants[value] ?? 'neutral';
}

export function getGoodsReceiptStatusLabel(value: GoodsReceiptStatus): string {
  return resolveLabel(value, GOODS_RECEIPT_STATUS_LABELS);
}

export function getInventoryResponsibleTypeLabel(value: InventoryResponsibleType): string {
  return resolveLabel(value, INVENTORY_RESPONSIBLE_TYPE_LABELS);
}

export function getStockMovementOriginLabel(value: StockMovementOrigin): string {
  return resolveLabel(value, STOCK_MOVEMENT_ORIGIN_LABELS);
}

export function getStockAdjustmentReasonLabel(value: StockAdjustmentReason): string {
  return resolveLabel(value, STOCK_ADJUSTMENT_REASON_LABELS);
}

export function getWriteOffReasonLabel(value: WriteOffReason): string {
  return resolveLabel(value, WRITE_OFF_REASON_LABELS);
}

export function getStockIssueTypeLabel(value: StockIssueType): string {
  return resolveLabel(value, STOCK_ISSUE_TYPE_LABELS);
}

export function getStockIssueTypeHelperLabel(value: StockIssueType): string {
  return resolveLabel(value, STOCK_ISSUE_TYPE_HELPER_LABELS);
}

export function getStockIssueStatusLabel(value: StockIssueStatus): string {
  return resolveLabel(value, STOCK_ISSUE_STATUS_LABELS);
}

export function getStockCountStatusLabel(value: StockCountStatus): string {
  return resolveLabel(value, STOCK_COUNT_STATUS_LABELS);
}

export function getStockIssueStatusBadgeVariant(value: StockIssueStatus): PurchaseBadgeVariant {
  return STOCK_ISSUE_STATUS_VARIANTS[value] ?? 'neutral';
}

export function getStockCountStatusBadgeVariant(value: StockCountStatus): PurchaseBadgeVariant {
  return STOCK_COUNT_STATUS_VARIANTS[value] ?? 'neutral';
}

export function getStockIssueTypeBadgeVariant(value: StockIssueType): PurchaseBadgeVariant {
  return STOCK_ISSUE_TYPE_VARIANTS[value] ?? 'neutral';
}

export function formatInventoryDate(value: string | null | undefined): string {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

/** Primera fecha usable (ignora `null`, `undefined` y string vacío). */
export function coalesceInventoryDate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function formatInventoryDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatInventoryCurrency(value: string | number | null | undefined): string {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

/** Dos decimales COP. Solo superficies de cotización (subtotales, tributos, neto). */
export function formatInventoryMoney(value: string | number | null | undefined): string {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

const APPROVAL_LEVEL_LABELS: Record<string, string> = {
  BUYER: 'Comprador',
  BUYER_MANAGER: 'Jefe de compras',
  DIRECTOR: 'Dirección',
  MANAGER: 'Gerencia',
  SUPERVISOR: 'Supervisión',
};

export function getApprovalLevelLabel(level: string | null | undefined): string {
  if (!level) {
    return 'Nivel no definido';
  }
  return APPROVAL_LEVEL_LABELS[level] ?? 'Nivel no definido';
}

export function getSupplierDisplayLabel(
  partyRefId: string | null | undefined,
  supplierLabels?: Record<string, string>,
): string {
  if (!partyRefId) {
    return 'Proveedor no identificado';
  }
  const label = supplierLabels?.[partyRefId]?.trim();
  return label || 'Proveedor no identificado';
}

export function formatInventoryQuantity(value: string | number | null | undefined): string {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export type PurchaseBadgeVariant = 'neutral' | 'primary' | 'warning' | 'error' | 'success' | 'info';

export function getUsefulLifeStatusBadgeVariant(
  value: UsefulLifeStatusLabel,
): PurchaseBadgeVariant {
  switch (value) {
    case 'vigente':
      return 'success';
    case 'por-vencer':
      return 'warning';
    case 'vencida':
      return 'error';
    default:
      return 'neutral';
  }
}

export const PURCHASE_REQUEST_STATUS_VARIANTS: Record<PurchaseRequestStatus, PurchaseBadgeVariant> =
  {
    [PurchaseRequestStatus.DRAFT]: 'neutral',
    [PurchaseRequestStatus.PENDING_QUOTES]: 'primary',
    [PurchaseRequestStatus.PENDING_APPROVAL]: 'warning',
    [PurchaseRequestStatus.APPROVED]: 'success',
    [PurchaseRequestStatus.REJECTED]: 'error',
    [PurchaseRequestStatus.CONVERTED_TO_PO]: 'success',
    [PurchaseRequestStatus.CANCELLED]: 'error',
  };

export const PURCHASE_REQUEST_PRIORITY_VARIANTS: Record<
  PurchaseRequestPriority,
  PurchaseBadgeVariant
> = {
  [PurchaseRequestPriority.LOW]: 'neutral',
  [PurchaseRequestPriority.NORMAL]: 'neutral',
  [PurchaseRequestPriority.HIGH]: 'warning',
  [PurchaseRequestPriority.URGENT]: 'error',
};

export const STOCK_ISSUE_STATUS_VARIANTS: Record<StockIssueStatus, PurchaseBadgeVariant> = {
  [StockIssueStatus.DRAFT]: 'neutral',
  [StockIssueStatus.REQUESTED]: 'primary',
  [StockIssueStatus.APPROVED]: 'info',
  [StockIssueStatus.PICKING]: 'warning',
  [StockIssueStatus.READY_TO_DISPATCH]: 'warning',
  [StockIssueStatus.DISPATCHED]: 'success',
  [StockIssueStatus.RECEIVED]: 'success',
  [StockIssueStatus.CANCELLED]: 'error',
};

export const STOCK_COUNT_STATUS_VARIANTS: Record<StockCountStatus, PurchaseBadgeVariant> = {
  [StockCountStatus.OPEN]: 'neutral',
  [StockCountStatus.COUNTING]: 'primary',
  [StockCountStatus.CLOSED]: 'success',
  [StockCountStatus.CANCELLED]: 'error',
};

export const STOCK_ISSUE_TYPE_VARIANTS: Record<StockIssueType, PurchaseBadgeVariant> = {
  [StockIssueType.TECHNICIAN_CUSTODY]: 'primary',
  [StockIssueType.CREW_CUSTODY]: 'primary',
  [StockIssueType.OFFICE_REPLENISHMENT]: 'neutral',
  [StockIssueType.NODE_REPLENISHMENT]: 'neutral',
  [StockIssueType.SALE_DISPATCH]: 'info',
  [StockIssueType.INTERNAL_CONSUMPTION]: 'warning',
  [StockIssueType.WAREHOUSE_TO_WAREHOUSE]: 'neutral',
};

export function getPurchaseRequestStatusBadgeVariant(
  value: PurchaseRequestStatus,
): PurchaseBadgeVariant {
  return PURCHASE_REQUEST_STATUS_VARIANTS[value] ?? 'neutral';
}

export interface PurchaseRequestDisplayStatus {
  label: string;
  variant: PurchaseBadgeVariant;
}

/**
 * Estado visible de una solicitud de compra: único punto que combina el ciclo
 * administrativo (`status`) con el eje de abastecimiento (`fulfillmentStatus`).
 *
 * Toda vista que pinte el estado de una solicitud debe pasar por aquí para que
 * la celda del listado y la ficha del workbench no diverjan.
 */
export function getPurchaseRequestDisplayStatus(
  request: PurchaseRequestFulfillmentSource,
): PurchaseRequestDisplayStatus {
  if (
    request.status === PurchaseRequestStatus.CONVERTED_TO_PO &&
    isPurchaseRequestFullyReceived(request)
  ) {
    return { label: PURCHASE_REQUEST_RECEIVED_STATUS_LABEL, variant: 'success' };
  }

  return {
    label: getPurchaseRequestStatusLabel(request.status),
    variant: getPurchaseRequestStatusBadgeVariant(request.status),
  };
}

export function getPurchaseRequestPriorityBadgeVariant(
  value: PurchaseRequestPriority,
): PurchaseBadgeVariant {
  return PURCHASE_REQUEST_PRIORITY_VARIANTS[value] ?? 'neutral';
}

export function getPartyStatusLabel(value: string): string {
  if (value in PARTY_STATUS_LABELS) {
    return PARTY_STATUS_LABELS[value as PartyStatus];
  }

  return 'Estado desconocido';
}

export function getSupplierProfileStatusLabel(value: SupplierProfileStatus): string {
  return resolveLabel(value, SUPPLIER_STATUS_LABELS);
}

export function getSupplierProfileStatusBadgeVariant(
  value: SupplierProfileStatus,
): InventoryBadgeVariant {
  switch (value) {
    case SupplierProfileStatus.ACTIVE:
      return 'success';
    case SupplierProfileStatus.INACTIVE:
      return 'neutral';
    case SupplierProfileStatus.BLOCKED:
      return 'error';
    default:
      return 'neutral';
  }
}

/**
 * Trío canónico de existencias (Fase 03B). «Disponible» siempre es existencia − reservado:
 * el backend rechaza salidas y traslados que superen el disponible, así que la UI debe
 * ofrecer exactamente la misma cifra para no prometer material ya comprometido.
 */
export const STOCK_ON_HAND_LABEL = 'Existencia';
export const STOCK_RESERVED_LABEL = 'Reservado';
export const STOCK_AVAILABLE_LABEL = 'Disponible';
export const STOCK_AVAILABLE_AT_SOURCE_LABEL = 'Disponible en origen';

/** Ayuda breve para explicar de dónde sale la columna «Reservado». */
export const STOCK_RESERVED_HELP_TEXT =
  'Reservado: material apartado por salidas pendientes de despacho. El disponible es la existencia menos lo reservado.';

/** Próximo paso accionable cuando el material comprometido bloquea una operación. */
export const STOCK_COMMITTED_NEXT_STEP_TEXT =
  'Para liberar material, despacha o cancela las salidas abiertas que lo tienen reservado.';

/** Vocabulario canónico de costeo (ADR-059 / D-F4-9). Nunca «móvil», «medio» ni averageCost crudo. */
export const INVENTORY_AVERAGE_COST_LABEL = 'Costo promedio';
export const INVENTORY_LAST_PURCHASE_COST_LABEL = 'Último costo de compra';
export const INVENTORY_UNIT_COST_LABEL = 'Costo unitario';
export const INVENTORY_STANDARD_COST_LABEL = 'Costo estándar';
export const INVENTORY_ESTIMATED_VALUE_LABEL = 'Valor estimado de inventario';
export const INVENTORY_NO_COST_LABEL = 'Sin costo';

/** Ayuda del costo promedio en detalle/form de ítem. */
export const INVENTORY_AVERAGE_COST_HELP_TEXT =
  'Se actualiza al recibir compras. Es la referencia para valorar existencias y registrar el costo en salidas.';

/** Nota de transparencia del KPI de valoración (F2 + F4). */
export const INVENTORY_ESTIMATED_VALUE_HELP_TEXT =
  'Basado en el costo promedio de cada producto. Estimación operativa, no contable ni fiscal.';

type InventoryCostFields = {
  averageCost?: string | null;
  lastPurchaseCost?: string | null;
  standardCost?: string | null;
  baseCost?: string | null;
};

/**
 * Cadena de valoración D-F4-8: averageCost → lastPurchaseCost → standardCost → baseCost.
 * Devuelve el primer valor > 0, o null si no hay costo usable.
 */
export function resolveInventoryValuationUnitCost(item: InventoryCostFields): string | null {
  const chain = [item.averageCost, item.lastPurchaseCost, item.standardCost, item.baseCost];
  for (const value of chain) {
    if (value == null || value === '') {
      continue;
    }
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return value;
    }
  }
  return null;
}

/** Formatea un costo o muestra «Sin costo» cuando es nulo/0. */
export function formatInventoryCostOrNone(value: string | number | null | undefined): string {
  if (value == null || value === '') {
    return INVENTORY_NO_COST_LABEL;
  }
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return INVENTORY_NO_COST_LABEL;
  }
  return formatInventoryCurrency(numeric);
}

/* ————————————————————————————————————————————————————————————————
 * Drawer de catálogo · secciones Compras, Inventario y Activos (F1).
 * Copy exacto de docs/specs/2026-09-02-mod12-catalogo-drawer-secciones-f1-ux.md §3/§6/§7/§8.
 * Unidad de compra y factor incorporados el 2026-09-03 tras completarse
 * F5a/F5b del ADR-085 (la sección ya estaba diseñada para recibirlos, §9).
 * ———————————————————————————————————————————————————————————————— */

/** Descripción del header del drawer de edición de catálogo (spec §2.3). */
export const INVENTORY_CATALOG_DRAWER_DESCRIPTION =
  'Edita los datos del producto: identificación, compras, inventario, activos y relación comercial.';

/**
 * Ayuda del bloque Costos del drawer (spec §4). No pisa
 * `INVENTORY_AVERAGE_COST_HELP_TEXT`: esa constante se consume en otras superficies.
 */
export const INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT =
  'El costo promedio y el último costo de compra se actualizan al recibir compras. El costo estándar se captura en la sección Compras.';

/** Secciones del drawer de catálogo (HLD §7, spec §2.1/§3). */
export const INVENTORY_CATALOG_PURCHASING_SECTION_TITLE = 'Compras';
export const INVENTORY_CATALOG_PURCHASING_SECTION_DESCRIPTION =
  'Define si el producto se puede comprar y sus condiciones de abastecimiento.';
export const INVENTORY_CATALOG_INVENTORY_SECTION_TITLE = 'Inventario';
export const INVENTORY_CATALOG_INVENTORY_SECTION_DESCRIPTION =
  'Define si el producto se controla en bodega y sus niveles de referencia.';
export const INVENTORY_CATALOG_ASSETS_SECTION_TITLE = 'Activos';
export const INVENTORY_CATALOG_ASSETS_SECTION_DESCRIPTION =
  'Define si el producto se gestiona como activo y su vida útil.';

/** Sección Compras — comprable y proveedor (spec §3.1/§7). */
export const INVENTORY_CATALOG_PURCHASABLE_LABEL = 'Comprable';
export const INVENTORY_CATALOG_PURCHASABLE_HELP_TEXT =
  'Si lo activas, el producto aparece en el selector de compras.';
export const INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL = 'Proveedor preferido';
export const INVENTORY_CATALOG_PREFERRED_SUPPLIER_HELP_TEXT =
  'Proveedor que el sistema sugiere en solicitudes de compra.';
export const INVENTORY_CATALOG_NO_PREFERRED_SUPPLIER_LABEL = 'Sin proveedor preferido';
export const INVENTORY_CATALOG_SUPPLIERS_LOADING_LABEL = 'Cargando proveedores…';
export const INVENTORY_CATALOG_SUPPLIERS_LOADING_HELP_TEXT = 'Cargando la lista de proveedores.';
export const INVENTORY_CATALOG_SUPPLIERS_LOAD_ERROR_HELP_TEXT =
  'No pudimos cargar la lista de proveedores. Reintenta abriendo de nuevo el producto.';
export const INVENTORY_CATALOG_SUPPLIERS_NO_PERMISSION_HELP_TEXT =
  'Para cambiar el proveedor necesitas acceso al módulo de Compras.';
export const INVENTORY_CATALOG_NO_SUPPLIERS_REGISTERED_LABEL = 'Sin proveedores registrados';
export const INVENTORY_CATALOG_NO_SUPPLIERS_HELP_TEXT = 'Puedes crearlos en Compras > Proveedores.';
export const INVENTORY_CATALOG_SAVED_SUPPLIER_LABEL = 'Proveedor guardado';

/** Sección Compras — referencia y costos de captura (spec §3.1). */
export const INVENTORY_CATALOG_SUPPLIER_SKU_LABEL = 'Código del proveedor';
export const INVENTORY_CATALOG_SUPPLIER_SKU_HELP_TEXT =
  'Referencia con la que el proveedor identifica este producto.';
export const INVENTORY_CATALOG_BASE_COST_LABEL = 'Costo base';
export const INVENTORY_CATALOG_BASE_COST_HELP_TEXT =
  'Costo de compra de referencia para este producto.';
export const INVENTORY_CATALOG_COST_NEGATIVE_ERROR = 'El costo no puede ser negativo.';
export const INVENTORY_CATALOG_STANDARD_COST_HELP_TEXT =
  'Costo de referencia para valoración y compras. Se muestra también en la sección Costos.';

/** Sección Compras — condiciones de compra (spec §3.1). */
export const INVENTORY_CATALOG_MINIMUM_ORDER_QTY_LABEL = 'Cantidad mínima de compra';
export const INVENTORY_CATALOG_MINIMUM_ORDER_QTY_HELP_TEXT =
  'Cantidad mínima que el proveedor acepta por pedido.';
export const INVENTORY_CATALOG_ORDER_MULTIPLE_LABEL = 'Múltiplo de compra';
export const INVENTORY_CATALOG_ORDER_MULTIPLE_HELP_TEXT =
  'El pedido se ajusta a múltiplos de esta cantidad.';
export const INVENTORY_CATALOG_POSITIVE_QTY_ERROR = 'Debe ser mayor que cero.';
export const INVENTORY_CATALOG_LEAD_TIME_LABEL = 'Tiempo de entrega (días)';
export const INVENTORY_CATALOG_LEAD_TIME_HELP_TEXT =
  'Días entre que se hace el pedido y se recibe el producto.';
export const INVENTORY_CATALOG_LEAD_TIME_ERROR = 'Debe ser un número entero mayor o igual a cero.';

/** Sección Compras — unidad de compra y factor de conversión (ADR-085 D1/D2 · incorporación 2026-09-03). */
export const INVENTORY_CATALOG_PURCHASE_UOM_LABEL = 'Unidad de compra';
export const INVENTORY_CATALOG_PURCHASE_UOM_NO_UNIT_LABEL = 'Sin unidad de compra';
export const INVENTORY_CATALOG_PURCHASE_UOM_HELP_TEXT =
  'Unidad en la que el proveedor entrega el producto. Junto con el factor de conversión determina a cuántas unidades base equivale una compra.';
export const INVENTORY_CATALOG_PURCHASE_UOM_DIMENSION_ERROR =
  'La conversión solo es válida entre unidades de la misma dimensión: longitud con longitud, masa con masa, volumen con volumen. Las unidades de empaque (caja, rollo, paquete) sí conviven con unidad.';
export const INVENTORY_CATALOG_PURCHASE_FACTOR_LABEL = 'Factor de conversión a unidad base';
export const INVENTORY_CATALOG_PURCHASE_FACTOR_HELP_TEXT =
  'Cuántas unidades base trae una unidad de compra. Ejemplo: 1 caja = 100 unidades.';
export const INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR =
  'Con unidad de compra, el factor de conversión debe ser mayor que cero.';

/** Sección Inventario (spec §3.2). */
export const INVENTORY_CATALOG_INVENTORY_CONTROLLED_LABEL = 'Control de inventario';
export const INVENTORY_CATALOG_INVENTORY_CONTROLLED_HELP_TEXT =
  'Actívalo si el producto se recibe, almacena y descuenta en bodegas.';
export const INVENTORY_CATALOG_MINIMUM_STOCK_LABEL = 'Stock mínimo';
export const INVENTORY_CATALOG_MINIMUM_STOCK_HELP_TEXT =
  'Si las existencias bajan de este valor, el producto aparece en Productos bajo mínimo.';
export const INVENTORY_CATALOG_TARGET_STOCK_LABEL = 'Stock objetivo';
export const INVENTORY_CATALOG_TARGET_STOCK_HELP_TEXT =
  'Cantidad deseada en bodega cuando el producto está bien abastecido.';
export const INVENTORY_CATALOG_STOCK_NEGATIVE_ERROR = 'No puede ser negativo.';
export const INVENTORY_CATALOG_REORDER_POINT_LABEL = 'Punto de reorden';
export const INVENTORY_CATALOG_REORDER_POINT_HELP_TEXT =
  'Nivel de referencia para sugerir reposición.';
export const INVENTORY_CATALOG_REORDER_POINT_NEGATIVE_ERROR =
  'El punto de reorden no puede ser negativo.';

/** Sección Activos (spec §3.3/§8.1). */
export const INVENTORY_CATALOG_ASSET_CONTROLLED_LABEL = 'Control de activo';
export const INVENTORY_CATALOG_ASSET_CONTROLLED_HELP_TEXT =
  'Actívalo si el producto se gestiona como activo con ciclo de vida: asignación, instalación y baja.';
export const INVENTORY_CATALOG_ASSET_CONTROLLED_LOCKED_HELP_TEXT =
  'Los productos con serial o activo fijo requieren control de activo.';
export const INVENTORY_CATALOG_USEFUL_LIFE_LABEL = 'Vida útil (meses)';
export const INVENTORY_CATALOG_USEFUL_LIFE_HELP_TEXT =
  'Meses de vida útil esperada del activo. Alimenta las alertas de vencimiento.';
export const INVENTORY_CATALOG_USEFUL_LIFE_ERROR = 'Debe ser un número entero mayor que cero.';

/* ————————————————————————————————————————————————————————————————
 * Fase S2 · Coherencia del maestro (spec 2026-09-05 §4, copy aprobado G1 §A5).
 * Error espejo del backend (`refineInventoryItemMaster`, dto/index.ts) y guía
 * proactiva en ambas direcciones del drawer de catálogo.
 * ———————————————————————————————————————————————————————————————— */

/** Error S2 · CA-S2-01: espejo del mensaje de la API (copy G1 §A5.1). */
export const INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE =
  'Tipo de producto y Control de material no coinciden: un producto "Con serial" debe tener Control de material "Con serial" o "Activo fijo". Ajusta Control de material para guardar.';

/** helperText del Select «Tipo de producto» (copy G1 §A5.2). */
export const INVENTORY_CATALOG_ITEM_KIND_HELP_TEXT =
  'Al elegir "Con serial", Control de material se ajusta a "Con serial"; luego puedes cambiarlo a "Activo fijo".';

/** helperText del Select «Control de material» (dirección inversa, ajuste G1 de AI-PROD-UX). */
export const INVENTORY_CATALOG_TRACKING_MODE_HELP_TEXT =
  'Al elegir "Con serial" o "Activo fijo", Tipo de producto se ajusta a "Con serial".';
