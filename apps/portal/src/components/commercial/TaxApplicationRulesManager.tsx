'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, HelpCircle, CircleAlert, CheckCircle2 } from 'lucide-react';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  cn,
} from '@iwana/ui';
import {
  ApiError,
  COMMERCIAL_LIST_PAGE_SIZE,
  COMMERCIAL_PICKER_LIMIT,
  commercialApi,
  type CommercialListMeta,
  type CommercialListParams,
  type CreateTaxRuleApplicationDto,
  type TaxRule,
  type TaxDefinition,
  type TaxRuleApplication,
  type UpdateTaxRuleApplicationDto,
} from '@/lib/api-client';
import {
  getPortalActiveBadgeVariant,
  portalActiveCountBadgeVariant,
} from '@/lib/portal-status-badge-rules';
import {
  interactiveFocusClassName,
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
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  TAX_SEGMENT_LABELS,
  TAX_TREATMENT_LABELS,
  TAX_TYPE_LABELS,
  resolveTaxLabel,
} from '@/components/commercial/commercial-labels';
import { formatTaxRatePercent } from '@/components/commercial/commercial-format';

interface TaxApplicationRulesManagerProps {
  canEdit: boolean;
}

// Formulario local que unifica campos de create (vínculo / guiado) + update
interface AppFormState {
  taxRuleId?: string;
  taxDefinitionId?: string;
  treatment?: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  rateOverride?: number | null;
  priority?: number;
  isActive?: boolean;
  /** Campos de alta guiada (regla nueva + vínculo) */
  taxType?: 'IVA' | 'RETENTION' | 'ICA';
  ratePercentage?: string;
}

type FormMode = 'link' | 'guided' | 'edit';

const INITIAL_FORM: AppFormState = {
  treatment: 'STANDARD',
  priority: 0,
  isActive: true,
  taxType: 'IVA',
  ratePercentage: '19.00',
};

/** Ícono de ayuda con popover click-to-open */
function HelpPopover({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`ml-1.5 inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ${interactiveFocusClassName}`}
          aria-label="Más información"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[260px] text-xs">{children}</PopoverContent>
    </Popover>
  );
}

function SelectLabelWithHelp({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required ? <span className="ml-1 text-iwana-error">*</span> : null}
      </span>
      {children}
    </div>
  );
}

export function TaxApplicationRulesManager({ canEdit }: TaxApplicationRulesManagerProps) {
  const [applications, setApplications] = useState<TaxRuleApplication[]>([]);
  const [meta, setMeta] = useState<CommercialListMeta | null>(null);
  const [listParams, setListParams] = useState<CommercialListParams>({
    limit: COMMERCIAL_LIST_PAGE_SIZE,
  });
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [definitions, setDefinitions] = useState<TaxDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('link');
  const [editTarget, setEditTarget] = useState<TaxRuleApplication | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxRuleApplication | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<AppFormState>(INITIAL_FORM);

  const load = useCallback(async (params: CommercialListParams, append = false) => {
    // En append solo se marca loadingMore: la tabla permanece visible durante la paginación.
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const [appsResult, taxRules, taxDefs] = await Promise.all([
        commercialApi.listTaxRuleApplications(params),
        append
          ? Promise.resolve(null)
          : commercialApi.getTaxRules({ limit: COMMERCIAL_PICKER_LIMIT }),
        append
          ? Promise.resolve(null)
          : commercialApi.listTaxDefinitions({ isActive: true, limit: COMMERCIAL_PICKER_LIMIT }),
      ]);
      setApplications((prev) => (append ? [...prev, ...appsResult.data] : appsResult.data));
      setMeta(appsResult.meta);
      setListParams(params);
      if (!append && taxRules && taxDefs) {
        setRules(taxRules.data);
        setDefinitions(taxDefs.data);
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : 'No fue posible cargar las vinculaciones.',
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void load({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  useEffect(() => {
    void load({ limit: COMMERCIAL_LIST_PAGE_SIZE });
  }, [load]);

  const ruleName = (id: string) => {
    const r = rules.find((rule) => rule.id === id);
    if (!r) return 'Regla no disponible';
    const parts: string[] = [resolveTaxLabel(TAX_TYPE_LABELS, r.taxType)];
    if (r.ratePercentage) parts.push(`${formatTaxRatePercent(r.ratePercentage)}%`);
    if (r.stratumFrom !== null && r.stratumTo !== null)
      parts.push(`Estratos ${r.stratumFrom}–${r.stratumTo}`);
    else if (r.stratumFrom !== null) parts.push(`Estrato ≥ ${r.stratumFrom}`);
    else if (r.stratumTo !== null) parts.push(`Estrato ≤ ${r.stratumTo}`);
    if (r.customerSegment) {
      parts.push(resolveTaxLabel(TAX_SEGMENT_LABELS, r.customerSegment));
    }
    return parts.join(' · ');
  };
  const defName = (id: string) => {
    const d = definitions.find((def) => def.id === id);
    return d ? d.name : 'Definición no disponible';
  };

  function openPrimaryCreate() {
    if (rules.length === 0) {
      openGuidedCreateForm();
      return;
    }
    openCreateForm();
  }

  const activeApplicationsCount = applications.filter((app) => app.isActive).length;
  const isEditing = formMode === 'edit';
  const isGuided = formMode === 'guided';
  const showLoadErrorOnly = Boolean(loadError) && applications.length === 0 && !loading;
  const hasMore = meta?.nextCursor != null;
  const totalApplications = meta?.total ?? applications.length;
  const resourceWord = totalApplications === 1 ? 'vinculación' : 'vinculaciones';
  const resultsLabel = hasMore
    ? `${applications.length} de ${totalApplications} ${resourceWord}`
    : `${totalApplications} ${resourceWord}`;

  function openCreateForm() {
    setEditTarget(null);
    setFormMode('link');
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  }

  function openGuidedCreateForm() {
    setEditTarget(null);
    setFormMode('guided');
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  }

  function openEditForm(app: TaxRuleApplication) {
    setEditTarget(app);
    setFormMode('edit');
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setForm({
      treatment: app.treatment,
      rateOverride: app.rateOverride ? Number(app.rateOverride) : null,
      priority: app.priority,
      isActive: app.isActive,
    });
    setIsFormOpen(true);
  }

  function handleFormOpenChange(nextOpen: boolean) {
    setIsFormOpen(nextOpen);
    if (!nextOpen) {
      setEditTarget(null);
      setFormMode('link');
      setFormError(null);
      setForm(INITIAL_FORM);
    }
  }

  const handleCreate = async () => {
    if (!form.taxRuleId || !form.taxDefinitionId) return;
    setSaving(true);
    setFormError(null);
    try {
      const dto: CreateTaxRuleApplicationDto = {
        taxRuleId: form.taxRuleId,
        taxDefinitionId: form.taxDefinitionId,
        treatment: form.treatment ?? 'STANDARD',
        ...(form.rateOverride !== undefined ? { rateOverride: form.rateOverride } : {}),
        ...(form.priority !== undefined ? { priority: form.priority } : {}),
      };
      await commercialApi.createTaxRuleApplication(dto);
      handleFormOpenChange(false);
      await load({ limit: COMMERCIAL_LIST_PAGE_SIZE });
      setSuccessMessage('Vinculación creada.');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'No pudimos crear el vínculo. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleGuidedCreate = async () => {
    if (!form.taxDefinitionId || !form.taxType || !form.ratePercentage?.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const rule = await commercialApi.createTaxRule({
        taxType: form.taxType,
        ratePercentage: form.ratePercentage.trim(),
        ...(form.priority !== undefined ? { priority: form.priority } : {}),
      });
      try {
        await commercialApi.createTaxRuleApplication({
          taxRuleId: rule.id,
          taxDefinitionId: form.taxDefinitionId,
          treatment: form.treatment ?? 'STANDARD',
          ...(form.rateOverride !== undefined ? { rateOverride: form.rateOverride } : {}),
          ...(form.priority !== undefined ? { priority: form.priority } : {}),
        });
      } catch (linkErr) {
        await load({ limit: COMMERCIAL_LIST_PAGE_SIZE });
        setFormError(
          linkErr instanceof ApiError
            ? `Regla creada, pero falló el vínculo: ${linkErr.message}. Usa «Nueva vinculación» para reintentar.`
            : 'Regla creada, pero falló el vínculo. Usa «Nueva vinculación» para reintentar.',
        );
        return;
      }
      handleFormOpenChange(false);
      await load({ limit: COMMERCIAL_LIST_PAGE_SIZE });
      setSuccessMessage('Regla y vinculación creadas.');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'No pudimos crear la regla. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      const dto: UpdateTaxRuleApplicationDto = {};
      if (form.treatment !== undefined) dto.treatment = form.treatment;
      if (form.rateOverride !== undefined) dto.rateOverride = form.rateOverride;
      if (form.priority !== undefined) dto.priority = form.priority;
      if (form.isActive !== undefined) dto.isActive = form.isActive;
      await commercialApi.updateTaxRuleApplication(editTarget.id, dto);
      handleFormOpenChange(false);
      await load({ limit: COMMERCIAL_LIST_PAGE_SIZE });
      setSuccessMessage('Vinculación actualizada.');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'No pudimos guardar el vínculo. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    try {
      await commercialApi.deleteTaxRuleApplication(deleteTarget.id);
      setDeleteTarget(null);
      await load({ limit: COMMERCIAL_LIST_PAGE_SIZE });
      setSuccessMessage('Vinculación eliminada.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No pudimos quitar este vínculo.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PortalPanel
      eyebrow="Reglas"
      title="Aplicación de impuestos"
      description="Asocia cada regla tributaria con un impuesto del catálogo y define su prioridad."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activeApplicationsCount} activa{activeApplicationsCount === 1 ? '' : 's'}
          </Badge>
          {canEdit && (
            <Button onClick={openPrimaryCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva vinculación
            </Button>
          )}
        </>
      }
      contentClassName="flex flex-col gap-4"
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
          title="No fue posible cargar las vinculaciones"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void load({ limit: COMMERCIAL_LIST_PAGE_SIZE })}
            >
              Reintentar
            </Button>
          }
        />
      ) : applications.length === 0 ? (
        <PortalEmptyState
          title="Sin vinculaciones"
          description={
            rules.length === 0
              ? 'Crea una regla tributaria y vincúlala a un impuesto del catálogo para activar el cálculo.'
              : 'Vincula una regla tributaria con un impuesto del catálogo para activar el cálculo.'
          }
          {...(canEdit
            ? {
                action: (
                  <Button onClick={openPrimaryCreate}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nueva vinculación
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

          <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

          <div className={portalDataTableShellClassName}>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className={portalDataTableHeadRowClassName}>
                  <tr>
                    <PortalDataTableHead>Regla</PortalDataTableHead>
                    <PortalDataTableHead>Definición</PortalDataTableHead>
                    <PortalDataTableHead>Tratamiento</PortalDataTableHead>
                    <PortalDataTableHead>Prioridad</PortalDataTableHead>
                    <PortalDataTableHead>Tasa</PortalDataTableHead>
                    <PortalDataTableHead>Estado</PortalDataTableHead>
                    {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {applications.map((app) => (
                    <tr
                      key={app.id}
                      className={cn(
                        portalTableRowHoverClassName,
                        !app.isActive && portalDataTableInactiveRowClassName,
                      )}
                    >
                      <td className={portalDataTableCellClassName}>
                        <p className="font-medium text-gray-800 dark:text-gray-100">
                          {ruleName(app.taxRuleId)}
                        </p>
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <span className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                          {defName(app.taxDefinitionId)}
                        </span>
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {resolveTaxLabel(TAX_TREATMENT_LABELS, app.treatment)}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <span className="font-mono tabular-nums">{app.priority}</span>
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {app.rateOverride !== null ? (
                          <span className="font-mono tabular-nums">
                            {formatTaxRatePercent(app.rateOverride)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge
                          variant={getPortalActiveBadgeVariant(app.isActive)}
                          className="text-xs"
                        >
                          {app.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </td>
                      {canEdit && (
                        <td className={portalDataTableCellClassName}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="secondary"
                              size="icon"
                              aria-label={`Editar vinculación ${ruleName(app.taxRuleId)}`}
                              title={`Editar vinculación ${ruleName(app.taxRuleId)}`}
                              onClick={() => openEditForm(app)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="softDestructive"
                              size="icon"
                              aria-label={`Eliminar vinculación ${ruleName(app.taxRuleId)}`}
                              title={`Eliminar vinculación ${ruleName(app.taxRuleId)}`}
                              onClick={() => {
                                setActionError(null);
                                setDeleteTarget(app);
                              }}
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
              loading={loadingMore}
              resourceLabel="vinculaciones"
              shown={applications.length}
              total={totalApplications}
            />
          </div>
        </div>
      )}

      <PortalSidePeek
        open={isFormOpen}
        onClose={() => handleFormOpenChange(false)}
        eyebrow="Reglas"
        title={
          isEditing ? 'Editar vinculación' : isGuided ? 'Nueva regla y vínculo' : 'Vincular regla'
        }
        description={
          isEditing && editTarget
            ? `${ruleName(editTarget.taxRuleId)} → ${defName(editTarget.taxDefinitionId)}`
            : isGuided
              ? 'Crea la regla tributaria y la vincula a un impuesto del catálogo en un solo paso.'
              : 'Asocia una regla tributaria activa con un impuesto del catálogo.'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => handleFormOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() =>
                void (isEditing ? handleUpdate() : isGuided ? handleGuidedCreate() : handleCreate())
              }
              disabled={
                saving ||
                (isGuided
                  ? !form.taxDefinitionId || !form.taxType || !form.ratePercentage?.trim()
                  : !isEditing && (!form.taxRuleId || !form.taxDefinitionId))
              }
              loading={saving}
            >
              {isEditing ? 'Guardar' : isGuided ? 'Crear y vincular' : 'Vincular'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <section className="space-y-4">
            {!isEditing && isGuided && (
              <>
                <div className="space-y-1.5">
                  <SelectLabelWithHelp label="Tipo de tributo" required>
                    <HelpPopover>
                      <p className="text-xs">Tipo de la regla (IVA, retención o ICA).</p>
                    </HelpPopover>
                  </SelectLabelWithHelp>
                  <Select
                    value={form.taxType ?? 'IVA'}
                    onChange={(e) => {
                      const v = e.target.value as 'IVA' | 'RETENTION' | 'ICA';
                      setForm((f) => ({ ...f, taxType: v }));
                    }}
                  >
                    <option value="IVA">IVA</option>
                    <option value="RETENTION">Retención</option>
                    <option value="ICA">ICA</option>
                  </Select>
                </div>

                <div>
                  <Input
                    label="Tasa (%)"
                    value={form.ratePercentage ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, ratePercentage: e.target.value }))}
                    placeholder="19.00"
                  />
                </div>
                {rules.length > 0 ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-sm"
                    onClick={() => {
                      setFormMode('link');
                      setForm(INITIAL_FORM);
                      setFormError(null);
                    }}
                  >
                    Usar una regla existente
                  </Button>
                ) : null}
              </>
            )}

            {!isEditing && !isGuided && (
              <>
                <div className="space-y-1.5">
                  <SelectLabelWithHelp label="Regla tributaria" required>
                    <HelpPopover>
                      <p className="text-xs">
                        Regla que define el <strong>tipo de tributo</strong> aplicable según el
                        contexto (ej: IVA ventas residencial). Solo se muestran reglas activas.
                      </p>
                    </HelpPopover>
                  </SelectLabelWithHelp>
                  <Select
                    value={form.taxRuleId ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, taxRuleId: v }) as AppFormState);
                    }}
                  >
                    <option value="">Selecciona una regla…</option>
                    {rules
                      .filter((r) => r.isActive)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {ruleName(r.id)}
                        </option>
                      ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-sm"
                  onClick={() => {
                    setFormMode('guided');
                    setForm(INITIAL_FORM);
                    setFormError(null);
                  }}
                >
                  Crear regla nueva y vincular
                </Button>
              </>
            )}

            {!isEditing && (
              <div className="space-y-1.5">
                <SelectLabelWithHelp label="Definición" required>
                  <HelpPopover>
                    <p className="text-xs">
                      Impuesto del catálogo que se aplicará cuando la regla coincida (ej: IVA
                      estándar 19%). Solo se muestran definiciones activas.
                    </p>
                  </HelpPopover>
                </SelectLabelWithHelp>
                <Select
                  value={form.taxDefinitionId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, taxDefinitionId: v }) as AppFormState);
                  }}
                >
                  <option value="">Selecciona una definición…</option>
                  {definitions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <SelectLabelWithHelp label="Tratamiento">
                <HelpPopover>
                  <ul className="list-disc space-y-1 pl-4 text-xs">
                    <li>
                      <strong>Estándar</strong> — Se cobra sobre la base gravable
                    </li>
                    <li>
                      <strong>Exento</strong> — Tasa cero; debe declararse
                    </li>
                    <li>
                      <strong>Excluido</strong> — No genera el hecho gravable
                    </li>
                    <li>
                      <strong>Fija</strong> — Monto fijo sin importar la base
                    </li>
                  </ul>
                </HelpPopover>
              </SelectLabelWithHelp>
              <Select
                value={form.treatment ?? 'STANDARD'}
                onChange={(e) => {
                  const v = e.target.value as AppFormState['treatment'];
                  setForm((f) => ({ ...f, treatment: v }) as AppFormState);
                }}
              >
                <option value="STANDARD">Estándar</option>
                <option value="EXEMPT">Exento</option>
                <option value="EXCLUDED">Excluido</option>
                <option value="FIXED">Fija</option>
              </Select>
            </div>

            <Input
              label="Tasa (%)"
              helperText="Tasa específica para esta vinculación. Déjala vacía para usar la tasa de la definición."
              placeholder="Ej. 5"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.rateOverride ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setForm((f) => ({ ...f, rateOverride: v }) as AppFormState);
              }}
            />

            <Input
              label="Prioridad"
              helperText="Orden cuando varias reglas aplican a la vez. Menor número = mayor prioridad."
              placeholder="0"
              type="number"
              min="0"
              value={form.priority ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => ({ ...f, priority: v }) as AppFormState);
              }}
            />

            {isEditing && (
              <CheckboxCard
                label="Activa"
                description="Disponible para el cálculo de impuestos."
                checked={form.isActive ?? true}
                onChange={(event) =>
                  setForm((f) => ({ ...f, isActive: event.target.checked }) as AppFormState)
                }
              />
            )}
          </section>

          {formError && (
            <PortalAlert
              variant="error"
              title={isEditing ? 'No fue posible guardar' : 'No fue posible vincular'}
              description={formError}
              icon={CircleAlert}
            />
          )}
        </div>
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
            <DialogTitle>Eliminar vínculo</DialogTitle>
            <DialogDescription>
              ¿Eliminar la regla de aplicación entre{' '}
              <strong>{deleteTarget && ruleName(deleteTarget.taxRuleId)}</strong> y{' '}
              <strong>{deleteTarget && defName(deleteTarget.taxDefinitionId)}</strong>?
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
              disabled={deleting}
              onClick={() => {
                setDeleteTarget(null);
                setActionError(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} loading={deleting}>
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
