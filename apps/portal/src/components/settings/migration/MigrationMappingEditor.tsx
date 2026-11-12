'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@iwana/ui';
import {
  BILLING_PAYMENT_METHODS,
  migrationMappingTargetError,
  type MigrationMappingAction,
  type MigrationMappingKind,
  type MigrationPendingValue,
} from '@iwana/shared';
import { PortalAlert, portalFieldClassName } from '@/components/shared/portal-ui';
import { PAYMENT_METHODS } from '@/components/billing/billing-copy';
import { billingCyclesApi, commercialApi, migrationApi, subscriberTagsApi } from '@/lib/api-client';
import {
  MIGRATION_MAPPING_ACTION_LABELS,
  MIGRATION_MAPPING_KIND_LABELS,
  mappingActionsFor,
  migrationErrorMessage,
} from './migration-labels';

export interface MappingTargetOption {
  value: string;
  label: string;
}

export type MappingCatalogs = Record<MigrationMappingKind, MappingTargetOption[] | null>;

/**
 * Destinos de los catálogos reales: planes (MOD06), métodos de pago (MOD14), ciclos de CRM y
 * etiquetas del suscriptor. Solo se piden los tipos que el lote tiene pendientes.
 */
export async function loadMappingCatalogs(
  kinds: ReadonlySet<MigrationMappingKind>,
): Promise<MappingCatalogs> {
  const [plans, cycles, tags] = await Promise.all([
    kinds.has('PLAN') ? commercialApi.getPlans({ limit: 100, isActive: true }) : null,
    kinds.has('CICLO') ? billingCyclesApi.list() : null,
    kinds.has('ETIQUETA') ? subscriberTagsApi.list() : null,
  ]);
  return {
    PLAN: plans ? plans.data.map((plan) => ({ value: plan.id, label: plan.name })) : null,
    METODO_PAGO: BILLING_PAYMENT_METHODS.map((method) => ({
      value: method,
      label: PAYMENT_METHODS[method],
    })),
    CICLO: cycles
      ? cycles
          .filter((cycle) => cycle.active)
          .map((cycle) => ({
            value: String(cycle.cycleDay),
            label: `Día ${cycle.cycleDay} (corte el día ${cycle.cutoffDay})`,
          }))
      : null,
    ETIQUETA: tags ? tags.map((tag) => ({ value: tag.id, label: tag.name })) : null,
  };
}

interface MappingRowProps {
  value: MigrationPendingValue;
  options: MappingTargetOption[];
  onSaved: () => void;
}

function MappingRow({ value, options, onSaved }: MappingRowProps) {
  const id = useId();
  const actions = mappingActionsFor(value.kind);
  const [action, setAction] = useState<MigrationMappingAction>('EQUIVALE');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceLabel = value.externalLabel ?? value.externalValue;
  const targetRef = action === 'EQUIVALE' ? target || null : null;
  const invalid = migrationMappingTargetError(value.kind, action, targetRef) !== null;

  async function save() {
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await migrationApi.createMapping({
        kind: value.kind,
        externalValue: value.externalValue,
        externalLabel: value.externalLabel,
        action,
        targetRef,
      });
      onSaved();
    } catch (saveError) {
      setError(migrationErrorMessage(saveError, 'No pudimos guardar la equivalencia.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {MIGRATION_MAPPING_KIND_LABELS[value.kind]}: «{sourceLabel}»
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {value.occurrences === 1 ? '1 registro' : `${value.occurrences} registros`}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
        {actions.length > 1 ? (
          <div className="space-y-1">
            <label htmlFor={`${id}-accion`} className="text-sm text-gray-700 dark:text-gray-200">
              Qué hacer
            </label>
            <select
              id={`${id}-accion`}
              className={portalFieldClassName}
              value={action}
              disabled={saving}
              onChange={(event) => setAction(event.target.value as MigrationMappingAction)}
            >
              {actions.map((item) => (
                <option key={item} value={item}>
                  {MIGRATION_MAPPING_ACTION_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {action === 'EQUIVALE' ? (
          <div className="space-y-1">
            <label htmlFor={`${id}-destino`} className="text-sm text-gray-700 dark:text-gray-200">
              Equivale en iWana a
            </label>
            <select
              id={`${id}-destino`}
              className={portalFieldClassName}
              value={target}
              disabled={saving || options.length === 0}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value="">
                {options.length === 0 ? 'No hay opciones en el catálogo' : 'Elige una opción'}
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Button
          type="button"
          className="min-h-11"
          loading={saving}
          disabled={invalid}
          aria-label={`Guardar equivalencia de ${MIGRATION_MAPPING_KIND_LABELS[value.kind].toLowerCase()} «${sourceLabel}»`}
          onClick={() => void save()}
        >
          Guardar
        </Button>
      </div>
      {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
    </li>
  );
}

interface MigrationMappingEditorProps {
  pending: MigrationPendingValue[];
  onSaved: () => void;
}

/** Editor de equivalencias pendientes del lote (ADR-110 D4). */
export function MigrationMappingEditor({ pending, onSaved }: MigrationMappingEditorProps) {
  const [catalogs, setCatalogs] = useState<MappingCatalogs | null>(null);
  const [error, setError] = useState(false);
  const kindsKey = [...new Set(pending.map((item) => item.kind))].sort().join(',');

  useEffect(() => {
    let active = true;
    const kinds = new Set(kindsKey.split(',').filter(Boolean) as MigrationMappingKind[]);
    loadMappingCatalogs(kinds).then(
      (result) => {
        if (active) {
          setCatalogs(result);
          setError(false);
        }
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [kindsKey]);

  if (pending.length === 0) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Todos los valores del lote tienen equivalencia.
      </p>
    );
  }
  if (error) {
    return (
      <PortalAlert
        variant="error"
        title="No pudimos cargar los catálogos de iWana"
        description="Recarga la página para elegir las equivalencias."
      />
    );
  }
  if (!catalogs) {
    return (
      <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
        Cargando catálogos…
      </p>
    );
  }
  return (
    <ul
      aria-label="Equivalencias pendientes"
      className="divide-y divide-gray-100 dark:divide-dark-border"
    >
      {pending.map((value) => (
        <MappingRow
          key={`${value.kind}:${value.externalValue}`}
          value={value}
          options={catalogs[value.kind] ?? []}
          onSaved={onSaved}
        />
      ))}
    </ul>
  );
}
