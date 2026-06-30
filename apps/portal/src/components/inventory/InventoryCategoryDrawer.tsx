'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import { InventoryCategoryStatus } from '@iwana/shared';
import type {
  CreateInventoryCategoryDto,
  InventoryCategoryRecord,
  UpdateInventoryCategoryDto,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { getInventoryCategoryStatusLabel } from './inventory-category-labels';

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

interface CategoryFormState {
  code: string;
  name: string;
  description: string;
  status: InventoryCategoryStatus;
  sortOrder: string;
}

function defaultFormState(): CategoryFormState {
  return {
    code: '',
    name: '',
    description: '',
    status: InventoryCategoryStatus.ACTIVE,
    sortOrder: '0',
  };
}

function formFromCategory(category: InventoryCategoryRecord): CategoryFormState {
  return {
    code: category.code,
    name: category.name,
    description: category.description ?? '',
    status: category.status,
    sortOrder: String(category.sortOrder),
  };
}

function buildPayload(form: CategoryFormState): CreateInventoryCategoryDto {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    status: form.status,
    sortOrder: Number.parseInt(form.sortOrder || '0', 10),
  };
}

interface InventoryCategoryDrawerProps {
  open: boolean;
  category: InventoryCategoryRecord | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: CreateInventoryCategoryDto) => Promise<void>;
  onUpdate: (id: string, payload: UpdateInventoryCategoryDto) => Promise<void>;
}

export function InventoryCategoryDrawer({
  open,
  category,
  isSubmitting,
  error,
  onClose,
  onCreate,
  onUpdate,
}: InventoryCategoryDrawerProps) {
  const [form, setForm] = useState<CategoryFormState>(defaultFormState());
  const [validationError, setValidationError] = useState<string | null>(null);
  const isEditing = category !== null;
  const hasProducts = (category?.productCount ?? 0) > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    setValidationError(null);
    setForm(category ? formFromCategory(category) : defaultFormState());
  }, [open, category]);

  function updateForm<K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.code.trim() || !form.name.trim()) {
      setValidationError('Completa el código y el nombre de la categoría.');
      return;
    }

    setValidationError(null);
    const payload = buildPayload(form);

    if (isEditing && category) {
      await onUpdate(category.id, payload);
      return;
    }

    await onCreate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error ? <PortalAlert variant="error" title="No fue posible guardar" description={error} /> : null}
          {validationError ? (
            <PortalAlert variant="warning" title="Revisa el formulario" description={validationError} />
          ) : null}
          {isEditing && hasProducts ? (
            <PortalAlert
              variant="info"
              title="Categoría en uso"
              description="Esta categoría tiene productos asociados. Solo puedes editarla o inactivarla."
            />
          ) : null}

          <Input
            label="Código"
            value={form.code}
            onChange={(event) => updateForm('code', event.target.value)}
            disabled={isEditing && hasProducts}
          />
          <Input
            label="Nombre"
            value={form.name}
            onChange={(event) => updateForm('name', event.target.value)}
          />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
              Descripción corta
            </span>
            <textarea
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              className={`${fieldClassName} min-h-24`}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Estado</span>
            <select
              value={form.status}
              onChange={(event) =>
                updateForm('status', event.target.value as InventoryCategoryStatus)
              }
              className={fieldClassName}
            >
              {Object.values(InventoryCategoryStatus).map((value) => (
                <option key={value} value={value}>
                  {getInventoryCategoryStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Orden"
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => updateForm('sortOrder', event.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="button" loading={isSubmitting} onClick={() => void handleSubmit()}>
              {isEditing ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
