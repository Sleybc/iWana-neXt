'use client';

import { useEffect, useMemo, useState } from 'react';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@iwana/ui';
import type {
  CreateStockLocationDto,
  StockLocationRecord,
  UpdateStockLocationDto,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { getStockLocationStatusLabel, getStockLocationTypeLabel } from './inventory-labels';

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StockLocationFormValues {
  code: string;
  name: string;
  type: StockLocationType;
  status: StockLocationStatus;
  responsibleRefId: string;
  maxCapacity: string;
}

interface StockLocationFormDialogProps {
  open: boolean;
  location?: StockLocationRecord | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: CreateStockLocationDto) => Promise<void>;
  onUpdate: (id: string, payload: UpdateStockLocationDto) => Promise<void>;
}

function buildInitialValues(location?: StockLocationRecord | null): StockLocationFormValues {
  return {
    code: location?.code ?? '',
    name: location?.name ?? '',
    type: location?.type ?? StockLocationType.MAIN_WAREHOUSE,
    status: location?.status ?? StockLocationStatus.ACTIVE,
    responsibleRefId: location?.responsibleRefId ?? '',
    maxCapacity: location?.maxCapacity ?? '',
  };
}

export function StockLocationFormDialog({
  open,
  location,
  isSubmitting,
  error,
  onClose,
  onCreate,
  onUpdate,
}: StockLocationFormDialogProps) {
  const [values, setValues] = useState<StockLocationFormValues>(buildInitialValues(location));
  const isEditing = Boolean(location);
  const selectedType = values.type;
  const requiresResponsible =
    values.status === StockLocationStatus.ACTIVE && MOBILE_LOCATION_TYPES.has(selectedType);
  const normalizedResponsibleRefId = values.responsibleRefId.trim();
  const hasResponsibleValue = normalizedResponsibleRefId.length > 0;
  const hasValidResponsibleRefId =
    !hasResponsibleValue || UUID_PATTERN.test(normalizedResponsibleRefId);

  useEffect(() => {
    if (!open) {
      setValues(buildInitialValues(location));
      return;
    }

    setValues(buildInitialValues(location));
  }, [location, open]);

  const submitDisabled = useMemo(() => {
    if (!values.name.trim()) {
      return true;
    }

    if (!isEditing && !values.code.trim()) {
      return true;
    }

    if (requiresResponsible && !hasResponsibleValue) {
      return true;
    }

    if (!hasValidResponsibleRefId) {
      return true;
    }

    if (values.maxCapacity.trim() && Number(values.maxCapacity) < 0) {
      return true;
    }

    return false;
  }, [
    hasResponsibleValue,
    hasValidResponsibleRefId,
    isEditing,
    requiresResponsible,
    values.code,
    values.maxCapacity,
    values.name,
  ]);

  async function handleSubmit() {
    const normalizedResponsible = normalizedResponsibleRefId || null;
    const normalizedCapacity = values.maxCapacity.trim() ? Number(values.maxCapacity) : null;

    if (isEditing && location) {
      await onUpdate(location.id, {
        name: values.name.trim(),
        status: values.status,
        responsibleRefId: normalizedResponsible,
        maxCapacity: normalizedCapacity,
      });
      return;
    }

    await onCreate({
      code: values.code.trim(),
      name: values.name.trim(),
      type: values.type,
      status: values.status,
      responsibleRefId: normalizedResponsible,
      maxCapacity: normalizedCapacity,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar bodega' : 'Crear bodega'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {isEditing ? (
              <>
                <Input label="Código" value={values.code} readOnly />
                <Input label="Tipo" value={getStockLocationTypeLabel(values.type)} readOnly />
              </>
            ) : (
              <>
                <Input
                  label="Código"
                  value={values.code}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, code: event.target.value }))
                  }
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                    Tipo
                  </span>
                  <select
                    value={values.type}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        type: event.target.value as StockLocationType,
                      }))
                    }
                    className={fieldClassName}
                  >
                    {Object.values(StockLocationType).map((type) => (
                      <option key={type} value={type}>
                        {getStockLocationTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <Input
              label="Nombre"
              value={values.name}
              onChange={(event) =>
                setValues((current) => ({ ...current, name: event.target.value }))
              }
            />

            <label className="space-y-1 text-sm">
              <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">
                Estado
              </span>
              <select
                value={values.status}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as StockLocationStatus,
                  }))
                }
                className={fieldClassName}
              >
                {Object.values(StockLocationStatus).map((status) => (
                  <option key={status} value={status}>
                    {getStockLocationStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <Input
              label="Responsable operativo"
              value={values.responsibleRefId}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  responsibleRefId: event.target.value,
                }))
              }
              helperText={
                !hasValidResponsibleRefId
                  ? 'Debe ser un UUID válido del responsable.'
                  : requiresResponsible
                    ? 'Obligatorio para custodias móviles activas. Usa el UUID del responsable.'
                    : 'Opcional para bodegas fijas o archivadas. Si lo envías, debe ser UUID.'
              }
            />

            <Input
              label="Capacidad máxima"
              type="number"
              min="0"
              step="0.01"
              value={values.maxCapacity}
              onChange={(event) =>
                setValues((current) => ({ ...current, maxCapacity: event.target.value }))
              }
              helperText="Déjalo vacío si la bodega no opera con tope visible."
            />
          </div>

          {error ? (
            <PortalAlert
              variant="error"
              title={
                isEditing ? 'No fue posible actualizar la bodega' : 'No fue posible crear la bodega'
              }
              description={error}
            />
          ) : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              loading={isSubmitting}
              disabled={submitDisabled}
              onClick={() => void handleSubmit()}
            >
              {isEditing ? 'Guardar cambios' : 'Crear bodega'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
