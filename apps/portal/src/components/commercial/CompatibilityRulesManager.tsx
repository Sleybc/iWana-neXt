'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  CheckboxCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DatePicker,
  Select,
  cn,
} from '@iwana/ui';
import {
  ApiError,
  COMMERCIAL_LIST_PAGE_SIZE,
  COMMERCIAL_PICKER_LIMIT,
  commercialApi,
  type AdditionalProduct,
  type CommercialListMeta,
  type CommercialListParams,
  type CompatibilityRule,
  type CreateCompatibilityRuleDto,
  type PlanCatalogItem,
  type UpdateCompatibilityRuleDto,
} from '@/lib/api-client';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalSidePeek,
  PortalSkeletonBlock,
  PortalResultsStrip,
  PortalSuccessAlert,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalFieldClassName,
  portalTableRowHoverClassName,
  portalTextareaClassName,
} from '@/components/shared/portal-ui';

interface CompatibilityRulesManagerProps {
  canEdit: boolean;
}

interface CatalogSelectableItem {
  id: string;
  name: string;
}

interface RuleFormState {
  sourceItemId: string;
  targetItemId: string;
  effectiveFrom: string;
  note: string;
  isActive: boolean;
}

const EMPTY_FORM: RuleFormState = {
  sourceItemId: '',
  targetItemId: '',
  effectiveFrom: '',
  note: '',
  isActive: true,
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CO');
}

function toDateFromLocalDateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toLocalDateValue(date: Date | undefined): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Tu rol no tiene permisos para consultar las reglas.';
    return error.message;
  }
  return 'No fue posible cargar las reglas de compatibilidad.';
}

function mapActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export function CompatibilityRulesManager({ canEdit }: CompatibilityRulesManagerProps) {
  const [rules, setRules] = useState<CompatibilityRule[]>([]);
  const [meta, setMeta] = useState<CommercialListMeta | null>(null);
  const [listParams, setListParams] = useState<CommercialListParams>({
    limit: COMMERCIAL_LIST_PAGE_SIZE,
  });
  const [catalogItems, setCatalogItems] = useState<CatalogSelectableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CompatibilityRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CompatibilityRule | null>(null);

  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RuleFormState, string>>>({});

  // Solo REPLACES en scope v1 del diseño comercial.
  const replacesRules = rules.filter((r) => r.ruleType === 'REPLACES');
  const hasMore = meta?.nextCursor != null;
  const totalRules = meta?.total ?? rules.length;
  const resourceWord = totalRules === 1 ? 'regla' : 'reglas';
  const resultsLabel = hasMore
    ? `${replacesRules.length} de ${totalRules} ${resourceWord}`
    : `${totalRules} ${resourceWord}`;

  const loadData = useCallback(async (params: CommercialListParams, append = false) => {
    setIsLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const picker = { limit: COMMERCIAL_PICKER_LIMIT };
      const [rulesResult, plans, products] = await Promise.all([
        commercialApi.getCompatibilityRules(params),
        append ? Promise.resolve(null) : commercialApi.getPlans(picker),
        append ? Promise.resolve(null) : commercialApi.getAdditionalProducts(picker),
      ]);

      setRules((prev) => (append ? [...prev, ...rulesResult.data] : rulesResult.data));
      setMeta(rulesResult.meta);
      setListParams(params);

      if (!append && plans && products) {
        const items: CatalogSelectableItem[] = [
          ...plans.data.map((p: PlanCatalogItem) => ({ id: p.id, name: p.name })),
          ...products.data.map((p: AdditionalProduct) => ({ id: p.id, name: p.name })),
        ];
        setCatalogItems(items);
      }
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void loadData({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  useEffect(() => {
    void loadData({ limit: COMMERCIAL_LIST_PAGE_SIZE });
  }, [loadData]);

  function openCreateForm() {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEditForm(rule: CompatibilityRule) {
    setEditingRule(rule);
    setForm({
      sourceItemId: rule.sourceItemId,
      targetItemId: rule.targetItemId,
      effectiveFrom: rule.effectiveFrom?.slice(0, 10) ?? '',
      note: rule.note ?? '',
      isActive: rule.isActive,
    });
    setFormErrors({});
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function handleFormOpenChange(nextOpen: boolean) {
    setIsFormOpen(nextOpen);
    if (!nextOpen) {
      setEditingRule(null);
      setForm(EMPTY_FORM);
      setFormErrors({});
      setFormError(null);
    }
  }

  function validateCreateForm(): boolean {
    const errors: Partial<Record<keyof RuleFormState, string>> = {};
    if (!form.sourceItemId) errors.sourceItemId = 'Selecciona el ítem obsoleto.';
    if (!form.targetItemId) errors.targetItemId = 'Selecciona el ítem sucesor.';
    if (form.sourceItemId && form.targetItemId && form.sourceItemId === form.targetItemId) {
      errors.targetItemId = 'El ítem sucesor debe ser distinto al obsoleto.';
    }
    if (form.note.length > 2000) errors.note = 'Máximo 2000 caracteres.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateEditForm(): boolean {
    const errors: Partial<Record<keyof RuleFormState, string>> = {};
    if (form.note.length > 2000) errors.note = 'Máximo 2000 caracteres.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSubmit = async () => {
    if (editingRule) {
      if (!validateEditForm()) return;

      setIsSubmitting(true);
      setFormError(null);
      try {
        const dto: UpdateCompatibilityRuleDto = {
          ...(form.effectiveFrom && { effectiveFrom: form.effectiveFrom }),
          ...(form.note.trim() !== '' && { note: form.note.trim() }),
          isActive: form.isActive,
        };
        await commercialApi.updateCompatibilityRule(editingRule.id, dto);
        void loadData({ limit: COMMERCIAL_LIST_PAGE_SIZE });
        handleFormOpenChange(false);
        setSuccessMessage('Regla actualizada.');
      } catch (error) {
        setFormError(mapActionError(error, 'No fue posible actualizar la regla.'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!validateCreateForm()) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const dto: CreateCompatibilityRuleDto = {
        ruleType: 'REPLACES',
        sourceItemId: form.sourceItemId,
        targetItemId: form.targetItemId,
        ...(form.effectiveFrom && { effectiveFrom: form.effectiveFrom }),
        ...(form.note.trim() && { note: form.note.trim() }),
      };
      await commercialApi.createCompatibilityRule(dto);
      void loadData({ limit: COMMERCIAL_LIST_PAGE_SIZE });
      handleFormOpenChange(false);
      setSuccessMessage('Regla de reemplazo creada.');
    } catch (error) {
      setFormError(mapActionError(error, 'No fue posible crear la regla.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;

    setDeletingId(deactivateTarget.id);
    setActionError(null);
    try {
      await commercialApi.deactivateCompatibilityRule(deactivateTarget.id);
      void loadData({ limit: COMMERCIAL_LIST_PAGE_SIZE });
      setDeactivateTarget(null);
      setSuccessMessage('Regla desactivada.');
    } catch (error) {
      setActionError(mapActionError(error, 'No fue posible desactivar la regla.'));
    } finally {
      setDeletingId(null);
    }
  }, [deactivateTarget, loadData]);

  const activeCount = replacesRules.filter((r) => r.isActive).length;
  const itemOptions = catalogItems.map((item) => ({ value: item.id, label: item.name }));
  const showLoadErrorOnly = Boolean(loadError) && replacesRules.length === 0 && !isLoading;
  const isEditing = editingRule !== null;

  return (
    <PortalPanel
      eyebrow="Reglas"
      title="Compatibilidad"
      description="Define reglas de reemplazo entre ítems del catálogo para guiar ventas."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activeCount} activa{activeCount === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button onClick={openCreateForm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva regla de reemplazo
            </Button>
          )}
        </>
      }
      contentClassName="space-y-4"
    >
      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <PortalSkeletonBlock className="h-10 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
          <PortalSkeletonBlock className="h-12 rounded-xl" />
        </div>
      ) : showLoadErrorOnly ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar reglas"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadData({ limit: COMMERCIAL_LIST_PAGE_SIZE })}
            >
              Reintentar
            </Button>
          }
        />
      ) : replacesRules.length === 0 ? (
        <PortalEmptyState
          title="Sin reglas de reemplazo"
          description="Crea la primera regla para guiar a los agentes cuando sugieran ítems obsoletos."
          icon={ArrowRight}
          {...(canEdit
            ? {
                action: (
                  <Button onClick={openCreateForm}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nueva regla de reemplazo
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="space-y-4">
          {successMessage ? (
            <PortalSuccessAlert
              message={successMessage}
              onDismiss={() => setSuccessMessage(null)}
            />
          ) : null}

          {actionError && !deactivateTarget && (
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

          <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    <PortalDataTableHead>Ítem obsoleto → Sucesor</PortalDataTableHead>
                    <PortalDataTableHead>Desde</PortalDataTableHead>
                    <PortalDataTableHead>Nota</PortalDataTableHead>
                    <PortalDataTableHead>Estado</PortalDataTableHead>
                    {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {replacesRules.map((rule) => (
                    <tr
                      key={rule.id}
                      className={cn(
                        portalTableRowHoverClassName,
                        !rule.isActive && portalDataTableInactiveRowClassName,
                      )}
                    >
                      <td className={portalDataTableCellClassName}>
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {rule.sourceItem?.name ?? 'Ítem no disponible'}
                        </span>
                        <ArrowRight
                          className="mx-2 inline h-3.5 w-3.5 text-gray-400"
                          aria-hidden="true"
                        />
                        <span className="font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          {rule.targetItem?.name ?? 'Ítem no disponible'}
                        </span>
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {formatDate(rule.effectiveFrom)}
                      </td>
                      <td className={`${portalDataTableCellClassName} max-w-xs`}>
                        {rule.note ? (
                          <span className="line-clamp-2 text-gray-600 dark:text-gray-300">
                            {rule.note}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant={getPortalActiveBadgeVariant(rule.isActive)}>
                          {rule.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      {canEdit && (
                        <td className={portalDataTableCellClassName}>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditForm(rule)}
                              aria-label={`Editar regla: ${rule.sourceItem?.name ?? 'Ítem no disponible'}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="softDestructive"
                              size="sm"
                              disabled={deletingId === rule.id || !rule.isActive}
                              loading={deletingId === rule.id}
                              onClick={() => {
                                setActionError(null);
                                setDeactivateTarget(rule);
                              }}
                              aria-label={`Desactivar regla: ${rule.sourceItem?.name ?? 'Ítem no disponible'}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Desactivar
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
              loading={isLoading}
              resourceLabel="reglas"
              shown={replacesRules.length}
              total={totalRules}
            />
          </div>
        </div>
      )}

      <PortalSidePeek
        open={isFormOpen}
        onClose={() => handleFormOpenChange(false)}
        eyebrow="Reglas"
        title={isEditing ? 'Editar regla de reemplazo' : 'Nueva regla de reemplazo'}
        description={
          isEditing
            ? 'Actualiza la nota, la fecha de vigencia o el estado de la regla.'
            : 'Indica qué ítem debe sugerir el agente como sucesor de un ítem obsoleto.'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => handleFormOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" form="compatibility-rule-form" loading={isSubmitting}>
              {isEditing ? 'Guardar cambios' : 'Crear regla'}
            </Button>
          </div>
        }
      >
        <form
          id="compatibility-rule-form"
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Ítems del reemplazo</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {isEditing
                  ? 'Los ítems de la regla no se modifican; solo la vigencia, la nota y el estado.'
                  : 'Define el ítem obsoleto y el sucesor que debe sugerir el agente.'}
              </p>
            </div>

            {isEditing ? (
              <p className="text-sm text-gray-800 dark:text-gray-100">
                <span className="font-medium">
                  {editingRule?.sourceItem?.name ?? 'Ítem no disponible'}
                </span>
                <ArrowRight className="mx-2 inline h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                <span className="font-medium text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  {editingRule?.targetItem?.name ?? 'Ítem no disponible'}
                </span>
              </p>
            ) : (
              <div className="space-y-4">
                <Select
                  label="Ítem obsoleto"
                  id="compat-source"
                  value={form.sourceItemId}
                  onChange={(e) => setForm((prev) => ({ ...prev, sourceItemId: e.target.value }))}
                  options={itemOptions}
                  placeholder="Selecciona el ítem que se reemplaza..."
                  {...(formErrors.sourceItemId && { error: formErrors.sourceItemId })}
                  disabled={isSubmitting}
                />

                <Select
                  label="Ítem sucesor"
                  id="compat-target"
                  value={form.targetItemId}
                  onChange={(e) => setForm((prev) => ({ ...prev, targetItemId: e.target.value }))}
                  options={itemOptions}
                  placeholder="Selecciona el ítem que lo reemplaza..."
                  {...(formErrors.targetItemId && { error: formErrors.targetItemId })}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Vigencia y nota</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Opcional: fecha desde la que aplica y contexto para el agente comercial.
              </p>
            </div>

            <div>
              <label htmlFor="compat-effective-from" className="mb-1.5 block portal-eyebrow-muted">
                Vigente desde (opcional)
              </label>
              <DatePicker
                id="compat-effective-from"
                value={toDateFromLocalDateValue(form.effectiveFrom)}
                onChange={(date) =>
                  setForm((prev) => ({ ...prev, effectiveFrom: toLocalDateValue(date) }))
                }
                disabled={isSubmitting}
                placeholder="Selecciona una fecha"
                buttonClassName={portalFieldClassName}
              />
            </div>

            <div>
              <label htmlFor="compat-note" className="mb-1.5 block portal-eyebrow-muted">
                Nota para el agente{isEditing ? '' : ' (opcional)'}
              </label>
              <textarea
                id="compat-note"
                rows={3}
                maxLength={2000}
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                disabled={isSubmitting}
                placeholder="Ej: Este plan fue migrado a la oferta Hogar 200 desde mayo 2025..."
                className={portalTextareaClassName}
              />
              {formErrors.note && <p className="mt-1 text-sm text-error-600">{formErrors.note}</p>}
              <p className="mt-1 text-right text-xs text-gray-400">{form.note.length}/2000</p>
            </div>

            {isEditing && (
              <CheckboxCard
                label="Activo"
                description="Disponible para orientar a los agentes en nuevas operaciones."
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                disabled={isSubmitting}
                name="isActive"
              />
            )}
          </section>

          {formError && (
            <PortalAlert
              variant="error"
              title="No fue posible guardar"
              description={formError}
              icon={CircleAlert}
            />
          )}
        </form>
      </PortalSidePeek>

      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateTarget(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar regla de reemplazo</DialogTitle>
            <DialogDescription>
              ¿Desactivar el reemplazo de{' '}
              <strong>{deactivateTarget?.sourceItem?.name ?? 'Ítem no disponible'}</strong> por{' '}
              <strong>{deactivateTarget?.targetItem?.name ?? 'Ítem no disponible'}</strong>? Se
              puede reactivar desde «Editar».
            </DialogDescription>
          </DialogHeader>
          {actionError && (
            <PortalAlert
              variant="error"
              title="No fue posible desactivar"
              description={actionError}
              icon={CircleAlert}
              className="mt-3"
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={!!deletingId}
              onClick={() => {
                setDeactivateTarget(null);
                setActionError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeactivate()}
              loading={!!deletingId}
            >
              Desactivar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
