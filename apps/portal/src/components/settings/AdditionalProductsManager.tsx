'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  cn,
} from '@iwana/ui';
import {
  tenantSelfApi,
  type AdditionalProduct,
  type CreateAdditionalProductDto,
  type UpdateAdditionalProductDto,
} from '@/lib/api-client';
import { AdditionalProductCategory, ADDITIONAL_PRODUCT_CATEGORY_LABELS } from '@iwana/shared';

const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(100, 'Máximo 100 caracteres.'),
  category: z.enum([
    AdditionalProductCategory.ENTERTAINMENT,
    AdditionalProductCategory.SECURITY,
    AdditionalProductCategory.CONNECTIVITY,
    AdditionalProductCategory.BUSINESS,
  ] as const),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

const CATEGORY_ORDER = [
  AdditionalProductCategory.ENTERTAINMENT,
  AdditionalProductCategory.SECURITY,
  AdditionalProductCategory.CONNECTIVITY,
  AdditionalProductCategory.BUSINESS,
];

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-200';

interface AdditionalProductsManagerProps {
  canEdit: boolean;
}

export function AdditionalProductsManager({ canEdit }: AdditionalProductsManagerProps) {
  const [products, setProducts] = useState<AdditionalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      category: AdditionalProductCategory.CONNECTIVITY,
      sortOrder: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const data = await tenantSelfApi.getAdditionalProducts();
      setProducts(data);
    } catch (err) {
      console.error('Error loading additional products:', err);
      setError('No se pudieron cargar los productos adicionales.');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingProductId(null);
    reset({
      name: '',
      category: AdditionalProductCategory.CONNECTIVITY,
      sortOrder: 0,
      isActive: true,
    });
    setCreating(true);
  }

  function openEditDialog(product: AdditionalProduct) {
    setEditingProductId(product.id);
    reset({
      name: product.name,
      category: product.category as AdditionalProductCategory,
      sortOrder: product.sortOrder,
      isActive: product.isActive,
    });
    setCreating(true);
  }

  async function onSubmit(values: ProductFormValues) {
    setSaving(true);
    setError(null);

    try {
      if (editingProductId) {
        const dto: UpdateAdditionalProductDto = {
          name: values.name,
          category: values.category,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        };
        const updated = await tenantSelfApi.updateAdditionalProduct(editingProductId, dto);
        setProducts(updated);
      } else {
        const dto: CreateAdditionalProductDto = {
          name: values.name,
          category: values.category,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
        };
        const created = await tenantSelfApi.createAdditionalProduct(dto);
        setProducts(created);
      }
      setCreating(false);
    } catch (err) {
      console.error('Error saving additional product:', err);
      setError('No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(productId: string) {
    if (!window.confirm('¿Eliminar este producto adicional?')) return;

    setDeleting(productId);
    setError(null);

    try {
      const updated = await tenantSelfApi.deleteAdditionalProduct(productId);
      setProducts(updated);
    } catch (err) {
      console.error('Error deleting additional product:', err);
      setError('No se pudo eliminar el producto.');
    } finally {
      setDeleting(null);
    }
  }

  const groupedProducts = CATEGORY_ORDER.reduce(
    (acc, category) => {
      acc[category] = products.filter((p) => p.category === category);
      return acc;
    },
    {} as Record<AdditionalProductCategory, AdditionalProduct[]>,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Productos Adicionales</CardTitle>
        {canEdit && (
          <Button onClick={openCreateDialog} size="sm">
            Agregar producto
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500">Cargando productos...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-500">
            No hay productos adicionales. Crea uno para empezar.
          </p>
        ) : (
          <div className="space-y-6">
            {CATEGORY_ORDER.map((category) => {
              const categoryProducts = groupedProducts[category];
              if (categoryProducts.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {ADDITIONAL_PRODUCT_CATEGORY_LABELS[category]}
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-dark-border">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                      <thead className="bg-gray-50 dark:bg-dark-surface-2">
                        <tr>
                          <th className={tableHeadClass}>Nombre</th>
                          <th className={tableHeadClass}>Orden</th>
                          <th className={tableHeadClass}>Estado</th>
                          {canEdit && <th className={cn(tableHeadClass, 'w-32')}>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-border dark:bg-dark-surface-1">
                        {categoryProducts.map((product) => (
                          <tr key={product.id}>
                            <td className={cellClass}>{product.name}</td>
                            <td className={cellClass}>{product.sortOrder}</td>
                            <td className={cellClass}>
                              <Badge
                                variant={product.isActive ? 'success' : 'neutral'}
                                className="text-xs"
                              >
                                {product.isActive ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </td>
                            {canEdit && (
                              <td className={cellClass}>
                                <div className="flex gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openEditDialog(product)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDelete(product.id)}
                                    disabled={deleting === product.id}
                                  >
                                    {deleting === product.id ? 'Eliminando...' : 'Eliminar'}
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
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProductId ? 'Editar producto' : 'Crear producto'}</DialogTitle>
            <DialogDescription>
              {editingProductId
                ? 'Modifica los datos del producto adicional.'
                : 'Agrega un nuevo producto adicional al catálogo.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Nombre
              </label>
              <Input
                {...register('name')}
                placeholder="Ej. TvBox, Cámaras de seguridad"
                aria-invalid={errors.name ? 'true' : 'false'}
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Categoría
              </label>
              <select
                {...register('category')}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/20 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
              >
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {ADDITIONAL_PRODUCT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Orden
              </label>
              <Input
                {...register('sortOrder', { valueAsNumber: true })}
                type="number"
                min={0}
                max={999}
              />
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

            {error && <p className="text-sm text-red-600">{error}</p>}

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
