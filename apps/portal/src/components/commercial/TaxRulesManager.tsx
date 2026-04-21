'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  FlaskConical,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
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
  Input,
  Select,
} from '@iwana/ui';
import {
  ApiError,
  commercialApi,
  type CreateTaxClassificationDto,
  type CreateTaxRuleDto,
  type UpdateTaxClassificationDto,
  type UpdateTaxRuleDto,
  type ResolveTaxDto,
  type TaxClassification,
  type TaxRule,
} from '@/lib/api-client';

interface TaxRulesManagerProps {
  canEdit: boolean;
}

// Mapeo de segmentos de cliente a etiquetas en español.
const SEGMENT_LABELS: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  SOHO: 'SOHO',
  PYME: 'PyME',
  CORPORATE: 'Corporativo',
  GOVERNMENT: 'Gobierno',
  WHOLESALE: 'Mayorista',
};

const SEGMENT_OPTIONS = Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label }));

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-200';
const inputBaseClass =
  'h-11 w-full rounded-[24px] border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-iwana-soft outline-none transition-colors focus:border-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100';

// Icono booleano para columnas de impuestos.
function BoolIcon({ value }: { value: boolean }) {
  return value ? (
    <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Sí" />
  ) : (
    <XCircle className="h-4 w-4 text-gray-300" aria-label="No" />
  );
}

function mapLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Tu rol no tiene permisos para consultar las reglas.';
    return error.message;
  }
  return 'No fue posible cargar la configuración tributaria.';
}

// Etiquetas de tipos de impuesto.
const TAX_TYPE_OPTIONS = [
  { value: 'IVA', label: 'IVA' },
  { value: 'RETENTION', label: 'Retención en la fuente' },
  { value: 'ICA', label: 'ICA' },
];

/** Deriva un código único en UPPER_SNAKE_CASE a partir del nombre de la clasificación. */
function deriveClassificationCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

// ── Estado formulario: clasificación ──────────────────────────────────────────
interface ClassFormState {
  name: string;
  description: string;
  appliesIva: boolean;
  appliesRetefuente: boolean;
  appliesReteIca: boolean;
  appliesEstampillas: boolean;
}

const EMPTY_CLASS_FORM: ClassFormState = {
  name: '',
  description: '',
  appliesIva: false,
  appliesRetefuente: false,
  appliesReteIca: false,
  appliesEstampillas: false,
};

// ── Estado formulario: regla tributaria ───────────────────────────────────────
interface TaxRuleFormState {
  taxClassificationId: string;
  taxType: string;
  ratePercentage: string;
  customerSegment: string;
  stratumFrom: string;
  stratumTo: string;
  priority: string;
}

const EMPTY_TAX_RULE_FORM: TaxRuleFormState = {
  taxClassificationId: '',
  taxType: '',
  ratePercentage: '',
  customerSegment: '',
  stratumFrom: '',
  stratumTo: '',
  priority: '0',
};

export function TaxRulesManager({ canEdit }: TaxRulesManagerProps) {
  const [classifications, setClassifications] = useState<TaxClassification[]>([]);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Estado de edición: null = modo creación, objeto = modo edición
  const [editingClass, setEditingClass] = useState<TaxClassification | null>(null);
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null);

  const [classForm, setClassForm] = useState<ClassFormState>(EMPTY_CLASS_FORM);
  const [classFormErrors, setClassFormErrors] = useState<
    Partial<Record<keyof ClassFormState, string>>
  >({});

  const [taxRuleForm, setTaxRuleForm] = useState<TaxRuleFormState>(EMPTY_TAX_RULE_FORM);
  const [taxRuleFormErrors, setTaxRuleFormErrors] = useState<
    Partial<Record<keyof TaxRuleFormState, string>>
  >({});

  // ── Simulador ────────────────────────────────────────────────────────────────
  const [simSegment, setSimSegment] = useState('');
  const [simStratum, setSimStratum] = useState('');
  const [simResult, setSimResult] = useState<TaxClassification | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [cls, rules] = await Promise.all([
        commercialApi.getTaxClassifications(),
        commercialApi.getTaxRules(),
      ]);
      setClassifications(cls);
      setTaxRules(rules);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Clasificaciones ───────────────────────────────────────────────────────────

  function validateClassForm(): boolean {
    const errors: Partial<Record<keyof ClassFormState, string>> = {};
    if (!classForm.name.trim()) errors.name = 'El nombre es obligatorio.';
    else if (classForm.name.trim().length < 2) errors.name = 'Mínimo 2 caracteres.';
    setClassFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSaveClassification = async () => {
    if (!validateClassForm()) return;

    setIsSubmitting(true);
    setMutationError(null);
    try {
      if (editingClass) {
        // Modo edición: solo campos mutables (el código es inmutable)
        const dto: UpdateTaxClassificationDto = {
          name: classForm.name.trim(),
          ...(classForm.description.trim() && { description: classForm.description.trim() }),
          appliesIva: classForm.appliesIva,
          appliesRetefuente: classForm.appliesRetefuente,
          appliesReteIca: classForm.appliesReteIca,
          appliesEstampillas: classForm.appliesEstampillas,
        };
        await commercialApi.updateTaxClassification(editingClass.id, dto);
      } else {
        // Modo creación
        const dto: CreateTaxClassificationDto = {
          code: deriveClassificationCode(classForm.name.trim()),
          name: classForm.name.trim(),
          ...(classForm.description.trim() && { description: classForm.description.trim() }),
          appliesIva: classForm.appliesIva,
          appliesRetefuente: classForm.appliesRetefuente,
          appliesReteIca: classForm.appliesReteIca,
          appliesEstampillas: classForm.appliesEstampillas,
        };
        await commercialApi.createTaxClassification(dto);
      }
      const updated = await commercialApi.getTaxClassifications();
      setClassifications(updated);
      setIsClassModalOpen(false);
      setClassForm(EMPTY_CLASS_FORM);
      setClassFormErrors({});
      setEditingClass(null);
    } catch (error) {
      setMutationError(
        error instanceof ApiError ? error.message : 'No fue posible guardar la clasificación.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClassification = useCallback((cls: TaxClassification) => {
    setEditingClass(cls);
    setClassForm({
      name: cls.name,
      description: cls.description ?? '',
      appliesIva: cls.appliesIva,
      appliesRetefuente: cls.appliesRetefuente,
      appliesReteIca: cls.appliesReteIca,
      appliesEstampillas: cls.appliesEstampillas,
    });
    setClassFormErrors({});
    setMutationError(null);
    setIsClassModalOpen(true);
  }, []);

  const handleDeleteClassification = useCallback(async () => {
    if (!editingClass) return;
    if (
      !window.confirm(
        `Vas a eliminar permanentemente la clasificación "${editingClass.name}". Esta acción no se puede deshacer. ¿Deseas continuar?`,
      )
    ) {
      return;
    }

    setDeletingId(editingClass.id);
    setMutationError(null);
    try {
      await commercialApi.deleteTaxClassification(editingClass.id);
      const updated = await commercialApi.getTaxClassifications();
      setClassifications(updated);
      setIsClassModalOpen(false);
      setEditingClass(null);
      setClassForm(EMPTY_CLASS_FORM);
      setClassFormErrors({});
    } catch (error) {
      setMutationError(
        error instanceof ApiError ? error.message : 'No fue posible eliminar la clasificación.',
      );
    } finally {
      setDeletingId(null);
    }
  }, [editingClass]);

  const handleActivateClassification = useCallback(async (cls: TaxClassification) => {
    if (!window.confirm(`¿Activar nuevamente la clasificación "${cls.name}"?`)) return;

    setDeletingId(cls.id);
    setLoadError(null);
    try {
      await commercialApi.updateTaxClassification(cls.id, { isActive: true });
      const updated = await commercialApi.getTaxClassifications();
      setClassifications(updated);
    } catch (error) {
      const msg =
        error instanceof ApiError ? error.message : 'No fue posible activar la clasificación.';
      setLoadError(msg);
    } finally {
      setDeletingId(null);
    }
  }, []);

  // ── Reglas tributarias ────────────────────────────────────────────────────────

  function validateTaxRuleForm(): boolean {
    const errors: Partial<Record<keyof TaxRuleFormState, string>> = {};
    if (!taxRuleForm.taxClassificationId)
      errors.taxClassificationId = 'Selecciona una clasificación.';
    if (!taxRuleForm.taxType) errors.taxType = 'Selecciona el tipo de impuesto.';
    if (!taxRuleForm.ratePercentage.trim()) {
      errors.ratePercentage = 'La tasa es obligatoria.';
    } else {
      const rate = Number(taxRuleForm.ratePercentage);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        errors.ratePercentage = 'La tasa debe ser entre 0 y 100.';
      }
    }

    const sf = taxRuleForm.stratumFrom !== '' ? Number(taxRuleForm.stratumFrom) : null;
    const st = taxRuleForm.stratumTo !== '' ? Number(taxRuleForm.stratumTo) : null;

    if (taxRuleForm.stratumFrom !== '' && (isNaN(sf!) || sf! < 1 || sf! > 6)) {
      errors.stratumFrom = 'Estrato debe ser entre 1 y 6.';
    }
    if (taxRuleForm.stratumTo !== '' && (isNaN(st!) || st! < 1 || st! > 6)) {
      errors.stratumTo = 'Estrato debe ser entre 1 y 6.';
    }
    if (sf !== null && st !== null && sf > st) {
      errors.stratumTo = 'El estrato hasta debe ser mayor o igual al desde.';
    }

    const prio = taxRuleForm.priority !== '' ? Number(taxRuleForm.priority) : 0;
    if (isNaN(prio) || prio < 0 || prio > 100) {
      errors.priority = 'La prioridad debe ser entre 0 y 100.';
    }

    setTaxRuleFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSaveTaxRule = async () => {
    if (!validateTaxRuleForm()) return;

    setIsSubmitting(true);
    setMutationError(null);
    try {
      if (editingRule) {
        // Modo edición
        const dto: UpdateTaxRuleDto = {
          taxClassificationId: taxRuleForm.taxClassificationId,
          taxType: taxRuleForm.taxType,
          ratePercentage: taxRuleForm.ratePercentage.trim(),
          ...(taxRuleForm.customerSegment && { customerSegment: taxRuleForm.customerSegment }),
          ...(taxRuleForm.stratumFrom !== '' && { stratumFrom: Number(taxRuleForm.stratumFrom) }),
          ...(taxRuleForm.stratumTo !== '' && { stratumTo: Number(taxRuleForm.stratumTo) }),
          priority: taxRuleForm.priority !== '' ? Number(taxRuleForm.priority) : 0,
        };
        await commercialApi.updateTaxRule(editingRule.id, dto);
      } else {
        // Modo creación
        const dto: CreateTaxRuleDto = {
          taxClassificationId: taxRuleForm.taxClassificationId,
          taxType: taxRuleForm.taxType,
          ratePercentage: taxRuleForm.ratePercentage.trim(),
          ...(taxRuleForm.customerSegment && { customerSegment: taxRuleForm.customerSegment }),
          ...(taxRuleForm.stratumFrom !== '' && { stratumFrom: Number(taxRuleForm.stratumFrom) }),
          ...(taxRuleForm.stratumTo !== '' && { stratumTo: Number(taxRuleForm.stratumTo) }),
          priority: taxRuleForm.priority !== '' ? Number(taxRuleForm.priority) : 0,
        };
        await commercialApi.createTaxRule(dto);
      }
      const updated = await commercialApi.getTaxRules();
      setTaxRules(updated);
      setIsRuleModalOpen(false);
      setTaxRuleForm(EMPTY_TAX_RULE_FORM);
      setTaxRuleFormErrors({});
      setEditingRule(null);
    } catch (error) {
      setMutationError(
        error instanceof ApiError ? error.message : 'No fue posible guardar la regla tributaria.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditRule = useCallback((rule: TaxRule) => {
    setEditingRule(rule);
    setTaxRuleForm({
      taxClassificationId: rule.taxClassificationId,
      taxType: rule.taxType,
      ratePercentage: rule.ratePercentage,
      customerSegment: rule.customerSegment ?? '',
      stratumFrom: rule.stratumFrom !== null ? String(rule.stratumFrom) : '',
      stratumTo: rule.stratumTo !== null ? String(rule.stratumTo) : '',
      priority: String(rule.priority),
    });
    setTaxRuleFormErrors({});
    setMutationError(null);
    setIsRuleModalOpen(true);
  }, []);

  const handleDeactivateTaxRule = useCallback(async (rule: TaxRule) => {
    if (!window.confirm('¿Desactivar esta regla tributaria?')) return;

    setDeletingId(rule.id);
    setLoadError(null);
    try {
      await commercialApi.deactivateTaxRule(rule.id);
      const updated = await commercialApi.getTaxRules();
      setTaxRules(updated);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleActivateTaxRule = useCallback(async (rule: TaxRule) => {
    if (!window.confirm('¿Activar nuevamente esta regla tributaria?')) return;

    setDeletingId(rule.id);
    setLoadError(null);
    try {
      await commercialApi.updateTaxRule(rule.id, { isActive: true });
      const updated = await commercialApi.getTaxRules();
      setTaxRules(updated);
    } catch (error) {
      setLoadError(mapLoadError(error));
    } finally {
      setDeletingId(null);
    }
  }, []);

  // ── Simulador ────────────────────────────────────────────────────────────────

  const handleSimulate = async () => {
    if (!simSegment) {
      setSimError('Selecciona un segmento para simular.');
      return;
    }

    setIsSimulating(true);
    setSimError(null);
    setSimResult(null);
    try {
      const dto: ResolveTaxDto = {
        segment: simSegment,
        ...(simStratum !== '' && { stratum: Number(simStratum) }),
      };
      const result = await commercialApi.resolveTaxClassification(dto);
      setSimResult(result);
    } catch (error) {
      setSimError(
        error instanceof ApiError
          ? error.message
          : 'No se encontró una regla tributaria para ese segmento.',
      );
    } finally {
      setIsSimulating(false);
    }
  };

  // Opciones de clasificación para el selector de reglas.
  const classificationOptions = classifications
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="space-y-6">
      {/* ══ Sección A: Clasificaciones tributarias ══════════════════════════════ */}
      <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Tributarias
              </p>
              <CardTitle className="mt-1 text-lg font-semibold">
                Clasificaciones tributarias
              </CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Agrupa los impuestos que aplican a cada tipo de cliente o producto del tenant.
              </p>
            </div>

            {canEdit && (
              <Button
                size="sm"
                onClick={() => {
                  setIsClassModalOpen(true);
                  setMutationError(null);
                }}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Nueva clasificación
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="h-28 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
          ) : loadError ? (
            <div className="flex items-start gap-3 rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] px-4 py-3 text-sm text-red-700 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>{loadError}</p>
            </div>
          ) : classifications.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 dark:border-dark-border dark:text-gray-300">
              No hay clasificaciones configuradas. Crea la primera para habilitar las reglas
              tributarias.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[24px] border border-gray-200 dark:border-dark-border">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
                  <tr>
                    <th className={tableHeadClass}>Nombre</th>
                    <th className={`${tableHeadClass} text-center`}>IVA</th>
                    <th className={`${tableHeadClass} text-center`}>Retef.</th>
                    <th className={`${tableHeadClass} text-center`}>ReteICA</th>
                    <th className={`${tableHeadClass} text-center`}>Estampillas</th>
                    <th className={tableHeadClass}>Sistema</th>
                    {canEdit && <th className={tableHeadClass}>Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                  {classifications.map((cls) => (
                    <tr key={cls.id}>
                      <td className={cellClass}>
                        <p className="font-medium text-gray-800 dark:text-gray-100">{cls.name}</p>
                        {cls.description && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {cls.description}
                          </p>
                        )}
                      </td>
                      <td className={`${cellClass} text-center`}>
                        <BoolIcon value={cls.appliesIva} />
                      </td>
                      <td className={`${cellClass} text-center`}>
                        <BoolIcon value={cls.appliesRetefuente} />
                      </td>
                      <td className={`${cellClass} text-center`}>
                        <BoolIcon value={cls.appliesReteIca} />
                      </td>
                      <td className={`${cellClass} text-center`}>
                        <BoolIcon value={cls.appliesEstampillas} />
                      </td>
                      <td className={cellClass}>
                        {cls.isSystem && (
                          <Badge variant="neutral" className="rounded-full px-2 py-0.5 text-[11px]">
                            Base del sistema
                          </Badge>
                        )}
                      </td>
                      {canEdit && (
                        <td className={cellClass}>
                          <div className="flex items-center gap-3">
                            {cls.isActive && (
                              <button
                                type="button"
                                onClick={() => handleEditClassification(cls)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-iwana-primary transition-colors hover:bg-iwana-primary/10 hover:text-iwana-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
                                aria-label={`Editar clasificación ${cls.name}`}
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                            {!cls.isActive && (
                              <button
                                type="button"
                                disabled={deletingId === cls.id}
                                onClick={() => void handleActivateClassification(cls)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 dark:hover:bg-emerald-900/20"
                                aria-label={`Activar clasificación ${cls.name}`}
                                title="Activar"
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
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
      </Card>

      {/* ══ Sección B: Reglas de asignación ═════════════════════════════════════ */}
      <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">Reglas de asignación</CardTitle>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Define qué clasificación aplica según segmento y estrato del cliente.
              </p>
            </div>

            {canEdit && (
              <Button
                size="sm"
                onClick={() => {
                  setIsRuleModalOpen(true);
                  setMutationError(null);
                }}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Nueva regla tributaria
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="h-20 animate-pulse rounded-[24px] bg-gray-100 dark:bg-dark-surface-3" />
          ) : taxRules.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 dark:border-dark-border dark:text-gray-300">
              No hay reglas de asignación configuradas.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[24px] border border-gray-200 dark:border-dark-border">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-[#f6f8f4] dark:bg-dark-surface-2">
                  <tr>
                    <th className={tableHeadClass}>Clasificación</th>
                    <th className={tableHeadClass}>Segmento</th>
                    <th className={tableHeadClass}>Estrato desde</th>
                    <th className={tableHeadClass}>Estrato hasta</th>
                    <th className={tableHeadClass}>Prioridad</th>
                    <th className={tableHeadClass}>Estado</th>
                    {canEdit && <th className={tableHeadClass}>Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2/80">
                  {taxRules.map((rule) => (
                    <tr key={rule.id}>
                      <td className={cellClass}>
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {rule.taxClassification?.name ?? rule.taxClassificationId}
                        </span>
                      </td>
                      <td className={cellClass}>
                        {rule.customerSegment ? (
                          (SEGMENT_LABELS[rule.customerSegment] ?? rule.customerSegment)
                        ) : (
                          <span className="text-gray-400">Todos</span>
                        )}
                      </td>
                      <td className={cellClass}>
                        {rule.stratumFrom !== null ? (
                          rule.stratumFrom
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={cellClass}>
                        {rule.stratumTo !== null ? (
                          rule.stratumTo
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className={cellClass}>{rule.priority}</td>
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
                            {rule.isActive && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleEditRule(rule)}
                                  className="inline-flex items-center gap-1 text-sm font-medium text-iwana-primary transition-colors hover:text-iwana-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
                                  aria-label="Editar regla tributaria"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === rule.id}
                                  onClick={() => handleDeactivateTaxRule(rule)}
                                  className="inline-flex items-center gap-1 text-sm font-medium text-red-700 transition-colors hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
                                  aria-label="Desactivar regla tributaria"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                  Desactivar
                                </button>
                              </>
                            )}
                            {!rule.isActive && (
                              <button
                                type="button"
                                disabled={deletingId === rule.id}
                                onClick={() => handleActivateTaxRule(rule)}
                                className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 transition-colors hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
                                aria-label="Activar regla tributaria"
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Activar
                              </button>
                            )}
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
      </Card>

      {/* ══ Sección C: Simulador ═════════════════════════════════════════════════ */}
      <Card className="rounded-[28px] border border-white/70 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical
              className="h-5 w-5 text-iwana-secondary-700 dark:text-iwana-secondary-400"
              aria-hidden="true"
            />
            <CardTitle className="text-base font-semibold">Simular clasificación</CardTitle>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Verifica qué clasificación tributaria aplica a un segmento y estrato dados.
          </p>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px] flex-1">
              <Select
                label="Segmento"
                id="sim-segment"
                value={simSegment}
                onChange={(e) => {
                  setSimSegment(e.target.value);
                  setSimResult(null);
                  setSimError(null);
                }}
                options={SEGMENT_OPTIONS}
                placeholder="Selecciona segmento..."
                disabled={isSimulating}
              />
            </div>

            <div className="min-w-[140px] flex-1">
              <label
                htmlFor="sim-stratum"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                Estrato (opcional)
              </label>
              <input
                id="sim-stratum"
                type="number"
                min={1}
                max={6}
                value={simStratum}
                onChange={(e) => {
                  setSimStratum(e.target.value);
                  setSimResult(null);
                  setSimError(null);
                }}
                disabled={isSimulating}
                placeholder="1–6"
                className={inputBaseClass}
              />
            </div>

            <Button
              onClick={handleSimulate}
              disabled={isSimulating || !simSegment}
              className="shrink-0"
            >
              {isSimulating ? 'Simulando...' : 'Simular'}
            </Button>
          </div>

          {/* Resultado del simulador */}
          {simError && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{simError}</p>
            </div>
          )}

          {simResult && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 rounded-2xl border border-green-200/80 bg-green-50/80 px-4 py-3 dark:border-green-800/60 dark:bg-green-900/20"
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {simResult.name}
              </p>
              {simResult.description && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {simResult.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {simResult.appliesIva && (
                  <Badge variant="success" className="rounded-full px-2 py-0.5 text-[11px]">
                    IVA
                  </Badge>
                )}
                {simResult.appliesRetefuente && (
                  <Badge variant="success" className="rounded-full px-2 py-0.5 text-[11px]">
                    Retef.
                  </Badge>
                )}
                {simResult.appliesReteIca && (
                  <Badge variant="success" className="rounded-full px-2 py-0.5 text-[11px]">
                    ReteICA
                  </Badge>
                )}
                {simResult.appliesEstampillas && (
                  <Badge variant="success" className="rounded-full px-2 py-0.5 text-[11px]">
                    Estampillas
                  </Badge>
                )}
                {!simResult.appliesIva &&
                  !simResult.appliesRetefuente &&
                  !simResult.appliesReteIca &&
                  !simResult.appliesEstampillas && (
                    <span className="text-xs text-gray-500">Sin impuestos aplicables.</span>
                  )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modal: clasificación tributaria (crear/editar) ─────────────────────── */}
      <Dialog
        open={isClassModalOpen}
        onOpenChange={(open) => {
          setIsClassModalOpen(open);
          if (!open) {
            setClassForm(EMPTY_CLASS_FORM);
            setClassFormErrors({});
            setMutationError(null);
            setEditingClass(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingClass ? 'Editar clasificación tributaria' : 'Nueva clasificación tributaria'}
            </DialogTitle>
            <DialogDescription>
              {editingClass
                ? `Modifica los datos de "${editingClass.name}". El código interno no se puede cambiar.`
                : 'Define los impuestos que aplican a este tipo de cliente o producto.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              label="Nombre"
              id="class-name"
              value={classForm.name}
              onChange={(e) => setClassForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Régimen común con IVA"
              disabled={isSubmitting}
              error={classFormErrors.name}
            />

            {/* Código auto-derivado (solo visible en creación; inmutable en edición). */}
            {editingClass ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Código interno:{' '}
                <span className="font-mono font-medium text-gray-600 dark:text-gray-300">
                  {editingClass.code}
                </span>{' '}
                <span className="italic">(no editable)</span>
              </p>
            ) : classForm.name.trim() ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Código interno:{' '}
                <span className="font-mono font-medium text-gray-600 dark:text-gray-300">
                  {deriveClassificationCode(classForm.name.trim())}
                </span>
              </p>
            ) : null}

            <div>
              <label
                htmlFor="class-description"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
              >
                Descripción (opcional)
              </label>
              <textarea
                id="class-description"
                rows={2}
                value={classForm.description}
                onChange={(e) => setClassForm((prev) => ({ ...prev, description: e.target.value }))}
                disabled={isSubmitting}
                placeholder="Breve descripción del uso de esta clasificación..."
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100"
              />
            </div>

            {/* Flags de impuestos */}
            <fieldset className="space-y-2 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
              <legend className="px-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                Impuestos aplicables
              </legend>
              {(
                [
                  { key: 'appliesIva', label: 'IVA' },
                  { key: 'appliesRetefuente', label: 'Retención en la fuente' },
                  { key: 'appliesReteIca', label: 'ReteICA' },
                  { key: 'appliesEstampillas', label: 'Estampillas' },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={classForm[key]}
                    onChange={(e) => setClassForm((prev) => ({ ...prev, [key]: e.target.checked }))}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-gray-300 accent-iwana-secondary focus:ring-2 focus:ring-iwana-secondary/30"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
                </label>
              ))}
            </fieldset>

            {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

            {editingClass && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300">
                Eliminar quitará permanentemente esta clasificación.
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              {editingClass ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteClassification()}
                  disabled={isSubmitting || deletingId === editingClass.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-red-700 transition-colors hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 dark:hover:bg-red-900/20"
                  aria-label={`Eliminar clasificación ${editingClass.name}`}
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <span />
              )}
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button onClick={handleSaveClassification} disabled={isSubmitting}>
                {isSubmitting
                  ? 'Guardando...'
                  : editingClass
                    ? 'Guardar cambios'
                    : 'Crear clasificación'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: regla tributaria (crear/editar) ───────────────────────────── */}
      <Dialog
        open={isRuleModalOpen}
        onOpenChange={(open) => {
          setIsRuleModalOpen(open);
          if (!open) {
            setTaxRuleForm(EMPTY_TAX_RULE_FORM);
            setTaxRuleFormErrors({});
            setMutationError(null);
            setEditingRule(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Editar regla tributaria' : 'Nueva regla tributaria'}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? 'Modifica los parámetros de esta regla de asignación.'
                : 'Asocia una clasificación a un segmento y rango de estrato para la resolución automática.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select
              label="Clasificación tributaria"
              id="rule-classification"
              value={taxRuleForm.taxClassificationId}
              onChange={(e) =>
                setTaxRuleForm((prev) => ({ ...prev, taxClassificationId: e.target.value }))
              }
              options={classificationOptions}
              placeholder="Selecciona clasificación..."
              {...(taxRuleFormErrors.taxClassificationId && {
                error: taxRuleFormErrors.taxClassificationId,
              })}
              disabled={isSubmitting}
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Tipo de impuesto"
                id="rule-tax-type"
                value={taxRuleForm.taxType}
                onChange={(e) => setTaxRuleForm((prev) => ({ ...prev, taxType: e.target.value }))}
                options={TAX_TYPE_OPTIONS}
                placeholder="Selecciona tipo..."
                {...(taxRuleFormErrors.taxType && { error: taxRuleFormErrors.taxType })}
                disabled={isSubmitting}
              />
              <Input
                label="Tasa (%)"
                id="rule-rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={taxRuleForm.ratePercentage}
                onChange={(e) =>
                  setTaxRuleForm((prev) => ({ ...prev, ratePercentage: e.target.value }))
                }
                placeholder="19.00"
                disabled={isSubmitting}
                error={taxRuleFormErrors.ratePercentage}
              />
            </div>

            <Select
              label="Segmento (opcional)"
              id="rule-segment"
              value={taxRuleForm.customerSegment}
              onChange={(e) =>
                setTaxRuleForm((prev) => ({ ...prev, customerSegment: e.target.value }))
              }
              options={[{ value: '', label: 'Todos los segmentos' }, ...SEGMENT_OPTIONS]}
              placeholder="Todos los segmentos"
              disabled={isSubmitting}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Estrato desde (opc.)"
                id="rule-stratum-from"
                type="number"
                min={1}
                max={6}
                value={taxRuleForm.stratumFrom}
                onChange={(e) =>
                  setTaxRuleForm((prev) => ({ ...prev, stratumFrom: e.target.value }))
                }
                placeholder="1"
                disabled={isSubmitting}
                error={taxRuleFormErrors.stratumFrom}
              />
              <Input
                label="Estrato hasta (opc.)"
                id="rule-stratum-to"
                type="number"
                min={1}
                max={6}
                value={taxRuleForm.stratumTo}
                onChange={(e) => setTaxRuleForm((prev) => ({ ...prev, stratumTo: e.target.value }))}
                placeholder="6"
                disabled={isSubmitting}
                error={taxRuleFormErrors.stratumTo}
              />
            </div>

            <Input
              label="Prioridad (0–100)"
              id="rule-priority"
              type="number"
              min={0}
              max={100}
              value={taxRuleForm.priority}
              onChange={(e) => setTaxRuleForm((prev) => ({ ...prev, priority: e.target.value }))}
              placeholder="0"
              disabled={isSubmitting}
              error={taxRuleFormErrors.priority}
            />

            {mutationError && <p className="text-sm text-red-600">{mutationError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button onClick={handleSaveTaxRule} disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingRule ? 'Guardar cambios' : 'Crear regla'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
