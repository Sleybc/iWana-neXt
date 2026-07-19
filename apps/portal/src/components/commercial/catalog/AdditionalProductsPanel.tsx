'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { CheckCircle2, CircleAlert, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@iwana/ui';
import {
  commercialApi,
  type AdditionalProduct,
  type CreateAdditionalProductDto,
  type UpdateAdditionalProductDto,
} from '@/lib/api-client';
import { ProductCategory, PRODUCT_CATEGORY_LABELS } from '@iwana/shared';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSearchField,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  commercialTableRowHoverClassName,
  commercialTextareaClassName,
} from '@/components/commercial/commercial-field-styles';

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
  isLoan: z.boolean(),
  requiresInventory: z.boolean(),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;
type ProductStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type ProductCommercialModelFilter = 'ALL' | 'SALE' | 'LOAN';
type ProductSortMode = 'CATEGORY_NAME' | 'ACTIVE_NAME' | 'RECENTLY_UPDATED';

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
}

function getDefaultProductFormValues(): ProductFormValues {
  return {
    name: '',
    description: '',
    category: ProductCategory.CONNECTIVITY,
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
    isLoan: product.isLoan,
    requiresInventory: product.requiresInventory,
    isActive: product.isActive,
  };
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

export function AdditionalProductsPanel({ canEdit }: AdditionalProductsPanelProps) {
  const [products, setProducts] = useState<AdditionalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('ALL');
  const [commercialModelFilter, setCommercialModelFilter] =
    useState<ProductCommercialModelFilter>('ALL');
  const [sortMode, setSortMode] = useState<ProductSortMode>('ACTIVE_NAME');

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
    void loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await commercialApi.getAdditionalProducts();
      setProducts(data);
    } catch (err) {
      console.error('Error loading additional products:', err);
      setLoadError('No se pudieron cargar los productos adicionales.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingProductId(null);
    setFormError(null);
    reset(getDefaultProductFormValues());
    setIsDialogOpen(true);
  }

  function openEditDialog(product: AdditionalProduct) {
    setEditingProductId(product.id);
    setFormError(null);
    reset(toProductFormValues(product));
    setIsDialogOpen(true);
  }

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
        };
        const updated = await commercialApi.updateAdditionalProduct(editingProductId, dto);
        setProducts(updated);
      } else {
        const dto: CreateAdditionalProductDto = {
          name: values.name.trim(),
          description: normalizedDescription,
          category: values.category,
          isLoan: values.isLoan,
          requiresInventory: values.requiresInventory,
          isActive: values.isActive,
        };
        const created = await commercialApi.createAdditionalProduct(dto);
        setProducts(created);
      }

      handleDialogOpenChange(false);
    } catch (err) {
      console.error('Error saving additional product:', err);
      setFormError('No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(productId: string) {
    if (!window.confirm('Eliminar este producto adicional?')) return;

    setDeleting(productId);
    setLoadError(null);

    try {
      const updated = await commercialApi.deleteAdditionalProduct(productId);
      setProducts(updated);
    } catch (err) {
      console.error('Error deleting additional product:', err);
      setLoadError('No se pudo eliminar el producto.');
    } finally {
      setDeleting(null);
    }
  }

  const totalProducts = products.length;
  const activeProductsCount = products.filter((product) => product.isActive).length;
  const inactiveProductsCount = totalProducts - activeProductsCount;
  const categoryTotals = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      count: products.filter((product) => product.category === category).length,
    })).filter((item) => item.count > 0);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchValue);

    return [...products]
      .filter((product) => {
        if (categoryFilter !== 'ALL' && product.category !== categoryFilter) {
          return false;
        }

        if (statusFilter === 'ACTIVE' && !product.isActive) {
          return false;
        }

        if (statusFilter === 'INACTIVE' && product.isActive) {
          return false;
        }

        if (commercialModelFilter === 'LOAN' && !product.isLoan) {
          return false;
        }

        if (commercialModelFilter === 'SALE' && product.isLoan) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return [product.name, product.description ?? '', PRODUCT_CATEGORY_LABELS[product.category]]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .sort((left, right) => {
        if (sortMode === 'RECENTLY_UPDATED') {
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }

        if (sortMode === 'ACTIVE_NAME') {
          if (left.isActive !== right.isActive) {
            return left.isActive ? -1 : 1;
          }

          return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
        }

        const categoryDiff =
          CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);

        if (categoryDiff !== 0) {
          return categoryDiff;
        }

        return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
      });
  }, [categoryFilter, commercialModelFilter, products, searchValue, sortMode, statusFilter]);

  const hasActiveFilters =
    Boolean(searchValue.trim()) ||
    categoryFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    commercialModelFilter !== 'ALL';

  const resultsLabel =
    filteredProducts.length === totalProducts
      ? `${totalProducts} registros`
      : `${filteredProducts.length} de ${totalProducts} registros`;

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
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agregar producto
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {loading ? (
        <PortalSkeletonBlock className="h-28" />
      ) : loadError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar productos adicionales"
          description={loadError}
          icon={CircleAlert}
        />
      ) : products.length === 0 ? (
        <PortalEmptyState
          title="Catálogo listo para crecer"
          description="No hay productos adicionales. Crea uno para empezar."
          icon={CheckCircle2}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px_220px_220px_auto] lg:items-end">
            <PortalSearchField
              id="product-search"
              label="Buscar producto"
              placeholder="Buscar por nombre, descripción o categoría"
              value={searchValue}
              onChange={(value) => setSearchValue(value)}
            />

            <Select
              id="product-category-filter"
              label="Categoria"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-12"
            >
              <option value="ALL">Todas</option>
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {PRODUCT_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>

            <Select
              id="product-status-filter"
              label="Estado"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ProductStatusFilter)}
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
                setCommercialModelFilter(event.target.value as ProductCommercialModelFilter)
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
              onChange={(event) => setSortMode(event.target.value as ProductSortMode)}
              className="h-12"
            >
              <option value="ACTIVE_NAME">Activos primero</option>
              <option value="CATEGORY_NAME">Por categoria</option>
              <option value="RECENTLY_UPDATED">Recientes primero</option>
            </Select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchValue('');
                  setCategoryFilter('ALL');
                  setStatusFilter('ALL');
                  setCommercialModelFilter('ALL');
                }}
                className="h-12 px-4"
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-iwana-surface-soft px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Explora la oferta comercial desde una sola vista. La categoría funciona como filtro y
              badge, no como subsección separada.
            </p>
            <Badge variant="neutral">{resultsLabel}</Badge>
          </div>

          {categoryTotals.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-[20px] border border-gray-100 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-1">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  categoryFilter === 'ALL'
                    ? 'border-iwana-secondary-700 bg-iwana-secondary-50 text-iwana-secondary-700 dark:border-iwana-secondary dark:bg-iwana-secondary/15 dark:text-iwana-secondary-300'
                    : 'border-gray-200 text-gray-600 hover:border-iwana-secondary/40 hover:text-iwana-primary dark:border-dark-border dark:text-gray-300',
                )}
              >
                Todas
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
                  {totalProducts}
                </span>
              </button>

              {categoryTotals.map((item) => (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => setCategoryFilter(item.category)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    categoryFilter === item.category
                      ? 'border-iwana-secondary-700 bg-iwana-secondary-50 text-iwana-secondary-700 dark:border-iwana-secondary dark:bg-iwana-secondary/15 dark:text-iwana-secondary-300'
                      : 'border-gray-200 text-gray-600 hover:border-iwana-secondary/40 hover:text-iwana-primary dark:border-dark-border dark:text-gray-300',
                  )}
                >
                  {PRODUCT_CATEGORY_LABELS[item.category]}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-4 text-sm text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">No hay productos para los filtros seleccionados.</p>
                <p className="mt-1">
                  Ajusta busqueda, categoria, estado o modelo comercial para recuperar resultados.
                </p>
              </div>
            </div>
          ) : (
            <div className={portalDataTableShellClassName}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                    <tr>
                      <th className={portalDataTableHeadClassName}>Producto</th>
                      <th className={portalDataTableHeadClassName}>Categoría</th>
                      <th className={portalDataTableHeadClassName}>Modelo comercial</th>
                      <th className={portalDataTableHeadClassName}>Estado</th>
                      <th className={portalDataTableHeadClassName}>Señales</th>
                      {canEdit && (
                        <th className={cn(portalDataTableHeadClassName, 'w-40')}>Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-1">
                    {filteredProducts.map((product) => (
                      <tr
                        key={product.id}
                        className={cn(
                          'transition-colors hover:bg-iwana-surface-soft/80 dark:hover:bg-dark-surface-3',
                          !product.isActive && 'opacity-70',
                        )}
                      >
                        <td className={portalDataTableCellClassName}>
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {product.description?.trim() || 'Sin descripcion operativa.'}
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
                                className="inline-flex items-center gap-1 rounded-full border border-iwana-secondary/30 bg-iwana-secondary/5 px-2 py-1 text-xs font-medium text-iwana-secondary-700 transition-colors hover:bg-iwana-secondary/10 dark:border-iwana-secondary/40 dark:bg-iwana-secondary/10 dark:text-iwana-secondary-300"
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
                                onClick={() => handleDelete(product.id)}
                                disabled={deleting === product.id}
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
            </div>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProductId ? 'Editar producto adicional' : 'Crear producto adicional'}
            </DialogTitle>
            <DialogDescription>
              {editingProductId
                ? 'Actualiza la información básica y la configuración comercial del producto adicional.'
                : 'Agrega un producto adicional a la oferta comercial con los datos mínimos de operación.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <section className="space-y-4 rounded-2xl border border-gray-100 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Informacion basica
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Identifica el producto dentro del catalogo sin mezclar informacion propia de
                  inventario fisico.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Input
                    label="Nombre"
                    {...register('name')}
                    placeholder="Ej. TvBox, Camara IP interior"
                    aria-invalid={errors.name ? 'true' : 'false'}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select
                      label="Categoria"
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
                    className={`mt-2 ${commercialTextareaClassName}`}
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-gray-100 p-4 dark:border-dark-border">
              <div>
                <p className="portal-eyebrow">Configuración comercial</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Define cómo se comercializa el producto y si se mantiene disponible para nuevas
                  operaciones.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-3 text-sm dark:border-dark-border">
                  <input
                    {...register('isLoan')}
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Comodato
                </label>

                <label
                  className="flex items-start gap-2 rounded-2xl border border-gray-200 px-3 py-3 text-sm dark:border-dark-border"
                  title="Al vender o entregar, debe registrarse salida en Inventario."
                >
                  <input
                    {...register('requiresInventory')}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      Requiere control de inventario
                    </span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      Al vender o entregar, debe registrarse salida en Inventario.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  {...register('isActive')}
                  type="checkbox"
                  id="isActive"
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-200">
                  Activo
                </label>
              </div>
            </section>

            {formError && (
              <PortalAlert
                variant="error"
                title="No fue posible guardar el producto"
                description={formError}
                icon={CircleAlert}
              />
            )}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={(!isDirty && !!editingProductId) || saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
