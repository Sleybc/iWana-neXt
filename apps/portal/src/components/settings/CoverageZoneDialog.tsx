'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Orbit } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import type {
  CoverageZoneConfig,
  CreateCoverageZoneDto,
  UpdateCoverageZoneDto,
} from '@/lib/api-client';

const zoneSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(150, 'Maximo 150 caracteres.'),
  centerLatitude: z.number().min(-90, 'Latitud minima -90.').max(90, 'Latitud maxima 90.'),
  centerLongitude: z.number().min(-180, 'Longitud minima -180.').max(180, 'Longitud maxima 180.'),
  radiusKm: z.number().min(0.1, 'Radio minimo 0.1 km.').max(300, 'Radio maximo 300 km.'),
  isActive: z.boolean(),
});

type ZoneFormValues = z.infer<typeof zoneSchema>;

interface CoverageZoneDialogProps {
  open: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  zone: CoverageZoneConfig | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateCoverageZoneDto | UpdateCoverageZoneDto) => Promise<void>;
}

export function CoverageZoneDialog({
  open,
  canEdit,
  isSubmitting,
  zone,
  onOpenChange,
  onSubmit,
}: CoverageZoneDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneSchema),
    defaultValues: {
      name: '',
      centerLatitude: 4.6097,
      centerLongitude: -74.0817,
      radiusKm: 5,
      isActive: true,
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    if (zone) {
      reset({
        name: zone.name,
        centerLatitude: zone.centerLatitude,
        centerLongitude: zone.centerLongitude,
        radiusKm: zone.radiusKm,
        isActive: zone.isActive,
      });
      return;
    }

    reset({
      name: '',
      centerLatitude: 4.6097,
      centerLongitude: -74.0817,
      radiusKm: 5,
      isActive: true,
    });
  }, [open, reset, zone]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="zone-dialog"
        aria-labelledby="zone-dialog-title"
        aria-describedby="zone-dialog-description"
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
              <Orbit className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Zona comercial
              </p>
              <DialogTitle id="zone-dialog-title">
                {zone ? 'Editar zona' : 'Nueva zona'}
              </DialogTitle>
            </div>
          </div>
          <DialogDescription id="zone-dialog-description">
            Define centro, radio y estado de la zona de cobertura.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Input
            id="zone-name"
            label="Nombre"
            disabled={!canEdit || isSubmitting}
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              id="zone-center-latitude"
              type="number"
              step="0.000001"
              label="Latitud centro"
              disabled={!canEdit || isSubmitting}
              error={errors.centerLatitude?.message}
              {...register('centerLatitude', { valueAsNumber: true })}
            />
            <Input
              id="zone-center-longitude"
              type="number"
              step="0.000001"
              label="Longitud centro"
              disabled={!canEdit || isSubmitting}
              error={errors.centerLongitude?.message}
              {...register('centerLongitude', { valueAsNumber: true })}
            />
          </div>

          <Input
            id="zone-radius"
            type="number"
            step="0.1"
            min={0.1}
            max={300}
            label="Radio (km)"
            disabled={!canEdit || isSubmitting}
            error={errors.radiusKm?.message}
            {...register('radiusKm', { valueAsNumber: true })}
          />

          <label className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-3 py-2 text-sm font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
            <input type="checkbox" disabled={!canEdit || isSubmitting} {...register('isActive')} />
            Zona activa
          </label>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting} disabled={!canEdit || isSubmitting}>
              {zone ? 'Guardar cambios' : 'Crear zona'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
