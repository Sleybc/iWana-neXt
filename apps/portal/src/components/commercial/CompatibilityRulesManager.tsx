'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
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
  Select,
} from '@iwana/ui';
import {
  ApiError,
  commercialApi,
  type AdditionalProduct,
  type CompatibilityRule,
  type CreateCompatibilityRuleDto,
  type PlanCatalogItem,
  type UpdateCompatibilityRuleDto,
} from '@/lib/api-client';
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';

interface CompatibilityRulesManagerProps {
  canEdit: boolean;
}

interface CatalogSelectableItem {
  id: string;
  name: string;
}

interface CreateFormState {
  sourceItemId: string;
  targetItemId: string;
  effectiveFrom: string;
  note: string;
}

interface EditFormState {
  effectiveFrom: string;
  note: string;
  isActive: boolean;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  sourceItemId: '',
  targetItemId: '',
  effectiveFrom: '',
  note: '',
};

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-200';

// Clase compartida para inputs de fecha y textarea dentro de los modales.
const inputBaseClass =
  'h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm outline-none transition-colors focus:border-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100';

const textareaBaseClass =
  'w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CO');
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Tu rol no tiene permisos para consultar las reglas.';
    return error.message;
  }
  return 'No fue posible cargar las reglas de compatibilidad.';
}

export function CompatibilityRulesManager({ canEdit }: CompatibilityRulesManagerProps) {
  const [rules, setRules] = useState<CompatibilityRule[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogSelectableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CompatibilityRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [createFormErrors, setCreateFormErrors] = useState<
    Partial<Record<keyof CreateFormState, string>>
  >({});

  const [editForm, setEditForm] = useState<EditFormState>({
    effectiveFrom: '',
    note: '',
    isActive: true,
  });

  // Solo REPLACES en scope v1 del diseño comercial.
  const replacesRules = rules.filter((r) => r.ruleType === 'REPLACES');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [rulesData, plans, products] = await Promise.all([
        commercialApi.getCompatibilityRules(),
        commercialApi.getPlans(),
        commercialApi.getAdditionalProducts(),
      ]);

      setRules(rulesData);

      // Combinar planes y productos del catálogo para los selectores de ítems.
      const items: CatalogSelectableItem[] = [
        ...plans.map((p: PlanCatalogItem) => ({ id: p.id, name: p.name })),
        ...products.map((p: AdditionalProduct) => ({ id: p.id, name: p.name })),
      ];
      setCatalogItems(items);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function validateCreateForm(): boolean {
    const errors: Partial<Record<keyof CreateFormState, string>> = {};
    if (!createForm.sourceItemId) errors.sourceItemId = 'Selecciona el ítem obsoleto.';
    if (!createForm.targetItemId) errors.targetItemId = 'Selecciona el ítem sucesor.';
    if (
      createForm.sourceItemId &&
      createForm.targetItemId &&
      createForm.sourceItemId === createForm.targetItemId
    ) {
      errors.targetItemId = 'El ítem sucesor debe ser distinto al obsoleto.';
    }
    if (createForm.note.length > 2000) errors.note = 'Máximo 2000 caracteres.';
    setCreateFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleCreate = async () => {
    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    setMutationError(null);
    try {
      const dto: CreateCompatibilityRuleDto = {
        ruleType: 'REPLACES',
        sourceItemId: createForm.sourceItemId,
        targetItemId: createForm.targetItemId,
        ...(createForm.effectiveFrom && { effectiveFrom: createForm.effectiveFrom }),
        ...(createForm.note.trim() && { note: createForm.note.trim() }),
      };
      await commercialApi.createCompatibilityRule(dto);
      const updated = await commercialApi.getCompatibilityRules();
      setRules(updated);
      setIsCreateModalOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setCreateFormErrors({});
    } catch (error) {
      setMutationError(
        error instanceof ApiError ? error.message : 'No fue posible crear la regla.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = useCallback((rule: CompatibilityRule) => {
    setEditingRule(rule);
    setEditForm({
      effectiveFrom: rule.effectiveFrom?.slice(0, 10) ?? '',
      note: rule.note ?? '',
      isActive: rule.isActive,
    });
    setMutationError(null);
  }, []);

  const handleUpdate = async () => {
    if (!editingRule) return;

    setIsSubmitting(true);
    setMutationError(null);
    try {
      const dto: UpdateCompatibilityRuleDto = {
        ...(editForm.effectiveFrom && { effectiveFrom: editForm.effectiveFrom }),
        ...(editForm.note.trim() !== '' && { note: editForm.note.trim() }),
        isActive: editForm.isActive,
      };
      await commercialApi.updateCompatibilityRule(editingRule.id, dto);
      const updated = await commercialApi.getCompatibilityRules();
      setRules(updated);
      setEditingRule(null);
    } catch (error) {
      setMutationError(
        error instanceof ApiError ? error.message : 'No fue posible actualizar la regla.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = useCallback(async (rule: CompatibilityRule) => {
    if (!window.confirm('¿Desactivar esta regla de reemplazo? Se puede reactivar desde "Editar".'))
      return;

    setDeletingId(rule.id);
    setLoadError(null);
    try {
      await commercialApi.deactivateCompatibilityRule(rule.id);
      const updated = await commercialApi.getCompatibilityRules();
      setRules(updated);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setDeletingId(null);
    }
  }, []);

  const activeCount = replacesRules.filter((r) => r.isActive).length;
  const itemOptions = catalogItems.map((item) => ({ value: item.id, label: item.name }));

  return (
    <Card className="rounded-2xl border border-white/70 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Compatibilidad
            </p>
            <CardTitle className="mt-1 text-lg font-semibold">Reglas de reemplazo</CardTitle>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Guía a los agentes cuando sugieran ítems obsoletos indicando el sucesor vigente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            >
              {activeCount} activa{activeCount === 1 ? '' : 's'}
            </Badge>
            {canEdit && (
              <Button
                size="sm"
                onClick={() => {
                  setIsCreateModalOpen(true);
                  setMutationError(null);
                }}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Nueva regla de reemplazo
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <PortalSkeletonBlock className="h-28" />
        ) : loadError ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar reglas"
            description={loadError}
            icon={CircleAlert}
          />
        ) : replacesRules.length === 0 ? (
          <PortalEmptyState
            title="Sin reglas de reemplazo"
            description="Crea la primera regla para guiar a los agentes cuando sugieran ítems obsoletos."
            icon={ArrowRight}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
                <tr>
                  <th className={tableHeadClass}>Ítem obsoleto → Sucesor</th>
                  <th className={tableHeadClass}>Desde</th>
                  <th className={tableHeadClass}>Nota</th>
                  <th className={tableHeadClass}>Estado</th>
                  {canEdit && <th className={tableHeadClass}>Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                {replacesRules.map((rule) => (
                  <tr key={rule.id}>
                    <td className={cellClass}>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {rule.sourceItem?.name ?? rule.sourceItemId}
                      </span>
                      <ArrowRight
                        className="mx-2 inline h-3.5 w-3.5 text-gray-400"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400">
                        {rule.targetItem?.name ?? rule.targetItemId}
                      </span>
                    </td>
                    <td className={cellClass}>{formatDate(rule.effectiveFrom)}</td>
                    <td className={`${cellClass} max-w-xs`}>
                      {rule.note ? (
                        <span className="line-clamp-2 text-gray-600 dark:text-gray-300">
                          {rule.note}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={cellClass}>
                      <Badge
                        variant={rule.isActive ? 'success' : 'neutral'}
                        className="rounded-full px-2 py-0.5 text-[11px]"
                      >
                        {rule.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className={cellClass}>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(rule)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
                            aria-label={`Editar regla: ${rule.sourceItem?.name ?? rule.sourceItemId}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === rule.id || !rule.isActive}
                            onClick={() => handleDeactivate(rule)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-red-700 transition-colors hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
                            aria-label={`Desactivar regla: ${rule.sourceItem?.name ?? rule.sourceItemId}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Desactivar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* ── Modal: crear regla de reemplazo ─────────────────────────────────── */}
      <Dialog
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          setIsCreateModalOpen(open);
          if (!open) {
            setCreateForm(EMPTY_CREATE_FORM);
            setCreateFormErrors({});
            setMutationError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva regla de reemplazo</DialogTitle>
            <DialogDescription>
              Indica qué ítem debe sugerir el agente como sucesor de un ítem obsoleto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select
              label="Ítem obsoleto"
              id="compat-source"
              value={createForm.sourceItemId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, sourceItemId: e.target.value }))}
              options={itemOptions}
              placeholder="Selecciona el ítem que se reemplaza..."
              {...(createFormErrors.sourceItemId && { error: createFormErrors.sourceItemId })}
              disabled={isSubmitting}
            />

            <Select
              label="Ítem sucesor"
              id="compat-target"
              value={createForm.targetItemId}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, targetItemId: e.target.value }))}
              options={itemOptions}
              placeholder="Selecciona el ítem que lo reemplaza..."
              {...(createFormErrors.targetItemId && { error: createFormErrors.targetItemId })}
              disabled={isSubmitting}
            />

            <div>
              <label
                htmlFor="compat-effective-from"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                Vigente desde (opcional)
              </label>
              <input
                id="compat-effective-from"
                type="date"
                value={createForm.effectiveFrom}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))
                }
                disabled={isSubmitting}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label
                htmlFor="compat-note"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                Nota para el agente (opcional)
              </label>
              <textarea
                id="compat-note"
                rows={3}
                maxLength={2000}
                value={createForm.note}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, note: e.target.value }))}
                disabled={isSubmitting}
                placeholder="Ej: Este plan fue migrado a la oferta Hogar 200 desde mayo 2025..."
                className={textareaBaseClass}
              />
              {createFormErrors.note && (
                <p className="mt-1 text-xs text-red-600">{createFormErrors.note}</p>
              )}
              <p className="mt-1 text-right text-xs text-gray-400">{createForm.note.length}/2000</p>
            </div>

            {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : 'Crear regla'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: editar regla de reemplazo ────────────────────────────────── */}
      <Dialog
        open={editingRule !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRule(null);
            setMutationError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar regla de reemplazo</DialogTitle>
            <DialogDescription>
              Actualiza la nota, la fecha de vigencia o el estado de la regla.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Muestra los ítems involucrados como referencia, no son editables. */}
            {editingRule && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-dark-border dark:bg-dark-surface-3">
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {editingRule.sourceItem?.name ?? editingRule.sourceItemId}
                </span>
                <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                <span className="font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  {editingRule.targetItem?.name ?? editingRule.targetItemId}
                </span>
              </div>
            )}

            <div>
              <label
                htmlFor="edit-effective-from"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                Vigente desde (opcional)
              </label>
              <input
                id="edit-effective-from"
                type="date"
                value={editForm.effectiveFrom}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, effectiveFrom: e.target.value }))
                }
                disabled={isSubmitting}
                className={inputBaseClass}
              />
            </div>

            <div>
              <label
                htmlFor="edit-note"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                Nota para el agente
              </label>
              <textarea
                id="edit-note"
                rows={3}
                maxLength={2000}
                value={editForm.note}
                onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                disabled={isSubmitting}
                className={textareaBaseClass}
              />
              <p className="mt-1 text-right text-xs text-gray-400">{editForm.note.length}/2000</p>
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-gray-300 accent-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Regla activa
              </span>
            </label>

            {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button onClick={handleUpdate} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
