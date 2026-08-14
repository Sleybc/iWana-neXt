'use client';

import { useRef, type KeyboardEvent } from 'react';
import type {
  Control,
  FieldErrors,
  UseFormHandleSubmit,
  UseFormRegister,
  UseFormSetValue,
} from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { CheckCircle2, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select, cn } from '@iwana/ui';
import type { PlanCatalogItem } from '@/lib/api-client';
import {
  normalizeTechnologyName,
  type PlanFormValues,
  type SpeedMode,
} from '@/components/commercial/catalog/plan-catalog-helpers';
import {
  PortalAlert,
  PortalSidePeek,
  interactiveFocusClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';

const SPEED_MODE_OPTIONS = [
  { value: 'SYMMETRIC' as const, label: 'Simétrica' },
  { value: 'ASYMMETRIC' as const, label: 'Asimétrica' },
];

/** Radiogroup de modalidad de velocidad con navegación por teclado (roving tabIndex). */
function SpeedModeRadioGroup({
  value,
  onChange,
  disabled,
}: {
  value: SpeedMode;
  onChange: (value: SpeedMode) => void;
  disabled: boolean;
}) {
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = SPEED_MODE_OPTIONS.findIndex((option) => option.value === value);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % SPEED_MODE_OPTIONS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + SPEED_MODE_OPTIONS.length) % SPEED_MODE_OPTIONS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = SPEED_MODE_OPTIONS.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextOption = SPEED_MODE_OPTIONS[nextIndex];
    if (!nextOption) {
      return;
    }
    onChange(nextOption.value);
    radioRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby="plan-speed-mode-label"
      className={cn(portalModuleTabsTrackClassName, 'inline-flex w-fit gap-1 p-1')}
      onKeyDown={handleKeyDown}
    >
      {SPEED_MODE_OPTIONS.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            radioRefs.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            interactiveFocusClassName,
            value === option.value
              ? 'bg-iwana-primary text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface PlanCatalogFormPeekProps {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  editingPlan: PlanCatalogItem | null;
  editingPlanId: string | null;
  deletingPlanId: string | null;
  serverMessage: string | null;
  control: Control<PlanFormValues>;
  register: UseFormRegister<PlanFormValues>;
  handleSubmit: UseFormHandleSubmit<PlanFormValues>;
  setValue: UseFormSetValue<PlanFormValues>;
  onSubmit: (values: PlanFormValues) => Promise<void>;
  errors: FieldErrors<PlanFormValues>;
  isSubmitting: boolean;
  speedMode: SpeedMode;
  installationEnabled: boolean;
  selectTechnologyOptions: string[];
  effectiveTechnologyOptions: string[];
  technologiesInActivePlans: Set<string>;
  technologyDraft: string;
  setTechnologyDraft: (value: string) => void;
  editingTechnologyOriginal: string | null;
  setEditingTechnologyOriginal: (value: string | null) => void;
  editingTechnologyDraft: string;
  setEditingTechnologyDraft: (value: string) => void;
  onAddTechnology: () => void;
  onStartEditTechnology: (technology: string) => void;
  onSaveEditedTechnology: () => void;
  onDeleteTechnology: (technology: string) => void;
  onRequestDelete: () => void;
}

export function PlanCatalogFormPeek({
  open,
  onClose,
  canEdit,
  editingPlan,
  editingPlanId,
  deletingPlanId,
  serverMessage,
  control,
  register,
  handleSubmit,
  setValue,
  onSubmit,
  errors,
  isSubmitting,
  speedMode,
  installationEnabled,
  selectTechnologyOptions,
  effectiveTechnologyOptions,
  technologiesInActivePlans,
  technologyDraft,
  setTechnologyDraft,
  editingTechnologyOriginal,
  setEditingTechnologyOriginal,
  editingTechnologyDraft,
  setEditingTechnologyDraft,
  onAddTechnology,
  onStartEditTechnology,
  onSaveEditedTechnology,
  onDeleteTechnology,
  onRequestDelete,
}: PlanCatalogFormPeekProps) {
  return (
    <PortalSidePeek
      open={open}
      onClose={onClose}
      eyebrow="Catálogo comercial"
      title={editingPlan ? `Editar plan: ${editingPlan.name}` : 'Nuevo plan'}
      description={
        editingPlan
          ? 'Actualiza velocidad, precio e instalación del plan.'
          : 'Registra nombre, tecnología, velocidad y precio del plan.'
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting || deletingPlanId === editingPlanId}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="plan-catalog-form"
            loading={isSubmitting}
            disabled={!canEdit || isSubmitting}
          >
            {editingPlan ? 'Guardar cambios' : 'Crear plan'}
          </Button>
        </div>
      }
    >
      <form
        id="plan-catalog-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        {serverMessage ? (
          <PortalAlert
            variant="error"
            title={editingPlan ? 'No fue posible guardar el plan' : 'No fue posible crear el plan'}
            description={serverMessage}
          />
        ) : null}

        <section className="space-y-4" aria-labelledby="plan-section-identity">
          <p id="plan-section-identity" className="portal-eyebrow-muted">
            Identidad del plan
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              id="plan-name"
              label="Nombre del plan"
              disabled={!canEdit || isSubmitting}
              error={errors.name?.message}
              {...register('name')}
            />

            <Controller
              name="technology"
              control={control}
              render={({ field }) => (
                <Select
                  id="plan-technology"
                  label="Tecnología"
                  className="h-11"
                  disabled={!canEdit || isSubmitting}
                  name={field.name}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  {...(errors.technology?.message ? { error: errors.technology.message } : {})}
                >
                  {selectTechnologyOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              )}
            />
          </div>

          <details className="group rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
            <summary
              className={cn(
                'flex cursor-pointer list-none items-center justify-between gap-3',
                interactiveFocusClassName,
              )}
            >
              <div>
                <p className="portal-eyebrow-muted">Gestionar tecnologías</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {effectiveTechnologyOptions.length} en la lista · opcional
                </p>
              </div>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>

            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {effectiveTechnologyOptions.length === 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    No hay tecnologías registradas.
                  </span>
                )}

                {effectiveTechnologyOptions.map((technology) => {
                  const isEditing =
                    editingTechnologyOriginal?.toLowerCase() === technology.toLowerCase();
                  const isUsedByActivePlan = technologiesInActivePlans.has(
                    technology.toLowerCase(),
                  );

                  return (
                    <div
                      key={technology}
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs dark:border-dark-border dark:bg-dark-surface-3"
                    >
                      {isEditing ? (
                        <>
                          <input
                            aria-label={`Editar tecnología ${technology}`}
                            value={editingTechnologyDraft}
                            onChange={(event) => setEditingTechnologyDraft(event.target.value)}
                            disabled={!canEdit || isSubmitting}
                            className={cn(
                              'portal-input-surface h-7 w-28 px-2 text-xs text-gray-700 dark:text-gray-200',
                              interactiveFocusClassName,
                            )}
                          />
                          <button
                            type="button"
                            aria-label={`Guardar tecnología ${technology}`}
                            disabled={!canEdit || isSubmitting}
                            onClick={onSaveEditedTechnology}
                            className={cn(
                              'rounded-md p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/30',
                              interactiveFocusClassName,
                            )}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancelar edición de tecnología ${technology}`}
                            disabled={!canEdit || isSubmitting}
                            onClick={() => {
                              setEditingTechnologyOriginal(null);
                              setEditingTechnologyDraft('');
                            }}
                            className={cn(
                              'rounded-md px-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-dark-surface-2',
                              interactiveFocusClassName,
                            )}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canEdit || isSubmitting}
                            onClick={() =>
                              setValue('technology', technology, { shouldValidate: true })
                            }
                            className={cn(
                              'font-medium text-gray-700 hover:text-iwana-primary disabled:opacity-50 dark:text-gray-200',
                              interactiveFocusClassName,
                            )}
                            aria-label={`Usar tecnología ${technology}`}
                          >
                            {technology}
                          </button>
                          <button
                            type="button"
                            aria-label={`Editar tecnología ${technology}`}
                            disabled={!canEdit || isSubmitting}
                            onClick={() => onStartEditTechnology(technology)}
                            className={cn(
                              'rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-iwana-primary disabled:opacity-50 dark:text-gray-300 dark:hover:bg-dark-surface-2',
                              interactiveFocusClassName,
                            )}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Eliminar tecnología ${technology}`}
                            title={
                              isUsedByActivePlan
                                ? 'No se puede eliminar: hay planes activos usando esta tecnología.'
                                : 'Eliminar tecnología'
                            }
                            disabled={!canEdit || isSubmitting || isUsedByActivePlan}
                            onClick={() => onDeleteTechnology(technology)}
                            className={cn(
                              'rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-dark-surface-2',
                              interactiveFocusClassName,
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <Input
                  id="technology-new"
                  label="Nueva tecnología"
                  value={technologyDraft}
                  onChange={(event) => setTechnologyDraft(event.target.value)}
                  disabled={!canEdit || isSubmitting}
                  placeholder="Ej: EPON"
                  className="min-w-[220px] flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canEdit || isSubmitting || !normalizeTechnologyName(technologyDraft)}
                  onClick={onAddTechnology}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Agregar
                </Button>
              </div>
            </div>
          </details>
        </section>

        <section className="space-y-4" aria-labelledby="plan-section-speed">
          <p id="plan-section-speed" className="portal-eyebrow-muted">
            Velocidad
          </p>
          <Controller
            name="speedMode"
            control={control}
            render={({ field }) => (
              <div className="space-y-2">
                <p
                  id="plan-speed-mode-label"
                  className="text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Modalidad de velocidad
                </p>
                <SpeedModeRadioGroup
                  value={field.value}
                  onChange={field.onChange}
                  disabled={!canEdit || isSubmitting}
                />
              </div>
            )}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              id="download-speed"
              type="number"
              label="Velocidad de bajada (Mbps)"
              min={1}
              max={100000}
              disabled={!canEdit || isSubmitting}
              error={errors.downloadSpeedMbps?.message}
              {...register('downloadSpeedMbps', { valueAsNumber: true })}
            />
            <Input
              id="upload-speed"
              type="number"
              label="Velocidad de subida (Mbps)"
              min={1}
              max={100000}
              disabled={!canEdit || isSubmitting || speedMode === 'SYMMETRIC'}
              error={errors.uploadSpeedMbps?.message}
              {...register('uploadSpeedMbps', { valueAsNumber: true })}
            />
          </div>
        </section>

        <section className="space-y-4" aria-labelledby="plan-section-price">
          <p id="plan-section-price" className="portal-eyebrow-muted">
            Precio comercial
          </p>
          <Input
            id="base-price"
            type="number"
            min={0}
            step="1000"
            label="Precio base (COP)"
            disabled={!canEdit || isSubmitting}
            error={errors.basePrice?.message}
            {...register('basePrice', { valueAsNumber: true })}
          />
        </section>

        <section
          className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
          aria-labelledby="plan-section-installation"
        >
          <p id="plan-section-installation" className="portal-eyebrow-muted">
            Instalación
          </p>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              disabled={!canEdit || isSubmitting}
              className={cn(
                'h-4 w-4 rounded border-gray-300 accent-iwana-primary',
                interactiveFocusClassName,
              )}
              {...register('installationEnabled')}
            />
            Cobrar instalación
          </label>

          {installationEnabled && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Controller
                name="installationRule"
                control={control}
                render={({ field }) => (
                  <Select
                    id="installation-rule"
                    label="Regla de instalación"
                    className="h-11"
                    disabled={!canEdit || isSubmitting}
                    name={field.name}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    {...(errors.installationRule?.message
                      ? { error: errors.installationRule.message }
                      : {})}
                  >
                    <option value="ALWAYS">Siempre cobrar instalación</option>
                    <option value="ON_DEMAND">Cobrar instalación bajo demanda</option>
                    <option value="NEVER">Nunca cobrar instalación</option>
                  </Select>
                )}
              />

              <Input
                id="installation-fee"
                type="number"
                min={0}
                step="1000"
                label="Valor instalación (COP)"
                disabled={!canEdit || isSubmitting}
                error={errors.installationFee?.message}
                {...register('installationFee', { valueAsNumber: true })}
              />
            </div>
          )}
        </section>

        {editingPlan ? (
          <section
            className="space-y-3 border-t border-gray-200 pt-4 dark:border-dark-border"
            aria-labelledby="plan-section-danger"
          >
            <p id="plan-section-danger" className="portal-eyebrow-muted">
              Eliminar plan
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Eliminar el plan &quot;{editingPlan.name}&quot; es irreversible. Los clientes
              asociados no se eliminan pero perderán la referencia a este plan.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deletingPlanId === editingPlanId || !canEdit}
              onClick={onRequestDelete}
            >
              Eliminar este plan
            </Button>
          </section>
        ) : null}
      </form>
    </PortalSidePeek>
  );
}
