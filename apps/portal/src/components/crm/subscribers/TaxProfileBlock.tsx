'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormStatus,
} from '@iwana/ui';
import { Check, Plus, Pencil, Receipt, X } from 'lucide-react';
import { TaxCategory } from '@iwana/shared';
import {
  ApiError,
  COMMERCIAL_PICKER_LIMIT,
  commercialApi,
  type SubscriberTaxProfileSnapshot,
  type TaxAssignmentSnapshot,
  type TaxDefinition,
  subscriberTaxApi,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';

// ── Constantes de UI ──────────────────────────────────────────────────────────

function formatReviewDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const ASSIGNMENT_STATUS_META: Record<string, { label: string; dotClass: string }> = {
  SUGGESTED: { label: 'Sugerido', dotClass: 'bg-amber-400' },
  CONFIRMED: { label: 'Confirmado', dotClass: 'bg-emerald-500' },
  MANUAL_ADJUSTMENT: { label: 'Ajuste manual', dotClass: 'bg-iwana-primary' },
};

const TREATMENT_LABELS: Record<string, string> = {
  STANDARD: 'Estándar',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
  FIXED: 'Tasa fija',
};

const CATEGORY_LABELS: Record<string, string> = {
  VAT: 'IVA',
  WITHHOLDING: 'Retención',
  STAMP: 'Estampilla',
  MUNICIPAL: 'Municipal',
  OTHER: 'Otro',
};

// ── Modal: Agregar tributos del catálogo ─────────────────────────────────────

interface AddTributosModalProps {
  open: boolean;
  onClose: () => void;
  subscriberId: string;
  existingAssignments: TaxAssignmentSnapshot[];
  onSaved: (profile: SubscriberTaxProfileSnapshot) => void;
}

function AddTributosModal({
  open,
  onClose,
  subscriberId,
  existingAssignments,
  onSaved,
}: AddTributosModalProps) {
  const [catalog, setCatalog] = useState<TaxDefinition[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const assignedIds = new Set(existingAssignments.map((a) => a.taxDefinitionId));

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setErrorMsg(null);
    setLoadingCatalog(true);
    commercialApi
      .listTaxDefinitions({ isActive: true, limit: COMMERCIAL_PICKER_LIMIT })
      .then((res) =>
        setCatalog(res.data.filter((definition) => definition.category !== TaxCategory.VAT)),
      )
      .catch(() => setErrorMsg('No fue posible cargar el catálogo de tributos.'))
      .finally(() => setLoadingCatalog(false));
  }, [open]);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const existingPayloads = existingAssignments.map((a) => ({
        taxDefinitionId: a.taxDefinitionId,
        status: a.status,
        ...(a.treatment ? { treatment: a.treatment } : {}),
        ...(a.effectiveRate != null
          ? { effectiveRate: parseFloat(a.effectiveRate), rateSource: a.rateSource }
          : {}),
        ...(a.reason ? { reason: a.reason } : {}),
      }));

      const newPayloads = catalog
        .filter((d) => selected.has(d.id) && !assignedIds.has(d.id))
        .map((d) => ({
          taxDefinitionId: d.id,
          status: 'SUGGESTED' as const,
          treatment: d.treatment,
          ...(d.baseRate != null
            ? { effectiveRate: parseFloat(d.baseRate), rateSource: 'CATALOG' as const }
            : {}),
        }));

      const result = await subscriberTaxApi.saveAssignments(subscriberId, {
        assignments: [...existingPayloads, ...newPayloads],
      });
      onSaved(result);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Error al guardar los tributos.');
    } finally {
      setSaving(false);
    }
  };

  const byCategory = catalog.reduce<Record<string, TaxDefinition[]>>((acc, d) => {
    const group = acc[d.category] ?? [];
    group.push(d);
    acc[d.category] = group;
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar tributos</DialogTitle>
          <DialogDescription>
            Selecciona los tributos que aplican a este suscriptor. Los ya asignados están marcados y
            no se modifican.
          </DialogDescription>
        </DialogHeader>

        {loadingCatalog && (
          <div role="status" aria-label="Cargando catálogo de tributos" className="space-y-3 py-4">
            <span className="sr-only">Cargando catálogo…</span>
            <PortalSkeletonBlock className="h-10 rounded-xl" />
            <PortalSkeletonBlock className="h-10 rounded-xl" />
          </div>
        )}

        <FormStatus status={errorMsg ? 'error' : 'idle'} message={errorMsg ?? undefined} />

        {!loadingCatalog && !errorMsg && catalog.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-400">
            No hay otros tributos activos en el catálogo. Créalos en{' '}
            <span className="font-medium">Configuración → Reglas</span>.
          </p>
        )}

        {!loadingCatalog && catalog.length > 0 && (
          <div className="flex flex-col gap-4">
            {Object.entries(byCategory).map(([category, items]) => (
              <div key={category}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-400">
                  {CATEGORY_LABELS[category] ?? category}
                </p>
                <ul className="flex flex-col gap-1">
                  {items.map((d) => {
                    const alreadyAssigned = assignedIds.has(d.id);
                    const isChecked = alreadyAssigned || selected.has(d.id);
                    return (
                      <li key={d.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                            alreadyAssigned
                              ? 'cursor-default border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-900/10'
                              : isChecked
                                ? 'border-iwana-primary/30 bg-iwana-primary/5 dark:border-iwana-primary/40 dark:bg-iwana-primary/10'
                                : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-iwana-primary"
                            checked={isChecked}
                            disabled={alreadyAssigned}
                            onChange={() => toggleItem(d.id)}
                          />
                          <div className="flex flex-1 flex-col gap-0.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {d.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {TREATMENT_LABELS[d.treatment] ?? d.treatment}
                              {d.baseRate != null && ` · ${d.baseRate}%`}
                              {d.notes && ` · ${d.notes}`}
                            </span>
                          </div>
                          {alreadyAssigned && (
                            <span className="shrink-0 self-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                              Ya asignado
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-surface-3"
            >
              Cancelar
            </button>
          </DialogClose>
          <Button
            loading={saving}
            disabled={saving || selected.size === 0}
            onClick={() => void handleSave()}
            className="min-h-11"
          >
            {!saving && <Check className="h-4 w-4" aria-hidden />}
            {selected.size > 0 ? `Agregar (${selected.size})` : 'Agregar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Fila de asignación ────────────────────────────────────────────────────────

interface AssignmentRowProps {
  assignment: TaxAssignmentSnapshot;
  subscriberId: string;
  onUpdated: (profile: SubscriberTaxProfileSnapshot) => void;
}

function AssignmentRow({ assignment, subscriberId, onUpdated }: AssignmentRowProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [savingConfirm, setSavingConfirm] = useState(false);
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [manualRate, setManualRate] = useState(assignment.effectiveRate ?? '');
  const [reason, setReason] = useState('');

  const statusMeta =
    ASSIGNMENT_STATUS_META[assignment.status] ?? ASSIGNMENT_STATUS_META['SUGGESTED']!;
  const treatmentLabel =
    TREATMENT_LABELS[assignment.treatment ?? ''] ?? assignment.treatment ?? '—';

  const handleConfirm = useCallback(async () => {
    setSavingConfirm(true);
    try {
      const result = await subscriberTaxApi.updateAssignment(subscriberId, assignment.id, {
        status: 'CONFIRMED',
      });
      onUpdated(result);
    } catch {
      /* mantiene estado previo */
    } finally {
      setSavingConfirm(false);
    }
  }, [subscriberId, assignment.id, onUpdated]);

  const handleSaveAdjust = useCallback(async () => {
    setSavingAdjust(true);
    try {
      const rateValue = manualRate.trim() !== '' ? parseFloat(manualRate) : null;
      const result = await subscriberTaxApi.updateAssignment(subscriberId, assignment.id, {
        status: 'MANUAL_ADJUSTMENT',
        ...(rateValue != null ? { effectiveRate: rateValue, rateSource: 'MANUAL' as const } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onUpdated(result);
      setAdjusting(false);
    } catch {
      /* mantiene estado previo */
    } finally {
      setSavingAdjust(false);
    }
  }, [subscriberId, assignment.id, manualRate, reason, onUpdated]);

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-gray-100 px-4 py-3 dark:border-dark-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${statusMeta.dotClass}`}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {assignment.taxName}
            </span>
          </div>
          <div className="ml-4 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span>Tratamiento: {treatmentLabel}</span>
            {assignment.effectiveRate != null && (
              <span>Tasa efectiva: {assignment.effectiveRate}%</span>
            )}
            <span>{statusMeta.label}</span>
          </div>
          {assignment.reason && (
            <p className="ml-4 mt-0.5 text-xs italic text-gray-400 dark:text-gray-400">
              {assignment.reason}
            </p>
          )}
        </div>

        {assignment.status !== 'CONFIRMED' && !adjusting && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              loading={savingConfirm}
              aria-label={`Confirmar tributo ${assignment.taxName}`}
              disabled={savingConfirm}
              onClick={() => void handleConfirm()}
              className="min-h-11"
            >
              {!savingConfirm && <Check className="h-3 w-3" aria-hidden="true" />}
              Confirmar
            </Button>
            <button
              aria-label={`Ajustar tributo ${assignment.taxName}`}
              onClick={() => setAdjusting(true)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-surface-3"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Ajustar
            </button>
          </div>
        )}
      </div>

      {adjusting && (
        <div className="ml-4 mt-1 flex flex-col gap-2 rounded-xl border border-iwana-primary/20 bg-iwana-primary/3 px-3 py-2 dark:border-iwana-primary/30 dark:bg-iwana-primary/10">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Tasa efectiva (%)
              </span>
              <input
                aria-label="Tasa efectiva"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={manualRate}
                onChange={(e) => setManualRate(e.target.value)}
                className="w-28 rounded-lg border border-gray-300 px-2.5 py-1 text-sm dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white"
                placeholder="Ej: 19.00"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Motivo del ajuste
              </span>
              <input
                aria-label="Motivo del ajuste"
                type="text"
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-1 text-sm dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white"
                placeholder="Ej: Cliente gobierno con estampilla aprobada"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              loading={savingAdjust}
              aria-label="Guardar ajuste"
              disabled={savingAdjust}
              onClick={() => void handleSaveAdjust()}
              className="min-h-11"
            >
              {!savingAdjust && <Check className="h-3 w-3" aria-hidden="true" />}
              Guardar ajuste
            </Button>
            <button
              aria-label="Cancelar ajuste"
              onClick={() => {
                setAdjusting(false);
                setManualRate(assignment.effectiveRate ?? '');
                setReason('');
              }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-surface-3"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface TaxProfileBlockProps {
  subscriberId: string;
  onNavigateToServices: () => void;
}

/**
 * Bloque de perfil tributario del suscriptor para Suscriptor 360.
 *
 * Conserva los tributos distintos de IVA del perfil del suscriptor y permite
 * administrarlos desde el catálogo; el IVA se consulta en cada contrato.
 * Permite agregar tributos del catálogo vía checklist modal,
 * y confirmar o ajustar manualmente cada asignación.
 *
 * Ref: BT-TAXMVP-13, BT-TAXMVP-14, BT-TAXMVP-15
 */
export function TaxProfileBlock({ subscriberId, onNavigateToServices }: TaxProfileBlockProps) {
  const [profile, setProfile] = useState<SubscriberTaxProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // «Sin otros tributos» es una decisión explícita: deja el perfil revisado sin crear asignaciones.
  const confirmWithoutTaxes = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      setProfile(await subscriberTaxApi.confirmProfile(subscriberId));
    } catch (err) {
      setConfirmError(
        err instanceof ApiError && err.code === 'TAX_PROFILE_HAS_PENDING_ASSIGNMENTS'
          ? 'Confirma o ajusta los tributos sugeridos antes de marcar el perfil como revisado.'
          : 'No fue posible guardar la revisión. Intenta de nuevo.',
      );
    } finally {
      setConfirming(false);
    }
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await subscriberTaxApi.getProfile(subscriberId);
      setProfile(result);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No fue posible cargar el perfil tributario.',
      );
    } finally {
      setLoading(false);
    }
  }, [subscriberId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const visibleAssignments = useMemo(
    () =>
      profile?.assignments.filter((assignment) => assignment.taxCategory !== TaxCategory.VAT) ?? [],
    [profile],
  );

  // Sugeridos sin confirmar: es lo único que le pide una acción al operador. Sin tributos no hay
  // estado que mostrar (el perfil sin otros tributos es el caso normal, no un pendiente).
  const pendingCount = visibleAssignments.filter(
    (assignment) => assignment.status === 'SUGGESTED',
  ).length;

  const openAddModal = () => setShowAddModal(true);
  const addButton = (
    <Button
      type="button"
      variant="secondary"
      className="min-h-11 gap-1.5"
      aria-label="Agregar tributos del catálogo"
      onClick={openAddModal}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Agregar tributos
    </Button>
  );
  const ready = !loading && !error && profile;

  return (
    <>
      <PortalPanel
        as="section"
        labelled
        title="Otros tributos"
        titleAddon={
          ready && pendingCount > 0 ? (
            <Badge variant="warning">Por confirmar ({pendingCount})</Badge>
          ) : null
        }
        description={
          <>
            El IVA se define en cada contrato, en{' '}
            <button
              type="button"
              onClick={onNavigateToServices}
              className={`inline font-semibold text-iwana-primary underline underline-offset-2 dark:text-iwana-primary-300 ${interactiveFocusClassName}`}
            >
              Servicios
            </button>
            . Aquí se registran solo los otros tributos que le apliquen.
          </>
        }
        actions={ready && visibleAssignments.length > 0 ? addButton : undefined}
        busy={loading}
      >
        {loading ? (
          <div
            role="status"
            aria-label="Cargando perfil tributario"
            aria-busy="true"
            className="space-y-3"
          >
            <PortalSkeletonBlock className="h-16 rounded-2xl" />
            <PortalSkeletonBlock className="h-16 rounded-2xl" />
          </div>
        ) : null}

        {error ? (
          <PortalAlert
            variant="error"
            title="No fue posible cargar los tributos"
            description={error}
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadProfile()}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}

        {ready && visibleAssignments.length === 0 ? (
          <PortalEmptyState
            embedded
            icon={Receipt}
            title="Sin otros tributos"
            description={
              profile.profileStatus === 'CONFIGURED' && profile.confirmedAt ? (
                <>
                  Revisado: no le aplican otros tributos ({formatReviewDate(profile.confirmedAt)}).
                  Agrégalos si eso cambia.
                </>
              ) : (
                'Este suscriptor no tiene otros tributos. Confirma la revisión o agrégalos si le aplican.'
              )
            }
            action={
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {profile.profileStatus !== 'CONFIGURED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 gap-1.5"
                      loading={confirming}
                      onClick={() => void confirmWithoutTaxes()}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Confirmar sin otros tributos
                    </Button>
                  ) : null}
                  {addButton}
                </div>
                {confirmError ? (
                  <p role="alert" className="text-xs text-rose-600">
                    {confirmError}
                  </p>
                ) : null}
              </div>
            }
          />
        ) : null}

        {ready && visibleAssignments.length > 0 ? (
          <>
            <ul
              aria-label="Asignaciones tributarias del suscriptor"
              className="flex flex-col gap-2"
            >
              {visibleAssignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  assignment={assignment}
                  subscriberId={subscriberId}
                  onUpdated={setProfile}
                />
              ))}
            </ul>

            {profile.confirmedAt && pendingCount === 0 && (
              <p className="mt-3 text-right text-xs text-gray-500 dark:text-gray-400">
                Configurado el {formatReviewDate(profile.confirmedAt)}
              </p>
            )}
          </>
        ) : null}
      </PortalPanel>

      {ready ? (
        <AddTributosModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          subscriberId={subscriberId}
          existingAssignments={profile.assignments}
          onSaved={setProfile}
        />
      ) : null}
    </>
  );
}
