'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Lock, HelpCircle } from 'lucide-react';
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
  type CreateTaxDefinitionDto,
  type TaxDefinition,
  type UpdateTaxDefinitionDto,
} from '@/lib/api-client';
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
import {
  TAX_CATEGORY_LABELS,
  TAX_CONTEXT_LABELS,
  TAX_JURISDICTION_LABELS,
  TAX_TREATMENT_LABELS,
  resolveTaxLabel,
} from '@/components/commercial/commercial-labels';

// ── Tooltip de ayuda reutilizable ─────────────────────────────────────────────

function HelpPopover({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ayuda"
          className={`ml-1 inline-flex items-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 ${interactiveFocusClassName}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface TaxCatalogManagerProps {
  canEdit: boolean;
}

// Formulario local con todos los campos posibles (crear + editar)
interface TaxDefFormState {
  code?: string | undefined;
  name?: string | undefined;
  category?: ('VAT' | 'WITHHOLDING' | 'STAMP' | 'MUNICIPAL' | 'OTHER') | undefined;
  jurisdictionLevel?: ('NATIONAL' | 'DEPARTMENT' | 'MUNICIPAL') | undefined;
  baseRate?: number | undefined;
  treatment?: ('STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED') | undefined;
  context?: ('SALES' | 'PURCHASE' | 'BOTH') | undefined;
  notes?: string | undefined;
}

interface FormErrors {
  code?: string;
  name?: string;
}

const INITIAL_FORM: TaxDefFormState = {
  category: 'VAT',
  jurisdictionLevel: 'NATIONAL',
  treatment: 'STANDARD',
  context: 'BOTH',
};

const TAX_CODE_ALLOWED_PATTERN = /^[A-Z0-9_]+$/;

function normalizeTaxCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_');
}

export function TaxCatalogManager({ canEdit }: TaxCatalogManagerProps) {
  const [definitions, setDefinitions] = useState<TaxDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<TaxDefinition | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxDefinition | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<TaxDefFormState>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // true = código generado automáticamente desde el nombre; false = editado manualmente
  const codeAutoRef = useRef(true);

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
    const code = form.code ? normalizeTaxCode(form.code) : '';
    const name = form.name?.trim() ?? '';

    // Validación inline
    const errors: FormErrors = {};
    if (!name) errors.name = 'El nombre es obligatorio.';
    if (!code) errors.code = 'El código es obligatorio.';
    else if (!TAX_CODE_ALLOWED_PATTERN.test(code))
      errors.code = 'Solo mayúsculas, dígitos y guion bajo (ej: ICA_BOGOTA).';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setCreateError(null);
    try {
      const payload: CreateTaxDefinitionDto = {
        code,
        name,
        category: form.category ?? 'VAT',
        jurisdictionLevel: form.jurisdictionLevel ?? 'NATIONAL',
        treatment: form.treatment ?? 'STANDARD',
        context: form.context ?? 'BOTH',
        ...(form.baseRate !== undefined && !Number.isNaN(form.baseRate)
          ? { baseRate: form.baseRate }
          : {}),
        ...(form.notes?.trim() ? { notes: form.notes.trim() } : {}),
      };

      await commercialApi.createTaxDefinition(payload);
      setCreateOpen(false);
      setForm(INITIAL_FORM);
      await loadDefinitions();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Error al crear la definición.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    setEditError(null);
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
      setEditError(err instanceof ApiError ? err.message : 'Error al actualizar la definición.');
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
      setError(err instanceof ApiError ? err.message : 'Error al eliminar la definición.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalPanel
      eyebrow="Tributación"
      title="Catálogo de impuestos"
      description="Consulta y administra definiciones tributarias del tenant (lectura y edición según origen)."
      actions={
        <>
          <Badge variant="neutral">
            {definitions.length} definición{definitions.length === 1 ? '' : 'es'}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar catálogo de impuestos"
            title="Actualizar catálogo de impuestos"
            onClick={() => void loadDefinitions()}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </Button>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => {
                setCreateError(null);
                setFormErrors({});
                codeAutoRef.current = true;
                setForm(INITIAL_FORM);
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva definición
            </Button>
          )}
        </>
      }
      contentClassName="flex flex-col gap-4"
    >
      {error && (
        <PortalAlert
          variant="error"
          title="No fue posible cargar el catálogo"
          description={error}
        />
      )}

      {loading ? (
        <PortalSkeletonBlock className="h-28" />
      ) : definitions.length === 0 ? (
        <PortalEmptyState
          title="Sin definiciones tributarias"
          description='Usa "Nueva definición" para registrar impuestos operativos del tenant.'
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                <tr>
                  <th className={portalDataTableHeadClassName}>Definición</th>
                  <th className={portalDataTableHeadClassName}>Código</th>
                  <th className={portalDataTableHeadClassName}>Categoría</th>
                  <th className={portalDataTableHeadClassName}>Jurisdicción</th>
                  <th className={portalDataTableHeadClassName}>Tratamiento</th>
                  <th className={portalDataTableHeadClassName}>Contexto</th>
                  <th className={portalDataTableHeadClassName}>Tasa</th>
                  {canEdit && <th className={portalDataTableHeadClassName}>Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                {definitions.map((def) => (
                  <tr key={def.id} className={portalTableRowHoverClassName}>
                    <td className={portalDataTableCellClassName}>
                      <div className="flex items-center gap-2">
                        {def.origin === 'SYSTEM' && (
                          <Lock
                            className="h-3.5 w-3.5 shrink-0 text-gray-400"
                            aria-label="Preset del sistema"
                          />
                        )}
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">{def.name}</p>
                          {def.notes && (
                            <p className="mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
                              {def.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <span className="font-mono text-xs tabular-nums text-gray-700 dark:text-gray-200">
                        {def.code}
                      </span>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant="primary" className="text-xs">
                        {resolveTaxLabel(TAX_CATEGORY_LABELS, def.category)}
                      </Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {resolveTaxLabel(TAX_JURISDICTION_LABELS, def.jurisdictionLevel)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {resolveTaxLabel(TAX_TREATMENT_LABELS, def.treatment)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {resolveTaxLabel(TAX_CONTEXT_LABELS, def.context)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {def.baseRate !== null ? (
                        <span className="font-mono tabular-nums">{def.baseRate}%</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className={portalDataTableCellClassName}>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="icon"
                            aria-label={`Editar definición tributaria ${def.name}`}
                            title={`Editar definición tributaria ${def.name}`}
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
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="softDestructive"
                            size="icon"
                            aria-label={`Eliminar definición tributaria ${def.name}`}
                            title={`Eliminar definición tributaria ${def.name}`}
                            onClick={() => setDeleteTarget(def)}
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

      {/* Diálogo: crear definición */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setFormErrors({});
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva definición tributaria</DialogTitle>
            <DialogDescription>
              Crea un impuesto o contribución personalizada para esta empresa. Los campos marcados
              con <span className="text-iwana-error">*</span> son obligatorios.
            </DialogDescription>
          </DialogHeader>

          {/* ── Sección 1: Identificación ── */}
          <div className="mt-2 flex flex-col gap-3">
            <p className="portal-eyebrow-muted">Identificación</p>

            <FormField
              label="Nombre"
              required
              hint="Nombre legible del tributo, p. ej. «ICA Bogotá» o «IVA estándar 19%»."
              {...(formErrors.name ? { error: formErrors.name } : {})}
            >
              <Input
                placeholder="Ej: ICA Bogotá"
                value={form.name ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const next: TaxDefFormState = { ...f, name: v };
                    // Auto-generar código mientras no haya sido editado manualmente
                    if (codeAutoRef.current) {
                      next.code = normalizeTaxCode(v);
                    }
                    return next;
                  });
                  if (formErrors.name) setFormErrors(({ name: _n, ...rest }) => rest);
                }}
              />
            </FormField>

            <FormField
              label="Código interno"
              required
              hint={
                codeAutoRef.current
                  ? 'Generado automáticamente desde el nombre. Puedes editarlo si necesitas un código específico.'
                  : 'Identificador único en MAYÚSCULAS. Solo letras, números y guion bajo.'
              }
              {...(formErrors.code ? { error: formErrors.code } : {})}
            >
              <div className="relative">
                <Input
                  placeholder="Ej: ICA_BOGOTA"
                  value={form.code ?? ''}
                  onChange={(e) => {
                    codeAutoRef.current = false;
                    const v = normalizeTaxCode(e.target.value);
                    setForm((f) => ({ ...f, code: v }));
                    if (formErrors.code) setFormErrors(({ code: _c, ...rest }) => rest);
                  }}
                  className="pr-16"
                />
                {codeAutoRef.current && (form.code ?? '').length > 0 && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-iwana-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-iwana-primary">
                    Auto
                  </span>
                )}
              </div>
            </FormField>
          </div>

          {/* ── Divider ── */}
          <div className="my-1 border-t border-gray-100 dark:border-dark-border" />

          {/* ── Sección 2: Configuración fiscal ── */}
          <div className="flex flex-col gap-3">
            <p className="portal-eyebrow-muted">Configuración fiscal</p>

            {/* Categoría */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Categoría</span>
                <HelpPopover>
                  <p className="font-semibold mb-1">Tipos de categoría</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    <li>
                      <strong>IVA</strong> — Impuesto al Valor Agregado (ventas de servicios y
                      bienes)
                    </li>
                    <li>
                      <strong>Retención</strong> — Retención en la fuente sobre pagos
                    </li>
                    <li>
                      <strong>Estampilla</strong> — Gravamen departamental o municipal sobre
                      contratos
                    </li>
                    <li>
                      <strong>Municipal</strong> — ICA u otro impuesto de industria y comercio local
                    </li>
                    <li>
                      <strong>Otro</strong> — Contribuciones no clasificadas en las categorías
                      anteriores
                    </li>
                  </ul>
                </HelpPopover>
              </div>
              <Select
                value={form.category}
                onChange={(e) => {
                  const v = e.target.value as TaxDefFormState['category'];
                  setForm((f) => ({ ...f, category: v }));
                }}
              >
                <option value="VAT">IVA</option>
                <option value="WITHHOLDING">Retención</option>
                <option value="STAMP">Estampilla</option>
                <option value="MUNICIPAL">Municipal</option>
                <option value="OTHER">Otro</option>
              </Select>
            </div>

            {/* Jurisdicción */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Jurisdicción</span>
                <HelpPopover>
                  <p className="font-semibold mb-1">¿Dónde aplica este tributo?</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    <li>
                      <strong>Nacional</strong> — Aplica en todo el territorio (ej: IVA 19%)
                    </li>
                    <li>
                      <strong>Departamental</strong> — Aplica en un departamento específico
                    </li>
                    <li>
                      <strong>Municipal</strong> — Aplica en un municipio concreto (ej: ICA Bogotá)
                    </li>
                  </ul>
                </HelpPopover>
              </div>
              <Select
                value={form.jurisdictionLevel}
                onChange={(e) => {
                  const v = e.target.value as TaxDefFormState['jurisdictionLevel'];
                  setForm((f) => ({ ...f, jurisdictionLevel: v }));
                }}
              >
                <option value="NATIONAL">Nacional</option>
                <option value="DEPARTMENT">Departamental</option>
                <option value="MUNICIPAL">Municipal</option>
              </Select>
            </div>

            {/* Tasa base */}
            <FormField
              label="Tasa base (%)"
              hint="Porcentaje estándar del tributo. Déjalo vacío si la tasa varía por suscriptor o se define caso a caso."
            >
              <Input
                placeholder="Ej: 19"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.baseRate ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : undefined;
                  setForm((f) => ({ ...f, baseRate: v }));
                }}
              />
            </FormField>

            {/* Tratamiento */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Tratamiento</span>
                <HelpPopover>
                  <p className="font-semibold mb-1">¿Cómo se aplica este tributo?</p>
                  <ul className="list-disc pl-4 space-y-1 text-xs">
                    <li>
                      <strong>Estándar</strong> — Se cobra sobre la base gravable a la tasa definida
                    </li>
                    <li>
                      <strong>Exento</strong> — La operación existe pero tiene tasa cero (debe
                      declararse)
                    </li>
                    <li>
                      <strong>Excluido</strong> — La operación no está en el hecho generador; no
                      aplica
                    </li>
                    <li>
                      <strong>Fija</strong> — Monto fijo sin importar la base (ej: estampilla por
                      contrato)
                    </li>
                  </ul>
                </HelpPopover>
              </div>
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
            </div>

            {/* Contexto */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Contexto de aplicación</span>
                <HelpPopover>
                  <p className="text-xs">
                    Define si el tributo aplica a facturas de <strong>ventas</strong> (emitidas al
                    cliente), de <strong>compras</strong> (recibidas de proveedores) o en{' '}
                    <strong>ambos</strong> flujos.
                  </p>
                </HelpPopover>
              </div>
              <Select
                value={form.context}
                onChange={(e) => {
                  const v = e.target.value as TaxDefFormState['context'];
                  setForm((f) => ({ ...f, context: v }));
                }}
              >
                <option value="BOTH">Ambos (ventas y compras)</option>
                <option value="SALES">Solo ventas</option>
                <option value="PURCHASE">Solo compras</option>
              </Select>
            </div>

            {/* Notas */}
            <FormField
              label="Notas"
              hint="Información adicional visible en el catálogo, p. ej. «Aplica a estratos 3 y 4»."
            >
              <Input
                placeholder="Opcional"
                value={form.notes ?? ''}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  setForm((f) => ({ ...f, notes: v }));
                }}
              />
            </FormField>
          </div>

          {/* Error de API */}
          {createError && (
            <PortalAlert variant="error" title="No fue posible crear" description={createError} />
          )}

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" disabled={submitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={() => void handleCreate()} disabled={submitting}>
              {submitting ? 'Creando…' : 'Crear definición'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo: editar definición */}
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
            <DialogTitle>Editar definición tributaria</DialogTitle>
            <DialogDescription>
              Modifica los campos editables de <strong>{editTarget?.name}</strong>. El código y la
              categoría no se pueden cambiar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <FormField label="Nombre" hint="Nombre legible del tributo.">
              <Input
                placeholder="Nombre"
                value={form.name ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, name: v }));
                }}
              />
            </FormField>

            <FormField
              label="Tasa base (%)"
              hint="Porcentaje estándar. Déjalo vacío si varía por suscriptor."
            >
              <Input
                placeholder="Ej: 19"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.baseRate ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : undefined;
                  setForm((f) => ({ ...f, baseRate: v }));
                }}
              />
            </FormField>

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
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span className="portal-eyebrow-muted">Contexto de aplicación</span>
                <HelpPopover>
                  <p className="text-xs">
                    <strong>Ventas</strong>: facturas emitidas al cliente. <strong>Compras</strong>:
                    facturas de proveedores. <strong>Ambos</strong>: ambos flujos.
                  </p>
                </HelpPopover>
              </div>
              <Select
                value={form.context}
                onChange={(e) => {
                  const v = e.target.value as TaxDefFormState['context'];
                  setForm((f) => ({ ...f, context: v }));
                }}
              >
                <option value="BOTH">Ambos (ventas y compras)</option>
                <option value="SALES">Solo ventas</option>
                <option value="PURCHASE">Solo compras</option>
              </Select>
            </div>

            <FormField label="Notas" hint="Información adicional visible en el catálogo.">
              <Input
                placeholder="Opcional"
                value={form.notes ?? ''}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  setForm((f) => ({ ...f, notes: v }));
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
    </PortalPanel>
  );
}
