'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Lock,
  HelpCircle,
  CircleAlert,
  CheckCircle2,
} from 'lucide-react';
import {
  Badge,
  Button,
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
} from '@iwana/ui';
import {
  ApiError,
  COMMERCIAL_LIST_PAGE_SIZE,
  commercialApi,
  type CommercialListMeta,
  type CommercialListParams,
  type CreateTaxDefinitionDto,
  type TaxDefinition,
  type UpdateTaxDefinitionDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import {
  interactiveFocusClassName,
  PortalAlert,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalResultsStrip,
  PortalSidePeek,
  PortalSkeletonBlock,
  PortalSuccessAlert,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
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
          className={`ml-1 inline-flex items-center text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 ${interactiveFocusClassName}`}
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

function SelectLabelWithHelp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </div>
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
  const [meta, setMeta] = useState<CommercialListMeta | null>(null);
  const [listParams, setListParams] = useState<CommercialListParams>({
    limit: COMMERCIAL_LIST_PAGE_SIZE,
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TaxDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<TaxDefFormState>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // true = código generado automáticamente desde el nombre; false = editado manualmente
  const codeAutoRef = useRef(true);

  const refreshParams: CommercialListParams = {
    limit: COMMERCIAL_LIST_PAGE_SIZE,
    isActive: true,
  };

  const loadDefinitions = useCallback(async (params: CommercialListParams, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const result = await commercialApi.listTaxDefinitions({
        ...params,
        limit: params.limit ?? COMMERCIAL_LIST_PAGE_SIZE,
        isActive: params.isActive ?? true,
      });
      const page = result.data ?? [];
      setDefinitions((prev) => (append ? [...prev, ...page] : page));
      setMeta(result.meta ?? { ...EMPTY_LIST_META, nextCursor: null, total: page.length });
      setListParams(params);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : 'No fue posible cargar el catálogo de impuestos. Intenta de nuevo.',
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void loadDefinitions({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  useEffect(() => {
    void loadDefinitions({ limit: COMMERCIAL_LIST_PAGE_SIZE, isActive: true });
  }, [loadDefinitions]);

  function openCreateForm() {
    setEditingTarget(null);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setFormErrors({});
    codeAutoRef.current = true;
    setForm(INITIAL_FORM);
    setIsFormOpen(true);
  }

  function openEditForm(def: TaxDefinition) {
    setEditingTarget(def);
    setFormError(null);
    setActionError(null);
    setSuccessMessage(null);
    setFormErrors({});
    setForm({
      name: def.name,
      baseRate: def.baseRate ? Number(def.baseRate) : undefined,
      treatment: def.treatment,
      context: def.context,
      notes: def.notes ?? undefined,
    });
    setIsFormOpen(true);
  }

  function handleFormOpenChange(nextOpen: boolean) {
    setIsFormOpen(nextOpen);
    if (!nextOpen) {
      setEditingTarget(null);
      setFormError(null);
      setFormErrors({});
      setForm(INITIAL_FORM);
      codeAutoRef.current = true;
    }
  }

  const handleCreate = async () => {
    const code = form.code ? normalizeTaxCode(form.code) : '';
    const name = form.name?.trim() ?? '';

    const errors: FormErrors = {};
    if (!name) errors.name = 'El nombre es obligatorio.';
    if (!code) errors.code = 'El código es obligatorio.';
    else if (!TAX_CODE_ALLOWED_PATTERN.test(code))
      errors.code = 'Solo mayúsculas, dígitos y guion bajo (ej: ICA_BOGOTA).';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    setFormError(null);
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
      handleFormOpenChange(false);
      await loadDefinitions(refreshParams);
      setSuccessMessage('Definición tributaria creada.');
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'No fue posible crear la definición. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingTarget) return;
    setSaving(true);
    setFormError(null);
    try {
      const patch: UpdateTaxDefinitionDto = {};
      if (form.name !== undefined) patch.name = form.name;
      if (form.baseRate !== undefined) patch.baseRate = form.baseRate;
      if (form.treatment !== undefined) patch.treatment = form.treatment;
      if (form.context !== undefined) patch.context = form.context;
      if (form.notes !== undefined) patch.notes = form.notes;
      await commercialApi.updateTaxDefinition(editingTarget.id, patch);
      handleFormOpenChange(false);
      await loadDefinitions(refreshParams);
      setSuccessMessage('Definición tributaria actualizada.');
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'No fue posible actualizar la definición. Intenta de nuevo.',
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
      await commercialApi.deleteTaxDefinition(deleteTarget.id);
      setDeleteTarget(null);
      await loadDefinitions(refreshParams);
      setSuccessMessage('Definición tributaria eliminada.');
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'No fue posible eliminar la definición. Intenta de nuevo.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const showLoadErrorOnly = Boolean(loadError) && definitions.length === 0 && !loading;
  const isEditing = Boolean(editingTarget);
  const hasMore = meta?.nextCursor != null;
  const totalDefinitions = meta?.total ?? definitions.length;
  const resourceWord = totalDefinitions === 1 ? 'definición' : 'definiciones';
  const resultsLabel = hasMore
    ? `${definitions.length} de ${totalDefinitions} ${resourceWord}`
    : `${totalDefinitions} ${resourceWord}`;

  return (
    <PortalPanel
      eyebrow="Tributación"
      title="Catálogo de impuestos"
      description="Consulta y administra definiciones tributarias de tu empresa (lectura y edición según origen)."
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar catálogo de impuestos"
            title="Actualizar catálogo de impuestos"
            onClick={() => void loadDefinitions(refreshParams)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </Button>
          {canEdit && (
            <Button onClick={openCreateForm}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva definición
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
          title="No fue posible cargar el catálogo"
          description={loadError}
          icon={CircleAlert}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadDefinitions(refreshParams)}
            >
              Reintentar
            </Button>
          }
        />
      ) : definitions.length === 0 ? (
        <PortalEmptyState
          title="Sin definiciones tributarias"
          description='Usa "Nueva definición" para registrar impuestos operativos de tu empresa.'
          {...(canEdit
            ? {
                action: (
                  <Button onClick={openCreateForm}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nueva definición
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
                    <PortalDataTableHead>Definición</PortalDataTableHead>
                    <PortalDataTableHead>Código</PortalDataTableHead>
                    <PortalDataTableHead>Categoría</PortalDataTableHead>
                    <PortalDataTableHead>Jurisdicción</PortalDataTableHead>
                    <PortalDataTableHead>Tratamiento</PortalDataTableHead>
                    <PortalDataTableHead>Contexto</PortalDataTableHead>
                    <PortalDataTableHead>Tasa</PortalDataTableHead>
                    {canEdit && <PortalDataTableHead>Acciones</PortalDataTableHead>}
                  </tr>
                </thead>
                <tbody className={portalDataTableBodyClassName}>
                  {definitions.map((def) => (
                    <tr key={def.id} className={portalTableRowHoverClassName}>
                      <td className={portalDataTableCellClassName}>
                        <div className="flex items-center gap-2">
                          {def.origin === 'SYSTEM' && (
                            <Lock
                              className="h-3.5 w-3.5 shrink-0 text-gray-400"
                              aria-label="Definición incluida por el sistema"
                            />
                          )}
                          <div>
                            <p className="font-medium text-gray-800 dark:text-gray-100">
                              {def.name}
                            </p>
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
                              onClick={() => openEditForm(def)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="softDestructive"
                              size="icon"
                              aria-label={`Eliminar definición tributaria ${def.name}`}
                              title={`Eliminar definición tributaria ${def.name}`}
                              onClick={() => {
                                setActionError(null);
                                setDeleteTarget(def);
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
              resourceLabel="definiciones"
              shown={definitions.length}
              total={totalDefinitions}
            />
          </div>
        </div>
      )}

      <PortalSidePeek
        open={isFormOpen}
        onClose={() => handleFormOpenChange(false)}
        eyebrow="Tributación"
        title={isEditing ? 'Editar definición tributaria' : 'Nueva definición tributaria'}
        description={
          isEditing
            ? `Modifica los campos editables de ${editingTarget?.name}. El código y la categoría no se pueden cambiar.`
            : 'Crea un impuesto o contribución personalizada para esta empresa.'
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
              onClick={() => void (isEditing ? handleUpdate() : handleCreate())}
              loading={saving}
            >
              {isEditing ? 'Guardar' : 'Crear definición'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {!isEditing && (
            <section className="space-y-4">
              <div>
                <p className="portal-eyebrow">Identificación</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Nombre legible y código interno único del tributo.
                </p>
              </div>

              <Input
                label="Nombre"
                requiredIndicator
                helperText="Nombre legible del tributo, p. ej. «ICA Bogotá» o «IVA estándar 19%»."
                placeholder="Ej. ICA Bogotá"
                value={form.name ?? ''}
                error={formErrors.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => {
                    const next: TaxDefFormState = { ...f, name: v };
                    if (codeAutoRef.current) {
                      next.code = normalizeTaxCode(v);
                    }
                    return next;
                  });
                  if (formErrors.name) setFormErrors(({ name: _n, ...rest }) => rest);
                }}
              />

              <Input
                label="Código interno"
                requiredIndicator
                helperText={
                  codeAutoRef.current
                    ? 'Generado automáticamente desde el nombre. Puedes editarlo si necesitas un código específico.'
                    : 'Identificador único en MAYÚSCULAS. Solo letras, números y guion bajo.'
                }
                placeholder="Ej. ICA_BOGOTA"
                value={form.code ?? ''}
                error={formErrors.code}
                className="pr-16"
                endAdornment={
                  codeAutoRef.current && (form.code ?? '').length > 0 ? (
                    <span className="rounded-full bg-iwana-primary/10 px-1.5 py-0.5 text-xs font-semibold text-iwana-primary">
                      Auto
                    </span>
                  ) : undefined
                }
                onChange={(e) => {
                  codeAutoRef.current = false;
                  const v = normalizeTaxCode(e.target.value);
                  setForm((f) => ({ ...f, code: v }));
                  if (formErrors.code) setFormErrors(({ code: _c, ...rest }) => rest);
                }}
              />
            </section>
          )}

          <section className="space-y-4">
            <div>
              <p className="portal-eyebrow">Configuración fiscal</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {isEditing
                  ? 'Actualiza tasa, tratamiento, contexto y notas operativas.'
                  : 'Define categoría, jurisdicción y cómo se aplica el tributo.'}
              </p>
            </div>

            {isEditing ? (
              <Input
                label="Nombre"
                helperText="Nombre legible del tributo."
                placeholder="Nombre"
                value={form.name ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, name: v }));
                }}
              />
            ) : (
              <>
                <div className="space-y-1.5">
                  <SelectLabelWithHelp label="Categoría">
                    <HelpPopover>
                      <p className="mb-1 font-semibold">Tipos de categoría</p>
                      <ul className="list-disc space-y-1 pl-4 text-xs">
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
                          <strong>Municipal</strong> — ICA u otro impuesto de industria y comercio
                          local
                        </li>
                        <li>
                          <strong>Otro</strong> — Contribuciones no clasificadas en las categorías
                          anteriores
                        </li>
                      </ul>
                    </HelpPopover>
                  </SelectLabelWithHelp>
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

                <div className="space-y-1.5">
                  <SelectLabelWithHelp label="Jurisdicción">
                    <HelpPopover>
                      <p className="mb-1 font-semibold">¿Dónde aplica este tributo?</p>
                      <ul className="list-disc space-y-1 pl-4 text-xs">
                        <li>
                          <strong>Nacional</strong> — Aplica en todo el territorio (ej: IVA 19%)
                        </li>
                        <li>
                          <strong>Departamental</strong> — Aplica en un departamento específico
                        </li>
                        <li>
                          <strong>Municipal</strong> — Aplica en un municipio concreto (ej: ICA
                          Bogotá)
                        </li>
                      </ul>
                    </HelpPopover>
                  </SelectLabelWithHelp>
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
              </>
            )}

            <Input
              label="Tasa base (%)"
              helperText={
                isEditing
                  ? 'Porcentaje estándar. Déjalo vacío si varía por suscriptor.'
                  : 'Porcentaje estándar del tributo. Déjalo vacío si la tasa varía por suscriptor o se define caso a caso.'
              }
              placeholder="Ej. 19"
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

            <div className="space-y-1.5">
              <SelectLabelWithHelp label="Tratamiento">
                <HelpPopover>
                  <p className="mb-1 font-semibold">¿Cómo se aplica este tributo?</p>
                  <ul className="list-disc space-y-1 pl-4 text-xs">
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
              </SelectLabelWithHelp>
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

            <div className="space-y-1.5">
              <SelectLabelWithHelp label="Contexto de aplicación">
                <HelpPopover>
                  <p className="text-xs">
                    Define si el tributo aplica a facturas de <strong>ventas</strong> (emitidas al
                    cliente), de <strong>compras</strong> (recibidas de proveedores) o en{' '}
                    <strong>ambos</strong> flujos.
                  </p>
                </HelpPopover>
              </SelectLabelWithHelp>
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

            <Input
              label="Notas"
              helperText="Información adicional visible en el catálogo, p. ej. «Aplica a estratos 3 y 4»."
              placeholder="Opcional"
              value={form.notes ?? ''}
              onChange={(e) => {
                const v = e.target.value || undefined;
                setForm((f) => ({ ...f, notes: v }));
              }}
            />
          </section>

          {formError && (
            <PortalAlert
              variant="error"
              title={isEditing ? 'No fue posible guardar' : 'No fue posible crear'}
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
            <DialogTitle>Eliminar definición</DialogTitle>
            <DialogDescription>
              ¿Eliminar <strong>{deleteTarget?.name}</strong>? Esta acción es irreversible.
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
