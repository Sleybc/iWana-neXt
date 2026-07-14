'use client';

import {
  GoodsReceiptStatus,
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
  StockBalanceCondition,
  StockIssueStatus,
  StockIssueType,
  StockLocationStatus,
  StockLocationType,
  StockMovementOrigin,
  SupplierProfileStatus,
  WriteOffReason,
  WriteOffStatus,
} from '@iwana/shared';

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

export function getPurchaseRequestStatusLabel(value: PurchaseRequestStatus): string {
  return resolveLabel(value, PURCHASE_REQUEST_STATUS_LABELS);
}

export function getPurchaseRequestTypeLabel(value: PurchaseRequestType): string {
  return resolveLabel(value, PURCHASE_REQUEST_TYPE_LABELS);
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

export function getStockIssueStatusBadgeVariant(value: StockIssueStatus): PurchaseBadgeVariant {
  return STOCK_ISSUE_STATUS_VARIANTS[value] ?? 'neutral';
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

export function formatInventoryQuantity(value: string | number | null | undefined): string {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export type PurchaseBadgeVariant = 'neutral' | 'primary' | 'warning' | 'error' | 'success' | 'info';

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
