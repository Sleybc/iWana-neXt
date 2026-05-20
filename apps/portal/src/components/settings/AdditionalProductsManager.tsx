'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, PackagePlus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';

const PRODUCT_CATEGORY_VALUES = [
  ProductCategory.ENTERTAINMENT,
  ProductCategory.SECURITY,
  ProductCategory.CONNECTIVITY,
  ProductCategory.BUSINESS,
  ProductCategory.NETWORKING,
  ProductCategory.CPE,
] as const;

const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(100, 'Maximo 100 caracteres.'),
  description: z.string().trim().max(240, 'Maximo 240 caracteres.').optional(),
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

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';
const searchInputClass =
  'h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-11 pr-4 text-sm text-iwana-primary shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-iwana-secondary focus:bg-white focus:outline-none focus:ring-2 focus:ring-iwana-secondary/35 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100 dark:placeholder-gray-500';

interface AdditionalProductsManagerProps {
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

export function AdditionalProductsManager({ canEdit }: AdditionalProductsManagerProps) {
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
    <Card className="rounded-2xl border border-white/70 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
              <PackagePlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Venta consultiva
              </p>
              <CardTitle className="mt-1 text-lg font-semibold">Catalogo de productos</CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Administra el catálogo maestro de la empresa en una sola vista con búsqueda, filtros
                y edicion rapida.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {totalProducts} total
            </Badge>
            <Badge
              variant="success"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {activeProductsCount} activo{activeProductsCount === 1 ? '' : 's'}
            </Badge>
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {inactiveProductsCount} inactivo{inactiveProductsCount === 1 ? '' : 's'}
            </Badge>
            {canEdit && (
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Agregar producto
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <PortalSkeletonBlock className="h-28" />
        ) : loadError ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar productos"
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
              <div className="min-w-[200px]">
                <label htmlFor="product-search" className="sr-only">
                  Buscar producto
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    id="product-search"
                    type="search"
                    placeholder="Buscar por nombre, descripcion o categoria"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    className={searchInputClass}
                  />
                </div>
              </div>

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

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-[#f8faf5] px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Explora todo el catalogo desde una sola vista. La categoria funciona como filtro y
                badge, no como subseccion separada.
              </p>
              <Badge
                variant="neutral"
                className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              >
                {resultsLabel}
              </Badge>
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
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
                    <tr>
                      <th className={tableHeadClass}>Producto</th>
                      <th className={tableHeadClass}>Categoria</th>
                      <th className={tableHeadClass}>Modelo comercial</th>
                      <th className={tableHeadClass}>Estado</th>
                      <th className={tableHeadClass}>Senales</th>
                      {canEdit && <th className={cn(tableHeadClass, 'w-40')}>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-1">
                    {filteredProducts.map((product) => (
                      <tr
                        key={product.id}
                        className={cn(
                          'transition-colors hover:bg-[#fbfcf8] dark:hover:bg-dark-surface-3',
                          !product.isActive && 'opacity-70',
                        )}
                      >
                        <td className={cellClass}>
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {product.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {product.description?.trim() || 'Sin descripcion operativa.'}
                            </p>
                          </div>
                        </td>
                        <td className={cellClass}>
                          <Badge variant="neutral" className="text-xs">
                            {PRODUCT_CATEGORY_LABELS[product.category]}
                          </Badge>
                        </td>
                        <td className={cellClass}>{product.isLoan ? 'Comodato' : 'Venta'}</td>
                        <td className={cellClass}>
                          <Badge
                            variant={product.isActive ? 'success' : 'neutral'}
                            className="text-xs"
                          >
                            {product.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className={cellClass}>
                          <div className="flex flex-wrap gap-2">
                            {product.requiresInventory ? (
                              <span className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-600 dark:border-dark-border dark:text-gray-300">
                                Inventariable
                              </span>
                            ) : (
                              <span className="rounded-full border border-dashed border-gray-200 px-2 py-1 text-xs text-gray-500 dark:border-dark-border dark:text-gray-400">
                                Sin inventario
                              </span>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className={cellClass}>
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
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProductId ? 'Editar producto' : 'Crear producto'}</DialogTitle>
            <DialogDescription>
              {editingProductId
                ? 'Actualiza la informacion basica y la configuracion comercial del producto.'
                : 'Agrega un producto al catalogo maestro con los datos minimos de operacion comercial.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <section className="space-y-4 rounded-2xl border border-gray-100 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
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

                <Select {...register('category')} label="Categoria" className="h-11">
                  {CATEGORY_ORDER.map((cat) => (
                    <option key={cat} value={cat}>
                      {PRODUCT_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </Select>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Descripcion corta
                  </label>
                  <textarea
                    {...register('description')}
                    rows={4}
                    placeholder="Describe brevemente el uso comercial del producto o como se diferencia dentro del catalogo."
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm transition-colors placeholder:text-gray-400 focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/30 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-gray-100 p-4 dark:border-dark-border">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Configuracion comercial
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Define como se comercializa el producto y si se mantiene disponible para nuevas
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

                <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-3 text-sm dark:border-dark-border">
                  <input
                    {...register('requiresInventory')}
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Requiere inventario
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
    </Card>
  );
}
