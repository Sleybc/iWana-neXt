'use client';

import { useEffect, useMemo, useState } from 'react';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import type {
  CreateStockLocationDto,
  InternalUser,
  StockLocationRecord,
  UpdateStockLocationDto,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { buildInternalUserLabel, mapUsersToSelectOptions } from '@/lib/portal-user-options';
import { getStockLocationStatusLabel, getStockLocationTypeLabel } from './inventory-labels';
import { resolveNextStockLocationCode } from './inventory-location-code';

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

interface StockLocationFormValues {
  name: string;
  type: StockLocationType;
  status: StockLocationStatus;
  responsibleRefId: string;
  maxCapacity: string;
}

interface StockLocationFormDialogProps {
  open: boolean;
  location?: StockLocationRecord | null;
  existingLocations?: StockLocationRecord[];
  operationalUsers: InternalUser[];
  isLoadingUsers?: boolean;
  usersLoadError?: string | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: CreateStockLocationDto) => Promise<void>;
  onUpdate: (id: string, payload: UpdateStockLocationDto) => Promise<void>;
}

function buildInitialValues(location?: StockLocationRecord | null): StockLocationFormValues {
  return {
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
  existingLocations = [],
  operationalUsers,
  isLoadingUsers = false,
  usersLoadError = null,
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

  useEffect(() => {
    if (!open) {
      setValues(buildInitialValues(location));
      return;
    }

    setValues(buildInitialValues(location));
  }, [location, open]);

  const responsibleOptions = useMemo(() => {
    const emptyOption = requiresResponsible
      ? { value: '', label: 'Selecciona una persona' }
      : { value: '', label: 'Sin persona a cargo' };

    return mapUsersToSelectOptions(operationalUsers, emptyOption);
  }, [operationalUsers, requiresResponsible]);

  const selectedResponsibleLabel = useMemo(() => {
    if (!values.responsibleRefId) {
      return null;
    }

    const matchedUser = operationalUsers.find((user) => user.id === values.responsibleRefId);
    return matchedUser ? buildInternalUserLabel(matchedUser) : null;
  }, [operationalUsers, values.responsibleRefId]);

  const codePreview = useMemo(() => {
    if (isEditing) {
      return null;
    }

    return resolveNextStockLocationCode(
      existingLocations.map((entry) => entry.code),
      values.type,
    );
  }, [existingLocations, isEditing, values.type]);

  const submitDisabled = useMemo(() => {
    if (!values.name.trim()) {
      return true;
    }

    if (requiresResponsible && !values.responsibleRefId) {
      return true;
    }

    if (values.maxCapacity.trim() && Number(values.maxCapacity) < 0) {
      return true;
    }

    if (isLoadingUsers) {
      return true;
    }

    return false;
  }, [
    isLoadingUsers,
    requiresResponsible,
    values.maxCapacity,
    values.name,
    values.responsibleRefId,
  ]);

  async function handleSubmit() {
    const normalizedResponsible = values.responsibleRefId.trim() || null;
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
      name: values.name.trim(),
      type: values.type,
      status: values.status,
      responsibleRefId: normalizedResponsible,
      maxCapacity: normalizedCapacity,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        aria-labelledby="stock-location-form-dialog-title"
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <p className="portal-eyebrow">Bodegas</p>
          <DialogTitle id="stock-location-form-dialog-title" className="mt-1">
            {isEditing ? 'Editar bodega' : 'Crear bodega'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Cambia los datos de la bodega sin modificar su código ni su tipo.'
              : 'Cuéntanos cómo se usará esta bodega. El código se creará al guardarla.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {isEditing ? (
            <section aria-labelledby="stock-location-identification-heading" className="space-y-3">
              <h3 id="stock-location-identification-heading" className="portal-eyebrow">
                Datos básicos
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Código de bodega" value={location?.code ?? ''} readOnly />
                <Input label="Tipo" value={getStockLocationTypeLabel(values.type)} readOnly />
              </div>
            </section>
          ) : null}

          <section aria-labelledby="stock-location-operation-heading" className="space-y-4">
            <h3 id="stock-location-operation-heading" className="portal-eyebrow">
              Uso de la bodega
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              {!isEditing ? (
                <Select
                  label="Tipo"
                  className="md:col-span-2"
                  value={values.type}
                  options={Object.values(StockLocationType).map((type) => ({
                    value: type,
                    label: getStockLocationTypeLabel(type),
                  }))}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      type: event.target.value as StockLocationType,
                    }))
                  }
                />
              ) : null}

              <Input
                label="Nombre de la bodega"
                requiredIndicator
                autoFocus={!isEditing}
                value={values.name}
                onChange={(event) =>
                  setValues((current) => ({ ...current, name: event.target.value }))
                }
              />

              <Select
                label="Estado"
                value={values.status}
                options={Object.values(StockLocationStatus).map((status) => ({
                  value: status,
                  label: getStockLocationStatusLabel(status),
                }))}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    status: event.target.value as StockLocationStatus,
                  }))
                }
              />

              <Select
                label="Persona a cargo"
                className="md:col-span-2"
                value={values.responsibleRefId}
                options={responsibleOptions}
                disabled={isLoadingUsers}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    responsibleRefId: event.target.value,
                  }))
                }
                helperText={
                  usersLoadError
                    ? 'No fue posible cargar usuarios. Intenta cerrar y abrir el formulario.'
                    : isLoadingUsers
                      ? 'Cargando personas de la empresa…'
                      : requiresResponsible
                        ? 'Necesaria cuando el material queda en manos de un técnico o una cuadrilla.'
                        : 'Puedes dejarlo vacío si nadie queda a cargo.'
                }
              />

              {selectedResponsibleLabel ? (
                <p className="md:col-span-2 text-xs text-iwana-secondary-700 dark:text-gray-400">
                  Persona a cargo: {selectedResponsibleLabel}
                </p>
              ) : null}

              <Input
                label="Límite de unidades"
                type="number"
                min="0"
                step="0.01"
                value={values.maxCapacity}
                onChange={(event) =>
                  setValues((current) => ({ ...current, maxCapacity: event.target.value }))
                }
                helperText="Déjalo vacío si no necesitas controlar un límite."
              />
            </div>
          </section>

          {codePreview ? (
            <PortalAlert
              variant="info"
              title="Código que usaremos"
              description={
                <>
                  <p className="font-mono text-sm text-gray-900 dark:text-white">{codePreview}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Lo asignaremos cuando guardes la bodega.
                  </p>
                </>
              }
            />
          ) : null}

          {usersLoadError ? (
            <PortalAlert
              variant="warning"
              title="Usuarios no disponibles"
              description={usersLoadError}
            />
          ) : null}

          {error ? (
            <PortalAlert
              variant="error"
              title={
                isEditing ? 'No fue posible actualizar la bodega' : 'No fue posible crear la bodega'
              }
              description={error}
            />
          ) : null}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-dark-border">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
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
