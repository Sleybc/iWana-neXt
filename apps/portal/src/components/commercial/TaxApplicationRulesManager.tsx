'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
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
  Input,
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

  const ruleName = (id: string) => rules.find((r) => r.id === id)?.taxType ?? id;
  const defName = (id: string) => {
    const d = definitions.find((def) => def.id === id);
    return d ? `${d.name} (${d.code})` : id;
  };

  const handleCreate = async () => {
    if (!form.taxRuleId || !form.taxDefinitionId) return;
    setSubmitting(true);
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
      setForm(INITIAL_FORM);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear aplicación');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const dto: UpdateTaxRuleApplicationDto = {};
      if (form.treatment !== undefined) dto.treatment = form.treatment;
      if (form.rateOverride !== undefined) dto.rateOverride = form.rateOverride;
      if (form.priority !== undefined) dto.priority = form.priority;
      if (form.isActive !== undefined) dto.isActive = form.isActive;
      await commercialApi.updateTaxRuleApplication(editTarget.id, dto);
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al actualizar aplicación');
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular regla con catálogo</DialogTitle>
            <DialogDescription>
              Selecciona una regla comercial y una definición tributaria del catálogo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Select
              value={form.taxRuleId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, taxRuleId: v }) as AppFormState);
              }}
            >
              <option value="">Selecciona una regla&hellip;</option>
              {rules
                .filter((r) => r.isActive)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.taxType}
                  </option>
                ))}
            </Select>
            <Select
              value={form.taxDefinitionId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, taxDefinitionId: v }) as AppFormState);
              }}
            >
              <option value="">Selecciona una definición&hellip;</option>
              {definitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </Select>
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
            <Input
              placeholder="Override de tasa (%)"
              type="number"
              step="0.01"
              value={form.rateOverride ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setForm((f) => ({ ...f, rateOverride: v }) as AppFormState);
              }}
            />
            <Input
              placeholder="Prioridad"
              type="number"
              value={form.priority ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => ({ ...f, priority: v }) as AppFormState);
              }}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={submitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={() => void handleCreate()}
              disabled={submitting || !form.taxRuleId || !form.taxDefinitionId}
            >
              {submitting ? 'Vinculando&hellip;' : 'Vincular'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar aplicación tributaria</DialogTitle>
            <DialogDescription>
              {editTarget &&
                `${ruleName(editTarget.taxRuleId)} → ${defName(editTarget.taxDefinitionId)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
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
            <Input
              placeholder="Override de tasa (%)"
              type="number"
              step="0.01"
              value={form.rateOverride ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setForm((f) => ({ ...f, rateOverride: v }) as AppFormState);
              }}
            />
            <Input
              placeholder="Prioridad"
              type="number"
              value={form.priority ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => ({ ...f, priority: v }) as AppFormState);
              }}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" disabled={submitting} onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={submitting}>
              {submitting ? 'Guardando&hellip;' : 'Guardar'}
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
