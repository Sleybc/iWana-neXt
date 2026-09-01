'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { InventoryCategoryStatus } from '@iwana/shared';
import type {
  CreateInventoryCategoryDto,
  InventoryCategoryRecord,
  UpdateInventoryCategoryDto,
} from '@/lib/api-client';
import { inventoryApi } from '@/lib/api-client';
import { PortalAlert, portalTextareaClassName } from '@/components/shared/portal-ui';
import { useDiscardChangesGuard } from '@/components/shared/use-discard-changes-guard';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { getInventoryCategoryStatusLabel } from './inventory-category-labels';
import { InventorySideDrawerShell } from './InventorySideDrawerShell';
import {
  buildTakenCodePrefixSet,
  isValidCategoryCodePrefix,
  resolveCategoryCreateValues,
  resolveCategorySortOrder,
  sanitizeAlnumUpper,
  suggestCategoryCodePrefix,
  suggestNextCategorySortOrder,
} from './inventory-category-code';

interface CategoryFormState {
  code: string;
  codePrefix: string;
  name: string;
  description: string;
  status: InventoryCategoryStatus;
  sortOrder: string;
}

function defaultFormState(): CategoryFormState {
  return {
    code: '',
    codePrefix: '',
    name: '',
    description: '',
    status: InventoryCategoryStatus.ACTIVE,
    sortOrder: '0',
  };
}

function formFromCategory(category: InventoryCategoryRecord): CategoryFormState {
  return {
    code: category.code,
    codePrefix: category.codePrefix,
    name: category.name,
    description: category.description ?? '',
    status: category.status,
    sortOrder: String(category.sortOrder),
  };
}

function buildUpdatePayload(form: CategoryFormState): UpdateInventoryCategoryDto {
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
  existingCategories?: InventoryCategoryRecord[];
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: CreateInventoryCategoryDto) => Promise<void>;
  onUpdate: (id: string, payload: UpdateInventoryCategoryDto) => Promise<void>;
}

export function InventoryCategoryDrawer({
  open,
  category,
  existingCategories = [],
  isSubmitting,
  error,
  onClose,
  onCreate,
  onUpdate,
}: InventoryCategoryDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<CategoryFormState>(defaultFormState());
  const [baselineForm, setBaselineForm] = useState<CategoryFormState | null>(null);
  const [codePrefixTouched, setCodePrefixTouched] = useState(false);
  const [sortOrderTouched, setSortOrderTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const isEditing = category !== null;
  const hasProducts = (category?.productCount ?? 0) > 0;
  const takenCodePrefixes = useMemo(
    () => buildTakenCodePrefixSet(existingCategories, category?.id),
    [category?.id, existingCategories],
  );

  useEffect(() => {
    if (!open) {
      setBaselineForm(null);
      return;
    }

    setValidationError(null);
    setCodePrefixTouched(false);
    setSortOrderTouched(false);
    const initialForm = category
      ? formFromCategory(category)
      : {
          ...defaultFormState(),
          sortOrder: String(suggestNextCategorySortOrder(existingCategories)),
        };
    setBaselineForm(initialForm);
    setForm(initialForm);
  }, [open, category]);

  useEffect(() => {
    if (!open || isEditing || !form.name.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const params = {
        name: form.name.trim(),
        ...(codePrefixTouched && form.codePrefix.trim()
          ? { codePrefix: form.codePrefix.trim() }
          : {}),
      };

      void inventoryApi
        .suggestCategoryPrefix(params)
        .then((suggestion) => {
          setForm((current) => ({
            ...current,
            codePrefix: codePrefixTouched ? current.codePrefix : suggestion.codePrefix,
            sortOrder: sortOrderTouched ? current.sortOrder : String(suggestion.sortOrder),
          }));
        })
        .catch(() => {
          setForm((current) => ({
            ...current,
            codePrefix: codePrefixTouched
              ? current.codePrefix
              : suggestCategoryCodePrefix(form.name.trim(), takenCodePrefixes),
          }));
        });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [
    open,
    isEditing,
    form.name,
    form.codePrefix,
    codePrefixTouched,
    sortOrderTouched,
    takenCodePrefixes,
  ]);

  const isDirty = isEditing
    ? baselineForm !== null && JSON.stringify(form) !== JSON.stringify(baselineForm)
    : form.name.trim().length > 0 ||
      form.description.trim().length > 0 ||
      codePrefixTouched ||
      sortOrderTouched;

  const { discardOpen, requestClose, confirmDiscard, cancelDiscard } = useDiscardChangesGuard({
    open,
    isDirty,
    onClose,
  });

  usePortalSideDrawerA11y(open && !discardOpen, drawerRef, requestClose);

  function shouldAutoSuggestPrefix(formState: CategoryFormState): boolean {
    return !codePrefixTouched || !formState.codePrefix.trim();
  }

  function shouldAutoSuggestSortOrder(formState: CategoryFormState): boolean {
    return !sortOrderTouched;
  }

  function buildCreatePayload(formState: CategoryFormState): CreateInventoryCategoryDto {
    const { code, codePrefix } = resolveCategoryCreateValues(
      formState.name,
      formState.codePrefix,
      takenCodePrefixes,
      shouldAutoSuggestPrefix(formState),
    );

    return {
      code,
      codePrefix,
      name: formState.name.trim(),
      description: formState.description.trim() || null,
      status: formState.status,
      sortOrder: resolveCategorySortOrder(
        formState.sortOrder,
        existingCategories,
        shouldAutoSuggestSortOrder(formState),
      ),
    };
  }

  function updateName(value: string) {
    setForm((current) => {
      const next = { ...current, name: value };
      if (!codePrefixTouched && value.trim()) {
        next.codePrefix = suggestCategoryCodePrefix(value.trim(), takenCodePrefixes);
      }
      return next;
    });
  }

  function updateCodePrefix(value: string) {
    const sanitized = sanitizeAlnumUpper(value).slice(0, 3);
    setCodePrefixTouched(true);
    setForm((current) => ({ ...current, codePrefix: sanitized }));
  }

  function updateSortOrder(value: string) {
    setSortOrderTouched(true);
    setForm((current) => ({ ...current, sortOrder: value }));
  }

  function updateForm<K extends keyof CategoryFormState>(key: K, value: CategoryFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setValidationError('Completa el nombre de la categoría.');
      return;
    }

    if (!isEditing) {
      const trimmedPrefix = form.codePrefix.trim();
      if (codePrefixTouched && trimmedPrefix) {
        const sanitizedPrefix = sanitizeAlnumUpper(trimmedPrefix).slice(0, 3);
        if (!isValidCategoryCodePrefix(sanitizedPrefix)) {
          setValidationError(
            'El prefijo de producto debe tener entre 2 y 3 caracteres alfanuméricos en mayúscula.',
          );
          return;
        }
      }

      const { code, codePrefix } = resolveCategoryCreateValues(
        form.name,
        form.codePrefix,
        takenCodePrefixes,
        shouldAutoSuggestPrefix(form),
      );

      if (!code) {
        setValidationError('El nombre debe incluir al menos una letra o un número.');
        return;
      }

      if (!isValidCategoryCodePrefix(codePrefix)) {
        setValidationError(
          'El prefijo de producto debe tener entre 2 y 3 caracteres alfanuméricos en mayúscula.',
        );
        return;
      }
    } else if (!form.code.trim()) {
      setValidationError('Completa el código de la categoría.');
      return;
    }

    setValidationError(null);

    if (isEditing && category) {
      await onUpdate(category.id, buildUpdatePayload(form));
      return;
    }

    await onCreate(buildCreatePayload(form));
  }

  if (!open) {
    return null;
  }

  const title = isEditing ? 'Editar categoría' : 'Nueva categoría';

  return (
    <InventorySideDrawerShell
      open={open}
      drawerRef={drawerRef}
      labelledBy="inventory-category-drawer-title"
      describedBy="inventory-category-drawer-description"
      closeAriaLabel="Cerrar categoría"
      maxWidthClass="max-w-2xl"
      onRequestClose={requestClose}
      closeDisabled={isSubmitting}
      discardOpen={discardOpen}
      onConfirmDiscard={confirmDiscard}
      onCancelDiscard={cancelDiscard}
      header={
        <>
          <p className="portal-eyebrow">Catálogo</p>
          <h2
            id="inventory-category-drawer-title"
            className="mt-1 text-xl font-semibold text-gray-900 dark:text-white"
          >
            {title}
          </h2>
          <p
            id="inventory-category-drawer-description"
            className="mt-2 text-sm text-gray-500 dark:text-gray-400"
          >
            Define cómo se clasifican los productos y cómo se emite el prefijo de nuevos códigos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={form.status === InventoryCategoryStatus.ACTIVE ? 'primary' : 'neutral'}>
              {getInventoryCategoryStatusLabel(form.status)}
            </Badge>
            {isEditing ? (
              <Badge variant="neutral">{category?.productCount ?? 0} productos</Badge>
            ) : null}
          </div>
        </>
      }
      body={
        <div className="space-y-4">
          {error ? (
            <PortalAlert variant="error" title="No fue posible guardar" description={error} />
          ) : null}
          {validationError ? (
            <PortalAlert
              variant="warning"
              title="Revisa el formulario"
              description={validationError}
            />
          ) : null}
          {isEditing && hasProducts ? (
            <PortalAlert
              variant="info"
              title="Categoría en uso"
              description="Esta categoría tiene productos asociados. Solo puedes editarla o inactivarla."
            />
          ) : null}

          <Input
            label="Nombre"
            value={form.name}
            onChange={(event) => updateName(event.target.value)}
          />
          {!isEditing ? (
            <div className="space-y-1">
              <Input
                label="Prefijo de código"
                value={form.codePrefix}
                onChange={(event) => updateCodePrefix(event.target.value)}
              />
              <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
                Se genera automáticamente desde el nombre y se usa para crear los códigos de los
                productos (ej. CFO-SER-ONT-ZTE-F601). Puedes ajustarlo antes de guardar; no se puede
                cambiar después.
              </p>
            </div>
          ) : (
            <>
              <Input
                label="Código"
                value={form.code}
                onChange={(event) => updateForm('code', event.target.value)}
                disabled={hasProducts}
              />
              <div className="space-y-1">
                <Input label="Prefijo de código" value={form.codePrefix} disabled />
                <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
                  Prefijo usado en los códigos de producto de esta categoría. No se puede modificar
                  después de crear la categoría.
                </p>
              </div>
            </>
          )}
          <label className="space-y-1 text-sm">
            <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
              Descripción corta
            </span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              className={portalTextareaClassName}
            />
          </label>
          <Select
            label="Estado"
            value={form.status}
            options={Object.values(InventoryCategoryStatus).map((value) => ({
              value,
              label: getInventoryCategoryStatusLabel(value),
            }))}
            onChange={(event) =>
              updateForm('status', event.target.value as InventoryCategoryStatus)
            }
          />
          <Input
            label="Orden"
            type="number"
            min={0}
            value={form.sortOrder}
            onChange={(event) => updateSortOrder(event.target.value)}
          />
          {!isEditing ? (
            <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
              Se asigna automáticamente al final del listado. Puedes cambiarlo si necesitas otra
              posición.
            </p>
          ) : null}
        </div>
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="button" loading={isSubmitting} onClick={() => void handleSubmit()}>
            {isEditing ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </>
      }
    />
  );
}
