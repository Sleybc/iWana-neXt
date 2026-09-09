'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, CheckboxCard, Input, Select } from '@iwana/ui';
import {
  areInventoryUnitsDimensionallyCompatible,
  InventoryBarcodeType,
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
  validateBarcodeValue,
} from '@iwana/shared';
import type {
  InventoryCategoryRecord,
  InventoryItemRecord,
  UpdateInventoryItemDto,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalSectionHeader,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { useDiscardChangesGuard } from '@/components/shared/use-discard-changes-guard';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { InventoryMetaItem } from './InventoryMetaItem';
import { InventorySideDrawerShell } from './InventorySideDrawerShell';
import {
  formatInventoryCostOrNone,
  getInventoryItemKindLabel,
  getInventoryItemStatusBadgeVariant,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_BARCODE_EDIT_HELP_TEXT,
  INVENTORY_BARCODE_LABEL,
  INVENTORY_BARCODE_NO_CODE_LABEL,
  INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE,
  INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE,
  INVENTORY_BARCODE_TYPE_LABEL,
  INVENTORY_BARCODE_TYPE_OPTIONS,
  INVENTORY_CATALOG_ASSET_CONTROLLED_HELP_TEXT,
  INVENTORY_CATALOG_ASSET_CONTROLLED_LABEL,
  INVENTORY_CATALOG_ASSET_CONTROLLED_LOCKED_HELP_TEXT,
  INVENTORY_CATALOG_ASSETS_SECTION_DESCRIPTION,
  INVENTORY_CATALOG_ASSETS_SECTION_TITLE,
  INVENTORY_CATALOG_BASE_COST_HELP_TEXT,
  INVENTORY_CATALOG_BASE_COST_LABEL,
  INVENTORY_CATALOG_COST_NEGATIVE_ERROR,
  INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT,
  INVENTORY_CATALOG_DRAWER_DESCRIPTION,
  INVENTORY_CATALOG_INVENTORY_CONTROLLED_HELP_TEXT,
  INVENTORY_CATALOG_INVENTORY_CONTROLLED_LABEL,
  INVENTORY_CATALOG_INVENTORY_SECTION_DESCRIPTION,
  INVENTORY_CATALOG_INVENTORY_SECTION_TITLE,
  INVENTORY_CATALOG_ITEM_KIND_HELP_TEXT,
  INVENTORY_CATALOG_LEAD_TIME_ERROR,
  INVENTORY_CATALOG_LEAD_TIME_HELP_TEXT,
  INVENTORY_CATALOG_LEAD_TIME_LABEL,
  INVENTORY_CATALOG_MINIMUM_ORDER_QTY_HELP_TEXT,
  INVENTORY_CATALOG_MINIMUM_ORDER_QTY_LABEL,
  INVENTORY_CATALOG_MINIMUM_STOCK_HELP_TEXT,
  INVENTORY_CATALOG_MINIMUM_STOCK_LABEL,
  INVENTORY_CATALOG_NO_PREFERRED_SUPPLIER_LABEL,
  INVENTORY_CATALOG_NO_SUPPLIERS_HELP_TEXT,
  INVENTORY_CATALOG_NO_SUPPLIERS_REGISTERED_LABEL,
  INVENTORY_CATALOG_ORDER_MULTIPLE_HELP_TEXT,
  INVENTORY_CATALOG_ORDER_MULTIPLE_LABEL,
  INVENTORY_CATALOG_POSITIVE_QTY_ERROR,
  INVENTORY_CATALOG_PREFERRED_SUPPLIER_HELP_TEXT,
  INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL,
  INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR,
  INVENTORY_CATALOG_PURCHASE_FACTOR_HELP_TEXT,
  INVENTORY_CATALOG_PURCHASE_FACTOR_LABEL,
  INVENTORY_CATALOG_PURCHASE_UOM_DIMENSION_ERROR,
  INVENTORY_CATALOG_PURCHASE_UOM_HELP_TEXT,
  INVENTORY_CATALOG_PURCHASE_UOM_LABEL,
  INVENTORY_CATALOG_PURCHASE_UOM_NO_UNIT_LABEL,
  INVENTORY_CATALOG_PURCHASABLE_HELP_TEXT,
  INVENTORY_CATALOG_PURCHASABLE_LABEL,
  INVENTORY_CATALOG_PURCHASING_SECTION_DESCRIPTION,
  INVENTORY_CATALOG_PURCHASING_SECTION_TITLE,
  INVENTORY_CATALOG_REORDER_POINT_HELP_TEXT,
  INVENTORY_CATALOG_REORDER_POINT_LABEL,
  INVENTORY_CATALOG_REORDER_POINT_NEGATIVE_ERROR,
  INVENTORY_CATALOG_SAVED_SUPPLIER_LABEL,
  INVENTORY_CATALOG_STANDARD_COST_HELP_TEXT,
  INVENTORY_CATALOG_STOCK_NEGATIVE_ERROR,
  INVENTORY_CATALOG_SUPPLIER_SKU_HELP_TEXT,
  INVENTORY_CATALOG_SUPPLIER_SKU_LABEL,
  INVENTORY_CATALOG_SUPPLIERS_LOAD_ERROR_HELP_TEXT,
  INVENTORY_CATALOG_SUPPLIERS_LOADING_HELP_TEXT,
  INVENTORY_CATALOG_SUPPLIERS_LOADING_LABEL,
  INVENTORY_CATALOG_SUPPLIERS_NO_PERMISSION_HELP_TEXT,
  INVENTORY_CATALOG_TARGET_STOCK_HELP_TEXT,
  INVENTORY_CATALOG_TARGET_STOCK_LABEL,
  INVENTORY_CATALOG_TRACKING_MODE_HELP_TEXT,
  INVENTORY_CATALOG_USEFUL_LIFE_ERROR,
  INVENTORY_CATALOG_USEFUL_LIFE_HELP_TEXT,
  INVENTORY_CATALOG_USEFUL_LIFE_LABEL,
  INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_STANDARD_COST_LABEL,
  INVENTORY_UNIT_OF_MEASURE_OPTIONS,
} from './inventory-labels';

export interface CatalogFormState {
  sku: string;
  name: string;
  description: string;
  brand: string;
  model: string;
  // F4 (PRD §11): par código + formato; '' en ambos = sin código (regla 1).
  // A diferencia del SKU, editable tras crear (regla 6).
  barcode: string;
  barcodeType: string;
  itemKind: InventoryItemKind;
  categoryId: string;
  trackingMode: InventoryTrackingMode;
  unitOfMeasure: string;
  status: InventoryItemStatus;
  commercialReferenceId: string;
  // F1 — secciones Compras, Inventario y Activos (spec §3/§5.1). Unidad de
  // compra y factor incorporados al completarse F5a/F5b (ADR-085, spec §9).
  purchasable: boolean;
  preferredSupplierRefId: string;
  supplierSku: string;
  purchaseUnitOfMeasure: string;
  purchaseToBaseUomFactor: string;
  baseCost: string;
  standardCost: string;
  minimumOrderQty: string;
  orderMultiple: string;
  leadTimeDays: string;
  inventoryControlled: boolean;
  minimumStock: string;
  reorderPoint: string;
  targetStock: string;
  assetControlled: boolean;
  usefulLifeMonths: string;
}

function defaultFormState(defaultCategoryId = ''): CatalogFormState {
  return {
    sku: '',
    name: '',
    description: '',
    brand: '',
    model: '',
    barcode: '',
    barcodeType: '',
    itemKind: InventoryItemKind.STOCK,
    categoryId: defaultCategoryId,
    trackingMode: InventoryTrackingMode.CONSUMABLE,
    // F5a (ADR-085 D1): valor inicial del catálogo canónico; el campo es Select, no texto libre.
    unitOfMeasure: 'UNIT',
    status: InventoryItemStatus.ACTIVE,
    commercialReferenceId: '',
    purchasable: true,
    preferredSupplierRefId: '',
    supplierSku: '',
    purchaseUnitOfMeasure: '',
    purchaseToBaseUomFactor: '',
    baseCost: '',
    standardCost: '',
    minimumOrderQty: '',
    orderMultiple: '',
    leadTimeDays: '',
    inventoryControlled: true,
    minimumStock: '',
    reorderPoint: '',
    targetStock: '',
    assetControlled: false,
    usefulLifeMonths: '',
  };
}

/** El backend exige assetControlled=true con serial o activo fijo (refineInventoryItemMaster). */
function requiresAssetControlled(trackingMode: InventoryTrackingMode): boolean {
  return (
    trackingMode === InventoryTrackingMode.SERIALIZED ||
    trackingMode === InventoryTrackingMode.FIXED_ASSET
  );
}

/**
 * Fase S2 (CA-S2-01): un Control de material serializado es «serial» o «activo
 * fijo»; mismo criterio que `requiresAssetControlled`, nombrado para leer el
 * cruce con Tipo de producto.
 */
function isSerializedTrackingMode(trackingMode: InventoryTrackingMode): boolean {
  return requiresAssetControlled(trackingMode);
}

function formFromItem(item: InventoryItemRecord): CatalogFormState {
  const trackingMode = item.trackingMode;
  return {
    sku: item.sku,
    name: item.name,
    description: item.description ?? '',
    brand: item.brand ?? '',
    model: item.model ?? '',
    barcode: item.barcode ?? '',
    barcodeType: item.barcodeType ?? '',
    itemKind: item.itemKind,
    categoryId: item.categoryId,
    trackingMode,
    unitOfMeasure: item.unitOfMeasure,
    status: item.status,
    commercialReferenceId: item.commercialReferenceId ?? '',
    purchasable: item.purchasable,
    preferredSupplierRefId: item.preferredSupplierRefId ?? '',
    supplierSku: item.supplierSku ?? '',
    purchaseUnitOfMeasure: item.purchaseUnitOfMeasure ?? '',
    purchaseToBaseUomFactor: item.purchaseToBaseUomFactor ?? '',
    baseCost: item.baseCost,
    standardCost: item.standardCost,
    minimumOrderQty: item.minimumOrderQty ?? '',
    orderMultiple: item.orderMultiple ?? '',
    leadTimeDays: item.leadTimeDays == null ? '' : String(item.leadTimeDays),
    inventoryControlled: item.inventoryControlled,
    minimumStock: item.minimumStock,
    reorderPoint: item.reorderPoint,
    targetStock: item.targetStock,
    // Guía proactiva (§8.1): el form ya fuerza true cuando la regla cruzada aplica.
    assetControlled: requiresAssetControlled(trackingMode) ? true : item.assetControlled,
    usefulLifeMonths: item.usefulLifeMonths == null ? '' : String(item.usefulLifeMonths),
  };
}

/** Numérico crudo del input → número finito o null (vacío o inválido). */
function parseCatalogDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

type CatalogNumericFieldKey =
  | 'baseCost'
  | 'standardCost'
  | 'minimumOrderQty'
  | 'orderMultiple'
  | 'leadTimeDays'
  | 'minimumStock'
  | 'reorderPoint'
  | 'targetStock'
  | 'usefulLifeMonths';

const CATALOG_NUMERIC_FIELD_KEYS: readonly CatalogNumericFieldKey[] = [
  'baseCost',
  'standardCost',
  'minimumOrderQty',
  'orderMultiple',
  'leadTimeDays',
  'minimumStock',
  'reorderPoint',
  'targetStock',
  'usefulLifeMonths',
];

/** Mensajes exactos de la spec §3; vacío = sin error (aplica default al enviar). */
function validateCatalogNumericField(key: CatalogNumericFieldKey, rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  switch (key) {
    case 'baseCost':
    case 'standardCost':
      return Number.isFinite(numeric) && numeric >= 0
        ? null
        : INVENTORY_CATALOG_COST_NEGATIVE_ERROR;
    case 'minimumOrderQty':
    case 'orderMultiple':
      return Number.isFinite(numeric) && numeric > 0 ? null : INVENTORY_CATALOG_POSITIVE_QTY_ERROR;
    case 'leadTimeDays':
      return Number.isInteger(numeric) && numeric >= 0 ? null : INVENTORY_CATALOG_LEAD_TIME_ERROR;
    case 'minimumStock':
    case 'targetStock':
      return Number.isFinite(numeric) && numeric >= 0
        ? null
        : INVENTORY_CATALOG_STOCK_NEGATIVE_ERROR;
    case 'reorderPoint':
      return Number.isFinite(numeric) && numeric >= 0
        ? null
        : INVENTORY_CATALOG_REORDER_POINT_NEGATIVE_ERROR;
    case 'usefulLifeMonths':
      return Number.isInteger(numeric) && numeric > 0 ? null : INVENTORY_CATALOG_USEFUL_LIFE_ERROR;
  }
}

function validateCatalogNumericFields(
  form: CatalogFormState,
): Partial<Record<CatalogNumericFieldKey, string>> {
  const errors: Partial<Record<CatalogNumericFieldKey, string>> = {};
  for (const key of CATALOG_NUMERIC_FIELD_KEYS) {
    const message = validateCatalogNumericField(key, form[key]);
    if (message) {
      errors[key] = message;
    }
  }
  return errors;
}

/** Par unidad de compra + factor; sus reglas son cruzadas entre ambos y la unidad base. */
type CatalogPurchaseUomFieldKey = 'purchaseUnitOfMeasure' | 'purchaseToBaseUomFactor';

/**
 * Par código de barras + formato (MOD12 · F4 · PRD §11, CA-F4-08): el error se
 * muestra en el input del código y bloquea el guardado, igual que las reglas
 * cruzadas compra→base. La barrera es el backend (`refineInventoryItemMaster`).
 */
export function validateCatalogBarcode(
  form: Pick<CatalogFormState, 'barcode' | 'barcodeType'>,
): string | null {
  const barcode = form.barcode.trim();
  const barcodeType = form.barcodeType.trim();

  if (!barcode && !barcodeType) {
    return null;
  }

  if (barcode && !barcodeType) {
    return INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE;
  }

  if (!barcode && barcodeType) {
    return INVENTORY_BARCODE_PAIR_VALUE_MISSING_MESSAGE;
  }

  if (!(Object.values(InventoryBarcodeType) as string[]).includes(barcodeType)) {
    return INVENTORY_BARCODE_PAIR_TYPE_MISSING_MESSAGE;
  }

  const check = validateBarcodeValue(barcodeType as InventoryBarcodeType, barcode);
  return check.ok ? null : check.message;
}

/**
 * Fase S2 · CA-S2-01: espejo cliente del cruce Tipo de producto ↔ Control de
 * material (backend autoritativo vía refineInventoryItemMaster). Con la guía
 * proactiva en ambas direcciones la contradicción no se construye a mano, pero
 * un ítem ya inconsistente hidratado desde el catálogo sí puede llegar al
 * guardado: se bloquea aquí con el mismo copy que devuelve la API.
 */
export function validateCatalogItemCoherence(
  form: Pick<CatalogFormState, 'itemKind' | 'trackingMode'>,
): string | null {
  const coherent =
    (form.itemKind === InventoryItemKind.SERIALIZED) ===
    isSerializedTrackingMode(form.trackingMode);
  return coherent ? null : INVENTORY_ITEM_KIND_TRACKING_MISMATCH_MESSAGE;
}

type CatalogFieldErrorKey =
  | CatalogNumericFieldKey
  | CatalogPurchaseUomFieldKey
  | 'barcode'
  | 'trackingMode';

const CATALOG_PURCHASE_UOM_FIELD_KEYS: readonly CatalogPurchaseUomFieldKey[] = [
  'purchaseUnitOfMeasure',
  'purchaseToBaseUomFactor',
];

/**
 * Guía en cliente de las reglas compra→base (backend autoritativo vía
 * refineInventoryItemMaster): espejo del factor > 0 exigido con unidad de
 * compra y compatibilidad dimensional D2 resuelta SIEMPRE con la fuente
 * shared (nunca matemática local). Sin unidad de compra ambas reglas dejan
 * de aplicar, igual que en el backend.
 */
function validateCatalogPurchaseUom(
  form: CatalogFormState,
): Partial<Record<CatalogPurchaseUomFieldKey, string>> {
  const errors: Partial<Record<CatalogPurchaseUomFieldKey, string>> = {};
  const baseCode = form.unitOfMeasure.trim();
  const purchaseCode = form.purchaseUnitOfMeasure.trim();

  if (
    baseCode &&
    purchaseCode &&
    !areInventoryUnitsDimensionallyCompatible(baseCode, purchaseCode)
  ) {
    errors.purchaseUnitOfMeasure = INVENTORY_CATALOG_PURCHASE_UOM_DIMENSION_ERROR;
  }

  if (purchaseCode) {
    const factor = parseCatalogDecimalInput(form.purchaseToBaseUomFactor);
    if (factor === null || factor <= 0) {
      errors.purchaseToBaseUomFactor = INVENTORY_CATALOG_PURCHASE_FACTOR_ERROR;
    }
  }

  return errors;
}

export function buildPayload(form: CatalogFormState): UpdateInventoryItemDto {
  // '' → null en ambos: el par viaja junto o no viaja (CA-F4-08); limpiar ambos
  // (null/null) es válido y quita el código del artículo.
  const barcode = form.barcode.trim();
  const barcodeType = form.barcodeType.trim();
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    brand: form.brand.trim() || null,
    model: form.model.trim() || null,
    barcode: barcode || null,
    barcodeType: barcodeType ? (barcodeType as InventoryBarcodeType) : null,
    itemKind: form.itemKind,
    categoryId: form.categoryId,
    trackingMode: form.trackingMode,
    unitOfMeasure: form.unitOfMeasure.trim(),
    status: form.status,
    commercialReferenceId: form.commercialReferenceId.trim() || null,
    purchasable: form.purchasable,
    preferredSupplierRefId: form.preferredSupplierRefId.trim() || null,
    supplierSku: form.supplierSku.trim() || null,
    purchaseUnitOfMeasure: form.purchaseUnitOfMeasure.trim() || null,
    purchaseToBaseUomFactor: parseCatalogDecimalInput(form.purchaseToBaseUomFactor),
    baseCost: parseCatalogDecimalInput(form.baseCost) ?? 0,
    standardCost: parseCatalogDecimalInput(form.standardCost) ?? 0,
    minimumOrderQty: parseCatalogDecimalInput(form.minimumOrderQty),
    orderMultiple: parseCatalogDecimalInput(form.orderMultiple),
    leadTimeDays: parseCatalogDecimalInput(form.leadTimeDays),
    inventoryControlled: form.inventoryControlled,
    minimumStock: parseCatalogDecimalInput(form.minimumStock) ?? 0,
    reorderPoint: parseCatalogDecimalInput(form.reorderPoint) ?? 0,
    targetStock: parseCatalogDecimalInput(form.targetStock) ?? 0,
    // La regla cruzada viaja forzada: con serial o activo fijo siempre true (§8.1).
    assetControlled: requiresAssetControlled(form.trackingMode) ? true : form.assetControlled,
    usefulLifeMonths: parseCatalogDecimalInput(form.usefulLifeMonths),
  };
}

function catalogFormSignature(state: CatalogFormState): string {
  return JSON.stringify(state);
}

interface InventoryCatalogDrawerProps {
  open: boolean;
  item: InventoryItemRecord;
  categories: InventoryCategoryRecord[];
  commercialProductOptions: Array<{ id: string; name: string }>;
  /** Opciones del selector de proveedor (las carga InventoryClient solo con permiso). */
  supplierOptions: Array<{ id: string; name: string }>;
  supplierOptionsLoading: boolean;
  supplierOptionsError: string | null;
  /** INVENTORY_PURCHASING_READ efectivo: sin él el selector degrada sin llamar al endpoint. */
  canReadPurchasing: boolean;
  /** Nombre resoluble del proveedor guardado (etiquetas del cliente) o null. */
  preferredSupplierName: string | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onUpdate: (id: string, payload: UpdateInventoryItemDto) => Promise<void>;
}

export function InventoryCatalogDrawer({
  open,
  item,
  categories,
  commercialProductOptions,
  supplierOptions,
  supplierOptionsLoading,
  supplierOptionsError,
  canReadPurchasing,
  preferredSupplierName,
  isSubmitting,
  error,
  onClose,
  onUpdate,
}: InventoryCatalogDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<CatalogFormState>(defaultFormState);
  const [baselineForm, setBaselineForm] = useState<CatalogFormState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CatalogFieldErrorKey, string>>>({});

  const activeCategories = useMemo(
    () => categories.filter((category) => category.status === InventoryCategoryStatus.ACTIVE),
    [categories],
  );
  const selectableCategories = [...activeCategories];
  if (
    item &&
    item.categoryId &&
    !selectableCategories.some((category) => category.id === item.categoryId)
  ) {
    selectableCategories.unshift({
      id: item.categoryId,
      tenantId: item.tenantId,
      code: item.categoryCode,
      codePrefix: item.categoryCode.slice(0, 8).toUpperCase(),
      name: `${item.categoryName} (inactiva)`,
      description: null,
      status: InventoryCategoryStatus.INACTIVE,
      sortOrder: 0,
      productCount: 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });
  }

  useEffect(() => {
    if (!open) {
      setForm(defaultFormState());
      setBaselineForm(null);
      setFieldErrors({});
      return;
    }

    const initialForm = formFromItem(item);
    setForm(initialForm);
    setBaselineForm(initialForm);
    setFieldErrors({});
  }, [open, item]);

  const isDirty =
    baselineForm !== null && catalogFormSignature(form) !== catalogFormSignature(baselineForm);

  const { discardOpen, requestClose, confirmDiscard, cancelDiscard } = useDiscardChangesGuard({
    open,
    isDirty,
    onClose,
  });

  usePortalSideDrawerA11y(open && !discardOpen, drawerRef, requestClose);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.unitOfMeasure.trim().length > 0 &&
    form.categoryId.trim().length > 0;
  const categoryLabel =
    selectableCategories.find((category) => category.id === form.categoryId)?.name ??
    item.categoryName ??
    'Sin categoría';

  async function handleSubmit() {
    // A3: se revalida al construir el payload, no solo en blur. Incluye las
    // reglas cruzadas compra→base (dimensional D2 y factor > 0), el par
    // código de barras + formato (F4, CA-F4-08 + dígito de control) y el cruce
    // Tipo de producto ↔ Control de material (S2, CA-S2-01).
    const errors: Partial<Record<CatalogFieldErrorKey, string>> = {
      ...validateCatalogNumericFields(form),
      ...validateCatalogPurchaseUom(form),
    };
    const barcodeError = validateCatalogBarcode(form);
    if (barcodeError) {
      errors.barcode = barcodeError;
    }
    const itemCoherenceError = validateCatalogItemCoherence(form);
    if (itemCoherenceError) {
      errors.trackingMode = itemCoherenceError;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    const payload = buildPayload(form);
    await onUpdate(item.id, payload);
  }

  function updateForm<K extends keyof CatalogFormState>(key: K, value: CatalogFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Upsert de un error de campo: quita el mensaje si se resuelve, lo fija si cambia. */
  function handleFieldValidation(key: CatalogFieldErrorKey, message: string | null) {
    setFieldErrors((current) => {
      if (!message) {
        if (!(key in current)) {
          return current;
        }
        const next = { ...current };
        delete next[key];
        return next;
      }
      return current[key] === message ? current : { ...current, [key]: message };
    });
  }

  function handleNumericBlur(key: CatalogNumericFieldKey) {
    handleFieldValidation(key, validateCatalogNumericField(key, form[key]));
  }

  /** Blur del código: la regla del par (CA-F4-08) y el dígito se evalúan juntos, igual que en el backend. */
  function handleBarcodeBlur() {
    handleFieldValidation('barcode', validateCatalogBarcode(form));
  }

  function handleBarcodeTypeChange(next: string) {
    // Guía inmediata: al cambiar el formato se reevalúa el par en el mismo cambio.
    const nextForm = { ...form, barcodeType: next };
    updateForm('barcodeType', next);
    handleFieldValidation('barcode', validateCatalogBarcode(nextForm));
  }

  /** Blur del factor: la regla es cruzada (solo aplica con unidad de compra), igual que en el backend. */
  function handlePurchaseFactorBlur() {
    handleFieldValidation(
      'purchaseToBaseUomFactor',
      validateCatalogPurchaseUom(form).purchaseToBaseUomFactor ?? null,
    );
  }

  /**
   * Guía proactiva S2 (CA-S2-02, ajuste G1 de AI-PROD-UX — ambas direcciones):
   * hacia serial o activo fijo fuerza assetControlled Y ajusta Tipo de producto
   * a «Con serial» en el mismo cambio; el helperText del campo lo explica.
   */
  function handleTrackingModeChange(next: InventoryTrackingMode) {
    const nextForm: CatalogFormState = { ...form, trackingMode: next };
    if (isSerializedTrackingMode(next)) {
      nextForm.assetControlled = true;
      nextForm.itemKind = InventoryItemKind.SERIALIZED;
    }
    setForm(nextForm);
    // El error del cruce se reevalúa en el mismo cambio (patrón barcode): se
    // limpia si la pareja quedó coherente, se fija si el guardado lo rechazaría.
    handleFieldValidation('trackingMode', validateCatalogItemCoherence(nextForm));
  }

  /**
   * Guía proactiva S2 (CA-S2-02): elegir «Con serial» ajusta Control de
   * material a «Con serial» en el mismo cambio; un control ya serializado
   * («Activo fijo») se respeta — el copy G1 anuncia que luego puede cambiarse.
   */
  function handleItemKindChange(next: InventoryItemKind) {
    const nextForm: CatalogFormState = { ...form, itemKind: next };
    if (next === InventoryItemKind.SERIALIZED && !isSerializedTrackingMode(nextForm.trackingMode)) {
      nextForm.trackingMode = InventoryTrackingMode.SERIALIZED;
    }
    setForm(nextForm);
    handleFieldValidation('trackingMode', validateCatalogItemCoherence(nextForm));
  }

  function handleUnitOfMeasureChange(next: string) {
    // Guía dimensional inmediata (§8): si cambia la base, se reevalúa la unidad de compra.
    const nextForm = { ...form, unitOfMeasure: next };
    updateForm('unitOfMeasure', next);
    handleFieldValidation(
      'purchaseUnitOfMeasure',
      validateCatalogPurchaseUom(nextForm).purchaseUnitOfMeasure ?? null,
    );
  }

  function handlePurchaseUnitChange(next: string) {
    // Guía inmediata (§8): el error dimensional y el requisito de factor se
    // reevalúan en el mismo cambio; «Sin unidad de compra» limpia ambos.
    const nextForm = { ...form, purchaseUnitOfMeasure: next };
    updateForm('purchaseUnitOfMeasure', next);
    const purchaseErrors = validateCatalogPurchaseUom(nextForm);
    setFieldErrors((current) => {
      const nextErrors = { ...current };
      for (const key of CATALOG_PURCHASE_UOM_FIELD_KEYS) {
        const message = purchaseErrors[key];
        if (message) {
          nextErrors[key] = message;
        } else {
          delete nextErrors[key];
        }
      }
      return nextErrors;
    });
  }

  const isAssetControlledLocked = requiresAssetControlled(form.trackingMode);
  // Nombre del proveedor guardado cuando la lista no lo resuelve (error de
  // carga con permiso). Sin permiso el copy es siempre «Proveedor guardado» (§7).
  const savedSupplierLabel =
    supplierOptions.find((option) => option.id === form.preferredSupplierRefId)?.name ??
    preferredSupplierName ??
    INVENTORY_CATALOG_SAVED_SUPPLIER_LABEL;

  if (!open) {
    return null;
  }

  return (
    <InventorySideDrawerShell
      open={open}
      drawerRef={drawerRef}
      labelledBy="inventory-catalog-edit-title"
      maxWidthClass="max-w-4xl"
      onRequestClose={requestClose}
      discardOpen={discardOpen}
      onConfirmDiscard={confirmDiscard}
      onCancelDiscard={cancelDiscard}
      header={
        <>
          <p className="portal-eyebrow">Catálogo</p>
          <h2
            id="inventory-catalog-edit-title"
            className="mt-1 text-xl font-semibold text-gray-900 dark:text-white"
          >
            Editar producto
          </h2>
          <p className="mt-1 text-base font-medium text-gray-800 dark:text-gray-100">
            {form.name || item.name}
          </p>
          <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">{form.sku}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={getInventoryItemStatusBadgeVariant(form.status)}>
              {getInventoryItemStatusLabel(form.status)}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {INVENTORY_CATALOG_DRAWER_DESCRIPTION}
          </p>
        </>
      }
      bodyClassName="flex-1 overflow-y-auto px-6 py-4"
      body={
        <>
          {error ? (
            <PortalAlert
              variant="error"
              title="No fue posible guardar el producto"
              description={error}
            />
          ) : null}

          <dl className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <InventoryMetaItem label="Tipo" value={getInventoryItemKindLabel(form.itemKind)} />
            <InventoryMetaItem label="Categoría" value={categoryLabel} />
            <InventoryMetaItem
              label="Control de material"
              value={getInventoryTrackingModeLabel(form.trackingMode)}
            />
            <InventoryMetaItem label="Estado" value={getInventoryItemStatusLabel(form.status)} />
          </dl>

          <section className="mb-5 space-y-3">
            <PortalSectionHeader
              title="Costos"
              description={INVENTORY_CATALOG_COSTS_SECTION_HELP_TEXT}
            />
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <InventoryMetaItem
                label={INVENTORY_AVERAGE_COST_LABEL}
                value={formatInventoryCostOrNone(item.averageCost)}
              />
              <InventoryMetaItem
                label={INVENTORY_LAST_PURCHASE_COST_LABEL}
                value={formatInventoryCostOrNone(item.lastPurchaseCost)}
              />
              <InventoryMetaItem
                label={INVENTORY_STANDARD_COST_LABEL}
                value={formatInventoryCostOrNone(item.standardCost)}
              />
            </dl>
          </section>

          <div className="space-y-4">
            <PortalSectionHeader
              title="Datos del producto"
              description="Actualiza la información base visible en el catálogo."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Código"
                value={form.sku}
                disabled
                helperText="El código no se puede modificar después de crear el producto."
              />
              <Input
                label="Nombre"
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
              />
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Descripción
                </span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  className={portalTextareaClassName}
                />
              </label>
              <Input
                label="Marca"
                value={form.brand}
                onChange={(e) => updateForm('brand', e.target.value)}
              />
              <Input
                label="Modelo"
                value={form.model}
                onChange={(e) => updateForm('model', e.target.value)}
              />
              <Input
                label={INVENTORY_BARCODE_LABEL}
                value={form.barcode}
                onChange={(e) => updateForm('barcode', e.target.value)}
                onBlur={handleBarcodeBlur}
                helperText={INVENTORY_BARCODE_EDIT_HELP_TEXT}
                error={fieldErrors.barcode}
              />
              <Select
                label={INVENTORY_BARCODE_TYPE_LABEL}
                value={form.barcodeType}
                options={[
                  { value: '', label: INVENTORY_BARCODE_NO_CODE_LABEL },
                  ...INVENTORY_BARCODE_TYPE_OPTIONS,
                ]}
                onChange={(e) => handleBarcodeTypeChange(e.target.value)}
                helperText="Va junto al código: uno sin el otro se rechaza."
              />
              <Select
                label="Tipo de producto"
                value={form.itemKind}
                options={Object.values(InventoryItemKind).map((value) => ({
                  value,
                  label: getInventoryItemKindLabel(value),
                }))}
                onChange={(e) => handleItemKindChange(e.target.value as InventoryItemKind)}
                helperText={INVENTORY_CATALOG_ITEM_KIND_HELP_TEXT}
              />
              <Select
                label="Categoría"
                value={form.categoryId}
                options={[
                  { value: '', label: 'Selecciona una categoría' },
                  ...selectableCategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
                onChange={(e) => updateForm('categoryId', e.target.value)}
              />
              <Select
                label="Control de material"
                value={form.trackingMode}
                options={Object.values(InventoryTrackingMode).map((value) => ({
                  value,
                  label: getInventoryTrackingModeLabel(value),
                }))}
                onChange={(e) => handleTrackingModeChange(e.target.value as InventoryTrackingMode)}
                helperText={INVENTORY_CATALOG_TRACKING_MODE_HELP_TEXT}
                error={fieldErrors.trackingMode ?? ''}
              />
              <Select
                label="Unidad de medida"
                value={form.unitOfMeasure}
                options={[...INVENTORY_UNIT_OF_MEASURE_OPTIONS]}
                onChange={(e) => handleUnitOfMeasureChange(e.target.value)}
              />
              <Select
                label="Estado"
                value={form.status}
                options={Object.values(InventoryItemStatus).map((value) => ({
                  value,
                  label: getInventoryItemStatusLabel(value),
                }))}
                onChange={(e) => updateForm('status', e.target.value as InventoryItemStatus)}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <PortalSectionHeader
              title={INVENTORY_CATALOG_PURCHASING_SECTION_TITLE}
              description={INVENTORY_CATALOG_PURCHASING_SECTION_DESCRIPTION}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <CheckboxCard
                  label={INVENTORY_CATALOG_PURCHASABLE_LABEL}
                  description={INVENTORY_CATALOG_PURCHASABLE_HELP_TEXT}
                  checked={form.purchasable}
                  onChange={(event) => updateForm('purchasable', event.target.checked)}
                />
              </div>
              {!canReadPurchasing ? (
                <Select
                  label={INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL}
                  value={form.preferredSupplierRefId}
                  options={
                    form.preferredSupplierRefId
                      ? [
                          {
                            value: form.preferredSupplierRefId,
                            label: INVENTORY_CATALOG_SAVED_SUPPLIER_LABEL,
                          },
                        ]
                      : [{ value: '', label: INVENTORY_CATALOG_NO_PREFERRED_SUPPLIER_LABEL }]
                  }
                  disabled
                  helperText={INVENTORY_CATALOG_SUPPLIERS_NO_PERMISSION_HELP_TEXT}
                />
              ) : supplierOptionsLoading ? (
                <Select
                  label={INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL}
                  value=""
                  options={[{ value: '', label: INVENTORY_CATALOG_SUPPLIERS_LOADING_LABEL }]}
                  disabled
                  helperText={INVENTORY_CATALOG_SUPPLIERS_LOADING_HELP_TEXT}
                />
              ) : supplierOptionsError ? (
                <Select
                  label={INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL}
                  value={form.preferredSupplierRefId}
                  options={
                    form.preferredSupplierRefId
                      ? [{ value: form.preferredSupplierRefId, label: savedSupplierLabel }]
                      : [{ value: '', label: INVENTORY_CATALOG_NO_PREFERRED_SUPPLIER_LABEL }]
                  }
                  disabled
                  helperText={INVENTORY_CATALOG_SUPPLIERS_LOAD_ERROR_HELP_TEXT}
                />
              ) : supplierOptions.length === 0 ? (
                <Select
                  label={INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL}
                  value={form.preferredSupplierRefId}
                  onChange={(event) => updateForm('preferredSupplierRefId', event.target.value)}
                  helperText={INVENTORY_CATALOG_NO_SUPPLIERS_HELP_TEXT}
                >
                  <option value="">{INVENTORY_CATALOG_NO_PREFERRED_SUPPLIER_LABEL}</option>
                  <option value="sin-proveedores" disabled>
                    {INVENTORY_CATALOG_NO_SUPPLIERS_REGISTERED_LABEL}
                  </option>
                </Select>
              ) : (
                <Select
                  label={INVENTORY_CATALOG_PREFERRED_SUPPLIER_LABEL}
                  value={form.preferredSupplierRefId}
                  options={[
                    { value: '', label: INVENTORY_CATALOG_NO_PREFERRED_SUPPLIER_LABEL },
                    ...supplierOptions.map((supplier) => ({
                      value: supplier.id,
                      label: supplier.name,
                    })),
                  ]}
                  onChange={(event) => updateForm('preferredSupplierRefId', event.target.value)}
                  helperText={INVENTORY_CATALOG_PREFERRED_SUPPLIER_HELP_TEXT}
                />
              )}
              <Input
                label={INVENTORY_CATALOG_SUPPLIER_SKU_LABEL}
                value={form.supplierSku}
                onChange={(e) => updateForm('supplierSku', e.target.value)}
                helperText={INVENTORY_CATALOG_SUPPLIER_SKU_HELP_TEXT}
              />
              <Select
                label={INVENTORY_CATALOG_PURCHASE_UOM_LABEL}
                value={form.purchaseUnitOfMeasure}
                options={[
                  { value: '', label: INVENTORY_CATALOG_PURCHASE_UOM_NO_UNIT_LABEL },
                  ...INVENTORY_UNIT_OF_MEASURE_OPTIONS,
                ]}
                onChange={(event) => handlePurchaseUnitChange(event.target.value)}
                helperText={INVENTORY_CATALOG_PURCHASE_UOM_HELP_TEXT}
                error={fieldErrors.purchaseUnitOfMeasure ?? ''}
              />
              <Input
                label={INVENTORY_CATALOG_PURCHASE_FACTOR_LABEL}
                value={form.purchaseToBaseUomFactor}
                inputMode="decimal"
                onChange={(e) => updateForm('purchaseToBaseUomFactor', e.target.value)}
                onBlur={handlePurchaseFactorBlur}
                helperText={INVENTORY_CATALOG_PURCHASE_FACTOR_HELP_TEXT}
                error={fieldErrors.purchaseToBaseUomFactor}
              />
              <Input
                label={INVENTORY_CATALOG_BASE_COST_LABEL}
                value={form.baseCost}
                inputMode="decimal"
                onChange={(e) => updateForm('baseCost', e.target.value)}
                onBlur={() => handleNumericBlur('baseCost')}
                helperText={INVENTORY_CATALOG_BASE_COST_HELP_TEXT}
                error={fieldErrors.baseCost}
              />
              <Input
                label={INVENTORY_STANDARD_COST_LABEL}
                value={form.standardCost}
                inputMode="decimal"
                onChange={(e) => updateForm('standardCost', e.target.value)}
                onBlur={() => handleNumericBlur('standardCost')}
                helperText={INVENTORY_CATALOG_STANDARD_COST_HELP_TEXT}
                error={fieldErrors.standardCost}
              />
              <Input
                label={INVENTORY_CATALOG_MINIMUM_ORDER_QTY_LABEL}
                value={form.minimumOrderQty}
                inputMode="decimal"
                onChange={(e) => updateForm('minimumOrderQty', e.target.value)}
                onBlur={() => handleNumericBlur('minimumOrderQty')}
                helperText={INVENTORY_CATALOG_MINIMUM_ORDER_QTY_HELP_TEXT}
                error={fieldErrors.minimumOrderQty}
              />
              <Input
                label={INVENTORY_CATALOG_ORDER_MULTIPLE_LABEL}
                value={form.orderMultiple}
                inputMode="decimal"
                onChange={(e) => updateForm('orderMultiple', e.target.value)}
                onBlur={() => handleNumericBlur('orderMultiple')}
                helperText={INVENTORY_CATALOG_ORDER_MULTIPLE_HELP_TEXT}
                error={fieldErrors.orderMultiple}
              />
              <Input
                label={INVENTORY_CATALOG_LEAD_TIME_LABEL}
                value={form.leadTimeDays}
                inputMode="numeric"
                onChange={(e) => updateForm('leadTimeDays', e.target.value)}
                onBlur={() => handleNumericBlur('leadTimeDays')}
                helperText={INVENTORY_CATALOG_LEAD_TIME_HELP_TEXT}
                error={fieldErrors.leadTimeDays}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <PortalSectionHeader
              title={INVENTORY_CATALOG_INVENTORY_SECTION_TITLE}
              description={INVENTORY_CATALOG_INVENTORY_SECTION_DESCRIPTION}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <CheckboxCard
                  label={INVENTORY_CATALOG_INVENTORY_CONTROLLED_LABEL}
                  description={INVENTORY_CATALOG_INVENTORY_CONTROLLED_HELP_TEXT}
                  checked={form.inventoryControlled}
                  onChange={(event) => updateForm('inventoryControlled', event.target.checked)}
                />
              </div>
              <div className="grid gap-4 md:col-span-2 md:grid-cols-2 xl:grid-cols-3">
                <Input
                  label={INVENTORY_CATALOG_MINIMUM_STOCK_LABEL}
                  value={form.minimumStock}
                  inputMode="decimal"
                  onChange={(e) => updateForm('minimumStock', e.target.value)}
                  onBlur={() => handleNumericBlur('minimumStock')}
                  helperText={INVENTORY_CATALOG_MINIMUM_STOCK_HELP_TEXT}
                  error={fieldErrors.minimumStock}
                />
                <Input
                  label={INVENTORY_CATALOG_REORDER_POINT_LABEL}
                  value={form.reorderPoint}
                  inputMode="decimal"
                  onChange={(e) => updateForm('reorderPoint', e.target.value)}
                  onBlur={() => handleNumericBlur('reorderPoint')}
                  helperText={INVENTORY_CATALOG_REORDER_POINT_HELP_TEXT}
                  error={fieldErrors.reorderPoint}
                />
                <Input
                  label={INVENTORY_CATALOG_TARGET_STOCK_LABEL}
                  value={form.targetStock}
                  inputMode="decimal"
                  onChange={(e) => updateForm('targetStock', e.target.value)}
                  onBlur={() => handleNumericBlur('targetStock')}
                  helperText={INVENTORY_CATALOG_TARGET_STOCK_HELP_TEXT}
                  error={fieldErrors.targetStock}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <PortalSectionHeader
              title={INVENTORY_CATALOG_ASSETS_SECTION_TITLE}
              description={INVENTORY_CATALOG_ASSETS_SECTION_DESCRIPTION}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <CheckboxCard
                  label={INVENTORY_CATALOG_ASSET_CONTROLLED_LABEL}
                  description={
                    isAssetControlledLocked
                      ? INVENTORY_CATALOG_ASSET_CONTROLLED_LOCKED_HELP_TEXT
                      : INVENTORY_CATALOG_ASSET_CONTROLLED_HELP_TEXT
                  }
                  checked={isAssetControlledLocked ? true : form.assetControlled}
                  disabled={isAssetControlledLocked}
                  onChange={(event) => updateForm('assetControlled', event.target.checked)}
                />
              </div>
              <Input
                label={INVENTORY_CATALOG_USEFUL_LIFE_LABEL}
                value={form.usefulLifeMonths}
                inputMode="numeric"
                onChange={(e) => updateForm('usefulLifeMonths', e.target.value)}
                onBlur={() => handleNumericBlur('usefulLifeMonths')}
                helperText={INVENTORY_CATALOG_USEFUL_LIFE_HELP_TEXT}
                error={fieldErrors.usefulLifeMonths}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5 dark:border-dark-border">
            <PortalSectionHeader
              title="Relación comercial"
              description="Vincula este producto operativo con un producto adicional de la oferta comercial."
            />
            <Select
              label="Referencia comercial"
              value={form.commercialReferenceId}
              options={[
                { value: '', label: 'Sin referencia comercial' },
                ...commercialProductOptions.map((product) => ({
                  value: product.id,
                  label: product.name,
                })),
              ]}
              onChange={(event) => updateForm('commercialReferenceId', event.target.value)}
              helperText="Opcional. Usa el catálogo de Comercial > Productos adicionales."
            />
          </div>
        </>
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={requestClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            Guardar cambios
          </Button>
        </>
      }
    />
  );
}
