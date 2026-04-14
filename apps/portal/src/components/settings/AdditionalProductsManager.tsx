'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, PackagePlus } from 'lucide-react';
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
    <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <PackagePlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Venta consultiva
            </p>
            <CardTitle className="mt-1 text-lg font-semibold">Productos Adicionales</CardTitle>
          </div>
        </div>
        {canEdit && (
          <Button onClick={openCreateDialog} size="sm">
            Agregar producto
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-28 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
        ) : error ? (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-start gap-3 rounded-[24px] border border-emerald-200/60 bg-[linear-gradient(135deg,rgba(248,250,245,0.96),rgba(255,255,255,0.94))] px-4 py-4 text-sm text-gray-600 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-800 dark:text-white">Catálogo listo para crecer</p>
              <p className="mt-1">No hay productos adicionales. Crea uno para empezar.</p>
            </div>
          </div>
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
                  <div className="overflow-x-auto rounded-[24px] border border-gray-200 dark:border-dark-border">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                      <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
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
              <Select {...register('category')} className="h-11">
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {ADDITIONAL_PRODUCT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
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

            {error && (
              <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>{error}</p>
              </div>
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
