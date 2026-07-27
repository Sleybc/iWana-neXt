'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  CheckboxCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@iwana/ui';
import {
  COMMERCIAL_LIST_PAGE_SIZE,
  commercialApi,
  type AdditionalProduct,
  type CommercialListMeta,
  type CommercialListParams,
  type CreateAdditionalProductDto,
  type UpdateAdditionalProductDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import { ProductCategory, PRODUCT_CATEGORY_LABELS } from '@iwana/shared';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  hasMissingCurrentPrice,
  MissingCurrentPriceBadge,
} from '@/components/commercial/catalog/MissingCurrentPriceBadge';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalFilterChip,
  PortalPanel,
  PortalResultsStrip,
  PortalSearchField,
  PortalSidePeek,
  PortalSkeletonBlock,
  PortalSuccessAlert,
  PortalTablePagination,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalFilterChipGroupClassName,
  portalTableRowHoverClassName,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';
import { useCommercialFocusConsume } from '@/components/commercial/useCommercialFocusConsume';
import {
  applyProductCatalogFilters,
  parseProductCatalogFilters,
  type CatalogStatusFilter,
  type ProductCatalogFilters,
  type ProductCommercialModelFilter,
  type ProductSortMode,
} from '@/components/commercial/catalog/catalog-filter-params';

const PRODUCT_CATEGORY_VALUES = [
  ProductCategory.ENTERTAINMENT,
  ProductCategory.SECURITY,
  ProductCategory.CONNECTIVITY,
  ProductCategory.BUSINESS,
  ProductCategory.NETWORKING,
  ProductCategory.CPE,
] as const;

const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(100, 'Máximo 100 caracteres.'),
  description: z.string().trim().max(240, 'Máximo 240 caracteres.').optional(),
  category: z.enum(PRODUCT_CATEGORY_VALUES),
  basePrice: z.coerce.number().min(0, 'No puede ser negativo.'),
  isLoan: z.boolean(),
  requiresInventory: z.boolean(),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const CATEGORY_ORDER = [
  ProductCategory.ENTERTAINMENT,
  ProductCategory.SECURITY,
  ProductCategory.CONNECTIVITY,
  ProductCategory.BUSINESS,
  ProductCategory.NETWORKING,
  ProductCategory.CPE,
];

interface AdditionalProductsPanelProps {
  canEdit: boolean;
  focusId?: string | null | undefined;
  onFocusConsumed?: (() => void) | undefined;
}

function getDefaultProductFormValues(): ProductFormValues {
  return {
    name: '',
    description: '',
    category: ProductCategory.CONNECTIVITY,
    basePrice: 0,
    isLoan: false,
    requiresInventory: false,
    isActive: true,
  };
}

function toProductFormValues(product: AdditionalProduct): ProductFormValues {
  return {
    name: product.name,
    description: product.description ?? '',
    category: product.category,
    basePrice: product.basePrice ?? 0,
    isLoan: product.isLoan,
    requiresInventory: product.requiresInventory,
    isActive: product.isActive,
  };
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function filtersEqual(a: ProductCatalogFilters, b: ProductCatalogFilters): boolean {
  return (
    a.q === b.q &&
    a.category === b.category &&
    a.status === b.status &&
    a.model === b.model &&
    a.sort === b.sort
  );
}

export function AdditionalProductsPanel({
  canEdit,
  focusId = null,
  onFocusConsumed,
}: AdditionalProductsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();

  // searchParamsKey captura cambios de query (back/forward / replace).
  const filtersFromUrl = useMemo(
    () => parseProductCatalogFilters(searchParams),
    [searchParams, searchParamsKey],
  );

  const [products, setProducts] = useState<AdditionalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [searchValue, setSearchValue] = useState(filtersFromUrl.q);
  const [categoryFilter, setCategoryFilter] = useState(filtersFromUrl.category);
  const [statusFilter, setStatusFilter] = useState<CatalogStatusFilter>(filtersFromUrl.status);
  const [commercialModelFilter, setCommercialModelFilter] = useState<ProductCommercialModelFilter>(
    filtersFromUrl.model,
  );
  const [sortMode, setSortMode] = useState<ProductSortMode>(filtersFromUrl.sort);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: getDefaultProductFormValues(),
  });

  useEffect(() => {
    const current: ProductCatalogFilters = {
      q: searchValue,
      category: categoryFilter,
      status: statusFilter,
      model: commercialModelFilter,
      sort: sortMode,
    };
    if (filtersEqual(current, filtersFromUrl)) {
      return;
    }
    setSearchValue(filtersFromUrl.q);
    setCategoryFilter(filtersFromUrl.category);
    setStatusFilter(filtersFromUrl.status);
    setCommercialModelFilter(filtersFromUrl.model);
    setSortMode(filtersFromUrl.sort);
  }, [filtersFromUrl, searchValue, categoryFilter, statusFilter, commercialModelFilter, sortMode]);

  function syncFiltersToUrl(next: ProductCatalogFilters) {
    const params = new URLSearchParams(searchParams.toString());
    applyProductCatalogFilters(params, next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function updateFilters(patch: Partial<ProductCatalogFilters>) {
    setSuccessMessage(null);
    setActionError(null);

    const next: ProductCatalogFilters = {
      q: patch.q ?? searchValue,
      category: patch.category ?? categoryFilter,
      status: patch.status ?? statusFilter,
      model: patch.model ?? commercialModelFilter,
      sort: patch.sort ?? sortMode,
    };

    if (patch.q !== undefined) setSearchValue(patch.q);
    if (patch.category !== undefined) setCategoryFilter(patch.category);
    if (patch.status !== undefined) setStatusFilter(patch.status);
    if (patch.model !== undefined) setCommercialModelFilter(patch.model);
    if (patch.sort !== undefined) setSortMode(patch.sort);

    syncFiltersToUrl(next);
  }

  const [meta, setMeta] = useState<CommercialListMeta | null>(null);
  const [listParams, setListParams] = useState<CommercialListParams>({
    limit: COMMERCIAL_LIST_PAGE_SIZE,
  });
  const [debouncedSearch, setDebouncedSearch] = useState(filtersFromUrl.q);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildProductListParams(filters: {
    q: string;
    status: CatalogStatusFilter;
    category: ProductCatalogFilters['category'];
    model: ProductCommercialModelFilter;
    sort: ProductSortMode;
  }): CommercialListParams {
    const params: CommercialListParams = {
      limit: COMMERCIAL_LIST_PAGE_SIZE,
      sort: filters.sort,
    };
    const q = filters.q.trim();
    if (q) params.name = q;
    if (filters.status === 'ACTIVE') params.isActive = true;
    else if (filters.status === 'INACTIVE') params.isActive = false;
    if (filters.category !== 'ALL') params.category = filters.category as ProductCategory;
    if (filters.model === 'LOAN' || filters.model === 'SALE') params.model = filters.model;
    return params;
  }

  const loadProducts = useCallback(async (params: CommercialListParams, append = false) => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const result = await commercialApi.getAdditionalProducts(params);
      const page = result.data ?? [];
      setProducts((prev) => (append ? [...prev, ...page] : page));
      setMeta(result.meta ?? { ...EMPTY_LIST_META, nextCursor: null, total: page.length });
      setListParams(params);
    } catch {
      setLoadError('No se pudieron cargar los productos adicionales.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void loadProducts({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(searchValue), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchValue]);

  useEffect(() => {
    void loadProducts(
      buildProductListParams({
        q: debouncedSearch,
        status: statusFilter,
        category: categoryFilter,
        model: commercialModelFilter,
        sort: sortMode,
      }),
    );
  }, [
    categoryFilter,
    commercialModelFilter,
    debouncedSearch,
    loadProducts,
    sortMode,
    statusFilter,
  ]);

  function openCreateDialog() {
    setEditingProductId(null);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    reset(getDefaultProductFormValues());
    setIsDialogOpen(true);
  }

  function openEditDialog(product: AdditionalProduct) {
    setEditingProductId(product.id);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    reset(toProductFormValues(product));
    setIsDialogOpen(true);
  }

  useCommercialFocusConsume({
    focusId,
    isLoading: loading,
    items: products,
    getId: (item) => item.id,
    onMatch: (product) => {
      openEditDialog(product);
    },
    onFocusConsumed,
  });

  function handleDialogOpenChange(nextOpen: boolean) {
    setIsDialogOpen(nextOpen);

    if (!nextOpen) {
      setEditingProductId(null);
      setFormError(null);
      reset(getDefaultProductFormValues());
    }
  }

  async function onSubmit(values: ProductFormValues) {
    setSaving(true);
    setFormError(null);

    const normalizedDescription = values.description?.trim()
      ? values.description.trim()
      : undefined;

    try {
      if (editingProductId) {
        const dto: UpdateAdditionalProductDto = {
          name: values.name.trim(),
          description: normalizedDescription,
          category: values.category,
          isLoan: values.isLoan,
          requiresInventory: values.requiresInventory,
          isActive: values.isActive,
          basePrice: values.basePrice,
        };
        await commercialApi.updateAdditionalProduct(editingProductId, dto);
        setSuccessMessage('Producto actualizado.');
      } else {
        const dto: CreateAdditionalProductDto = {
          name: values.name.trim(),
          description: normalizedDescription,
          category: values.category,
          isLoan: values.isLoan,
          requiresInventory: values.requiresInventory,
          isActive: values.isActive,
          basePrice: values.basePrice,
        };
        await commercialApi.createAdditionalProduct(dto);
        setSuccessMessage('Producto creado.');
      }

      void loadProducts(
        buildProductListParams({
          q: debouncedSearch,
          status: statusFilter,
          category: categoryFilter,
          model: commercialModelFilter,
          sort: sortMode,
        }),
      );

      handleDialogOpenChange(false);
    } catch {
      setFormError('No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(deleteTarget.id);
    setActionError(null);

    try {
      await commercialApi.deleteAdditionalProduct(deleteTarget.id);
      setDeleteTarget(null);
      setSuccessMessage('Producto eliminado.');
      void loadProducts(
        buildProductListParams({
          q: debouncedSearch,
          status: statusFilter,
          category: categoryFilter,
          model: commercialModelFilter,
          sort: sortMode,
        }),
      );
    } catch {
      setActionError('No se pudo eliminar el producto.');
    } finally {
      setDeleting(null);
    }
  }

  const hasMore = meta?.nextCursor != null;
  const totalProducts = meta?.total ?? products.length;
  const activeProductsCount = products.filter((product) => product.isActive).length;
  const inactiveProductsCount = products.filter((product) => !product.isActive).length;
  const categoryTotals = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      count: products.filter((product) => product.category === category).length,
    })).filter((item) => item.count > 0);
  }, [products]);

  const hasActiveFilters =
    Boolean(searchValue.trim()) ||
    categoryFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    commercialModelFilter !== 'ALL';

  function clearFilters() {
    updateFilters({
      q: '',
      category: 'ALL',
      status: 'ALL',
      model: 'ALL',
    });
  }

  const resourceWord = totalProducts === 1 ? 'producto' : 'productos';
  const resultsLabel = hasMore
    ? `${products.length} de ${totalProducts} ${resourceWord}`
    : `${totalProducts} ${resourceWord}`;

  const showLoadErrorOnly = Boolean(loadError) && products.length === 0 && !loading;

  return (
    <PortalPanel
      eyebrow="Catálogo"
      title="Productos adicionales"
      description="Consulta, filtra y administra productos complementarios al plan principal."
      actions={
        <>
          <Badge variant="neutral">{totalProducts} total</Badge>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activeProductsCount} activo{activeProductsCount === 1 ? '' : 's'}
          </Badge>
          <Badge variant="neutral">
            {inactiveProductsCount} inactivo{inactiveProductsCount === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button variant="primary" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agregar producto
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <PortalSkeletonBlock className="h-10 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
        </div>
      ) : showLoadErrorOnly ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar productos adicionales"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                void loadProducts(
                  buildProductListParams({
                    q: debouncedSearch,
                    status: statusFilter,
                    category: categoryFilter,
                    model: commercialModelFilter,
                    sort: sortMode,
                  }),
                )
              }
            >
              Reintentar
            </Button>
          }
        />
      ) : products.length === 0 && !hasActiveFilters ? (
        <PortalEmptyState
          title="Catálogo listo para crecer"
          description="No hay productos adicionales. Crea uno para empezar."
          icon={CheckCircle2}
          {...(canEdit
            ? {
                action: (
                  <Button variant="primary" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar producto
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="space-y-6">
          {successMessage ? (
            <PortalSuccessAlert
              message={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}

          {actionError && !deleteTarget && (
            <PortalAlert
              variant="error"
              title="No fue posible completar la acción"
              description={actionError}
              icon={CircleAlert}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActionError(null)}
                >
                  Cerrar
                </Button>
              }
            />
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px_220px_auto] lg:items-end">
            <PortalSearchField
              id="product-search"
              label="Buscar producto"
              placeholder="Buscar por nombre, descripción o categoría"
              value={searchValue}
              onChange={(value) => updateFilters({ q: value })}
            />

            <Select
              id="product-status-filter"
              label="Estado"
              value={statusFilter}
              onChange={(event) =>
                updateFilters({ status: event.target.value as CatalogStatusFilter })
              }
              className="h-12"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </Select>

            <Select
              id="product-model-filter"
              label="Modelo comercial"
              value={commercialModelFilter}
              onChange={(event) =>
                updateFilters({
                  model: event.target.value as ProductCommercialModelFilter,
                })
              }
              className="h-12"
            >
              <option value="ALL">Todos</option>
              <option value="SALE">Venta</option>
              <option value="LOAN">Comodato</option>
            </Select>

            <Select
              id="product-sort-mode"
              label="Orden"
              value={sortMode}
              onChange={(event) => updateFilters({ sort: event.target.value as ProductSortMode })}
              className="h-12"
            >
              <option value="ACTIVE_NAME">Activos primero</option>
              <option value="CATEGORY_NAME">Por categoría</option>
              <option value="RECENTLY_UPDATED">Recientes primero</option>
            </Select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={clearFilters}
                className="h-12 px-4"
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

          {categoryTotals.length > 0 && (
            <div className={portalFilterChipGroupClassName}>
              <PortalFilterChip
                active={categoryFilter === 'ALL'}
                onClick={() => updateFilters({ category: 'ALL' })}
                count={totalProducts}
              >
                Todas
              </PortalFilterChip>

              {categoryTotals.map((item) => (
                <PortalFilterChip
                  key={item.category}
                  active={categoryFilter === item.category}
                  onClick={() => updateFilters({ category: item.category })}
                  count={item.count}
                >
                  {PRODUCT_CATEGORY_LABELS[item.category]}
                </PortalFilterChip>
              ))}
            </div>
          )}

          {products.length === 0 ? (
            <PortalEmptyState
              title="No hay productos para los filtros seleccionados"
              description="Ajusta búsqueda, categoría, estado o modelo comercial para recuperar resultados."
              icon={CircleAlert}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={clearFilters}
                  className="h-12 px-4"
                >
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
            <div className={portalDataTableShellClassName}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className={portalDataTableHeadRowClassName}>
                    <tr>
                      <PortalDataTableHead>Producto</PortalDataTableHead>
                      <PortalDataTableHead>Categoría</PortalDataTableHead>
                      <PortalDataTableHead>Modelo comercial</PortalDataTableHead>
                      <PortalDataTableHead>Precio vigente</PortalDataTableHead>
                      <PortalDataTableHead>Estado</PortalDataTableHead>
                      <PortalDataTableHead>Señales</PortalDataTableHead>
                      {canEdit && (
                        <PortalDataTableHead className="w-40">Acciones</PortalDataTableHead>
                      )}
                    </tr>
                  </thead>
                  <tbody className={portalDataTableBodyClassName}>
                    {products.map((product) => (
                      <tr
                        key={product.id}
                        className={cn(
                          portalTableRowHoverClassName,
                          !product.isActive && portalDataTableInactiveRowClassName,
                        )}
                      >
                        <td className={portalDataTableCellClassName}>
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {product.description?.trim() || 'Sin descripción operativa.'}
                            </p>
                          </div>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge variant="neutral" className="text-xs">
                            {PRODUCT_CATEGORY_LABELS[product.category]}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {product.isLoan ? 'Comodato' : 'Venta'}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <p className="font-mono font-medium tabular-nums text-gray-900 dark:text-white">
                            {hasMissingCurrentPrice(product) ? (
                              <MissingCurrentPriceBadge />
                            ) : (
                              formatCurrency(product.basePrice ?? 0)
                            )}
                          </p>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <Badge
                            variant={getPortalActiveBadgeVariant(product.isActive)}
                            className="text-xs"
                          >
                            {product.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className={portalDataTableCellClassName}>
                          <div className="flex flex-wrap gap-2">
                            {product.requiresInventory ? (
                              <Link
                                href={`/dashboard/inventory?tab=catalog&commercialRef=${product.id}`}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full border border-iwana-secondary/30 bg-iwana-secondary/5 px-2 py-1 text-xs font-medium text-iwana-secondary-700 transition-colors hover:bg-iwana-secondary/10 dark:border-iwana-secondary/40 dark:bg-iwana-secondary/10 dark:text-iwana-secondary-300',
                                  interactiveFocusClassName,
                                )}
                                title="Ver artículos de inventario vinculados"
                              >
                                Requiere inventario
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </Link>
                            ) : (
                              <span className="rounded-full border border-dashed border-gray-200 px-2 py-1 text-xs text-gray-500 dark:border-dark-border dark:text-gray-400">
                                Sin control de inventario
                              </span>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className={portalDataTableCellClassName}>
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="icon"
                                aria-label={`Editar producto ${product.name}`}
                                title={`Editar producto ${product.name}`}
                                onClick={() => openEditDialog(product)}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </Button>
                              <Button
                                variant="softDestructive"
                                size="icon"
                                aria-label={`Eliminar producto ${product.name}`}
                                title={`Eliminar producto ${product.name}`}
                                onClick={() => {
                                  setActionError(null);
                                  setDeleteTarget({ id: product.id, name: product.name });
                                }}
                                disabled={deleting === product.id}
                                loading={deleting === product.id}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PortalTablePagination
                hasMore={hasMore}
                onLoadMore={handleLoadMore}
                loading={loading}
                resourceLabel="productos"
                shown={products.length}
                total={totalProducts}
              />
            </div>
          )}
        </div>
      )}

      <PortalSidePeek
        open={isDialogOpen}
        onClose={() => handleDialogOpenChange(false)}
        eyebrow="Catálogo comercial"
        title={editingProductId ? 'Editar producto adicional' : 'Crear producto adicional'}
        description={
          editingProductId
            ? 'Actualiza la información básica y la configuración comercial del producto adicional.'
            : 'Agrega un producto adicional a la oferta comercial con los datos mínimos de operación.'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => handleDialogOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="additional-product-form"
              disabled={!isDirty && !!editingProductId}
              loading={saving}
            >
              Guardar
            </Button>
          </div>
        }
      >
        <form
          id="additional-product-form"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Información básica</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Identifica el producto dentro del catálogo sin mezclar información propia de
                inventario físico.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Input
                  label="Nombre"
                  {...register('name')}
                  placeholder="Ej. TvBox, Cámara IP interior"
                  aria-invalid={errors.name ? 'true' : 'false'}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-error-600">{errors.name.message}</p>
                )}
              </div>

              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select
                    label="Categoría"
                    className="h-11"
                    name={field.name}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {CATEGORY_ORDER.map((cat) => (
                      <option key={cat} value={cat}>
                        {PRODUCT_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </Select>
                )}
              />

              <div>
                <label htmlFor="product-description" className="portal-eyebrow-muted">
                  Descripción corta
                </label>
                <textarea
                  id="product-description"
                  {...register('description')}
                  rows={4}
                  placeholder="Describe brevemente el uso comercial del producto o cómo se diferencia dentro del catálogo."
                  className={`mt-2 ${portalTextareaClassName}`}
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-error-600">{errors.description.message}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Configuración comercial</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Define cómo se comercializa el producto y si se mantiene disponible para nuevas
                operaciones.
              </p>
            </div>

            <div>
              <Input
                label="Precio base (COP)"
                type="number"
                min={0}
                step={1000}
                {...register('basePrice', { valueAsNumber: true })}
                aria-invalid={errors.basePrice ? 'true' : 'false'}
              />
              {errors.basePrice && (
                <p className="mt-1 text-sm text-error-600">{errors.basePrice.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                En comodato puedes registrar 0 si no hay cargo recurrente.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Controller
                name="isLoan"
                control={control}
                render={({ field }) => (
                  <CheckboxCard
                    label="Comodato"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    name={field.name}
                  />
                )}
              />

              <Controller
                name="requiresInventory"
                control={control}
                render={({ field }) => (
                  <CheckboxCard
                    label="Requiere control de inventario"
                    description="Al vender o entregar, debe registrarse salida en Inventario."
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    name={field.name}
                  />
                )}
              />
            </div>

            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <CheckboxCard
                  label="Activo"
                  description="Disponible para nuevas operaciones comerciales."
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              )}
            />
          </section>

          {formError && (
            <PortalAlert
              variant="error"
              title="No fue posible guardar el producto"
              description={formError}
              icon={CircleAlert}
            />
          )}
        </form>
      </PortalSidePeek>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTarget?.name}</strong>? Esta acción es irreversible.
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <PortalAlert
              variant="error"
              title="No fue posible eliminar"
              description={actionError}
              icon={CircleAlert}
              className="mt-3"
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!!deleting}
              onClick={() => {
                setDeleteTarget(null);
                setActionError(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} loading={!!deleting}>
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
