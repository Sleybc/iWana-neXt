'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, HelpCircle } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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

const TREATMENT_LABELS: Record<string, string> = {
  STANDARD: 'Estándar',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
  FIXED: 'Fija',
};

const INITIAL_FORM: AppFormState = { treatment: 'STANDARD', priority: 0 };

/** Ícono de ayuda con popover click-to-open */
function HelpPopover({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1.5 inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
    if (!r) return id;
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
    return d ? `${d.name} (${d.code})` : id;
  };

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text-primary">
            Reglas de aplicación tributaria
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-dark-text-secondary">
            Vincula reglas comerciales con definiciones del catálogo de impuestos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Vincular regla
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Cargando reglas&hellip;</div>
      ) : applications.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          No hay reglas de aplicación configuradas. Vincula una regla con una definición del
          catálogo para activar el motor nuevo.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {applications.map((app) => (
            <Card key={app.id} className="border border-gray-100 dark:border-dark-border">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {ruleName(app.taxRuleId)}
                    </span>
                    <span className="text-gray-400">&rarr;</span>
                    <span className="text-sm text-iwana-secondary-700">
                      {defName(app.taxDefinitionId)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <Badge variant={app.isActive ? 'success' : 'neutral'} className="text-xs">
                      {app.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
                    <span>Tratamiento: {TREATMENT_LABELS[app.treatment] ?? app.treatment}</span>
                    <span>&middot;</span>
                    <span>Prioridad: {app.priority}</span>
                    {app.rateOverride !== null && (
                      <>
                        <span>&middot;</span>
                        <span>Override: {app.rateOverride}%</span>
                      </>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
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
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setDeleteTarget(app)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Tratamiento
                </span>
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
            <div
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
            >
              {createError}
            </div>
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Tratamiento
                </span>
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
            <div
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
            >
              {editError}
            </div>
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
    </div>
  );
}
