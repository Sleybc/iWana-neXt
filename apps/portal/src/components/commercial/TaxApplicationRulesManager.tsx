'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, HelpCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
} from '@iwana/ui';
import {
  ApiError,
  commercialApi,
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
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { TAX_TREATMENT_LABELS, resolveTaxLabel } from '@/components/commercial/commercial-labels';

interface TaxApplicationRulesManagerProps {
  canEdit: boolean;
}

// Formulario local que unifica campos de create + update
interface AppFormState {
  taxRuleId?: string;
  taxDefinitionId?: string;
  treatment?: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
  rateOverride?: number | null;
  priority?: number;
  isActive?: boolean;
}

const INITIAL_FORM: AppFormState = { treatment: 'STANDARD', priority: 0 };

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

export function TaxApplicationRulesManager({ canEdit }: TaxApplicationRulesManagerProps) {
  const [applications, setApplications] = useState<TaxRuleApplication[]>([]);
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [definitions, setDefinitions] = useState<TaxDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TaxRuleApplication | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxRuleApplication | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AppFormState>(INITIAL_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [apps, taxRules, taxDefs] = await Promise.all([
        commercialApi.listTaxRuleApplications(),
        commercialApi.getTaxRules(),
        commercialApi.listTaxDefinitions({ isActive: true }),
      ]);
      setApplications(apps);
      setRules(taxRules);
      setDefinitions(taxDefs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar aplicaciones tributarias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ruleName = (id: string) => {
    const r = rules.find((rule) => rule.id === id);
    if (!r) return 'Regla no disponible';
    const parts: string[] = [r.taxType];
    if (r.ratePercentage) parts.push(`${r.ratePercentage}%`);
    if (r.stratumFrom !== null && r.stratumTo !== null)
      parts.push(`Estratos ${r.stratumFrom}–${r.stratumTo}`);
    else if (r.stratumFrom !== null) parts.push(`Estrato ≥ ${r.stratumFrom}`);
    else if (r.stratumTo !== null) parts.push(`Estrato ≤ ${r.stratumTo}`);
    if (r.customerSegment) parts.push(r.customerSegment);
    return parts.join(' · ');
  };
  const defName = (id: string) => {
    const d = definitions.find((def) => def.id === id);
    return d ? `${d.name} (${d.code})` : 'Definición no disponible';
  };

  const activeApplicationsCount = applications.filter((app) => app.isActive).length;

  const handleCreate = async () => {
    if (!form.taxRuleId || !form.taxDefinitionId) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      // Construir DTO evitando propiedades undefined (compatibilidad con exactOptionalPropertyTypes)
      const dto: CreateTaxRuleApplicationDto = {
        taxRuleId: form.taxRuleId,
        taxDefinitionId: form.taxDefinitionId,
        treatment: form.treatment ?? 'STANDARD',
        ...(form.rateOverride !== undefined ? { rateOverride: form.rateOverride } : {}),
        ...(form.priority !== undefined ? { priority: form.priority } : {}),
      };
      await commercialApi.createTaxRuleApplication(dto);
      setCreateOpen(false);
      setCreateError(null);
      setForm(INITIAL_FORM);
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Error al crear la vinculación.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    setEditError(null);
    try {
      const dto: UpdateTaxRuleApplicationDto = {};
      if (form.treatment !== undefined) dto.treatment = form.treatment;
      if (form.rateOverride !== undefined) dto.rateOverride = form.rateOverride;
      if (form.priority !== undefined) dto.priority = form.priority;
      if (form.isActive !== undefined) dto.isActive = form.isActive;
      await commercialApi.updateTaxRuleApplication(editTarget.id, dto);
      setEditTarget(null);
      setEditError(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Error al actualizar la vinculación.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await commercialApi.deleteTaxRuleApplication(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar aplicación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalPanel
      eyebrow="Tributación"
      title="Reglas de aplicación"
      description="Vincula reglas tributarias con definiciones del catálogo y prioridades de evaluación."
      actions={
        <>
          <Badge variant={portalActiveCountBadgeVariant}>
            {activeApplicationsCount} activa{activeApplicationsCount === 1 ? '' : 's'}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar reglas de aplicación"
            title="Actualizar reglas de aplicación"
            onClick={() => void load()}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Vincular regla
            </Button>
          )}
        </>
      }
      contentClassName="flex flex-col gap-4"
    >
      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible cargar reglas de aplicación"
          description={error}
        />
      )}

      {loading ? (
        <PortalSkeletonBlock className="h-28" />
      ) : applications.length === 0 ? (
        <PortalEmptyState
          title="Sin reglas de aplicación"
          description="Vincula una regla comercial con una definición del catálogo para activar el motor tributario."
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                <tr>
                  <th className={portalDataTableHeadClassName}>Regla comercial</th>
                  <th className={portalDataTableHeadClassName}>Definición</th>
                  <th className={portalDataTableHeadClassName}>Tratamiento</th>
                  <th className={portalDataTableHeadClassName}>Prioridad</th>
                  <th className={portalDataTableHeadClassName}>Override</th>
                  <th className={portalDataTableHeadClassName}>Estado</th>
                  {canEdit && <th className={portalDataTableHeadClassName}>Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                {applications.map((app) => (
                  <tr key={app.id} className={portalTableRowHoverClassName}>
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
                        <span className="font-mono tabular-nums">{app.rateOverride}%</span>
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
                            onClick={() => {
                              setEditTarget(app);
                              setForm({
                                treatment: app.treatment,
                                rateOverride: app.rateOverride ? Number(app.rateOverride) : null,
                                priority: app.priority,
                                isActive: app.isActive,
                              });
                            }}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="softDestructive"
                            size="icon"
                            aria-label={`Eliminar vinculación ${ruleName(app.taxRuleId)}`}
                            title={`Eliminar vinculación ${ruleName(app.taxRuleId)}`}
                            onClick={() => setDeleteTarget(app)}
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

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular regla con catálogo</DialogTitle>
            <DialogDescription>
              Asocia una regla comercial activa con una definición tributaria del catálogo.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-col gap-3">
            {/* Regla comercial */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">
                  Regla comercial <span className="text-iwana-error">*</span>
                </span>
                <HelpPopover>
                  <p className="text-xs">
                    Regla que define el <strong>tipo de tributo</strong> aplicable según el contexto
                    comercial (ej: IVA ventas residencial). Solo se muestran reglas activas.
                  </p>
                </HelpPopover>
              </div>
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

            {/* Definición tributaria */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">
                  Definición tributaria <span className="text-iwana-error">*</span>
                </span>
                <HelpPopover>
                  <p className="text-xs">
                    Impuesto concreto del catálogo que se aplicará cuando la regla seleccionada
                    coincida (ej: IVA estándar 19%). Solo se muestran definiciones activas.
                  </p>
                </HelpPopover>
              </div>
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
                    {d.name} ({d.code})
                  </option>
                ))}
              </Select>
            </div>

            <div className="my-1 border-t border-gray-100 dark:border-dark-border" />

            {/* Tratamiento */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Tratamiento</span>
                <HelpPopover>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
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
              </div>
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

            {/* Override de tasa */}
            <FormField
              label="Override de tasa (%)"
              hint="Tasa específica para esta vinculación. Deja vacío para usar la tasa base de la definición."
            >
              <Input
                placeholder="Ej: 5"
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
            </FormField>

            {/* Prioridad */}
            <FormField
              label="Prioridad"
              hint="Número de orden cuando varias reglas aplican al mismo tiempo. Menor número = mayor prioridad."
            >
              <Input
                placeholder="0"
                type="number"
                min="0"
                value={form.priority ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm((f) => ({ ...f, priority: v }) as AppFormState);
                }}
              />
            </FormField>
          </div>

          {createError && (
            <PortalAlert
              variant="error"
              title="No fue posible vincular"
              description={createError}
            />
          )}

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={submitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={() => void handleCreate()}
              disabled={submitting || !form.taxRuleId || !form.taxDefinitionId}
            >
              {submitting ? 'Vinculando…' : 'Vincular'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setEditTarget(null);
            setEditError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar vinculación tributaria</DialogTitle>
            <DialogDescription>
              {editTarget &&
                `${ruleName(editTarget.taxRuleId)} → ${defName(editTarget.taxDefinitionId)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Tratamiento</span>
                <HelpPopover>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
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
              </div>
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

            <FormField
              label="Override de tasa (%)"
              hint="Tasa específica para esta vinculación. Deja vacío para usar la tasa base de la definición."
            >
              <Input
                placeholder="Ej: 5"
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
            </FormField>

            <FormField
              label="Prioridad"
              hint="Menor número = mayor prioridad cuando varias reglas aplican simultáneamente."
            >
              <Input
                placeholder="0"
                type="number"
                min="0"
                value={form.priority ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm((f) => ({ ...f, priority: v }) as AppFormState);
                }}
              />
            </FormField>
          </div>

          {editError && (
            <PortalAlert variant="error" title="No fue posible guardar" description={editError} />
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={submitting}
              onClick={() => {
                setEditTarget(null);
                setEditError(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={submitting}>
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
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
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" disabled={submitting} onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={submitting}>
              {submitting ? 'Eliminando&hellip;' : 'Eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalPanel>
  );
}
