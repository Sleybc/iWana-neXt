'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Lock } from 'lucide-react';
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
  type CreateTaxDefinitionDto,
  type TaxDefinition,
  type UpdateTaxDefinitionDto,
} from '@/lib/api-client';

interface TaxCatalogManagerProps {
  canEdit: boolean;
}

// Formulario local con todos los campos posibles (crear + editar)
interface TaxDefFormState {
  code?: string | undefined;
  name?: string | undefined;
  category?: ('VAT' | 'RETENTION' | 'STAMP' | 'MUNICIPAL' | 'OTHER') | undefined;
  jurisdictionLevel?: ('NATIONAL' | 'DEPARTMENTAL' | 'MUNICIPAL') | undefined;
  baseRate?: number | undefined;
  treatment?: ('STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED') | undefined;
  context?: ('RESIDENTIAL' | 'COMMERCIAL' | 'BOTH') | undefined;
  notes?: string | undefined;
}

const CATEGORY_LABELS: Record<string, string> = {
  VAT: 'IVA',
  RETENTION: 'Retención',
  STAMP: 'Estampilla',
  MUNICIPAL: 'Municipal',
  OTHER: 'Otro',
};

const TREATMENT_LABELS: Record<string, string> = {
  STANDARD: 'Estándar',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
  FIXED: 'Fija',
};

const JURISDICTION_LABELS: Record<string, string> = {
  NATIONAL: 'Nacional',
  DEPARTMENTAL: 'Departamental',
  MUNICIPAL: 'Municipal',
};

const CONTEXT_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCIAL: 'Comercial',
  BOTH: 'Ambos',
};

const INITIAL_FORM: TaxDefFormState = {
  category: 'VAT',
  jurisdictionLevel: 'NATIONAL',
  treatment: 'STANDARD',
  context: 'BOTH',
};

export function TaxCatalogManager({ canEdit }: TaxCatalogManagerProps) {
  const [definitions, setDefinitions] = useState<TaxDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TaxDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxDefinition | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<TaxDefFormState>(INITIAL_FORM);

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await commercialApi.listTaxDefinitions({ isActive: true });
      setDefinitions(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  const handleCreate = async () => {
    if (!form.code || !form.name) return;
    setSubmitting(true);
    try {
      await commercialApi.createTaxDefinition(form as CreateTaxDefinitionDto);
      setCreateOpen(false);
      setForm(INITIAL_FORM);
      await loadDefinitions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear definición');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    try {
      const patch: UpdateTaxDefinitionDto = {};
      if (form.name !== undefined) patch.name = form.name;
      if (form.baseRate !== undefined) patch.baseRate = form.baseRate;
      if (form.treatment !== undefined) patch.treatment = form.treatment;
      if (form.context !== undefined) patch.context = form.context;
      if (form.notes !== undefined) patch.notes = form.notes;
      await commercialApi.updateTaxDefinition(editTarget.id, patch);
      setEditTarget(null);
      await loadDefinitions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al actualizar definición');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await commercialApi.deleteTaxDefinition(deleteTarget.id);
      setDeleteTarget(null);
      await loadDefinitions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar definición');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text-primary">
            Catálogo de impuestos
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-dark-text-secondary">
            Definiciones tributarias del tenant. Los presets del sistema son inmutables.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void loadDefinitions()}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nueva definición
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
        <div className="py-8 text-center text-sm text-gray-500">Cargando catálogo&hellip;</div>
      ) : definitions.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          No hay definiciones tributarias
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {definitions.map((def) => (
            <Card key={def.id} className="border border-gray-100 dark:border-dark-border">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {def.origin === 'SYSTEM' && (
                      <Lock className="h-3.5 w-3.5 text-gray-400" aria-label="Preset del sistema" />
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                      {def.name}
                    </span>
                    <Badge variant="neutral" className="text-xs">
                      {def.code}
                    </Badge>
                    <Badge variant="primary" className="text-xs">
                      {CATEGORY_LABELS[def.category] ?? def.category}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>
                      {JURISDICTION_LABELS[def.jurisdictionLevel] ?? def.jurisdictionLevel}
                    </span>
                    <span>&middot;</span>
                    <span>Tratamiento: {TREATMENT_LABELS[def.treatment] ?? def.treatment}</span>
                    <span>&middot;</span>
                    <span>Contexto: {CONTEXT_LABELS[def.context] ?? def.context}</span>
                    {def.baseRate !== null && (
                      <>
                        <span>&middot;</span>
                        <span>Tasa base: {def.baseRate}%</span>
                      </>
                    )}
                  </div>
                  {def.notes && <p className="text-xs text-gray-400">{def.notes}</p>}
                </div>
                {canEdit && def.origin !== 'SYSTEM' && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditTarget(def);
                        setForm({
                          name: def.name,
                          baseRate: def.baseRate ? Number(def.baseRate) : undefined,
                          treatment: def.treatment,
                          context: def.context,
                          notes: def.notes ?? undefined,
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setDeleteTarget(def)}
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

      {/* Diálogo: crear definición */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva definición tributaria</DialogTitle>
            <DialogDescription>
              Define un impuesto personalizado para este tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Código (ej: ICA_BOGOTA)"
              value={form.code ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, code: v }));
              }}
            />
            <Input
              placeholder="Nombre"
              value={form.name ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, name: v }));
              }}
            />
            <Select
              value={form.category}
              onChange={(e) => {
                const v = e.target.value as TaxDefFormState['category'];
                setForm((f) => ({ ...f, category: v }));
              }}
            >
              <option value="VAT">IVA</option>
              <option value="RETENTION">Retención</option>
              <option value="STAMP">Estampilla</option>
              <option value="MUNICIPAL">Municipal</option>
              <option value="OTHER">Otro</option>
            </Select>
            <Select
              value={form.jurisdictionLevel}
              onChange={(e) => {
                const v = e.target.value as TaxDefFormState['jurisdictionLevel'];
                setForm((f) => ({ ...f, jurisdictionLevel: v }));
              }}
            >
              <option value="NATIONAL">Nacional</option>
              <option value="DEPARTMENTAL">Departamental</option>
              <option value="MUNICIPAL">Municipal</option>
            </Select>
            <Input
              placeholder="Tasa base (%)"
              type="number"
              step="0.01"
              value={form.baseRate ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : undefined;
                setForm((f) => ({ ...f, baseRate: v }));
              }}
            />
            <Select
              value={form.treatment}
              onChange={(e) => {
                const v = e.target.value as TaxDefFormState['treatment'];
                setForm((f) => ({ ...f, treatment: v }));
              }}
            >
              <option value="STANDARD">Estándar</option>
              <option value="EXEMPT">Exento</option>
              <option value="EXCLUDED">Excluido</option>
              <option value="FIXED">Fija</option>
            </Select>
            <Select
              value={form.context}
              onChange={(e) => {
                const v = e.target.value as TaxDefFormState['context'];
                setForm((f) => ({ ...f, context: v }));
              }}
            >
              <option value="BOTH">Ambos</option>
              <option value="RESIDENTIAL">Residencial</option>
              <option value="COMMERCIAL">Comercial</option>
            </Select>
            <Input
              placeholder="Notas (opcional)"
              value={form.notes ?? ''}
              onChange={(e) => {
                const v = e.target.value || undefined;
                setForm((f) => ({ ...f, notes: v }));
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
              disabled={submitting || !form.code || !form.name}
            >
              {submitting ? 'Creando&hellip;' : 'Crear definición'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: editar definición */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar definición tributaria</DialogTitle>
            <DialogDescription>{editTarget?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Nombre"
              value={form.name ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) => ({ ...f, name: v }));
              }}
            />
            <Input
              placeholder="Tasa base (%)"
              type="number"
              step="0.01"
              value={form.baseRate ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : undefined;
                setForm((f) => ({ ...f, baseRate: v }));
              }}
            />
            <Select
              value={form.treatment}
              onChange={(e) => {
                const v = e.target.value as TaxDefFormState['treatment'];
                setForm((f) => ({ ...f, treatment: v }));
              }}
            >
              <option value="STANDARD">Estándar</option>
              <option value="EXEMPT">Exento</option>
              <option value="EXCLUDED">Excluido</option>
              <option value="FIXED">Fija</option>
            </Select>
            <Select
              value={form.context}
              onChange={(e) => {
                const v = e.target.value as TaxDefFormState['context'];
                setForm((f) => ({ ...f, context: v }));
              }}
            >
              <option value="BOTH">Ambos</option>
              <option value="RESIDENTIAL">Residencial</option>
              <option value="COMMERCIAL">Comercial</option>
            </Select>
            <Input
              placeholder="Notas"
              value={form.notes ?? ''}
              onChange={(e) => {
                const v = e.target.value || undefined;
                setForm((f) => ({ ...f, notes: v }));
              }}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" disabled={submitting} onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={submitting}>
              {submitting ? 'Guardando&hellip;' : 'Guardar cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: confirmar eliminación */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar definición</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTarget?.name}</strong>? Esta acción es irreversible.
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
